import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it, vi } from 'vitest';
import Module from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const fetchMock = vi.fn();
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  return request === 'electron'
    ? { app: { isPackaged: false }, net: { fetch: (...args) => fetchMock(...args) } }
    : originalLoad.call(this, request, ...rest);
};
process.env.BATCH_BLUR_AI_ENABLED = 'true';
const blur = await import('../src/main/blurDetectionService.js');
Module._load = originalLoad;

const SHARP = {
  predicted_class: 'sharp',
  confidence: 0.9,
  probabilities: { sharp: 0.9, motion_blurred: 0.1 },
};
const MOTION = {
  predicted_class: 'motion_blurred',
  confidence: 0.8,
  probabilities: { sharp: 0.2, motion_blurred: 0.8 },
};
const summary = (total, successful = total, errors = 0) =>
  ({ _summary: true, total, successful, errors, complete: true });
const row = (index, classification = SHARP) =>
  ({ index, filename: String(index), ...classification });
const groups = { FIRST: ['FIRST.jpg'], SECOND: ['SECOND.jpg', 'SECOND.CR3'] };
let folder;

function ndjsonResponse(objects) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const object of objects) controller.enqueue(encoder.encode(JSON.stringify(object) + '\n'));
      controller.close();
    },
  }), { status: 200 });
}

beforeAll(async () => {
  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'blur-stream-'));
  const jpeg = await sharp({ create: {
    width: 8, height: 8, channels: 3, background: { r: 120, g: 130, b: 140 },
  } }).jpeg().toBuffer();
  fs.writeFileSync(path.join(folder, 'FIRST.jpg'), jpeg);
  fs.writeFileSync(path.join(folder, 'SECOND.jpg'), jpeg);
});
beforeEach(() => {
  blur.clearCache();
  fetchMock.mockReset();
});
afterEach(() => vi.useRealTimers());
afterAll(() => fs.rmSync(folder, { recursive: true, force: true }));

describe('real blur stream client', () => {
  it.each([
    ['missing', [row(0)]],
    ['incomplete', [row(0), { ...summary(1), complete: false }]],
    ['duplicate', [row(0), summary(1), summary(1)]],
    ['wrong total', [row(0), summary(2)]],
    ['wrong counts', [row(0), summary(1, 0, 0)]],
  ])('rejects a %s summary without publishing rows', async (_kind, lines) => {
    const progress = vi.fn();
    fetchMock.mockResolvedValue(ndjsonResponse(lines));
    await expect(blur.analyzeBlur({ FIRST: ['FIRST.jpg'] }, folder, 'moderate', null, progress))
      .rejects.toThrow(/AI service.*incomplete/i);
    expect(progress).not.toHaveBeenCalled();
  });

  it('commits out-of-order rows against their exact image once the summary is valid', async () => {
    const progress = vi.fn();
    fetchMock.mockResolvedValue(ndjsonResponse([row(1, MOTION), row(0), summary(2)]));
    const results = await blur.analyzeBlur(groups, folder, 'moderate', null, progress);
    expect(results.FIRST).toMatchObject({ analyzedFile: 'FIRST.jpg', predictedClass: 'sharp', isBlurry: false });
    expect(results.SECOND).toMatchObject({ analyzedFile: 'SECOND.jpg', predictedClass: 'motion_blurred', isBlurry: true });
    expect(progress.mock.calls.map(([value]) => value.current)).toEqual([1, 2]);
    expect(blur.getCachedBlurResult(folder, 'SECOND.jpg')).toEqual(results.SECOND);
    expect(blur.getCachedBlurResult(folder, 'SECOND.CR3')).toBeNull();
    expect(blur.getCachedBlurResult(folder + '-old', 'SECOND.jpg')).toBeNull();
  });

  it('recovers only a missing index after a valid complete summary', async () => {
    const progress = vi.fn();
    fetchMock.mockImplementation(async (url) => {
      if (url.endsWith('/stream')) return ndjsonResponse([row(0), summary(2)]);
      expect(progress).toHaveBeenCalledTimes(1);
      return new Response(JSON.stringify({ success: true, data: MOTION }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    });
    const results = await blur.analyzeBlur(groups, folder, 'moderate', null, progress);
    expect(results.SECOND.predictedClass).toBe('motion_blurred');
    expect(progress).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => url.endsWith('/stream'))).toEqual([true, false]);
  });

  it.each(['503', '429', 'network'])('retries one uncommitted chunk after %s and ticks once', async (failure) => {
    vi.useFakeTimers();
    const progress = vi.fn();
    if (failure === '503' || failure === '429') fetchMock.mockResolvedValueOnce(new Response('busy', { status: Number(failure) }));
    else fetchMock.mockRejectedValueOnce(new Error('socket closed'));
    fetchMock.mockResolvedValueOnce(ndjsonResponse([row(0), summary(1)]));
    const pending = blur.analyzeBlur({ FIRST: ['FIRST.jpg'] }, folder, 'moderate', null, progress);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(progress).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    const result = await pending;
    expect(result.FIRST.predictedClass).toBe('sharp');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenCalledTimes(1);
  });

  it('retries an aborted stream request after the 210-second deadline', async () => {
    vi.useFakeTimers();
    const progress = vi.fn();
    fetchMock.mockImplementationOnce((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    fetchMock.mockResolvedValueOnce(ndjsonResponse([row(0), summary(1)]));
    const pending = blur.analyzeBlur({ FIRST: ['FIRST.jpg'] }, folder, 'moderate', null, progress);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(210000);
    expect(progress).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenCalledTimes(1);
  });

  it('stops after one retry and never publishes a failed chunk', async () => {
    vi.useFakeTimers();
    const progress = vi.fn();
    fetchMock.mockResolvedValue(new Response('busy', { status: 503 }));
    const pending = blur.analyzeBlur({ FIRST: ['FIRST.jpg'] }, folder, 'moderate', null, progress);
    const rejected = expect(pending).rejects.toThrow(/AI service returned 503/);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(2000);
    await rejected;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(progress).not.toHaveBeenCalled();
  });

  it('does not retry a malformed image rejection', async () => {
    const progress = vi.fn();
    fetchMock.mockResolvedValue(new Response('bad image', { status: 422 }));
    await expect(blur.analyzeBlur({ FIRST: ['FIRST.jpg'] }, folder, 'moderate', null, progress))
      .rejects.toThrow(/AI service returned 422/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(progress).not.toHaveBeenCalled();
  });

  it('does not retry authentication failures', async () => {
    const progress = vi.fn();
    fetchMock.mockResolvedValue(new Response('denied', { status: 401 }));
    await expect(blur.analyzeBlur({ FIRST: ['FIRST.jpg'] }, folder, 'moderate', null, progress))
      .rejects.toThrow(/AI service returned 401/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(progress).not.toHaveBeenCalled();
  });
});