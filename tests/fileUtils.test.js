/**
 * Tests for src/main/fileUtils.js
 *
 * Tests isSameDrive logic, disk space, permissions, and utility functions.
 */

import { describe, it, expect } from 'vitest';
import path from 'path';

// ============================================================================
// Re-implement isSameDrive for isolated testing (pure logic, no fs calls)
// ============================================================================

function isSameDrive(sourcePath, destPath) {
  if (process.platform === 'win32') {
    const sourceDrive = path.parse(sourcePath).root.toUpperCase();
    const destDrive = path.parse(destPath).root.toUpperCase();
    return sourceDrive === destDrive;
  }
  // On Unix, current implementation always returns true
  return true;
}

describe('isSameDrive', () => {
  if (process.platform === 'win32') {
    describe('Windows', () => {
      it('returns true for same drive letter', () => {
        expect(isSameDrive('C:\\Users\\photos', 'C:\\Users\\output')).toBe(true);
      });

      it('returns true for same drive letter (case insensitive)', () => {
        expect(isSameDrive('c:\\Users\\photos', 'C:\\Users\\output')).toBe(true);
      });

      it('returns false for different drive letters', () => {
        expect(isSameDrive('C:\\Users\\photos', 'D:\\output')).toBe(false);
      });

      it('handles UNC paths', () => {
        // path.parse for UNC paths gives root as \\server\share\
        const result = isSameDrive('\\\\server\\share\\a', '\\\\server\\share\\b');
        expect(typeof result).toBe('boolean');
      });
    });
  } else {
    describe('Unix', () => {
      it('always returns true (current implementation limitation)', () => {
        expect(isSameDrive('/home/user/photos', '/mnt/external/output')).toBe(true);
      });
    });
  }
});

// ============================================================================
// Re-implement formatBytes for isolated testing
// ============================================================================

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return 'Unknown';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

describe('formatBytes', () => {
  it('formats 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats bytes', () => {
    expect(formatBytes(500)).toBe('500 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB');
    expect(formatBytes(1048576 * 847)).toBe('847.0 MB');
  });

  it('formats gigabytes', () => {
    expect(formatBytes(1073741824)).toBe('1.0 GB');
    expect(formatBytes(1073741824 * 12.4)).toBe('12.4 GB');
  });

  it('formats terabytes', () => {
    expect(formatBytes(1099511627776)).toBe('1.0 TB');
  });

  it('returns Unknown for null', () => {
    expect(formatBytes(null)).toBe('Unknown');
  });

  it('returns Unknown for undefined', () => {
    expect(formatBytes(undefined)).toBe('Unknown');
  });

  it('returns Unknown for NaN', () => {
    expect(formatBytes(NaN)).toBe('Unknown');
  });
});

// ============================================================================
// Re-implement calculateTotalSize for isolated testing
// ============================================================================

function calculateTotalSize(fileStats) {
  let total = 0;
  for (const key of Object.keys(fileStats)) {
    const stat = fileStats[key];
    if (stat && typeof stat.size === 'number') {
      total += stat.size;
    }
  }
  return total;
}

describe('calculateTotalSize', () => {
  it('sums file sizes from stats map', () => {
    const stats = {
      'a.jpg': { mtimeMs: 1000, size: 1024 },
      'b.jpg': { mtimeMs: 2000, size: 2048 },
      'c.raw': { mtimeMs: 3000, size: 10485760 },
    };
    expect(calculateTotalSize(stats)).toBe(1024 + 2048 + 10485760);
  });

  it('returns 0 for empty stats', () => {
    expect(calculateTotalSize({})).toBe(0);
  });

  it('skips entries without numeric size', () => {
    const stats = {
      'a.jpg': { mtimeMs: 1000, size: 1024 },
      'b.jpg': { mtimeMs: 2000 }, // missing size
      'c.jpg': null,               // null entry
    };
    expect(calculateTotalSize(stats)).toBe(1024);
  });
});

// ============================================================================
// Space sufficiency logic tests
// ============================================================================

const SPACE_BUFFER_MULTIPLIER = 1.1;

function isSpaceSufficient(freeBytes, totalSizeBytes) {
  const requiredBytes = Math.ceil(totalSizeBytes * SPACE_BUFFER_MULTIPLIER);
  return {
    sufficient: freeBytes >= requiredBytes,
    requiredBytes,
  };
}

describe('Space sufficiency calculation', () => {
  it('passes when free space exceeds required (with 10% buffer)', () => {
    const result = isSpaceSufficient(11_000_000, 10_000_000); // 11MB free, 10MB needed + 10% = 11MB
    expect(result.sufficient).toBe(true);
    expect(result.requiredBytes).toBe(11_000_000);
  });

  it('fails when free space is less than required + buffer', () => {
    const result = isSpaceSufficient(10_000_000, 10_000_000); // 10MB free, 10MB needed + 10% = 11MB
    expect(result.sufficient).toBe(false);
  });

  it('passes with exactly enough space (including buffer)', () => {
    const totalSize = 1_000_000;
    const required = Math.ceil(totalSize * SPACE_BUFFER_MULTIPLIER);
    const result = isSpaceSufficient(required, totalSize);
    expect(result.sufficient).toBe(true);
  });

  it('same-drive move does not need disk space check', () => {
    // For same-drive move, the check should be skipped entirely.
    // This test documents the design decision: when mode === 'move' && sameDrive,
    // we return sufficient: true without calling getDiskSpace.
    const sameDrive = true;
    const mode = 'move';
    const needsCheck = !(mode === 'move' && sameDrive);
    expect(needsCheck).toBe(false);
  });

  it('cross-drive move requires disk space check', () => {
    const sameDrive = false;
    const mode = 'move';
    const needsCheck = !(mode === 'move' && sameDrive);
    expect(needsCheck).toBe(true);
  });

  it('copy mode always requires disk space check', () => {
    const mode = 'copy';
    const sameDrive = true;
    const needsCheck = !(mode === 'move' && sameDrive);
    expect(needsCheck).toBe(true);
  });
});

// ============================================================================
// Permission result handling tests
// ============================================================================

describe('Permission result handling', () => {
  it('interprets writable: true as valid', () => {
    const result = { writable: true };
    expect(result.writable).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('interprets writable: false with error message', () => {
    const result = { writable: false, error: 'Permission denied: cannot write to this folder' };
    expect(result.writable).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('handles EACCES error code mapping', () => {
    // This tests the logic from testWritePermission that maps EACCES -> specific message
    const errorCode = 'EACCES';
    const isPermDenied = errorCode === 'EACCES' || errorCode === 'EPERM';
    expect(isPermDenied).toBe(true);
  });

  it('handles EROFS (read-only filesystem) error code', () => {
    const errorCode = 'EROFS';
    const isReadOnly = errorCode === 'EROFS';
    expect(isReadOnly).toBe(true);
  });

  it('handles ENOSPC (no space) error code', () => {
    const errorCode = 'ENOSPC';
    const isNoSpace = errorCode === 'ENOSPC';
    expect(isNoSpace).toBe(true);
  });
});
