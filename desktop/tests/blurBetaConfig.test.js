import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const folders = [];
const logger = { log() {}, warn() {}, error() {}, time() {}, timeEnd() {} };
function load(file, mocks = {}, overrides = {}) {
  const filename = path.join(root, file);
  const nativeRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, __dirname: path.dirname(filename),
    require: name => Object.hasOwn(mocks, name) ? mocks[name] : nativeRequire(name),
    process, Buffer, URL, console, setTimeout, clearTimeout, AbortController, AbortSignal,
    TextDecoder, TextEncoder, FormData, Blob, ...overrides,
  }, { filename });
  return module.exports;
}
function temporaryFolder() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'blur-beta-'));
  folders.push(folder);
  return folder;
}
function configFor(manifest, packaged = true, env = {}) {
  const resourcesPath = temporaryFolder();
  if (manifest !== undefined) fs.writeFileSync(path.join(resourcesPath, 'blur-beta.json'), manifest);
  return load('src/main/config.js', { electron: { app: { isPackaged: packaged } } }, {
    process: { resourcesPath, env },
  });
}
const validManifest = JSON.stringify({ environment: 'staging', blurApiUrl: 'https://blur-staging.example.test' });
function ipcFor(config, keyStore = {}) {
  const handlers = new Map();
  const net = { fetch: vi.fn(async () => ({ ok: false })) };
  const electron = { app: { getVersion: () => '1.0.6-beta.1' }, net, dialog: {}, shell: {} };
  const limiter = load('src/main/ipcRateLimiter.js', { '../utils/logger': logger });
  const mocks = {
    electron, './config': config, '../utils/logger': logger,
    './blurBetaKeyStore': keyStore, './ipcRateLimiter': limiter,
    './rollbackManager': { init() {} },
    '../utils/errorSanitizer': load('src/utils/errorSanitizer.js', { './logger': logger }),
  };
  for (const name of ['progressManager', 'authService', 'subscriptionService', 'deviceService',
    'batchEngine', 'exifService', 'blurDetectionService', 'batchExecutor', 'securityManager', 'fileUtils']) {
    mocks[`./${name}`] = {};
  }
  load('src/main/ipcHandlers.js', mocks).registerIpcHandlers(
    { handle: (name, fn) => handlers.set(name, fn) }, {}, () => ({}), {});
  return { handlers, net };
}
function keyStoreFixture() {
  const disk = new Map();
  let encrypted = true;
  class Store {
    constructor({ name }) { this.name = name; }
    get store() { return disk.get(this.name) || {}; }
    set store(value) { disk.set(this.name, value); }
  }
  const electron = {
    app: { getPath: () => temporaryFolder() },
    safeStorage: {
      isEncryptionAvailable: () => encrypted,
      encryptString: value => Buffer.from(value.split('').reverse().join('')),
      decryptString: value => value.toString().split('').reverse().join(''),
    },
  };
  const SecureStore = load('src/main/secureStore.js', { electron, 'electron-store': Store });
  const reload = () => {
    expect(fs.existsSync(path.join(root, 'src/main/blurBetaKeyStore.js'))).toBe(true);
    return load('src/main/blurBetaKeyStore.js', { electron, './secureStore': SecureStore });
  };
  return { reload, disk, disableEncryption: () => { encrypted = false; } };
}
afterEach(() => {
  vi.useRealTimers();
  for (const folder of folders.splice(0)) fs.rmSync(folder, { recursive: true, force: true });
});

