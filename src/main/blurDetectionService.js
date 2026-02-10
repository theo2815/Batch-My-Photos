/**
 * Blur Detection Service
 * 
 * Analyzes images for blur using a dual-metric approach via Sharp with
 * contrast normalization for lighting-independent scoring.
 * 
 * Algorithm (per image):
 * 1. Resize to ~512px wide (good detail for Laplacian)
 * 2. Convert to grayscale
 * 3. Normalise contrast (histogram stretching to full 0-255 range)
 *    — This is the key step that makes scores independent of original
 *      image brightness/contrast, fixing false positives on dark scenes
 *      and false negatives on bright scenes.
 * 4. Apply Laplacian 3x3 convolution (edge-detection kernel)
 * 5. Compute two complementary metrics from the result:
 *    a) **Laplacian Variance** — overall edge energy. Low = blurry.
 *    b) **Edge Density** — ratio of pixels with significant edge response.
 *       Truly blurry images have almost no edge pixels.
 * 6. An image is flagged as blurry only when BOTH metrics fall below their
 *    respective thresholds. This dual-check greatly reduces false positives.
 * 
 * For each file group, only the first JPEG/PNG is analyzed (faster than RAW).
 * Results are cached in memory (same pattern as exifService.js).
 */

const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const {
  BLUR_CONCURRENCY, BLUR_RESIZE_WIDTH, BLUR_THRESHOLDS, BLUR_EDGE_THRESHOLDS,
  BLUR_EDGE_PIXEL_THRESHOLD,
} = require('./constants');
const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// Batch processing optimization: limit libvips to 1 thread per Sharp call.
// We control parallelism ourselves through BLUR_CONCURRENCY concurrent workers.
// Default Sharp uses ALL CPU cores per call, so N concurrent calls would spawn
// N × cores threads fighting for resources — massive context-switch overhead.
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
 * Analyze file groups for blur with pool-based concurrency and progress reporting.
 *
 * Every image is analyzed at full 512px resolution using the dual-metric
 * approach (Laplacian variance + edge density) with contrast normalization.
 * Pool-based concurrency ensures continuous throughput with no idle slots.
 *
 * Results are cached in memory — repeat calls with the same folder, groups,
 * and threshold return instantly.
 *
 * @param {Object} fileGroups - Map of baseName -> string[] (file names)
 * @param {string} folderPath - Absolute path to the folder
 * @param {string} [threshold='moderate'] - Sensitivity preset: 'strict' | 'moderate' | 'lenient'
 * @param {Function} [onProgress] - Optional callback: ({ current, total }) => void
 * @returns {Promise<Object>} Map of baseName -> { score, isBlurry, analyzedFile }
 */
async function analyzeBlur(fileGroups, folderPath, threshold = 'moderate', onProgress = null) {
  const groupNames = Object.keys(fileGroups);

  // Check cache first
  const cacheKey = buildCacheKey(folderPath, groupNames, threshold);
  if (blurCache.cacheKey === cacheKey && blurCache.blurMap) {
    logger.log(`🔍 [BLUR] Cache hit — returning ${groupNames.length} cached results`);
    return blurCache.blurMap;
  }

  const blurMap = {};
  const varianceThreshold = BLUR_THRESHOLDS[threshold] || BLUR_THRESHOLDS.moderate;
  const edgeDensityThreshold = BLUR_EDGE_THRESHOLDS[threshold] || BLUR_EDGE_THRESHOLDS.moderate;
  const totalGroups = groupNames.length;

  logger.log(`🔍 [BLUR] Analyzing ${totalGroups} file groups (threshold: ${threshold}, ` +
    `V<${varianceThreshold}, E<${edgeDensityThreshold})...`);

  // Build the work list: only groups with an analyzable file
  const workItems = [];
  for (const baseName of groupNames) {
    const files = fileGroups[baseName];
    const analyzableFile = pickAnalyzableFile(files);
    if (analyzableFile) {
      workItems.push({ baseName, analyzableFile });
    } else {
      // RAW-only or video-only group — skip, mark as not blurry
      blurMap[baseName] = { score: -1, isBlurry: false, analyzedFile: null };
    }
  }

  logger.log(`🔍 [BLUR] ${workItems.length} groups have analyzable files, ` +
    `${totalGroups - workItems.length} skipped (RAW/video only)`);

  // ========================================================================
  // FULL 512px ANALYSIS — pool-based concurrency for all images
  // ========================================================================
  let processed = 0;

  await runPool(workItems, BLUR_CONCURRENCY, async (item) => {
    const filePath = path.join(folderPath, item.analyzableFile);
    const metrics = await computeBlurScore(filePath);

    // Dual-metric check: flagged as blurry only when BOTH variance AND
    // edge density fall below their thresholds.
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

  // Count results
  const blurryCount = Object.values(blurMap).filter(r => r.isBlurry).length;
  logger.log(`🔍 [BLUR] Analysis complete. ${blurryCount} blurry groups found out of ${totalGroups}.`);

  // Store in cache
  blurCache = { cacheKey, blurMap };

  return blurMap;
}

module.exports = {
  analyzeBlur,
  clearCache,
  computeBlurScore,
};
