/**
 * Batch Processing Engine
 * Core algorithms for grouping and batching files
 * 
 * SECURITY FIX: Added file extension validation to filter out
 * system files and only process known image formats.
 */

const {
  GROUP_YIELD_THRESHOLD,
  BATCH_YIELD_THRESHOLD,
  BATCH_SEARCH_DEPTH
} = require('./constants');
const logger = require('../utils/logger');

/**
 * System files to always ignore (case-insensitive)
 * These files are created by operating systems and should never be batched
 */
const IGNORED_FILES = new Set([
  'desktop.ini',
  '.ds_store',
  'thumbs.db',
  '.gitkeep',
  '.gitignore',
  'folder.jpg',
  'albumart.jpg'
]);

/**
 * Allowed file extensions for photo files (case-insensitive)
 * Includes common image formats and RAW formats from major camera manufacturers
 */
const ALLOWED_EXTENSIONS = new Set([
  // Common image formats
  'jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'tif', 'webp', 'heic', 'heif',
  // RAW formats by manufacturer
  'raw',           // Generic RAW
  'cr2', 'cr3',    // Canon
  'nef', 'nrw',    // Nikon
  'arw', 'srf',    // Sony
  'dng',           // Adobe DNG / Leica / some phones
  'orf',           // Olympus
  'rw2',           // Panasonic
  'pef',           // Pentax
  'raf',           // Fujifilm
  'srw',           // Samsung
  'x3f',           // Sigma
  // Video formats (photographers often shoot video too)
  'mp4', 'mov', 'avi', 'mkv', 'mts', 'm2ts'
]);

/**
 * Check if a file should be processed based on extension
 * @param {string} fileName - The file name to check
 * @returns {boolean} True if file should be processed
 */
function isAllowedFile(fileName) {
  const lowerName = fileName.toLowerCase();
  
  // Skip ignored system files
  if (IGNORED_FILES.has(lowerName)) {
    return false;
  }
  
  // Get extension
  const lastDotIndex = lowerName.lastIndexOf('.');
  if (lastDotIndex <= 0) {
    return false; // No extension or hidden file
  }
  
  const ext = lowerName.substring(lastDotIndex + 1);
  return ALLOWED_EXTENSIONS.has(ext);
}

/**
 * Yield to the main event loop to keep UI responsive.
 * Uses setImmediate to allow other I/O and UI events to process.
 */
const yieldToMain = () => new Promise(resolve => setImmediate(resolve));

/**
 * Optimized grouping with yielding for loop responsiveness
 * Filters out system files and non-image files
 * 
 * @param {string[]} files - Array of file names
 * @returns {Promise<Object>} Map of baseName -> array of fileNames
 */
async function groupFilesByBaseName(files) {
  const groups = {};
  let skippedCount = 0;
  
  for (let i = 0; i < files.length; i++) {
    const fileName = files[i];
    
    // Filter out non-allowed files
    if (!isAllowedFile(fileName)) {
      skippedCount++;
      continue;
    }
    
    const lastDotIndex = fileName.lastIndexOf('.');
    const baseName = lastDotIndex > 0 
      ? fileName.substring(0, lastDotIndex) 
      : fileName;
    
    if (!groups[baseName]) {
      groups[baseName] = [];
    }
    groups[baseName].push(fileName);
    
    // Safety yield for huge folders
    if (i % GROUP_YIELD_THRESHOLD === 0 && i > 0) {
      await yieldToMain();
    }
  }
  
  if (skippedCount > 0) {
    logger.log(`📂 [BATCH] Skipped ${skippedCount} non-image/system files`);
  }
  
  return groups;
}

/**
 * Sort file groups based on user preference
 * This determines the order files are assigned to batches
 * 
 * @param {Array<[string, string[]]>} groupsArray - Array of [baseName, files]
 * @param {string} sortBy - Sorting preference
 * @param {Object} [fileStats] - Map of fileName -> { mtimeMs, size } OR fileName -> timestamp (for EXIF)
 * @returns {Array} Sorted groups array
 */
