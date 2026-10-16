import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';

const filename = path.resolve(import.meta.dirname, '../src/main/windowManager.js');

function loadWindow({ packaged, npmScript, dirname = path.dirname(filename), urlModule = url }) {
  const loads = [];
  const handlers = {};
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
    on() {}
  }
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module,
    exports: module.exports,
    __dirname: dirname,
    URL,
    process: { env: { npm_lifecycle_event: npmScript } },
    require(name) {
      if (name === 'electron') return { BrowserWindow, Menu: { setApplicationMenu() {} } };
      if (name === 'path') return path;
      if (name === 'url') return urlModule;
      if (name === 'fs') return { existsSync: () => true };
      if (name === '../utils/logger') return { log() {}, warn() {} };
      if (name === './config') return { isProduction: packaged };
      throw new Error(`Unexpected import: ${name}`);
    },
  }, { filename });
  module.exports.createWindow();
  return { loads, handlers, api: module.exports };
}

function loadedPage(options) {
  return loadWindow(options).loads[0];
}

function navigationBlocked(handlers, target) {
  const event = { preventDefault: vi.fn() };
  handlers['will-navigate'](event, target);
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
});
