import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';

const filename = path.resolve(import.meta.dirname, '../src/main/windowManager.js');

// upload: the upload service as require.cache holds it once the Upload view was used (absent = never loaded).
function loadWindow({ packaged, npmScript, dirname = path.dirname(filename), urlModule = url, upload, dialog = {} }) {
  const loads = [];
  const handlers = {};
  const windowHandlers = {};
  const closes = [];
  class BrowserWindow {
    constructor() {
      this.webContents = {
        openDevTools() {},
        session: { webRequest: { onHeadersReceived() {} } },
        setWindowOpenHandler() {},
        on(name, fn) { handlers[name] = fn; },
      };
    }
    loadFile(file) { loads.push(['file', file]); }
    loadURL(url) { loads.push(['url', url]); }
    once() {}
    on(name, fn) { windowHandlers[name] = fn; }
    close() { closes.push(1); }
  }
  const module = { exports: {} };
  function requireStub(name) {
    if (name === 'electron') return { BrowserWindow, Menu: { setApplicationMenu() {} }, dialog };
    if (name === 'path') return path;
    if (name === 'url') return urlModule;
    if (name === 'fs') return { existsSync: () => true };
    if (name === '../utils/logger') return { log() {}, warn() {} };
    if (name === './config') return { isProduction: packaged };
    throw new Error(`Unexpected import: ${name}`);
  }
  requireStub.resolve = (name) => name;
  requireStub.cache = upload ? { './quickpitikUploadService': { exports: upload } } : {};
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module,
    exports: module.exports,
    __dirname: dirname,
    URL,
    process: { env: { npm_lifecycle_event: npmScript } },
    require: requireStub,
  }, { filename });
  module.exports.createWindow();
  return { loads, handlers, windowHandlers, closes, api: module.exports };
}

function loadedPage(options) {
  return loadWindow(options).loads[0];
}

function navigationBlocked(handlers, target) {
  const event = { preventDefault: vi.fn(), url: target };
  handlers['will-navigate'](event);
  return event.preventDefault.mock.calls.length > 0;
}

describe('desktop window source selection when dist exists', () => {
  it('uses Vite for npm start', () => {
    expect(loadedPage({ packaged: false, npmScript: 'start' })).toEqual(['url', 'http://localhost:5173']);
  });

  it('uses dist for npm run electron', () => {
    expect(loadedPage({ packaged: false, npmScript: 'electron' })[0]).toBe('file');
  });

  it('uses dist for packaged launches even with an npm start environment', () => {
    expect(loadedPage({ packaged: true, npmScript: 'start' })[0]).toBe('file');
  });
});

describe('window navigation guard', () => {
  const appPage = url.pathToFileURL(path.resolve(import.meta.dirname, '..', 'dist', 'index.html')).href;

  it('packaged: blocks another local page and any website', () => {
    const { handlers } = loadWindow({ packaged: true, npmScript: 'start' });
    expect(navigationBlocked(handlers, 'file:///C:/Users/x/Downloads/evil.html')).toBe(true);
    expect(navigationBlocked(handlers, 'https://evil.example/')).toBe(true);
  });

  it("packaged: allows the app's own page, with any hash or query", () => {
    const { handlers } = loadWindow({ packaged: true, npmScript: 'start' });
    expect(navigationBlocked(handlers, appPage)).toBe(false);
    expect(navigationBlocked(handlers, `${appPage}#/anything`)).toBe(false);
    expect(navigationBlocked(handlers, `${appPage}?x=1`)).toBe(false);
  });

  it('dev server: localhost stays allowed', () => {
    const { handlers } = loadWindow({ packaged: false, npmScript: 'start' });
    expect(navigationBlocked(handlers, 'http://localhost:5173/')).toBe(false);
  });

  it("isAppUrl accepts only the app's own page", () => {
    const { api } = loadWindow({ packaged: true, npmScript: 'start' });
    expect(api.isAppUrl(appPage)).toBe(true);
    expect(api.isAppUrl(`${appPage}#/x`)).toBe(true);
    expect(api.isAppUrl('file:///C:/Users/x/Downloads/evil.html')).toBe(false);
    expect(api.isAppUrl(null)).toBe(false);
    expect(api.isAppUrl(undefined)).toBe(false);
    expect(api.isAppUrl('not a url')).toBe(false);
  });

  it.runIf(process.platform === 'win32')('isAppUrl accepts an install path with a space and a non-English letter', () => {
    const { api } = loadWindow({ packaged: true, npmScript: 'start', dirname: 'C:\\Users\\Zoë\\Batch My Photos\\src\\main' });
    // Written by hand, the way Chromium reports the page loaded from that folder
    expect(api.isAppUrl('file:///C:/Users/Zo%C3%AB/Batch%20My%20Photos/dist/index.html#/x')).toBe(true);
    expect(api.isAppUrl('file:///C:/Users/Zo%C3%AB/Batch%20My%20Photos/dist/evil.html')).toBe(false);
  });

  it.runIf(process.platform === 'win32')('isAppUrl accepts the page when the app was started from a lowercase drive', () => {
    const { api } = loadWindow({ packaged: true, npmScript: 'start', dirname: 'c:\\Users\\x\\Batch My Photos\\src\\main' });
    // Chromium always reports the drive letter in upper case
    expect(api.isAppUrl('file:///C:/Users/x/Batch%20My%20Photos/dist/index.html')).toBe(true);
  });
  it.runIf(process.platform === 'win32')('isAppUrl accepts an install path with a ^ under Electron 28 (Node 18)', () => {
    // Electron 28's Node 18 leaves ^ raw in pathToFileURL; the host Node may already encode it
    const node18Url = { pathToFileURL: (p) => ({ href: url.pathToFileURL(p).href.replace(/%5E/g, '^') }) };
    const { api } = loadWindow({
      packaged: true, npmScript: 'start', dirname: 'C:\\Users\\a^b\\Batch My Photos\\src\\main', urlModule: node18Url,
    });
    // Chromium reports ^ as %5E
    expect(api.isAppUrl('file:///C:/Users/a%5Eb/Batch%20My%20Photos/dist/index.html')).toBe(true);
  });

  it.runIf(process.platform === 'win32')('isAppUrl accepts an install path with ~ or [ ] under Electron 33 (Node 20.18+)', () => {
    // Node 20.18+ encodes ~ [ ] in pathToFileURL (as the host Node does); Chromium reports them raw
    const { api } = loadWindow({ packaged: true, npmScript: 'start', dirname: 'C:\\Users\\THEOCE~1\\[work]\\Batch My Photos\\src\\main' });
    expect(api.isAppUrl('file:///C:/Users/THEOCE~1/[work]/Batch%20My%20Photos/dist/index.html#/x')).toBe(true);
    expect(api.isAppUrl('file:///C:/Users/THEOCE~1/[work]/Batch%20My%20Photos/dist/evil.html')).toBe(false);
    expect(api.isAppUrl('http://localhost:5173/C:/Users/THEOCE~1/[work]/Batch%20My%20Photos/dist/index.html')).toBe(false);
  });
});

