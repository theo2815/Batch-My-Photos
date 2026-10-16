import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
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
    const limiter = load('src/main/ipcRateLimiter.js', { '../utils/logger': logger, './windowManager': { isAppUrl: () => true } });
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

  it('qp-list-events wraps the list and turns a rejected session into authRejected', async () => {
    const auth = authMock();
    const upload = uploadMock();
    const { api } = preloadFor(ipcFor({ './quickpitikAuthService': auth, './quickpitikUploadService': upload }).handlers);
    expect(await api.qpListEvents()).toEqual({ success: true, events: [expect.objectContaining({ id: 'e1' })] });
    upload.listEvents.mockRejectedValueOnce(new auth.QpAuthError('expired'));
    expect(await api.qpListEvents()).toEqual({ success: false, authRejected: true, error: 'Your QuickPitik sign-in expired. Reconnect to continue.' });
  });

  it("qp-list-events shows the server's own message, and a plain one for anything else", async () => {
    const auth = { ...authMock(), QpApiError: class QpApiError extends Error {} };
    const upload = uploadMock();
    const { handlers } = ipcFor({ './quickpitikAuthService': auth, './quickpitikUploadService': upload });
    upload.listEvents.mockRejectedValueOnce(new auth.QpApiError('Could not reach QuickPitik to renew the sign-in.'));
    expect(await handlers.get('qp-list-events')({})).toEqual({ success: false, error: 'Could not reach QuickPitik to renew the sign-in.' });
    upload.listEvents.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND api.quickpitik.com'));
    const answer = await handlers.get('qp-list-events')({});
    expect(answer).toEqual({ success: false, error: expect.any(String) });
    expect(answer.error).not.toContain('ENOTFOUND');
  });

  it('qp-upload-start forwards progress to the window and qp-upload-cancel reaches the engine', async () => {
    const upload = uploadMock();
    const { handlers, win } = ipcFor({ './quickpitikAuthService': authMock(), './quickpitikUploadService': upload });
    const { api, listeners } = preloadFor(handlers);
    expect(await api.qpUploadStart({ rootPath: 'C:/shoot', eventId: 'e1', folders: ['', 'Race A'] })).toEqual({ success: true, total: 0 });
    expect(upload.startUpload.mock.calls[0][0]).toEqual({ rootPath: 'C:/shoot', eventId: 'e1', folders: ['', 'Race A'] });
    expect(win.webContents.send).toHaveBeenCalledWith('qp-upload-progress', expect.objectContaining({ phase: 'done' }));
    const received = [];
    const stop = api.onQpUploadProgress((payload) => received.push(payload));
    listeners.get('qp-upload-progress')({}, { phase: 'hashing' });
    expect(received).toEqual([{ phase: 'hashing' }]);
    stop();
    expect(await api.qpUploadCancel()).toEqual({ success: true });
    expect(upload.cancelUpload).toHaveBeenCalledTimes(1);
  });

  it('opens a quickpitik.com help link, and still refuses any other site', async () => {
    const openExternal = vi.fn(async () => {});
    const { handlers } = ipcFor({ electron: { app: { getVersion: () => '1.0.6' }, net: {}, dialog: {}, shell: { openExternal } } });
    const { api } = preloadFor(handlers);
    expect(await api.openExternalUrl('https://quickpitik.com/dashboard')).toEqual({ success: true });
    expect(openExternal).toHaveBeenCalledWith('https://quickpitik.com/dashboard');
    expect((await api.openExternalUrl('https://quickpitik.com.evil.example/')).success).toBe(false);
    expect(openExternal).toHaveBeenCalledTimes(1);
  });
});

describe('preload getPathForFile', () => {
  it('reads a dropped file path through webUtils', () => {
    let api;
    const getPathForFile = vi.fn(() => 'C:\\Shoots\\Race');
    load('preload.js', { electron: {
      contextBridge: { exposeInMainWorld: (_name, value) => { api = value; } },
      ipcRenderer: { on() {} }, webUtils: { getPathForFile },
    } });
    const fakeFile = { name: 'Race' };
    expect(api.getPathForFile(fakeFile)).toBe('C:\\Shoots\\Race');
    expect(getPathForFile).toHaveBeenCalledWith(fakeFile);
  });

  it('runs on Electron 44', () => {
    expect(createRequire(import.meta.url)('electron/package.json').version).toMatch(/^44\./);
  });
});

describe('dialogs remember the last folder (Electron 43+ would open Downloads)', () => {
  it('opens each dialog in the folder it last returned', async () => {
    const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmp-dialog-'));
    try {
      const showOpenDialog = vi.fn()
        .mockResolvedValueOnce({ canceled: false, filePaths: ['C:\\Shoots\\Race'] })
        .mockResolvedValueOnce({ canceled: true, filePaths: [] })
        .mockResolvedValueOnce({ canceled: false, filePaths: ['D:\\Batches'] })
        .mockResolvedValueOnce({ canceled: true, filePaths: [] })
        .mockResolvedValueOnce({ canceled: true, filePaths: [] });
      const showSaveDialog = vi.fn(async () => ({ canceled: false, filePath: path.join(reportDir, 'report.csv') }));
      const { api } = preloadFor(ipcFor({
        electron: { app: { getVersion: () => '1.0.6' }, net: {}, shell: {}, dialog: { showOpenDialog, showSaveDialog } },
        './securityManager': { registerAllowedPath: vi.fn() },
        './rollbackManager': { init() {}, getOperationHistory: () => [{ createdAt: 0 }] },
      }).handlers);

      await api.selectFolder();
      await api.selectFolder();
      await api.selectOutputFolder();
      await api.selectOutputFolder();
      await api.selectFolder(); // a cancelled pick keeps the remembered folder
      expect(showOpenDialog.mock.calls.map(([, options]) => options.defaultPath))
        .toEqual([undefined, 'C:\\Shoots\\Race', undefined, 'D:\\Batches', 'C:\\Shoots\\Race']);

      await api.exportBatchReport({ operations: [{ fileName: 'a.jpg' }] });
      await api.exportHistoryReport();
      const [first, second] = showSaveDialog.mock.calls.map(([, options]) => options.defaultPath);
      expect(first).toMatch(/^BatchMyPhotos_Report_[\d-]+\.csv$/);
      expect(path.dirname(second)).toBe(reportDir);
      expect(path.basename(second)).toMatch(/^BatchMyPhotos_History_[\d-]+\.csv$/);
    } finally {
      fs.rmSync(reportDir, { recursive: true, force: true });
    }
  });
});
