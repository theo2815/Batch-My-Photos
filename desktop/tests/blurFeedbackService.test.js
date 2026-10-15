import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const logger = { log() {}, warn() {}, error() {} };
function load(file, mocks = {}) {
  const filename = path.join(root, file);
  const nativeRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, __dirname: path.dirname(filename),
    require: name => Object.hasOwn(mocks, name) ? mocks[name] : nativeRequire(name),
    process, Buffer, console, setTimeout, clearTimeout, AbortController, AbortSignal,
    TextDecoder, TextEncoder, FormData, Blob,
  }, { filename });
  return module.exports;
}
const userId = '11111111-1111-4111-8111-111111111111';
const token = version => `stub.${Buffer.from(JSON.stringify({ sub: userId, version })).toString('base64url')}.signature`;
let folder, photoFolder, config, blur, security, auth, fetchMock, submit, analysisHash;
const input = () => ({ folderPath: photoFolder, fileName: 'photo.jpg', label: 'sharp',
  displayedHash: analysisHash });
async function writePhoto(color = 'white') {
  const bytes = await sharp({ create: { width: 32, height: 24, channels: 3, background: color } })
    .withExif({ IFD0: { Artist: 'PRIVATE CAMERA OWNER', ImageDescription: photoFolder } })
    .jpeg().toBuffer();
  fs.writeFileSync(path.join(photoFolder, 'photo.jpg'), bytes);
}
function service() {
  expect(fs.existsSync(path.join(root, 'src/main/blurFeedbackService.js'))).toBe(true);
  return load('src/main/blurFeedbackService.js', {
    electron: { net: { fetch: fetchMock }, app: { getVersion: () => '1.0.6-beta.1' } },
    './config': config, './authService': auth, './securityManager': security,
    './blurDetectionService': blur,
  }).submitBlurExample;
}
beforeEach(async () => {
  folder = fs.mkdtempSync(path.join(root, '.feedback-test-'));
  photoFolder = path.join(folder, 'photos');
  fs.mkdirSync(photoFolder);
  config = { features: { BLUR_BETA_ENABLED: true, BLUR_AI_ENABLED: true,
    BLUR_AI_URL: 'https://inference.example.test' },
    urls: { SUPABASE_URL: 'https://feedback.example.test', SUPABASE_ANON_KEY: 'anon-test' } };
  auth = { getStoredSession: () => token(1),
    refreshAccessToken: vi.fn(async () => ({ refreshed: true, accessToken: token(2) })) };
  security = load('src/main/securityManager.js', { './config': config, '../utils/logger': logger });
  security.registerAllowedPath(photoFolder);
  await writePhoto();
  fs.copyFileSync(path.join(photoFolder, 'photo.jpg'), path.join(photoFolder, 'photo.CR3'));
  blur = load('src/main/blurDetectionService.js', {
    './config': config, '../utils/logger': logger,
    electron: { net: { fetch: async () => new Response([
      { index: 0, filename: '0', predicted_class: 'motion_blurred', confidence: 0.8,
        probabilities: { sharp: 0.1, motion_blurred: 0.8, defocused_blurred: 0.05, defocused_object_portrait: 0.05 } },
      { _summary: true, complete: true, total: 1, successful: 1, errors: 0 },
    ].map(row => JSON.stringify(row)).join('\n') + '\n') } },
  });
  await blur.analyzeBlur({ photo: ['photo.jpg', 'photo.CR3'] }, photoFolder);
  analysisHash = crypto.createHash('sha256').update(await blur.prepareImageForUpload(path.join(photoFolder, 'photo.jpg'))).digest('hex');
  fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
  submit = service();
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(folder, { recursive: true, force: true });
});

