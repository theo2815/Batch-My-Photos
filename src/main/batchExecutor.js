/**
 * Batch Executor - Shared File Processing Engine
 * 
 * Encapsulates the three file-processing strategies used by both
 * execute-batch and resume-batch IPC handlers:
 * 
 * 1. Same-drive move:  Chunked synchronous fs.renameSync (O(1) per file)
 * 2. Cross-drive move:  Async worker pool → copyFile + verify + unlink
 * 3. Copy:              Async worker pool → copyFile
 * 
 * By centralizing this logic, bug fixes and performance improvements
 * apply to both initial execution and resume operations.
 */

const fs = require('fs');
const fsPromises = require('fs').promises;
const logger = require('../utils/logger');
const { isSameDrive } = require('./fileUtils');
const { MAX_FILE_CONCURRENCY, FILE_MOVE_CHUNK_SIZE } = require('./constants');

/**
 * Execute file operations using the appropriate strategy based on mode and drive layout.
 * 
 * @param {Array<Object>} operations - Array of { fileName, sourcePath, destPath }
 * @param {string} mode - 'move' or 'copy'
 * @param {Object} options - Configuration and callbacks
 * @param {number} options.totalFiles - Total files in the entire batch (for progress %)
 * @param {number} options.batchCount - Number of batch folders (for progress reporting)
 * @param {number} options.initialProcessed - Files already processed (0 for fresh, N for resume)
 * @param {() => boolean} options.isCancelled - Function that returns true if operation is cancelled
 * @param {(progress: Object) => void} options.onProgress - Called with { current, total, processedFiles, totalFiles }
 * @param {(fileNames: string[]) => void} options.onProcessedFiles - Called after files are successfully processed
 * @param {() => Promise<void>} options.onSaveProgress - Called periodically to persist progress to disk
 * @returns {Promise<{ processedFiles: number, errors: Array<{ file: string, error: string }> }>}
 */
