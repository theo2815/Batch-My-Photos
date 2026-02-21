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
 * - SECURITY: Manifests are encrypted at rest using AES-256-GCM
 * - RELIABILITY: Rollback operations have crash recovery via progress marker
 */

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const crypto = require('crypto');
const { FILE_MOVE_CHUNK_SIZE, MAX_FILE_CONCURRENCY } = require('./constants');
const { isSameDrive } = require('./fileUtils');
const config = require('./config');
const logger = require('../utils/logger');

// Directory for persisted manifest files
const HISTORY_DIR_NAME = 'batch-history';

// Rollback progress file (crash recovery)
const ROLLBACK_PROGRESS_FILE = 'rollback_progress.json';

// ============================================================================
// ENCRYPTION (matches progressManager.js AES-256-GCM approach)
// ============================================================================
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const INTEGRITY_KEY_FILE = '.integrity_key';

let cachedIntegrityKey = null;
let cachedManifestEncKey = null;

/**
 * Get or create the per-installation integrity key.
 * Shares the same key file as progressManager for consistency.
 */
function getIntegrityKey() {
  if (cachedIntegrityKey) return cachedIntegrityKey;

  const keyFilePath = path.join(app.getPath('userData'), INTEGRITY_KEY_FILE);
  try {
    cachedIntegrityKey = fs.readFileSync(keyFilePath, 'utf8').trim();
    return cachedIntegrityKey;
  } catch (_err) {
    // Key file doesn't exist yet — progressManager will create it on first use.
    // Generate one here as a fallback if rollbackManager runs first.
  }

  cachedIntegrityKey = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(keyFilePath, cachedIntegrityKey, { encoding: 'utf8', mode: 0o600 });
    logger.log('🔐 [SECURITY] Generated integrity key (from rollbackManager)');
  } catch (_err) {
    logger.error('🔐 [SECURITY] Could not persist integrity key');
  }
  return cachedIntegrityKey;
}

/**
 * Derive a 256-bit encryption key for manifest files.
 * Uses a DIFFERENT context label than progressManager so the derived keys
 * are cryptographically independent even though the master secret is shared.
 */
function getManifestEncryptionKey() {
  if (cachedManifestEncKey) return cachedManifestEncKey;

  const masterKey = Buffer.from(getIntegrityKey(), 'hex');
  cachedManifestEncKey = crypto.hkdfSync(
    'sha256',
    masterKey,
    Buffer.alloc(0),
    Buffer.from('batch-manifest-encryption'),   // unique context label
    32
  );
  return cachedManifestEncKey;
}

/** Encrypt plaintext JSON string → envelope JSON string */
function encryptManifest(plaintext) {
  const key = getManifestEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return JSON.stringify({
    encrypted: true,
    version: 1,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    ciphertext
  });
}

