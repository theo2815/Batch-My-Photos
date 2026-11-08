/**
 * preload.js keeps a login-link answer nobody heard, but only for 30 seconds.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');

function loadPreload() {
  const handlers = {};
  let api;
  const electron = {
    contextBridge: { exposeInMainWorld: (_name, value) => { api = value; } },
    ipcRenderer: {
      on: (channel, fn) => { handlers[channel] = fn; },
      removeListener() {}, invoke() {}, send() {},
    },
    webUtils: {},
  };
  const filename = path.join(root, 'preload.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module: { exports: {} }, console, Date,
    require: name => (name === 'electron' ? electron : {}),
  }, { filename });
  return { fire: data => handlers['auth-callback']({}, data), api };
}

describe('preload auth-callback memory', () => {
  afterEach(() => vi.useRealTimers());

  it('drops a refusal nobody heard after 5 minutes', () => {
    vi.useFakeTimers();
    const { fire, api } = loadPreload();
    fire({ success: false, error: 'stray' });
    vi.advanceTimersByTime(5 * 60 * 1000);
    const cb = vi.fn();
    api.onAuthCallback(cb);
    expect(cb).not.toHaveBeenCalled();
  });

  it('hands a fresh unheard refusal to the next listener once', () => {
    vi.useFakeTimers();
    const { fire, api } = loadPreload();
    const data = { success: false, error: 'stray' };
    fire(data);
    const cb = vi.fn();
    api.onAuthCallback(cb);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(data);
  });
});
