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

const { dialog, shell } = require('electron');
const path = require('path');
const fsPromises = require('fs').promises;

// Import logic modules
const progressManager = require('./progressManager');
const rollbackManager = require('./rollbackManager');
const logger = require('../utils/logger');
const config = require('./config');
const { sanitizeError } = require('../utils/errorSanitizer');
const { groupFilesByBaseName, calculateBatches, yieldToMain } = require('./batchEngine');
const exifService = require('./exifService');
const blurDetectionService = require('./blurDetectionService');
const { executeFileOperations } = require('./batchExecutor');
const { isPathAllowedAsync, registerAllowedPath, sanitizeOutputPrefix, validateMaxFilesPerBatch } = require('./securityManager');
const { collectFileStats, isSameDrive, getDiskSpace, testWritePermission, formatBytes, calculateTotalSize, SPACE_BUFFER_MULTIPLIER } = require('./fileUtils');
const { generateBatchFolderName } = require('../utils/batchNaming');
const sharp = require('sharp');
const {
  STAT_CONCURRENCY,
  FOLDER_CONCURRENCY,
  THUMBNAIL_SIZE,
  THUMBNAIL_CONCURRENCY,
  PREVIEW_MAX_DIMENSION,
  PREVIEW_JPEG_QUALITY,
  PREVIEW_CACHE_SIZE,
} = require('./constants');

/**
 * Main export: Register all IPC handlers
 * @param {Object} ipcInstance - Electron's ipcMain object
 * @param {Store} storeInstance - Electron store instance for persistence
 * @param {Function} getMainWindow - Function to get the main window
 * @param {Object} appState - App state object { batchCancelled, resetBatchCancellation }
 */
