/**
 * Progress Manager - Handles batch operation progress persistence
 * 
 * This module saves batch operation state to disk, enabling crash recovery.
 * Progress is stored in the app's userData folder.
 * 
 * IMPORTANT: Uses atomic write pattern to prevent file corruption from race conditions.
 * 
 * SECURITY: Integrity key is generated randomly per installation,
 * stored securely in userData, and not exposed in source code.
 * 
 * ENCRYPTION: When config.features.ENCRYPTION_ENABLED is true, the progress file is
 * encrypted at rest using AES-256-GCM with a key derived from the installation
 * key. This protects file paths and file lists from casual access by another
 * user on the same machine. GCM's auth tag provides both confidentiality and
 * integrity, replacing the plaintext HMAC.
 */

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const crypto = require('crypto');
const config = require('./config');
const logger = require('../utils/logger');

// Progress file location
const PROGRESS_FILE_NAME = 'batch_progress.json';
const INTEGRITY_KEY_FILE = '.integrity_key';

// Encryption constants
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;         // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16;   // 128-bit auth tag

// Cached keys (loaded once on first use)
let cachedIntegrityKey = null;
let cachedEncryptionKey = null;

/**
 * Get or create the integrity key for HMAC verification and encryption.
 * Key is generated randomly on first run and persisted in userData.
 * This prevents the key from being visible in source code.
 * 
 * @returns {string} The integrity key (hex string)
 */
function getIntegrityKey() {
  if (cachedIntegrityKey) {
    return cachedIntegrityKey;
  }
  
  const keyFilePath = path.join(app.getPath('userData'), INTEGRITY_KEY_FILE);
  
  try {
    // Try to read existing key
    cachedIntegrityKey = fs.readFileSync(keyFilePath, 'utf8').trim();
    return cachedIntegrityKey;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.warn('💾 [PROGRESS] Could not read integrity key, generating new one');
    }
  }
  
  // Generate new random key (32 bytes = 64 hex chars)
  cachedIntegrityKey = crypto.randomBytes(32).toString('hex');
  
  try {
    // Store the key (sync to ensure it's saved before use)
    fs.writeFileSync(keyFilePath, cachedIntegrityKey, { encoding: 'utf8', mode: 0o600 });
    logger.log('🔐 [SECURITY] Generated new integrity key for this installation');
  } catch (error) {
    logger.error('💾 [PROGRESS] Could not persist integrity key:', error.message);
    // Key is still usable in memory for this session
  }
  
  return cachedIntegrityKey;
}

/**
 * Derive a 256-bit encryption key from the integrity key using HKDF.
 * This ensures the encryption key is cryptographically independent from
 * the HMAC key even though both originate from the same master secret.
 * 
 * @returns {Buffer} 32-byte encryption key
 */
function getEncryptionKey() {
  if (cachedEncryptionKey) {
    return cachedEncryptionKey;
  }
  
  const masterKey = Buffer.from(getIntegrityKey(), 'hex');
  // HKDF-SHA256: derive a 32-byte key with a context label
  cachedEncryptionKey = crypto.hkdfSync(
    'sha256',
    masterKey,
    Buffer.alloc(0),                            // no salt (master key is already random)
    Buffer.from('batch-progress-encryption'),    // info/context label
    32                                           // 256 bits
  );
  
  return cachedEncryptionKey;
}

/**
 * Encrypt a JSON string using AES-256-GCM.
 * 
 * @param {string} plaintext - JSON string to encrypt
 * @returns {string} JSON string of { encrypted: true, iv, authTag, ciphertext }
 */
function encryptData(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  });
  
  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  
  return JSON.stringify({
    encrypted: true,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    ciphertext
  });
}

/**
 * Decrypt an AES-256-GCM encrypted payload.
 * The GCM auth tag provides built-in integrity verification.
 * 
 * @param {Object} envelope - { encrypted, iv, authTag, ciphertext }
 * @returns {string} Decrypted JSON string
 * @throws {Error} If decryption or authentication fails
 */
function decryptData(envelope) {
  const key = getEncryptionKey();
  const iv = Buffer.from(envelope.iv, 'hex');
  const authTag = Buffer.from(envelope.authTag, 'hex');
  
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  });
  decipher.setAuthTag(authTag);
  
  let plaintext = decipher.update(envelope.ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');
  
  return plaintext;
}

/**
 * Serialize progress data for writing to disk.
 * When encryption is enabled: encrypts the JSON.
 * When encryption is disabled: adds HMAC integrity hash.
 * 
 * @param {Object} data - Progress data to serialize
 * @returns {string} Serialized string ready for disk write
 */
function serializeForDisk(data) {
  if (config.features.ENCRYPTION_ENABLED) {
    const plaintext = JSON.stringify(data);
    return encryptData(plaintext);
  }
  
  // Plaintext mode: add HMAC integrity hash
  const dataToSave = { ...data };
  dataToSave.integrity = calculateHash(dataToSave);
  return JSON.stringify(dataToSave, null, 2);
}

/**
 * Deserialize progress data from disk.
 * Auto-detects encrypted vs plaintext format for backwards compatibility.
 * 
 * @param {string} raw - Raw file contents
 * @returns {Object} Parsed progress data
 * @throws {Error} If decryption/integrity check fails
 */
