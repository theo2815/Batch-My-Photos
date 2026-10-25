/**
 * main.js's batchmyphotos://auth/callback handling: a link the app did not
 * start is refused before any network call, and the saved email and name
 * come from Supabase, not from the link.
 */

import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const logger = { log() {}, warn() {}, error() {} };

function startApp(authService, { features = {}, quickpitik } = {}) {
  const events = {};
  const send = vi.fn();
  const win = { isDestroyed: () => false, isMinimized: () => false, focus() {}, webContents: { send } };
  const app = {
    setAsDefaultProtocolClient() {}, setPath() {}, getPath: () => os.tmpdir(), quit() {},
    requestSingleInstanceLock: () => true, on: (name, fn) => { events[name] = fn; },
    whenReady: () => new Promise(() => {}),
  };
  const mocks = {
    electron: { app, ipcMain: {} }, os: { tmpdir: () => os.tmpdir() },
    './src/main/constants': { UV_THREADPOOL_SIZE: 4 },
    './src/main/config': { isProduction: false, features },
    './src/main/secureStore': class {},
    './src/main/windowManager': { createWindow() {}, getMainWindow: () => win },
    './src/main/ipcHandlers': { registerIpcHandlers() {} },
    './src/main/authService': authService,
    './src/main/quickpitikAuthService': quickpitik,
    './src/main/deviceService': { startHeartbeat() {}, stopHeartbeat() {} },
    './src/main/updateManager': { initAutoUpdater() {} },
    './src/utils/logger': logger,
  };
  const filename = path.join(root, 'main.js');
  const nativeRequire = createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module: { exports: {} }, __dirname: root, URL, console,
    require: name => Object.hasOwn(mocks, name) ? mocks[name] : nativeRequire(name),
    process: { defaultApp: false, env: {}, argv: [], platform: 'win32', on() {} },
  }, { filename });
  const openLink = async (url) => {
    events['second-instance']({}, [url]);
    await vi.waitFor(() => expect(send).toHaveBeenCalled());
    return send.mock.calls[0];
  };
  const fire = (url) => events['second-instance']({}, [url]);
  return { openLink, fire };
}

function fakeAuth({ stateOk = true, profile = { email: 'a@b.test', name: 'Ana' } } = {}) {
  return {
    consumeLoginState: vi.fn(() => stateOk),
    verifySession: vi.fn(async () => ({ valid: true, subscription: {} })),
    fetchUserProfile: vi.fn(async () => profile),
    clearSession: vi.fn(),
    saveSession: vi.fn(),
    saveRefreshToken: vi.fn(),
    getStoredSession: () => 'jwt',
  };
}

