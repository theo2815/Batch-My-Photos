/**
 * BatchMyPhotos - Preload Script (Context Bridge)
 * 
 * This script creates a secure bridge between the Electron main process
 * and the React renderer process. It exposes specific functions to the
 * renderer without giving it full access to Node.js APIs.
 * 
 * The renderer can access these functions via window.electronAPI
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Opens a native folder selection dialog
   * @returns {Promise<string|null>} Selected folder path or null if cancelled
   */
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  
  /**
   * Scans a folder and analyzes file groups
   * Groups files by base name to identify pairs (e.g., JPG + RAW)
   * 
   * @param {string} folderPath - Absolute path to the folder to scan
   * @returns {Promise<Object>} Scan results including file groups and statistics
   */
  scanFolder: (folderPath) => ipcRenderer.invoke('scan-folder', folderPath),
  
  /**
   * Previews how batches will be created without moving any files
   * Use this to show a confirmation dialog before execution
   * 
   * @param {string} folderPath - Absolute path to the source folder
   * @param {number} maxFilesPerBatch - Maximum files per batch folder
   * @param {string} [sortBy='name-asc'] - Sort order for files
   * @returns {Promise<Object>} Preview results including batch count and sizes
   */
  previewBatches: (folderPath, maxFilesPerBatch, sortBy = 'name-asc', excludeGroups = null) => 
    ipcRenderer.invoke('preview-batches', { folderPath, maxFilesPerBatch, sortBy, excludeGroups }),
  
  /**
   * Executes the batch splitting operation
   * Moves or copies files into numbered subfolders while keeping file pairs together
   * 
   * @param {string} folderPath - Absolute path to the source folder
   * @param {number} maxFilesPerBatch - Maximum files per batch folder
   * @param {string} outputPrefix - Prefix for batch folder names (e.g., "Batch" -> "Batch_001")
   * @param {string} mode - 'move' (default, instant) or 'copy' (preserves originals)
   * @param {string} outputDir - Optional output directory (for copy mode)
   * @param {string} [sortBy='name-asc'] - Sort order for files
   * @returns {Promise<Object>} Execution results
   */
  executeBatch: (folderPath, maxFilesPerBatch, outputPrefix, mode = 'move', outputDir = null, sortBy = 'name-asc', blurryGroups = null) =>
    ipcRenderer.invoke('execute-batch', { folderPath, maxFilesPerBatch, outputPrefix, mode, outputDir, sortBy, blurryGroups }),
  
  /**
   * Opens a folder selection dialog for output folder (used in copy mode)
   * @returns {Promise<string|null>} Selected folder path or null if cancelled
   */
  selectOutputFolder: () => ipcRenderer.invoke('select-output-folder'),

  /**
   * Register a dropped folder path as allowed for file operations
   * Call this before scanning a folder that was dropped via drag & drop
   * 
   * @param {string} folderPath - Path to the dropped folder
   * @returns {Promise<Object>} Result with success status
   */
  registerDroppedFolder: (folderPath) => ipcRenderer.invoke('register-dropped-folder', folderPath),
  
  /**
   * Listen for batch progress updates during execution
   * 
   * @param {Function} callback - Called with progress updates { current, total, folderName }
   * @returns {Function} Cleanup function to remove the listener
   */
  onBatchProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('batch-progress', listener);
    
    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('batch-progress', listener);
    };
  },
  
  /**
   * Cancel the current batch operation
   * Files already processed will remain, but no more will be moved/copied
   * 
   * @returns {Promise<Object>} Result with success status
   */
  cancelBatch: () => ipcRenderer.invoke('cancel-batch'),

  // ============================================================================
  // BLUR DETECTION APIs
  // ============================================================================

  /**
   * Analyze images in a folder for blur using Laplacian variance.
   * Processes JPEG/PNG files only (one per file group).
   * 
   * @param {string} folderPath - Path to the folder to analyze
   * @param {string} [threshold='moderate'] - Sensitivity: 'strict' | 'moderate' | 'lenient'
   * @returns {Promise<Object>} { success, blurResults, totalAnalyzed, blurryCount, totalGroups }
   */
  analyzeBlur: (folderPath, threshold = 'moderate') =>
    ipcRenderer.invoke('analyze-blur', { folderPath, threshold }),

  /**
   * Listen for blur analysis progress updates
   * 
   * @param {Function} callback - Called with { current, total }
   * @returns {Function} Cleanup function to remove the listener
   */
  onBlurProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('blur-progress', listener);
    return () => {
      ipcRenderer.removeListener('blur-progress', listener);
    };
  },

  // ============================================================================
  // UX IMPROVEMENT FUNCTIONS
  // ============================================================================
  
  /**
   * Open a folder in the system file explorer
   * @param {string} folderPath - Path to open
   */
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  
  /**
   * Get list of recently used folders
   * @returns {Promise<string[]>} Array of folder paths
   */
  getRecentFolders: () => ipcRenderer.invoke('get-recent-folders'),
  
  /**
   * Add a folder to the recent folders list
   * @param {string} folderPath - Path to add
   * @returns {Promise<string[]>} Updated list of recent folders
   */
  addRecentFolder: (folderPath) => ipcRenderer.invoke('add-recent-folder', folderPath),
  
  /**
   * Get current theme setting
   * @returns {Promise<string>} 'dark' or 'light'
   */
  getTheme: () => ipcRenderer.invoke('get-theme'),
  
  /**
   * Set theme
   * @param {string} theme - 'dark' or 'light'
   */
  setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),
  
  /**
   * Get all saved presets
   * @returns {Promise<Array>} List of presets
   */
  getPresets: () => ipcRenderer.invoke('get-presets'),

  /**
   * Save a new preset
   * @param {string} name - Preset name
   * @param {Object} settings - Settings object
   * @returns {Promise<boolean>} Success status
   */
  savePreset: (name, settings) => ipcRenderer.invoke('save-preset', { name, settings }),

  /**
   * Delete a preset
   * @param {string} name - Preset name to delete
   * @returns {Promise<boolean>} Success status
   */
  deletePreset: (name) => ipcRenderer.invoke('delete-preset', name),
  
  /**
   * Get image thumbnails for preview
   * @param {string} folderPath - Path to folder containing images
   * @param {string[]} fileNames - Array of file names to get thumbnails for
   * @returns {Promise<Object>} Map of fileName -> base64DataUrl
   */
  getThumbnails: (folderPath, fileNames) => 
    ipcRenderer.invoke('get-thumbnails', { folderPath, fileNames }),

  /**
   * Get a medium-resolution preview image for modal viewing
   * @param {string} folderPath - Path to folder containing the image
   * @param {string} fileName - File name to preview
   * @returns {Promise<Object>} { success, dataUrl, width, height } or { success: false, error }
   */
  getImagePreview: (folderPath, fileName) =>
    ipcRenderer.invoke('get-image-preview', { folderPath, fileName }),
  
  /**
   * Clean up stale recent folders that no longer exist
   * Call this on app startup to ensure the recent folders list is valid
   * @returns {Promise<string[]>} Updated list of valid recent folders
   */
  cleanupRecentFolders: () => ipcRenderer.invoke('cleanup-recent-folders'),
  
  // ============================================================================
  // PROGRESS PERSISTENCE APIs
  // ============================================================================
  
  /**
   * Check if there's an interrupted batch operation from a previous session
   * @returns {Promise<Object|null>} Progress summary or null if none exists
   */
  checkInterruptedProgress: () => ipcRenderer.invoke('check-interrupted-progress'),
  
  /**
   * Clear interrupted progress (user chose to discard)
   * @returns {Promise<Object>} Result with success status
   */
  clearInterruptedProgress: () => ipcRenderer.invoke('clear-interrupted-progress'),
  
  /**
   * Resume an interrupted batch operation
   * @returns {Promise<Object>} Execution results
   */
  resumeBatch: () => ipcRenderer.invoke('resume-batch'),

  // ============================================================================
  // STORAGE & MAINTENANCE APIs
  // ============================================================================

  /**
   * Get information about the application cache
   * @returns {Promise<Object>} { sizeBytes, sizeStr, path }
   */
  getCacheInfo: () => ipcRenderer.invoke('get-cache-info'),

  /**
   * Clear the application cache
   * @returns {Promise<Object>} Success status
   */
  clearCache: () => ipcRenderer.invoke('clear-cache'),

  // ============================================================================
  // UNDO/ROLLBACK APIs
  // ============================================================================

  /**
   * Check if rollback (undo) is available for the last batch operation
   * @returns {Promise<Object|null>} Rollback info if available, null otherwise
   */
  checkRollbackAvailable: () => ipcRenderer.invoke('check-rollback-available'),

  /**
   * Execute rollback - move files back to original locations
   * @returns {Promise<Object>} Rollback result
   */
  rollbackBatch: () => ipcRenderer.invoke('rollback-batch'),

  /**
   * Clear the rollback manifest (user dismissed undo option)
   * @returns {Promise<Object>} Success status
   */
  clearRollbackManifest: () => ipcRenderer.invoke('clear-rollback-manifest'),

  /**
   * Listen for rollback progress updates during execution
   * @param {Function} callback - Called with progress updates
   * @returns {Function} Cleanup function to remove the listener
   */
  onRollbackProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('rollback-progress', listener);
    
    return () => {
      ipcRenderer.removeListener('rollback-progress', listener);
    };
  },

  // ============================================================================
  // PRE-EXECUTION SAFETY CHECK APIs
  // ============================================================================

  /**
   * Validate execution environment before starting a batch operation.
   * Checks disk space sufficiency and write permissions on the target directory.
   * 
   * @param {string} folderPath - Source folder path
   * @param {string} mode - 'move' or 'copy'
   * @param {string|null} outputDir - Output directory (for copy mode)
   * @returns {Promise<Object>} Validation result { success, diskSpace, permissions, warnings }
   */
  validateExecution: (folderPath, mode, outputDir) =>
    ipcRenderer.invoke('validate-execution', { folderPath, mode, outputDir }),

  // ============================================================================
  // OPERATION HISTORY APIs
  // ============================================================================

  /**
   * Get the list of past batch operations
   * @returns {Promise<Array>} Array of operation history summaries
   */
  getOperationHistory: () => ipcRenderer.invoke('get-operation-history'),

  /**
   * Validate a history entry before rollback
   * Checks if files are still at their expected batch locations
   * @param {string} operationId - Operation ID to validate
   * @returns {Promise<Object>} Validation result { valid, checked, found, missing }
   */
  validateHistoryEntry: (operationId) => ipcRenderer.invoke('validate-history-entry', operationId),

  /**
   * Rollback a specific history entry
   * Loads the manifest from disk and moves files back to original locations
   * @param {string} operationId - Operation ID to rollback
   * @returns {Promise<Object>} Rollback result
   */
  rollbackHistoryEntry: (operationId) => ipcRenderer.invoke('rollback-history-entry', operationId),

  /**
   * Delete a specific history entry
   * @param {string} operationId - Operation ID to delete
   * @returns {Promise<Object>} Result with success status
   */
  deleteHistoryEntry: (operationId) => ipcRenderer.invoke('delete-history-entry', operationId),

  /**
   * Clear all operation history
   * @returns {Promise<Object>} Result with success status and entries cleared count
   */
  clearOperationHistory: () => ipcRenderer.invoke('clear-operation-history'),
});

// Log when preload script is loaded (helpful for debugging)
console.log('BatchMyPhotos preload script loaded');

