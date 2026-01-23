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
   * @returns {Promise<Object>} Preview results including batch count and sizes
   */
  previewBatches: (folderPath, maxFilesPerBatch) => 
    ipcRenderer.invoke('preview-batches', { folderPath, maxFilesPerBatch }),
  
  /**
   * Executes the batch splitting operation
   * Moves or copies files into numbered subfolders while keeping file pairs together
   * 
   * @param {string} folderPath - Absolute path to the source folder
   * @param {number} maxFilesPerBatch - Maximum files per batch folder
   * @param {string} outputPrefix - Prefix for batch folder names (e.g., "Batch" -> "Batch_001")
   * @param {string} mode - 'move' (default, instant) or 'copy' (preserves originals)
   * @param {string} outputDir - Optional output directory (for copy mode)
   * @returns {Promise<Object>} Execution results
   */
  executeBatch: (folderPath, maxFilesPerBatch, outputPrefix, mode = 'move', outputDir = null) =>
    ipcRenderer.invoke('execute-batch', { folderPath, maxFilesPerBatch, outputPrefix, mode, outputDir }),
  
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
});

// Log when preload script is loaded (helpful for debugging)
console.log('PhotoBatcher preload script loaded');

