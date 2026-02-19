const { autoUpdater } = require("electron-updater");
const { ipcMain, app } = require("electron");
const logger = require("../utils/logger");

// Configure logging
autoUpdater.logger = logger;
autoUpdater.autoDownload = false; // Let user decide, or set to true for background download

/**
 * Initialize the auto-update mechanism
 * @param {Function} getMainWindow - Function to get the main browser window
 */
function initAutoUpdater(getMainWindow) {
  // 1. CHECK ENVIRONMENT: If running as a Windows Store app, DISABLE auto-updates.
  // The Store handles updates automatically.
  if (process.windowsStore) {
    logger.log("🏪 [UPDATER] Running in Microsoft Store environment - Auto-updater DISABLED.");
    return;
  }

  logger.log("🚀 [UPDATER] Initializing auto-updater for direct download version...");

  // 2. SETUP EVENT LISTENERS
  
  // Checking for update
  autoUpdater.on("checking-for-update", () => {
    logger.log("🔍 [UPDATER] Checking for updates...");
    sendToWindow(getMainWindow(), "update-status", { status: "checking" });
  });

  // Update available
  autoUpdater.on("update-available", (info) => {
    logger.log("✨ [UPDATER] Update available:", info.version);
    sendToWindow(getMainWindow(), "update-status", { 
      status: "available", 
      version: info.version,
      releaseNotes: info.releaseNotes 
    });
  });

  // Update not available
  autoUpdater.on("update-not-available", (_info) => {
    logger.log("✅ [UPDATER] App is up to date.");
    sendToWindow(getMainWindow(), "update-status", { status: "not-available" });
  });

  // Error
  autoUpdater.on("error", (err) => {
    logger.error("❌ [UPDATER] Error:", err.message);
    sendToWindow(getMainWindow(), "update-status", { status: "error", error: err.message });
  });

  // Download Progress
  autoUpdater.on("download-progress", (progressObj) => {
    const logMessage = "Download speed: " + progressObj.bytesPerSecond;
    logger.log("⬇️ [UPDATER] " + logMessage + ' - Downloaded ' + progressObj.percent + '%');
    sendToWindow(getMainWindow(), "update-status", { 
      status: "downloading", 
      progress: progressObj.percent 
    });
  });

  // Update downloaded
  autoUpdater.on("update-downloaded", (info) => {
    logger.log("📦 [UPDATER] Update downloaded:", info.version);
    sendToWindow(getMainWindow(), "update-status", { 
      status: "downloaded", 
      version: info.version 
    });
  });

  // 3. SETUP IPC HANDLERS
  
  // User manually triggering check
  ipcMain.handle("check-for-updates", async () => {
    if (process.windowsStore) return { status: "disabled-store" };
    
    try {
      logger.log("manual check for updates");
      await autoUpdater.checkForUpdates();
      return { status: "checking" };
    } catch (error) {
      logger.error("Failed to check for updates", error);
      return { status: "error", error: error.message };
    }
  });

  // User triggering download
  ipcMain.handle("download-update", async () => {
    if (process.windowsStore) return;
    autoUpdater.downloadUpdate();
  });

  // User triggering install
  ipcMain.handle("install-update", () => {
    if (process.windowsStore) return;
    autoUpdater.quitAndInstall();
  });

  // 4. INITIAL CHECK
  // Check for updates shortly after startup (skip for Store builds)
  if (!process.windowsStore && app.isPackaged) {
      setTimeout(() => {
        autoUpdater.checkForUpdates();
      }, 3000);
  }
}

function sendToWindow(window, channel, ...args) {
  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, ...args);
  }
}

module.exports = { initAutoUpdater };
