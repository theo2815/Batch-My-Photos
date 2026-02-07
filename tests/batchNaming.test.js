/**
 * Tests for src/utils/batchNaming.js
 *
 * This module is pure (no Node.js/Electron dependencies) so we can import directly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateBatchFolderName } from '../src/utils/batchNaming.js';

describe('generateBatchFolderName', () => {
  // Mock Date for deterministic tests
  let dateSpy;

  beforeEach(() => {
    dateSpy = vi.useFakeTimers();
    dateSpy.setSystemTime(new Date('2024-06-15T10:30:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('generates default name with count when no pattern provided', () => {
    expect(generateBatchFolderName(null, 0, 5)).toBe('Batch_001');
    expect(generateBatchFolderName(undefined, 0, 5)).toBe('Batch_001');
  });

  it('appends {count} if pattern does not include it', () => {
    expect(generateBatchFolderName('MyBatch', 0, 5)).toBe('MyBatch_001');
    expect(generateBatchFolderName('MyBatch', 4, 5)).toBe('MyBatch_005');
  });

  it('replaces {count} variable in pattern', () => {
    expect(generateBatchFolderName('Set_{count}', 0, 5)).toBe('Set_001');
    expect(generateBatchFolderName('Set_{count}', 9, 10)).toBe('Set_010');
  });

  it('pads count to minimum 3 digits', () => {
    expect(generateBatchFolderName('Batch', 0, 1)).toBe('Batch_001');
    expect(generateBatchFolderName('Batch', 0, 9)).toBe('Batch_001');
    expect(generateBatchFolderName('Batch', 8, 9)).toBe('Batch_009');
  });

  it('increases padding for large batch counts', () => {
    // 1000 batches -> 4 digits
    expect(generateBatchFolderName('Batch', 0, 1000)).toBe('Batch_0001');
    expect(generateBatchFolderName('Batch', 999, 1000)).toBe('Batch_1000');
  });

  it('replaces {year} variable', () => {
    expect(generateBatchFolderName('{year}_Batch', 0, 1)).toBe('2024_Batch_001');
  });

  it('replaces {month} variable', () => {
    expect(generateBatchFolderName('{month}_Batch', 0, 1)).toBe('06_Batch_001');
  });

  it('replaces {date} variable', () => {
    expect(generateBatchFolderName('{date}_Batch', 0, 1)).toBe('2024-06-15_Batch_001');
  });

  it('replaces multiple variables', () => {
    expect(generateBatchFolderName('{year}-{month}_{count}', 0, 5)).toBe('2024-06_001');
  });

  it('is case-insensitive for variable names', () => {
    expect(generateBatchFolderName('{COUNT}', 0, 5)).toBe('001');
    expect(generateBatchFolderName('{Year}', 0, 1)).toBe('2024_001');
    expect(generateBatchFolderName('{MONTH}', 0, 1)).toBe('06_001');
    expect(generateBatchFolderName('{DATE}', 0, 1)).toBe('2024-06-15_001');
  });

  it('handles pattern with only {count}', () => {
    expect(generateBatchFolderName('{count}', 0, 5)).toBe('001');
    expect(generateBatchFolderName('{count}', 4, 5)).toBe('005');
  });

  it('handles empty string pattern', () => {
    // Empty string becomes 'Batch'
    expect(generateBatchFolderName('', 0, 5)).toBe('Batch_001');
  });

  it('preserves literal text in pattern', () => {
    expect(generateBatchFolderName('Wedding-Photos-{count}', 0, 3)).toBe('Wedding-Photos-001');
  });

  it('handles zero-indexed batch correctly (1-based output)', () => {
    expect(generateBatchFolderName('B', 0, 3)).toBe('B_001');
    expect(generateBatchFolderName('B', 1, 3)).toBe('B_002');
    expect(generateBatchFolderName('B', 2, 3)).toBe('B_003');
  });
});
