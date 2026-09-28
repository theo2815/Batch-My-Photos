import { afterAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { evaluate } = require('../scripts/evaluate-blur-policy.cjs');
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'blur-policy-'));
afterAll(() => fs.rmSync(folder, { recursive: true, force: true }));

describe('desktop blur policy evaluator', () => {
  it('counts preparation failures as unknown without calling the classifier', async () => {
    const broken = path.join(folder, 'broken.jpg');
    fs.writeFileSync(broken, 'not an image');
    const classify = vi.fn();
    const report = await evaluate([{ file: broken, label: 'sharp' }], classify);
    expect(report).toMatchObject({ total: 1, unknown: 1, complete: false });
    expect(report.policies['moderate:all']).toMatchObject({ total: 1, unknown: 1, correct: 0 });
    expect(report.items[0].status).toBe('unknown');
    expect(classify).not.toHaveBeenCalled();
  });

  it('reports real preparation and policy decisions while keeping failed inputs in the denominator', async () => {
    const image = path.join(folder, 'photo.png');
    fs.writeFileSync(image, await sharp({ create: {
      width: 8, height: 6, channels: 3, background: '#777777',
    } }).png().toBuffer());
    const classify = vi.fn()
      .mockResolvedValueOnce({ predicted_class: 'sharp', confidence: 0.6, probabilities: {
        sharp: 0.6, defocused_blurred: 0.4, defocused_object_portrait: 0, motion_blurred: 0,
      } })
      .mockRejectedValueOnce(new Error('secret local path'));
    const report = await evaluate([
      { file: image, label: 'defocused_blurred' },
      { file: image, label: 'sharp' },
    ], classify, ['defocused_blurred']);

    expect(report.total).toBe(2);
    expect(report.unknown).toBe(1);
    expect(report.complete).toBe(false);
    expect(report.items[0]).toMatchObject({ index: 0, label: 'defocused_blurred', serverArgmax: 'sharp',
      width: 8, height: 6 });
    expect(report.items[0].sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(report.items[0].preparedSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(report.items[0].sourceSha256).not.toBe(report.items[0].preparedSha256);
    expect(report.items[1].status).toBe('unknown');
    expect(report.policies['strict:all']).toMatchObject({ total: 2, unknown: 1, correct: 1, dangerousFlips: 0 });
    expect(report.policies['moderate:all']).toMatchObject({ total: 2, unknown: 1, correct: 0, dangerousFlips: 1 });
    expect(report.policies['strict:defocused_blurred'].correct).toBe(1);
    expect(report.policies['strict:custom'].correct).toBe(1);
    expect(JSON.stringify(report)).not.toContain(image);
    expect(JSON.stringify(report)).not.toContain('secret local path');
  });
});
