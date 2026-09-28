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
  it('rejects an empty labeled set', async () => {
    await expect(evaluate([])).rejects.toThrow('Expected labeled image records');
  });

  it('treats a failed 200 response envelope as unknown', async () => {
    const image = path.join(folder, 'envelope.jpg');
    fs.writeFileSync(image, await sharp({ create: {
      width: 8, height: 6, channels: 3, background: '#777777',
    } }).jpeg().toBuffer());
    const previousUrl = process.env.BATCH_BLUR_AI_URL;
    process.env.BATCH_BLUR_AI_URL = 'http://127.0.0.1:9';
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, data: {
      predicted_class: 'sharp', confidence: 1, probabilities: {
        sharp: 1, defocused_blurred: 0, defocused_object_portrait: 0, motion_blurred: 0,
      },
    } }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    try {
      const report = await evaluate([{ file: image, label: 'sharp' }]);
      expect(report).toMatchObject({ total: 1, unknown: 1, complete: false });
      expect(report.server.correct).toBe(0);
    } finally {
      vi.unstubAllGlobals();
      if (previousUrl === undefined) delete process.env.BATCH_BLUR_AI_URL;
      else process.env.BATCH_BLUR_AI_URL = previousUrl;
    }
  });

  it('classifies prepared JPEG through the desktop stream route', async () => {
    const image = path.join(folder, 'stream.jpg');
    fs.writeFileSync(image, await sharp({ create: {
      width: 8, height: 6, channels: 3, background: '#777777',
    } }).jpeg().toBuffer());
    const previousUrl = process.env.BATCH_BLUR_AI_URL;
    process.env.BATCH_BLUR_AI_URL = 'http://127.0.0.1:9/';
    const fetch = vi.fn(async (url, { method, body }) => {
      expect(url).toBe('http://127.0.0.1:9/api/v1/blur/classify/stream');
      expect(method).toBe('POST');
      expect(body.getAll('files')).toHaveLength(1);
      expect(body.get('files').name).toBe('0');
      expect(body.get('files').type).toBe('image/jpeg');
      return new Response([
        JSON.stringify({ index: 0, filename: '0', predicted_class: 'sharp', confidence: 1,
          probabilities: { sharp: 1, defocused_blurred: 0, defocused_object_portrait: 0, motion_blurred: 0 } }),
        JSON.stringify({ _summary: true, total: 1, successful: 1, errors: 0, complete: true }),
      ].join('\n') + '\n', { status: 200 });
    });
    vi.stubGlobal('fetch', fetch);
    try {
      const report = await evaluate([{ file: image, label: 'sharp' }]);
      expect(report).toMatchObject({ total: 1, unknown: 0, complete: true });
      expect(report.server.correct).toBe(1);
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
      if (previousUrl === undefined) delete process.env.BATCH_BLUR_AI_URL;
      else process.env.BATCH_BLUR_AI_URL = previousUrl;
    }
  });

  it.each([
    ['missing summary', [{ index: 0, filename: '0', predicted_class: 'sharp', confidence: 1,
      probabilities: { sharp: 1, defocused_blurred: 0, defocused_object_portrait: 0, motion_blurred: 0 } }]],
    ['incomplete summary', [{ index: 0, filename: '0', predicted_class: 'sharp', confidence: 1,
      probabilities: { sharp: 1, defocused_blurred: 0, defocused_object_portrait: 0, motion_blurred: 0 } },
    { _summary: true, total: 1, successful: 1, errors: 0, complete: false }]],
    ['malformed row', [{ index: 1, filename: '1', predicted_class: 'sharp', confidence: 1,
      probabilities: { sharp: 1, defocused_blurred: 0, defocused_object_portrait: 0, motion_blurred: 0 } },
    { _summary: true, total: 1, successful: 1, errors: 0, complete: true }]],
  ])('keeps %s unknown in the denominator', async (_name, lines) => {
    const image = path.join(folder, 'incomplete.jpg');
    fs.writeFileSync(image, await sharp({ create: {
      width: 8, height: 6, channels: 3, background: '#777777',
    } }).jpeg().toBuffer());
    const previousUrl = process.env.BATCH_BLUR_AI_URL;
    process.env.BATCH_BLUR_AI_URL = 'http://127.0.0.1:9';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(lines.map(line => JSON.stringify(line)).join('\n') + '\n',
      { status: 200 })));
    try {
      const report = await evaluate([{ file: image, label: 'sharp' }]);
      expect(report).toMatchObject({ total: 1, unknown: 1, complete: false });
      expect(report.server.correct).toBe(0);
    } finally {
      vi.unstubAllGlobals();
      if (previousUrl === undefined) delete process.env.BATCH_BLUR_AI_URL;
      else process.env.BATCH_BLUR_AI_URL = previousUrl;
    }
  });

  it('does not count another blur category as a false blurry sharp photo', async () => {
    const image = path.join(folder, 'cross-class.jpg');
    fs.writeFileSync(image, await sharp({ create: {
      width: 8, height: 6, channels: 3, background: '#777777',
    } }).jpeg().toBuffer());
    const report = await evaluate([{ file: image, label: 'defocused_blurred' }], async () => ({
      predicted_class: 'motion_blurred', confidence: 0.8, probabilities: {
        sharp: 0.2, defocused_blurred: 0, defocused_object_portrait: 0, motion_blurred: 0.8,
      },
    }));
    expect(report.policies['moderate:motion_blurred']).toMatchObject({ correct: 0, falseBlurry: 0 });
  });

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