function registerIpcHandlers(ipcInstance, storeInstance, getMainWindow, appState) {
  
  // Initialize rollback manager with store reference for persistent history
  rollbackManager.init(storeInstance);
  
  registerFolderHandlers(ipcInstance, storeInstance, getMainWindow);
  registerCoreHandlers(ipcInstance, getMainWindow, appState);
  registerFileSystemHandlers(ipcInstance, getMainWindow);
  registerPreferenceHandlers(ipcInstance, storeInstance);
  registerBatchHandlers(ipcInstance, storeInstance, getMainWindow, appState);
  registerRollbackHandlers(ipcInstance, getMainWindow, appState);
  registerHistoryHandlers(ipcInstance, getMainWindow, appState);

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
      return { success: false, error: sanitizeError(error, 'register-dropped-folder') };
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
        logger.warn('🔒 [SECURITY] Blocked access to unregistered path:', folderPath);
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
      
      // Count only recognized image/RAW/video files (excludes non-media files like CSV, TXT, etc.)
      const totalFiles = Object.values(fileGroups).reduce((sum, group) => sum + group.length, 0);
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
      return {
        success: false,
        error: sanitizeError(error, 'scan-folder'),
      };
    }
  });

  /**
   * Handler: Execute the batch splitting operation
   * OPTIMIZED: Uses concurrency pool instead of batch chunks
   */
  ipcMain.handle('execute-batch', async (event, { folderPath, maxFilesPerBatch, outputPrefix, mode = 'move', outputDir = null, sortBy = 'name-asc', blurryGroups = null }) => {
    logger.time('TOTAL_BATCH_EXECUTION');
    try {
      // SECURITY: Validate paths are allowed (with symlink protection)
      if (!(await isPathAllowedAsync(folderPath))) {
        logger.warn('🔒 [SECURITY] Blocked execute-batch on unregistered path:', folderPath);
        return { success: false, error: 'Access denied: source folder not selected through dialog' };
      }
      if (outputDir && !(await isPathAllowedAsync(outputDir))) {
        logger.warn('🔒 [SECURITY] Blocked execute-batch on unregistered output path:', outputDir);
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
      
      // Collect stats based on sort mode
      let fileStats = null;
      if (sortBy.startsWith('date')) {
        logger.log('📊 [SORT] Collecting file stats for date sorting...');
        fileStats = await collectFileStats(files, folderPath, STAT_CONCURRENCY);
      } else if (sortBy.startsWith('exif')) {
        fileStats = await exifService.extractExifDates(files, folderPath);
      }
      
      // Group files and separate blurry groups if provided
      const fileGroups = await groupFilesByBaseName(files);
      const blurryGroupSet = new Set(Array.isArray(blurryGroups) ? blurryGroups : []);
      const blurryFiles = [];
      
      if (blurryGroupSet.size > 0) {
        for (const baseName of blurryGroupSet) {
          if (fileGroups[baseName]) {
            blurryFiles.push(...fileGroups[baseName]);
            delete fileGroups[baseName];
          }
        }
        logger.log(`🔍 [BLUR] Separated ${blurryFiles.length} blurry files from ${blurryGroupSet.size} groups`);
      }
      
      // Recalculate batches with user's sort preference (blurry groups excluded)
      const batches = await calculateBatches(fileGroups, safeMaxFiles, sortBy, fileStats);
      
      const baseOutputDir = (mode === 'copy' && outputDir) ? outputDir : folderPath;
      
      // Create all batch folders first (Parallel Optimized)
      // Process in chunks to prevent file handle exhaustion
      logger.time('FOLDER_CREATION');
      for (let i = 0; i < batches.length; i += FOLDER_CONCURRENCY) {
        const chunkPromises = [];
        for (let j = 0; j < FOLDER_CONCURRENCY && (i + j) < batches.length; j++) {
          const batchIndex = i + j;
          const batchFolderName = generateBatchFolderName(safePrefix, batchIndex, batches.length);
          const batchFolderPath = path.join(baseOutputDir, batchFolderName);
          chunkPromises.push(fsPromises.mkdir(batchFolderPath, { recursive: true }));
        }
        await Promise.all(chunkPromises);
      }
      
      // Create the blurry folder if there are blurry files
      const blurryFolderName = blurryFiles.length > 0 ? `${safePrefix}_Blurry` : null;
      if (blurryFolderName) {
        const blurryFolderPath = path.join(baseOutputDir, blurryFolderName);
        await fsPromises.mkdir(blurryFolderPath, { recursive: true });
        logger.log(`🔍 [BLUR] Created blurry folder: ${blurryFolderName}`);
      }
      logger.timeEnd('FOLDER_CREATION');

      let processedFiles = 0;
      const totalFiles = files.length;
      
      // Flatten the work into a single array of operations
      // Yield periodically during this heavy synchronous calculation
      const operations = [];
      
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batchFiles = batches[batchIndex];
        const batchFolderName = generateBatchFolderName(safePrefix, batchIndex, batches.length);
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
      
      // Append blurry file operations (they go to the blurry folder)
      if (blurryFolderName && blurryFiles.length > 0) {
        const blurryFolderPath = path.join(baseOutputDir, blurryFolderName);
        for (const fileName of blurryFiles) {
          operations.push({
            fileName,
            sourcePath: path.join(folderPath, fileName),
            destPath: path.join(blurryFolderPath, fileName),
            batchIndex: batches.length // Last "batch" index
          });
        }
      }

      // HIGH-PERFORMANCE FILE PROCESSING
      logger.time('FILE_MOVING');
      
      // Build batch info for display (includes blurry folder)
      const batchInfo = batches.map((b, i) => ({ 
        folder: generateBatchFolderName(safePrefix, i, batches.length),
        fileCount: b.length 
      }));
      if (blurryFolderName) {
        batchInfo.push({ folder: blurryFolderName, fileCount: blurryFiles.length });
      }
      
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
      
      // Delegate file processing to the shared batch executor
      const totalBatchCount = batches.length + (blurryFolderName ? 1 : 0);
      const { processedFiles: finalProcessed, errors } = await executeFileOperations(
        operations, mode, {
          totalFiles,
          batchCount: totalBatchCount,
          initialProcessed: 0,
          isCancelled: () => appState.batchCancelled,
          onProgress: (progress) => event.sender.send('batch-progress', progress),
          onProcessedFiles: (fileNames) => progressManager.addProcessedFiles(fileNames),
          onSaveProgress: () => progressManager.saveProgressToDisk(),
        }
      );
      processedFiles = finalProcessed;
      
      logger.timeEnd('FILE_MOVING');
      logger.timeEnd('TOTAL_BATCH_EXECUTION');

      // Build the result object
      const wasCancelled = appState.batchCancelled;
      
      // Clear progress on successful completion, keep it if cancelled (for resume)
      if (!wasCancelled) {
        await progressManager.clearProgress();
      }
      
      // Build results array (includes blurry folder)
      const resultsArray = batches.map((b, i) => ({ 
        folder: generateBatchFolderName(safePrefix, i, batches.length),
        fileCount: b.length 
      }));
      if (blurryFolderName) {
        resultsArray.push({ folder: blurryFolderName, fileCount: blurryFiles.length });
      }
      
      const result = {
        success: !wasCancelled,
        cancelled: wasCancelled,
        batchesCreated: totalBatchCount,
        filesProcessed: processedFiles,
        totalFiles: totalFiles,
        mode,  // Include mode for rollback availability check
        results: resultsArray,
        outputDir: baseOutputDir,
        hasErrors: errors.length > 0,
        errorCount: errors.length,
        errors: errors.length > 0 ? errors.slice(0, 10) : null,  // Return first 10 errors
        blurryFileCount: blurryFiles.length,
        blurryFolderName: blurryFolderName,
      };
      
      // Save rollback manifest for successful move operations (if feature is enabled)
      if (config.features.ROLLBACK_ENABLED && !wasCancelled && mode === 'move') {
        await rollbackManager.saveRollbackManifest({
          sourceFolder: folderPath,
          outputFolder: baseOutputDir,
          mode,
          operations,
          batchFolders: result.results.map(r => r.folder),
          totalFiles: processedFiles,
          outputPrefix: safePrefix,
          // Extended metadata for history detail display
          maxFilesPerBatch: safeMaxFiles,
          sortBy,
          batchResults: result.results, // [{ folder, fileCount }, ...]
        });
      }
      
      if (wasCancelled) {
        logger.log(`⚠️ [CANCEL] Batch operation cancelled. Processed ${processedFiles} of ${totalFiles} files.`);
      }
      
      return result;
    } catch (error) {
      return {
        success: false,
        error: sanitizeError(error, 'execute-batch'),
      };
    }
  });

  /**
   * Handler: Calculate batch preview
   * OPTIMIZED: async + yielding
   */
  ipcMain.handle('preview-batches', async (event, { folderPath, maxFilesPerBatch, sortBy = 'name-asc', excludeGroups = null }) => {
    try {
      // SECURITY: Validate path is allowed (with symlink protection)
      if (!(await isPathAllowedAsync(folderPath))) {
        logger.warn('🔒 [SECURITY] Blocked preview-batches on unregistered path:', folderPath);
        return { success: false, error: 'Access denied: folder not selected through dialog' };
      }
      
      // SECURITY: Validate and sanitize maxFilesPerBatch
      const safeMaxFiles = validateMaxFilesPerBatch(maxFilesPerBatch);
      
      const entries = await fsPromises.readdir(folderPath, { withFileTypes: true });
      const files = entries.filter(entry => entry.isFile()).map(entry => entry.name);
      
      // Collect stats based on sort mode
      let fileStats = null;
      if (sortBy.startsWith('date')) {
        fileStats = await collectFileStats(files, folderPath, STAT_CONCURRENCY);
      } else if (sortBy.startsWith('exif')) {
        fileStats = await exifService.extractExifDates(files, folderPath);
      }
      
      const fileGroups = await groupFilesByBaseName(files);
      
      // Separate blurry groups if excludeGroups is provided
      const blurryFiles = [];
      if (Array.isArray(excludeGroups) && excludeGroups.length > 0) {
        for (const baseName of excludeGroups) {
          if (fileGroups[baseName]) {
            blurryFiles.push(...fileGroups[baseName]);
            delete fileGroups[baseName];
          }
        }
      }
      
      const batches = await calculateBatches(fileGroups, safeMaxFiles, sortBy, fileStats);
      
      const oversizedGroups = Object.entries(fileGroups)
        .filter(([_name, files]) => files.length > safeMaxFiles)
        .map(([name, files]) => ({ name, count: files.length }));
      
      // Only send the first 50 batches detailed data to avoid IPC payload limit on huge datasets
      const batchDetails = batches.slice(0, 50).map((batch, index) => ({
        batchNumber: index + 1,
        fileCount: batch.length,
        sampleFiles: batch.slice(0, 5),
        allFiles: batch, // Include all files for "Load More" functionality
        hasMore: batch.length > 5
      }));
      
      return {
        success: true,
        batchCount: batches.length,
        batchSizes: batches.map(b => b.length),
        batchDetails,
        oversizedGroups,
        // Count only recognized image/RAW/video files (excludes non-media files like CSV, TXT, etc.)
        totalFiles: Object.values(fileGroups).reduce((sum, g) => sum + g.length, 0) + blurryFiles.length,
        blurryFiles,
        blurryFileCount: blurryFiles.length,
      };
    } catch (error) {
      return {
        success: false,
        error: sanitizeError(error, 'preview-batches'),
      };
    }
  });

  /**
   * Handler: Analyze folder images for blur
   * Runs asynchronously after scan completes, sending progress updates.
   * Uses blurDetectionService which analyzes JPEG/PNG thumbnails via Laplacian variance.
   */
  ipcMain.handle('analyze-blur', async (event, { folderPath, threshold = 'moderate' }) => {
    try {
      // SECURITY: Validate path is allowed
      if (!(await isPathAllowedAsync(folderPath))) {
        logger.warn('🔒 [SECURITY] Blocked analyze-blur on unregistered path:', folderPath);
        return { success: false, error: 'Access denied: folder not selected through dialog' };
      }

      // Validate threshold value
      const validThresholds = ['strict', 'moderate', 'lenient'];
      const safeThreshold = validThresholds.includes(threshold) ? threshold : 'moderate';

      // Read directory and group files
      const entries = await fsPromises.readdir(folderPath, { withFileTypes: true });
      const files = entries.filter(entry => entry.isFile()).map(entry => entry.name);
      const fileGroups = await groupFilesByBaseName(files);

      // Run blur analysis with progress reporting
      const blurResults = await blurDetectionService.analyzeBlur(
        fileGroups,
        folderPath,
        safeThreshold,
        (progress) => {
          event.sender.send('blur-progress', progress);
        }
      );

      // Count blurry groups
      const blurryCount = Object.values(blurResults).filter(r => r.isBlurry).length;
      const totalAnalyzed = Object.values(blurResults).filter(r => r.score >= 0).length;

      return {
        success: true,
        blurResults,
        totalAnalyzed,
        blurryCount,
        totalGroups: Object.keys(blurResults).length,
      };
    } catch (error) {
      return {
        success: false,
        error: sanitizeError(error, 'analyze-blur'),
      };
    }
  });

  /**
   * Handler: Validate execution environment before starting batch operation
   * Checks disk space sufficiency and write permissions on the target directory.
   * 
   * For same-drive move: only checks write permission (rename is O(1), no extra space).
   * For cross-drive move and copy: checks both disk space and write permission.
   */
  ipcMain.handle('validate-execution', async (event, { folderPath, mode = 'move', outputDir = null }) => {
    try {
      // SECURITY: Validate paths
      if (!(await isPathAllowedAsync(folderPath))) {
        return { success: false, error: 'Access denied: source folder not selected through dialog' };
      }
      if (outputDir && !(await isPathAllowedAsync(outputDir))) {
        return { success: false, error: 'Access denied: output folder not selected through dialog' };
      }

      const baseOutputDir = (mode === 'copy' && outputDir) ? outputDir : folderPath;
      const warnings = [];

      // 1. Determine if this is a same-drive operation
      let sameDrive = true;
      if (mode === 'copy' && outputDir) {
        sameDrive = await isSameDrive(folderPath, outputDir);
      } else if (mode === 'move') {
        // For move mode, source and output are the same folder (same drive by definition)
        sameDrive = true;
      }

      // 2. Collect file stats to calculate total size
      const entries = await fsPromises.readdir(folderPath, { withFileTypes: true });
      const files = entries.filter(entry => entry.isFile()).map(entry => entry.name);
      const fileStats = await collectFileStats(files, folderPath, STAT_CONCURRENCY);
      const totalSizeBytes = calculateTotalSize(fileStats);
      const requiredBytes = Math.ceil(totalSizeBytes * SPACE_BUFFER_MULTIPLIER);

      // 3. Check disk space (skip for same-drive move — rename needs no extra space)
      let diskSpace = null;
      const needsDiskSpaceCheck = !(mode === 'move' && sameDrive);

      if (needsDiskSpaceCheck) {
        const spaceResult = await getDiskSpace(baseOutputDir);

        if (spaceResult.freeBytes !== null) {
          diskSpace = {
            freeBytes: spaceResult.freeBytes,
            totalBytes: spaceResult.totalBytes,
            requiredBytes,
            sufficient: spaceResult.freeBytes >= requiredBytes,
            freeFormatted: formatBytes(spaceResult.freeBytes),
            requiredFormatted: formatBytes(requiredBytes),
            totalFormatted: formatBytes(spaceResult.totalBytes)
          };
        } else {
          // Could not determine disk space — soft warning
          diskSpace = {
            freeBytes: null,
            totalBytes: null,
            requiredBytes,
            sufficient: null, // unknown
            freeFormatted: 'Unknown',
            requiredFormatted: formatBytes(requiredBytes),
            totalFormatted: 'Unknown'
          };
          warnings.push('Could not verify available disk space. Proceed with caution.');
        }
      } else {
        // Same-drive move: no disk space check needed
        diskSpace = {
          freeBytes: null,
          totalBytes: null,
          requiredBytes: 0,
          sufficient: true, // rename doesn't need extra space
          skipped: true,
          reason: 'Same-drive move uses rename (no extra space needed)'
        };
      }

      // 4. Check write permissions on the output directory
      const permissions = await testWritePermission(baseOutputDir);

      // 5. Detect network/UNC paths for advisory warning
      const isNetworkPath = baseOutputDir.startsWith('\\\\') || baseOutputDir.startsWith('//');
      if (isNetworkPath) {
        warnings.push('Network drive detected. Space estimate may be approximate.');
      }

      logger.log('🔍 [VALIDATE] Pre-execution checks complete');
      logger.log('   - Mode:', mode, sameDrive ? '(same drive)' : '(cross drive)');
      logger.log('   - Total size:', formatBytes(totalSizeBytes), '(+10% buffer:', formatBytes(requiredBytes), ')');
      logger.log('   - Disk sufficient:', diskSpace.sufficient);
      logger.log('   - Writable:', permissions.writable);

      return {
        success: true,
        diskSpace,
        permissions,
        warnings,
        totalFiles: files.length,
        totalSizeFormatted: formatBytes(totalSizeBytes)
      };

    } catch (error) {
      return {
        success: false,
        error: sanitizeError(error, 'validate-execution')
      };
    }
  });
}

