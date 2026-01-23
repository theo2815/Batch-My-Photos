/**
 * Progress Manager - Handles batch operation progress persistence
 * 
 * This module saves batch operation state to disk, enabling crash recovery.
 * Progress is stored in the app's userData folder.
 * 
 * IMPORTANT: Uses atomic write pattern to prevent file corruption from race conditions.
 * 
 * SECURITY FIX: Integrity key is now generated randomly per installation,
 * stored securely in userData, and not exposed in source code.
 */

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const crypto = require('crypto');

// Progress file location
const PROGRESS_FILE_NAME = 'batch_progress.json';
const INTEGRITY_KEY_FILE = '.integrity_key';

// Cached integrity key (loaded once on first use)
let cachedIntegrityKey = null;

/**
 * Get or create the integrity key for HMAC verification.
 * Key is generated randomly on first run and persisted in userData.
 * This prevents the key from being visible in source code.
 * 
 * @returns {string} The integrity key
 */
function getIntegrityKey() {
  if (cachedIntegrityKey) {
    return cachedIntegrityKey;
  }
  
  const keyFilePath = path.join(app.getPath('userData'), INTEGRITY_KEY_FILE);
  
  try {
    // Try to read existing key
    if (fs.existsSync(keyFilePath)) {
      cachedIntegrityKey = fs.readFileSync(keyFilePath, 'utf8').trim();
      return cachedIntegrityKey;
    }
  } catch (error) {
    console.warn('💾 [PROGRESS] Could not read integrity key, generating new one');
  }
  
  // Generate new random key (32 bytes = 64 hex chars)
  cachedIntegrityKey = crypto.randomBytes(32).toString('hex');
  
  try {
    // Store the key (sync to ensure it's saved before use)
    fs.writeFileSync(keyFilePath, cachedIntegrityKey, 'utf8');
    console.log('🔐 [SECURITY] Generated new integrity key for this installation');
  } catch (error) {
    console.error('💾 [PROGRESS] Could not persist integrity key:', error.message);
    // Key is still usable in memory for this session
  }
  
  return cachedIntegrityKey;
}

/**
 * Get the path to the progress file
 * @returns {string} Absolute path to progress file
 */
function getProgressFilePath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, PROGRESS_FILE_NAME);
}

// In-memory progress state (source of truth during operation)
let currentProgress = null;
let saveInProgress = false;
let pendingSave = false;

/**
 * Start tracking progress for a new batch operation
 * 
 * @param {Object} params - Operation parameters
 * @param {string} params.folderPath - Source folder path
 * @param {string} params.outputDir - Output directory
 * @param {string} params.mode - 'move' or 'copy'
 * @param {number} params.maxFilesPerBatch - Max files per batch
 * @param {string} params.outputPrefix - Batch folder prefix
 * @param {number} params.totalFiles - Total files to process
 * @param {Array<string>} params.allFileNames - List of all file names to process
 * @param {Array<Object>} params.operations - Full operations array with source/dest paths
 * @param {Array<Object>} params.batchInfo - Batch info for results display
 * @returns {Promise<string>} Operation ID
 */
async function startProgress(params) {
  const operationId = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  
  // Initialize in-memory state
  currentProgress = {
    operationId,
    startedAt: new Date().toISOString(),
    folderPath: params.folderPath,
    outputDir: params.outputDir,
    mode: params.mode,
    maxFilesPerBatch: params.maxFilesPerBatch,
    outputPrefix: params.outputPrefix,
    totalFiles: params.totalFiles,
    processedFiles: 0,
    processedFileNames: [],
    allFileNames: params.allFileNames,
    operations: params.operations, // Full operations with dest paths
    batchInfo: params.batchInfo,   // Batch info for display
    lastUpdated: new Date().toISOString()
  };
  
  // Write initial state to disk with integrity check
  const progressPath = getProgressFilePath();
  const dataToSave = { ...currentProgress };
  dataToSave.integrity = calculateHash(dataToSave);
  
  await fsPromises.writeFile(progressPath, JSON.stringify(dataToSave, null, 2), 'utf8');
  
  console.log('💾 [PROGRESS] Started tracking progress:', operationId);
  return operationId;
}

/**
 * Calculate HMAC SHA-256 hash for data integrity
 * @param {Object} data - The progress data object (without integrity field)
 * @returns {string} Hex digest of the hash
 */
function calculateHash(data) {
  // Create a copy and remove integrity field to ensure consistent hashing
  const { integrity, ...cleanData } = data;
  // Sort keys to ensure deterministic JSON string
  const jsonString = JSON.stringify(cleanData, Object.keys(cleanData).sort());
  // Use the per-installation key instead of hardcoded constant
  return crypto.createHmac('sha256', getIntegrityKey()).update(jsonString).digest('hex');
}

/**
 * Add processed files to in-memory state (fast, non-blocking)
 * Call saveProgressToDisk() periodically to persist
 * 
 * @param {Array<string>} fileNames - File names that were just processed
 */
