/**
 * Blur Detection Service
 * 
 * Provides two blur detection backends:
 * 
 * 1. **AI Mode** (BLUR_AI_ENABLED=true) — Resizes each image (Sharp, EXIF-aware,
 *    long edge BLUR_AI_MAX_DIMENSION, JPEG q BLUR_AI_JPEG_QUALITY), batches them
 *    into chunks, and streams each chunk to the QuickPitik ai-api blur classifier
 *    (YOLOv8n-cls, 4-class) at POST /api/v1/blur/classify/stream (NDJSON). Falls
 *    back to per-image POST /api/v1/blur/classify when the streaming endpoint is
 *    absent (older server) or for items a stream dropped. Much more accurate than
 *    the Laplacian approach, especially for shallow DOF, motion blur, and textured
 *    vs. smooth subjects. The desktop is the one client allowed to call ai-api
 *    directly (restricted blur:read key).
 * 
 * 2. **Legacy Laplacian Mode** (BLUR_AI_ENABLED=false) — Local analysis
 *    using Sharp's Laplacian variance + edge density with contrast
 *    normalization. Used as a reference / offline fallback.
 * 
 * The active backend is selected via config.features.BLUR_AI_ENABLED.
 * When the AI service is unavailable, blur detection returns an error
 * rather than falling back to inaccurate results.
 * 
 * For each file group, only the first JPEG/PNG is analyzed (faster than RAW).
 * Results are cached in memory (same pattern as exifService.js).
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');
const { net } = require('electron');
const config = require('./config');
const {
  BLUR_CONCURRENCY, BLUR_RESIZE_WIDTH, BLUR_THRESHOLDS, BLUR_EDGE_THRESHOLDS,
  BLUR_EDGE_PIXEL_THRESHOLD, BLUR_AI_TIMEOUT_MS,
  BLUR_AI_MAX_DIMENSION, BLUR_AI_JPEG_QUALITY, BLUR_AI_RESIZE_CONCURRENCY,
  BLUR_AI_STREAM_BATCH_SIZE, BLUR_AI_STREAM_CONCURRENCY, BLUR_AI_STREAM_TIMEOUT_MS,
} = require('./constants');
const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// Batch processing optimization: limit libvips to 1 thread per Sharp call.
// ---------------------------------------------------------------------------
sharp.concurrency(1);

// ============================================================================
// IN-MEMORY CACHE
// ============================================================================

/**
 * Cache entry: { cacheKey: string, blurMap: Object }
 * Only one folder is cached at a time (the current working folder).
 * Cleared automatically when the folder or file list changes.
 */
let blurCache = { cacheKey: null, blurMap: null };

/**
 * Extensions that can be analyzed for blur (JPEG/PNG only — fast to decode).
 * RAW files are skipped because Sharp decoding is slow and the JPEG
 * companion provides the same blur information.
 */
const ANALYZABLE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'tiff', 'tif', 'bmp', 'gif', 'heic', 'heif'
]);

/**
 * Laplacian 3x3 edge-detection kernel.
 * Highlights edges — blurry images produce low-variance output.
 */
const LAPLACIAN_KERNEL = {
  width: 3,
  height: 3,
  kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0],
};

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Generate a cache key from folderPath + group count + threshold.
 * Same SHA-256 pattern as exifService for consistency.
 * 
 * @param {string} folderPath
 * @param {string[]} groupNames - Array of base names
 * @param {string} threshold - Threshold preset name
 * @returns {string} Cache key
 */
function buildCacheKey(folderPath, groupNames, threshold) {
  const hash = crypto.createHash('sha256');
  hash.update(folderPath);
  hash.update(String(groupNames.length));
  hash.update(threshold);
  if (groupNames.length > 0) hash.update(groupNames[0]);
  if (groupNames.length > 1) hash.update(groupNames[groupNames.length - 1]);
  if (groupNames.length > 10) hash.update(groupNames[Math.floor(groupNames.length / 2)]);
  return hash.digest('hex');
}

/**
 * Pick the first analyzable file (JPEG/PNG) from a file group.
 * Returns null if no analyzable file exists (e.g. RAW-only group).
 * 
 * @param {string[]} files - Array of file names in a group
 * @returns {string|null} File name to analyze, or null
 */
