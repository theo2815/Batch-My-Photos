import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

// Same vm loader as blurBetaConfig.test.js: evaluates a CommonJS file with a
// require shim so Electron never has to start.
const root = path.resolve(import.meta.dirname, '..');
const folders = [];
const logger = { log() {}, warn() {}, error() {}, info() {}, debug() {}, time() {}, timeEnd() {} };
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
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'qp-config-'));
  folders.push(folder);
  return folder;
}
function configFor(packaged, env = {}) {
  return load('src/main/config.js', { electron: { app: { isPackaged: packaged } } }, {
    process: { resourcesPath: temporaryFolder(), env },
  });
}
function ipcFor(config) {
  const handlers = new Map();
  const electron = { app: { getVersion: () => '1.0.6' }, net: { fetch: async () => ({ ok: false }) }, dialog: {}, shell: {} };
  const limiter = load('src/main/ipcRateLimiter.js', { '../utils/logger': logger, './windowManager': { isAppUrl: () => true } });
  const mocks = {
    electron, './config': config, '../utils/logger': logger, './ipcRateLimiter': limiter,
    './rollbackManager': { init() {} },
    '../utils/errorSanitizer': load('src/utils/errorSanitizer.js', { './logger': logger }),
  };
  for (const name of ['progressManager', 'authService', 'subscriptionService', 'deviceService', 'blurBetaKeyStore',
    'batchEngine', 'exifService', 'blurDetectionService', 'batchExecutor', 'securityManager', 'fileUtils']) {
    mocks[`./${name}`] = {};
  }
  load('src/main/ipcHandlers.js', mocks).registerIpcHandlers(
    { handle: (name, fn) => handlers.set(name, fn) }, {}, () => ({}), {});
  return { handlers };
}
function preloadFor(handlers) {
  let api;
  load('preload.js', { electron: {
    contextBridge: { exposeInMainWorld: (_name, value) => { api = value; } },
    ipcRenderer: { invoke: (name, ...args) => handlers.get(name)({}, ...args), on() {}, removeListener() {} },
  } });
  return api;
}
afterEach(() => { for (const folder of folders.splice(0)) fs.rmSync(folder, { recursive: true, force: true }); });

describe('QuickPitik upload configuration', () => {
  it('stays off in packaged builds whatever the environment says', () => {
    const config = configFor(true, { BATCH_QUICKPITIK_UPLOAD_ENABLED: 'true', BATCH_QUICKPITIK_API_URL: 'http://wrong.test' });
    expect(config.features.QUICKPITIK_UPLOAD_ENABLED).toBe(false);
    expect(config.urls.QUICKPITIK_API_URL).toBe('https://api.quickpitik.com/api/v1');
    expect(config.urls.QUICKPITIK_WEB_URL).toBe('https://quickpitik.com');
    expect(typeof config.urls.QUICKPITIK_UPLOAD_ORIGIN).toBe('string');
  });

  it('turns on from source with BATCH_QUICKPITIK_UPLOAD_ENABLED and honours the URL overrides', () => {
    expect(configFor(false).features.QUICKPITIK_UPLOAD_ENABLED).toBe(false);
    expect(configFor(false).urls).toMatchObject({
      QUICKPITIK_API_URL: 'http://localhost:8080/api/v1', QUICKPITIK_WEB_URL: 'http://localhost:3000', QUICKPITIK_UPLOAD_ORIGIN: '',
    });
    const config = configFor(false, {
      BATCH_QUICKPITIK_UPLOAD_ENABLED: 'true', BATCH_QUICKPITIK_API_URL: 'http://localhost:8081/api/v1',
      BATCH_QUICKPITIK_WEB_URL: 'http://localhost:3001', BATCH_QUICKPITIK_UPLOAD_ORIGIN: 'https://uploads.test',
    });
    expect(config.features.QUICKPITIK_UPLOAD_ENABLED).toBe(true);
    expect(config.urls).toMatchObject({
      QUICKPITIK_API_URL: 'http://localhost:8081/api/v1', QUICKPITIK_WEB_URL: 'http://localhost:3001', QUICKPITIK_UPLOAD_ORIGIN: 'https://uploads.test',
    });
  });

  it('pins the upload tuning constants the spec names', () => {
    expect(load('src/main/constants.js')).toMatchObject({
      QP_UPLOAD_CONCURRENCY: 4, QP_HASH_CONCURRENCY: 4, QP_EXISTS_CHUNK: 500, QP_MAX_FILE_BYTES: 26214400,
      QP_WALK_MAX_DEPTH: 6, QP_API_TIMEOUT_MS: 30000, QP_COMMIT_TIMEOUT_MS: 120000, QP_PUT_STALL_MS: 120000,
      QP_PUT_DEADLINE_MS: 900000, QP_COMMIT_BUSY_WINDOW_MS: 600000, QP_MAX_RETRIES_PER_PHASE: 3,
      QP_CONNECT_PENDING_TTL_MS: 600000, QP_PROGRESS_INTERVAL_MS: 250,
    });
  });

  it('exposes the flag to the renderer through preload', async () => {
    const on = preloadFor(ipcFor(configFor(false, { BATCH_QUICKPITIK_UPLOAD_ENABLED: 'true' })).handlers);
    expect(await on.getQuickPitikUploadEnabled()).toBe(true);
    const off = preloadFor(ipcFor(configFor(true)).handlers);
    expect(await off.getQuickPitikUploadEnabled()).toBe(false);
  });
});
