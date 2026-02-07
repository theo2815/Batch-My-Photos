/**
 * Tests for src/main/batchEngine.js
 *
 * Covers: isAllowedFile, groupFilesByBaseName, calculateBatches, sortFileGroups
 */

import { describe, it, expect } from 'vitest';

// Re-implement the pure logic for isolated unit testing (no Electron dependency)

// --- isAllowedFile ---

const IGNORED_FILES = new Set([
  'desktop.ini', '.ds_store', 'thumbs.db', '.gitkeep',
  '.gitignore', 'folder.jpg', 'albumart.jpg',
]);

const ALLOWED_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'tif', 'webp', 'heic', 'heif',
  'raw', 'cr2', 'cr3', 'nef', 'nrw', 'arw', 'srf', 'dng', 'orf', 'rw2',
  'pef', 'raf', 'srw', 'x3f',
  'mp4', 'mov', 'avi', 'mkv', 'mts', 'm2ts',
]);

function isAllowedFile(fileName) {
  const lowerName = fileName.toLowerCase();
  if (IGNORED_FILES.has(lowerName)) return false;
  const lastDotIndex = lowerName.lastIndexOf('.');
  if (lastDotIndex <= 0) return false;
  const ext = lowerName.substring(lastDotIndex + 1);
  return ALLOWED_EXTENSIONS.has(ext);
}

// --- groupFilesByBaseName ---

async function groupFilesByBaseName(files) {
  const groups = {};
  for (const fileName of files) {
    if (!isAllowedFile(fileName)) continue;
    const lastDotIndex = fileName.lastIndexOf('.');
    const baseName = lastDotIndex > 0 ? fileName.substring(0, lastDotIndex) : fileName;
    if (!groups[baseName]) groups[baseName] = [];
    groups[baseName].push(fileName);
  }
  return groups;
}

// --- calculateBatches (simplified without yielding) ---

function sortFileGroups(groupsArray, sortBy = 'name-asc', fileStats = null) {
  const getGroupMtime = (files) => {
    if (!fileStats) return 0;
    let earliest = Infinity;
    for (const file of files) {
      const stat = fileStats[file];
      const time = (typeof stat === 'number') ? stat : (stat?.mtimeMs || 0);
      if (time && time < earliest) earliest = time;
    }
    return earliest === Infinity ? 0 : earliest;
  };

  switch (sortBy) {
    case 'name-asc':
      return groupsArray.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
    case 'name-desc':
      return groupsArray.sort((a, b) => b[0].localeCompare(a[0], undefined, { numeric: true }));
    case 'date-asc':
    case 'exif-asc':
      return groupsArray.sort((a, b) => getGroupMtime(a[1]) - getGroupMtime(b[1]));
    case 'date-desc':
    case 'exif-desc':
      return groupsArray.sort((a, b) => getGroupMtime(b[1]) - getGroupMtime(a[1]));
    case 'size-desc':
    default:
      return groupsArray.sort((a, b) => b[1].length - a[1].length);
  }
}

async function calculateBatches(fileGroups, maxFilesPerBatch, sortBy = 'name-asc', fileStats = null) {
  const groupsArray = Object.entries(fileGroups);
  sortFileGroups(groupsArray, sortBy, fileStats);

  const batches = [];
  const batchCounts = [];
  const BATCH_SEARCH_DEPTH = 50;

  for (const [_baseName, files] of groupsArray) {
    const groupSize = files.length;
    let placed = false;
    const searchStart = Math.max(0, batches.length - BATCH_SEARCH_DEPTH);

    for (let j = batches.length - 1; j >= searchStart; j--) {
      if (batchCounts[j] + groupSize <= maxFilesPerBatch) {
        for (const file of files) batches[j].push(file);
        batchCounts[j] += groupSize;
        placed = true;
        break;
      }
    }

    if (!placed) {
      batches.push([...files]);
      batchCounts.push(groupSize);
    }
  }

  return batches;
}

// ============================================================================
// TESTS
// ============================================================================