async function executeFileOperations(operations, mode, options) {
  const {
    totalFiles,
    batchCount,
    initialProcessed = 0,
    isCancelled,
    onProgress,
    onProcessedFiles,
    onSaveProgress,
  } = options;

  let processedFiles = initialProcessed;
  const errors = [];

  if (operations.length === 0) {
    return { processedFiles, errors };
  }

  if (mode === 'move') {
    const isCrossDrive = !(await isSameDrive(operations[0].sourcePath, operations[0].destPath));

    if (isCrossDrive) {
      // ================================================================
      // STRATEGY 1: Cross-drive move (async copy + verify + delete)
      // ================================================================
      logger.log('📀 [EXECUTOR] Cross-drive move - using async copy+delete');

      await _runWorkerPool(operations, async (op) => {
        // Copy file first
        await fsPromises.copyFile(op.sourcePath, op.destPath);
        // Verify copy succeeded before deleting source
        const [srcStat, destStat] = await Promise.all([
          fsPromises.stat(op.sourcePath),
          fsPromises.stat(op.destPath)
        ]);
        if (srcStat.size !== destStat.size) {
          throw new Error('Copy verification failed - size mismatch');
        }
        // Delete source (safe now that copy is verified)
        await fsPromises.unlink(op.sourcePath);
      }, {
        isCancelled,
        onFileProcessed: (fileName) => {
          processedFiles++;
          onProcessedFiles([fileName]);
        },
        onFileError: (fileName, err) => {
          processedFiles++;
          errors.push({ file: fileName, error: err.message });
        },
        onProgress: () => _sendProgress(processedFiles, totalFiles, batchCount, onProgress),
        onSaveProgress,
      });

    } else {
      // ================================================================
      // STRATEGY 2: Same-drive move (fast sync rename, chunked)
      // ================================================================
      logger.log('⚡ [EXECUTOR] Same-drive move - using fast sync rename');
      let lastSaveTime = Date.now();

      for (let i = 0; i < operations.length; i += FILE_MOVE_CHUNK_SIZE) {
        // Check for cancellation between chunks
        if (isCancelled()) {
          logger.log('⚠️ [EXECUTOR] Cancelled during move operation');
          break;
        }

        // Process chunk synchronously (fast for same-drive)
        const chunk = operations.slice(i, i + FILE_MOVE_CHUNK_SIZE);
        const chunkFileNames = [];
        for (const op of chunk) {
          try {
            fs.renameSync(op.sourcePath, op.destPath);
            chunkFileNames.push(op.fileName);
          } catch (err) {
            errors.push({ file: op.fileName, error: err.message });
          }
        }

        // Track processed files
        if (chunkFileNames.length > 0) {
          onProcessedFiles(chunkFileNames);
        }

        // Update count
        processedFiles = initialProcessed + Math.min(i + FILE_MOVE_CHUNK_SIZE, operations.length);

        // Send progress update
        _sendProgress(processedFiles, totalFiles, batchCount, onProgress);

        // Save to disk every 2 seconds
        const now = Date.now();
        if (now - lastSaveTime >= 2000) {
          lastSaveTime = now;
          await onSaveProgress();
        }

        // Yield to event loop (only if more chunks remain)
        if (i + FILE_MOVE_CHUNK_SIZE < operations.length) {
          await new Promise(r => setImmediate(r));
        }
      }

      // Final save
      await onSaveProgress();
    }
  } else {
    // ================================================================
    // STRATEGY 3: Async copy (worker pool)
    // ================================================================
    logger.log('📋 [EXECUTOR] Copy mode with', MAX_FILE_CONCURRENCY, 'concurrent workers');

    await _runWorkerPool(operations, async (op) => {
      await fsPromises.copyFile(op.sourcePath, op.destPath);
    }, {
      isCancelled,
      onFileProcessed: (fileName) => {
        processedFiles++;
        onProcessedFiles([fileName]);
      },
      onFileError: (fileName, err) => {
        processedFiles++;
        errors.push({ file: fileName, error: err.message });
      },
      onProgress: () => _sendProgress(processedFiles, totalFiles, batchCount, onProgress),
      onSaveProgress,
    });
  }

  // Send final progress (ensure UI shows 100%)
  _sendProgress(
    isCancelled() ? processedFiles : initialProcessed + operations.length,
    totalFiles,
    batchCount,
    onProgress
  );

  return { processedFiles, errors };
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Run an async worker pool that processes operations concurrently.
 * Used by both cross-drive move and copy strategies.
 * 
 * @param {Array<Object>} operations - Array of { fileName, sourcePath, destPath }
 * @param {(op: Object) => Promise<void>} processOp - Async function to process a single operation
 * @param {Object} callbacks - Event callbacks
 */
async function _runWorkerPool(operations, processOp, callbacks) {
  const { isCancelled, onFileProcessed, onFileError, onProgress, onSaveProgress } = callbacks;

  // Atomic index management: prevents race condition where multiple
  // workers could read the same index before any increments it.
  const cursor = { index: 0 };
  const getNextIndex = () => cursor.index++;

  const worker = async () => {
    while (!isCancelled()) {
      const opIndex = getNextIndex();
      if (opIndex >= operations.length) break;

      const op = operations[opIndex];
      try {
        await processOp(op);
        onFileProcessed(op.fileName);
      } catch (err) {
        onFileError(op.fileName, err);
      }
    }
  };

  // Start workers (capped at MAX_FILE_CONCURRENCY or operation count)
  const workers = [];
  const threadCount = Math.min(MAX_FILE_CONCURRENCY, operations.length);
  for (let i = 0; i < threadCount; i++) {
    workers.push(worker());
  }

  // Centralized progress reporting + disk saves (recursive setTimeout to avoid overlap)
  let progressTimerActive = true;
  let progressTimerId = null;
  const scheduleProgressSave = () => {
    if (!progressTimerActive) return;
    progressTimerId = setTimeout(async () => {
      if (!progressTimerActive) return;
      onProgress();
      await onSaveProgress();
      scheduleProgressSave();
    }, 2000);
  };
  scheduleProgressSave();

  await Promise.all(workers);

  progressTimerActive = false;
  if (progressTimerId !== null) {
    clearTimeout(progressTimerId);
    progressTimerId = null;
  }

  // Final save after all workers complete
  await onSaveProgress();
}

/**
 * Send a progress update via the onProgress callback.
 * 
 * @param {number} processedFiles - Current processed count
 * @param {number} totalFiles - Total file count
 * @param {number} batchCount - Number of batch folders
 * @param {(progress: Object) => void} onProgress - Callback
 */
function _sendProgress(processedFiles, totalFiles, batchCount, onProgress) {
  const currentBatch = Math.floor((processedFiles / totalFiles) * batchCount);
  onProgress({
    current: currentBatch,
    total: batchCount,
    processedFiles,
    totalFiles
  });
}

module.exports = { executeFileOperations };
