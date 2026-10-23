/**
 * Tests for src/main/quickpitikAuthService.js — the QuickPitik session for
 * the Upload view.
 *
 * electron / secureStore / windowManager / config are injected through
 * Module._load (same pattern as authService.test.js) so no DPAPI, no network,
 * no browser.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Module from 'node:module';
import crypto from 'node:crypto';

const fetchMock = vi.fn();
const memory = new Map();
class FakeStore {
  get(k, d = null) { return memory.has(k) ? memory.get(k) : d; }
  set(k, v) { memory.set(k, v); }
  clear() { memory.clear(); }
}
const win = {
  isDestroyed: () => false, isMinimized: () => false, restore: vi.fn(), focus: vi.fn(),
  webContents: { send: vi.fn() },
};
const shell = { openExternal: vi.fn() };
const stubs = {
  electron: { app: { isPackaged: false }, net: { fetch: (...a) => fetchMock(...a) }, shell },
};
const config = {
  isDevelopment: true, isProduction: false,
  features: { QUICKPITIK_UPLOAD_ENABLED: true, VERBOSE_LOGGING: false },
  urls: { QUICKPITIK_API_URL: 'http://api.test/api/v1', QUICKPITIK_WEB_URL: 'http://web.test', QUICKPITIK_UPLOAD_ORIGIN: '' },
};
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (stubs[request]) return stubs[request];
  if (request.endsWith('/secureStore')) return FakeStore;
  if (request.endsWith('/windowManager')) return { getMainWindow: () => win };
  if (request.endsWith('/config')) return config;
  return origLoad.call(this, request, ...rest);
};

const qp = await import('../src/main/quickpitikAuthService.js');

const json = (status, body, headers = {}) => ({
  ok: status < 400, status, headers: { get: name => headers[name] ?? null },
  json: async () => body, text: async () => JSON.stringify(body),
});
const sent = () => win.webContents.send.mock.calls.filter(([channel]) => channel === 'qp-connect-result').map(([, payload]) => payload);
const base64url = buffer => buffer.toString('base64url');
const sha256 = text => crypto.createHash('sha256').update(text).digest();
const B64_43 = /^[A-Za-z0-9_-]{43}$/;
const CODE = 'c'.repeat(43);
const USER = { id: 'u1', email: 'p@test.local', name: 'P', role: 'PHOTOGRAPHER' };
const pair = (accessToken, refreshToken) => json(200, { success: true, data: { accessToken, refreshToken, user: USER } });
const bodyOf = call => JSON.parse(call[1].body);

/** Press Connect and read back what the browser was sent. */
async function connect() {
  await qp.startConnect();
  const url = new URL(shell.openExternal.mock.calls.at(-1)[0]);
  return { url, state: url.searchParams.get('state'), challenge: url.searchParams.get('challenge') };
}

beforeEach(() => {
  memory.clear();
  fetchMock.mockReset();
  shell.openExternal.mockReset();
  win.webContents.send.mockReset();
  win.restore.mockReset();
  win.focus.mockReset();
  vi.useRealTimers();
  qp.clearSession();
});