/** Decrypt envelope object → plaintext JSON string */
function decryptManifest(envelope) {
  const key = getManifestEncryptionKey();
  const iv = Buffer.from(envelope.iv, 'hex');
  const authTag = Buffer.from(envelope.authTag, 'hex');
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  let plaintext = decipher.update(envelope.ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');
  return plaintext;
}

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
 * Write a full manifest to disk (encrypted with AES-256-GCM).
 * Falls back to plaintext JSON only if encryption is explicitly disabled.
 * 
 * @param {string} operationId - Operation ID
 * @param {Array<Object>} operations - Array of { fileName, originalPath, currentPath }
 * @returns {Promise<void>}
 */
async function writeManifestToDisk(operationId, operations) {
  await ensureHistoryDir();

  const filePath = getManifestFilePath(operationId);
  const tempPath = filePath + '.tmp';

  const plaintext = JSON.stringify({ operationId, operations });
  const serialized = config.features.ENCRYPTION_ENABLED
    ? encryptManifest(plaintext)
    : JSON.stringify({ operationId, operations }, null, 2);

  await fsPromises.writeFile(tempPath, serialized, 'utf8');
  await fsPromises.rename(tempPath, filePath);

  logger.log('💾 [HISTORY] Manifest written to disk (encrypted):', operationId);
}

/**
 * Read a full manifest from disk.
 * Auto-detects encrypted vs plaintext format for backward compatibility
 * with manifests written before encryption was added.
 * 
 * @param {string} operationId - Operation ID
 * @returns {Promise<Object|null>} Manifest data or null if not found/corrupted
 */
async function readManifestFromDisk(operationId) {
  const filePath = getManifestFilePath(operationId);

  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);

    let data;
    // Detect encrypted envelope
    if (parsed.encrypted === true && parsed.iv && parsed.authTag && parsed.ciphertext) {
      try {
        const plaintext = decryptManifest(parsed);
        data = JSON.parse(plaintext);
      } catch (decryptError) {
        logger.error('🔐 [SECURITY] Manifest decryption failed (tampered?):', operationId, decryptError.message);
        return null;
      }
    } else {
      // Legacy plaintext manifest — read as-is
      data = parsed;
      // Opportunistically re-encrypt on next write (handled by caller)
      logger.log('💾 [HISTORY] Read legacy plaintext manifest:', operationId);
    }

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
 * Checks a proportional sample of files (5% up to 50) for meaningful confidence.
 * 
 * @param {string} operationId - Operation ID to validate
 * @returns {Promise<Object>} Validation result { valid, checked, found, missing, totalOperations, error? }
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

  // Scale sample size: 5% of total, minimum 10, maximum 50
  const sampleSize = Math.min(50, Math.max(10, Math.ceil(operations.length * 0.05)));
  const actualSample = Math.min(sampleSize, operations.length);
  const step = Math.max(1, Math.floor(operations.length / actualSample));
  let found = 0;
  let missing = 0;

  for (let i = 0; i < operations.length && (found + missing) < actualSample; i += step) {
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
    missing,
    totalOperations: operations.length
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

// ============================================================================
// ROLLBACK CRASH RECOVERY
// ============================================================================

/**
 * Get the path to the rollback progress file.
 * @returns {string}
 */
function getRollbackProgressPath() {
  return path.join(app.getPath('userData'), ROLLBACK_PROGRESS_FILE);
}

/**
 * Write rollback-in-progress marker with current state.
 * Used for crash recovery: if the app crashes mid-rollback, on next launch
 * we can detect the incomplete rollback and offer to resume.
 * 
 * @param {Object} state - { operationId, totalFiles, restoredFiles, restoredFileNames, sourceFolder, outputFolder, batchFolders }
 */
async function writeRollbackProgress(state) {
  const filePath = getRollbackProgressPath();
  const tempPath = filePath + '.tmp';
  const plaintext = JSON.stringify(state);
  const serialized = config.features.ENCRYPTION_ENABLED
    ? encryptManifest(plaintext)
    : JSON.stringify(state, null, 2);
  await fsPromises.writeFile(tempPath, serialized, 'utf8');
  await fsPromises.rename(tempPath, filePath);
}

/**
 * Read rollback-in-progress state, if any.
 * @returns {Promise<Object|null>} Rollback progress state or null
 */
async function readRollbackProgress() {
  const filePath = getRollbackProgressPath();
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);

    // Detect encrypted format
    if (parsed.encrypted === true && parsed.iv && parsed.authTag && parsed.ciphertext) {
      try {
        const plaintext = decryptManifest(parsed);
        return JSON.parse(plaintext);
      } catch (_err) {
        logger.error('🔐 [SECURITY] Rollback progress decryption failed — deleting');
        await clearRollbackProgress();
        return null;
      }
    }
    return parsed;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.error('💾 [ROLLBACK] Failed to read rollback progress:', error.message);
    }
    return null;
  }
}

/**
 * Clear rollback progress file (called on successful completion).
 */
async function clearRollbackProgress() {
  const filePath = getRollbackProgressPath();
  await Promise.all([
    fsPromises.unlink(filePath).catch(() => {}),
    fsPromises.unlink(filePath + '.tmp').catch(() => {}),
  ]);
}

/**
 * Check if there's an interrupted rollback from a previous session.
 * Called on app startup alongside the existing check-interrupted-progress.
 * 
 * @returns {Promise<Object|null>} Info about interrupted rollback, or null
 */
