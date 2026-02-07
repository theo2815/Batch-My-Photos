/**
 * Rollback Manager - Handles undo/rollback of batch operations
 * 
 * This module stores manifests of batch operations to enable rollback.
 * Manifests are persisted to disk (in userData/batch-history/) so rollback
 * survives app restarts. A summary index is kept in electron-store for fast
 * loading of the history list.
 * 
 * Key features:
 * - Stores original and current file paths for reverse operations
 * - Persistent history: manifests survive app restarts (configurable)
 * - Only supports "move" mode operations (copy mode doesn't need rollback)
 * - Validates file locations before rollback (detects stale manifests)
 * - Caps history to MAX_HISTORY_ENTRIES to bound disk usage
 */

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { FILE_MOVE_CHUNK_SIZE } = require('./constants');
const { isSameDrive } = require('./fileUtils');
const config = require('./config');
const logger = require('../utils/logger');

// Directory for persisted manifest files
const HISTORY_DIR_NAME = 'batch-history';

// In-memory rollback manifest (for session-level quick access)
let rollbackManifest = null;

// In-memory history index cache (loaded from store on first access)
let historyIndexCache = null;

// Reference to electron-store (set via init)
let storeRef = null;

/**
 * Initialize the rollback manager with a store reference.
 * Must be called once during app startup.
 * 
 * @param {Store} store - Electron store instance
 */
function init(store) {
  storeRef = store;
}

/**
 * Get the history directory path, creating it if needed.
 * 
 * @returns {string} Absolute path to the history directory
 */
function getHistoryDirPath() {
  const dirPath = path.join(app.getPath('userData'), HISTORY_DIR_NAME);
  return dirPath;
}

/**
 * Ensure the history directory exists.
 * 
 * @returns {Promise<void>}
 */
async function ensureHistoryDir() {
  const dirPath = getHistoryDirPath();
  await fsPromises.mkdir(dirPath, { recursive: true });
}

/**
 * Get the file path for a manifest by operation ID.
 * 
 * @param {string} operationId - Operation ID
 * @returns {string} Absolute path to the manifest file
 */
function getManifestFilePath(operationId) {
  // Sanitize operationId to prevent path traversal
  const safeId = operationId.replace(/[^a-z0-9_-]/gi, '');
  return path.join(getHistoryDirPath(), `${safeId}.json`);
}

/**
 * Load the history index from electron-store (with caching).
 * 
 * @returns {Array<Object>} Array of history summary entries
 */
function loadHistoryIndex() {
  if (historyIndexCache !== null) {
    return historyIndexCache;
  }

  if (!storeRef) {
    logger.warn('🔄 [HISTORY] Store not initialized, returning empty history');
    return [];
  }

  historyIndexCache = storeRef.get('operationHistory', []);
  return historyIndexCache;
}

/**
 * Save the history index to electron-store (and update cache).
 * 
 * @param {Array<Object>} entries - History entries to persist
 */
function saveHistoryIndex(entries) {
  historyIndexCache = entries;
  if (storeRef) {
    storeRef.set('operationHistory', entries);
  }
}

/**
 * Write a full manifest to disk as JSON.
 * 
 * @param {string} operationId - Operation ID
 * @param {Array<Object>} operations - Array of { fileName, originalPath, currentPath }
 * @returns {Promise<void>}
 */
async function writeManifestToDisk(operationId, operations) {
  await ensureHistoryDir();

  const filePath = getManifestFilePath(operationId);
  const tempPath = filePath + '.tmp';

  const data = JSON.stringify({ operationId, operations }, null, 2);
  await fsPromises.writeFile(tempPath, data, 'utf8');
  await fsPromises.rename(tempPath, filePath);

  logger.log('💾 [HISTORY] Manifest written to disk:', operationId);
}

/**
 * Read a full manifest from disk.
 * 
 * @param {string} operationId - Operation ID
 * @returns {Promise<Object|null>} Manifest data or null if not found/corrupted
 */
async function readManifestFromDisk(operationId) {
  const filePath = getManifestFilePath(operationId);

  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);

    if (!data.operations || !Array.isArray(data.operations)) {
      logger.warn('💾 [HISTORY] Invalid manifest structure:', operationId);
      return null;
    }

    return data;
  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.warn('💾 [HISTORY] Manifest file not found:', operationId);
    } else {
      logger.error('💾 [HISTORY] Failed to read manifest:', operationId, error.message);
    }
    return null;
  }
}

/**
 * Delete a manifest file from disk.
 * 
 * @param {string} operationId - Operation ID
 * @returns {Promise<void>}
 */
async function deleteManifestFromDisk(operationId) {
  const filePath = getManifestFilePath(operationId);
  try {
    await fsPromises.unlink(filePath);
    logger.log('🗑️ [HISTORY] Manifest deleted from disk:', operationId);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.error('💾 [HISTORY] Failed to delete manifest:', operationId, error.message);
    }
  }
}