describe('explicit single-image feedback', () => {
  it.each(['../secret.jpg', '..\\secret.jpg', 'photo.jpg:secret', 'photo.CR3', '/photo.jpg'])('rejects unsafe or unanalyzed filename %s before networking', async fileName => {
      await expect(submit({ ...input(), fileName })).rejects.toThrow(/selected image|analyzed image/i);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  it('rejects an unregistered folder', async () => {
    await expect(submit({ ...input(), folderPath: folder })).rejects.toThrow(/selected image/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects a symlink outside the selected folder', async () => {
    const outside = path.join(folder, 'outside.jpg');
    fs.renameSync(path.join(photoFolder, 'photo.jpg'), outside);
    // Windows permits junctions without the file-symlink privilege. Both must be rejected.
    fs.symlinkSync(process.platform === 'win32' ? folder : outside,
      path.join(photoFolder, 'photo.jpg'), process.platform === 'win32' ? 'junction' : 'file');
    await expect(submit(input())).rejects.toThrow(/selected image/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects stale analysis after clearing the cache', async () => {
    blur.clearCache();
    await expect(submit(input())).rejects.toThrow(/analyzed image/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects changed image content even when its timestamp is restored', async () => {
    const original = fs.statSync(path.join(photoFolder, 'photo.jpg'));
    await writePhoto('black');
    fs.utimesSync(path.join(photoFolder, 'photo.jpg'), original.atime, original.mtime);
    await expect(submit(input())).rejects.toThrow(/analyzed image/i);
    expect(fetchMock).not.toHaveBeenCalled();
    await blur.analyzeBlur({ photo: ['photo.jpg', 'photo.CR3'] }, photoFolder);
    analysisHash = crypto.createHash('sha256').update(await blur.prepareImageForUpload(path.join(photoFolder, 'photo.jpg'))).digest('hex');
    expect(await submit(input())).toEqual({ success: true });
  });
  it.each(['motion_blurred', '', null, 1])('rejects invalid human label %j', async label => {
    await expect(submit({ ...input(), label })).rejects.toThrow(/label/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects disabled beta and signed-out sessions', async () => {
    config.features.BLUR_BETA_ENABLED = false;
    await expect(submit(input())).rejects.toThrow(/beta/i);
    config.features.BLUR_BETA_ENABLED = true;
    auth.getStoredSession = () => null;
    await expect(submit(input())).rejects.toThrow(/sign in/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not log an absolute path when preparing an unavailable image', async () => {
    const warning = vi.spyOn(logger, 'warn');
    expect(await blur.prepareImageForUpload(path.join(photoFolder, 'missing.jpg'))).toBeNull();
    expect(warning).toHaveBeenCalled();
    expect(JSON.stringify(warning.mock.calls)).not.toContain(photoFolder.replaceAll('\\', '\\\\'));
    expect(JSON.stringify(warning.mock.calls)).toContain('ENOENT');
  });
  it('rejects feedback when the displayed preview and current analyzed bytes differ', async () => {
    const displayedHash = analysisHash;
    expect(displayedHash).toMatch(/^[a-f0-9]{64}$/);
    await writePhoto('black');
    await expect(submit({ ...input(), displayedHash })).rejects.toThrow(/analyzed image/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('requires the displayed preview content token', async () => {
    await expect(submit({ ...input(), displayedHash: undefined })).rejects.toThrow(/selected image/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not upload replacement B while the preview still displays analyzed A', async () => {
    const handlers = new Map();
    const mocks = {
      electron: { dialog: {}, shell: {} }, './config': config, '../utils/logger': logger,
      './blurDetectionService': blur, './securityManager': security,
      './ipcRateLimiter': { rateLimitedHandle: (ipc, name, fn) => ipc.handle(name, fn) },
      './rollbackManager': { init() {} },
      '../utils/errorSanitizer': load('src/utils/errorSanitizer.js', { './logger': logger }),
    };
    for (const name of ['progressManager', 'authService', 'subscriptionService', 'deviceService',
      'batchEngine', 'exifService', 'batchExecutor', 'fileUtils']) mocks['./' + name] = {};
    load('src/main/ipcHandlers.js', mocks).registerIpcHandlers(
      { handle: (name, fn) => handlers.set(name, fn) }, {}, () => ({}), {});
    const preview = await handlers.get('get-image-preview')({}, input());
    expect(preview.success).toBe(true);
    expect(preview.contentHash).toBe(analysisHash);
    expect((await sharp(Buffer.from(preview.dataUrl.split(',')[1], 'base64')).stats()).channels[0].mean).toBeGreaterThan(200);
    await writePhoto('black');
    const replacement = await handlers.get('get-image-preview')({}, input());
    expect(replacement.contentHash).not.toBe(preview.contentHash);
    expect((await sharp(Buffer.from(replacement.dataUrl.split(',')[1], 'base64')).stats()).channels[0].mean).toBeLessThan(50);
    await expect(submit({ ...input(), displayedHash: preview.contentHash })).rejects.toThrow(/analyzed image/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('bounds the encoded upload before networking', async () => {
    vi.spyOn(blur, 'prepareImageForUpload').mockResolvedValue(Buffer.alloc(2097153));
    await expect(submit(input())).rejects.toThrow(/2 MB/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('sends one metadata-free JPEG and only main-owned prediction metadata', async () => {
    expect(await submit({ ...input(), score: 0, predictedClass: 'sharp' })).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [uploadUrl, upload] = fetchMock.mock.calls[0];
    const [metadataUrl, metadata] = fetchMock.mock.calls[1];
    expect(uploadUrl).toMatch(new RegExp(`/storage/v1/object/blur-beta-feedback/${userId}/[a-f0-9-]+\\.jpg$`));
    expect(upload.method).toBe('POST');
    expect(upload.headers).toMatchObject({ apikey: 'anon-test', Authorization: `Bearer ${token(1)}`, 'Content-Type': 'image/jpeg' });
    const image = await sharp(upload.body).metadata();
    expect(image.format).toBe('jpeg');
    expect(image.exif).toBeUndefined();
    expect(upload.body.toString()).not.toContain('PRIVATE CAMERA OWNER');
    expect(upload.body.toString()).not.toContain(photoFolder);
    expect(metadataUrl).toBe('https://feedback.example.test/rest/v1/blur_beta_feedback');
    expect(metadata.method).toBe('POST');
    expect(JSON.parse(metadata.body)).toEqual({ object_name: uploadUrl.split('/blur-beta-feedback/')[1],
      predicted_class: 'motion_blurred', score: 0.9, human_label: 'sharp',
      beta_version: '1.0.6-beta.1', source_environment: 'staging' });
  });
  it('deletes the exact object over Storage HTTP after metadata rejection', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}')).mockResolvedValueOnce(new Response('private error', { status: 400 }));
    await expect(submit(input())).rejects.toThrow(/save/i);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toBe('https://feedback.example.test/storage/v1/object/blur-beta-feedback');
    expect(fetchMock.mock.calls[2][1].method).toBe('DELETE');
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ prefixes: [fetchMock.mock.calls[0][0].split('/blur-beta-feedback/')[1]] });
  });
  it('removes the exact object when the upload response is lost', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Lost upload response'));
    await expect(submit(input())).rejects.toThrow(/save/i);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      prefixes: [fetchMock.mock.calls[0][0].split('/blur-beta-feedback/')[1]],
    });
  });
  it('never retries with another account after refresh changes the session owner', async () => {
    const otherToken = 'stub.' + Buffer.from(JSON.stringify({
      sub: '22222222-2222-4222-8222-222222222222',
    })).toString('base64url') + '.signature';
    auth.refreshAccessToken.mockResolvedValueOnce({ refreshed: true, accessToken: otherToken });
    fetchMock.mockResolvedValueOnce(new Response('{}'))
      .mockResolvedValueOnce(new Response('{}', { status: 401 }));
    await expect(submit(input())).rejects.toThrow(/save/i);
    expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.map(([, options]) => options.method)).toEqual(['POST', 'POST', 'DELETE']);
    for (const [, options] of fetchMock.mock.calls) {
      expect(options.headers.Authorization).toBe('Bearer ' + token(1));
    }
  });
  it('refreshes metadata authorization once without uploading a second object', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}')).mockResolvedValueOnce(new Response('{}', { status: 401 }));
    expect(await submit(input())).toEqual({ success: true });
    expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.filter(([url]) => url.includes('/storage/'))).toHaveLength(1);
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe(`Bearer ${token(2)}`);
    expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[2][1].body);
  });
  it('retries a rejected upload with the same object name after refresh', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }));
    expect(await submit(input())).toEqual({ success: true });
    expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(fetchMock.mock.calls[1][0]);
  });
  it('stops refreshing after one attempt and cleans up the uploaded object', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}'))
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{}', { status: 401 }));
    await expect(submit(input())).rejects.toThrow(/save/i);
    expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.at(-1)[1].method).toBe('DELETE');
  });
});


