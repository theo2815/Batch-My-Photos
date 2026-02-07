/**
 * Rollback Manager - Handles undo/rollback of batch operations
 * 
 * This module stores a manifest of the last batch operation to enable rollback.
 * The manifest is session-based (in-memory) and cleared on app restart.
 * 
 * Key features:
 * - Stores original and current file paths for reverse operations
 * - Session-based: manifest is lost on app close (by design)
 * - Only supports "move" mode operations (copy mode doesn't need rollback)
 */

const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { FILE_MOVE_CHUNK_SIZE } = require('./src/main/constants');

// In-memory rollback manifest (session-based, lost on app restart)
let rollbackManifest = null;

/**
 * Save a rollback manifest after successful batch execution
 * 
 * @param {Object} params - Operation parameters
 * @param {string} params.sourceFolder - Original source folder path
 * @param {string} params.outputFolder - Output folder where batches were created
 * @param {string} params.mode - 'move' or 'copy' (only 'move' is saved)
 * @param {Array<Object>} params.operations - Array of { fileName, sourcePath, destPath }
 * @param {Array<string>} params.batchFolders - Names of created batch folders
 * @param {number} params.totalFiles - Total files processed
 * @returns {boolean} True if manifest was saved
 */
function saveRollbackManifest({ sourceFolder, outputFolder, mode, operations, batchFolders, totalFiles }) {
  // Only save manifest for 'move' mode - copy mode doesn't need rollback
  if (mode !== 'move') {
    console.log('🔄 [ROLLBACK] Skipping manifest save - only supported for move mode');
    return false;
  }
  
  rollbackManifest = {
    operationId: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
    createdAt: new Date().toISOString(),
    mode,
    sourceFolder,
    outputFolder,
    batchFolders: batchFolders || [],
    totalFiles,
    // Store operations with original and current paths for reversal
    operations: operations.map(op => ({
      fileName: op.fileName,
      originalPath: op.sourcePath,  // Where file was before batch
      currentPath: op.destPath      // Where file is now (in batch folder)
    }))
  };
  
  console.log('🔄 [ROLLBACK] Manifest saved:', rollbackManifest.operationId);
  console.log('   - Files:', totalFiles);
  console.log('   - Batch folders:', batchFolders?.length || 0);
  
  return true;
}

/**
 * Check if rollback is available
 * 
 * @returns {Object|null} Summary info if available, null otherwise
 */
function checkRollbackAvailable() {
  if (!rollbackManifest) {
    return null;
  }
  
  return {
    operationId: rollbackManifest.operationId,
    createdAt: rollbackManifest.createdAt,
    sourceFolder: rollbackManifest.sourceFolder,
    totalFiles: rollbackManifest.totalFiles,
    batchFolderCount: rollbackManifest.batchFolders?.length || 0
  };
}

/**
 * Get the full rollback manifest (for internal use)
 * 
 * @returns {Object|null} Full manifest or null
 */
function getRollbackManifest() {
  return rollbackManifest;
}

/**
 * Clear the rollback manifest
 * Called when user dismisses undo option or starts a new operation
 */
function clearRollbackManifest() {
  if (rollbackManifest) {
    console.log('🔄 [ROLLBACK] Manifest cleared:', rollbackManifest.operationId);
  }
  rollbackManifest = null;
}

/**
 * Execute rollback operation - move files back to original locations
 * 
 * @param {Object} appState - App state with batchCancelled flag
 * @param {Function} progressCallback - Called with progress updates
 * @returns {Promise<Object>} Result object with success status
 */
async function executeRollback(appState, progressCallback) {
  if (!rollbackManifest) {
    return { success: false, error: 'No rollback manifest available' };
  }
  
  const { operations, batchFolders, outputFolder, sourceFolder } = rollbackManifest;
  
  console.log('🔄 [ROLLBACK] Starting rollback operation');
  console.log('   - Files to restore:', operations.length);
  
  let restoredFiles = 0;
  const errors = [];
  
  // Reset cancellation flag
  if (appState?.resetBatchCancellation) {
    appState.resetBatchCancellation();
  }
  
  // Process files in chunks for responsiveness
  for (let i = 0; i < operations.length; i += FILE_MOVE_CHUNK_SIZE) {
    // Check for cancellation
    if (appState?.batchCancelled) {
      console.log('⚠️ [ROLLBACK] Operation cancelled');
      break;
    }
    
    const chunk = operations.slice(i, i + FILE_MOVE_CHUNK_SIZE);
    
    for (const op of chunk) {
      try {
        // Check if file still exists at current location
        if (!fs.existsSync(op.currentPath)) {
          errors.push({ file: op.fileName, error: 'File not found at batch location' });
          continue;
        }
        
        // Ensure original directory exists (it should, but just in case)
        const originalDir = path.dirname(op.originalPath);
        if (!fs.existsSync(originalDir)) {
          await fsPromises.mkdir(originalDir, { recursive: true });
        }
        
        // Move file back to original location
        fs.renameSync(op.currentPath, op.originalPath);
        restoredFiles++;
        
      } catch (err) {
        errors.push({ file: op.fileName, error: err.message });
      }
    }
    
    // Send progress update
    if (progressCallback) {
      progressCallback({
        current: Math.min(i + FILE_MOVE_CHUNK_SIZE, operations.length),
        total: operations.length,
        restoredFiles
      });
    }
    
    // Yield to event loop
    await new Promise(r => setImmediate(r));
  }
  
  // Try to delete empty batch folders
  let deletedFolders = 0;
  if (!appState?.batchCancelled && batchFolders && batchFolders.length > 0) {
    for (const folderName of batchFolders) {
      const folderPath = path.join(outputFolder, folderName);
      try {
        // Check if folder is empty
        const entries = await fsPromises.readdir(folderPath);
        if (entries.length === 0) {
          await fsPromises.rmdir(folderPath);
          deletedFolders++;
          console.log('🗑️ [ROLLBACK] Deleted empty batch folder:', folderName);
        } else {
          console.log('⚠️ [ROLLBACK] Batch folder not empty, skipping:', folderName);
        }
      } catch (err) {
        // Folder might not exist or have permission issues - ignore
        console.log('⚠️ [ROLLBACK] Could not delete batch folder:', folderName, err.message);
      }
    }
  }
  
  const wasCancelled = appState?.batchCancelled || false;
  
  // Clear manifest on success (even if some errors occurred)
  if (!wasCancelled) {
    clearRollbackManifest();
  }
  
  console.log('🔄 [ROLLBACK] Complete');
  console.log('   - Files restored:', restoredFiles);
  console.log('   - Folders deleted:', deletedFolders);
  console.log('   - Errors:', errors.length);
  
  return {
    success: !wasCancelled && errors.length === 0,
    cancelled: wasCancelled,
    restoredFiles,
    totalFiles: operations.length,
    deletedFolders,
    sourceFolder,
    hasErrors: errors.length > 0,
    errorCount: errors.length,
    errors: errors.length > 0 ? errors.slice(0, 10) : null
  };
}

module.exports = {
  saveRollbackManifest,
  checkRollbackAvailable,
  getRollbackManifest,
  clearRollbackManifest,
  executeRollback
};
