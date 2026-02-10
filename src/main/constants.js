const os = require('os');

/**
 * Main Process Constants
 * 
 * Centralized configuration for all tunable numbers used across the
 * main process modules. Keeping these in one place makes it easy to
 * tune performance, document trade-offs, and avoid scattered magic numbers.
 */

// ============================================================================
// THREAD POOL & I/O CONCURRENCY
// ============================================================================

/**
 * libuv thread pool size — controls max parallel filesystem I/O operations.
 * Set high enough for concurrency but low enough for memory efficiency.
 */
const UV_THREADPOOL_SIZE = 64;

/**
 * Max concurrent async file operations (copy, cross-drive move).
 * Aligned with UV_THREADPOOL_SIZE for optimal I/O parallelism.
 */
const MAX_FILE_CONCURRENCY = 64;

/**
 * Concurrency limit for fs.stat() calls during date-based sorting.
 */
const STAT_CONCURRENCY = 50;

/**
 * Concurrency limit for batch folder creation (mkdir).
 * Lower than file ops to prevent file handle exhaustion during setup.
 */
const FOLDER_CONCURRENCY = 20;

// ============================================================================
// CHUNK SIZES & YIELDING
// ============================================================================

/**
 * Number of files to process in one synchronous chunk during same-drive
 * move and rollback operations. After each chunk, the event loop yields
 * so the UI can update progress.
 */
const FILE_MOVE_CHUNK_SIZE = 100;

/**
 * Yield to event loop every N files during groupFilesByBaseName.
 * Higher value = faster processing, lower value = more responsive UI.
 */
const GROUP_YIELD_THRESHOLD = 5000;

/**
 * Yield to event loop every N groups during calculateBatches.
 * Batch calculation is heavier per item than grouping, so this is lower.
 */
const BATCH_YIELD_THRESHOLD = 2000;

/**
 * How many recent batches to search backwards for available space
 * during bin-packing in calculateBatches. Bounds the search to O(N)
 * instead of O(N^2) for very large batch counts.
 */
const BATCH_SEARCH_DEPTH = 50;

// ============================================================================
// THUMBNAILS
// ============================================================================

/**
 * Thumbnail dimensions (square, in pixels) for batch preview.
 */
const THUMBNAIL_SIZE = 40;

/**
 * Concurrency limit for Sharp thumbnail generation.
 * Lower than file I/O because Sharp is CPU-intensive.
 */
const THUMBNAIL_CONCURRENCY = 10;

// ============================================================================
// IMAGE PREVIEW
// ============================================================================

/**
 * Maximum dimension (px) for the long edge of preview images.
 * 1600px provides sharp viewing on most monitors without excessive memory/transfer.
 */
const PREVIEW_MAX_DIMENSION = 1600;

/**
 * JPEG quality for preview images (0-100).
 * 85 balances file size and visual quality for on-screen viewing.
 */
const PREVIEW_JPEG_QUALITY = 85;

/**
 * Maximum entries in the preview image LRU cache.
 * Each entry is a base64 data URL (~200-500KB), so 10 entries ≈ 2-5MB.
 */
const PREVIEW_CACHE_SIZE = 10;

// ============================================================================
// EXIF
// ============================================================================

/**
 * Concurrency limit for EXIF date extraction per chunk.
 * Kept moderate to balance speed vs memory/CPU from parsing image headers.
 */
const EXIF_CONCURRENCY = 20;

// ============================================================================
// BLUR DETECTION
// ============================================================================

/**
 * Concurrency limit for blur analysis — scales with CPU cores.
 * Each Sharp call uses 1 thread (sharp.concurrency(1) in the service),
 * so we control parallelism ourselves. Minimum 4, maximum = CPU core count.
 */
const BLUR_CONCURRENCY = Math.max(4, os.cpus().length);

/**
 * Target width (in pixels) for image resize before blur analysis.
 * 512px provides better detail for the Laplacian to discriminate
 * between truly blurry and slightly soft images. Combined with
 * normalise(), this produces well-separated score distributions.
 */
const BLUR_RESIZE_WIDTH = 512;

/**
 * Laplacian variance thresholds for blur sensitivity presets.
 * Images with variance BELOW this threshold are candidates for "blurry."
 * Higher threshold = more photos flagged (stricter quality control).
 * Lower threshold = fewer photos flagged (more lenient, only obvious blur).
 * 
 * CALIBRATED from diagnostic CSV (5,679 images, normalised pipeline at 512px):
 * 
 *   Score distribution:
 *   - Truly blurry (user-confirmed examples): variance 58-71
 *   - Most blurry images: variance 10-80
 *   - Slightly soft / acceptable: variance 80-200
 *   - Sharp images: variance 200-900+
 * 
 * - strict (100):   Catches ~1,200 images (~21%) — includes slightly soft
 * - moderate (80):   Catches ~750 images (~13%) — catches all confirmed blurry examples
 * - lenient (50):    Catches ~155 images (~3%) — only the most extreme blur
 * 
 * NOTE: An image must ALSO fail the edge density check (see BLUR_EDGE_THRESHOLDS)
 *       to be flagged as blurry. This dual-metric approach reduces false positives.
 */
const BLUR_THRESHOLDS = {
  strict: 100,
  moderate: 80,
  lenient: 50,
};

/**
 * Edge density thresholds for blur sensitivity presets.
 * Edge density = ratio of pixels with significant Laplacian response (0.0–1.0).
 * Images with edge density BELOW this threshold are candidates for "blurry."
 * 
 * CALIBRATED from diagnostic CSV (5,679 images, normalised pipeline at 512px):
 * 
 *   Edge density distribution:
 *   - Truly blurry (user-confirmed): edgeDensity 0.017-0.039
 *   - Most blurry images: edgeDensity 0.001-0.045
 *   - Slightly soft / acceptable: edgeDensity 0.04-0.12
 *   - Sharp images: edgeDensity 0.10-0.23+
 * 
 * - strict (0.055):  Catches images with very low edge count
 * - moderate (0.045): Balanced — catches confirmed blurry with margin
 * - lenient (0.035):  Only flags images with almost no edges
 */
const BLUR_EDGE_THRESHOLDS = {
  strict: 0.055,
  moderate: 0.045,
  lenient: 0.035,
};

/**
 * Per-pixel Laplacian response threshold for edge detection.
 * Pixels with Laplacian output above this value are counted as "edge pixels"
 * for the edge density metric. Value of 15 is robust against sensor noise
 * while still capturing moderate edges in slightly-soft images.
 * With the normalised pipeline, this threshold remains effective because
 * normalisation amplifies contrast but noise stays distributed near 0.
 */
const BLUR_EDGE_PIXEL_THRESHOLD = 15;

module.exports = {
  UV_THREADPOOL_SIZE,
  MAX_FILE_CONCURRENCY,
  STAT_CONCURRENCY,
  FOLDER_CONCURRENCY,
  FILE_MOVE_CHUNK_SIZE,
  GROUP_YIELD_THRESHOLD,
  BATCH_YIELD_THRESHOLD,
  BATCH_SEARCH_DEPTH,
  THUMBNAIL_SIZE,
  THUMBNAIL_CONCURRENCY,
  PREVIEW_MAX_DIMENSION,
  PREVIEW_JPEG_QUALITY,
  PREVIEW_CACHE_SIZE,
  EXIF_CONCURRENCY,
  BLUR_CONCURRENCY,
  BLUR_RESIZE_WIDTH,
  BLUR_THRESHOLDS,
  BLUR_EDGE_THRESHOLDS,
  BLUR_EDGE_PIXEL_THRESHOLD,
};