function pickAnalyzableFile(files) {
  for (const fileName of files) {
    const lastDot = fileName.lastIndexOf('.');
    if (lastDot <= 0) continue;
    const ext = fileName.substring(lastDot + 1).toLowerCase();
    if (ANALYZABLE_EXTENSIONS.has(ext)) {
      return fileName;
    }
  }
  return null;
}

/**
 * Compute blur metrics for a single image using dual-metric analysis
 * with contrast normalization.
 * 
 * Returns two complementary metrics for precise blur detection:
 * 
 * 1. **Laplacian Variance** — measures overall edge energy.
 *    Low variance = blurry (few/weak edges). High variance = sharp.
 * 
 * 2. **Edge Density** — ratio of pixels with significant edge response (0.0–1.0).
 *    Truly blurry images have almost no edge pixels. Slightly soft images
 *    still retain meaningful edges.
 * 
 * Key feature: `.normalise()` stretches the image histogram to full 0-255
 * range BEFORE the Laplacian convolution. This makes scores independent of
 * the original image's brightness and contrast, fixing false positives on
 * dark/nighttime images and false negatives on bright/high-contrast images.
 * 
 * Steps:
 * 1. Resize to BLUR_RESIZE_WIDTH px wide (512px for better detail)
 * 2. Convert to grayscale
 * 3. Normalise contrast (histogram stretching)
 * 4. Apply Laplacian convolution
 * 5. Compute variance AND edge density from the result
 * 
 * @param {string} filePath - Absolute path to the image
 * @returns {Promise<{variance: number, edgeDensity: number}>}
 *          variance >= 0 and edgeDensity 0.0–1.0, or { variance: -1, edgeDensity: -1 } on error
 */
async function computeBlurScore(filePath) {
  try {
    // Resize + grayscale + normalise + Laplacian in one Sharp pipeline.
    // sequentialRead: true — hint to libvips for linear access (faster I/O).
    const { data, info } = await sharp(filePath, { sequentialRead: true })
      .resize(BLUR_RESIZE_WIDTH, null, { withoutEnlargement: true })
      .grayscale()
      .normalise()           // histogram stretching — makes scores contrast-independent
      .convolve(LAPLACIAN_KERNEL)
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Compute metrics from the Laplacian output
    const pixelCount = info.width * info.height;
    if (pixelCount === 0) return { variance: -1, edgeDensity: -1 };

    // Single-pass: compute mean, variance, and edge density simultaneously.
    // Uses the algebraic identity: Var(X) = E[X²] - (E[X])²
    // This halves the iteration count compared to the two-pass approach.
    let sum = 0;
    let sumSq = 0;
    let edgePixels = 0;
    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      sum += v;
      sumSq += v * v;
      if (v > BLUR_EDGE_PIXEL_THRESHOLD) edgePixels++;
    }
    const mean = sum / pixelCount;
    const variance = (sumSq / pixelCount) - (mean * mean);
    const edgeDensity = edgePixels / pixelCount;

    return { variance, edgeDensity };
  } catch (_err) {
    // Sharp failed to process the image (corrupt, unsupported, etc.)
    return { variance: -1, edgeDensity: -1 };
  }
}

/**
 * Clear the blur cache (e.g. when switching folders).
 */
function clearCache() {
  blurCache = { cacheKey: null, blurMap: null };
}

// ============================================================================
// POOL-BASED CONCURRENCY HELPER
// ============================================================================

/**
 * Run an async function over an array of items using a fixed-size worker pool.
 *
 * Unlike chunk-based Promise.all, a new item starts processing the instant a
 * worker finishes — no idle slots waiting for the slowest item in a batch.
 * This typically improves throughput by 20-40% over chunk-based concurrency.
 *
 * @param {Array} items - Work items to process
 * @param {number} concurrency - Max parallel workers
 * @param {Function} fn - Async function: (item, index) => Promise<void>
 */
async function runPool(items, concurrency, fn) {
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const currentIdx = idx++;
      await fn(items[currentIdx], currentIdx);
    }
  });
  await Promise.all(workers);
}

