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

const { app, ipcMain } = require('electron');
const path = require('path');

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
const SecureStore = require('./src/main/secureStore');
const { createWindow, getMainWindow } = require('./src/main/windowManager');
const { registerIpcHandlers } = require('./src/main/ipcHandlers');
const authService = require('./src/main/authService');
const deviceService = require('./src/main/deviceService');
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
// Initialize SecureStore for persistent user preferences and session data.
// All data is encrypted via OS keychain (safeStorage / Windows DPAPI) so
// technical users cannot edit the JSON file to bypass limits.
//
// Migration: SecureStore automatically migrates existing plain-text JSON
// into an encrypted blob on first access after this upgrade.
let store;
try {
  store = new SecureStore({
    name: 'config',
    defaults: {
      theme: 'light',
      recentFolders: [],
    },
  });
} catch (_err) {
  logger.warn('⚠️ [STORE] Preferences store unreadable — deleting and starting fresh');
  const storeFile = path.join(app.getPath('userData'), 'config.json');
  try { fs.unlinkSync(storeFile); } catch (_e) { /* file may not exist */ }
  store = new SecureStore({
    name: 'config',
    defaults: {
      theme: 'light',
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
    const refreshToken = parsed.searchParams.get('refresh_token');
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
    // allowRefresh:false — a forged token must never be validated by the real user's stored refresh token
    // Never save a token we could not verify — rejected OR unreachable.
    // The user just had a browser open, so a retry when online costs one click.
    const verification = await authService.verifySession(token, { allowRefresh: false });
    if (!verification.valid) {
      logger.warn('[DEEP-LINK] Token not verified — refusing to save session', verification.networkError ? '(backend unreachable)' : '(rejected)');
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('auth-callback', {
          success: false,
          error: verification.networkError
            ? 'Could not verify your login — check your connection and try again'
            : 'Invalid or expired token',
        });
      }
      return;
    }

    authService.saveSession(token, {
      email: decodeURIComponent(email),
      name: decodeURIComponent(name || ''),
    });

    // Store refresh token for persistent sessions (silent re-auth on JWT expiry)
    if (refreshToken) {
      authService.saveRefreshToken(refreshToken);
    }

    // Start device heartbeat after successful authentication
    deviceService.startHeartbeat(() => authService.getStoredSession());

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

// ============================================================================
// CRASH DIAGNOSTICS
// ============================================================================
// logger → electron-log: these also land in %APPDATA%/Batch My Photos/logs/main.log
process.on('uncaughtException', (err) => logger.error('💥 [MAIN] Uncaught exception:', err));
process.on('unhandledRejection', (reason) => logger.error('💥 [MAIN] Unhandled rejection:', reason));
app.on('render-process-gone', (_event, webContents, details) => {
  logger.error('💥 [RENDERER] Process gone:', details.reason, 'exit code', details.exitCode);
  if (details.reason !== 'clean-exit' && !webContents.isDestroyed()) webContents.reload();
});

app.whenReady().then(() => {
  const mainWindow = createWindow();

  // Start device heartbeat if user is already authenticated
  if (authService.getStoredSession()) {
    logger.log('💓 [STARTUP] Starting device heartbeat for existing session');
    deviceService.startHeartbeat(() => authService.getStoredSession());
  }

  // Handle cold-start deep link (app was launched by clicking a deep link)
  // once the renderer has loaded and registered its auth-callback listener
  const deepLinkUrl = process.argv.find(arg => arg.startsWith('batchmyphotos://'));
  if (deepLinkUrl) {
    mainWindow.webContents.once('did-finish-load', () => handleDeepLink(deepLinkUrl));
  }
}).catch((err) => logger.error('💥 [STARTUP] whenReady failed:', err));

app.on('window-all-closed', () => {
  // Stop heartbeat when all windows close
  deviceService.stopHeartbeat();
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
}).catch((err) => logger.error('💥 [UPDATER] init failed:', err));

// ============================================================================
// IPC HANDLERS REGISTRATION
// ============================================================================

// Register all IPC handlers from the handlers module
registerIpcHandlers(ipcMain, store, getMainWindow, appState);

logger.log('✅ [IPC] All handlers registered successfully');
