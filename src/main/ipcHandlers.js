/**
 * IPC Handlers Module - "The Nervous System"
 * Centralized handler registration for all renderer-to-main communication
 * 
 * This module organizes all IPC handlers into 5 logical groups:
 * 1. Folder Selection & Registration
 * 2. Core Operations (scan, execute, preview)
 * 3. File System Operations
 * 4. Preferences & Persistence
 * 5. Batch Management & Recovery
 */

const { ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;

// Import logic modules
const progressManager = require('../../progressManager');
const rollbackManager = require('../../rollbackManager');
const logger = require('../utils/logger');
const { groupFilesByBaseName, calculateBatches, yieldToMain } = require('./batchEngine');
const exifService = require('./exifService');
const { isSameDrive, syncMove, calculateDirSize } = require('./fileUtils');
const { isPathAllowed, isPathAllowedAsync, registerAllowedPath, sanitizeOutputPrefix, validateMaxFilesPerBatch } = require('./securityManager');

/**
 * Main export: Register all IPC handlers
 * @param {Object} ipcInstance - Electron's ipcMain object
 * @param {Store} storeInstance - Electron store instance for persistence
 * @param {Function} getMainWindow - Function to get the main window
 * @param {Object} appState - App state object { batchCancelled, resetBatchCancellation }
 */
function registerIpcHandlers(ipcInstance, storeInstance, getMainWindow, appState) {
  
  registerFolderHandlers(ipcInstance, storeInstance, getMainWindow);
  registerCoreHandlers(ipcInstance, getMainWindow, appState);
  registerFileSystemHandlers(ipcInstance, getMainWindow);
  registerPreferenceHandlers(ipcInstance, storeInstance);
  registerBatchHandlers(ipcInstance, storeInstance, getMainWindow, appState);
  registerRollbackHandlers(ipcInstance, getMainWindow, appState);

}

// ============================================================================
// GROUP 1: FOLDER SELECTION & REGISTRATION (3 handlers)
// ============================================================================

function registerFolderHandlers(ipcMain, store, getMainWindow) {
  
  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      properties: ['openDirectory'],
      title: 'Select Source Folder',
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    
    // Register this user-selected path as allowed
    registerAllowedPath(result.filePaths[0]);
    
    return result.filePaths[0];
  });

  ipcMain.handle('select-output-folder', async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Output Folder for Batches',
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    
    // Register this user-selected path as allowed
    registerAllowedPath(result.filePaths[0]);
    
    return result.filePaths[0];
  });

  /**
   * Handler: Register a dropped folder path as allowed
   * This is called when a user drops a folder via drag & drop.
   * We verify it's a valid directory before allowing access.
   */
  ipcMain.handle('register-dropped-folder', async (event, folderPath) => {
    try {
      if (!folderPath || typeof folderPath !== 'string') {
        return { success: false, error: 'Invalid folder path' };
      }
      
      // Normalize the path
      const normalizedPath = path.resolve(folderPath);
      
      // Verify it exists and is a directory
      const stats = await fsPromises.stat(normalizedPath);
      if (!stats.isDirectory()) {
        return { success: false, error: 'Path is not a directory' };
      }
      
      // Register the path as allowed
      registerAllowedPath(normalizedPath);
      
      return { success: true, path: normalizedPath };
    } catch (error) {
      console.error('Failed to register dropped folder:', error);
      return { success: false, error: error.message };
    }
  });
}

// ============================================================================
// GROUP 2: CORE OPERATIONS (3 handlers)
// ============================================================================