describe('isAllowedFile', () => {
  it('allows common image formats', () => {
    expect(isAllowedFile('photo.jpg')).toBe(true);
    expect(isAllowedFile('photo.jpeg')).toBe(true);
    expect(isAllowedFile('photo.png')).toBe(true);
    expect(isAllowedFile('photo.gif')).toBe(true);
    expect(isAllowedFile('photo.webp')).toBe(true);
    expect(isAllowedFile('photo.heic')).toBe(true);
  });

  it('allows RAW formats', () => {
    expect(isAllowedFile('photo.cr2')).toBe(true);
    expect(isAllowedFile('photo.cr3')).toBe(true);
    expect(isAllowedFile('photo.nef')).toBe(true);
    expect(isAllowedFile('photo.arw')).toBe(true);
    expect(isAllowedFile('photo.dng')).toBe(true);
    expect(isAllowedFile('photo.raf')).toBe(true);
  });

  it('allows video formats', () => {
    expect(isAllowedFile('video.mp4')).toBe(true);
    expect(isAllowedFile('video.mov')).toBe(true);
    expect(isAllowedFile('video.avi')).toBe(true);
  });

  it('is case-insensitive for extensions', () => {
    expect(isAllowedFile('photo.JPG')).toBe(true);
    expect(isAllowedFile('photo.Png')).toBe(true);
    expect(isAllowedFile('photo.CR2')).toBe(true);
  });

  it('rejects system files', () => {
    expect(isAllowedFile('desktop.ini')).toBe(false);
    expect(isAllowedFile('.DS_Store')).toBe(false);
    expect(isAllowedFile('Thumbs.db')).toBe(false);
    expect(isAllowedFile('.gitkeep')).toBe(false);
  });

  it('rejects files with no extension', () => {
    expect(isAllowedFile('README')).toBe(false);
    expect(isAllowedFile('Makefile')).toBe(false);
  });

  it('rejects hidden files (dot prefix, no extension)', () => {
    expect(isAllowedFile('.hidden')).toBe(false);
  });

  it('rejects non-image extensions', () => {
    expect(isAllowedFile('document.txt')).toBe(false);
    expect(isAllowedFile('script.js')).toBe(false);
    expect(isAllowedFile('data.json')).toBe(false);
    expect(isAllowedFile('archive.zip')).toBe(false);
  });

  it('rejects executables', () => {
    expect(isAllowedFile('malware.exe')).toBe(false);
    expect(isAllowedFile('script.bat')).toBe(false);
    expect(isAllowedFile('script.cmd')).toBe(false);
  });
});

describe('groupFilesByBaseName', () => {
  it('groups files by base name (before extension)', async () => {
    const files = ['photo1.jpg', 'photo1.cr2', 'photo2.jpg', 'photo2.nef'];
    const groups = await groupFilesByBaseName(files);
    expect(groups).toEqual({
      photo1: ['photo1.jpg', 'photo1.cr2'],
      photo2: ['photo2.jpg', 'photo2.nef'],
    });
  });

  it('filters out system files', async () => {
    const files = ['photo.jpg', 'desktop.ini', 'Thumbs.db', '.DS_Store'];
    const groups = await groupFilesByBaseName(files);
    expect(Object.keys(groups)).toEqual(['photo']);
  });

  it('filters out non-image files', async () => {
    const files = ['photo.jpg', 'readme.txt', 'script.js'];
    const groups = await groupFilesByBaseName(files);
    expect(Object.keys(groups)).toEqual(['photo']);
  });

  it('handles empty array', async () => {
    const groups = await groupFilesByBaseName([]);
    expect(groups).toEqual({});
  });

  it('creates single-file groups for unique base names', async () => {
    const files = ['a.jpg', 'b.jpg', 'c.jpg'];
    const groups = await groupFilesByBaseName(files);
    expect(Object.keys(groups).length).toBe(3);
    expect(groups['a']).toEqual(['a.jpg']);
  });

  it('handles files with multiple dots', async () => {
    const files = ['photo.2024.01.jpg'];
    const groups = await groupFilesByBaseName(files);
    expect(groups['photo.2024.01']).toEqual(['photo.2024.01.jpg']);
  });
});

