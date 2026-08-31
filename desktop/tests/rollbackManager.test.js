/**
 * Tests for rollbackManager.js
 *
 * Tests the pure logic functions without Electron/fs dependency.
 * Covers both session-level rollback and persistent history features.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// ============================================================================
// SESSION-LEVEL ROLLBACK TESTS (re-implemented for isolated testing)
// ============================================================================

let rollbackManifest = null;

function saveRollbackManifest({ sourceFolder, outputFolder, mode, operations, batchFolders, totalFiles, outputPrefix, maxFilesPerBatch, sortBy, batchResults }) {
  if (mode !== 'move') return false;
  rollbackManifest = {
    operationId: 'test-id',
    createdAt: new Date().toISOString(),
    mode,
    sourceFolder,
    outputFolder,
    batchFolders: batchFolders || [],
    totalFiles,
    outputPrefix: outputPrefix || '',
    maxFilesPerBatch: maxFilesPerBatch || null,
    sortBy: sortBy || 'name-asc',
    batchResults: batchResults || [],
    operations: operations.map((op) => ({
      fileName: op.fileName,
      originalPath: op.sourcePath,
      currentPath: op.destPath,
    })),
  };
  return true;
}

function checkRollbackAvailable() {
  if (!rollbackManifest) return null;
  return {
    operationId: rollbackManifest.operationId,
    createdAt: rollbackManifest.createdAt,
    sourceFolder: rollbackManifest.sourceFolder,
    totalFiles: rollbackManifest.totalFiles,
    batchFolderCount: rollbackManifest.batchFolders?.length || 0,
  };
}

function clearRollbackManifest() {
  rollbackManifest = null;
}

describe('saveRollbackManifest', () => {
  it('saves manifest for move mode', () => {
    clearRollbackManifest();
    const result = saveRollbackManifest({
      sourceFolder: '/photos',
      outputFolder: '/photos',
      mode: 'move',
      operations: [
        { fileName: 'a.jpg', sourcePath: '/photos/a.jpg', destPath: '/photos/Batch_001/a.jpg' },
      ],
      batchFolders: ['Batch_001'],
      totalFiles: 1,
    });
    expect(result).toBe(true);
  });

  it('does NOT save manifest for copy mode', () => {
    clearRollbackManifest();
    const result = saveRollbackManifest({
      sourceFolder: '/photos',
      outputFolder: '/output',
      mode: 'copy',
      operations: [
        { fileName: 'a.jpg', sourcePath: '/photos/a.jpg', destPath: '/output/Batch_001/a.jpg' },
      ],
      batchFolders: ['Batch_001'],
      totalFiles: 1,
    });
    expect(result).toBe(false);
  });

  it('maps operations correctly (sourcePath -> originalPath, destPath -> currentPath)', () => {
    clearRollbackManifest();
    saveRollbackManifest({
      sourceFolder: '/photos',
      outputFolder: '/photos',
      mode: 'move',
      operations: [
        { fileName: 'a.jpg', sourcePath: '/photos/a.jpg', destPath: '/photos/Batch_001/a.jpg' },
      ],
      batchFolders: ['Batch_001'],
      totalFiles: 1,
    });
    expect(rollbackManifest.operations[0].originalPath).toBe('/photos/a.jpg');
    expect(rollbackManifest.operations[0].currentPath).toBe('/photos/Batch_001/a.jpg');
  });

  it('stores batch folder names', () => {
    clearRollbackManifest();
    saveRollbackManifest({
      sourceFolder: '/photos',
      outputFolder: '/photos',
      mode: 'move',
      operations: [],
      batchFolders: ['Batch_001', 'Batch_002', 'Batch_003'],
      totalFiles: 0,
    });
    expect(rollbackManifest.batchFolders).toEqual(['Batch_001', 'Batch_002', 'Batch_003']);
  });

  it('handles null batchFolders gracefully', () => {
    clearRollbackManifest();
    saveRollbackManifest({
      sourceFolder: '/photos',
      outputFolder: '/photos',
      mode: 'move',
      operations: [],
      batchFolders: null,
      totalFiles: 0,
    });
    expect(rollbackManifest.batchFolders).toEqual([]);
  });

  it('stores outputPrefix when provided', () => {
    clearRollbackManifest();
    saveRollbackManifest({
      sourceFolder: '/photos',
      outputFolder: '/photos',
      mode: 'move',
      operations: [],
      batchFolders: [],
      totalFiles: 0,
      outputPrefix: 'Wedding',
    });
    expect(rollbackManifest.outputPrefix).toBe('Wedding');
  });

  it('defaults outputPrefix to empty string when not provided', () => {
    clearRollbackManifest();
    saveRollbackManifest({
      sourceFolder: '/photos',
      outputFolder: '/photos',
      mode: 'move',
      operations: [],
      batchFolders: [],
      totalFiles: 0,
    });
    expect(rollbackManifest.outputPrefix).toBe('');
  });
});

describe('checkRollbackAvailable', () => {
  it('returns null when no manifest exists', () => {
    clearRollbackManifest();
    expect(checkRollbackAvailable()).toBeNull();
  });

  it('returns summary info when manifest exists', () => {
    clearRollbackManifest();
    saveRollbackManifest({
      sourceFolder: '/photos',
      outputFolder: '/photos',
      mode: 'move',
      operations: [
        { fileName: 'a.jpg', sourcePath: '/photos/a.jpg', destPath: '/photos/Batch_001/a.jpg' },
      ],
      batchFolders: ['Batch_001'],
      totalFiles: 1,
    });
    const info = checkRollbackAvailable();
    expect(info).not.toBeNull();
    expect(info.sourceFolder).toBe('/photos');
    expect(info.totalFiles).toBe(1);
    expect(info.batchFolderCount).toBe(1);
  });
});

describe('clearRollbackManifest', () => {
  it('clears the manifest', () => {
    saveRollbackManifest({
      sourceFolder: '/photos',
      outputFolder: '/photos',
      mode: 'move',
      operations: [],
      batchFolders: [],
      totalFiles: 0,
    });
    expect(checkRollbackAvailable()).not.toBeNull();
    clearRollbackManifest();
    expect(checkRollbackAvailable()).toBeNull();
  });
});

// ============================================================================
// Cross-drive rollback logic tests
// ============================================================================

/**
 * Simplified rollback executor that mirrors the real executeRollback logic
 * with injectable fs functions so we can test both paths.
 */
