/**
 * Blur Detection Service
 * 
 * Provides two blur detection backends:
 * 
 * 1. **AI Mode** (BLUR_AI_ENABLED=true) — Sends images to a local Python
 *    FastAPI server running a fine-tuned MobileNetV3-Small CNN. Much more
 *    accurate than the Laplacian approach, especially for shallow DOF,
 *    motion blur, and textured vs. smooth subjects.
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
  BLUR_EDGE_PIXEL_THRESHOLD, BLUR_AI_BATCH_SIZE, BLUR_AI_TIMEOUT_MS,
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
 * Analyze file groups for blur using the AI service (Python FastAPI + CNN).
 * 
 * Reads analyzable images from each group, converts to base64, sends in
 * batches to the AI service, and maps responses back to the expected shape.
 * 
 * @param {Object} fileGroups - Map of baseName -> string[] (file names)
 * @param {string} folderPath - Absolute path to the folder
 * @param {Function} [onProgress] - Optional callback: ({ current, total }) => void
 * @returns {Promise<Object>} Map of baseName -> { score, isBlurry, analyzedFile, confidence }
 * @throws {Error} If the AI service is unavailable or returns an error
 */
async function analyzeBlurAI(fileGroups, folderPath, onProgress = null) {
  const groupNames = Object.keys(fileGroups);
  const blurMap = {};

  // Build work list: only groups with an analyzable file
  const workItems = [];
  for (const baseName of groupNames) {
    const files = fileGroups[baseName];
    const analyzableFile = pickAnalyzableFile(files);
    if (analyzableFile) {
      workItems.push({ baseName, analyzableFile });
    } else {
      blurMap[baseName] = { score: -1, isBlurry: false, analyzedFile: null, confidence: 0 };
    }
  }

  logger.log(`🤖 [BLUR-AI] ${workItems.length} groups to analyze, ` +
    `${groupNames.length - workItems.length} skipped (RAW/video only)`);

  // Split into batches
  const batches = [];
  for (let i = 0; i < workItems.length; i += BLUR_AI_BATCH_SIZE) {
    batches.push(workItems.slice(i, i + BLUR_AI_BATCH_SIZE));
  }

  const aiUrl = config.features.BLUR_AI_URL;
  let totalProcessed = 0;

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];

    // Read images and convert to base64
    const images = [];
    for (const item of batch) {
      try {
        const filePath = path.join(folderPath, item.analyzableFile);
        const buffer = fs.readFileSync(filePath);
        const base64 = buffer.toString('base64');
        images.push({ baseName: item.baseName, data: base64 });
      } catch (err) {
        logger.warn(`⚠️ [BLUR-AI] Failed to read ${item.analyzableFile}: ${err.message}`);
        blurMap[item.baseName] = { score: -1, isBlurry: false, analyzedFile: item.analyzableFile, confidence: 0 };
      }
    }

    if (images.length === 0) continue;

    // POST to AI service
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), BLUR_AI_TIMEOUT_MS);

      const response = await net.fetch(`${aiUrl}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI service returned ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      // Map results back to our expected shape
      for (const item of batch) {
        const result = data.results?.[item.baseName];
        if (result) {
          blurMap[item.baseName] = {
            score: result.score,
            isBlurry: result.isBlurry,
            analyzedFile: item.analyzableFile,
            confidence: result.confidence,
          };
        } else if (!blurMap[item.baseName]) {
          blurMap[item.baseName] = { score: -1, isBlurry: false, analyzedFile: item.analyzableFile, confidence: 0 };
        }
      }
    } catch (err) {
      // If any batch fails, throw — blur detection should be disabled, not inaccurate
      const isTimeout = err.name === 'AbortError';
      const message = isTimeout
        ? `AI service timed out after ${BLUR_AI_TIMEOUT_MS}ms`
        : `AI service error: ${err.message}`;
      logger.error(`❌ [BLUR-AI] ${message}`);
      throw new Error(message);
    }

    totalProcessed += batch.length;
    if (onProgress) {
      onProgress({ current: totalProcessed, total: workItems.length });
    }
  }

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
async function analyzeBlur(fileGroups, folderPath, threshold = 'moderate', onProgress = null) {
  const groupNames = Object.keys(fileGroups);
  const mode = config.features.BLUR_AI_ENABLED ? 'ai' : 'legacy';

  // Check cache first
  const cacheKey = buildCacheKey(folderPath, groupNames, mode === 'ai' ? 'ai' : threshold);
  if (blurCache.cacheKey === cacheKey && blurCache.blurMap) {
    logger.log(`🔍 [BLUR] Cache hit — returning ${groupNames.length} cached results (${mode})`);
    return blurCache.blurMap;
  }

  logger.log(`🔍 [BLUR] Starting analysis — mode: ${mode}, groups: ${groupNames.length}`);

  let blurMap;
  if (mode === 'ai') {
    blurMap = await analyzeBlurAI(fileGroups, folderPath, onProgress);
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
