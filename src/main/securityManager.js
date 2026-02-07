/**
 * Security Manager
 * Handles path validation, input sanitization, and permission management
 * 
 * SECURITY FIX: Added symlink/junction protection using fs.realpath()
 * to prevent attackers from escaping allowed directories via symlinks.
 */

const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const config = require('./config');

/**
 * Registry of user-selected folders that are allowed to be accessed.
 * Paths are only added when the user explicitly selects them via dialog.
 * 
 * SECURITY NOTE: This Set is intentionally NOT persisted across sessions.
 * On restart, users must re-select folders, following the principle of
 * least privilege. This prevents stale permissions to folders the user
 * may have removed access to.
 * 
 * Stores REAL paths (symlinks resolved) for accurate comparison.
 */
const allowedPaths = new Set();

/**
 * Cache for resolved real paths to avoid repeated fs.realpath calls.
 * Cleared when new paths are registered.
 */
const realPathCache = new Map();

/**
 * Validates that a path is within a user-selected allowed directory.
 * ASYNC VERSION with SYMLINK PROTECTION.
 * 
 * Uses fs.realpath() to resolve symlinks/junctions to their actual paths,
 * preventing attackers from escaping allowed directories via symbolic links.
 * 
 * @param {string} targetPath - The path to validate
 * @returns {Promise<boolean>} True if the path is allowed
 */
async function isPathAllowedAsync(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') {
    return false;
  }
  
  try {
    // Check cache first
    if (realPathCache.has(targetPath)) {
      const cachedRealPath = realPathCache.get(targetPath);
      return checkPathAgainstAllowed(cachedRealPath);
    }
    
    // Resolve symlinks/junctions to get the REAL filesystem path
    // This prevents symlink attacks where a link points outside allowed dirs
    const realPath = await fsPromises.realpath(targetPath);
    
    // Cache the resolved path (cache is cleared when new paths are registered)
    realPathCache.set(targetPath, realPath);
    
    return checkPathAgainstAllowed(realPath);
  } catch (error) {
    // Path doesn't exist or permission denied - deny access
    console.warn('🔒 [SECURITY] Path validation failed:', targetPath, error.code);
    return false;
  }
}

/**
 * Helper function to check a resolved real path against allowed paths.
 * 
 * @param {string} realPath - Already resolved real path
 * @returns {boolean} True if the path is within an allowed directory
 */
function checkPathAgainstAllowed(realPath) {
  const normalizedTarget = path.normalize(realPath).toLowerCase();
  
  for (const allowedPath of allowedPaths) {
    const normalizedAllowed = path.normalize(allowedPath).toLowerCase();
    
    // Check if target is the allowed path itself or a subdirectory
    if (normalizedTarget === normalizedAllowed || 
        normalizedTarget.startsWith(normalizedAllowed + path.sep.toLowerCase())) {
      return true;
    }
  }
  
  return false;
}

/**
 * Registers a user-selected path as allowed for file operations.
 * Resolves symlinks to store the real path for accurate security checks.
 * 
 * @param {string} selectedPath - Path selected by user via dialog
 */
function registerAllowedPath(selectedPath) {
  if (selectedPath && typeof selectedPath === 'string') {
    // Clear the cache when new paths are registered
    realPathCache.clear();
    
    // Try to resolve symlinks synchronously for immediate registration
    try {
      const realPath = fs.realpathSync(selectedPath);
      allowedPaths.add(realPath);
      console.log('🔒 [SECURITY] Registered allowed path (resolved):', realPath);
    } catch (error) {
      // Fall back to resolved path if realpath fails
      allowedPaths.add(path.resolve(selectedPath));
      console.log('🔒 [SECURITY] Registered allowed path:', selectedPath);
    }
  }
}

/**
 * Sanitizes the output prefix to prevent path traversal.
 * Removes path separators and dangerous characters.
 * 
 * @param {string} prefix - User-provided prefix
 * @returns {string} Sanitized prefix safe for folder names
 */
function sanitizeOutputPrefix(prefix) {
  if (!prefix || typeof prefix !== 'string') {
    return 'Batch';
  }
  
  // Remove path separators and dangerous characters
  const sanitized = prefix
    .replace(/[\\/:*?"<>|]/g, '') // Remove Windows/Unix forbidden chars
    .replace(/\.\./g, '')         // Remove directory traversal sequences
    .trim()
    .substring(0, 50);            // Limit length
  
  // Return default if sanitized result is empty
  return sanitized.length > 0 ? sanitized : 'Batch';
}

/**
 * Validates and bounds maxFilesPerBatch to prevent DoS.
 * Uses centralized limits from config.
 * 
 * @param {any} value - User-provided value
 * @returns {number} Valid value between 1 and MAX_FILES_PER_BATCH_CEILING
 */
function validateMaxFilesPerBatch(value) {
  const num = parseInt(value, 10);
  
  if (isNaN(num) || num < 1) {
    console.warn('🔒 [SECURITY] Invalid maxFilesPerBatch, using default:', value);
    return config.limits.DEFAULT_FILES_PER_BATCH;
  }
  
  if (num > config.limits.MAX_FILES_PER_BATCH_CEILING) {
    console.warn('🔒 [SECURITY] maxFilesPerBatch too high, clamping to', config.limits.MAX_FILES_PER_BATCH_CEILING, ':', value);
    return config.limits.MAX_FILES_PER_BATCH_CEILING;
  }
  
  return num;
}

module.exports = {
  isPathAllowedAsync,
  registerAllowedPath,
  sanitizeOutputPrefix,
  validateMaxFilesPerBatch
};
