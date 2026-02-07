/**
 * Batch Naming Utility
 * 
 * Shared module for generating batch folder names.
 * Used by both the main process (ipcHandlers) and the renderer (BatchPreview).
 * 
 * IMPORTANT: This file must remain free of Node.js-only or Electron-only
 * dependencies so it can be bundled by Vite for the renderer AND required
 * by the main process.
 */

/**
 * Generates a folder name based on the pattern and batch index.
 * Supports variables: {count}, {date}, {year}, {month}
 * 
 * @param {string} pattern - The user-provided naming pattern
 * @param {number} batchIndex - 0-based index of the batch
 * @param {number} totalBatches - Total number of batches (for padding)
 * @returns {string} The formatted folder name
 */
function generateBatchFolderName(pattern, batchIndex, totalBatches) {
  let name = pattern || 'Batch';
  
  // Default behavior: if no {count} variable, append _{count} to match legacy behavior
  // Use case-insensitive check to match the case-insensitive replacement below
  if (!name.toLowerCase().includes('{count}')) {
    name = `${name}_{count}`;
  }
  
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
  
  // Pad count based on total batches magnitude (min 3 digits)
  // e.g. 10 batches -> 01, 100 batches -> 001
  const padding = Math.max(3, String(totalBatches).length);
  const count = String(batchIndex + 1).padStart(padding, '0');
  
  return name
    .replace(/{year}/gi, year)
    .replace(/{month}/gi, month)
    .replace(/{date}/gi, date)
    .replace(/{count}/gi, count);
}

// CommonJS export — Vite handles CJS-to-ESM conversion transparently
// for the renderer, and Node.js require() works in the main process.
module.exports = { generateBatchFolderName };