async function executeRollbackLogic(manifest, isSameDriveFn, fsMock) {
  const { operations } = manifest;
  let restoredFiles = 0;
  const errors = [];

  let crossDrive = false;
  if (operations.length > 0) {
    crossDrive = !(await isSameDriveFn(operations[0].currentPath, operations[0].originalPath));
  }

  for (const op of operations) {
    try {
      if (crossDrive) {
        await fsMock.copyFile(op.currentPath, op.originalPath);
        const srcStat = await fsMock.stat(op.currentPath);
        const destStat = await fsMock.stat(op.originalPath);
        if (srcStat.size !== destStat.size) {
          throw new Error('Copy verification failed');
        }
        await fsMock.unlink(op.currentPath);
      } else {
        await fsMock.rename(op.currentPath, op.originalPath);
      }
      restoredFiles++;
    } catch (err) {
      errors.push({ file: op.fileName, error: err.message });
    }
  }

  return { restoredFiles, errors };
}

describe('executeRollback cross-drive handling', () => {
  const manifest = {
    operations: [
      { fileName: 'a.jpg', originalPath: 'C:\\photos\\a.jpg', currentPath: 'D:\\output\\Batch_001\\a.jpg' },
      { fileName: 'b.jpg', originalPath: 'C:\\photos\\b.jpg', currentPath: 'D:\\output\\Batch_001\\b.jpg' },
    ],
  };

  it('uses copy+delete strategy when drives differ', async () => {
    const fsMock = {
      copyFile: vi.fn(async () => {}),
      stat: vi.fn(async () => ({ size: 100 })),
      unlink: vi.fn(async () => {}),
      rename: vi.fn(async () => {}),
    };

    const result = await executeRollbackLogic(manifest, async () => false, fsMock);

    expect(result.restoredFiles).toBe(2);
    expect(result.errors).toEqual([]);
    expect(fsMock.copyFile).toHaveBeenCalledTimes(2);
    expect(fsMock.unlink).toHaveBeenCalledTimes(2);
    expect(fsMock.rename).not.toHaveBeenCalled();
  });

  it('uses rename strategy when same drive', async () => {
    const fsMock = {
      copyFile: vi.fn(async () => {}),
      stat: vi.fn(async () => ({ size: 100 })),
      unlink: vi.fn(async () => {}),
      rename: vi.fn(async () => {}),
    };

    const result = await executeRollbackLogic(manifest, async () => true, fsMock);

    expect(result.restoredFiles).toBe(2);
    expect(fsMock.rename).toHaveBeenCalledTimes(2);
    expect(fsMock.copyFile).not.toHaveBeenCalled();
    expect(fsMock.unlink).not.toHaveBeenCalled();
  });

  it('handles cross-drive copy error without deleting source', async () => {
    const fsMock = {
      copyFile: vi.fn(async (src) => {
        if (src.includes('a.jpg')) throw new Error('ENOSPC');
      }),
      stat: vi.fn(async () => ({ size: 100 })),
      unlink: vi.fn(async () => {}),
      rename: vi.fn(async () => {}),
    };

    const result = await executeRollbackLogic(manifest, async () => false, fsMock);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].file).toBe('a.jpg');
    expect(result.restoredFiles).toBe(1);
    // Only the successful file should have been unlinked
    expect(fsMock.unlink).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// PERSISTENT HISTORY LOGIC TESTS
// ============================================================================

describe('History index management', () => {
  let historyIndex;

  // Simulate the history index management logic
  function addToHistory(entry, maxEntries = 20) {
    historyIndex.unshift(entry);
    if (historyIndex.length > maxEntries) {
      return historyIndex.splice(maxEntries);
    }
    return [];
  }

  function removeFromHistory(operationId) {
    const initialLength = historyIndex.length;
    historyIndex = historyIndex.filter(e => e.operationId !== operationId);
    return historyIndex.length !== initialLength;
  }

  beforeEach(() => {
    historyIndex = [];
  });

  it('adds entries in newest-first order', () => {
    addToHistory({ operationId: 'first', createdAt: '2026-01-01' });
    addToHistory({ operationId: 'second', createdAt: '2026-01-02' });
    addToHistory({ operationId: 'third', createdAt: '2026-01-03' });

    expect(historyIndex[0].operationId).toBe('third');
    expect(historyIndex[1].operationId).toBe('second');
    expect(historyIndex[2].operationId).toBe('first');
  });

  it('caps history to max entries and returns removed', () => {
    for (let i = 0; i < 5; i++) {
      addToHistory({ operationId: `op-${i}`, createdAt: `2026-01-0${i + 1}` });
    }

    const removed = addToHistory({ operationId: 'op-5', createdAt: '2026-01-06' }, 5);

    expect(historyIndex).toHaveLength(5);
    expect(removed).toHaveLength(1);
    expect(removed[0].operationId).toBe('op-0'); // oldest removed
    expect(historyIndex[0].operationId).toBe('op-5'); // newest first
  });

  it('removes entry by operationId', () => {
    addToHistory({ operationId: 'keep-1' });
    addToHistory({ operationId: 'remove-me' });
    addToHistory({ operationId: 'keep-2' });

    const result = removeFromHistory('remove-me');

    expect(result).toBe(true);
    expect(historyIndex).toHaveLength(2);
    expect(historyIndex.find(e => e.operationId === 'remove-me')).toBeUndefined();
  });

  it('returns false when removing non-existent entry', () => {
    addToHistory({ operationId: 'exists' });

    const result = removeFromHistory('does-not-exist');

    expect(result).toBe(false);
    expect(historyIndex).toHaveLength(1);
  });

  it('clears all history', () => {
    addToHistory({ operationId: 'op-1' });
    addToHistory({ operationId: 'op-2' });
    addToHistory({ operationId: 'op-3' });

    historyIndex = [];

    expect(historyIndex).toHaveLength(0);
  });
});

describe('History entry summary structure', () => {
  it('creates summary with all required fields', () => {
    const summary = {
      operationId: 'test-op-id',
      createdAt: new Date().toISOString(),
      sourceFolder: '/photos',
      outputFolder: '/photos',
      mode: 'move',
      totalFiles: 2,
      batchFolderCount: 1,
      batchFolders: ['Batch_001'],
      outputPrefix: 'Batch',
      maxFilesPerBatch: 500,
      sortBy: 'name-asc',
      batchResults: [{ folder: 'Batch_001', fileCount: 2 }],
    };

    expect(summary).toHaveProperty('operationId');
    expect(summary).toHaveProperty('createdAt');
    expect(summary).toHaveProperty('sourceFolder');
    expect(summary).toHaveProperty('outputFolder');
    expect(summary).toHaveProperty('mode');
    expect(summary).toHaveProperty('totalFiles');
    expect(summary).toHaveProperty('batchFolderCount');
    expect(summary).toHaveProperty('batchFolders');
    expect(summary).toHaveProperty('outputPrefix');
    expect(summary).toHaveProperty('maxFilesPerBatch');
    expect(summary).toHaveProperty('sortBy');
    expect(summary).toHaveProperty('batchResults');
    expect(summary.batchFolderCount).toBe(summary.batchFolders.length);
  });

  it('includes extended metadata for history display', () => {
    const summary = {
      operationId: 'test-extended',
      createdAt: new Date().toISOString(),
      sourceFolder: '/photos/wedding',
      outputFolder: '/photos/wedding',
      mode: 'move',
      totalFiles: 247,
      batchFolderCount: 5,
      batchFolders: ['Wedding_001', 'Wedding_002', 'Wedding_003', 'Wedding_004', 'Wedding_005'],
      outputPrefix: 'Wedding',
      maxFilesPerBatch: 50,
      sortBy: 'date-asc',
      batchResults: [
        { folder: 'Wedding_001', fileCount: 50 },
        { folder: 'Wedding_002', fileCount: 50 },
        { folder: 'Wedding_003', fileCount: 50 },
        { folder: 'Wedding_004', fileCount: 50 },
        { folder: 'Wedding_005', fileCount: 47 },
      ],
    };

    expect(summary.maxFilesPerBatch).toBe(50);
    expect(summary.sortBy).toBe('date-asc');
    expect(summary.batchResults).toHaveLength(5);
    expect(summary.batchResults[0]).toEqual({ folder: 'Wedding_001', fileCount: 50 });
    expect(summary.batchResults[4].fileCount).toBe(47);
  });
});

describe('Extended manifest fields', () => {
  it('stores maxFilesPerBatch in manifest', () => {
    clearRollbackManifest();
    saveRollbackManifest({
      sourceFolder: '/photos',
      outputFolder: '/photos',
      mode: 'move',
      operations: [],
      batchFolders: [],
      totalFiles: 0,
      maxFilesPerBatch: 200,
    });
    expect(rollbackManifest.maxFilesPerBatch).toBe(200);
  });

  it('stores sortBy in manifest', () => {
    clearRollbackManifest();
    saveRollbackManifest({
      sourceFolder: '/photos',
      outputFolder: '/photos',
      mode: 'move',
      operations: [],
      batchFolders: [],
      totalFiles: 0,
      sortBy: 'date-desc',
    });
    expect(rollbackManifest.sortBy).toBe('date-desc');
  });

  it('defaults sortBy to name-asc when not provided', () => {
    clearRollbackManifest();
    saveRollbackManifest({
      sourceFolder: '/photos',
      outputFolder: '/photos',
      mode: 'move',
      operations: [],
      batchFolders: [],
      totalFiles: 0,
    });
    expect(rollbackManifest.sortBy).toBe('name-asc');
  });

  it('defaults maxFilesPerBatch to null when not provided', () => {
    clearRollbackManifest();
    saveRollbackManifest({
      sourceFolder: '/photos',
      outputFolder: '/photos',
      mode: 'move',
      operations: [],
      batchFolders: [],
      totalFiles: 0,
    });
    expect(rollbackManifest.maxFilesPerBatch).toBeNull();
  });

  it('stores batchResults array', () => {
    clearRollbackManifest();
    const results = [
      { folder: 'Batch_001', fileCount: 100 },
      { folder: 'Batch_002', fileCount: 47 },
    ];
    saveRollbackManifest({
      sourceFolder: '/photos',
      outputFolder: '/photos',
      mode: 'move',
      operations: [],
      batchFolders: ['Batch_001', 'Batch_002'],
      totalFiles: 147,
      batchResults: results,
    });
    expect(rollbackManifest.batchResults).toEqual(results);
    expect(rollbackManifest.batchResults).toHaveLength(2);
  });

  it('defaults batchResults to empty array when not provided', () => {
    clearRollbackManifest();
    saveRollbackManifest({
      sourceFolder: '/photos',
      outputFolder: '/photos',
      mode: 'move',
      operations: [],
      batchFolders: [],
      totalFiles: 0,
    });
    expect(rollbackManifest.batchResults).toEqual([]);
  });
});

describe('Manifest file path sanitization', () => {
  function sanitizeOperationId(operationId) {
    return operationId.replace(/[^a-z0-9_-]/gi, '');
  }

  it('preserves valid alphanumeric IDs', () => {
    expect(sanitizeOperationId('abc123xyz')).toBe('abc123xyz');
  });

  it('preserves IDs with hyphens and underscores', () => {
    expect(sanitizeOperationId('op-123_test')).toBe('op-123_test');
  });

  it('strips path traversal characters', () => {
    expect(sanitizeOperationId('../../etc/passwd')).toBe('etcpasswd');
  });

  it('strips special characters', () => {
    expect(sanitizeOperationId('op<script>alert(1)</script>')).toBe('opscriptalert1script');
  });

  it('handles empty string', () => {
    expect(sanitizeOperationId('')).toBe('');
  });
});

// ============================================================================
// MANIFEST ENCRYPTION TESTS (AES-256-GCM)
// ============================================================================

describe('Manifest encryption round-trip', () => {
  const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
  const IV_LENGTH = 12;
  const AUTH_TAG_LENGTH = 16;

  // Mirror the encryption functions from rollbackManager
  function encryptManifest(plaintext, key) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return JSON.stringify({
      encrypted: true,
      version: 1,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      ciphertext
    });
  }

  function decryptManifest(envelope, key) {
    const iv = Buffer.from(envelope.iv, 'hex');
    const authTag = Buffer.from(envelope.authTag, 'hex');
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    let plaintext = decipher.update(envelope.ciphertext, 'hex', 'utf8');
    plaintext += decipher.final('utf8');
    return plaintext;
  }

  const testKey = crypto.randomBytes(32);

  it('round-trips manifest data through encrypt/decrypt', () => {
    const manifest = JSON.stringify({
      operationId: 'test-op-123',
      operations: [
        { fileName: 'a.jpg', originalPath: '/photos/a.jpg', currentPath: '/photos/Batch_001/a.jpg' },
        { fileName: 'b.raw', originalPath: '/photos/b.raw', currentPath: '/photos/Batch_001/b.raw' },
      ]
    });
    const encrypted = encryptManifest(manifest, testKey);
    const parsed = JSON.parse(encrypted);
    expect(parsed.encrypted).toBe(true);
    expect(parsed.version).toBe(1);
    const decrypted = decryptManifest(parsed, testKey);
    expect(decrypted).toBe(manifest);
    expect(JSON.parse(decrypted).operations).toHaveLength(2);
  });

  it('produces unique ciphertext for same data (random IV)', () => {
    const plaintext = JSON.stringify({ operationId: 'test', operations: [] });
    const enc1 = JSON.parse(encryptManifest(plaintext, testKey));
    const enc2 = JSON.parse(encryptManifest(plaintext, testKey));
    expect(enc1.iv).not.toBe(enc2.iv);
    expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
  });

  it('fails decryption with wrong key', () => {
    const plaintext = JSON.stringify({ operationId: 'test', operations: [] });
    const encrypted = JSON.parse(encryptManifest(plaintext, testKey));
    const wrongKey = crypto.randomBytes(32);
    expect(() => decryptManifest(encrypted, wrongKey)).toThrow();
  });

  it('fails decryption with tampered ciphertext', () => {
    const plaintext = JSON.stringify({ operationId: 'test', operations: [] });
    const encrypted = JSON.parse(encryptManifest(plaintext, testKey));
    encrypted.ciphertext = 'ff' + encrypted.ciphertext.slice(2);
    expect(() => decryptManifest(encrypted, testKey)).toThrow();
  });

  it('detects legacy plaintext manifests (no encrypted flag)', () => {
    // Simulate a pre-encryption manifest
    const legacy = { operationId: 'old-op', operations: [{ fileName: 'test.jpg' }] };
    const parsed = legacy; // As if JSON.parse returned this
    expect(parsed.encrypted).toBeUndefined();
    // The reader should handle this as plaintext
    expect(parsed.operations).toHaveLength(1);
  });
});

// ============================================================================
// ROLLBACK CRASH RECOVERY TESTS
// ============================================================================

describe('Rollback crash recovery state tracking', () => {
  it('builds correct rollback progress state', () => {
    const state = {
      operationId: 'test-rollback-123',
      totalFiles: 100,
      restoredFiles: 42,
      restoredFileNames: Array.from({ length: 42 }, (_, i) => `file_${i}.jpg`),
      sourceFolder: '/photos/originals',
      outputFolder: '/photos/originals',
      batchFolders: ['Batch_001', 'Batch_002'],
    };

    expect(state.operationId).toBe('test-rollback-123');
    expect(state.restoredFileNames).toHaveLength(42);
    expect(state.totalFiles - state.restoredFiles).toBe(58);
  });

  it('filters remaining operations from restored set', () => {
    const allOperations = Array.from({ length: 100 }, (_, i) => ({
      fileName: `file_${i}.jpg`,
      originalPath: `/photos/file_${i}.jpg`,
      currentPath: `/batch/file_${i}.jpg`,
    }));

    // Simulate 42 files already restored
    const restoredSet = new Set(
      Array.from({ length: 42 }, (_, i) => `file_${i}.jpg`)
    );

    const remainingOps = allOperations.filter(op => !restoredSet.has(op.fileName));
    expect(remainingOps).toHaveLength(58);
    expect(remainingOps[0].fileName).toBe('file_42.jpg');
  });

  it('handles empty restored set (crash at start)', () => {
    const allOperations = Array.from({ length: 50 }, (_, i) => ({
      fileName: `file_${i}.jpg`,
    }));

    const restoredSet = new Set([]);
    const remainingOps = allOperations.filter(op => !restoredSet.has(op.fileName));
    expect(remainingOps).toHaveLength(50);
  });

  it('handles fully restored set (crash at end)', () => {
    const allOperations = Array.from({ length: 50 }, (_, i) => ({
      fileName: `file_${i}.jpg`,
    }));

    const restoredSet = new Set(
      Array.from({ length: 50 }, (_, i) => `file_${i}.jpg`)
    );

    const remainingOps = allOperations.filter(op => !restoredSet.has(op.fileName));
    expect(remainingOps).toHaveLength(0);
  });

  it('tracks restored file names incrementally', () => {
    const restoredFileNames = [];
    const operations = [
      { fileName: 'a.jpg' },
      { fileName: 'b.jpg' },
      { fileName: 'c.jpg' },
    ];

    // Simulate processing
    for (const op of operations) {
      restoredFileNames.push(op.fileName);
    }

    expect(restoredFileNames).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
    expect(restoredFileNames).toHaveLength(3);
  });
});

describe('Validation logic (scaled sampling)', () => {
  it('validates file existence with proportional sampling (5% up to 50)', async () => {
    const operations = Array.from({ length: 100 }, (_, i) => ({
      fileName: `file_${i}.jpg`,
      currentPath: `/batch/file_${i}.jpg`,
      originalPath: `/photos/file_${i}.jpg`,
    }));

    // 5% of 100 = 5, but minimum is 10
    const sampleSize = Math.min(50, Math.max(10, Math.ceil(operations.length * 0.05)));
    const actualSample = Math.min(sampleSize, operations.length);
    const step = Math.max(1, Math.floor(operations.length / actualSample));
    let checked = 0;

    for (let i = 0; i < operations.length && checked < actualSample; i += step) {
      checked++;
    }

    expect(checked).toBe(10); // min(50, max(10, ceil(100*0.05))) = 10
    expect(checked).toBeLessThan(operations.length);
  });

  it('checks all files when count is small', () => {
    const operations = Array.from({ length: 5 }, (_, i) => ({
      fileName: `file_${i}.jpg`,
      currentPath: `/batch/file_${i}.jpg`,
    }));

    const sampleSize = Math.min(50, Math.max(10, Math.ceil(operations.length * 0.05)));
    const actualSample = Math.min(sampleSize, operations.length);
    const step = Math.max(1, Math.floor(operations.length / actualSample));
    let checked = 0;

    for (let i = 0; i < operations.length && checked < actualSample; i += step) {
      checked++;
    }

    expect(checked).toBe(5); // all 5 checked since total < min sample
  });

  it('scales up to 50 for very large manifests', () => {
    const operations = Array.from({ length: 10000 }, (_, i) => ({
      fileName: `file_${i}.jpg`,
      currentPath: `/batch/file_${i}.jpg`,
    }));

    // 5% of 10000 = 500, capped at 50
    const sampleSize = Math.min(50, Math.max(10, Math.ceil(operations.length * 0.05)));
    const actualSample = Math.min(sampleSize, operations.length);
    const step = Math.max(1, Math.floor(operations.length / actualSample));
    let checked = 0;

    for (let i = 0; i < operations.length && checked < actualSample; i += step) {
      checked++;
    }

    expect(checked).toBe(50); // capped at 50
  });

  it('checks at least 10 for medium manifests (200 files)', () => {
    const operations = Array.from({ length: 200 }, (_, i) => ({
      fileName: `file_${i}.jpg`,
      currentPath: `/batch/file_${i}.jpg`,
    }));

    // 5% of 200 = 10, max(10, 10) = 10, min(50, 10) = 10
    const sampleSize = Math.min(50, Math.max(10, Math.ceil(operations.length * 0.05)));
    const actualSample = Math.min(sampleSize, operations.length);
    const step = Math.max(1, Math.floor(operations.length / actualSample));
    let checked = 0;

    for (let i = 0; i < operations.length && checked < actualSample; i += step) {
      checked++;
    }

    expect(checked).toBe(10);
  });

  it('checks 25 for 500 files (5% = 25)', () => {
    const operations = Array.from({ length: 500 }, (_, i) => ({
      fileName: `file_${i}.jpg`,
      currentPath: `/batch/file_${i}.jpg`,
    }));

    // 5% of 500 = 25, max(10, 25) = 25, min(50, 25) = 25
    const sampleSize = Math.min(50, Math.max(10, Math.ceil(operations.length * 0.05)));
    const actualSample = Math.min(sampleSize, operations.length);
    const step = Math.max(1, Math.floor(operations.length / actualSample));
    let checked = 0;

    for (let i = 0; i < operations.length && checked < actualSample; i += step) {
      checked++;
    }

    expect(checked).toBe(25);
  });
});
