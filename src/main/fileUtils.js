/**
 * File System Utilities
 * Helpers for drive detection and file operations
 */

const path = require('path');
const fs = require('fs');

/**
 * Checks if source and destination paths are on the same drive.
 * On Windows, compares drive letters. On Unix, always returns true.
 * 
 * @param {string} sourcePath - Source file path
 * @param {string} destPath - Destination file path
 * @returns {boolean} True if same drive/filesystem
 */
function isSameDrive(sourcePath, destPath) {
  if (process.platform === 'win32') {
    const sourceDrive = path.parse(sourcePath).root.toUpperCase();
    const destDrive = path.parse(destPath).root.toUpperCase();
    return sourceDrive === destDrive;
  }
  return true;
}

/**
 * Synchronous Move: Uses fs.renameSync which is O(1) for same-drive
 * @param {string} sourcePath 
 * @param {string} destPath 
 */
function syncMove(sourcePath, destPath) {
  fs.renameSync(sourcePath, destPath);
}

module.exports = {
  isSameDrive,
  syncMove
};