async function checkInterruptedRollback() {
  const state = await readRollbackProgress();
  if (!state || !state.operationId) return null;

  // Auto-expire stale rollback markers after 7 days.
  // If errors are permanent (files deleted, permissions locked), the user
  // would otherwise see "Resume Rollback" on every app restart forever.
  const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;
  if (state.lastUpdated || state.restoredFiles != null) {
    const age = Date.now() - new Date(state.lastUpdated || 0).getTime();
    if (age > STALE_THRESHOLD_MS) {
      logger.log('🧹 [ROLLBACK] Auto-expiring stale rollback progress (', Math.round(age / 86400000), 'days old)');
      await clearRollbackProgress();
      return null;
    }
  }

  logger.log('🔄 [ROLLBACK] Found interrupted rollback:', state.operationId);
  logger.log('   - Restored:', state.restoredFiles, 'of', state.totalFiles);

  return {
    operationId: state.operationId,
    restoredFiles: state.restoredFiles || 0,
    totalFiles: state.totalFiles || 0,
    sourceFolder: state.sourceFolder,
  };
}

/**
 * Resume an interrupted rollback operation.
 * Reads the rollback progress, loads the manifest, and continues from where it stopped.
 * 
 * @param {Object} appState - App state with batchCancelled flag
 * @param {Function} progressCallback - Called with progress updates
 * @returns {Promise<Object>} Result object with success status
 */
async function resumeInterruptedRollback(appState, progressCallback) {
  const state = await readRollbackProgress();
  if (!state || !state.operationId) {
    return { success: false, error: 'No interrupted rollback found' };
  }

  // Load the full manifest (still on disk since rollback wasn't completed)
  const manifest = await readManifestFromDisk(state.operationId);
  if (!manifest) {
    // Manifest was deleted — cannot resume, clear the progress marker
    await clearRollbackProgress();
    return { success: false, error: 'Rollback manifest not found. Cannot resume.' };
  }

  // Find the history summary for batch folder info
  const history = loadHistoryIndex();
  const summary = history.find(e => e.operationId === state.operationId);

  // Derive which operations are already restored.
  // New checkpoints store only a count (not restoredFileNames) for performance.
  // Legacy checkpoints may still have restoredFileNames — use them if available,
  // otherwise determine remaining work by checking filesystem state.
  let remainingOps;
  let alreadyRestored;
  if (state.restoredFileNames && state.restoredFileNames.length > 0) {
    // Legacy path: use the persisted filename list
    const restoredSet = new Set(state.restoredFileNames);
    remainingOps = manifest.operations.filter(op => !restoredSet.has(op.fileName));
    alreadyRestored = restoredSet.size;
  } else {
    // Current path: derive from filesystem — a file is "restored" if it exists at originalPath
    const checkResults = await Promise.all(
      manifest.operations.map(async (op) => {
        try {
          await fsPromises.access(op.originalPath);
          return true; // file exists at original location — already restored
        } catch {
          return false;
        }
      })
    );
    remainingOps = manifest.operations.filter((_, i) => !checkResults[i]);
    alreadyRestored = manifest.operations.length - remainingOps.length;
  }

  logger.log('🔄 [ROLLBACK] Resuming interrupted rollback:', state.operationId);
  logger.log('   - Already restored:', alreadyRestored);
  logger.log('   - Remaining:', remainingOps.length);

  if (remainingOps.length === 0) {
    // All files were already restored — just clean up
    await clearRollbackProgress();
    if (summary) await removeHistoryEntry(state.operationId);
    return {
      success: true,
      restoredFiles: state.restoredFiles || alreadyRestored,
      totalFiles: state.totalFiles,
      sourceFolder: state.sourceFolder,
      deletedFolders: 0,
      resumed: true
    };
  }

  // Build a partial manifest for the remaining work
  const partialManifest = {
    operationId: state.operationId,
    operations: remainingOps,
    batchFolders: summary?.batchFolders || state.batchFolders || [],
    outputFolder: summary?.outputFolder || state.outputFolder,
    sourceFolder: state.sourceFolder
  };

  const result = await executeRollbackInternal(partialManifest, appState, progressCallback, {
    initialRestored: alreadyRestored,
    existingRestoredNames: []  // No longer needed — checkpoint is count-only
  });

  // On success, remove the entry from history
  if (result.success) {
    await removeHistoryEntry(state.operationId);
  }

  result.resumed = true;
  return result;
}

