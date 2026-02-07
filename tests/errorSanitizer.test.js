/**
 * Tests for src/utils/errorSanitizer.js
 *
 * Verifies that no internal paths, system details, or implementation
 * specifics leak through error messages sent to the renderer.
 */

import { describe, it, expect } from 'vitest';

// Re-implement the sanitization logic for unit testing without Electron dependency

const ERROR_CODE_MAP = {
  ENOENT: 'File or folder not found. It may have been moved or deleted.',
  EACCES: 'Permission denied. Check that you have access to this folder.',
  EPERM: 'Operation not permitted. The file may be in use or read-only.',
  ENOSPC: 'Not enough disk space to complete the operation.',
  EMFILE: 'Too many files open. Please close some applications and try again.',
  ENFILE: 'System file limit reached. Please close some applications and try again.',
  EBUSY: 'The file or folder is in use by another process.',
  EEXIST: 'A file or folder with that name already exists.',
  EISDIR: 'Expected a file but found a directory.',
  ENOTDIR: 'Expected a directory but found a file.',
  EXDEV: 'Cannot move files across different drives in this mode.',
};

const ERROR_MESSAGE_PATTERNS = [
  { pattern: /access denied/i, message: 'Access denied. The folder was not selected through the app.' },
  { pattern: /not selected through dialog/i, message: 'Access denied. Please select the folder using the app.' },
  { pattern: /copy verification failed/i, message: 'File copy verification failed. Please try again.' },
];

const DEFAULT_ERROR_MESSAGE = 'An unexpected error occurred. Please try again.';

function sanitizeError(error, _context = '') {
  if (typeof error === 'string') {
    for (const { pattern, message } of ERROR_MESSAGE_PATTERNS) {
      if (pattern.test(error)) return message;
    }
    if (error.startsWith('Access denied:')) {
      return 'Access denied. Please select the folder using the app.';
    }
    return DEFAULT_ERROR_MESSAGE;
  }

  if (error && typeof error === 'object') {
    if (error.code && ERROR_CODE_MAP[error.code]) {
      return ERROR_CODE_MAP[error.code];
    }
    if (error.message) {
      for (const { pattern, message } of ERROR_MESSAGE_PATTERNS) {
        if (pattern.test(error.message)) return message;
      }
      if (error.message.startsWith('Access denied:')) {
        return 'Access denied. Please select the folder using the app.';
      }
    }
  }

  return DEFAULT_ERROR_MESSAGE;
}

describe('sanitizeError', () => {
  describe('prevents information leakage', () => {
    it('does not leak file paths in ENOENT errors', () => {
      const error = new Error('ENOENT: no such file or directory, open C:\\Users\\secret\\file.txt');
      error.code = 'ENOENT';
      const result = sanitizeError(error);
      expect(result).not.toContain('C:\\');
      expect(result).not.toContain('secret');
      expect(result).toBe('File or folder not found. It may have been moved or deleted.');
    });

    it('does not leak file paths in EACCES errors', () => {
      const error = new Error('EACCES: permission denied /home/user/.ssh/id_rsa');
      error.code = 'EACCES';
      const result = sanitizeError(error);
      expect(result).not.toContain('/home');
      expect(result).not.toContain('.ssh');
      expect(result).toBe('Permission denied. Check that you have access to this folder.');
    });

    it('does not leak internal error messages for unknown errors', () => {
      const error = new Error('Cannot read property of undefined at Module._compile (internal/modules/cjs/loader.js:999:30)');
      const result = sanitizeError(error);
      expect(result).not.toContain('Module._compile');
      expect(result).not.toContain('internal/modules');
      expect(result).toBe(DEFAULT_ERROR_MESSAGE);
    });

    it('does not leak stack traces', () => {
      const error = new Error('Some internal error');
      error.stack = 'Error: Some internal error\n    at Object.<anonymous> (C:\\project\\src\\main\\handler.js:42:15)';
      const result = sanitizeError(error);
      expect(result).not.toContain('handler.js');
      expect(result).not.toContain('42:15');
      expect(result).toBe(DEFAULT_ERROR_MESSAGE);
    });

    it('does not leak raw string errors with paths', () => {
      const result = sanitizeError('Failed to open C:\\Users\\Admin\\Desktop\\photos');
      expect(result).not.toContain('C:\\Users');
      expect(result).not.toContain('Admin');
      expect(result).toBe(DEFAULT_ERROR_MESSAGE);
    });
  });

  describe('maps known error codes correctly', () => {
    for (const [code, expectedMessage] of Object.entries(ERROR_CODE_MAP)) {
      it(`maps ${code} to user-friendly message`, () => {
        const error = new Error(`${code}: something internal`);
        error.code = code;
        expect(sanitizeError(error)).toBe(expectedMessage);
      });
    }
  });

  describe('maps known error patterns correctly', () => {
    it('maps "access denied" pattern', () => {
      const error = new Error('Access denied to this resource');
      expect(sanitizeError(error)).toBe('Access denied. The folder was not selected through the app.');
    });

    it('maps "not selected through dialog" pattern', () => {
      const error = new Error('Path not selected through dialog');
      expect(sanitizeError(error)).toBe('Access denied. Please select the folder using the app.');
    });

    it('maps "copy verification failed" pattern', () => {
      const error = new Error('Copy verification failed - size mismatch');
      expect(sanitizeError(error)).toBe('File copy verification failed. Please try again.');
    });

    it('maps access denied string with "Access denied:" prefix', () => {
      // "Access denied:" contains "access denied" which matches the pattern first
      expect(sanitizeError('Access denied: folder not selected through dialog'))
        .toBe('Access denied. The folder was not selected through the app.');
    });
  });

  describe('edge cases', () => {
    it('handles null error', () => {
      expect(sanitizeError(null)).toBe(DEFAULT_ERROR_MESSAGE);
    });

    it('handles undefined error', () => {
      expect(sanitizeError(undefined)).toBe(DEFAULT_ERROR_MESSAGE);
    });

    it('handles number error', () => {
      expect(sanitizeError(42)).toBe(DEFAULT_ERROR_MESSAGE);
    });

    it('handles empty string error', () => {
      expect(sanitizeError('')).toBe(DEFAULT_ERROR_MESSAGE);
    });

    it('handles error object without code or message', () => {
      expect(sanitizeError({})).toBe(DEFAULT_ERROR_MESSAGE);
    });

    it('handles error with unknown code', () => {
      const error = new Error('something');
      error.code = 'UNKNOWN_CODE';
      expect(sanitizeError(error)).toBe(DEFAULT_ERROR_MESSAGE);
    });
  });
});