/**
 * Save a rollback manifest after successful batch execution.
 * Also persists to disk if HISTORY_ENABLED is true.
 * 
 * @param {Object} params - Operation parameters
 * @param {string} params.sourceFolder - Original source folder path
 * @param {string} params.outputFolder - Output folder where batches were created
 * @param {string} params.mode - 'move' or 'copy' (only 'move' is saved)
 * @param {Array<Object>} params.operations - Array of { fileName, sourcePath, destPath }
 * @param {Array<string>} params.batchFolders - Names of created batch folders
 * @param {number} params.totalFiles - Total files processed
 * @param {string} [params.outputPrefix] - Batch folder prefix used
 * @param {number} [params.maxFilesPerBatch] - Max files per batch setting used
 * @param {string} [params.sortBy] - Sort order used (e.g. 'name-asc')
 * @param {Array<Object>} [params.batchResults] - Per-batch results [{ folder, fileCount }]
 * @returns {Promise<boolean>} True if manifest was saved
 */
async function saveRollbackManifest({ sourceFolder, outputFolder, mode, operations, batchFolders, totalFiles, outputPrefix, maxFilesPerBatch, sortBy, batchResults }) {
  // Only save manifest for 'move' mode - copy mode doesn't need rollback
  if (mode !== 'move') {
    logger.log('🔄 [ROLLBACK] Skipping manifest save - only supported for move mode');
    return false;
  }

  const operationId = Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
  const mappedOperations = operations.map(op => ({
    fileName: op.fileName,
    originalPath: op.sourcePath,  // Where file was before batch
    currentPath: op.destPath      // Where file is now (in batch folder)
  }));

  // Save in-memory manifest (session-level, backward compatible)
  rollbackManifest = {
    operationId,
    createdAt: new Date().toISOString(),
    mode,
    sourceFolder,
    outputFolder,
    batchFolders: batchFolders || [],
    totalFiles,
    outputPrefix: outputPrefix || '',
    maxFilesPerBatch: maxFilesPerBatch || null,
    sortBy: sortBy || 'name-asc',
    batchResults: batchResults || [],
    operations: mappedOperations
  };

  logger.log('🔄 [ROLLBACK] Manifest saved:', operationId);
  logger.log('   - Files:', totalFiles);
  logger.log('   - Batch folders:', batchFolders?.length || 0);

  // Persist to disk if history feature is enabled
  if (config.features.HISTORY_ENABLED) {
    try {
      // Write full manifest to disk
      await writeManifestToDisk(operationId, mappedOperations);

      // Add summary to history index
      const history = loadHistoryIndex();
      const summary = {
        operationId,
        createdAt: rollbackManifest.createdAt,
        sourceFolder,
        outputFolder,
        mode,
        totalFiles,
        batchFolderCount: batchFolders?.length || 0,
        batchFolders: batchFolders || [],
        outputPrefix: outputPrefix || '',
        // Extended metadata for history detail display
        maxFilesPerBatch: maxFilesPerBatch || null,
        sortBy: sortBy || 'name-asc',
        batchResults: batchResults || [],
      };

      history.unshift(summary); // Newest first

      // Cap history to max entries
      const maxEntries = config.limits.MAX_HISTORY_ENTRIES;
      if (history.length > maxEntries) {
        const removed = history.splice(maxEntries);
        // Clean up old manifest files
        for (const entry of removed) {
          await deleteManifestFromDisk(entry.operationId);
        }
        logger.log('🧹 [HISTORY] Pruned', removed.length, 'old entries');
      }

      saveHistoryIndex(history);
      logger.log('💾 [HISTORY] History updated. Total entries:', history.length);
    } catch (error) {
      logger.error('💾 [HISTORY] Failed to persist manifest:', error.message);
      // Non-fatal: in-memory manifest is still available for session rollback
    }
  }

  return true;
}

/**
 * Check if rollback is available (session-level, backward compatible).
 * 
 * @returns {Object|null} Summary info if available, null otherwise
 */
function checkRollbackAvailable() {
  if (!rollbackManifest) {
    return null;
  }

  return {
    operationId: rollbackManifest.operationId,
    createdAt: rollbackManifest.createdAt,
    sourceFolder: rollbackManifest.sourceFolder,
    totalFiles: rollbackManifest.totalFiles,
    batchFolderCount: rollbackManifest.batchFolders?.length || 0
  };
}

/**
 * Get the full rollback manifest (for internal use).
 * 
 * @returns {Object|null} Full manifest or null
 */
function getRollbackManifest() {
  return rollbackManifest;
}