/**
 * Internal rollback executor - shared between session and history rollback.
 * 
 * @param {Object} manifest - Manifest with operations, batchFolders, outputFolder, sourceFolder
 * @param {Object} appState - App state with batchCancelled flag
 * @param {Function} progressCallback - Called with progress updates
 * @param {Object} [resumeState] - Resume state { initialRestored, existingRestoredNames }
 * @returns {Promise<Object>} Result object with success status
 */
async function executeRollbackInternal(manifest, appState, progressCallback, resumeState = null) {
  const { operations, batchFolders, outputFolder, sourceFolder } = manifest;

  logger.log('🔄 [ROLLBACK] Starting rollback operation');
  logger.log('   - Files to restore:', operations.length);

  let restoredFiles = resumeState?.initialRestored || 0;
  const restoredFileNames = resumeState?.existingRestoredNames ? [...resumeState.existingRestoredNames] : [];
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

  // Write rollback-in-progress marker for crash recovery
  const totalToRestore = (resumeState?.initialRestored || 0) + operations.length;
  let rollbackProgressDirty = false;
  let lastRollbackSave = Date.now();
  const ROLLBACK_SAVE_INTERVAL = 2000; // Save rollback progress every 2 seconds

  async function saveRollbackState() {
    try {
      // PERFORMANCE: Write only the count + metadata (not the full restoredFileNames array).
      // On resume, already-restored files are derived by checking filesystem state
      // (file exists at originalPath). This keeps checkpoint writes tiny and constant-size.
      await writeRollbackProgress({
        operationId: manifest.operationId,
        totalFiles: totalToRestore,
        restoredFiles,
        sourceFolder,
        outputFolder,
        batchFolders: batchFolders || [],
        lastUpdated: new Date().toISOString(),
      });
      rollbackProgressDirty = false;
      lastRollbackSave = Date.now();
    } catch (err) {
      logger.error('💾 [ROLLBACK] Failed to save rollback progress:', err.message);
    }
  }

  // Write initial marker
  await saveRollbackState();

  // Pre-create all unique parent directories ONCE (instead of per-file)
  const uniqueDirs = new Set();
  for (const op of operations) {
    uniqueDirs.add(path.dirname(op.originalPath));
  }
  for (const dir of uniqueDirs) {
    try {
      await fsPromises.mkdir(dir, { recursive: true });
    } catch (err) {
      // If we can't create a directory, individual file moves will fail and be caught below
      logger.warn('⚠️ [ROLLBACK] Could not pre-create directory:', dir, err.message);
    }
  }

  if (crossDrive) {
    // ================================================================
    // CROSS-DRIVE: concurrent worker pool (matches batch executor)
    // ================================================================
    logger.log('📀 [ROLLBACK] Cross-drive rollback with', MAX_FILE_CONCURRENCY, 'concurrent workers');

    const cursor = { index: 0 };
    const getNextIndex = () => cursor.index++;

    const worker = async () => {
      while (!appState?.batchCancelled) {
        const opIndex = getNextIndex();
        if (opIndex >= operations.length) break;

        const op = operations[opIndex];
        try {
          await fsPromises.copyFile(op.currentPath, op.originalPath);
          const [srcStat, destStat] = await Promise.all([
            fsPromises.stat(op.currentPath),
            fsPromises.stat(op.originalPath),
          ]);
          if (srcStat.size !== destStat.size) {
            throw new Error('Copy verification failed - size mismatch');
          }
          await fsPromises.unlink(op.currentPath);
          restoredFiles++;
          restoredFileNames.push(op.fileName);
          rollbackProgressDirty = true;
        } catch (err) {
          if (err.code === 'ENOENT') {
            // File not at batch location — check if already restored (crash recovery)
            try {
              await fsPromises.access(op.originalPath);
              // File exists at original location — already restored, not an error
              restoredFiles++;
              restoredFileNames.push(op.fileName);
              rollbackProgressDirty = true;
            } catch {
              errors.push({ file: op.fileName, error: 'File not found at batch location or original location' });
            }
          } else {
            errors.push({ file: op.fileName, error: err.message });
          }
        }
      }
    };

    // Start workers
    const workers = [];
    const threadCount = Math.min(MAX_FILE_CONCURRENCY, operations.length);
    for (let i = 0; i < threadCount; i++) {
      workers.push(worker());
    }

    // Progress reporting + periodic rollback state saving while workers run
    let progressActive = true;
    const progressLoop = async () => {
      while (progressActive) {
        await new Promise(r => setTimeout(r, 500));
        if (progressCallback && progressActive) {
          progressCallback({
            current: restoredFiles + errors.length,
            total: totalToRestore,
            restoredFiles
          });
        }
        // Periodically persist rollback progress for crash recovery
        if (rollbackProgressDirty && (Date.now() - lastRollbackSave) >= ROLLBACK_SAVE_INTERVAL) {
          await saveRollbackState();
        }
      }
    };
    const progressPromise = progressLoop();

    await Promise.all(workers);
    progressActive = false;
    await progressPromise;

  } else {
    // ================================================================
    // SAME-DRIVE: fast sync renameSync in chunks (matches batch executor)
    // ================================================================
    logger.log('⚡ [ROLLBACK] Same-drive rollback — using fast sync rename');

    for (let i = 0; i < operations.length; i += FILE_MOVE_CHUNK_SIZE) {
      // Check for cancellation between chunks
      if (appState?.batchCancelled) {
        logger.log('⚠️ [ROLLBACK] Operation cancelled');
        break;
      }

      const chunk = operations.slice(i, i + FILE_MOVE_CHUNK_SIZE);

      // Process chunk synchronously (fast for same-drive, no async overhead)
      for (const op of chunk) {
        try {
          fs.renameSync(op.currentPath, op.originalPath);
          restoredFiles++;
          restoredFileNames.push(op.fileName);
          rollbackProgressDirty = true;
        } catch (err) {
          if (err.code === 'ENOENT') {
            // File not at batch location — check if already at original (crash recovery)
            try {
              fs.accessSync(op.originalPath);
              // Already restored — not an error
              restoredFiles++;
              restoredFileNames.push(op.fileName);
              rollbackProgressDirty = true;
            } catch {
              errors.push({ file: op.fileName, error: 'File not found at batch location or original location' });
            }
          } else {
            errors.push({ file: op.fileName, error: err.message });
          }
        }
      }

      // Send progress update
      if (progressCallback) {
        progressCallback({
          current: (resumeState?.initialRestored || 0) + Math.min(i + FILE_MOVE_CHUNK_SIZE, operations.length),
          total: totalToRestore,
          restoredFiles
        });
      }

      // Save rollback progress after EVERY chunk for crash recovery.
      // Same-drive renames are extremely fast (sub-second for thousands of files),
      // so a time-based interval (2s) may never fire before the app is closed.
      if (rollbackProgressDirty) {
        await saveRollbackState();
      }

      // Yield to event loop between chunks (only if more remain)
      if (i + FILE_MOVE_CHUNK_SIZE < operations.length) {
        await new Promise(r => setImmediate(r));
      }
    }
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

  // Clear rollback progress marker on success (crash recovery no longer needed)
  if (!wasCancelled && errors.length === 0) {
    await clearRollbackProgress();
  } else if (wasCancelled) {
    // Save final state so resume picks up where we left off
    await saveRollbackState();
  }

  logger.log('🔄 [ROLLBACK] Complete');
  logger.log('   - Files restored:', restoredFiles);
  logger.log('   - Folders deleted:', deletedFolders);
  logger.log('   - Errors:', errors.length);

  return {
    success: !wasCancelled && errors.length === 0,
    cancelled: wasCancelled,
    restoredFiles,
    totalFiles: totalToRestore,
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
  clearHistory,
  // Rollback crash recovery
  checkInterruptedRollback,
  resumeInterruptedRollback,
  clearRollbackProgress
};
