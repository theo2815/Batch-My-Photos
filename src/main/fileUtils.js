/**
 * File System Utilities
 * Helpers for drive detection, file operations, and pre-execution validation
 */

const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const logger = require('../utils/logger');

/**
 * Checks if source and destination paths are on the same drive/filesystem.
 * On Windows, compares drive letters.
 * On Unix, compares device IDs from stat to detect cross-filesystem boundaries.
 * 
 * @param {string} sourcePath - Source file path
 * @param {string} destPath - Destination file path
 * @returns {Promise<boolean>} True if same drive/filesystem
 */
async function isSameDrive(sourcePath, destPath) {
  if (process.platform === 'win32') {
    const sourceDrive = path.parse(sourcePath).root.toUpperCase();
    const destDrive = path.parse(destPath).root.toUpperCase();
    return sourceDrive === destDrive;
  }
  
  // On Unix, compare device IDs to detect cross-filesystem mounts
  try {
    const [srcStat, destStat] = await Promise.all([
      fsPromises.stat(path.dirname(sourcePath)),
      fsPromises.stat(path.dirname(destPath)),
    ]);
    return srcStat.dev === destStat.dev;
  } catch (_err) {
    // If stat fails, assume different drives (safer fallback: will use copy+delete)
    return false;
  }
}

/**
 * Collect file modification stats for an array of filenames in a given folder.
 * Processes in parallel chunks to avoid overwhelming the file system.
 * 
 * @param {string[]} files - Array of file names
 * @param {string} folderPath - Path to folder containing the files
 * @param {number} [concurrency=64] - Number of parallel stat calls per chunk
 * @returns {Promise<Object>} Map of fileName -> { mtimeMs, size }
 */
async function collectFileStats(files, folderPath, concurrency = 64) {
  const fileStats = {};
  for (let i = 0; i < files.length; i += concurrency) {
    const chunk = files.slice(i, i + concurrency);
    await Promise.all(chunk.map(async (file) => {
      try {
        const stat = await fsPromises.stat(path.join(folderPath, file));
        fileStats[file] = { mtimeMs: stat.mtimeMs, size: stat.size };
      } catch (_err) {
        // Skip files that can't be stat'd
      }
    }));
  }
  return fileStats;
}

/**
 * Get available disk space for the filesystem containing the given directory.
 * Uses Node.js fs.statfs() (available since Node 18.15 / Electron 28).
 * 
 * @param {string} dirPath - Path to a directory on the target filesystem
 * @returns {Promise<Object>} { freeBytes, totalBytes } or { freeBytes: null, totalBytes: null, error }
 */
async function getDiskSpace(dirPath) {
  try {
    // Resolve to an existing directory — if dirPath doesn't exist, walk up to parent
    let targetDir = path.resolve(dirPath);
    try {
      const stat = await fsPromises.stat(targetDir);
      if (!stat.isDirectory()) {
        targetDir = path.dirname(targetDir);
      }
    } catch {
      // Directory may not exist yet (e.g., copy mode output), walk up
      targetDir = path.dirname(targetDir);
      try {
        await fsPromises.stat(targetDir);
      } catch {
        // Parent also doesn't exist — use drive root on Windows, / on Unix
        targetDir = path.parse(targetDir).root || '/';
      }
    }

    const stats = await fsPromises.statfs(targetDir);

    // statfs returns block counts: bfree = free blocks, blocks = total, bsize = block size
    const freeBytes = stats.bfree * stats.bsize;
    const totalBytes = stats.blocks * stats.bsize;

    logger.log(`💾 [DISK] Space check for "${targetDir}": ${formatBytes(freeBytes)} free of ${formatBytes(totalBytes)}`);

    return { freeBytes, totalBytes };
  } catch (error) {
    logger.warn('💾 [DISK] Failed to check disk space:', error.message);
    return { freeBytes: null, totalBytes: null, error: error.message };
  }
}

/**
 * Test write permission on a directory by creating and deleting a temp file.
 * 
 * @param {string} dirPath - Path to the directory to test
 * @returns {Promise<Object>} { writable: true } or { writable: false, error: string }
 */
async function testWritePermission(dirPath) {
  const testFileName = `._batch_permission_test_${Date.now()}`;
  const testFilePath = path.join(dirPath, testFileName);

  try {
    // Ensure the directory exists (for copy mode where output dir may not exist yet)
    let targetDir = path.resolve(dirPath);
    try {
      const stat = await fsPromises.stat(targetDir);
      if (!stat.isDirectory()) {
        return { writable: false, error: 'Path is not a directory' };
      }
    } catch {
      // Directory doesn't exist — check if we can write to its parent
      targetDir = path.dirname(targetDir);
      try {
        await fsPromises.stat(targetDir);
      } catch {
        return { writable: false, error: 'Directory and parent do not exist' };
      }
      // Test against parent directory instead
      const parentTestPath = path.join(targetDir, testFileName);
      await fsPromises.writeFile(parentTestPath, 'test', 'utf8');
      await fsPromises.unlink(parentTestPath);
      return { writable: true };
    }

    // Write a small test file
    await fsPromises.writeFile(testFilePath, 'test', 'utf8');
    // Clean up immediately
    await fsPromises.unlink(testFilePath);

    return { writable: true };
  } catch (error) {
    // Clean up just in case the file was partially created
    try { await fsPromises.unlink(testFilePath); } catch { /* ignore */ }

    logger.warn('🔒 [PERMISSION] Write test failed for:', dirPath, error.message);

    if (error.code === 'EACCES' || error.code === 'EPERM') {
      return { writable: false, error: 'Permission denied: cannot write to this folder' };
    }
    if (error.code === 'ENOSPC') {
      return { writable: false, error: 'No disk space available' };
    }
    if (error.code === 'EROFS') {
      return { writable: false, error: 'Read-only file system' };
    }
    return { writable: false, error: `Write test failed: ${error.code || error.message}` };
  }
}

/**
 * Format bytes into a human-readable string.
 * 
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted string (e.g., "1.5 GB", "847 MB")
 */
function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return 'Unknown';
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);

  return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Calculate total file size from a file stats map.
 * 
 * @param {Object} fileStats - Map of fileName -> { mtimeMs, size }
 * @returns {number} Total size in bytes
 */
function calculateTotalSize(fileStats) {
  let total = 0;
  for (const key of Object.keys(fileStats)) {
    const stat = fileStats[key];
    if (stat && typeof stat.size === 'number') {
      total += stat.size;
    }
  }
  return total;
}

/**
 * Buffer multiplier for required space estimate.
 * Accounts for filesystem overhead, metadata, and partial allocations.
 */
const SPACE_BUFFER_MULTIPLIER = 1.1; // 10% buffer

module.exports = {
  isSameDrive,
  collectFileStats,
  getDiskSpace,
  testWritePermission,
  formatBytes,
  calculateTotalSize,
  SPACE_BUFFER_MULTIPLIER
};