function addProcessedFiles(fileNames) {
  if (!currentProgress) return;
  
  currentProgress.processedFileNames.push(...fileNames);
  currentProgress.processedFiles = currentProgress.processedFileNames.length;
  currentProgress.lastUpdated = new Date().toISOString();
}

/**
 * Save current progress to disk (call this periodically from a single location)
 * Uses atomic write pattern to prevent corruption
 * 
 * @returns {Promise<void>}
 */
async function saveProgressToDisk() {
  if (!currentProgress) return;
  
  // Prevent concurrent saves
  if (saveInProgress) {
    pendingSave = true;
    return;
  }
  
  saveInProgress = true;
  
  try {
    const progressPath = getProgressFilePath();
    const tempPath = progressPath + '.tmp';
    
    // Write to temp file first (atomic write pattern)
    // Add integrity hash
    const dataToSave = { ...currentProgress };
    dataToSave.integrity = calculateHash(dataToSave);
    
    await fsPromises.writeFile(tempPath, JSON.stringify(dataToSave, null, 2), 'utf8');
    
    // Check if progress was cleared while writing (race condition)
    if (!currentProgress) {
      // Clean up temp file if it exists
      try { await fsPromises.unlink(tempPath); } catch {}
      return;
    }
    
    // Rename temp to actual (atomic on most file systems)
    await fsPromises.rename(tempPath, progressPath);
    
  } catch (error) {
    // Ignore ENOENT errors during save if progress was cleared (benign race condition)
    if (error.code === 'ENOENT' && !currentProgress) {
      return;
    }
    console.error('💾 [PROGRESS] Failed to save progress:', error.message);
  } finally {
    saveInProgress = false;
    
    // If there was a pending save, do it now
    if (pendingSave) {
      pendingSave = false;
      await saveProgressToDisk();
    }
  }
}

/**
 * Legacy update function for backwards compatibility
 * 
 * @param {Array<string>} newlyProcessedFileNames - File names just processed
 * @returns {Promise<void>}
 */
async function updateProgress(newlyProcessedFileNames) {
  addProcessedFiles(newlyProcessedFileNames);
  await saveProgressToDisk();
}

/**
 * Load existing progress (if any)
 * 
 * @returns {Promise<Object|null>} Progress data or null if none exists
 */
async function loadProgress() {
  const progressPath = getProgressFilePath();
  
  try {
    if (!fs.existsSync(progressPath)) {
      return null;
    }
    
    const data = await fsPromises.readFile(progressPath, 'utf8');
    const progress = JSON.parse(data);
    
    // Verify integrity
    if (progress.integrity) {
      const calculatedHash = calculateHash(progress);
      if (calculatedHash !== progress.integrity) {
        console.error('🚨 [SECURITY] Progress file integrity check failed! File may have been tampered with.');
        // Delete corrupted file as safety measure
        await fsPromises.unlink(progressPath);
        return null;
      }
    } else {
      // For backwards compatibility or first run with new security
      console.warn('⚠️ [SECURITY] Progress file missing integrity hash. Proceeding but marking for update.');
    }
    
    // Store in memory for potential resume
    currentProgress = progress;
    
    console.log('💾 [PROGRESS] Found interrupted progress:', progress.operationId);
    console.log('   - Folder:', progress.folderPath);
    console.log('   - Processed:', progress.processedFiles, 'of', progress.totalFiles);
    
    return progress;
  } catch (error) {
    console.error('💾 [PROGRESS] Failed to load progress:', error.message);
    // If progress file is corrupted, delete it
    try {
      await fsPromises.unlink(progressPath);
      console.log('💾 [PROGRESS] Deleted corrupted progress file');
    } catch {}
    return null;
  }
}

/**
 * Clear progress file (called on successful completion)
 * 
 * @returns {Promise<void>}
 */
async function clearProgress() {
  const progressPath = getProgressFilePath();
  currentProgress = null;
  
  try {
    if (fs.existsSync(progressPath)) {
      await fsPromises.unlink(progressPath);
      console.log('💾 [PROGRESS] Cleared progress file');
    }
    // Also clean up any temp file
    const tempPath = progressPath + '.tmp';
    if (fs.existsSync(tempPath)) {
      await fsPromises.unlink(tempPath);
    }
  } catch (error) {
    console.error('💾 [PROGRESS] Failed to clear progress:', error.message);
  }
}

/**
 * Check if there's interrupted progress
 * 
 * @returns {Promise<boolean>}
 */
async function hasInterruptedProgress() {
  const progress = await loadProgress();
  return progress !== null;
}

/**
 * Get current processed count (for UI progress updates)
 * 
 * @returns {number}
 */
function getProcessedCount() {
  return currentProgress ? currentProgress.processedFiles : 0;
}

module.exports = {
  getProgressFilePath,
  startProgress,
  addProcessedFiles,
  saveProgressToDisk,
  updateProgress,
  loadProgress,
  clearProgress,
  hasInterruptedProgress,
  getProcessedCount
};