describe('packaged beta configuration', () => {
  it.each([undefined, '{broken', 'null', '{}',
    JSON.stringify({ environment: 'production', blurApiUrl: 'https://blur.example.test' }),
    ...['http://staging.test', 'https://user:secret@staging.test', 'https://staging.test/api',
      'https://staging.test/?key=secret', 'https://staging.test/#key'].map(blurApiUrl =>
      JSON.stringify({ environment: 'staging', blurApiUrl })),
  ])('disables all blur features for missing/invalid manifest %s despite environment flags', manifest => {
    const config = configFor(manifest, true, {
      BATCH_BLUR_BETA_ENABLED: 'true', BATCH_BLUR_DETECTION_ENABLED: 'true',
      BATCH_BLUR_AI_ENABLED: 'true', BATCH_BLUR_AI_API_KEY: 'must-not-use',
    });
    expect(config.features.BLUR_BETA_ENABLED).toBe(false);
    expect(config.features.BLUR_DETECTION_ENABLED).toBe(false);
    expect(config.features.BLUR_AI_ENABLED).toBe(false);
    expect(config.features.BLUR_AI_API_KEY).toBe('');
  });
  it('enables the packaged staging UI only from the manifest', () => {
    const config = configFor(validManifest, true, { BATCH_BLUR_AI_URL: 'https://wrong.test' });
    expect(config.features).toMatchObject({
      BLUR_BETA_ENABLED: true, BLUR_DETECTION_ENABLED: true, BLUR_AI_ENABLED: true,
      BLUR_AI_URL: 'https://blur-staging.example.test', BLUR_AI_API_KEY: '',
    });
  });
  it('preserves source environment settings and ignores a packaged manifest', () => {
    const config = configFor(validManifest, false, {
      BATCH_BLUR_AI_ENABLED: 'true', BATCH_BLUR_AI_URL: 'http://localhost:8123',
      BATCH_BLUR_AI_API_KEY: 'source-key',
    });
    expect(config.features).toMatchObject({ BLUR_BETA_ENABLED: false, BLUR_DETECTION_ENABLED: false,
      BLUR_AI_ENABLED: true, BLUR_AI_URL: 'http://localhost:8123', BLUR_AI_API_KEY: 'source-key' });
  });
});

describe('beta key setup', () => {
  it('stores through SecureStore, survives reload, and exposes only status through preload', async () => {
    const fixture = keyStoreFixture();
    const keyStore = fixture.reload();
    const { handlers } = ipcFor(configFor(validManifest), keyStore);
    let api;
    load('preload.js', { electron: {
      contextBridge: { exposeInMainWorld: (_name, value) => { api = value; } },
      ipcRenderer: { invoke: (name, ...args) => handlers.get(name)({}, ...args) },
    } });
    expect(typeof api.blurBetaKey).toBe('function');
    expect(await api.blurBetaKey()).toEqual({ enabled: true, configured: false });
    expect(await api.blurBetaKey('stub-tester-key')).toEqual({ enabled: true, configured: true });
    expect(await api.blurBetaKey()).toEqual({ enabled: true, configured: true });
    expect(fixture.reload().get()).toBe('stub-tester-key');
    expect([...fixture.disk.keys()]).toEqual(['blur-beta-key']);
    expect(JSON.stringify([...fixture.disk.values()])).not.toContain('stub-tester-key');
  });
  it.each(['', ' ', 'bad key', 'key\n', 'x'.repeat(1025), null, 42])('rejects invalid key input %j', async key => {
    const keyStore = keyStoreFixture().reload();
    const { handlers } = ipcFor(configFor(validManifest), keyStore);
    expect(typeof handlers.get('blur-beta-key')).toBe('function');
    await expect(handlers.get('blur-beta-key')({}, { key })).rejects.toThrow(/key/i);
    expect(keyStore.get()).toBe('');
  });
  it('does not write secrets when OS encryption is unavailable', () => {
    const fixture = keyStoreFixture();
    const keyStore = fixture.reload();
    fixture.disableEncryption();
    expect(() => keyStore.set('stub-key')).toThrow(/encrypt/i);
    expect(fixture.disk.size).toBe(0);
  });
  it('does not access the key store outside the beta', async () => {
    const keyStore = { get: vi.fn(), set: vi.fn() };
    const { handlers } = ipcFor(configFor(undefined), keyStore);
    expect(typeof handlers.get('blur-beta-key')).toBe('function');
    expect(await handlers.get('blur-beta-key')({}, { key: 'stub-key' }))
      .toEqual({ enabled: false, configured: false });
    expect(keyStore.get).not.toHaveBeenCalled();
    expect(keyStore.set).not.toHaveBeenCalled();
  });
  it('reads an entered/replaced beta key lazily for actual analysis requests', async () => {
    const keyStore = keyStoreFixture().reload();
    const folder = temporaryFolder();
    await sharp({ create: { width: 8, height: 8, channels: 3, background: 'white' } })
      .jpeg().toFile(path.join(folder, 'photo.jpg'));
    const fetch = vi.fn(async () => new Response([
      { index: 0, filename: '0', predicted_class: 'sharp', confidence: 1,
        probabilities: { sharp: 1, motion_blurred: 0, defocused_blurred: 0, defocused_object_portrait: 0 } },
      { _summary: true, complete: true, total: 1, successful: 1, errors: 0 },
    ].map(row => JSON.stringify(row)).join('\n') + '\n'));
    const blur = load('src/main/blurDetectionService.js', {
      electron: { net: { fetch } }, './config': configFor(validManifest),
      './blurBetaKeyStore': keyStore, '../utils/logger': logger,
    });
    for (const key of ['first-stub-key', 'replacement-stub-key']) {
      keyStore.set(key);
      blur.clearCache();
      await blur.analyzeBlur({ photo: ['photo.jpg'] }, folder, 'moderate');
      expect(fetch.mock.lastCall[1].headers['X-API-Key']).toBe(key);
    }
  });
});

