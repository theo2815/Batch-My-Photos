/**
 * PhotoBatcher - Electron Main Process
 * 
 * Performance Optimized Version
 * - Asynchronous File Scanning
 * - Non-blocking "Smart Yielding" for large datasets (100k+ files)
 * - Concurrency-Limited Batch Execution
 */

// OPTIMIZATION: Increase Thread Pool for Windows File Operations
// Prevents "stalled" moves when Explorer locks files for thumbnails
process.env.UV_THREADPOOL_SIZE = 128;
console.log('🚀 [STARTUP] UV_THREADPOOL_SIZE set to:', process.env.UV_THREADPOOL_SIZE);

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const Store = require('electron-store');

// Initialize persistent storage for settings
const store = new Store({
  defaults: {
    recentFolders: [],
    theme: 'dark'
  }
});

// Keep a global reference of the window to prevent garbage collection
let mainWindow;

/**
 * Create the main application window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 500,
    icon: path.join(__dirname, 'src', 'images', 'app_icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#1a1a2e',
    show: false,
  });

  const distPath = path.join(__dirname, 'dist', 'index.html');
  const hasDistBuild = fs.existsSync(distPath);
  
  if (hasDistBuild) {
    mainWindow.loadFile(distPath);
  } else {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// ============================================================================
// PERFORMANCE HELPERS
// ============================================================================

/**
 * Yield to the main event loop to keep UI responsive.
 * Uses setImmediate to allow other I/O and UI events to process.
 */
const yieldToMain = () => new Promise(resolve => setImmediate(resolve));

// ============================================================================
// IPC HANDLERS
// ============================================================================

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Source Folder',
  });
  
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  
  return result.filePaths[0];
});

ipcMain.handle('select-output-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Output Folder for Batches',
  });
  
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  
  return result.filePaths[0];
});

/**
 * Handler: Scan folder and analyze file groups
 * OPTIMIZED: Uses fs.promises and yields for responsiveness
 */
ipcMain.handle('scan-folder', async (event, folderPath) => {
  try {
    // 1. Async Read Directory
    const entries = await fsPromises.readdir(folderPath, { withFileTypes: true });
    
    // 2. Filter files
    const files = [];
    for (const entry of entries) {
      if (entry.isFile()) {
        files.push(entry.name);
      }
    }
    
    // 3. Group files with yielding for large sets
    const fileGroups = await groupFilesByBaseName(files);
    
    const totalFiles = files.length;
    const totalGroups = Object.keys(fileGroups).length;
    // OPTIMIZATION: Use reduce instead of spread (...) to avoid stack overflow on >65k groups
    const largestGroup = Object.values(fileGroups).reduce((max, group) => Math.max(max, group.length), 0);
    
    return {
      success: true,
      folderPath,
      totalFiles,
      totalGroups,
      largestGroup,
      fileGroups,
    };
  } catch (error) {
    console.error("Scan Error:", error);
    return {
      success: false,
      error: error.message,
    };
  }
});

/**
 * Handler: Execute the batch splitting operation
 * OPTIMIZED: Uses concurrency pool instead of batch chunks
 */
