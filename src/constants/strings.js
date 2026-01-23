/**
 * UI Strings Constants
 * 
 * Centralized location for all user-facing text strings.
 * This makes it easier to:
 * - Maintain consistent messaging
 * - Update text in one place
 * - Add i18n/localization in the future
 */

export const STRINGS = {
  // App Header
  APP_TITLE: 'Batch My Photos',
  APP_SUBTITLE: 'Organize your photos into batch folders',
  
  // Drop Zone
  DROP_ZONE_TITLE: 'Drop a Folder Here',
  DROP_ZONE_SUBTITLE: 'or click to browse',
  
  // Recent Folders
  RECENT_FOLDERS_TITLE: 'Recent Folders',
  NO_RECENT_FOLDERS: 'No recent folders',
  
  // Settings Panel
  SETTINGS_MAX_FILES: 'Max Files Per Batch',
  SETTINGS_FOLDER_NAME: 'Folder Name',
  SETTINGS_MODE: 'Mode',
  SETTINGS_OUTPUT_LOCATION: 'Output Location',
  
  // Modes
  MODE_MOVE: 'Move (Fast)',
  MODE_COPY: 'Copy (Safe)',
  MODE_MOVE_DESC: 'Moves files to new folders',
  MODE_COPY_DESC: 'Copies files, keeping originals',
  
  // Buttons
  BTN_PROCEED: 'Proceed',
  BTN_CANCEL: 'Cancel',
  BTN_CONFIRM: 'Confirm',
  BTN_START_BATCHING: 'Start Batching',
  BTN_OPEN_FOLDER: 'Open Folder',
  BTN_BATCH_ANOTHER: 'Batch Another Folder',
  BTN_RESET: 'Start Over',
  BTN_RESUME: 'Resume',
  BTN_DISCARD: 'Discard & Start Fresh',
  BTN_RELOAD: 'Reload App',
  BTN_TRY_AGAIN: 'Try Again',
  
  // Status Messages
  STATUS_SCANNING: 'Scanning folder...',
  STATUS_PROCESSING: 'Processing files...',
  STATUS_COMPLETE: 'Complete!',
  STATUS_CANCELLED: 'Operation cancelled',
  
  // Confirmation Modal
  CONFIRM_TITLE: 'Confirm Batch Settings',
  CONFIRM_BATCHES: 'Batches to Create',
  
  // Cancel Modal
  CANCEL_TITLE: 'Cancel Operation?',
  CANCEL_MESSAGE: 'Are you sure you want to stop the current batch operation?',
  CANCEL_WARNING: 'Files already processed will remain in their new locations.',
  
  // Resume Modal
  RESUME_TITLE: 'Resume Interrupted Operation?',
  RESUME_MESSAGE: 'A previous batch operation was interrupted.',
  RESUME_PROGRESS: 'Progress',
  
  // Errors
  ERROR_TITLE: 'Something went wrong',
  ERROR_GENERIC: 'An unexpected error occurred',
  ERROR_FILES_SAFE: "Don't worry, your files are safe. Try reloading the app.",
  ERROR_FOLDER_NOT_FOUND: 'Folder not found. It may have been moved or deleted.',
  ERROR_PERMISSION_DENIED: 'Permission denied. Check folder permissions.',
  ERROR_DISK_SPACE: 'Not enough disk space to complete the operation.',
  ERROR_DROP_FILE: 'Please drop a folder, not a file. Select a folder containing your images.',
  ERROR_ACCESS_DENIED: 'Access denied: folder not selected through dialog',
  
  // Complete Screen
  COMPLETE_TITLE: 'Batch Complete!',
  COMPLETE_CANCELLED_TITLE: 'Operation Stopped',
  COMPLETE_BATCHES: 'Batches Created',
  COMPLETE_FILES: 'Files Processed',
  COMPLETE_OUTPUT: 'Output Location',
  
  // Footer
  FOOTER_PAIRING: 'Smart file pairing keeps your JPG + RAW files together',
  FOOTER_CONTACT: 'If you have any questions, issues, or suggestions, feel free to email us at',
  FOOTER_EMAIL: 'batchmyphotos@gmail.com',
  
  // Validation
  VALIDATION_MAX_FILES_REQUIRED: 'Please enter the maximum number of files per batch folder.',
  VALIDATION_MAX_FILES_RANGE: 'Max files per batch must be between 1 and 10,000.',
  VALIDATION_FOLDER_REQUIRED: 'Please enter a folder name for the batch folders.',
};

/**
 * Format a string with placeholders
 * Usage: formatString(STRINGS.COMPLETE_FILES, { count: 100 })
 * 
 * @param {string} template - The template string with {key} placeholders
 * @param {Object} values - Object with key-value pairs to replace
 * @returns {string} Formatted string
 */
export function formatString(template, values) {
  return template.replace(/{(\w+)}/g, (match, key) => 
    values.hasOwnProperty(key) ? values[key] : match
  );
}

export default STRINGS;
