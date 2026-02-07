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
// EXIF
// ============================================================================

/**
 * Concurrency limit for EXIF date extraction per chunk.
 * Kept moderate to balance speed vs memory/CPU from parsing image headers.
 */
const EXIF_CONCURRENCY = 20;

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
  EXIF_CONCURRENCY,
};
