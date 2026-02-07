/**
 * Window Manager
 * Handles the creation and management of the main application window
 */

const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const logger = require('../utils/logger');
const config = require('./config');

// Keep a global reference of the window to prevent garbage collection
let mainWindow = null;

// The root of the project (assuming we are in src/main)
const PROJECT_ROOT = path.resolve(__dirname, '../../');

// Set cache path to temp directory to avoid permission issues on Windows
const cachePath = path.join(os.tmpdir(), 'BatchMyPhotos-cache');

/**
 * Create the main application window
 * @returns {BrowserWindow} The created window instance
 */
function createWindow() {
  if (mainWindow) {
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 500,
    autoHideMenuBar: true, // Hide the default File/Edit/View/Window/Help menu bar
    icon: path.join(PROJECT_ROOT, 'src', 'images', 'app_icon.png'),
    webPreferences: {
      preload: path.join(PROJECT_ROOT, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true, // SECURITY: Sandboxes the renderer — safe because preload only uses contextBridge
      v8Code: false, // Disable V8 code cache to avoid Windows permission errors
    },
    backgroundColor: '#1a1a2e',
    show: false,
  });

  const distPath = path.join(PROJECT_ROOT, 'dist', 'index.html');
  const hasDistBuild = fs.existsSync(distPath);
  
  // SECURITY FIX: Robust detection for all scenarios:
  // 1. Packaged app (config.isProduction = true) → Always use dist build
  // 2. npm run electron with dist build → Use dist build  
  // 3. npm run start (Vite dev server) → Use localhost:5173
  const isPackaged = config.isProduction;
  const shouldUseDistBuild = isPackaged || hasDistBuild;
  
  if (shouldUseDistBuild) {
    // Production mode or npm run electron with dist: Load built files
    mainWindow.loadFile(distPath);
    logger.log('📦 [PROD] Running in production mode');
    
    // Only open DevTools if NOT packaged (for debugging npm run electron)
    if (!isPackaged) {
      mainWindow.webContents.openDevTools();
      logger.log('🔧 [DEV] DevTools enabled for unpackaged mode');
    }
  } else {
    // Development mode: Use Vite dev server
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
    logger.log('🔧 [DEV] Running in development mode with DevTools');
  }

  // SECURITY: Apply Content Security Policy headers
  // This protects against XSS attacks by restricting where resources can load from
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    // Different CSP for dev vs prod:
    // - Dev: Allow localhost and unsafe-eval for Vite HMR
    // - Prod: Strict policy, only allow self
    const cspPolicy = shouldUseDistBuild && isPackaged
      ? "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: file: media:; font-src 'self' data:;"
      : "default-src 'self' http://localhost:*; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:*; style-src 'self' 'unsafe-inline' http://localhost:*; img-src 'self' data: file: media: http://localhost:*; font-src 'self' data: http://localhost:*; connect-src 'self' http://localhost:* ws://localhost:*;";
    
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspPolicy]
      }
    });
  });
  
  if (isPackaged) {
    console.log('🔒 [SECURITY] CSP headers enabled (strict mode)');
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  return mainWindow;
}

/**
 * Get the current main window instance
 * @returns {BrowserWindow|null}
 */
function getMainWindow() {
  return mainWindow;
}

module.exports = {
  createWindow,
  getMainWindow
};