describe('auth callback deep link', () => {
  it('a QuickPitik connect link goes to QuickPitik and never to the login-state check', async () => {
    const auth = fakeAuth();
    const completeConnect = vi.fn(async () => {});
    const { fire } = startApp(auth, { features: { QUICKPITIK_UPLOAD_ENABLED: true }, quickpitik: { completeConnect } });

    fire('batchmyphotos://quickpitik/callback?code=c1&state=s1');

    await vi.waitFor(() => expect(completeConnect).toHaveBeenCalledWith('c1', 's1'));
    expect(auth.consumeLoginState).not.toHaveBeenCalled();
  });

  it('refuses a link without the current state before any network call', async () => {
    const auth = fakeAuth({ stateOk: false });
    const { openLink } = startApp(auth);

    const [channel, payload] = await openLink('batchmyphotos://auth/callback?token=x&email=y%40z&state=forged');

    expect(auth.consumeLoginState).toHaveBeenCalledWith('forged');
    expect(channel).toBe('auth-callback');
    expect(payload).toEqual({ success: false, error: 'This sign-in link was not started from this app. Press Sign in with Browser again.' });
    expect(auth.verifySession).not.toHaveBeenCalled();
    expect(auth.fetchUserProfile).not.toHaveBeenCalled();
    expect(auth.saveSession).not.toHaveBeenCalled();
  });

  it('a link with no state is checked too, and refused', async () => {
    const auth = fakeAuth({ stateOk: false });
    const { openLink } = startApp(auth);

    const [, payload] = await openLink('batchmyphotos://auth/callback?token=x');

    expect(auth.consumeLoginState).toHaveBeenCalledWith(null);
    expect(payload.success).toBe(false);
    expect(auth.saveSession).not.toHaveBeenCalled();
  });

  it('saves the email and name from Supabase, not from the link', async () => {
    const auth = fakeAuth();
    const { openLink } = startApp(auth);

    const [, payload] = await openLink('batchmyphotos://auth/callback?token=jwt1&refresh_token=r1&email=victim%40x.test&name=Victim&state=s');

    expect(auth.verifySession).toHaveBeenCalledWith('jwt1', { allowRefresh: false });
    expect(auth.fetchUserProfile).toHaveBeenCalledWith('jwt1');
    expect(auth.saveSession).toHaveBeenCalledWith('jwt1', { email: 'a@b.test', name: 'Ana' });
    expect(auth.saveRefreshToken).toHaveBeenCalledWith('r1');
    expect(payload).toEqual({ success: true, email: 'a@b.test', name: 'Ana' });
  });

  // The login screen can show with an old session still stored (a failed status
  // check); the new account must not inherit it, nor its QuickPitik connection.
  it('ends any stored session before saving the new one', async () => {
    const auth = fakeAuth();
    const { openLink } = startApp(auth);

    await openLink('batchmyphotos://auth/callback?token=jwt1&state=s');

    expect(auth.clearSession).toHaveBeenCalledWith({ keepUploadRecord: true });
    expect(auth.clearSession.mock.invocationCallOrder[0]).toBeLessThan(auth.saveSession.mock.invocationCallOrder[0]);
  });

  it('a refused link leaves the stored session alone', async () => {
    const auth = fakeAuth({ stateOk: false });
    const { openLink } = startApp(auth);

    await openLink('batchmyphotos://auth/callback?token=jwt1&state=forged');

    expect(auth.clearSession).not.toHaveBeenCalled();
  });

  it('accepts a link that carries no email', async () => {
    const auth = fakeAuth();
    const { openLink } = startApp(auth);

    const [, payload] = await openLink('batchmyphotos://auth/callback?token=jwt1&state=s');

    expect(payload.success).toBe(true);
    expect(auth.saveSession).toHaveBeenCalledWith('jwt1', { email: 'a@b.test', name: 'Ana' });
  });

  it('refuses when the profile cannot be read', async () => {
    const auth = fakeAuth({ profile: null });
    const { openLink } = startApp(auth);

    const [, payload] = await openLink('batchmyphotos://auth/callback?token=jwt1&state=s');

    expect(payload).toEqual({ success: false, error: 'Could not verify your login — check your connection and try again' });
    expect(auth.saveSession).not.toHaveBeenCalled();
  });
});

// A link that starts the app is refused (no login is pending after a start)
// before the login screen listens; preload must keep that answer for it.
describe('auth-callback before the login screen listens', () => {
  function loadPreload() {
    const ipcRenderer = new EventEmitter();
    let api;
    const filename = path.join(root, 'preload.js');
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
      require: () => ({ contextBridge: { exposeInMainWorld: (_name, value) => { api = value; } }, ipcRenderer }),
      process, console,
    }, { filename });
    return { api, ipcRenderer };
  }
  const refusal = { success: false, error: 'refused' };

  it('hands a message nobody heard to the next listener, once', () => {
    const { api, ipcRenderer } = loadPreload();
    ipcRenderer.emit('auth-callback', {}, refusal);

    const first = [];
    const stop = api.onAuthCallback((data) => first.push(data));
    stop();
    const second = [];
    api.onAuthCallback((data) => second.push(data));

    expect(first).toEqual([refusal]);
    expect(second).toEqual([]);
  });

  it('does not replay a message a listener already heard', () => {
    const { api, ipcRenderer } = loadPreload();
    const heard = [];
    const stop = api.onAuthCallback((data) => heard.push(data));
    ipcRenderer.emit('auth-callback', {}, refusal);
    stop();
    const later = [];
    api.onAuthCallback((data) => later.push(data));

    expect(heard).toEqual([refusal]);
    expect(later).toEqual([]);
  });
});