// ============================================================================
// MAIN ANALYSIS
// ============================================================================

/**
 * Analyze file groups for blur using the QuickPitik ai-api blur classifier.
 *
 * For each file group, the first analyzable image is uploaded (multipart) to
 * POST {BLUR_AI_URL}/api/v1/blur/classify. ai-api returns raw class
 * probabilities; the sensitivity threshold and category filter are applied
 * here (ai-api intentionally returns raw scores — thresholds are a caller
 * concern) and mapped into the same shape the legacy backend + UI expect.
 *
 * Loud-fail policy: if the classifier is unavailable (503) or the server is
 * unreachable/times out, this throws an "AI service ..." error. The
 * analyze-blur IPC handler turns that into { aiUnavailable: true } — no silent
 * Laplacian substitution. A per-image decode error (bad/oversized file) is
 * tolerated: that one group is marked un-analyzable and the run continues.
 *
 * @param {Object} fileGroups - Map of baseName -> string[] (file names)
 * @param {string} folderPath - Absolute path to the folder
 * @param {string[]|null} categories - Class names to treat as blurry (null = any non-sharp)
 * @param {string} [sensitivity='moderate'] - 'strict' | 'moderate' | 'lenient'
 * @param {Function} [onProgress] - Optional callback: ({ current, total }) => void
 * @returns {Promise<Object>} Map of baseName -> { score, isBlurry, analyzedFile, confidence, predictedClass, bestBlurClass, bestBlurProbability }
 * @throws {Error} If the ai-api classifier is unavailable or returns an error
 */
const SENSITIVITY_TO_THRESHOLD = { strict: 0.30, moderate: 0.45, lenient: 0.65 };

// The non-blur class in the trained 4-class model.
const SHARP_CLASS = 'sharp';

/**
 * Map an ai-api /blur/classify `data` payload into BatchMyPhotos' blurMap shape.
 * Mirrors the post-processing the local sidecar used to do server-side: pick the
 * best non-sharp class via argmax, flag blurry when P(bestBlurClass) >= threshold
 * AND that class is in the active category filter.
 *
 * @param {Object} data - ai-api response `data`: { predicted_class, confidence, probabilities }
 * @param {number} threshold - Minimum P(non-sharp) to flag (derived from sensitivity)
 * @param {Set<string>|null} categoriesFilter - Allowed blur classes, or null for any
 * @param {string} analyzedFile - File name that was analyzed
 */
function mapClassification(data, threshold, categoriesFilter, analyzedFile) {
  const probs = (data && data.probabilities) || {};
  const sharpP = typeof probs[SHARP_CLASS] === 'number' ? probs[SHARP_CLASS] : 0;

  // Best non-sharp class = argmax over all classes except `sharp`.
  let bestBlurClass = '';
  let bestBlurProbability = 0;
  for (const [cls, p] of Object.entries(probs)) {
    if (cls === SHARP_CLASS) continue;
    if (p > bestBlurProbability) {
      bestBlurProbability = p;
      bestBlurClass = cls;
    }
  }

  const passesThreshold = bestBlurProbability >= threshold;
  const inCategories = !categoriesFilter || categoriesFilter.has(bestBlurClass);

  return {
    score: Number((1 - sharpP).toFixed(4)),          // blur probability (1 - P(sharp))
    isBlurry: passesThreshold && inCategories,
    analyzedFile,
    confidence: Number((data.confidence ?? 0).toFixed(4)),
    predictedClass: data.predicted_class || '',
    bestBlurClass,
    bestBlurProbability: Number(bestBlurProbability.toFixed(4)),
  };
}

/**
 * Classify a single image via ai-api and return the mapped blur result.
 *
 * Throws an "AI service ..." error on server-unavailable conditions (503 model
 * not loaded, connection failure, timeout, 401/403 auth, 429 rate limit) so the
 * caller fails loud. Returns an un-analyzable marker for per-image decode/size
 * rejections (400/413/422) so one bad file does not abort the whole scan.
 */