/**
 * Clear the in-memory rollback manifest.
 * Called when user dismisses undo option or starts a new operation.
 */
function clearRollbackManifest() {
  if (rollbackManifest) {
    logger.log('🔄 [ROLLBACK] Manifest cleared:', rollbackManifest.operationId);
  }
  rollbackManifest = null;
}

/**
 * Get the operation history (summaries only, for UI display).
 * 
 * @returns {Array<Object>} Array of history summaries, newest first
 */
function getOperationHistory() {
  if (!config.features.HISTORY_ENABLED) {
    return [];
  }
  return loadHistoryIndex();
}

/**
 * Validate that files in a manifest are still at their expected locations.
 * Checks a sample of files to avoid long waits on large manifests.
 * 
 * @param {string} operationId - Operation ID to validate
 * @returns {Promise<Object>} Validation result { valid, checked, found, missing, error? }
 */
async function validateHistoryEntry(operationId) {
  const manifest = await readManifestFromDisk(operationId);
  if (!manifest) {
    return { valid: false, error: 'Manifest file not found on disk' };
  }

  const operations = manifest.operations;
  if (!operations || operations.length === 0) {
    return { valid: false, error: 'No operations in manifest' };
  }

  // Check a sample of files (up to 10) for speed
  const sampleSize = Math.min(10, operations.length);
  const step = Math.max(1, Math.floor(operations.length / sampleSize));
  let found = 0;
  let missing = 0;

  for (let i = 0; i < operations.length && (found + missing) < sampleSize; i += step) {
    const op = operations[i];
    try {
      await fsPromises.access(op.currentPath);
      found++;
    } catch {
      missing++;
    }
  }

  const checked = found + missing;
  return {
    valid: missing === 0,
    checked,
    found,
    missing
  };
}

/**
 * Load a manifest from disk and execute rollback for a specific history entry.
 * 
 * @param {string} operationId - Operation ID to rollback
 * @param {Object} appState - App state with batchCancelled flag
 * @param {Function} progressCallback - Called with progress updates
 * @returns {Promise<Object>} Result object with success status
 */
async function executeHistoryRollback(operationId, appState, progressCallback) {
  // Load full manifest from disk
  const manifest = await readManifestFromDisk(operationId);
  if (!manifest) {
    return { success: false, error: 'Operation history not found. The manifest file may have been deleted.' };
  }

  // Find the summary in the history index for batch folder info
  const history = loadHistoryIndex();
  const summary = history.find(e => e.operationId === operationId);
  if (!summary) {
    return { success: false, error: 'Operation not found in history index' };
  }

  // Build a temporary in-memory manifest for the rollback executor
  const tempManifest = {
    operationId,
    operations: manifest.operations,
    batchFolders: summary.batchFolders || [],
    outputFolder: summary.outputFolder,
    sourceFolder: summary.sourceFolder
  };

  // Execute rollback using the shared logic
  const result = await executeRollbackInternal(tempManifest, appState, progressCallback);

  // On success, remove the entry from history
  if (result.success) {
    await removeHistoryEntry(operationId);
  }

  return result;
}

/**
 * Remove a history entry (both from index and disk).
 * 
 * @param {string} operationId - Operation ID to remove
 * @returns {Promise<boolean>} True if entry was found and removed
 */
async function removeHistoryEntry(operationId) {
  const history = loadHistoryIndex();
  const initialLength = history.length;
  const filtered = history.filter(e => e.operationId !== operationId);

  if (filtered.length === initialLength) {
    return false; // Entry not found
  }

  saveHistoryIndex(filtered);
  await deleteManifestFromDisk(operationId);

  logger.log('🗑️ [HISTORY] Removed entry:', operationId);
  return true;
}

/**
 * Clear all operation history (index and manifest files).
 * 
 * @returns {Promise<number>} Number of entries cleared
 */
async function clearHistory() {
  const history = loadHistoryIndex();
  const count = history.length;

  // Delete all manifest files
  for (const entry of history) {
    await deleteManifestFromDisk(entry.operationId);
  }

  saveHistoryIndex([]);
  logger.log('🧹 [HISTORY] Cleared all history. Removed', count, 'entries');

  return count;
}

/**
 * Execute rollback operation - move files back to original locations.
 * Uses the in-memory manifest by default (backward compatible).
 * 
 * @param {Object} appState - App state with batchCancelled flag
 * @param {Function} progressCallback - Called with progress updates
 * @returns {Promise<Object>} Result object with success status
 */
async function executeRollback(appState, progressCallback) {
  if (!rollbackManifest) {
    return { success: false, error: 'No rollback manifest available' };
  }

  const result = await executeRollbackInternal(rollbackManifest, appState, progressCallback);

  // Clear in-memory manifest on success
  if (result.success) {
    const opId = rollbackManifest.operationId;
    clearRollbackManifest();

    // Also remove from persistent history if it exists there
    if (config.features.HISTORY_ENABLED) {
      await removeHistoryEntry(opId);
    }
  }

  return result;
}

