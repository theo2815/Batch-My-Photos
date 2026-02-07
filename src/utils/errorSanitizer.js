/**
 * Error Sanitizer
 * 
 * Maps internal errors to user-friendly messages before sending to the renderer.
 * Full error details are logged server-side for debugging; only safe messages
 * are exposed to the UI.
 * 
 * This prevents leaking internal paths, system details, or implementation
 * specifics to the renderer process.
 */

const logger = require('./logger');

/**
 * Map of known error codes to user-friendly messages.
 * Keys are Node.js/system error codes.
 */
const ERROR_CODE_MAP = {
  ENOENT: 'File or folder not found. It may have been moved or deleted.',
  EACCES: 'Permission denied. Check that you have access to this folder.',
  EPERM: 'Operation not permitted. The file may be in use or read-only.',
  ENOSPC: 'Not enough disk space to complete the operation.',
  EMFILE: 'Too many files open. Please close some applications and try again.',
  ENFILE: 'System file limit reached. Please close some applications and try again.',
  EBUSY: 'The file or folder is in use by another process.',
  EEXIST: 'A file or folder with that name already exists.',
  EISDIR: 'Expected a file but found a directory.',
  ENOTDIR: 'Expected a directory but found a file.',
  EXDEV: 'Cannot move files across different drives in this mode.',
};

/**
 * Map of known error message patterns to user-friendly messages.
 * Used when error.code is not set but the message is recognizable.
 */
const ERROR_MESSAGE_PATTERNS = [
  { pattern: /access denied/i, message: 'Access denied. The folder was not selected through the app.' },
  { pattern: /not selected through dialog/i, message: 'Access denied. Please select the folder using the app.' },
  { pattern: /copy verification failed/i, message: 'File copy verification failed. Please try again.' },
];

/** Default message for unexpected errors */
const DEFAULT_ERROR_MESSAGE = 'An unexpected error occurred. Please try again.';

/**
 * Sanitize an error for safe transmission to the renderer.
 * Logs the full error details server-side and returns a user-friendly message.
 * 
 * @param {Error|string} error - The caught error
 * @param {string} [context] - Optional context label for logging (e.g. "scan-folder")
 * @returns {string} A user-friendly error message safe to show in the UI
 */
function sanitizeError(error, context = '') {
  // Log full error details server-side (always, even in production)
  const prefix = context ? `[${context}]` : '[IPC]';
  logger.error(`${prefix} Error:`, error);
  
  // Handle string errors
  if (typeof error === 'string') {
    // Check if the string itself is already a known safe message
    for (const { pattern, message } of ERROR_MESSAGE_PATTERNS) {
      if (pattern.test(error)) return message;
    }
    // For access-denied messages from our own security layer, pass through
    if (error.startsWith('Access denied:')) {
      return 'Access denied. Please select the folder using the app.';
    }
    return DEFAULT_ERROR_MESSAGE;
  }
  
  // Handle Error objects
  if (error && typeof error === 'object') {
    // 1. Check error.code (most reliable for Node.js filesystem errors)
    if (error.code && ERROR_CODE_MAP[error.code]) {
      return ERROR_CODE_MAP[error.code];
    }
    
    // 2. Check error.message against known patterns
    if (error.message) {
      for (const { pattern, message } of ERROR_MESSAGE_PATTERNS) {
        if (pattern.test(error.message)) return message;
      }
      // Pass through our own access-denied messages
      if (error.message.startsWith('Access denied:')) {
        return 'Access denied. Please select the folder using the app.';
      }
    }
  }
  
  return DEFAULT_ERROR_MESSAGE;
}

module.exports = { sanitizeError };
