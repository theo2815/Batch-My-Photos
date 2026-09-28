import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const filename = path.resolve(import.meta.dirname, '../src/main/windowManager.js');

function loadedPage({ packaged, npmScript }) {
  const loads = [];
  class BrowserWindow {
    constructor() {
      this.webContents = {
        openDevTools() {},
        session: { webRequest: { onHeadersReceived() {} } },
        setWindowOpenHandler() {},
        on() {},
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
    __dirname: path.dirname(filename),
    process: { env: { npm_lifecycle_event: npmScript } },
    require(name) {
      if (name === 'electron') return { BrowserWindow, Menu: { setApplicationMenu() {} } };
      if (name === 'path') return path;
      if (name === 'fs') return { existsSync: () => true };
      if (name === '../utils/logger') return { log() {}, warn() {} };
      if (name === './config') return { isProduction: packaged };
      throw new Error(`Unexpected import: ${name}`);
    },
  }, { filename });
  module.exports.createWindow();
  return loads[0];
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