ipcMain.handle('execute-batch', async (event, { folderPath, maxFilesPerBatch, outputPrefix, mode = 'move', outputDir = null }) => {
  console.time('TOTAL_BATCH_EXECUTION');
  const START_TIME = Date.now();
  try {
    // Re-scan to get clean state
    const entries = await fsPromises.readdir(folderPath, { withFileTypes: true });
    const files = entries.filter(entry => entry.isFile()).map(entry => entry.name);
    
    // Recalculate batches
    const fileGroups = await groupFilesByBaseName(files);
    const batches = await calculateBatches(fileGroups, maxFilesPerBatch);
    
    const baseOutputDir = (mode === 'copy' && outputDir) ? outputDir : folderPath;
    
    // Create all batch folders first (fast operation)
    // Yield periodically to prevent UI freeze during folder creation
    // Create all batch folders first (Parallel Optimized)
    // Process in chunks to prevent file handle exhaustion
    console.time('FOLDER_CREATION');
    const FOLDER_CONCURRENCY = 20;
    for (let i = 0; i < batches.length; i += FOLDER_CONCURRENCY) {
        const chunkPromises = [];
        for (let j = 0; j < FOLDER_CONCURRENCY && (i + j) < batches.length; j++) {
            const batchIndex = i + j;
            const batchFolderName = `${outputPrefix}_${String(batchIndex + 1).padStart(3, '0')}`;
            const batchFolderPath = path.join(baseOutputDir, batchFolderName);
            chunkPromises.push(fsPromises.mkdir(batchFolderPath, { recursive: true }));
        }
        await Promise.all(chunkPromises);
    }
    console.timeEnd('FOLDER_CREATION');

    // OPTIMIZATION: Concurrency limits
    // Both Move and Copy now use Copy logic (Move = Copy + Delete)
    // 50 is the safe limit for Copy operations
    const MAX_CONCURRENCY = 50;
    
    let processedFiles = 0;
    const totalFiles = files.length;
    let lastProgressTime = 0;
    
    // Flatten the work into a single array of operations
    // Yield periodically during this heavy synchronous calculation
    const operations = [];
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batchFiles = batches[batchIndex];
        const batchFolderName = `${outputPrefix}_${String(batchIndex + 1).padStart(3, '0')}`;
        const batchFolderPath = path.join(baseOutputDir, batchFolderName);
      
        for (const fileName of batchFiles) {
            operations.push({
                fileName,
                sourcePath: path.join(folderPath, fileName),
                destPath: path.join(batchFolderPath, fileName),
                batchIndex
            });
        }
        
        if (batchIndex % 20 === 0) await yieldToMain();
    }

    // HIGH-PERFORMANCE WORKER POOL (Cursor-based)
    let opCursor = 0;
    
    const worker = async () => {
      while (opCursor < operations.length) {
        // Atomic "pop" of the next task index
        const opIndex = opCursor++; 
        // Safety check
        if (opIndex >= operations.length) break;
        
        const op = operations[opIndex];
        
        try {
          if (mode === 'copy') {
            await fsPromises.copyFile(op.sourcePath, op.destPath);
          } else {
            // OPTIMIZATION: "Move" implemented as Copy + Delete
            // This bypasses the slow fs.rename on Windows (Antivirus/Explorer locking)
            await fsPromises.copyFile(op.sourcePath, op.destPath);
            await fsPromises.unlink(op.sourcePath);
          }
        } catch (err) {
          // Collect errors instead of silent fail
          // We attach them to the result for debugging
          if (!global.batchErrors) global.batchErrors = [];
          global.batchErrors.push({ file: op.fileName, error: err.message });
        }
        
        processedFiles++;
        // Progress reporting is handled by the main loop interval
      }
    };

    // Start workers
    const workers = [];
    const threadCount = Math.min(MAX_CONCURRENCY, operations.length);
    for (let i = 0; i < threadCount; i++) {
        workers.push(worker());
    }

    // DECOUPLED PROGRESS LOOP
    console.time('FILE_MOVING');
    
    // Updates UI exactly 5 times per second (preventing IPC flood)
    const progressInterval = setInterval(() => {
        const currentBatch = Math.floor((processedFiles / totalFiles) * batches.length);
        event.sender.send('batch-progress', {
            current: currentBatch,
            total: batches.length,
            processedFiles,
            totalFiles
        });
    }, 200);

    await Promise.all(workers);
    
    // Cleanup interval and send final 100% status
    clearInterval(progressInterval);
    event.sender.send('batch-progress', {
        current: batches.length,
        total: batches.length,
        processedFiles: totalFiles,
        totalFiles
    });
    
    console.timeEnd('FILE_MOVING');
    console.timeEnd('TOTAL_BATCH_EXECUTION');

    return {
      success: true,
      batchesCreated: batches.length,
      results: batches.map((b, i) => ({ 
        folder: `${outputPrefix}_${String(i + 1).padStart(3, '0')}`,
        fileCount: b.length 
      })),
      outputDir: baseOutputDir,
      hasErrors: global.batchErrors && global.batchErrors.length > 0,
      errorCount: global.batchErrors ? global.batchErrors.length : 0
    };
    
    // Clean up global errors after reporting
    if (global.batchErrors) delete global.batchErrors;
    
    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
});