describe('feedback IPC boundary', () => {
  it('keeps rejected and unavailable blur folder paths out of logs and renderer errors', async () => {
    const handlers = new Map();
    const warning = vi.spyOn(logger, 'warn');
    const error = vi.spyOn(logger, 'error');
    config.features.BLUR_DETECTION_ENABLED = true;
    const allowed = vi.fn().mockResolvedValue(false);
    const mocks = {
      electron: { dialog: {}, shell: {} }, './config': config, '../utils/logger': logger,
      './securityManager': { isPathAllowedAsync: allowed },
      './ipcRateLimiter': { rateLimitedHandle: (ipc, name, fn) => ipc.handle(name, fn) },
      './rollbackManager': { init() {} },
      '../utils/errorSanitizer': load('src/utils/errorSanitizer.js', { './logger': logger }),
    };
    for (const name of ['progressManager', 'authService', 'subscriptionService', 'deviceService',
      'batchEngine', 'exifService', 'blurDetectionService', 'batchExecutor', 'fileUtils']) mocks['./' + name] = {};
    load('src/main/ipcHandlers.js', mocks).registerIpcHandlers(
      { handle: (name, fn) => handlers.set(name, fn) }, {}, () => ({}), {});
    const missing = path.join(photoFolder, 'missing-folder');
    const invoke = () => handlers.get('analyze-blur')({}, { folderPath: missing });
    expect((await invoke()).success).toBe(false);
    allowed.mockResolvedValue(true);
    const result = await invoke();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
    const output = [...warning.mock.calls, ...error.mock.calls].flat().map(value => typeof value === 'object' ? JSON.stringify(value) : String(value)).join(' ');
    expect(output).not.toContain(photoFolder);
    expect(output).toContain('ENOENT');
    expect(JSON.stringify(result)).not.toContain('missing-folder');
  });
  it('exposes only the selected image and label, and never forwards service errors', async () => {
    const handlers = new Map();
    const call = vi.fn().mockRejectedValue(new Error(`secret-token ${photoFolder}`));
    const mocks = {
      electron: { dialog: {}, shell: {} }, './config': config, '../utils/logger': logger,
      './blurFeedbackService': { submitBlurExample: call },
      './ipcRateLimiter': { rateLimitedHandle: (ipc, name, fn) => ipc.handle(name, fn) },
      './rollbackManager': { init() {} },
      '../utils/errorSanitizer': load('src/utils/errorSanitizer.js', { './logger': logger }),
    };
    for (const name of ['progressManager', 'authService', 'subscriptionService', 'deviceService',
      'batchEngine', 'exifService', 'blurDetectionService', 'batchExecutor', 'securityManager', 'fileUtils']) {
      mocks[`./${name}`] = {};
    }
    load('src/main/ipcHandlers.js', mocks).registerIpcHandlers(
      { handle: (name, fn) => handlers.set(name, fn) }, {}, () => ({}), {});
    let api;
    load('preload.js', { electron: {
      contextBridge: { exposeInMainWorld: (_name, value) => { api = value; } },
      ipcRenderer: { invoke: (name, ...args) => handlers.get(name)({}, ...args) },
    } });
    const result = await api.submitBlurExample({ ...input(), score: 0, predictedClass: 'sharp' });
    expect(call).toHaveBeenCalledWith(input());
    expect(result.success).toBe(false);
    expect(Object.keys(result).sort()).toEqual(['error', 'success']);
    expect(result.error).not.toContain('secret-token');
    expect(result.error).not.toContain(photoFolder);
    call.mockResolvedValueOnce({ success: true, token: 'must-not-leak' });
    expect(await api.submitBlurExample(input())).toEqual({ success: true });
  });
});
