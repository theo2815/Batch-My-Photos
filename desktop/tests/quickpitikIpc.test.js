import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
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
const baseConfig = { isDevelopment: true, isProduction: false, features: { QUICKPITIK_UPLOAD_ENABLED: true }, urls: {}, limits: {} };
function ipcFor(services = {}, config = { ...baseConfig }) {
  const handlers = new Map();
  const win = { isDestroyed: () => false, webContents: { send: vi.fn() } };
  const electron = { app: { getVersion: () => '1.0.6' }, net: { fetch: async () => ({ ok: false }) }, dialog: {}, shell: {} };
  const limiter = load('src/main/ipcRateLimiter.js', { '../utils/logger': logger });
  const mocks = {
    electron, './config': config, '../utils/logger': logger, './ipcRateLimiter': limiter,
    './rollbackManager': { init() {} },
    '../utils/errorSanitizer': load('src/utils/errorSanitizer.js', { './logger': logger }),
  };
  for (const name of ['progressManager', 'authService', 'subscriptionService', 'deviceService', 'blurBetaKeyStore',
    'batchEngine', 'exifService', 'blurDetectionService', 'batchExecutor', 'securityManager', 'fileUtils']) {
    mocks[`./${name}`] = {};
  }
  // Copy descriptors, not values: a test below uses a getter to see when a service is first required.
  Object.defineProperties(mocks, Object.getOwnPropertyDescriptors(services));
  load('src/main/ipcHandlers.js', mocks).registerIpcHandlers(
    { handle: (name, fn) => handlers.set(name, fn) }, {}, () => win, {});
  return { handlers, win };
}
function preloadFor(handlers) {
  let api;
  const listeners = new Map();
  load('preload.js', { electron: {
    contextBridge: { exposeInMainWorld: (_name, value) => { api = value; } },
    ipcRenderer: {
      invoke: (name, ...args) => handlers.get(name)({}, ...args),
      on: (channel, fn) => listeners.set(channel, fn),
      removeListener: (channel, fn) => { if (listeners.get(channel) === fn) listeners.delete(channel); },
    },
  } });
  return { api, listeners };
}
function authMock() {
  return {
    startConnect: vi.fn(async () => ({ success: true })),
    getStatus: vi.fn(() => ({ connected: true, email: 'p@test.local', name: 'P' })),
    disconnect: vi.fn(async () => {}),
    QpAuthError: class QpAuthError extends Error {},
  };
}
function uploadMock() {
  return {
    scanFolder: vi.fn(async (folderPath) => ({ success: true, root: folderPath, folders: [], totals: { folders: 0, uploadable: { count: 0, bytes: 0 }, skipped: {} } })),
    listEvents: vi.fn(async () => [{ id: 'e1', name: 'Cebu Marathon 2026', date: '2026-10-10', location: 'Cebu City', ownedByMe: false, state: 'live' }]),
    startUpload: vi.fn(async (_request, send) => { send({ phase: 'done', counts: { uploaded: 0, alreadyThere: 0, failed: 0, total: 0 } }); return { success: true, total: 0 }; }),
    cancelUpload: vi.fn(() => ({ success: true })),
  };
}

describe('QuickPitik connect channels', () => {
  it('reach the session service through preload and expose no token', async () => {
    const auth = authMock();
    const { api } = preloadFor(ipcFor({ './quickpitikAuthService': auth }).handlers);
    expect(await api.qpConnectStart()).toEqual({ success: true });
    expect(await api.qpSessionStatus()).toEqual({ connected: true, email: 'p@test.local', name: 'P' });
    expect(await api.qpDisconnect()).toEqual({ success: true });
    expect(auth.startConnect).toHaveBeenCalledTimes(1);
    expect(auth.disconnect).toHaveBeenCalledTimes(1);
  });

  it('registers without loading the session service, and loads it on first use', async () => {
    let loaded = false;
    const services = {};
    Object.defineProperty(services, './quickpitikAuthService', { enumerable: true, get() { loaded = true; return authMock(); } });
    const { handlers } = ipcFor(services);
    expect(loaded).toBe(false);
    await handlers.get('qp-session-status')({});
    expect(loaded).toBe(true);
  });

  it('turns a thrown connect error into a plain failure', async () => {
    const auth = authMock();
    auth.startConnect.mockRejectedValue(new Error('browser missing'));
    const { handlers } = ipcFor({ './quickpitikAuthService': auth });
    expect(await handlers.get('qp-connect-start')({})).toMatchObject({ success: false, error: expect.any(String) });
  });

  it('answers plainly when disconnect or the status read throws', async () => {
    const auth = authMock();
    auth.disconnect.mockRejectedValue(new Error('disk full'));
    auth.getStatus.mockImplementation(() => { throw new Error('store unreadable'); });
    const { handlers } = ipcFor({ './quickpitikAuthService': auth });
    expect(await handlers.get('qp-disconnect')({})).toMatchObject({ success: false, error: expect.any(String) });
    expect(await handlers.get('qp-session-status')({})).toEqual({ connected: false, email: null, name: null });
  });

  it('limits Connect to the strict tier, because every call opens a browser tab', () => {
    const limiter = load('src/main/ipcRateLimiter.js', { '../utils/logger': logger });
    expect(limiter.CHANNEL_TIERS['qp-connect-start']).toBe('STRICT');
  });

  it('registers no QuickPitik channel while the feature flag is off', () => {
    const { handlers } = ipcFor({ './quickpitikAuthService': authMock() },
      { ...baseConfig, features: { QUICKPITIK_UPLOAD_ENABLED: false } });
    expect([...handlers.keys()].filter(name => name.startsWith('qp-'))).toEqual([]);
    expect(handlers.has('get-quickpitik-upload-enabled')).toBe(true);
  });

  it('delivers qp-connect-result events to the renderer callback and cleans up', () => {
    const { api, listeners } = preloadFor(new Map());
    const received = [];
    const stop = api.onQpConnectResult((payload) => received.push(payload));
    listeners.get('qp-connect-result')({}, { success: true, email: 'p@test.local', name: 'P' });
    expect(received).toEqual([{ success: true, email: 'p@test.local', name: 'P' }]);
    stop();
    expect(listeners.has('qp-connect-result')).toBe(false);
  });
});

describe('QuickPitik upload channels', () => {
  it('qp-scan-folder passes the path to the upload service', async () => {
    const upload = uploadMock();
    const { api } = preloadFor(ipcFor({ './quickpitikAuthService': authMock(), './quickpitikUploadService': upload }).handlers);
    expect(await api.qpScanFolder('C:/shoot')).toMatchObject({ success: true, root: 'C:/shoot' });
    expect(upload.scanFolder).toHaveBeenCalledWith('C:/shoot');
  });

  it('qp-scan-folder turns a thrown scan error into a plain failure', async () => {
    const upload = uploadMock();
    upload.scanFolder.mockRejectedValue(new Error('disk gone'));
    const { handlers } = ipcFor({ './quickpitikAuthService': authMock(), './quickpitikUploadService': upload });
    expect(await handlers.get('qp-scan-folder')({}, 'C:/shoot')).toMatchObject({ success: false, error: expect.any(String) });
  });
});