function sortFileGroups(groupsArray, sortBy = 'name-asc', fileStats = null) {
  // Helper to get earliest mtime for a group
  const getGroupMtime = (files) => {
    if (!fileStats) return 0;
    let earliest = Infinity;
    let latest = 0;
    
    for (const file of files) {
      const stat = fileStats[file];
      // Handle both object style {mtimeMs} and direct timestamp (EXIF service)
      const time = (typeof stat === 'number') ? stat : (stat?.mtimeMs || 0);
      
      if (time) {
        if (time < earliest) earliest = time;
        if (time > latest) latest = time;
      }
    }
    // Return earliest by default, could be configurable
    return earliest === Infinity ? 0 : earliest;
  };

  switch (sortBy) {
    case 'name-asc':
      // Alphabetical A-Z
      return groupsArray.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
    
    case 'name-desc':
      // Alphabetical Z-A
      return groupsArray.sort((a, b) => b[0].localeCompare(a[0], undefined, { numeric: true }));
    
    case 'date-asc':
    case 'exif-asc':
      // Oldest first
      return groupsArray.sort((a, b) => {
        const mtimeA = getGroupMtime(a[1]);
        const mtimeB = getGroupMtime(b[1]);
        return mtimeA - mtimeB;
      });
    
    case 'date-desc':
    case 'exif-desc':
      // Newest first
      return groupsArray.sort((a, b) => {
        const mtimeA = getGroupMtime(a[1]);
        const mtimeB = getGroupMtime(b[1]);
        return mtimeB - mtimeA;
      });
    
    case 'size-desc':
    default:
      // Default: sort by group size (largest first) for optimal bin-packing
      return groupsArray.sort((a, b) => b[1].length - a[1].length);
  }
}

/**
 * Optimized batch calculation with memory efficiency
 * 
 * PERFORMANCE FIX: 
 * - Warns about large datasets to prevent UI freeze
 * - Avoids spread operator which can cause stack overflow on >65k items
 * - Uses manual loops for memory-efficient array operations
 * 
 * @param {Object} fileGroups - Map of baseName -> fileNames
 * @param {number} maxFilesPerBatch - Max files allowed per folder
 * @param {string} [sortBy='name-asc'] - Sort order for file groups
 * @param {Object} [fileStats=null] - Map of fileName -> stats
 * @returns {Promise<Array<Array<string>>>} Array of batches (array of filenames)
 */
async function calculateBatches(fileGroups, maxFilesPerBatch, sortBy = 'name-asc', fileStats = null) {
  const groupsArray = Object.entries(fileGroups);
  const groupCount = groupsArray.length;
  
  // Memory warning for very large datasets
  if (groupCount > 50000) {
    logger.warn(`⚠️ [MEMORY] Large dataset detected: ${groupCount.toLocaleString()} file groups`);
    logger.warn('⚠️ [MEMORY] This may take a moment to process...');
  }
  
  // Sort groups based on user preference
  sortFileGroups(groupsArray, sortBy, fileStats);
  logger.log(`📊 [SORT] File groups sorted by: ${sortBy}`);
  
  const batches = [];
  const batchCounts = [];
  
  for (let i = 0; i < groupsArray.length; i++) {
    const [_baseName, files] = groupsArray[i];
    const groupSize = files.length;
    
    let placed = false;
    // Iterate backwards - optimization heuristic: 
    // Newer batches are at the end, more likely to have space.
    // BOUNDED SEARCH: Only check the last N batches to ensure O(N) complexity
    const searchStart = Math.max(0, batches.length - BATCH_SEARCH_DEPTH);
    
    for (let j = batches.length - 1; j >= searchStart; j--) {
      if (batchCounts[j] + groupSize <= maxFilesPerBatch) {
        // MEMORY FIX: Use manual loop instead of spread operator
        // Spread operator can cause stack overflow on arrays >65k items
        for (let k = 0; k < files.length; k++) {
          batches[j].push(files[k]);
        }
        batchCounts[j] += groupSize;
        placed = true;
        break;
      }
    }
    
    if (!placed) {
      // MEMORY FIX: Create new batch with manual loop instead of [...files]
      // This avoids creating an intermediate array copy
      const newBatch = new Array(groupSize);
      for (let k = 0; k < files.length; k++) {
        newBatch[k] = files[k];
      }
      batches.push(newBatch);
      batchCounts.push(groupSize);
    }
    
    // Yield periodically to keep UI responsive
    if (i % BATCH_YIELD_THRESHOLD === 0 && i > 0) {
      await yieldToMain();
    }
  }
  
  // Log stats for large operations
  if (groupCount > 10000) {
    const totalFiles = batchCounts.reduce((sum, count) => sum + count, 0);
    logger.log(`📊 [BATCH] Processed ${groupCount.toLocaleString()} groups into ${batches.length} batches (${totalFiles.toLocaleString()} files)`);
  }
  
  return batches;
}

module.exports = {
  groupFilesByBaseName,
  calculateBatches,
  sortFileGroups,
  yieldToMain,
  isAllowedFile,
  ALLOWED_EXTENSIONS,
  IGNORED_FILES
};

