const fs = require('fs').promises;
const path = require('path');
const exifr = require('exifr');

/**
 * Service to handle EXIF data extraction efficiently
 */

// Concurrency limit for EXIF operations to prevent high memory/CPU usage
const CONCURRENCY_LIMIT = 20;

/**
 * Extract date taken from files with concurrency control
 * Fallback to file creation time if EXIF is missing
 * 
 * @param {string[]} files - Array of filenames
 * @param {string} folderPath - Base folder path
 * @returns {Promise<Object>} Map of filename -> timestamp (ms)
 */
async function extractExifDates(files, folderPath) {
  const dateMap = {};
  const totalFiles = files.length;
  
  console.log(`📸 [EXIF] Extracting dates for ${totalFiles} files...`);
  
  // Process files in chunks to limit concurrency
  for (let i = 0; i < totalFiles; i += CONCURRENCY_LIMIT) {
    const chunk = files.slice(i, i + CONCURRENCY_LIMIT);
    
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
      } catch (err) {
        // EXIF parsing failed or not supported (png, video, etc)
        // Silently fall back to file stats
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
        console.warn(`⚠️ [EXIF] Failed to stat file: ${fileName}`, statErr);
        dateMap[fileName] = 0;
      }
    }));
    
    // Optional: could emit progress here if we passed an event emitter
  }
  
  console.log(`📸 [EXIF] Date extraction complete.`);
  return dateMap;
}

module.exports = {
  extractExifDates
};