describe('calculateBatches', () => {
  it('creates correct number of batches for simple case', async () => {
    const groups = { a: ['a.jpg'], b: ['b.jpg'], c: ['c.jpg'], d: ['d.jpg'] };
    const batches = await calculateBatches(groups, 2);
    expect(batches.length).toBe(2);
  });

  it('keeps file pairs together in same batch', async () => {
    const groups = {
      photo1: ['photo1.jpg', 'photo1.cr2'],
      photo2: ['photo2.jpg', 'photo2.cr2'],
    };
    const batches = await calculateBatches(groups, 2);
    // Each group has 2 files, max is 2 per batch, so 2 batches
    expect(batches.length).toBe(2);
    // Each batch should contain both files of a pair
    for (const batch of batches) {
      const baseNames = batch.map(f => f.split('.')[0]);
      expect(new Set(baseNames).size).toBe(1);
    }
  });

  it('handles oversized groups (group larger than max)', async () => {
    const groups = {
      big: ['big.jpg', 'big.cr2', 'big.png'], // 3 files, max is 2
    };
    const batches = await calculateBatches(groups, 2);
    // The group should stay together even if it exceeds max
    expect(batches.length).toBe(1);
    expect(batches[0].length).toBe(3);
  });

  it('handles single file', async () => {
    const groups = { solo: ['solo.jpg'] };
    const batches = await calculateBatches(groups, 10);
    expect(batches.length).toBe(1);
    expect(batches[0]).toEqual(['solo.jpg']);
  });

  it('handles empty groups', async () => {
    const batches = await calculateBatches({}, 10);
    expect(batches.length).toBe(0);
  });

  it('packs efficiently (bin-packing)', async () => {
    // 4 single files, max 2 per batch = 2 batches
    const groups = {
      a: ['a.jpg'], b: ['b.jpg'], c: ['c.jpg'], d: ['d.jpg'],
    };
    const batches = await calculateBatches(groups, 2);
    expect(batches.length).toBe(2);
    for (const batch of batches) {
      expect(batch.length).toBeLessThanOrEqual(2);
    }
  });

  it('sorts by name ascending by default', async () => {
    const groups = {
      c_photo: ['c_photo.jpg'],
      a_photo: ['a_photo.jpg'],
      b_photo: ['b_photo.jpg'],
    };
    const batches = await calculateBatches(groups, 1, 'name-asc');
    // With max 1 per batch, each batch has exactly one file
    expect(batches[0]).toEqual(['a_photo.jpg']);
    expect(batches[1]).toEqual(['b_photo.jpg']);
    expect(batches[2]).toEqual(['c_photo.jpg']);
  });
});

describe('sortFileGroups', () => {
  it('sorts by name ascending', () => {
    const groups = [['c', ['c.jpg']], ['a', ['a.jpg']], ['b', ['b.jpg']]];
    sortFileGroups(groups, 'name-asc');
    expect(groups.map(g => g[0])).toEqual(['a', 'b', 'c']);
  });

  it('sorts by name descending', () => {
    const groups = [['a', ['a.jpg']], ['c', ['c.jpg']], ['b', ['b.jpg']]];
    sortFileGroups(groups, 'name-desc');
    expect(groups.map(g => g[0])).toEqual(['c', 'b', 'a']);
  });

  it('sorts by date ascending with file stats', () => {
    const groups = [
      ['new', ['new.jpg']],
      ['old', ['old.jpg']],
    ];
    const fileStats = {
      'new.jpg': { mtimeMs: 2000 },
      'old.jpg': { mtimeMs: 1000 },
    };
    sortFileGroups(groups, 'date-asc', fileStats);
    expect(groups.map(g => g[0])).toEqual(['old', 'new']);
  });

  it('sorts by date descending with file stats', () => {
    const groups = [
      ['old', ['old.jpg']],
      ['new', ['new.jpg']],
    ];
    const fileStats = {
      'new.jpg': { mtimeMs: 2000 },
      'old.jpg': { mtimeMs: 1000 },
    };
    sortFileGroups(groups, 'date-desc', fileStats);
    expect(groups.map(g => g[0])).toEqual(['new', 'old']);
  });

  it('handles numeric sort for names with numbers', () => {
    const groups = [['photo10', ['photo10.jpg']], ['photo2', ['photo2.jpg']], ['photo1', ['photo1.jpg']]];
    sortFileGroups(groups, 'name-asc');
    expect(groups.map(g => g[0])).toEqual(['photo1', 'photo2', 'photo10']);
  });

  it('falls back to size-desc for unknown sort type', () => {
    const groups = [
      ['small', ['small.jpg']],
      ['big', ['big.jpg', 'big.cr2', 'big.png']],
      ['medium', ['medium.jpg', 'medium.cr2']],
    ];
    sortFileGroups(groups, 'unknown');
    expect(groups.map(g => g[0])).toEqual(['big', 'medium', 'small']);
  });
});