function deserializeFromDisk(raw) {
  const parsed = JSON.parse(raw);
  
  // Detect encrypted format
  if (parsed.encrypted === true && parsed.iv && parsed.authTag && parsed.ciphertext) {
    const plaintext = decryptData(parsed);
    return JSON.parse(plaintext);
  }
  
  // Plaintext format: verify HMAC integrity
  if (parsed.integrity) {
    const calculatedHash = calculateHash(parsed);
    if (calculatedHash !== parsed.integrity) {
      throw new Error('INTEGRITY_CHECK_FAILED');
    }
  } else {
    logger.warn('⚠️ [SECURITY] Progress file missing integrity hash. Proceeding but marking for update.');
  }
  
  return parsed;
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
  const operationId = Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
  
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
  
  // Write initial state to disk (encrypted or with HMAC integrity)
  const progressPath = getProgressFilePath();
  const serialized = serializeForDisk(currentProgress);
  
  await fsPromises.writeFile(progressPath, serialized, 'utf8');
  
  logger.log('💾 [PROGRESS] Started tracking progress:', operationId);
  return operationId;
}

/**
 * Recursively sort all object keys to produce a deterministic JSON string.
 * Arrays preserve order (elements are sorted internally if they are objects).
 * Primitives are returned as-is.
 * 
 * @param {*} value - Any JSON-serializable value
 * @returns {*} A deeply key-sorted clone suitable for JSON.stringify
 */
function deepSortKeys(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  
  if (Array.isArray(value)) {
    return value.map(deepSortKeys);
  }
  
  // Sort object keys alphabetically and recurse into each value
  const sorted = {};
  const keys = Object.keys(value).sort();
  for (const key of keys) {
    sorted[key] = deepSortKeys(value[key]);
  }
  return sorted;
}

/**
 * Calculate HMAC SHA-256 hash for data integrity.
 * Uses deep key sorting to ensure deterministic serialization regardless
 * of the order keys were inserted into objects (including nested ones).
 * 
 * @param {Object} data - The progress data object (without integrity field)
 * @returns {string} Hex digest of the hash
 */
function calculateHash(data) {
  // Create a copy and remove integrity field to ensure consistent hashing
  const { integrity, ...cleanData } = data;
  // Deep-sort all keys for a fully deterministic JSON string
  const jsonString = JSON.stringify(deepSortKeys(cleanData));
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
  
  for (let i = 0; i < fileNames.length; i++) {
    currentProgress.processedFileNames.push(fileNames[i]);
  }
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
    const serialized = serializeForDisk(currentProgress);
    
    await fsPromises.writeFile(tempPath, serialized, 'utf8');
    
    // Check if progress was cleared while writing (race condition)
    if (!currentProgress) {
      // Clean up temp file if it exists
      try { await fsPromises.unlink(tempPath); } catch { /* Temp file may not exist -- ignore */ }
      return;
    }
    
    // Rename temp to actual (atomic on most file systems)
    await fsPromises.rename(tempPath, progressPath);
    
  } catch (error) {
    // Ignore ENOENT errors during save if progress was cleared (benign race condition)
    if (error.code === 'ENOENT' && !currentProgress) {
      return;
    }
    logger.error('💾 [PROGRESS] Failed to save progress:', error.message);
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
 * Load existing progress (if any)
 * 
 * @returns {Promise<Object|null>} Progress data or null if none exists
 */
async function loadProgress() {
  const progressPath = getProgressFilePath();
  
  try {
    const raw = await fsPromises.readFile(progressPath, 'utf8');
    
    let progress;
    try {
      progress = deserializeFromDisk(raw);
    } catch (deserializeError) {
      if (deserializeError.message === 'INTEGRITY_CHECK_FAILED') {
        logger.error('🚨 [SECURITY] Progress file integrity check failed! File may have been tampered with.');
      } else {
        logger.error('🔐 [SECURITY] Progress file decryption failed:', deserializeError.message);
      }
      // Delete corrupted/tampered file as safety measure
      await fsPromises.unlink(progressPath);
      return null;
    }
    
    // Store in memory for potential resume
    currentProgress = progress;
    
    logger.log('💾 [PROGRESS] Found interrupted progress:', progress.operationId);
    logger.log('   - Folder:', progress.folderPath);
    logger.log('   - Processed:', progress.processedFiles, 'of', progress.totalFiles);
    
    return progress;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // No progress file exists — normal case
      return null;
    }
    logger.error('💾 [PROGRESS] Failed to load progress:', error.message);
    // If progress file is corrupted, delete it
    try {
      await fsPromises.unlink(progressPath);
      logger.log('💾 [PROGRESS] Deleted corrupted progress file');
    } catch (_unlinkErr) {
      // Ignore unlink failures
    }
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
    await fsPromises.unlink(progressPath);
    logger.log('💾 [PROGRESS] Cleared progress file');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.error('💾 [PROGRESS] Failed to clear progress:', error.message);
    }
  }
  
  // Also clean up any temp file
  try {
    await fsPromises.unlink(progressPath + '.tmp');
  } catch (_err) {
    // Temp file may not exist — ignore
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
  loadProgress,
  clearProgress,
  hasInterruptedProgress,
  getProcessedCount
};