describe('connect', () => {
  it('startConnect opens the connect page with a 43-character state and the challenge of its verifier', async () => {
    const { url, state, challenge } = await connect();
    expect(shell.openExternal).toHaveBeenCalledTimes(1);
    expect(url.origin).toBe('http://web.test');
    expect(url.pathname).toBe('/connect/desktop');
    expect(state).toMatch(B64_43);
    expect(challenge).toMatch(B64_43);

    fetchMock.mockResolvedValue(pair('a1', 'r1'));
    await qp.completeConnect(CODE, state);

    const [exchangeUrl, init] = fetchMock.mock.calls[0];
    expect(exchangeUrl).toBe('http://api.test/api/v1/auth/desktop/exchange');
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.headers['Content-Type']).toBe('application/json');
    const body = bodyOf(fetchMock.mock.calls[0]);
    expect(body.code).toBe(CODE);
    expect(body.codeVerifier).not.toBe(state);
    expect(base64url(sha256(body.codeVerifier))).toBe(challenge);
  });

  it('completeConnect refuses a callback before any Connect without calling the server', async () => {
    await qp.completeConnect(CODE, 's'.repeat(43));
    expect(sent()).toEqual([{ success: false, error: 'This connect link is not valid. Press Connect in BatchMyPhotos again.' }]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(memory.size).toBe(0);
  });

  it('refuses the state of an earlier Connect', async () => {
    const first = await connect();
    const second = await connect();
    fetchMock.mockResolvedValue(pair('a1', 'r1'));

    await qp.completeConnect(CODE, first.state);
    expect(sent().at(-1).success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    await qp.completeConnect(CODE, second.state);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a malformed code or state', async () => {
    const { state } = await connect();
    await qp.completeConnect('abc', state);
    await qp.completeConnect('c'.repeat(42) + '=', state);
    await qp.completeConnect(null, state);
    expect(sent().map(result => result.success)).toEqual([false, false, false]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forgets a Connect older than QP_CONNECT_PENDING_TTL_MS', async () => {
    vi.useFakeTimers();
    const { state } = await connect();
    vi.setSystemTime(Date.now() + 600000 + 1);
    await qp.completeConnect(CODE, state);
    expect(sent().at(-1).success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stores the pair, reports who connected and brings the window forward', async () => {
    const { state } = await connect();
    fetchMock.mockResolvedValue(pair('a1', 'r1'));
    await qp.completeConnect(CODE, state);

    expect(memory.get('access_token')).toBe('a1');
    expect(memory.get('refresh_token')).toBe('r1');
    expect(memory.get('user_profile')).toEqual(USER);
    expect(sent().at(-1)).toEqual({ success: true, email: 'p@test.local', name: 'P' });
    expect(win.focus).toHaveBeenCalled();
    expect(qp.getStatus()).toEqual({ connected: true, email: 'p@test.local', name: 'P' });

    // The same link again: refused without a server call, and without a
    // failure message on top of the success the photographer already saw.
    await qp.completeConnect(CODE, state);
    expect(sent()).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('the same link delivered twice at once sends one exchange and one result', async () => {
    const { state } = await connect();
    let resolveFetch;
    fetchMock.mockReturnValueOnce(new Promise(resolve => { resolveFetch = resolve; }));
    const first = qp.completeConnect(CODE, state);
    const second = qp.completeConnect(CODE, state);
    resolveFetch(pair('a1', 'r1'));
    await Promise.all([first, second]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sent()).toEqual([{ success: true, email: 'p@test.local', name: 'P' }]);
  });

  it('a 401 from the exchange shows the expired-link message and stores nothing', async () => {
    const { state } = await connect();
    fetchMock.mockResolvedValue(json(401, { success: false, errors: [{ code: 'INVALID_TOKEN', message: 'This connect code is invalid or has expired.' }] }));
    await qp.completeConnect(CODE, state);
    expect(sent().at(-1)).toEqual({ success: false, error: 'This connect link has expired. Try again from BatchMyPhotos.' });
    expect(memory.size).toBe(0);
    expect(qp.getStatus().connected).toBe(false);
  });

  it('a server error from the exchange shows the server message', async () => {
    const { state } = await connect();
    fetchMock.mockResolvedValue(json(503, { success: false, errors: [{ code: 'SERVICE_UNAVAILABLE', message: 'Try again shortly.' }] }));
    await qp.completeConnect(CODE, state);
    expect(sent().at(-1)).toEqual({ success: false, error: 'Try again shortly.' });
  });

  it('an unreachable server during the exchange shows the connection message', async () => {
    const { state } = await connect();
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    await qp.completeConnect(CODE, state);
    expect(sent().at(-1)).toEqual({ success: false, error: 'Could not reach QuickPitik. Check your connection and press Connect again.' });
  });

  it('a 200 whose body cannot be read is a failed connect, not a crash', async () => {
    const { state } = await connect();
    fetchMock.mockResolvedValue({ ...json(200, null), json: async () => { throw new SyntaxError('bad json'); } });
    await qp.completeConnect(CODE, state);
    expect(sent().at(-1)).toEqual({ success: false, error: expect.any(String) });
    expect(memory.size).toBe(0);
  });

  it('a Connect pressed while an earlier one is finishing stays valid', async () => {
    const first = await connect();
    let resolveFetch;
    fetchMock.mockReturnValueOnce(new Promise(resolve => { resolveFetch = resolve; }));
    const finishing = qp.completeConnect(CODE, first.state);
    const second = await connect();
    resolveFetch(pair('a1', 'r1'));
    await finishing;

    fetchMock.mockResolvedValue(pair('a2', 'r2'));
    await qp.completeConnect(CODE, second.state);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a Connect that finishes after a logout stores no tokens', async () => {
    const { state } = await connect();
    let resolveFetch;
    fetchMock.mockReturnValueOnce(new Promise(resolve => { resolveFetch = resolve; }));
    const finishing = qp.completeConnect(CODE, state);
    qp.clearSession();
    resolveFetch(pair('a1', 'r1'));
    await finishing;

    expect(memory.size).toBe(0);
    expect(qp.getStatus().connected).toBe(false);
    expect(sent().at(-1)).toEqual({ success: false, error: 'Could not finish connecting. Press Connect again.' });
  });
});

describe('refreshAccessToken', () => {
  it('refreshAccessToken is single-flight and writes both tokens before resolving', async () => {
    memory.set('refresh_token', 'r1');
    let resolveFetch;
    fetchMock.mockReturnValue(new Promise(resolve => { resolveFetch = resolve; }));

    const both = [qp.refreshAccessToken(), qp.refreshAccessToken()];
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/api/v1/auth/refresh');
    expect(bodyOf(fetchMock.mock.calls[0])).toEqual({ refreshToken: 'r1' });

    resolveFetch(pair('a2', 'r2'));
    expect(await Promise.all(both)).toEqual([
      { refreshed: true, accessToken: 'a2' }, { refreshed: true, accessToken: 'a2' },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(memory.get('access_token')).toBe('a2');
    expect(memory.get('refresh_token')).toBe('r2');
  });

  it('a rejected refresh clears the session', async () => {
    memory.set('access_token', 'a1');
    memory.set('refresh_token', 'r1');
    fetchMock.mockResolvedValue(json(401, { success: false, errors: [{ code: 'INVALID_REFRESH_TOKEN', message: 'x' }] }));
    expect(await qp.refreshAccessToken()).toEqual({ refreshed: false, authRejected: true });
    expect(memory.size).toBe(0);
  });

  it('a second refresh after the first has finished calls the server again', async () => {
    memory.set('refresh_token', 'r1');
    fetchMock.mockResolvedValueOnce(pair('a2', 'r2')).mockResolvedValueOnce(pair('a3', 'r3'));
    await qp.refreshAccessToken();
    expect(await qp.refreshAccessToken()).toEqual({ refreshed: true, accessToken: 'a3' });
    expect(bodyOf(fetchMock.mock.calls[1])).toEqual({ refreshToken: 'r2' });
  });

  it('a busy server during refresh keeps the session', async () => {
    memory.set('access_token', 'a1');
    memory.set('refresh_token', 'r1');
    fetchMock.mockResolvedValue(json(503, { success: false, errors: [{ code: 'SERVICE_UNAVAILABLE', message: 'x' }] }));
    expect(await qp.refreshAccessToken()).toEqual({ refreshed: false });
    expect(Object.fromEntries(memory)).toEqual({ access_token: 'a1', refresh_token: 'r1' });
  });

  it('a network failure during refresh keeps the session', async () => {
    memory.set('access_token', 'a1');
    memory.set('refresh_token', 'r1');
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await qp.refreshAccessToken()).toEqual({ refreshed: false, networkError: true });
    expect(Object.fromEntries(memory)).toEqual({ access_token: 'a1', refresh_token: 'r1' });
  });

  it('a refresh that lands after disconnect does not sign back in', async () => {
    memory.set('access_token', 'a1');
    memory.set('refresh_token', 'r1');
    let resolveRefresh;
    fetchMock
      .mockReturnValueOnce(new Promise(resolve => { resolveRefresh = resolve; }))
      .mockResolvedValueOnce(json(200, { success: true, data: { loggedOut: true } }));

    const refreshing = qp.refreshAccessToken();
    await qp.disconnect();
    resolveRefresh(pair('a2', 'r2'));

    expect((await refreshing).refreshed).toBe(false);
    expect(memory.size).toBe(0);
  });

  it('a late rejection of an old refresh token keeps a newer session', async () => {
    memory.set('refresh_token', 'r1');
    let resolveRefresh;
    fetchMock.mockReturnValueOnce(new Promise(resolve => { resolveRefresh = resolve; }));

    const refreshing = qp.refreshAccessToken();
    memory.set('refresh_token', 'r9');
    resolveRefresh(json(401, { success: false, errors: [{ code: 'INVALID_REFRESH_TOKEN', message: 'x' }] }));
    await refreshing;

    expect(memory.get('refresh_token')).toBe('r9');
  });
});

describe('authorizedFetch', () => {
  it('authorizedFetch adds the bearer, retries once after a refresh and parses the envelope', async () => {
    memory.set('access_token', 'a1');
    memory.set('refresh_token', 'r1');
    fetchMock
      .mockResolvedValueOnce(json(401, { success: false, errors: [{ code: 'TOKEN_EXPIRED', message: 'x' }] }))
      .mockResolvedValueOnce(pair('a2', 'r2'))
      .mockResolvedValueOnce(json(200, { success: true, data: { ok: 1 } }));

    const { data } = await qp.authorizedFetch('/me/photographer/events');

    expect(data).toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/api/v1/me/photographer/events');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer a1');
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer a2');
  });

  it('authorizedFetch throws QpAuthError when the refresh is rejected', async () => {
    memory.set('access_token', 'a1');
    memory.set('refresh_token', 'r1');
    fetchMock
      .mockResolvedValueOnce(json(401, { success: false, errors: [{ code: 'TOKEN_EXPIRED', message: 'x' }] }))
      .mockResolvedValueOnce(json(401, { success: false, errors: [{ code: 'INVALID_REFRESH_TOKEN', message: 'x' }] }));
    await expect(qp.authorizedFetch('/x')).rejects.toBeInstanceOf(qp.QpAuthError);
    expect(memory.size).toBe(0);
  });

  it('authorizedFetch throws QpAuthError when the server refuses the renewed token too', async () => {
    memory.set('access_token', 'a1');
    memory.set('refresh_token', 'r1');
    const refused = json(401, { success: false, errors: [{ code: 'TOKEN_EXPIRED', message: 'x' }] });
    fetchMock.mockResolvedValueOnce(refused).mockResolvedValueOnce(pair('a2', 'r2')).mockResolvedValueOnce(refused);
    await expect(qp.authorizedFetch('/x')).rejects.toBeInstanceOf(qp.QpAuthError);
  });

  it('a call that gets no answer is given up after its timeout', async () => {
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    await expect(qp.fetchJson('http://api.test/x', { timeoutMs: 10 })).rejects.toThrow('aborted');
  });

  it('authorizedFetch keeps the session and throws a retryable error when the refresh cannot reach the server', async () => {
    memory.set('access_token', 'a1');
    memory.set('refresh_token', 'r1');
    fetchMock
      .mockResolvedValueOnce(json(401, { success: false, errors: [{ code: 'TOKEN_EXPIRED', message: 'x' }] }))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const error = await qp.authorizedFetch('/x').catch(e => e);
    expect(error).toBeInstanceOf(qp.QpApiError);
    expect(error.status).toBeUndefined();
    expect(Object.fromEntries(memory)).toEqual({ access_token: 'a1', refresh_token: 'r1' });
  });

  it('authorizedFetch turns an error envelope into QpApiError with status, code, message and Retry-After', async () => {
    memory.set('access_token', 'a1');
    memory.set('refresh_token', 'r1');
    fetchMock.mockResolvedValue(json(429, { success: false, errors: [{ code: 'RATE_LIMITED', message: 'slow down' }] }, { 'Retry-After': '7' }));
    const error = await qp.authorizedFetch('/x').catch(e => e);
    expect(error).toBeInstanceOf(qp.QpApiError);
    expect(error).toMatchObject({ status: 429, code: 'RATE_LIMITED', message: 'slow down', retryAfterSeconds: 7 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('authorizedFetch sends a FormData body untouched', async () => {
    memory.set('access_token', 'a1');
    fetchMock.mockResolvedValue(json(200, { success: true, data: {} }));
    const form = new FormData();
    await qp.authorizedFetch('/x', { method: 'POST', body: form });
    const init = fetchMock.mock.calls[0][1];
    expect(init.body).toBe(form);
    expect(init.headers['Content-Type']).toBeUndefined();
  });
});

describe('disconnect', () => {
  it('disconnect posts the refresh token to logout and clears the store even when the server fails', async () => {
    memory.set('refresh_token', 'r1');
    fetchMock.mockRejectedValue(new Error('offline'));
    await qp.disconnect();
    expect(memory.size).toBe(0);
    expect(qp.getStatus().connected).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/api/v1/auth/logout');
    expect(bodyOf(fetchMock.mock.calls[0])).toEqual({ refreshToken: 'r1' });
  });

  it('disconnect forgets the session at once, without waiting for the server', async () => {
    memory.set('refresh_token', 'r1');
    fetchMock.mockReturnValue(new Promise(() => {}));
    const outcome = await Promise.race([
      qp.disconnect().then(() => 'done'),
      new Promise(resolve => setTimeout(() => resolve('still waiting'), 50)),
    ]);
    expect(outcome).toBe('done');
    expect(memory.size).toBe(0);
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/api/v1/auth/logout');
  });
});

describe('getAccountId', () => {
  it('gives the main process the connected account id, which the screen status never carries', async () => { // R1
    expect(qp.getAccountId()).toBeNull();
    const { state } = await connect();
    fetchMock.mockResolvedValue(pair('a1', 'r1'));
    await qp.completeConnect(CODE, state);
    expect(qp.getAccountId()).toBe('u1');
    expect(qp.getStatus()).toEqual({ connected: true, email: 'p@test.local', name: 'P' });
  });
});
