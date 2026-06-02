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
  
  // Safety Check
  SAFETY_TITLE: 'Pre-Execution Safety Check',
  SAFETY_CHECKING: 'Checking environment...',
  SAFETY_DISK_OK: 'available',
  SAFETY_DISK_FAIL: 'Not enough disk space',
  SAFETY_DISK_SKIPPED: 'Same-drive move — no extra space needed',
  SAFETY_PERM_OK: 'Write access confirmed',
  SAFETY_PERM_FAIL: 'Cannot write to output folder',
  SAFETY_NETWORK_WARN: 'Network drive — space estimate may be approximate',
  SAFETY_PROCEED_ANYWAY: 'Proceed Anyway',
  SAFETY_GO_BACK: 'Go Back',
  SAFETY_ALL_PASSED: 'All checks passed',

  // Undo Complete Screen
  UNDO_COMPLETE_TITLE: 'Undoing Batches Complete!',
  UNDO_COMPLETE_DESC: 'All files have been restored to their original location.',
  UNDO_COMPLETE_FILES: 'Files Restored',
  UNDO_COMPLETE_FOLDERS_REMOVED: 'Batch Folders Removed',
  UNDO_COMPLETE_LOCATION: 'Restored To',
  UNDO_COMPLETE_OPEN: 'Open in Explorer',
  UNDO_COMPLETE_ANOTHER: 'Process Another Folder',

  // History Undo Confirmation
  HISTORY_UNDO_CONFIRM_TITLE: 'Undo This Operation?',
  HISTORY_UNDO_CONFIRM_DESC: 'This will move all files back to their original location.',
  HISTORY_UNDO_CONFIRM_NOTE: 'The batch folders will be removed if they are empty after restoration.',
  HISTORY_UNDO_CONFIRM_BTN: 'Yes, Undo',

  // Operation History
  HISTORY_TITLE: 'Operation History',
  HISTORY_SUBTITLE: 'Move Mode Only',
  HISTORY_DESCRIPTION: 'Past Move mode batch operations that can be undone. Copy mode operations are not tracked here because original files are preserved.',
  HISTORY_EMPTY: 'No operation history yet.',
  HISTORY_EMPTY_DETAIL: 'Only Move mode operations are recorded here. Copy mode preserves originals, so no undo is needed.',
  HISTORY_VALIDATE: 'Verify files are still in batch locations',
  HISTORY_UNDO: 'Undo this operation and restore files',
  HISTORY_DELETE: 'Remove this entry from history',
  HISTORY_CLEAR_ALL: 'Clear All History',
  HISTORY_CLEAR_CONFIRM: 'Delete all history entries? This cannot be undone.',
  HISTORY_BTN: 'History',
  HISTORY_SETTINGS_LABEL: 'Settings',
  HISTORY_MAX_FILES: 'Max per batch',
  HISTORY_SORT_ORDER: 'Sort',
  HISTORY_RESULT_LABEL: 'Result',
  HISTORY_MODE_MOVE: 'Move',
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
    Object.hasOwn(values, key) ? values[key] : match
  );
}

export default STRINGS;