describe('closing the window during a QuickPitik upload', () => { // R12
  const uploading = () => ({ isUploading: () => true, cancelUpload: vi.fn() });
  const close = (windowHandlers) => { const event = { preventDefault: vi.fn() }; windowHandlers.close(event); return event; };

  const settle = () => new Promise((resolve) => setTimeout(resolve));

  it('asks first, with Keep uploading as the safe answer; Keep uploading keeps the window open', async () => {
    const upload = uploading();
    const dialog = { showMessageBox: vi.fn(() => Promise.resolve({ response: 0 })) };
    const { windowHandlers, closes } = loadWindow({ packaged: true, npmScript: 'start', upload, dialog });
    expect(close(windowHandlers).preventDefault).toHaveBeenCalledTimes(1);
    await settle();
    expect(dialog.showMessageBox.mock.calls[0][1]).toMatchObject({
      message: 'Stop the upload and quit?', detail: 'You can resume it next time you open the app.',
      buttons: ['Keep uploading', 'Stop and quit'], defaultId: 0, cancelId: 0,
    });
    expect(closes).toHaveLength(0);
    expect(upload.cancelUpload).not.toHaveBeenCalled();
  });

  it('Stop and quit closes the window without cancelling, so the resume record stays', async () => { // R4
    const upload = uploading();
    const dialog = { showMessageBox: vi.fn(() => Promise.resolve({ response: 1 })) };
    const { windowHandlers, closes } = loadWindow({ packaged: true, npmScript: 'start', upload, dialog });
    expect(close(windowHandlers).preventDefault).toHaveBeenCalledTimes(1);
    await settle();
    expect(closes).toHaveLength(1);
    expect(upload.cancelUpload).not.toHaveBeenCalled();
  });

  it('the close after Stop and quit is let through, not prevented again', async () => {
    const dialog = { showMessageBox: vi.fn(() => Promise.resolve({ response: 1 })) };
    const { windowHandlers } = loadWindow({ packaged: true, npmScript: 'start', upload: uploading(), dialog });
    close(windowHandlers);
    await settle();
    expect(close(windowHandlers).preventDefault).not.toHaveBeenCalled();
  });

  it('a second close while the question is open opens no second question', async () => {
    const dialog = { showMessageBox: vi.fn(() => new Promise(() => {})) };
    const { windowHandlers } = loadWindow({ packaged: true, npmScript: 'start', upload: uploading(), dialog });
    close(windowHandlers);
    expect(close(windowHandlers).preventDefault).toHaveBeenCalledTimes(1);
    expect(dialog.showMessageBox).toHaveBeenCalledTimes(1);
  });

  it('asks nothing when no upload runs, or when the Upload view was never used', () => { // R12, R13
    const dialog = { showMessageBox: vi.fn() };
    for (const upload of [{ isUploading: () => false }, undefined]) {
      const { windowHandlers } = loadWindow({ packaged: true, npmScript: 'start', upload, dialog });
      expect(close(windowHandlers).preventDefault).not.toHaveBeenCalled();
    }
    expect(dialog.showMessageBox).not.toHaveBeenCalled();
  });
});