async function classifyOne(classifyUrl, apiKey, filePath, threshold, categoriesFilter, analyzedFile) {
  let buffer;
  try {
    buffer = fs.readFileSync(filePath);
  } catch (err) {
    logger.warn(`⚠️ [BLUR-AI] Failed to read ${analyzedFile}: ${err.message}`);
    return { score: -1, isBlurry: false, analyzedFile, confidence: 0 };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BLUR_AI_TIMEOUT_MS);
  try {
    const form = new FormData();
    form.append('file', new Blob([buffer]), analyzedFile);

    const headers = {};
    if (apiKey) headers['X-API-Key'] = apiKey;

    const response = await net.fetch(classifyUrl, {
      method: 'POST',
      headers,
      body: form,
      signal: controller.signal,
    });

    if (response.ok) {
      const envelope = await response.json();
      if (!envelope || envelope.success !== true || !envelope.data) {
        throw new Error(`AI service error: ${envelope?.error?.message || 'unexpected response shape'}`);
      }
      return mapClassification(envelope.data, threshold, categoriesFilter, analyzedFile);
    }

    // Per-image problems (bad / oversized image) — skip this group, keep going.
    if (response.status === 400 || response.status === 413 || response.status === 422) {
      logger.warn(`⚠️ [BLUR-AI] ${analyzedFile}: server rejected image (${response.status}) — skipping`);
      return { score: -1, isBlurry: false, analyzedFile, confidence: 0 };
    }

    // 503 (model unavailable), 401/403 (auth), 429 (rate), 5xx — fail loud.
    const errText = await response.text().catch(() => '');
    throw new Error(`AI service returned ${response.status}: ${errText.slice(0, 200)}`);
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`AI service timed out after ${BLUR_AI_TIMEOUT_MS}ms`);
    }
    // Re-tag connection errors so the IPC handler classifies them as AI errors.
    throw new Error(err.message?.includes('AI service') ? err.message : `AI service error: ${err.message}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// AI streaming pipeline: resize → batch → POST /blur/classify/stream (NDJSON)
// ---------------------------------------------------------------------------

/**
 * Resize an image for upload: EXIF-aware auto-rotate, fit inside
 * BLUR_AI_MAX_DIMENSION, re-encode JPEG at BLUR_AI_JPEG_QUALITY. The server's
 * stream decode path does NOT apply EXIF rotation, so orientation is baked in
 * here. Returns a Buffer, or null if Sharp cannot decode the file (that group
 * is then marked un-analyzable, matching the per-file fail-open policy).
 *
 * @param {string} filePath
 * @returns {Promise<Buffer|null>}
 */
async function prepareImageForUpload(filePath) {
  try {
    return await sharp(filePath, { sequentialRead: true })
      .rotate()                       // auto-orient from EXIF before re-encode
      .resize(BLUR_AI_MAX_DIMENSION, BLUR_AI_MAX_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: BLUR_AI_JPEG_QUALITY })
      .toBuffer();
  } catch (err) {
    logger.warn(`⚠️ [BLUR-AI] Failed to resize ${path.basename(filePath)}: ${err.message}`);
    return null;
  }
}

/**
 * Async-iterate NDJSON lines from a fetch Response. Uses the streaming body
 * reader when available (incremental progress, low memory); falls back to
 * buffering the full text otherwise.
 *
 * @param {Response} response
 * @returns {AsyncGenerator<string>}
 */
async function* ndjsonLines(response) {
  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) yield line;
      }
    }
    const tail = buf.trim();
    if (tail) yield tail;
  } else {
    const text = await response.text();
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (line) yield line;
    }
  }
}

/**
 * Map one parsed NDJSON stream object into a blurMap entry. Stream lines are
 * either { index, filename, predicted_class, confidence, probabilities } or
 * { index, filename, error }. An error line (one undecodable image) becomes an
 * un-analyzable marker so the rest of the chunk still counts.
 */
function streamLineToResult(obj, threshold, categoriesFilter, analyzedFile) {
  if (obj.error) {
    return { score: -1, isBlurry: false, analyzedFile, confidence: 0 };
  }
  return mapClassification(obj, threshold, categoriesFilter, analyzedFile);
}

/**
 * Stream-classify one chunk of already-resized items via /blur/classify/stream.
 * Results arrive as NDJSON (one line per image, out of order — mapped back by
 * the returned `index`). Lines are matched to items by the per-file index we
 * uploaded as the filename, since base names can collide across extensions.
 *
 * @param {string} streamUrl
 * @param {string} apiKey
 * @param {Array<{baseName, analyzableFile, buffer}>} chunk
 * @param {Function} onOne - (baseName, result) => void, called once per result
 * @returns {Promise<number[]>} indices (into `chunk`) the stream did NOT return
 * @throws {Error} `.code='STREAM_UNSUPPORTED'` on 404/405; "AI service ..." on
 *                 503 / auth / 5xx / timeout / connection failure (loud-fail)
 */
async function classifyChunkStream(streamUrl, apiKey, chunk, threshold, categoriesFilter, onOne) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BLUR_AI_STREAM_TIMEOUT_MS);
  try {
    const form = new FormData();
    chunk.forEach((item, i) => {
      // filename = local index → unambiguous result mapping (base names can
      // collide across extensions; the index cannot).
      form.append('files', new Blob([item.buffer]), String(i));
    });

    const headers = {};
    if (apiKey) headers['X-API-Key'] = apiKey;

    const response = await net.fetch(streamUrl, {
      method: 'POST', headers, body: form, signal: controller.signal,
    });

    // Older server without the streaming endpoint → caller falls back per-image.
    if (response.status === 404 || response.status === 405) {
      const e = new Error('AI service: /blur/classify/stream not available');
      e.code = 'STREAM_UNSUPPORTED';
      throw e;
    }
    // 503 (model) / 401-403 (auth) / 429 (rate) / 5xx — fail loud.
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`AI service returned ${response.status}: ${errText.slice(0, 200)}`);
    }

    const seen = new Set();
    for await (const line of ndjsonLines(response)) {
      let obj;
      try { obj = JSON.parse(line); } catch (_e) { continue; }
      if (obj._summary) continue;
      const idx = typeof obj.index === 'number' ? obj.index : parseInt(obj.filename, 10);
      if (!Number.isInteger(idx) || idx < 0 || idx >= chunk.length || seen.has(idx)) continue;
      const item = chunk[idx];
      onOne(item.baseName, streamLineToResult(obj, threshold, categoriesFilter, item.analyzableFile));
      seen.add(idx);
    }

    // Completeness: any index not returned (truncated/dropped stream) is reported
    // so the caller can recover it via the per-image fallback.
    const missing = [];
    for (let i = 0; i < chunk.length; i++) if (!seen.has(i)) missing.push(i);
    return missing;
  } catch (err) {
    if (err.code === 'STREAM_UNSUPPORTED') throw err;
    if (err.name === 'AbortError') {
      throw new Error(`AI service timed out after ${BLUR_AI_STREAM_TIMEOUT_MS}ms`);
    }
    throw new Error(err.message?.includes('AI service') ? err.message : `AI service error: ${err.message}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function analyzeBlurAI(fileGroups, folderPath, categories = null, sensitivity = 'moderate', onProgress = null) {
  const groupNames = Object.keys(fileGroups);
  const blurMap = {};

  // Build work list: only groups with an analyzable file.
  const workItems = [];
  for (const baseName of groupNames) {
    const analyzableFile = pickAnalyzableFile(fileGroups[baseName]);
    if (analyzableFile) {
      workItems.push({ baseName, analyzableFile });
    } else {
      blurMap[baseName] = { score: -1, isBlurry: false, analyzedFile: null, confidence: 0 };
    }
  }

  logger.log(`🤖 [BLUR-AI] ${workItems.length} groups to analyze, ` +
    `${groupNames.length - workItems.length} skipped (RAW/video only)`);

  const base = (config.features.BLUR_AI_URL || '').replace(/\/+$/, '');
  const streamUrl = `${base}/api/v1/blur/classify/stream`;
  const classifyUrl = `${base}/api/v1/blur/classify`;
  const apiKey = config.features.BLUR_AI_API_KEY;
  const threshold = SENSITIVITY_TO_THRESHOLD[sensitivity] ?? SENSITIVITY_TO_THRESHOLD.moderate;
  const categoriesFilter = Array.isArray(categories) && categories.length > 0
    ? new Set(categories)
    : null;

  const total = workItems.length;
  let processed = 0;
  const tick = () => {
    processed++;
    if (onProgress) onProgress({ current: processed, total });
  };

  // Per-image fallback (single /classify) for one work item.
  const classifyItemSingle = (item) => classifyOne(
    classifyUrl, apiKey, path.join(folderPath, item.analyzableFile),
    threshold, categoriesFilter, item.analyzableFile,
  );

  // Split the work list into streaming chunks.
  const chunks = [];
  for (let i = 0; i < workItems.length; i += BLUR_AI_STREAM_BATCH_SIZE) {
    chunks.push(workItems.slice(i, i + BLUR_AI_STREAM_BATCH_SIZE));
  }

  // Once the server is known to lack /classify/stream, stop trying it.
  let streamUnsupported = false;

  const processChunk = async (chunk) => {
    // Phase 1 — RESIZE (bounded Sharp pool). Failed decodes → un-analyzable.
    await runPool(chunk, BLUR_AI_RESIZE_CONCURRENCY, async (item) => {
      item.buffer = await prepareImageForUpload(path.join(folderPath, item.analyzableFile));
    });

    const sendable = [];
    for (const item of chunk) {
      if (item.buffer) {
        sendable.push(item);
      } else {
        blurMap[item.baseName] = { score: -1, isBlurry: false, analyzedFile: item.analyzableFile, confidence: 0 };
        tick();
      }
    }
    if (sendable.length === 0) return;

    // Phase 2 — STREAM the chunk (unless the server already proved it lacks it).
    if (!streamUnsupported) {
      try {
        const missing = await classifyChunkStream(
          streamUrl, apiKey, sendable, threshold, categoriesFilter,
          (baseName, result) => { blurMap[baseName] = result; tick(); },
        );
        // Recover items a stream dropped (truncation) via per-image classify.
        for (const idx of missing) {
          const item = sendable[idx];
          blurMap[item.baseName] = await classifyItemSingle(item);
          tick();
        }
        for (const item of sendable) item.buffer = null;   // release memory
        return;
      } catch (err) {
        if (err.code === 'STREAM_UNSUPPORTED') {
          logger.warn('⚠️ [BLUR-AI] /blur/classify/stream unavailable — falling back to per-image /classify');
          streamUnsupported = true;
          // fall through to the per-image path below
        } else {
          throw err;   // loud-fail (503 / auth / 5xx / timeout / connection)
        }
      }
    }

    // Per-image fallback path (server lacks the streaming endpoint).
    await runPool(sendable, BLUR_CONCURRENCY, async (item) => {
      blurMap[item.baseName] = await classifyItemSingle(item);
      item.buffer = null;
      tick();
    });
  };

  await runPool(chunks, BLUR_AI_STREAM_CONCURRENCY, processChunk);

  const blurryCount = Object.values(blurMap).filter(r => r.isBlurry).length;
  logger.log(`🤖 [BLUR-AI] Analysis complete. ${blurryCount} blurry groups found out of ${groupNames.length}.`);

  return blurMap;
}

/**
 * Analyze file groups for blur using the legacy Laplacian approach.
 * Pool-based concurrency with Sharp — kept as reference implementation.
 *
 * @param {Object} fileGroups - Map of baseName -> string[] (file names)
 * @param {string} folderPath - Absolute path to the folder
 * @param {string} [threshold='moderate'] - Sensitivity preset
 * @param {Function} [onProgress] - Optional callback: ({ current, total }) => void
 * @returns {Promise<Object>} Map of baseName -> { score, isBlurry, analyzedFile }
 */
async function analyzeBlurLegacy(fileGroups, folderPath, threshold = 'moderate', onProgress = null) {
  const groupNames = Object.keys(fileGroups);

  const blurMap = {};
  const varianceThreshold = BLUR_THRESHOLDS[threshold] || BLUR_THRESHOLDS.moderate;
  const edgeDensityThreshold = BLUR_EDGE_THRESHOLDS[threshold] || BLUR_EDGE_THRESHOLDS.moderate;
  const totalGroups = groupNames.length;

  logger.log(`🔍 [BLUR-LEGACY] Analyzing ${totalGroups} file groups (threshold: ${threshold}, ` +
    `V<${varianceThreshold}, E<${edgeDensityThreshold})...`);

  const workItems = [];
  for (const baseName of groupNames) {
    const files = fileGroups[baseName];
    const analyzableFile = pickAnalyzableFile(files);
    if (analyzableFile) {
      workItems.push({ baseName, analyzableFile });
    } else {
      blurMap[baseName] = { score: -1, isBlurry: false, analyzedFile: null };
    }
  }

  let processed = 0;

  await runPool(workItems, BLUR_CONCURRENCY, async (item) => {
    const filePath = path.join(folderPath, item.analyzableFile);
    const metrics = await computeBlurScore(filePath);

    const isBlurry = metrics.variance >= 0 &&
      metrics.variance < varianceThreshold &&
      metrics.edgeDensity >= 0 &&
      metrics.edgeDensity < edgeDensityThreshold;

    blurMap[item.baseName] = {
      score: metrics.variance,
      edgeDensity: metrics.edgeDensity,
      isBlurry,
      analyzedFile: item.analyzableFile,
    };

    processed++;
    if (onProgress) {
      onProgress({ current: processed, total: workItems.length });
    }
  });

  const blurryCount = Object.values(blurMap).filter(r => r.isBlurry).length;
  logger.log(`🔍 [BLUR-LEGACY] Analysis complete. ${blurryCount} blurry groups found out of ${totalGroups}.`);

  return blurMap;
}

/**
 * Main entry point — routes to AI or legacy backend based on config.
 *
 * When AI mode is enabled:
 *   - Sends images to the Python FastAPI service for CNN-based blur detection
 *   - If the service is unavailable, throws an error (no fallback)
 *   - The `threshold` parameter is ignored (CNN makes its own decision)
 *
 * When AI mode is disabled:
 *   - Uses the local Laplacian variance + edge density approach
 *   - The `threshold` parameter controls sensitivity
 *
 * Results are cached in memory — repeat calls with the same folder/groups
 * return instantly.
 *
 * @param {Object} fileGroups - Map of baseName -> string[] (file names)
 * @param {string} folderPath - Absolute path to the folder
 * @param {string} [threshold='moderate'] - Sensitivity preset (legacy mode only)
 * @param {Function} [onProgress] - Optional callback: ({ current, total }) => void
 * @returns {Promise<Object>} Map of baseName -> { score, isBlurry, analyzedFile }
 */
async function analyzeBlur(fileGroups, folderPath, threshold = 'moderate', categories = null, onProgress = null) {
  const groupNames = Object.keys(fileGroups);
  const mode = config.features.BLUR_AI_ENABLED ? 'ai' : 'legacy';

  // Cache discriminator: AI mode varies by sensitivity + category set; legacy mode varies by threshold.
  const cacheDiscriminator = mode === 'ai'
    ? `ai:${threshold}:${(categories || []).slice().sort().join(',')}`
    : threshold;
  const cacheKey = buildCacheKey(folderPath, groupNames, cacheDiscriminator);
  if (blurCache.cacheKey === cacheKey && blurCache.blurMap) {
    logger.log(`🔍 [BLUR] Cache hit — returning ${groupNames.length} cached results (${mode})`);
    return blurCache.blurMap;
  }

  logger.log(`🔍 [BLUR] Starting analysis — mode: ${mode}, groups: ${groupNames.length}`);

  let blurMap;
  if (mode === 'ai') {
    blurMap = await analyzeBlurAI(fileGroups, folderPath, categories, threshold, onProgress);
  } else {
    blurMap = await analyzeBlurLegacy(fileGroups, folderPath, threshold, onProgress);
  }

  // Store in cache
  blurCache = { cacheKey, blurMap };

  return blurMap;
}

module.exports = {
  analyzeBlur,
  clearCache,
  computeBlurScore,
};
