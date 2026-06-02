const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const exifr = require('exifr');
const { EXIF_CONCURRENCY } = require('./constants');
const logger = require('../utils/logger');

/**
 * Service to handle EXIF data extraction efficiently
 */

// ============================================================================
// IN-MEMORY CACHE
// ============================================================================

/**
 * Cache entry: { cacheKey: string, dateMap: Object }
 * Only one folder is cached at a time (the current working folder).
 * Cleared automatically when the folder or file list changes.
 */
let exifCache = { cacheKey: null, dateMap: null };

/**
 * Generate a cache key from folderPath + file list.
 * Uses SHA-256 for security, and avoids sorting (readdir order is
 * deterministic per call — sorting 50k+ names was a perf bottleneck).
 * Instead we include the file count so any add/remove invalidates.
 * 
 * @param {string} folderPath
 * @param {string[]} files
 * @returns {string} Cache key
 */
function buildCacheKey(folderPath, files) {
  const hash = crypto.createHash('sha256');
  hash.update(folderPath);
  hash.update(String(files.length));
  // Hash first, last, and a few samples for fast invalidation without sorting
  if (files.length > 0) hash.update(files[0]);
  if (files.length > 1) hash.update(files[files.length - 1]);
  if (files.length > 10) hash.update(files[Math.floor(files.length / 2)]);
  return hash.digest('hex');
}

/**
 * Clear the EXIF cache (e.g. when switching folders).
 */
function clearCache() {
  exifCache = { cacheKey: null, dateMap: null };
}

// ============================================================================
// MAIN EXTRACTION
// ============================================================================

/**
 * Extract date taken from files with concurrency control.
 * Results are cached in memory — repeat calls with the same folder and
 * file list return instantly.
 * 
 * Fallback to file creation time if EXIF is missing.
 * 
 * @param {string[]} files - Array of filenames
 * @param {string} folderPath - Base folder path
 * @returns {Promise<Object>} Map of filename -> timestamp (ms)
 */
async function extractExifDates(files, folderPath) {
  // Check cache first
  const cacheKey = buildCacheKey(folderPath, files);
  if (exifCache.cacheKey === cacheKey && exifCache.dateMap) {
    logger.log(`📸 [EXIF] Cache hit — returning ${files.length} cached dates`);
    return exifCache.dateMap;
  }

  const dateMap = {};
  const totalFiles = files.length;
  
  logger.log(`📸 [EXIF] Extracting dates for ${totalFiles} files...`);
  
  // Process files in chunks to limit concurrency
  for (let i = 0; i < totalFiles; i += EXIF_CONCURRENCY) {
    const chunk = files.slice(i, i + EXIF_CONCURRENCY);
    
    await Promise.all(chunk.map(async (fileName) => {
      const filePath = path.join(folderPath, fileName);
      
      try {
        // 1. Try to read EXIF DateTimeOriginal
        // Only read the necessary segment for speed (first few KB usually)
        const output = await exifr.parse(filePath, { 
          pick: ['DateTimeOriginal'], 
          tiff: true,   // Needed for some raw formats
          ifd0: false,  // Skip unnecessary IFDs for speed
          gps: false,
          xmp: false
        });

        if (output && output.DateTimeOriginal) {
          // exifr returns a Date object directly
          dateMap[fileName] = output.DateTimeOriginal.getTime();
          return;
        }
      } catch (_err) {
        // EXIF parsing failed or not supported (png, video, etc) — fall back to file stats
      }

      // 2. Fallback to file creation/modification time
      try {
        const stats = await fs.stat(filePath);
        // "Date" usually implies the earliest moment content existed.
        // On Windows, birthtime resets on copy, while mtime is preserved. 
        // We take the minimum (earliest) to best guess the original creation date.
        const t1 = stats.birthtimeMs || Infinity;
        const t2 = stats.mtimeMs || Infinity;
        const earliestTime = Math.min(t1, t2);
        
        dateMap[fileName] = (earliestTime === Infinity) ? 0 : earliestTime;
      } catch (statErr) {
        logger.warn(`⚠️ [EXIF] Failed to stat file: ${fileName}`, statErr);
        dateMap[fileName] = 0;
      }
    }));
  }
  
  // Store in cache
  exifCache = { cacheKey, dateMap };
  
  logger.log(`📸 [EXIF] Date extraction complete. Results cached.`);
  return dateMap;
}

module.exports = {
  extractExifDates,
  clearCache
};
