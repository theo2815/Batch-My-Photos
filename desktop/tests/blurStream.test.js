import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it, vi } from 'vitest';
import Module, { createRequire } from 'node:module';
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
  probabilities: { sharp: 0.9, defocused_blurred: 0, defocused_object_portrait: 0, motion_blurred: 0.1 },
};
const MOTION = {
  predicted_class: 'motion_blurred',
  confidence: 0.8,
  probabilities: { sharp: 0.2, defocused_blurred: 0, defocused_object_portrait: 0, motion_blurred: 0.8 },
};
const summary = (total, successful = total, errors = 0) =>
  ({ _summary: true, total, successful, errors, complete: true });
const row = (index, classification = SHARP) =>
  ({ index, filename: String(index), ...classification });
const groups = { FIRST: ['FIRST.jpg'], SECOND: ['SECOND.jpg', 'SECOND.CR3'] };
let folder;

function blurWithByteBudget(bytes) {
  const require = createRequire(import.meta.url);
  const servicePath = require.resolve('../src/main/blurDetectionService.js');
  const constants = require('../src/main/constants.js');
  const cached = require.cache[servicePath];
  delete require.cache[servicePath];
  Module._load = function (request, ...rest) {
    if (request === 'electron') return { net: { fetch: (...args) => fetchMock(...args) } };
    if (request === './constants') return { ...constants, BLUR_AI_STREAM_MAX_BYTES: bytes };
    return originalLoad.call(this, request, ...rest);
  };
  try { return require(servicePath); } finally {
    Module._load = originalLoad;
    if (cached) require.cache[servicePath] = cached;
    else delete require.cache[servicePath];
  }
}

function ndjsonResponse(objects) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const object of objects) controller.enqueue(encoder.encode(JSON.stringify(object) + '\n'));
      controller.close();
    },
  }), { status: 200 });
}

function jpegOnlySingle({ body }, classification = SHARP) {
  const file = body.get('file');
  if (file?.type !== 'image/jpeg' || file.name !== 'image.jpg') return new Response('expected JPEG', { status: 400 });
  return new Response(JSON.stringify({ success: true, data: classification }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}

beforeAll(async () => {
  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'blur-stream-'));
  const jpeg = await sharp({ create: {
    width: 8, height: 8, channels: 3, background: { r: 120, g: 130, b: 140 },
  } }).jpeg().toBuffer();
  fs.writeFileSync(path.join(folder, 'FIRST.jpg'), jpeg);
  fs.writeFileSync(path.join(folder, 'SECOND.jpg'), jpeg);
  for (const name of ['THIRD', 'FOURTH', 'FIFTH']) fs.writeFileSync(path.join(folder, name + '.jpg'), jpeg);
  fs.writeFileSync(path.join(folder, 'BROKEN.jpg'), 'not an image');
});
beforeEach(() => {
  blur.clearCache();
  fetchMock.mockReset();
});
afterEach(() => vi.useRealTimers());
afterAll(() => fs.rmSync(folder, { recursive: true, force: true }));

