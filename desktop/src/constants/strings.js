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
  HISTORY_SUBTITLE: 'Move and Copy',
  HISTORY_DESCRIPTION: 'Past runs you can undo. Undo puts moved photos back, or deletes the copies a Copy run made.',
  HISTORY_EMPTY: 'No operation history yet.',
  HISTORY_EMPTY_DETAIL: 'Move and Copy runs are recorded here so you can undo them.',
  HISTORY_VALIDATE: 'Verify files are still in batch locations',
  HISTORY_UNDO: 'Undo this operation',
  HISTORY_DELETE: 'Remove this entry from history',
  HISTORY_CLEAR_ALL: 'Clear All History',
  HISTORY_CLEAR_CONFIRM: 'Delete all history entries? This cannot be undone.',
  HISTORY_BTN: 'History',
  HISTORY_SETTINGS_LABEL: 'Settings',
  HISTORY_MAX_FILES: 'Max per batch',
  HISTORY_SORT_ORDER: 'Sort',
  HISTORY_RESULT_LABEL: 'Result',
  HISTORY_MODE_MOVE: 'Move',
  HISTORY_MODE_COPY: 'Copy',
  HISTORY_MODE_COPY_TITLE: 'Copy mode: Undo deletes the copies',

  // Copy-mode Undo
  COPY_UNDO_EXECUTING_TITLE: 'Removing Copies...',
  COPY_UNDO_CONFIRM_TITLE: 'Undo This Copy?',
  COPY_UNDO_CONFIRM_WARNING: 'This deletes the copies this run made. Your original photos stay where they are.',
  COPY_UNDO_CONFIRM_NOTE: 'A copy is kept if its original is missing or either file changed after the run. Deleted copies cannot be brought back.',
  COPY_UNDO_COMPLETE_TITLE: 'Copies Removed',
  COPY_UNDO_COMPLETE_DESC: 'The copies are deleted. Your original photos were not touched.',
  COPY_UNDO_COMPLETE_KEPT: 'Copies Kept',
  COPY_UNDO_COMPLETE_KEPT_NOTE: 'Kept because the original is missing or a file changed after the run. Delete them yourself if you do not need them.',
  COPY_UNDO_COMPLETE_LOCATION: 'Originals In',
  COPY_UNDO_CANCELLED_NOTE: 'The copies made so far are still in the batch folders. Press Undo to delete them. Your originals are not touched.',
  COPY_UNDO_CANCEL_BULLET: 'In Copy mode you can undo the copies made so far on the next screen.',
  COPY_UNDO_RESUME_DESC: 'A previous undo was interrupted while deleting copies. Resume to finish removing them. Your originals are not touched.',
  COPY_UNDO_RESUME_LABEL: 'Originals in:',

  // QuickPitik Upload view (feature-flagged)
  VIEW_SORT: 'Sort',
  VIEW_UPLOAD: 'Upload',
  QP_CONNECT_TITLE: 'Connect your QuickPitik photographer account',
  QP_CONNECT_BODY: 'Connect opens quickpitik.com in your browser. Sign in there, press Connect BatchMyPhotos, and come back here.',
  QP_BTN_CONNECT: 'Connect',
  QP_CONNECTING: 'Waiting for the browser… Press Connect again if nothing opened.',
  QP_CONNECTED_AS: 'Connected as {email}',
  QP_BTN_DISCONNECT: 'Disconnect',
  QP_EVENT_HEADING: 'Which event are these photos for?',
  QP_EVENT_HELP: "Runners will find these photos on that event's page.",
  QP_EVENT_TABS_LABEL: 'Which events to show',
  QP_EVENT_TAB_OPEN: 'Open ({count})',
  QP_EVENT_TAB_UPCOMING: 'Upcoming ({count})',
  QP_EVENT_TAB_CLOSED: 'Closed ({count})',
  QP_EVENT_SEARCH_LABEL: 'Search events',
  QP_EVENT_SEARCH_PLACEHOLDER: 'Search by event name or place',
  QP_EVENTS_LOADING: 'Loading events…',
  QP_EVENTS_UPDATED: 'Updated {time}',
  QP_BTN_REFRESHING: 'Refreshing…',
  QP_NO_MATCH: 'No event matches "{query}"',
  QP_BTN_CLEAR_SEARCH: 'Clear search',
  QP_EMPTY_OPEN: 'Nothing open right now',
  QP_EMPTY_OPEN_HELP: 'Public events take photos on race day and for 3 days after; your own events for one month.',
  QP_EMPTY_UPCOMING: 'No upcoming events',
  QP_EMPTY_UPCOMING_HELP: 'Public events show here before race day.',
  QP_EMPTY_CLOSED: 'No closed events',
  QP_EMPTY_CLOSED_HELP: 'Your events, and events you uploaded to, show here after uploads close.',
  QP_EVENT_OPENS_IN: 'Uploads open in {count} days',
  QP_EVENT_OPENS_TOMORROW: 'Uploads open tomorrow',
  QP_EVENT_CLOSED_ON: 'Uploads closed on {date}',
  QP_EVENT_CLOSED: 'Uploads closed',
  QP_PAGER_LABEL: 'Event pages',
  QP_PAGE_PREV: '‹ Previous',
  QP_PAGE_NEXT: 'Next ›',
  QP_PAGE_OF: 'Page {page} of {pages}',
  QP_UPLOADING_TO: 'Uploading to',
  QP_BTN_CHANGE_EVENT: 'Change',
  QP_PICK_EVENT_HINT: 'Choose an open event, then add your shoot folder.',
  QP_DISCONNECT_TITLE: 'Disconnect from QuickPitik?',
  QP_DISCONNECT_BODY: "You'll need to connect again in your browser before your next upload. Photos you already uploaded stay on QuickPitik.",
  QP_CANCEL_UPLOAD_TITLE: 'Stop this upload?',
  QP_CANCEL_UPLOAD_BODY: 'Photos already sent stay on QuickPitik. Upload the folder again later and the app skips them.',
  QP_BTN_STOP_UPLOAD: 'Stop upload',
  QP_BTN_KEEP_UPLOADING: 'Keep uploading',
  QP_RESUME_KICKER: 'Unfinished upload',
  QP_RESUME_TITLE: 'Your upload to {event} did not finish.',
  QP_RESUME_BODY: 'Resume sends the subfolders that did not finish. Photos already on QuickPitik are skipped.',
  QP_RESUME_CLOSED: 'Uploads for {event} closed on {date}.',
  QP_RESUME_CLOSED_NO_DATE: 'Uploads for {event} are closed.',
  QP_RESUME_MISSING: 'The folder {folder} is not there. Plug the card or drive back in and press Refresh, or choose the folder again.',
  QP_BTN_DISCARD: 'Discard',
  QP_BTN_CHOOSE_AGAIN: 'Choose the folder again',
  QP_EVENT_TAG_OWN: 'Your event',
  QP_EVENT_TAG_PUBLIC: 'Public event',
  QP_EVENT_CLOSES_IN: 'Uploads close in {count} days',
  QP_EVENT_CLOSES_IN_ONE: 'Uploads close in 1 day',
  QP_EVENT_CLOSES_TODAY: 'Uploads close today',
  QP_BTN_REFRESH_EVENTS: 'Refresh',
  QP_DROP_TITLE: 'Drop your shoot folder here',
  QP_DROP_SUBTITLE: 'or click to choose a folder. Nothing on disk is moved or changed.',
  QP_SCANNING: 'Reading the folder…',
  QP_REVIEW_READY: '{count} photos ready.',
  QP_SKIP_RAW: '{count} RAW files',
  QP_SKIP_VIDEO: '{count} videos',
  QP_SKIP_HEIC: '{count} HEIC files',
  QP_SKIP_OTHER: '{count} other files',
  QP_SKIPPED_SUFFIX: ' skipped.',
  QP_REVIEW_OVERSIZE: '{count} JPEGs over 25 MB skipped.',
  QP_FOLDER_PHOTOS: '{count} photos',
  QP_BTN_UPLOAD: 'Upload {count} photos to {event}',
  QP_BTN_UPLOAD_NONE: 'Nothing to upload',
  QP_BTN_CHOOSE_EVENT: 'Choose an event first',
  QP_BTN_CHANGE_FOLDER: 'Choose another folder',
  QP_PHASE_HASHING: 'Reading photos',
  QP_PHASE_CHECKING: 'Checking what is already uploaded',
  QP_PHASE_UPLOADING: 'Uploading',
  QP_PHASE_WAITING: 'Waiting for connection',
  QP_FOLDER_PROGRESS: 'Folder {index} of {count}: {name}',
  QP_COUNTS_LIVE: '{uploaded} uploaded · {alreadyThere} already there · {failed} failed · {total} total',
  QP_BTN_CANCEL_UPLOAD: 'Cancel upload',
  QP_DONE_TITLE: 'Upload complete',
  QP_CANCELLED_TITLE: 'Upload cancelled',
  QP_STOPPED_TITLE: 'Upload stopped',
  QP_DONE: '{uploaded} uploaded. {alreadyThere} already there. {skipped} skipped. {failed} failed.',
  QP_IN_TRASH: '{count} are in your trash on quickpitik.com. Restore them there to bring them back; uploading again will not.',
  QP_SESSION_EXPIRED: 'Your QuickPitik sign-in expired. Reconnect to continue. Finished photos are kept; dropping the folder again skips them.',
  QP_BTN_RECONNECT: 'Reconnect',
  QP_FIX_ON_SITE: 'Fix this on quickpitik.com',
  QP_FAILED_HEADING: 'Could not upload',
  QP_BTN_RETRY_FAILED: 'Retry failed',
  QP_BTN_ANOTHER_FOLDER: 'Upload another folder',
  QP_TRY_AGAIN: 'Please wait a moment and try again.',
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