/**
 * Handler: Calculate batch preview
 * OPTIMIZED: async + yielding
 */
ipcMain.handle('preview-batches', async (event, { folderPath, maxFilesPerBatch }) => {
  try {
    const entries = await fsPromises.readdir(folderPath, { withFileTypes: true });
    const files = entries.filter(entry => entry.isFile()).map(entry => entry.name);
    
    const fileGroups = await groupFilesByBaseName(files);
    const batches = await calculateBatches(fileGroups, maxFilesPerBatch);
    
    const oversizedGroups = Object.entries(fileGroups)
      .filter(([name, files]) => files.length > maxFilesPerBatch)
      .map(([name, files]) => ({ name, count: files.length }));
    
    // Only send the first 50 batches detailed data to avoid IPC payload limit on huge datasets
    const batchDetails = batches.slice(0, 50).map((batch, index) => ({
      batchNumber: index + 1,
      fileCount: batch.length,
      sampleFiles: batch.slice(0, 5),
      hasMore: batch.length > 5
    }));
    
    return {
      success: true,
      batchCount: batches.length,
      batchSizes: batches.map(b => b.length),
      batchDetails,
      oversizedGroups,
      totalFiles: files.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
});

// ============================================================================
// CORE ALGORITHMS (OPTIMIZED)
// ============================================================================

/**
 * Optimized grouping with yielding for loop responsiveness
 */
async function groupFilesByBaseName(files) {
  const groups = {};
  const YIELD_THRESHOLD = 5000; // Yield every 5000 files
  
  for (let i = 0; i < files.length; i++) {
    const fileName = files[i];
    const lastDotIndex = fileName.lastIndexOf('.');
    const baseName = lastDotIndex > 0 
      ? fileName.substring(0, lastDotIndex) 
      : fileName;
    
    if (!groups[baseName]) {
      groups[baseName] = [];
    }
    groups[baseName].push(fileName);
    
    // Safety yield for huge folders
    if (i % YIELD_THRESHOLD === 0 && i > 0) {
      await yieldToMain();
    }
  }
  
  return groups;
}

/**
 * Optimized batch calculation
 */
async function calculateBatches(fileGroups, maxFilesPerBatch) {
  const groupsArray = Object.entries(fileGroups);
  
  // Sort by group size (descending)
  groupsArray.sort((a, b) => b[1].length - a[1].length);
  
  const batches = [];
  const batchCounts = [];
  const YIELD_THRESHOLD = 2000;
  
  for (let i = 0; i < groupsArray.length; i++) {
    const [baseName, files] = groupsArray[i];
    const groupSize = files.length;
    
    let placed = false;
    // Iterate backwards - optimization heuristic: 
    // New batches are at the end, likely to have space.
    for (let j = batches.length - 1; j >= 0; j--) {
      if (batchCounts[j] + groupSize <= maxFilesPerBatch) {
        // Safe push without spread for large groups
        for (const f of files) batches[j].push(f);
        batchCounts[j] += groupSize;
        placed = true;
        break;
      }
    }
    
    if (!placed) {
      batches.push([...files]);
      batchCounts.push(groupSize);
    }
    
    if (i % YIELD_THRESHOLD === 0 && i > 0) {
      await yieldToMain();
    }
  }
  
  return batches;
}

// ============================================================================
// UX HELPERS
// ============================================================================

ipcMain.handle('open-folder', async (event, folderPath) => {
  try {
    await shell.openPath(folderPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-recent-folders', async () => store.get('recentFolders', []));

ipcMain.handle('add-recent-folder', async (event, folderPath) => {
  let recentFolders = store.get('recentFolders', []);
  recentFolders = recentFolders.filter(f => f !== folderPath);
  recentFolders.unshift(folderPath);
  recentFolders = recentFolders.slice(0, 5);
  store.set('recentFolders', recentFolders);
  return recentFolders;
});

ipcMain.handle('get-theme', async () => store.get('theme', 'dark'));

ipcMain.handle('set-theme', async (event, theme) => {
  store.set('theme', theme);
  return theme;
});
