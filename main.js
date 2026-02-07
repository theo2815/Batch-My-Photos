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
const { UV_THREADPOOL_SIZE } = require('./src/main/constants');
process.env.UV_THREADPOOL_SIZE = UV_THREADPOOL_SIZE;
console.log('🚀 [STARTUP] UV_THREADPOOL_SIZE set to:', process.env.UV_THREADPOOL_SIZE);

const { app, ipcMain, protocol } = require('electron');
const { pathToFileURL } = require('url');

// Register custom protocol for local media access
// Must be done before app.on('ready')
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { secure: true, supportFetchAPI: true, bypassCSP: true, standard: true } }
]);

const path = require('path');
const fs = require('fs');
const os = require('os');
const { Readable } = require('stream');
const Store = require('electron-store');
const { createWindow, getMainWindow } = require('./src/main/windowManager');
const { registerIpcHandlers } = require('./src/main/ipcHandlers');
const { isPathAllowedAsync } = require('./src/main/securityManager');
const logger = require('./src/utils/logger');

// ============================================================================
// CACHE CONFIGURATION (Windows Permission Fix)
// ============================================================================
// Set cache to temp directory to avoid Windows permission errors
const cachePath = path.join(os.tmpdir(), 'BatchMyPhotos-cache');
if (!fs.existsSync(cachePath)) {
  fs.mkdirSync(cachePath, { recursive: true });
}
app.setPath('cache', cachePath);
logger.log('💾 [CACHE] Set cache path to:', cachePath);

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

app.whenReady().then(() => {
  // Handle media:// protocol to serve local files securely
  protocol.handle('media', async (request) => {
    // 1. Strip protocol (media:// or media:///)
    let filePath = request.url.replace(/^media:\/\/+/, '');
    
    // 2. Decode to get raw path (handles %20 for spaces, etc.)
    let decodedPath = decodeURIComponent(filePath);
    
    // 3. Windows-specific fix: remove leading slash before drive letter
    if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(decodedPath)) {
      decodedPath = decodedPath.slice(1);
    }
    
    // 4. Normalize path to use correct OS separators (fixes mixed / and \)
    decodedPath = path.normalize(decodedPath);
    
    logger.debug('🔍 [MEDIA] Serving:', decodedPath);

    // 5. Convert to proper file URL matches standard URL encoding (spaces -> %20, etc.)
    // This ensures net.fetch can find the file even if path has special characters
    const fileUrl = pathToFileURL(decodedPath).href;

    // SECURITY FIX: Validate path is within allowed directories
    if (!(await isPathAllowedAsync(decodedPath))) {
      logger.warn('🔒 [SECURITY] Media request blocked for unregistered path:', decodedPath);
      return new Response('Access Denied', { status: 403 });
    }

    try {
      // PROPOSE FIX: Use Node.js fs directly instead of net.fetch for reliability
      // MEMORY FIX: Use createReadStream to avoid loading entire file into RAM using fs.promises.readFile
      const stream = fs.createReadStream(decodedPath);
      
      // Convert Node stream to Web Stream for Response
      const webStream = Readable.toWeb(stream);

      // Simple mime type detection
      const ext = path.extname(decodedPath).toLowerCase();
      let mimeType = 'application/octet-stream';
      if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      else if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.webp') mimeType = 'image/webp';
      else if (ext === '.gif') mimeType = 'image/gif';
      
      return new Response(webStream, {
        headers: { 
          'Content-Type': mimeType
        }
      });
    } catch (e) {
      logger.error('❌ [MEDIA] Error serving file:', decodedPath, e.message);
      return new Response('Not Found: ' + e.message, { status: 404 });
    }
  });
  
  createWindow();
});

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

logger.log('✅ [IPC] All handlers registered successfully');