function registerCoreHandlers(ipcMain, getMainWindow, appState) {
  
  /**
   * Handler: Scan folder and analyze file groups
   * OPTIMIZED: Uses fs.promises and yields for responsiveness
   */
  ipcMain.handle('scan-folder', async (event, folderPath) => {
    try {
      // SECURITY: Validate path is allowed (with symlink protection)
      if (!(await isPathAllowedAsync(folderPath))) {
        console.warn('🔒 [SECURITY] Blocked access to unregistered path:', folderPath);
        return {
          success: false,
          error: 'Access denied: folder not selected through dialog',
        };
      }
      
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
        // NOTE: fileGroups intentionally NOT returned here to reduce IPC payload
        // The renderer only needs aggregate stats; preview-batches will recalculate groups when needed
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
  ipcMain.handle('execute-batch', async (event, { folderPath, maxFilesPerBatch, outputPrefix, mode = 'move', outputDir = null, sortBy = 'name-asc' }) => {
    console.time('TOTAL_BATCH_EXECUTION');
    const START_TIME = Date.now();
    try {
      // SECURITY: Validate paths are allowed (with symlink protection)
      if (!(await isPathAllowedAsync(folderPath))) {
        console.warn('🔒 [SECURITY] Blocked execute-batch on unregistered path:', folderPath);
        return { success: false, error: 'Access denied: source folder not selected through dialog' };
      }
      if (outputDir && !(await isPathAllowedAsync(outputDir))) {
        console.warn('🔒 [SECURITY] Blocked execute-batch on unregistered output path:', outputDir);
        return { success: false, error: 'Access denied: output folder not selected through dialog' };
      }
      
      // SECURITY: Sanitize inputs
      const safePrefix = sanitizeOutputPrefix(outputPrefix);
      const safeMaxFiles = validateMaxFilesPerBatch(maxFilesPerBatch);
      
      // Reset cancellation flag at start of new operation
      appState.resetBatchCancellation();
      
      // Re-scan to get clean state
      const entries = await fsPromises.readdir(folderPath, { withFileTypes: true });
      const files = entries.filter(entry => entry.isFile()).map(entry => entry.name);
      
      // Collect stats if sorting by date or exif
      let fileStats = null;
      if (sortBy.startsWith('date')) {
        console.log('📊 [SORT] Collecting file stats for date sorting...');
        fileStats = {};
        // Process in parallel with concurrency limit
        const STAT_CONCURRENCY = 50;
        for (let i = 0; i < files.length; i += STAT_CONCURRENCY) {
          const chunk = files.slice(i, i + STAT_CONCURRENCY);
          await Promise.all(chunk.map(async (file) => {
            try {
              const stat = await fsPromises.stat(path.join(folderPath, file));
              fileStats[file] = { mtimeMs: stat.mtimeMs, size: stat.size };
            } catch (err) {
              // Ignore stat errors, use default 0
            }
          }));
        }
      } else if (sortBy.startsWith('exif')) {
        // Use EXIF service for date taken
        fileStats = await exifService.extractExifDates(files, folderPath);
      }
      
      // Recalculate batches with user's sort preference
      const fileGroups = await groupFilesByBaseName(files);
      const batches = await calculateBatches(fileGroups, safeMaxFiles, sortBy, fileStats);
      
      const baseOutputDir = (mode === 'copy' && outputDir) ? outputDir : folderPath;
      
      // Create all batch folders first (Parallel Optimized)
      // Process in chunks to prevent file handle exhaustion
      console.time('FOLDER_CREATION');
      const FOLDER_CONCURRENCY = 20;
      for (let i = 0; i < batches.length; i += FOLDER_CONCURRENCY) {
        const chunkPromises = [];
        for (let j = 0; j < FOLDER_CONCURRENCY && (i + j) < batches.length; j++) {
          const batchIndex = i + j;
          const batchFolderName = `${safePrefix}_${String(batchIndex + 1).padStart(3, '0')}`;
          const batchFolderPath = path.join(baseOutputDir, batchFolderName);
          chunkPromises.push(fsPromises.mkdir(batchFolderPath, { recursive: true }));
        }
        await Promise.all(chunkPromises);
      }
      console.timeEnd('FOLDER_CREATION');

      let processedFiles = 0;
      const totalFiles = files.length;
      
      // Flatten the work into a single array of operations
      // Yield periodically during this heavy synchronous calculation
      const operations = [];
      
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batchFiles = batches[batchIndex];
        const batchFolderName = `${safePrefix}_${String(batchIndex + 1).padStart(3, '0')}`;
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

      // HIGH-PERFORMANCE FILE PROCESSING
      console.time('FILE_MOVING');
      
      // Build batch info for display
      const batchInfo = batches.map((b, i) => ({ 
        folder: `${safePrefix}_${String(i + 1).padStart(3, '0')}`,
        fileCount: b.length 
      }));
      
      // Start progress tracking for crash recovery
      const allFileNames = operations.map(op => op.fileName);
      await progressManager.startProgress({
        folderPath,
        outputDir: baseOutputDir,
        mode,
        maxFilesPerBatch: safeMaxFiles,
        outputPrefix: safePrefix,
        totalFiles,
        allFileNames,
        operations,
        batchInfo
      });
      
      // Track errors for both move and copy modes
      const errors = [];
      
      if (mode === 'move') {
        // Check if this is a cross-drive move (requires copy+delete instead of rename)
        const isCrossDrive = operations.length > 0 && 
          !isSameDrive(operations[0].sourcePath, operations[0].destPath);
        
        if (isCrossDrive) {
          // CROSS-DRIVE MOVE: Use async copy+delete to avoid blocking main process
          logger.log('📀 [MOVE] Cross-drive move detected - using async copy+delete');
          
          // ATOMIC INDEX MANAGEMENT: Prevents race condition where multiple workers
          // could read the same opCursor value before any increments it.
          const cursor = { index: 0 };
          const getNextIndex = () => cursor.index++;
          
          // Match UV_THREADPOOL_SIZE for optimal I/O parallelism
          const MAX_CONCURRENCY = 64;
          const moveErrors = [];
          
          const worker = async () => {
            while (!appState.batchCancelled) {
              const opIndex = getNextIndex();
              if (opIndex >= operations.length) break;
              
              const op = operations[opIndex];
              
              try {
                // Copy file first
                await fsPromises.copyFile(op.sourcePath, op.destPath);
                // SECURITY FIX: Verify copy succeeded before deleting source
                const [srcStat, destStat] = await Promise.all([
                  fsPromises.stat(op.sourcePath),
                  fsPromises.stat(op.destPath)
                ]);
                if (srcStat.size !== destStat.size) {
                  throw new Error(`Copy verification failed - size mismatch`);
                }
                // Then delete source (safe now that copy is verified)
                await fsPromises.unlink(op.sourcePath);
                // Track in memory (fast, non-blocking)
                progressManager.addProcessedFiles([op.fileName]);
              } catch (err) {
                moveErrors.push({ file: op.fileName, error: err.message });
              }
              
              processedFiles++;
            }
          };
          
          // Start workers
          const workers = [];
          const threadCount = Math.min(MAX_CONCURRENCY, operations.length);
          for (let i = 0; i < threadCount; i++) {
            workers.push(worker());
          }
          
          // Centralized progress saves and UI updates
          const progressInterval = setInterval(async () => {
            const currentBatch = Math.floor((processedFiles / totalFiles) * batches.length);
            event.sender.send('batch-progress', {
              current: currentBatch,
              total: batches.length,
              processedFiles,
              totalFiles
            });
            // Save to disk every 2 seconds (atomic write)
            await progressManager.saveProgressToDisk();
          }, 2000);
          
          await Promise.all(workers);
          
          clearInterval(progressInterval);
          
          // Final save
          await progressManager.saveProgressToDisk();
          
          event.sender.send('batch-progress', {
            current: batches.length,
            total: batches.length,
            processedFiles: totalFiles,
            totalFiles
          });
          
          errors.push(...moveErrors);
          
        } else {
          // SAME-DRIVE MOVE: Use fast sync rename (O(1) operation)
          logger.log('⚡ [MOVE] Same-drive move - using fast sync rename');
          const CHUNK_SIZE = 100; // Process 100 files, then update UI
          let lastSaveTime = Date.now();
          
          for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
            // Check for cancellation between chunks
            if (appState.batchCancelled) {
              console.log('⚠️ [CANCEL] Batch cancelled during move operation');
              break;
            }
            
            // Process chunk synchronously (fast for same-drive)
            const chunk = operations.slice(i, i + CHUNK_SIZE);
            const chunkFileNames = [];
            for (const op of chunk) {
              try {
                fs.renameSync(op.sourcePath, op.destPath);
                chunkFileNames.push(op.fileName);
              } catch (err) {
                errors.push({ file: op.fileName, error: err.message });
              }
            }
            
            // Track processed files in memory
            progressManager.addProcessedFiles(chunkFileNames);
            
            // Update processed count
            processedFiles = Math.min(i + CHUNK_SIZE, operations.length);
            
            // Send progress update
            const currentBatch = Math.floor((processedFiles / totalFiles) * batches.length);
            event.sender.send('batch-progress', {
              current: currentBatch,
              total: batches.length,
              processedFiles,
              totalFiles
            });
            
            // Save to disk every 2 seconds
            const now = Date.now();
            if (now - lastSaveTime >= 2000) {
              lastSaveTime = now;
              await progressManager.saveProgressToDisk();
            }
            
            // Yield to event loop to let UI update (only if more chunks remain)
            if (i + CHUNK_SIZE < operations.length) {
              await new Promise(r => setImmediate(r));
            }
          }
          
          // Final save
          await progressManager.saveProgressToDisk();
          
          // Send final progress
          event.sender.send('batch-progress', {
            current: batches.length,
            total: batches.length,
            processedFiles: totalFiles,
            totalFiles
          });
        }
        
      } else {
        // ASYNC COPY - Uses worker pool for progress updates
        console.log('📋 [COPY] Using async copy with', 64, 'concurrent workers');
        
        // ATOMIC INDEX MANAGEMENT: Prevents race condition where multiple workers
        // could read the same opCursor value before any increments it.
        const cursor = { index: 0 };
        const getNextIndex = () => cursor.index++;
        
        // Match UV_THREADPOOL_SIZE (set at startup) for optimal I/O parallelism
        const MAX_CONCURRENCY = 64;
        const copyErrors = [];  // Local error collection
        
        const worker = async () => {
          while (!appState.batchCancelled) {
            const opIndex = getNextIndex();
            if (opIndex >= operations.length) break;
            
            const op = operations[opIndex];
            
            try {
              await fsPromises.copyFile(op.sourcePath, op.destPath);
              // Track in memory (fast, non-blocking)
              progressManager.addProcessedFiles([op.fileName]);
            } catch (err) {
              copyErrors.push({ file: op.fileName, error: err.message });
            }
            
            processedFiles++;
          }
        };
        
        // Start workers
        const workers = [];
        const threadCount = Math.min(MAX_CONCURRENCY, operations.length);
        for (let i = 0; i < threadCount; i++) {
          workers.push(worker());
        }
        
        // Centralized progress saves and UI updates (single interval, no race conditions)
        const progressInterval = setInterval(async () => {
          const currentBatch = Math.floor((processedFiles / totalFiles) * batches.length);
          event.sender.send('batch-progress', {
            current: currentBatch,
            total: batches.length,
            processedFiles,
            totalFiles
          });
          // Save to disk every 2 seconds (atomic write)
          await progressManager.saveProgressToDisk();
        }, 2000);
        
        await Promise.all(workers);
        
        clearInterval(progressInterval);
        
        // Final save to disk
        await progressManager.saveProgressToDisk();
        
        event.sender.send('batch-progress', {
          current: batches.length,
          total: batches.length,
          processedFiles: totalFiles,
          totalFiles
        });
        
        // Use copyErrors for result
        errors.push(...copyErrors);
      }
      
      console.timeEnd('FILE_MOVING');
      console.timeEnd('TOTAL_BATCH_EXECUTION');

      // Build the result object
      const wasCancelled = appState.batchCancelled;
      
      // Clear progress on successful completion, keep it if cancelled (for resume)
      if (!wasCancelled) {
        await progressManager.clearProgress();
      }
      
      const result = {
        success: !wasCancelled,
        cancelled: wasCancelled,
        batchesCreated: batches.length,
        filesProcessed: processedFiles,
        totalFiles: totalFiles,
        mode,  // Include mode for rollback availability check
        results: batches.map((b, i) => ({ 
          folder: `${safePrefix}_${String(i + 1).padStart(3, '0')}`,
          fileCount: b.length 
        })),
        outputDir: baseOutputDir,
        hasErrors: errors.length > 0,
        errorCount: errors.length,
        errors: errors.length > 0 ? errors.slice(0, 10) : null  // Return first 10 errors
      };
      
      // Save rollback manifest for successful move operations
      if (!wasCancelled && mode === 'move') {
        rollbackManager.saveRollbackManifest({
          sourceFolder: folderPath,
          outputFolder: baseOutputDir,
          mode,
          operations,
          batchFolders: result.results.map(r => r.folder),
          totalFiles: processedFiles
        });
      }
      
      if (wasCancelled) {
        console.log(`⚠️ [CANCEL] Batch operation cancelled. Processed ${processedFiles} of ${totalFiles} files.`);
      }
      
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
  ipcMain.handle('preview-batches', async (event, { folderPath, maxFilesPerBatch, sortBy = 'name-asc' }) => {
    try {
      // SECURITY: Validate path is allowed (with symlink protection)
      if (!(await isPathAllowedAsync(folderPath))) {
        console.warn('🔒 [SECURITY] Blocked preview-batches on unregistered path:', folderPath);
        return { success: false, error: 'Access denied: folder not selected through dialog' };
      }
      
      const entries = await fsPromises.readdir(folderPath, { withFileTypes: true });
      const files = entries.filter(entry => entry.isFile()).map(entry => entry.name);
      
      // Collect stats if sorting by date or exif
      let fileStats = null;
      if (sortBy.startsWith('date')) {
        fileStats = {};
        // Process in parallel with concurrency limit
        const STAT_CONCURRENCY = 50;
        for (let i = 0; i < files.length; i += STAT_CONCURRENCY) {
          const chunk = files.slice(i, i + STAT_CONCURRENCY);
          await Promise.all(chunk.map(async (file) => {
            try {
              const stat = await fsPromises.stat(path.join(folderPath, file));
              fileStats[file] = { mtimeMs: stat.mtimeMs, size: stat.size };
            } catch (err) {
              // Ignore stat errors
            }
          }));
        }
      } else if (sortBy.startsWith('exif')) {
        // Use EXIF service for date taken
        fileStats = await exifService.extractExifDates(files, folderPath);
      }
      
      const fileGroups = await groupFilesByBaseName(files);
      const batches = await calculateBatches(fileGroups, maxFilesPerBatch, sortBy, fileStats);
      
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
}

// ============================================================================
// GROUP 3: FILE SYSTEM OPERATIONS (1 handler)
// ============================================================================

function registerFileSystemHandlers(ipcMain, getMainWindow) {
  
  ipcMain.handle('open-folder', async (event, folderPath) => {
    try {
      // SECURITY: Validate path is allowed before opening in shell (with symlink protection)
      if (!(await isPathAllowedAsync(folderPath))) {
        console.warn('🔒 [SECURITY] Blocked shell open on unregistered path:', folderPath);
        return { success: false, error: 'Access denied: folder not selected through dialog' };
      }
      
      await shell.openPath(folderPath);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

// ============================================================================
// GROUP 4: PREFERENCES & PERSISTENCE (4 handlers)
// ============================================================================

function registerPreferenceHandlers(ipcMain, store) {
  
  ipcMain.handle('get-recent-folders', async () => store.get('recentFolders', []));

  ipcMain.handle('add-recent-folder', async (event, folderPath) => {
    // Validate input
    if (!folderPath || typeof folderPath !== 'string') {
      console.warn('🔒 [SECURITY] Invalid folder path for recent folders');
      return store.get('recentFolders', []);
    }
    
    // Normalize and validate path exists
    try {
      const normalizedPath = path.resolve(folderPath);
      const stats = await fsPromises.stat(normalizedPath);
      
      if (!stats.isDirectory()) {
        console.warn('🔒 [SECURITY] Path is not a directory:', folderPath);
        return store.get('recentFolders', []);
      }
      
      // Add to recent folders (dedup, prepend, limit to 5)
      let recentFolders = store.get('recentFolders', []);
      recentFolders = recentFolders.filter(f => f !== normalizedPath);
      recentFolders.unshift(normalizedPath);
      recentFolders = recentFolders.slice(0, 5);
      store.set('recentFolders', recentFolders);
      
      console.log('📁 [RECENT] Added folder to recent list:', normalizedPath);
      return recentFolders;
    } catch (error) {
      console.warn('🔒 [SECURITY] Failed to validate folder path:', error.message);
      return store.get('recentFolders', []);
    }
  });

  ipcMain.handle('get-theme', async () => store.get('theme', 'dark'));

  ipcMain.handle('set-theme', async (event, theme) => {
    // Validate theme value - only allow 'dark' or 'light'
    const validThemes = ['dark', 'light'];
    const safeTheme = validThemes.includes(theme) ? theme : 'dark';
    store.set('theme', safeTheme);
    console.log('🎨 [THEME] Theme set to:', safeTheme);
    return safeTheme;
  });

  // Presets Management
  ipcMain.handle('get-presets', async () => store.get('presets', []));

  ipcMain.handle('save-preset', async (event, { name, settings }) => {
    if (!name || !settings) return false;
    
    // Get existing presets
    let presets = store.get('presets', []);
    
    // Remove existing preset with same name if exists (overwrite)
    presets = presets.filter(p => p.name !== name);
    
    // Add new preset
    presets.push({ name, settings, updatedAt: Date.now() });
    
    // Save back to store
    store.set('presets', presets);
    console.log('💾 [PRESETS] Saved preset:', name);
    return true;
  });

  ipcMain.handle('delete-preset', async (event, name) => {
    if (!name) return false;
    
    let presets = store.get('presets', []);
    const initialLength = presets.length;
    
    presets = presets.filter(p => p.name !== name);
    
    if (presets.length !== initialLength) {
      store.set('presets', presets);
      console.log('🗑️ [PRESETS] Deleted preset:', name);
      return true;
    }
    return false;
  });
}

// ============================================================================
// GROUP 5: BATCH MANAGEMENT & RECOVERY (5 handlers)
// ============================================================================

function registerBatchHandlers(ipcMain, store, getMainWindow, appState) {
  
  /**
   * Handler: Cancel the current batch operation
   * Sets the cancellation flag which is checked during file processing
   */
  ipcMain.handle('cancel-batch', async () => {
    console.log('⚠️ [CANCEL] Batch cancellation requested');
    appState.batchCancelled = true;
    return { success: true };
  });

  /**
   * Handler: Clean up stale recent folders
   * Removes folders that no longer exist from the recent folders list.
   * Called on app startup to ensure the list is always valid.
   */
  ipcMain.handle('cleanup-recent-folders', async () => {
    const recentFolders = store.get('recentFolders', []);
    const validFolders = [];
    
    for (const folder of recentFolders) {
      try {
        const stats = await fsPromises.stat(folder);
        if (stats.isDirectory()) {
          validFolders.push(folder);
        }
      } catch {
        console.log('🧹 [CLEANUP] Removing stale folder from recent list:', folder);
      }
    }
    
    if (validFolders.length !== recentFolders.length) {
      store.set('recentFolders', validFolders);
      console.log('🧹 [CLEANUP] Cleaned up recent folders. Valid:', validFolders.length, 'of', recentFolders.length);
    }
    
    return validFolders;
  });

  /**
   * Handler: Check if there's an interrupted batch operation
   * Called on app startup to detect if recovery is needed
   */
  ipcMain.handle('check-interrupted-progress', async () => {
    try {
      const progress = await progressManager.loadProgress();
      if (progress) {
        // Validate the source folder still exists
        try {
          const stats = await fsPromises.stat(progress.folderPath);
          if (!stats.isDirectory()) {
            await progressManager.clearProgress();
            return null;
          }
        } catch {
          // Folder doesn't exist anymore, clear progress
          console.log('💾 [PROGRESS] Source folder no longer exists, clearing progress');
          await progressManager.clearProgress();
          return null;
        }
        
        return {
          folderPath: progress.folderPath,
          mode: progress.mode,
          processedFiles: progress.processedFiles,
          totalFiles: progress.totalFiles,
          startedAt: progress.startedAt,
          outputPrefix: progress.outputPrefix,
          maxFilesPerBatch: progress.maxFilesPerBatch
        };
      }
      return null;
    } catch (error) {
      console.error('Failed to check interrupted progress:', error);
      return null;
    }
  });

  /**
   * Handler: Clear interrupted progress (user chose to discard)
   */
  ipcMain.handle('clear-interrupted-progress', async () => {
    await progressManager.clearProgress();
    return { success: true };
  });

  /**
   * Handler: Resume interrupted batch operation
   * Continues from where the previous operation stopped
   * Uses stored operations to ensure files go to their original intended destinations
   */
  ipcMain.handle('resume-batch', async (event) => {
    console.time('RESUME_BATCH_EXECUTION');
    try {
      const progress = await progressManager.loadProgress();
      if (!progress) {
        return { success: false, error: 'No interrupted progress found' };
      }
      
      const { folderPath, outputDir, mode, processedFileNames, totalFiles, 
              operations: storedOperations, batchInfo } = progress;
      
      // Register the folder path as allowed for this session
      registerAllowedPath(folderPath);
      if (outputDir && outputDir !== folderPath) {
        registerAllowedPath(outputDir);
      }
      
      // Filter to only remaining operations (skip already processed files)
      const processedSet = new Set(processedFileNames);
      const remainingOperations = storedOperations.filter(op => !processedSet.has(op.fileName));
      
      logger.log('💾 [RESUME] Resuming batch operation');
      logger.log('   - Already processed:', processedFileNames.length);
      logger.log('   - Remaining operations:', remainingOperations.length);
      
      if (remainingOperations.length === 0) {
        await progressManager.clearProgress();
        return { 
          success: true, 
          batchesCreated: batchInfo?.length || 0,
          filesProcessed: processedFileNames.length,
          totalFiles,
          results: batchInfo || [],
          outputDir: outputDir || folderPath,
          message: 'Operation was already complete'
        };
      }
      
      // Reset cancellation flag
      appState.resetBatchCancellation();
      
      // Ensure all required batch folders exist (they should already exist)
      const uniqueFolders = new Set(remainingOperations.map(op => path.dirname(op.destPath)));
      console.time('FOLDER_CREATION');
      for (const folderPath of uniqueFolders) {
        await fsPromises.mkdir(folderPath, { recursive: true });
      }
      console.timeEnd('FOLDER_CREATION');
      
      let processedFiles = processedFileNames.length;
      const errors = [];
      
      console.time('FILE_MOVING');
      
      if (mode === 'move') {
        const isCrossDrive = remainingOperations.length > 0 && 
          !isSameDrive(remainingOperations[0].sourcePath, remainingOperations[0].destPath);
        
        if (isCrossDrive) {
          // CROSS-DRIVE MOVE: Use async copy+delete
          logger.log('📀 [RESUME] Cross-drive move detected');
          
          const cursor = { index: 0 };
          const getNextIndex = () => cursor.index++;
          const MAX_CONCURRENCY = 64;
          const moveErrors = [];
          
          const worker = async () => {
            while (!appState.batchCancelled) {
              const opIndex = getNextIndex();
              if (opIndex >= remainingOperations.length) break;
              const op = remainingOperations[opIndex];
              try {
                await fsPromises.copyFile(op.sourcePath, op.destPath);
                // SECURITY FIX: Verify copy succeeded before deleting source
                const [srcStat, destStat] = await Promise.all([
                  fsPromises.stat(op.sourcePath),
                  fsPromises.stat(op.destPath)
                ]);
                if (srcStat.size !== destStat.size) {
                  throw new Error(`Copy verification failed - size mismatch`);
                }
                await fsPromises.unlink(op.sourcePath);
                progressManager.addProcessedFiles([op.fileName]);
              } catch (err) {
                moveErrors.push({ file: op.fileName, error: err.message });
              }
              processedFiles++;
            }
          };
          
          const workers = [];
          const threadCount = Math.min(MAX_CONCURRENCY, remainingOperations.length);
          for (let i = 0; i < threadCount; i++) {
            workers.push(worker());
          }
          
          const progressInterval = setInterval(async () => {
            const currentBatch = Math.floor((processedFiles / totalFiles) * (batchInfo?.length || 1));
            event.sender.send('batch-progress', {
              current: currentBatch,
              total: batchInfo?.length || 1,
              processedFiles,
              totalFiles
            });
            await progressManager.saveProgressToDisk();
          }, 2000);
          
          await Promise.all(workers);
          clearInterval(progressInterval);
          await progressManager.saveProgressToDisk();
          errors.push(...moveErrors);
          
        } else {
          // SAME-DRIVE MOVE: Fast sync rename
          logger.log('⚡ [RESUME] Same-drive move detected');
          const CHUNK_SIZE = 100;
          let lastSaveTime = Date.now();
          
          for (let i = 0; i < remainingOperations.length; i += CHUNK_SIZE) {
            if (appState.batchCancelled) break;
            
            const chunk = remainingOperations.slice(i, i + CHUNK_SIZE);
            const chunkFileNames = [];
            for (const op of chunk) {
              try {
                fs.renameSync(op.sourcePath, op.destPath);
                chunkFileNames.push(op.fileName);
              } catch (err) {
                errors.push({ file: op.fileName, error: err.message });
              }
            }
            progressManager.addProcessedFiles(chunkFileNames);
            processedFiles = Math.min(processedFileNames.length + i + CHUNK_SIZE, totalFiles);
            
            event.sender.send('batch-progress', {
              current: Math.floor((processedFiles / totalFiles) * (batchInfo?.length || 1)),
              total: batchInfo?.length || 1,
              processedFiles,
              totalFiles
            });
            
            const now = Date.now();
            if (now - lastSaveTime >= 2000) {
              lastSaveTime = now;
              await progressManager.saveProgressToDisk();
            }
            
            if (i + CHUNK_SIZE < remainingOperations.length) {
              await new Promise(r => setImmediate(r));
            }
          }
          await progressManager.saveProgressToDisk();
        }
      } else {
        // COPY MODE
        logger.log('📋 [RESUME] Copy mode');
        const cursor = { index: 0 };
        const getNextIndex = () => cursor.index++;
        const MAX_CONCURRENCY = 64;
        const copyErrors = [];
        
        const worker = async () => {
          while (!appState.batchCancelled) {
            const opIndex = getNextIndex();
            if (opIndex >= remainingOperations.length) break;
            const op = remainingOperations[opIndex];
            try {
              await fsPromises.copyFile(op.sourcePath, op.destPath);
              progressManager.addProcessedFiles([op.fileName]);
            } catch (err) {
              copyErrors.push({ file: op.fileName, error: err.message });
            }
            processedFiles++;
          }
        };
        
        const workers = [];
        const threadCount = Math.min(MAX_CONCURRENCY, remainingOperations.length);
        for (let i = 0; i < threadCount; i++) {
          workers.push(worker());
        }
        
        const progressInterval = setInterval(async () => {
          const currentBatch = Math.floor((processedFiles / totalFiles) * (batchInfo?.length || 1));
          event.sender.send('batch-progress', {
            current: currentBatch,
            total: batchInfo?.length || 1,
            processedFiles,
            totalFiles
          });
          await progressManager.saveProgressToDisk();
        }, 2000);
        
        await Promise.all(workers);
        clearInterval(progressInterval);
        await progressManager.saveProgressToDisk();
        errors.push(...copyErrors);
      }
      
      console.timeEnd('FILE_MOVING');
      console.timeEnd('RESUME_BATCH_EXECUTION');
      
      const wasCancelled = appState.batchCancelled;
      if (!wasCancelled) {
        await progressManager.clearProgress();
      }
      
      return {
        success: !wasCancelled,
        cancelled: wasCancelled,
        batchesCreated: batchInfo?.length || 0,
        filesProcessed: processedFiles,
        totalFiles,
        results: batchInfo || [],
        outputDir: outputDir || folderPath,
        hasErrors: errors.length > 0,
        errorCount: errors.length,
        errors: errors.slice(0, 10)
      };
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

// ============================================================================
// GROUP 6: ROLLBACK/UNDO HANDLERS (3 handlers)
// ============================================================================

function registerRollbackHandlers(ipcMain, getMainWindow, appState) {
  
  /**
   * Handler: Check if rollback is available
   * Returns summary info about the last batch operation if rollback is possible
   */
  ipcMain.handle('check-rollback-available', async () => {
    return rollbackManager.checkRollbackAvailable();
  });
  
  /**
   * Handler: Execute rollback operation
   * Moves files back to original locations and deletes empty batch folders
   */
  ipcMain.handle('rollback-batch', async (event) => {
    console.time('ROLLBACK_EXECUTION');
    
    try {
      // Reset cancellation flag
      appState.resetBatchCancellation();
      
      const result = await rollbackManager.executeRollback(appState, (progress) => {
        // Send progress updates to renderer
        event.sender.send('rollback-progress', progress);
      });
      
      console.timeEnd('ROLLBACK_EXECUTION');
      return result;
      
    } catch (error) {
      console.timeEnd('ROLLBACK_EXECUTION');
      return { success: false, error: error.message };
    }
  });
  
  /**
   * Handler: Clear rollback manifest
   * Called when user dismisses the undo option or starts a new batch
   */
  ipcMain.handle('clear-rollback-manifest', async () => {
    rollbackManager.clearRollbackManifest();
    return { success: true };
  });
}

module.exports = { registerIpcHandlers };
