/**
 * BatchMyPhotos - Electron Main Process (Conductor)
 * 
 * This is the application conductor that orchestrates:
 * - App lifecycle (startup, window management, shutdown)
 * - Persistent state (store, preferences)
 * - IPC handler registration
 * 
 * All IPC handlers have been extracted to src/main/ipcHandlers.js
 * All business logic lives in specialized modules:
 *   - src/main/batchEngine.js (batch splitting algorithm)
 *   - src/main/fileUtils.js (file operations)
 *   - src/main/securityManager.js (path validation)
 *   - src/main/windowManager.js (window lifecycle)
 */

// OPTIMIZATION: Thread Pool for Windows File Operations
// Balanced value: high enough for concurrency, low enough for memory efficiency
process.env.UV_THREADPOOL_SIZE = 64;
console.log('🚀 [STARTUP] UV_THREADPOOL_SIZE set to:', process.env.UV_THREADPOOL_SIZE);

const { app, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Store = require('electron-store');
const { createWindow, getMainWindow } = require('./src/main/windowManager');
const { registerIpcHandlers } = require('./src/main/ipcHandlers');

// ============================================================================
// CACHE CONFIGURATION (Windows Permission Fix)
// ============================================================================
// Set cache to temp directory to avoid Windows permission errors
const cachePath = path.join(os.tmpdir(), 'BatchMyPhotos-cache');
if (!fs.existsSync(cachePath)) {
  fs.mkdirSync(cachePath, { recursive: true });
}
app.setPath('cache', cachePath);
console.log('💾 [CACHE] Set cache path to:', cachePath);

// ============================================================================
// PERSISTENT STATE MANAGEMENT
// ============================================================================
// Initialize electron-store for persistent user preferences and session data
const store = new Store({
  projectName: 'BatchMyPhotos',
  defaults: {
    theme: 'dark',
    recentFolders: [],
  },
});

// ============================================================================
// APPLICATION STATE
// ============================================================================
// Batch cancellation state - shared across all IPC handlers
const appState = {
  batchCancelled: false,
  resetBatchCancellation() {
    this.batchCancelled = false;
  }
};

// ============================================================================
// APP LIFECYCLE
// ============================================================================

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (getMainWindow() === null) {
    createWindow();
  }
});

// ============================================================================
// IPC HANDLERS REGISTRATION
// ============================================================================

// Register all IPC handlers from the handlers module
registerIpcHandlers(ipcMain, store, getMainWindow, appState);

console.log('✅ [IPC] All handlers registered successfully');