/**
 * Internal rollback executor - shared between session and history rollback.
 * 
 * @param {Object} manifest - Manifest with operations, batchFolders, outputFolder, sourceFolder
 * @param {Object} appState - App state with batchCancelled flag
 * @param {Function} progressCallback - Called with progress updates
 * @returns {Promise<Object>} Result object with success status
 */
async function executeRollbackInternal(manifest, appState, progressCallback) {
  const { operations, batchFolders, outputFolder, sourceFolder } = manifest;

  logger.log('🔄 [ROLLBACK] Starting rollback operation');
  logger.log('   - Files to restore:', operations.length);

  let restoredFiles = 0;
  const errors = [];

  // Detect cross-drive rollback once upfront to choose the right strategy
  let crossDrive = false;
  if (operations.length > 0) {
    crossDrive = !(await isSameDrive(operations[0].currentPath, operations[0].originalPath));
    if (crossDrive) {
      logger.log('📀 [ROLLBACK] Cross-drive detected — using copy+delete strategy');
    }
  }

  // Reset cancellation flag
  if (appState?.resetBatchCancellation) {
    appState.resetBatchCancellation();
  }

  // Process files in chunks for responsiveness
  for (let i = 0; i < operations.length; i += FILE_MOVE_CHUNK_SIZE) {
    // Check for cancellation
    if (appState?.batchCancelled) {
      logger.log('⚠️ [ROLLBACK] Operation cancelled');
      break;
    }

    const chunk = operations.slice(i, i + FILE_MOVE_CHUNK_SIZE);

    for (const op of chunk) {
      try {
        // Ensure original directory exists
        const originalDir = path.dirname(op.originalPath);
        await fsPromises.mkdir(originalDir, { recursive: true });

        if (crossDrive) {
          // Cross-drive: copy + verify + delete
          await fsPromises.copyFile(op.currentPath, op.originalPath);
          const [srcStat, destStat] = await Promise.all([
            fsPromises.stat(op.currentPath),
            fsPromises.stat(op.originalPath),
          ]);
          if (srcStat.size !== destStat.size) {
            throw new Error('Copy verification failed - size mismatch');
          }
          await fsPromises.unlink(op.currentPath);
        } else {
          // Same-drive: fast rename
          await fsPromises.rename(op.currentPath, op.originalPath);
        }
        restoredFiles++;

      } catch (err) {
        if (err.code === 'ENOENT') {
          errors.push({ file: op.fileName, error: 'File not found at batch location' });
        } else {
          errors.push({ file: op.fileName, error: err.message });
        }
      }
    }

    // Send progress update
    if (progressCallback) {
      progressCallback({
        current: Math.min(i + FILE_MOVE_CHUNK_SIZE, operations.length),
        total: operations.length,
        restoredFiles
      });
    }

    // Yield to event loop
    await new Promise(r => setImmediate(r));
  }

  // Try to delete empty batch folders
  let deletedFolders = 0;
  if (!appState?.batchCancelled && batchFolders && batchFolders.length > 0) {
    for (const folderName of batchFolders) {
      const folderPath = path.join(outputFolder, folderName);
      try {
        const entries = await fsPromises.readdir(folderPath);
        if (entries.length === 0) {
          await fsPromises.rmdir(folderPath);
          deletedFolders++;
          logger.log('🗑️ [ROLLBACK] Deleted empty batch folder:', folderName);
        } else {
          logger.log('⚠️ [ROLLBACK] Batch folder not empty, skipping:', folderName);
        }
      } catch (err) {
        logger.log('⚠️ [ROLLBACK] Could not delete batch folder:', folderName, err.message);
      }
    }
  }

  const wasCancelled = appState?.batchCancelled || false;

  logger.log('🔄 [ROLLBACK] Complete');
  logger.log('   - Files restored:', restoredFiles);
  logger.log('   - Folders deleted:', deletedFolders);
  logger.log('   - Errors:', errors.length);

  return {
    success: !wasCancelled && errors.length === 0,
    cancelled: wasCancelled,
    restoredFiles,
    totalFiles: operations.length,
    deletedFolders,
    sourceFolder,
    hasErrors: errors.length > 0,
    errorCount: errors.length,
    errors: errors.length > 0 ? errors.slice(0, 10) : null
  };
}

module.exports = {
  init,
  saveRollbackManifest,
  checkRollbackAvailable,
  getRollbackManifest,
  clearRollbackManifest,
  executeRollback,
  // History API
  getOperationHistory,
  validateHistoryEntry,
  executeHistoryRollback,
  removeHistoryEntry,
  clearHistory
};
