import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import sharp from 'sharp';

// Drives the real get-image-preview handler, the same way tests/blurFeedbackService.test.js does.
const root = path.resolve(import.meta.dirname, '..');
const logger = { log() {}, warn() {}, error() {} };
function load(file, mocks = {}) {
  const filename = path.join(root, file);
  const nativeRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(filename, 'utf8'),
    {
      module,
      exports: module.exports,
      __dirname: path.dirname(filename),
      require: (name) => (Object.hasOwn(mocks, name) ? mocks[name] : nativeRequire(name)),
      process,
      Buffer,
      console,
      setTimeout,
      clearTimeout,
    },
    { filename }
  );
  return module.exports;
}

let folder, config, exifService, blur;
function previewHandler() {
  const handlers = new Map();
  const mocks = {
    electron: { dialog: {}, shell: {} },
    './config': config,
    '../utils/logger': logger,
    './blurDetectionService': blur,
    './exifService': exifService,
    './securityManager': (() => {
      const security = load('src/main/securityManager.js', { './config': config, '../utils/logger': logger });
      security.registerAllowedPath(folder);
      return security;
    })(),
    './ipcRateLimiter': { rateLimitedHandle: (ipc, name, fn) => ipc.handle(name, fn) },
    './rollbackManager': { init() {} },
    '../utils/errorSanitizer': load('src/utils/errorSanitizer.js', { './logger': logger }),
  };
  for (const name of [
    'progressManager',
    'authService',
    'subscriptionService',
    'deviceService',
    'batchEngine',
    'batchExecutor',
    'fileUtils',
  ])
    mocks['./' + name] = {};
  load('src/main/ipcHandlers.js', mocks).registerIpcHandlers(
    { handle: (name, fn) => handlers.set(name, fn) },
    {},
    () => ({}),
    {}
  );
  const handler = handlers.get('get-image-preview');
  return (fileName = 'photo.jpg', folderPath = folder) => handler({}, { folderPath, fileName });
}
const preview = (...args) => previewHandler()(...args);

beforeEach(async () => {
  // Inside the repo, like tests/blurFeedbackService.test.js: securityManager refuses AppData,
  // and that is where os.tmpdir() lives on Windows.
  folder = fs.mkdtempSync(path.join(root, '.preview-metadata-test-'));
  config = { features: { BLUR_BETA_ENABLED: false } };
  exifService = load('src/main/exifService.js', { '../utils/logger': logger });
  blur = {};
  // A 2000x1000 photo the camera stored sideways (orientation 6): upright it is 1000 wide, 2000 tall.
  await sharp({ create: { width: 2000, height: 1000, channels: 3, background: 'gray' } })
    .withMetadata({ orientation: 6 })
    .withExif({ IFD0: { Make: 'Sony', Model: 'ILCE-7M4' } })
    .jpeg()
    .toFile(path.join(folder, 'photo.jpg'));
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(folder, { recursive: true, force: true });
});

describe('get-image-preview metadata', () => {
  it('returns QuickPitik metadata and the original upright pixel size with the preview', async () => {
    const result = await preview();
    expect(result.success).toBe(true);
    expect([result.width, result.height]).toEqual([800, 1600]);
    expect(result.metadata).toMatchObject({
      status: 'ready',
      fields: { cameraMake: 'Sony', cameraModel: 'ILCE-7M4' },
      fileSizeBytes: fs.statSync(path.join(folder, 'photo.jpg')).size,
      width: 1000,
      height: 2000,
    });
  });

  it('blur beta mode still reads the original file, not the metadata-free JPEG', async () => {
    config.features.BLUR_BETA_ENABLED = true;
    blur = {
      prepareImageForUpload: vi.fn(async () =>
        sharp({ create: { width: 64, height: 32, channels: 3, background: 'gray' } })
          .jpeg()
          .toBuffer()
      ),
    };
    const result = await preview();
    expect(blur.prepareImageForUpload).toHaveBeenCalled();
    expect(result.metadata).toMatchObject({
      status: 'ready',
      fields: { cameraMake: 'Sony' },
      width: 1000,
      height: 2000,
    });
  });

  it('a metadata failure never fails the preview', async () => {
    exifService = {
      readPhotoMetadata: vi.fn(async () => {
        throw new Error('boom');
      }),
    };
    const result = await preview();
    expect(result.success).toBe(true);
    expect(result.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(result.metadata).toEqual({ status: 'failed', width: 1000, height: 2000 });
  });

  it('serves metadata from the preview cache on a repeat request', async () => {
    const spy = vi.spyOn(exifService, 'readPhotoMetadata');
    const get = previewHandler();
    const first = await get();
    const second = await get();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(second.metadata).toEqual(first.metadata);
  });

  it('checks the folder allow-list before reading any metadata', async () => {
    const spy = vi.spyOn(exifService, 'readPhotoMetadata');
    const outside = fs.mkdtempSync(path.join(root, '.preview-outside-test-'));
    fs.copyFileSync(path.join(folder, 'photo.jpg'), path.join(outside, 'photo.jpg'));
    expect(await preview('photo.jpg', outside)).toEqual({ success: false, error: 'Access denied' });
    expect(spy).not.toHaveBeenCalled();
    fs.rmSync(outside, { recursive: true, force: true });
  });
});
