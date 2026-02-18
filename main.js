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
const path = require('path');

// Register custom protocol for local media access
// Must be done before app.on('ready')
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { secure: true, supportFetchAPI: true, standard: true } }
]);

// Register batchmyphotos:// as default protocol client (deep link auth)
// In development, pass the script path so Electron handles the protocol
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('batchmyphotos', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('batchmyphotos');
}

const fs = require('fs');
const os = require('os');
const { Readable } = require('stream');
const Store = require('electron-store');
const { createWindow, getMainWindow } = require('./src/main/windowManager');
const { registerIpcHandlers } = require('./src/main/ipcHandlers');
const { isPathAllowedAsync } = require('./src/main/securityManager');
const authService = require('./src/main/authService');
const logger = require('./src/utils/logger');

// ============================================================================
// CACHE CONFIGURATION (Windows Permission Fix)
// ============================================================================
// Set cache to temp directory to avoid Windows permission errors
const cachePath = path.join(os.tmpdir(), 'BatchMyPhotos-cache');
try {
  fs.mkdirSync(cachePath, { recursive: true });
} catch (_err) {
  // Directory already exists or permission issue — non-fatal
}
app.setPath('cache', cachePath);
logger.log('💾 [CACHE] Set cache path to:', cachePath);

// ============================================================================
// PERSISTENT STATE MANAGEMENT
// ============================================================================
// Initialize electron-store for persistent user preferences and session data.
// No encryption key needed — preferences (theme, recent folders) are non-sensitive.
//
// Migration: Old versions used a hardcoded encryptionKey which produced binary
// data in the JSON file. Without that key, electron-store fails to parse it.
// Delete the old file if it exists so we start fresh with defaults.
let store;
try {
  store = new Store({
    projectName: 'BatchMyPhotos',
    defaults: {
      theme: 'dark',
      recentFolders: [],
    },
  });
} catch (_err) {
  logger.warn('⚠️ [STORE] Old encrypted preferences store is unreadable — deleting and starting fresh');
  const storeFile = path.join(app.getPath('userData'), 'config.json');
  try { fs.unlinkSync(storeFile); } catch (_e) { /* file may not exist */ }
  store = new Store({
    projectName: 'BatchMyPhotos',
    defaults: {
      theme: 'dark',
      recentFolders: [],
    },
  });
}

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
// DEEP LINK AUTHENTICATION (batchmyphotos:// protocol)
// ============================================================================

/**
 * Handle deep link URL from browser-based authentication.
 * Expected format: batchmyphotos://auth/callback?token=XXX&email=YYY
 *
 * SECURITY: Verifies the token against the backend before saving the session
 * to prevent forged deep links from injecting invalid tokens.
 */
async function handleDeepLink(url) {
  logger.log('[DEEP-LINK] Received URL:', url);

  try {
    const parsed = new URL(url);

    // Only handle auth callback path
    if (parsed.hostname !== 'auth' || parsed.pathname !== '/callback') {
      logger.warn('[DEEP-LINK] Ignoring unknown deep link path:', parsed.hostname, parsed.pathname);
      return;
    }

    const token = parsed.searchParams.get('token');
    const email = parsed.searchParams.get('email');
    const name = parsed.searchParams.get('name');

    if (!token || !email) {
      logger.error('[DEEP-LINK] Missing token or email in callback URL');
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('auth-callback', { success: false, error: 'Invalid callback: missing token or email' });
      }
      return;
    }

    // SECURITY: Verify the token is valid before trusting it
    const verification = await authService.verifySession(token);
    if (!verification.valid) {
      logger.warn('[DEEP-LINK] Token verification failed — refusing to save session');
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('auth-callback', { success: false, error: 'Invalid or expired token' });
      }
      return;
    }

    // Token verified — save session
    authService.saveSession(token, { email: decodeURIComponent(email), name: decodeURIComponent(name || '') });

    // Notify the renderer process
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auth-callback', {
        success: true,
        email: decodeURIComponent(email),
        name: decodeURIComponent(name || ''),
      });

      // Focus the window so user sees the app is now authenticated
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }

    logger.log('[DEEP-LINK] Auth callback processed successfully for:', email);
  } catch (err) {
    logger.error('[DEEP-LINK] Failed to parse deep link URL:', err.message);
  }
}

// ============================================================================
// SINGLE-INSTANCE LOCK (required for Windows deep link handling)
// ============================================================================
// When the OS opens a deep link, it launches a new app instance.
// The single-instance lock ensures only one instance runs — the second
// instance passes its argv (containing the deep link URL) to the first.

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running — quit this one
  app.quit();
} else {
  // Handle when a second instance is launched (e.g., via deep link click)
  app.on('second-instance', (_event, argv) => {
    // On Windows, the deep link URL is in argv
    const deepLinkUrl = argv.find(arg => arg.startsWith('batchmyphotos://'));
    if (deepLinkUrl) {
      handleDeepLink(deepLinkUrl);
    }

    // Focus existing window
    const mainWindow = getMainWindow();
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ============================================================================
// APP LIFECYCLE
// ============================================================================

app.whenReady().then(() => {
  // Handle media:// protocol to serve local files securely
  protocol.handle('media', async (request) => {
    // 1. Strip protocol (media:// or media:///)
    const filePath = request.url.replace(/^media:\/\/+/, '');
    
    // 2. Decode to get raw path (handles %20 for spaces, etc.)
    let decodedPath = decodeURIComponent(filePath);
    
    // 3. Windows-specific fix: remove leading slash before drive letter
    if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(decodedPath)) {
      decodedPath = decodedPath.slice(1);
    }
    
    // 4. Normalize path to use correct OS separators (fixes mixed / and \)
    decodedPath = path.normalize(decodedPath);
    
    logger.debug('🔍 [MEDIA] Serving:', decodedPath);

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
      return new Response('Not Found', { status: 404 });
    }
  });
  
  createWindow();

  // Handle cold-start deep link (app was launched by clicking a deep link)
  const deepLinkUrl = process.argv.find(arg => arg.startsWith('batchmyphotos://'));
  if (deepLinkUrl) {
    // Small delay to ensure the window is ready to receive IPC messages
    setTimeout(() => handleDeepLink(deepLinkUrl), 1000);
  }
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
// AUTO UPDATER (Hybrid Strategy: Disabled for Store, Enabled for Direct)
// ============================================================================
const { initAutoUpdater } = require('./src/main/updateManager');

app.whenReady().then(() => {
  // Initialize auto-updater (it will check process.windowsStore internally)
  initAutoUpdater(getMainWindow);
});

// ============================================================================
// IPC HANDLERS REGISTRATION
// ============================================================================

// Register all IPC handlers from the handlers module
registerIpcHandlers(ipcMain, store, getMainWindow, appState);

logger.log('✅ [IPC] All handlers registered successfully');