describe('real blur stream client', () => {
  it('splits prepared JPEGs by bytes, keeps request-local indices, and ticks once per analyzable group', async () => {
    const smallBlur = blurWithByteBudget(600);
    const progress = vi.fn();
    const sizes = [];
    const names = ['FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH'];
    fetchMock.mockImplementation(async (_url, { body }) => {
      const files = body.getAll('files');
      sizes.push(files.map(file => file.size));
      expect(files.map(file => file.name)).toEqual(files.map((_file, i) => String(i)));
      const start = sizes.slice(0, -1).reduce((sum, request) => sum + request.length, 0);
      return ndjsonResponse([
        ...files.map((_file, i) => row(i, (start + i) % 2 ? MOTION : SHARP)),
        summary(files.length),
      ]);
    });
    const input = Object.fromEntries([...names, 'BROKEN'].map(name => [name, [name + '.jpg']]));
    const results = await smallBlur.analyzeBlur(input, folder, 'moderate', null, progress);
    expect(sizes.map(request => request.length)).toEqual([2, 2, 1]);
    expect(sizes.every(request => request.reduce((sum, size) => sum + size, 0) <= 600)).toBe(true);
    expect(names.map(name => results[name].predictedClass)).toEqual([
      'sharp', 'motion_blurred', 'sharp', 'motion_blurred', 'sharp',
    ]);
    expect(results.BROKEN.score).toBe(-1);
    expect(progress.mock.calls.map(([value]) => value.current)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('caps each request at 100 images even when the byte budget fits more', async () => {
    const smallBlur = blurWithByteBudget(60000);
    const counts = [];
    fetchMock.mockImplementation(async (_url, { body }) => {
      const files = body.getAll('files');
      counts.push(files.length);
      return ndjsonResponse([...files.map((_file, i) => row(i)), summary(files.length)]);
    });
    const input = Object.fromEntries(Array.from({ length: 101 }, (_unused, i) => ['GROUP' + i, ['FIRST.jpg']]));
    const results = await smallBlur.analyzeBlur(input, folder);
    expect(counts).toEqual([100, 1]);
    expect(Object.keys(results)).toHaveLength(101);
  });

  it('continues every byte-split group through sequential single-image fallback', async () => {
    const smallBlur = blurWithByteBudget(600);
    let active = 0;
    let peak = 0;
    const urls = [];
    fetchMock.mockImplementation(async (url, options) => {
      urls.push(url);
      if (url.endsWith('/stream')) return new Response('', { status: 404 });
      active++;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 1));
      active--;
      return jpegOnlySingle(options);
    });
    const input = Object.fromEntries(['FIRST', 'SECOND', 'THIRD', 'FOURTH'].map(name => [name, [name + '.jpg']]));
    const progress = vi.fn();
    const results = await smallBlur.analyzeBlur(input, folder, 'moderate', null, progress);
    expect(urls.filter(url => url.endsWith('/stream'))).toHaveLength(1);
    expect(urls.filter(url => !url.endsWith('/stream'))).toHaveLength(4);
    expect(peak).toBe(1);
    expect(Object.values(results).map(result => result.predictedClass)).toEqual(Array(4).fill('sharp'));
    expect(progress.mock.calls.map(([value]) => value.current)).toEqual([1, 2, 3, 4]);
  });

  it.each([
    ['missing', [row(0)]],
    ['incomplete', [row(0), { ...summary(1), complete: false }]],
    ['duplicate', [row(0), summary(1), summary(1)]],
    ['trailing row', [summary(1), row(0)]],
    ['wrong total', [row(0), summary(2)]],
    ['wrong counts', [row(0), summary(1, 0, 0)]],
  ])('rejects a %s summary without publishing rows', async (_kind, lines) => {
    const progress = vi.fn();
    fetchMock.mockResolvedValue(ndjsonResponse(lines));
    await expect(blur.analyzeBlur({ FIRST: ['FIRST.jpg'] }, folder, 'moderate', null, progress))
      .rejects.toThrow(/AI service.*incomplete/i);
    expect(progress).not.toHaveBeenCalled();
    expect(blur.getCachedBlurResult(folder, 'FIRST.jpg')).toBeNull();
  });

  it.each([
    ['missing prediction', { index: 0, filename: '0' }, summary(1)],
    ['unknown class', row(0, { ...SHARP, predicted_class: 'unknown' }), summary(1)],
    ['invalid confidence', row(0, { ...SHARP, confidence: 2 }), summary(1)],
    ['missing probabilities', row(0, { predicted_class: 'sharp', confidence: 0.9 }), summary(1)],
    ['invalid probability', row(0, { ...SHARP, probabilities: { ...SHARP.probabilities, sharp: 1.2 } }), summary(1)],
    ['invalid error marker', { index: 0, filename: '0', error: null }, summary(1, 0, 1)],
  ])('rejects a %s row without publishing progress', async (_kind, badRow, tail) => {
    const progress = vi.fn();
    fetchMock.mockResolvedValue(ndjsonResponse([badRow, tail]));
    await expect(blur.analyzeBlur({ FIRST: ['FIRST.jpg'] }, folder, 'moderate', null, progress))
      .rejects.toThrow(/AI service.*incomplete/i);
    expect(progress).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps a valid per-image error marker as un-analyzable', async () => {
    const progress = vi.fn();
    fetchMock.mockResolvedValue(ndjsonResponse([
      { index: 0, filename: '0', error: 'Failed to decode image' },
      summary(1, 0, 1),
    ]));
    const results = await blur.analyzeBlur({ FIRST: ['FIRST.jpg'] }, folder, 'moderate', null, progress);
    expect(results.FIRST).toMatchObject({ score: -1, isBlurry: false, analyzedFile: 'FIRST.jpg' });
    expect(progress).toHaveBeenCalledTimes(1);
    expect(blur.getCachedBlurResult(folder, 'FIRST.jpg')).toBeNull();
  });

  it('commits out-of-order rows against their exact image once the summary is valid', async () => {
    const progress = vi.fn();
    fetchMock.mockImplementation(async (_url, { body }) => {
      expect(body.getAll('files').map(file => [file.name, file.type])).toEqual([
        ['0', 'image/jpeg'], ['1', 'image/jpeg'],
      ]);
      return ndjsonResponse([row(1, MOTION), row(0), summary(2)]);
    });
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
    fetchMock.mockImplementation(async (url, options) => {
      if (url.endsWith('/stream')) return ndjsonResponse([row(0), summary(2)]);
      expect(progress).toHaveBeenCalledTimes(1);
      return jpegOnlySingle(options, MOTION);
    });
    const results = await blur.analyzeBlur(groups, folder, 'moderate', null, progress);
    expect(results.SECOND.predictedClass).toBe('motion_blurred');
    expect(progress).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => url.endsWith('/stream'))).toEqual([true, false]);
  });

  it('recovers valid JPEGs through the single endpoint when streaming is unavailable', async () => {
    fetchMock.mockImplementation(async (url, options) => url.endsWith('/stream')
      ? new Response('', { status: 404 })
      : jpegOnlySingle(options));
    const results = await blur.analyzeBlur(groups, folder, 'moderate');
    expect(results.FIRST).toMatchObject({ analyzedFile: 'FIRST.jpg', predictedClass: 'sharp', score: 0.1 });
    expect(results.SECOND).toMatchObject({ analyzedFile: 'SECOND.jpg', predictedClass: 'sharp', score: 0.1 });
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

  it('waits for a valid 10-second Retry-After before one stream retry', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(new Response('busy', { status: 429, headers: { 'Retry-After': '10' } }));
    fetchMock.mockResolvedValueOnce(ndjsonResponse([row(0), summary(1)]));
    const pending = blur.analyzeBlur({ FIRST: ['FIRST.jpg'] }, folder);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(8000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await pending;
  });

  it.each([undefined, 'later'])('uses two seconds when Retry-After is %s', async (header) => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(new Response('busy', {
      status: 503, headers: header === undefined ? {} : { 'Retry-After': header },
    }));
    fetchMock.mockResolvedValueOnce(ndjsonResponse([row(0), summary(1)]));
    const pending = blur.analyzeBlur({ FIRST: ['FIRST.jpg'] }, folder);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(2000);
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces a server wait beyond 30 seconds without retrying early', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(new Response('busy', { status: 503, headers: { 'Retry-After': '31' } }));
    const pending = blur.analyzeBlur({ FIRST: ['FIRST.jpg'] }, folder);
    const rejected = expect(pending).rejects.toThrow(/temporarily unavailable/i);
    await rejected;
    await vi.advanceTimersByTimeAsync(30000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

  it('re-reads a replaced image when beta analysis is explicitly restarted', async () => {
    fetchMock.mockImplementation(async () => ndjsonResponse([row(0), summary(1)]));
    await blur.analyzeBlur({ FIRST: ['FIRST.jpg'] }, folder, 'moderate', null, null, true);
    const changed = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'black' } }).jpeg().toBuffer();
    fs.writeFileSync(path.join(folder, 'FIRST.jpg'), changed);
    try {
      await blur.analyzeBlur({ FIRST: ['FIRST.jpg'] }, folder, 'moderate', null, null, true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      const original = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 120, g: 130, b: 140 } } }).jpeg().toBuffer();
      fs.writeFileSync(path.join(folder, 'FIRST.jpg'), original);
    }
  });

  it('serializes beta requests and discards a superseded result from the feedback cache', async () => {
    let finishFirst;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }))
      .mockImplementationOnce(async () => ndjsonResponse([row(0, MOTION), summary(1)]));
    const first = blur.analyzeBlur({ FIRST: ['FIRST.jpg'] }, folder, 'moderate', null, null, true);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await expect(blur.analyzeBlur({ FIRST: ['FIRST.jpg'] }, folder, 'moderate', null, null, true))
      .rejects.toThrow(/already in progress/i);
    finishFirst(ndjsonResponse([row(0), summary(1)]));
    await first;
    expect(blur.getCachedBlurResult(folder, 'FIRST.jpg')).toBeNull();
    const latest = await blur.analyzeBlur({ FIRST: ['FIRST.jpg'] }, folder, 'moderate', null, null, true);
    expect(latest.FIRST.predictedClass).toBe('motion_blurred');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed classification from the single-image fallback', async () => {
    fetchMock.mockImplementation(async url => url.endsWith('/stream')
      ? new Response('', { status: 404 })
      : new Response(JSON.stringify({ success: true, data: { predicted_class: 'sharp', confidence: 0.9 } }),
        { headers: { 'Content-Type': 'application/json' } }));
    await expect(blur.analyzeBlur({ FIRST: ['FIRST.jpg'] }, folder, 'moderate'))
      .rejects.toThrow(/invalid classification/i);
    expect(blur.getCachedBlurResult(folder, 'FIRST.jpg')).toBeNull();
  });
});