describe('beta public updater suppression', () => {
  it('skips the public version banner network call', async () => {
    const { handlers, net } = ipcFor(configFor(validManifest));
    expect(await handlers.get('check-app-version')({})).toMatchObject({ updateAvailable: false });
    expect(net.fetch).not.toHaveBeenCalled();
  });
  it('disables startup and all manual updater actions', async () => {
    vi.useFakeTimers();
    const handlers = new Map();
    const updater = { on: vi.fn(), checkForUpdates: vi.fn(), downloadUpdate: vi.fn(), quitAndInstall: vi.fn() };
    load('src/main/updateManager.js', {
      './config': configFor(validManifest), '../utils/logger': logger,
      'electron-updater': { autoUpdater: updater },
      electron: { app: { isPackaged: true }, ipcMain: { handle: (name, fn) => handlers.set(name, fn) } },
    }).initAutoUpdater(() => null);
    await vi.advanceTimersByTimeAsync(10000);
    for (const name of ['check-for-updates', 'download-update', 'install-update']) {
      expect(await handlers.get(name)()).toEqual({ status: 'disabled-beta' });
    }
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    expect(updater.on).not.toHaveBeenCalled();
  });
});

describe('private beta build settings', () => {
  function settings(env) {
    expect(fs.existsSync(path.join(root, 'scripts/write-blur-beta-config.cjs'))).toBe(true);
    return load('scripts/write-blur-beta-config.cjs').readBuildSettings(env);
  }
  it.each([
    {}, { BATCH_BLUR_AI_URL: 'https://staging.test' },
    { BATCH_BETA_VERSION: '1.0.6-beta.1' },
    { BATCH_BLUR_AI_URL: 'http://staging.test', BATCH_BETA_VERSION: '1.0.6-beta.1' },
    { BATCH_BLUR_AI_URL: 'https://staging.test/path', BATCH_BETA_VERSION: '1.0.6-beta.1' },
    { BATCH_BLUR_AI_URL: 'https://staging.test', BATCH_BETA_VERSION: '1.0.6' },
  ])('rejects missing or non-beta build inputs %j', env => {
    expect(fs.existsSync(path.join(root, 'scripts/write-blur-beta-config.cjs'))).toBe(true);
    expect(() => settings(env)).toThrow(/BATCH_/);
  });
  it('produces only the staging manifest and a beta version without reading the key', () => {
    const env = { BATCH_BLUR_AI_URL: 'https://blur-staging.example.test', BATCH_BETA_VERSION: '1.0.6-beta.1' };
    Object.defineProperty(env, 'BATCH_BLUR_AI_API_KEY', { get() { throw new Error('Key must not be read'); } });
    expect(settings(env)).toEqual({
      manifest: { environment: 'staging', blurApiUrl: 'https://blur-staging.example.test' },
      version: '1.0.6-beta.1',
    });
  });
});