// ============================================================================
// GROUP 3: FILE SYSTEM OPERATIONS (1 handler)
// ============================================================================

function registerFileSystemHandlers(ipcMain, _getMainWindow) {
  
  ipcMain.handle('open-folder', async (event, folderPath) => {
    try {
      // SECURITY: Validate path is allowed before opening in shell (with symlink protection)
      if (!(await isPathAllowedAsync(folderPath))) {
        logger.warn('🔒 [SECURITY] Blocked shell open on unregistered path:', folderPath);
        return { success: false, error: 'Access denied: folder not selected through dialog' };
      }
      
      await shell.openPath(folderPath);
      return { success: true };
    } catch (error) {
      return { success: false, error: sanitizeError(error, 'open-folder') };
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
      logger.warn('🔒 [SECURITY] Invalid folder path for recent folders');
      return store.get('recentFolders', []);
    }
    
    // Normalize and validate path exists
    try {
      const normalizedPath = path.resolve(folderPath);
      const stats = await fsPromises.stat(normalizedPath);
      
      if (!stats.isDirectory()) {
        logger.warn('🔒 [SECURITY] Path is not a directory:', folderPath);
        return store.get('recentFolders', []);
      }
      
      // Add to recent folders (dedup, prepend, limit to 5)
      let recentFolders = store.get('recentFolders', []);
      recentFolders = recentFolders.filter(f => f !== normalizedPath);
      recentFolders.unshift(normalizedPath);
      recentFolders = recentFolders.slice(0, 5);
      store.set('recentFolders', recentFolders);
      
      logger.log('📁 [RECENT] Added folder to recent list:', normalizedPath);
      return recentFolders;
    } catch (error) {
      logger.warn('🔒 [SECURITY] Failed to validate folder path:', error.message);
      return store.get('recentFolders', []);
    }
  });

  ipcMain.handle('get-theme', async () => store.get('theme', 'dark'));

  ipcMain.handle('set-theme', async (event, theme) => {
    // Validate theme value - only allow 'dark' or 'light'
    const validThemes = ['dark', 'light'];
    const safeTheme = validThemes.includes(theme) ? theme : 'dark';
    store.set('theme', safeTheme);
    logger.log('🎨 [THEME] Theme set to:', safeTheme);
    return safeTheme;
  });

  // Presets Management
  ipcMain.handle('get-presets', async () => store.get('presets', []));

  ipcMain.handle('save-preset', async (event, { name, settings }) => {
    // SECURITY: Validate inputs exist and are correct types
    if (!name || typeof name !== 'string') return false;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return false;
    
    // SECURITY: Enforce max length for preset name (prevent storage bloat)
    const safeName = name.trim().substring(0, config.limits.MAX_PRESET_NAME_LENGTH);
    if (safeName.length === 0) return false;
    
    // SECURITY: Only allow known settings keys to prevent arbitrary data injection
    const safeSettings = {};
    for (const key of config.limits.ALLOWED_SETTINGS_KEYS) {
      if (settings[key] !== undefined) {
        // Only allow string and null values (all settings are strings or null)
        const val = settings[key];
        if (val === null || typeof val === 'string') {
          safeSettings[key] = typeof val === 'string' ? val.substring(0, config.limits.MAX_SETTING_VALUE_LENGTH) : val;
        }
      }
    }
    
    // Get existing presets
    let presets = store.get('presets', []);
    
    // Remove existing preset with same name if exists (overwrite)
    presets = presets.filter(p => p.name !== safeName);
    
    // SECURITY: Cap total number of presets to prevent unbounded storage growth
    if (presets.length >= config.limits.MAX_PRESETS) {
      logger.warn('🔒 [SECURITY] Max presets reached, removing oldest');
      // Sort by updatedAt ascending and remove the oldest
      presets.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
      presets = presets.slice(presets.length - config.limits.MAX_PRESETS + 1);
    }
    
    // Add new preset
    presets.push({ name: safeName, settings: safeSettings, updatedAt: Date.now() });
    
    // Save back to store
    store.set('presets', presets);
    logger.log('💾 [PRESETS] Saved preset:', safeName);
    return true;
  });

  ipcMain.handle('delete-preset', async (event, name) => {
    if (!name) return false;
    
    let presets = store.get('presets', []);
    const initialLength = presets.length;
    
    presets = presets.filter(p => p.name !== name);
    
    if (presets.length !== initialLength) {
      store.set('presets', presets);
      logger.log('🗑️ [PRESETS] Deleted preset:', name);
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
    logger.log('⚠️ [CANCEL] Batch cancellation requested');
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
        logger.log('🧹 [CLEANUP] Removing stale folder from recent list:', folder);
      }
    }
    
    if (validFolders.length !== recentFolders.length) {
      store.set('recentFolders', validFolders);
      logger.log('🧹 [CLEANUP] Cleaned up recent folders. Valid:', validFolders.length, 'of', recentFolders.length);
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
          logger.log('💾 [PROGRESS] Source folder no longer exists, clearing progress');
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
      logger.error('Failed to check interrupted progress:', error);
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
    logger.time('RESUME_BATCH_EXECUTION');
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
      logger.time('FOLDER_CREATION');
      for (const dir of uniqueFolders) {
        await fsPromises.mkdir(dir, { recursive: true });
      }
      logger.timeEnd('FOLDER_CREATION');
      
      logger.time('FILE_MOVING');
      
      // Delegate file processing to the shared batch executor
      const resumeBatchCount = batchInfo?.length || 1;
      const { processedFiles: finalProcessed, errors } = await executeFileOperations(
        remainingOperations, mode, {
          totalFiles,
          batchCount: resumeBatchCount,
          initialProcessed: processedFileNames.length,
          isCancelled: () => appState.batchCancelled,
          onProgress: (progress) => event.sender.send('batch-progress', progress),
          onProcessedFiles: (fileNames) => progressManager.addProcessedFiles(fileNames),
          onSaveProgress: () => progressManager.saveProgressToDisk(),
        }
      );
      
      logger.timeEnd('FILE_MOVING');
      logger.timeEnd('RESUME_BATCH_EXECUTION');
      
      const wasCancelled = appState.batchCancelled;
      if (!wasCancelled) {
        await progressManager.clearProgress();
      }
      
      return {
        success: !wasCancelled,
        cancelled: wasCancelled,
        batchesCreated: batchInfo?.length || 0,
        filesProcessed: finalProcessed,
        totalFiles,
        results: batchInfo || [],
        outputDir: outputDir || folderPath,
        hasErrors: errors.length > 0,
        errorCount: errors.length,
        errors: errors.slice(0, 10)
      };
      
    } catch (error) {
      return { success: false, error: sanitizeError(error, 'resume-batch') };
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
   * Respects the ROLLBACK_ENABLED feature flag.
   */
  ipcMain.handle('check-rollback-available', async () => {
    if (!config.features.ROLLBACK_ENABLED) {
      return null;
    }
    return rollbackManager.checkRollbackAvailable();
  });
  
  /**
   * Handler: Execute rollback operation
   * Moves files back to original locations and deletes empty batch folders
   */
  ipcMain.handle('rollback-batch', async (event) => {
    logger.time('ROLLBACK_EXECUTION');
    
    try {
      // Reset cancellation flag
      appState.resetBatchCancellation();
      
      const result = await rollbackManager.executeRollback(appState, (progress) => {
        // Send progress updates to renderer
        event.sender.send('rollback-progress', progress);
      });
      
      logger.timeEnd('ROLLBACK_EXECUTION');
      return result;
      
    } catch (error) {
      logger.timeEnd('ROLLBACK_EXECUTION');
      return { success: false, error: sanitizeError(error, 'rollback-batch') };
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
  
  /**
   * Handler: Get image thumbnails
   * Generates small thumbnails for preview using sharp (handles EXIF orientation)
   * 
   * SECURITY: Validates folderPath against allowed paths and sanitizes fileNames
   * to prevent path traversal attacks (e.g. "../../etc/passwd").
   */
  ipcMain.handle('get-thumbnails', async (event, { folderPath, fileNames }) => {
    // SECURITY: Validate folder path is in allowed list
    if (!(await isPathAllowedAsync(folderPath))) {
      logger.warn('🔒 [SECURITY] Blocked get-thumbnails on unregistered path:', folderPath);
      return {};
    }
    
    // SECURITY: Validate fileNames is an array
    if (!Array.isArray(fileNames)) {
      logger.warn('🔒 [SECURITY] get-thumbnails received non-array fileNames');
      return {};
    }
    
    const thumbnails = {};
    
    // Supported image extensions
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'];
    
    // Filter to only image files AND sanitize filenames:
    // - Reject entries containing path separators (/ or \) to prevent traversal
    // - Reject entries containing ".." sequences
    // - Only allow valid image extensions
    const imageFiles = fileNames.filter(f => {
      if (typeof f !== 'string') return false;
      if (f.includes('/') || f.includes('\\') || f.includes('..')) return false;
      const ext = path.extname(f).toLowerCase();
      return imageExtensions.includes(ext);
    });
    
    // Process in chunks for concurrency control
    for (let i = 0; i < imageFiles.length; i += THUMBNAIL_CONCURRENCY) {
      const chunk = imageFiles.slice(i, i + THUMBNAIL_CONCURRENCY);
      
      await Promise.all(chunk.map(async (fileName) => {
        try {
          const filePath = path.join(folderPath, fileName);
          
          // Sharp automatically rotates based on EXIF orientation
          const buffer = await sharp(filePath)
            .rotate() // Auto-rotate based on EXIF
            .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
              fit: 'cover',
              position: 'center'
            })
            .jpeg({ quality: 80 })
            .toBuffer();
          
          thumbnails[fileName] = `data:image/jpeg;base64,${buffer.toString('base64')}`;
        } catch (err) {
          // Skip files that can't be processed
          logger.warn(`[THUMBNAIL] Failed to process: ${fileName}`, err.message);
        }
      }));
    }
    
    return thumbnails;
  });

  // --------------------------------------------------------------------------
  // Image Preview — medium-resolution preview for modal viewing
  // --------------------------------------------------------------------------

  /**
   * Simple LRU cache for preview images.
   * Maps filePath -> { dataUrl, width, height }
   * Evicts oldest entry when size exceeds PREVIEW_CACHE_SIZE.
   */
  const previewCache = new Map();

  ipcMain.handle('get-image-preview', async (event, { folderPath, fileName }) => {
    // SECURITY: Validate folder path is in allowed list
    if (!(await isPathAllowedAsync(folderPath))) {
      logger.warn('🔒 [SECURITY] Blocked get-image-preview on unregistered path:', folderPath);
      return { success: false, error: 'Access denied' };
    }

    // SECURITY: Validate fileName
    if (typeof fileName !== 'string') {
      return { success: false, error: 'Invalid file name' };
    }
    if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
      logger.warn('🔒 [SECURITY] get-image-preview path traversal attempt:', fileName);
      return { success: false, error: 'Invalid file name' };
    }

    // Validate extension
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.tiff', '.tif'];
    const ext = path.extname(fileName).toLowerCase();
    if (!imageExtensions.includes(ext)) {
      return { success: false, error: 'Unsupported image format' };
    }

    const filePath = path.join(folderPath, fileName);

    // Check LRU cache
    if (previewCache.has(filePath)) {
      const cached = previewCache.get(filePath);
      // Move to end (most recently used)
      previewCache.delete(filePath);
      previewCache.set(filePath, cached);
      return { success: true, ...cached };
    }

    try {
      const { data, info } = await sharp(filePath)
        .rotate() // Auto-rotate based on EXIF
        .resize(PREVIEW_MAX_DIMENSION, PREVIEW_MAX_DIMENSION, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: PREVIEW_JPEG_QUALITY })
        .toBuffer({ resolveWithObject: true });

      const result = {
        dataUrl: `data:image/jpeg;base64,${data.toString('base64')}`,
        width: info.width,
        height: info.height,
      };

      // Add to LRU cache, evict oldest if full
      previewCache.set(filePath, result);
      if (previewCache.size > PREVIEW_CACHE_SIZE) {
        const oldestKey = previewCache.keys().next().value;
        previewCache.delete(oldestKey);
      }

      return { success: true, ...result };
    } catch (err) {
      logger.warn(`[PREVIEW] Failed to generate preview: ${fileName}`, err.message);
      return { success: false, error: 'Failed to generate preview for this file format' };
    }
  });
}

// ============================================================================
// GROUP 7: OPERATION HISTORY HANDLERS (4 handlers)
// ============================================================================

function registerHistoryHandlers(ipcMain, getMainWindow, appState) {
  
  /**
   * Handler: Get operation history
   * Returns an array of past operation summaries for the history panel
   */
  ipcMain.handle('get-operation-history', async () => {
    try {
      return rollbackManager.getOperationHistory();
    } catch (error) {
      logger.error('Failed to get operation history:', error);
      return [];
    }
  });

  /**
   * Handler: Validate a history entry
   * Checks if files are still at their expected locations before rollback
   */
  ipcMain.handle('validate-history-entry', async (event, operationId) => {
    try {
      if (!operationId || typeof operationId !== 'string') {
        return { valid: false, error: 'Invalid operation ID' };
      }
      return await rollbackManager.validateHistoryEntry(operationId);
    } catch (error) {
      return { valid: false, error: sanitizeError(error, 'validate-history-entry') };
    }
  });

  /**
   * Handler: Rollback a specific history entry
   * Loads manifest from disk, validates, and executes rollback
   */
  ipcMain.handle('rollback-history-entry', async (event, operationId) => {
    logger.time('HISTORY_ROLLBACK_EXECUTION');
    
    try {
      if (!operationId || typeof operationId !== 'string') {
        return { success: false, error: 'Invalid operation ID' };
      }

      // Reset cancellation flag
      appState.resetBatchCancellation();

      const result = await rollbackManager.executeHistoryRollback(
        operationId,
        appState,
        (progress) => {
          event.sender.send('rollback-progress', progress);
        }
      );

      logger.timeEnd('HISTORY_ROLLBACK_EXECUTION');
      return result;

    } catch (error) {
      logger.timeEnd('HISTORY_ROLLBACK_EXECUTION');
      return { success: false, error: sanitizeError(error, 'rollback-history-entry') };
    }
  });

  /**
   * Handler: Delete a specific history entry
   * Removes from index and deletes manifest file
   */
  ipcMain.handle('delete-history-entry', async (event, operationId) => {
    try {
      if (!operationId || typeof operationId !== 'string') {
        return { success: false, error: 'Invalid operation ID' };
      }

      const removed = await rollbackManager.removeHistoryEntry(operationId);
      return { success: removed };
    } catch (error) {
      return { success: false, error: sanitizeError(error, 'delete-history-entry') };
    }
  });

  /**
   * Handler: Clear all operation history
   */
  ipcMain.handle('clear-operation-history', async () => {
    try {
      const count = await rollbackManager.clearHistory();
      return { success: true, entriesCleared: count };
    } catch (error) {
      return { success: false, error: sanitizeError(error, 'clear-operation-history') };
    }
  });
}

module.exports = { registerIpcHandlers };
