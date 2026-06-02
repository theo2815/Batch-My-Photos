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

// ============================================================================
// DEVICE BINDING
// ============================================================================

/**
 * Default device limit for Pro subscribers.
 * Pro plan allows 2 simultaneous devices.
 */
const DEVICE_LIMIT_PRO = 2;

/**
 * Device limit for Pro+ subscribers.
 * Pro+ plan allows 5 simultaneous devices.
 */
const DEVICE_LIMIT_PRO_PLUS = 5;

/**
 * Heartbeat interval in milliseconds (5 minutes).
 * The Electron app pings the server at this interval while active.
 */
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

// ============================================================================
// AI BLUR DETECTION
// ============================================================================

/**
 * Timeout in milliseconds for each per-image request to the ai-api blur
 * classifier. 30 seconds is generous for local inference; increase for a
 * remote/cloud ai-api deployment.
 */
const BLUR_AI_TIMEOUT_MS = 30000;

/**
 * Long edge (px) to resize each image to before uploading to the ai-api blur
 * classifier. The CNN sees 224px internally, but the server's single /classify
 * path downscales originals to 1280px first — so we match 1280 to preserve
 * classification parity with that path. (512px was a Laplacian-era number; it
 * discards the high-frequency detail motion/defocus blur is judged on and can
 * flip a blurry frame to "sharp".) Resizing also dodges the server's 4096px /
 * 10MB single-image rejection and cuts upload bytes ~90%.
 */
const BLUR_AI_MAX_DIMENSION = 1280;

/**
 * JPEG quality for the resized upload. The classifier was trained without any
 * JPEG-compression augmentation, so heavy artifacts (q70 blocking/ringing) are
 * out-of-distribution and can be misread as blur. q90 is visually lossless yet
 * still small.
 */
const BLUR_AI_JPEG_QUALITY = 90;

/**
 * Sharp resize-pool size for the pre-upload resize phase. Sharp runs one libvips
 * thread per call (sharp.concurrency(1) in the service), so we cap parallelism
 * here. Leave one core free for the streaming/decode work.
 */
const BLUR_AI_RESIZE_CONCURRENCY = Math.max(2, os.cpus().length - 1);

/**
 * Images per /blur/classify/stream request. Must be ≤ the server's
 * STREAM_CLASSIFY_MAX_SIZE (500). Kept at 200 to bound server memory (it buffers
 * the whole request before streaming) and to limit rework if a stream drops.
 */
const BLUR_AI_STREAM_BATCH_SIZE = 200;

/**
 * Concurrent /blur/classify/stream requests in flight. Deliberately low: the
 * server owns inference parallelism via its own semaphore, so firing many
 * concurrent requests only oversubscribes its CPU. Decoupled from CPU core count
 * on purpose (unlike BLUR_CONCURRENCY, which drives local Sharp work).
 */
const BLUR_AI_STREAM_CONCURRENCY = 2;

/**
 * Timeout (ms) for one /blur/classify/stream request (a chunk of up to
 * BLUR_AI_STREAM_BATCH_SIZE images). Larger than the per-image BLUR_AI_TIMEOUT_MS
 * because a chunk does proportionally more work.
 */
const BLUR_AI_STREAM_TIMEOUT_MS = 120000;

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
  BLUR_AI_TIMEOUT_MS,
  BLUR_AI_MAX_DIMENSION,
  BLUR_AI_JPEG_QUALITY,
  BLUR_AI_RESIZE_CONCURRENCY,
  BLUR_AI_STREAM_BATCH_SIZE,
  BLUR_AI_STREAM_CONCURRENCY,
  BLUR_AI_STREAM_TIMEOUT_MS,
  DEVICE_LIMIT_PRO,
  DEVICE_LIMIT_PRO_PLUS,
  HEARTBEAT_INTERVAL_MS,
};
