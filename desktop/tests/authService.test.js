/**
 * Tests for src/main/authService.js — the Supabase-direct session path.
 *
 * electron / secureStore / deviceService are injected through Module._load
 * (same pattern as supabaseApi.test.js) so no DPAPI, no network, no OS calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Module, { createRequire } from 'node:module';

const fetchMock = vi.fn();
const memory = new Map();
class FakeStore {
  get(k, d = null) { return memory.has(k) ? memory.get(k) : d; }
  set(k, v) { memory.set(k, v); }
  clear() { memory.clear(); }
}
const stubs = {
  electron: {
    app: { isPackaged: false },
    net: { fetch: (...a) => fetchMock(...a) },
    shell: { openExternal: vi.fn() },
  },
};
const quickpitik = { disconnect: vi.fn() };
// config.features is frozen; authService gets a copy whose flags a test can flip
let authConfig;
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (stubs[request]) return stubs[request];
  if (request.endsWith('/secureStore')) return FakeStore;
  if (request.endsWith('/deviceService')) return { bindDevice: async () => ({ bound: true }) };
  if (request.endsWith('/quickpitikAuthService')) return quickpitik;
  if (request === './config') {
    const real = origLoad.call(this, request, ...rest);
    authConfig ??= { ...real, features: { ...real.features } };
    return authConfig;
  }
  return origLoad.call(this, request, ...rest);
};

const authService = await import('../src/main/authService.js');
const { FRONTEND_URL } = (await import('../src/main/config.js')).default.urls;
const { LOGIN_PENDING_TTL_MS } = (await import('../src/main/constants.js')).default;

const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
const refreshCalls = () => fetchMock.mock.calls.filter(([url]) => url.includes('grant_type=refresh_token')).length;

describe('verifySession', () => {
  beforeEach(() => { memory.clear(); fetchMock.mockReset(); });

  it('allowRefresh:false never touches the stored refresh token on 401', async () => {
    memory.set('refresh_token', 'real-users-refresh');
    fetchMock.mockResolvedValue(json(401, {}));

    const result = await authService.verifySession('forged', { allowRefresh: false });

    expect(result).toEqual({ valid: false });
    expect(refreshCalls()).toBe(0);
  }, 10_000);

  it('401 with allowRefresh refreshes once and re-verifies with the new token', async () => {
    memory.set('refresh_token', 'r1');
    fetchMock
      .mockResolvedValueOnce(json(401, {}))            // attempt 1
      .mockResolvedValueOnce(json(401, {}))            // attempt 2 (retry)
      .mockResolvedValueOnce(json(200, { access_token: 'new-jwt', refresh_token: 'r2' })) // refresh
      .mockResolvedValueOnce(json(200, { plan: 'pro' })); // re-verify

    const result = await authService.verifySession('expired');

    expect(result.valid).toBe(true);
    expect(refreshCalls()).toBe(1);
    expect(memory.get('session_token')).toBe('new-jwt');
    expect(memory.get('refresh_token')).toBe('r2');
    const lastAuth = fetchMock.mock.calls.at(-1)[1].headers.Authorization;
    expect(lastAuth).toBe('Bearer new-jwt');
  }, 10_000);

  it('reports networkError (not rejection) when fetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await authService.verifySession('jwt');

    expect(result).toEqual({ valid: false, networkError: true });
  }, 10_000);

  it('reports networkError when the renewal itself cannot reach the server', async () => {
    memory.set('refresh_token', 'r1');
    fetchMock
      .mockResolvedValueOnce(json(401, {}))
      .mockResolvedValueOnce(json(401, {}))
      .mockRejectedValueOnce(new Error('ECONNREFUSED')); // refresh

    const result = await authService.verifySession('expired');

    expect(result).toEqual({ valid: false, networkError: true });
  }, 10_000);

  it('stays invalid when the server rejects the renewal', async () => {
    memory.set('refresh_token', 'r1');
    fetchMock
      .mockResolvedValueOnce(json(401, {}))
      .mockResolvedValueOnce(json(401, {}))
      .mockResolvedValueOnce(json(400, { error: 'invalid_grant' })); // refresh

    const result = await authService.verifySession('expired');

    expect(result).toEqual({ valid: false });
  }, 10_000);
});

describe('checkAuthStatus', () => {
  beforeEach(() => { memory.clear(); fetchMock.mockReset(); stubs.electron.shell.openExternal.mockReset(); });

  it('clears a rejected session and does NOT auto-open the browser', async () => {
    memory.set('session_token', 'dead');
    memory.set('user_profile', { email: 'a@b.c' });
    fetchMock.mockResolvedValue(json(403, {}));

    const status = await authService.checkAuthStatus();

    expect(status.isAuthenticated).toBe(false);
    expect(status.sessionExpired).toBe(true);
    expect(memory.has('session_token')).toBe(false);
    expect(stubs.electron.shell.openExternal).not.toHaveBeenCalled();
  }, 10_000);

  it('keeps the session offline when an expired token cannot be renewed for lack of network', async () => {
    memory.set('session_token', 'expired');
    memory.set('refresh_token', 'r1');
    memory.set('user_profile', { email: 'a@b.c' });
    fetchMock
      .mockResolvedValueOnce(json(401, {}))
      .mockResolvedValueOnce(json(401, {}))
      .mockRejectedValueOnce(new Error('ECONNREFUSED')); // refresh

    const status = await authService.checkAuthStatus();

    expect(status.isAuthenticated).toBe(true);
    expect(status.offline).toBe(true);
    expect(memory.get('session_token')).toBe('expired');
  }, 10_000);
});

describe('login state', () => {
  const openLogin = () => {
    stubs.electron.shell.openExternal.mockReset();
    authService.openLoginPage();
    const url = stubs.electron.shell.openExternal.mock.calls[0][0];
    const match = url.match(/^(.*)\/login\?desktop=true&state=([A-Za-z0-9_-]{43})$/);
    expect(match?.[1]).toBe(FRONTEND_URL);
    return match[2];
  };

  beforeEach(() => { vi.restoreAllMocks(); });

  it('opens the login page with a fresh 43-character state', () => {
    expect(openLogin()).not.toBe(openLogin());
  });

  it('accepts the state once', () => {
    const state = openLogin();
    expect(authService.consumeLoginState(state)).toBe(true);
    expect(authService.consumeLoginState(state)).toBe(false);
  });

  it('a wrong state is refused and does not burn the real login', () => {
    const state = openLogin();
    expect(authService.consumeLoginState('A'.repeat(43))).toBe(false);
    expect(authService.consumeLoginState('short')).toBe(false);
    expect(authService.consumeLoginState(state)).toBe(true);
  });

  it('refuses a missing or empty state', () => {
    openLogin();
    expect(authService.consumeLoginState(undefined)).toBe(false);
    expect(authService.consumeLoginState(null)).toBe(false);
    expect(authService.consumeLoginState('')).toBe(false);
  });

  it('refuses a state older than the time limit', () => {
    const start = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(start);
    const state = openLogin();
    Date.now.mockReturnValue(start + LOGIN_PENDING_TTL_MS + 1);
    expect(authService.consumeLoginState(state)).toBe(false);
  });

  it('a second Log In makes the first state fail', () => {
    const first = openLogin();
    const second = openLogin();
    expect(authService.consumeLoginState(first)).toBe(false);
    expect(authService.consumeLoginState(second)).toBe(true);
  });
});

describe('fetchUserProfile', () => {
  beforeEach(() => { fetchMock.mockReset(); });

  it('returns email and full name from /auth/v1/user', async () => {
    fetchMock.mockResolvedValue(json(200, { email: 'a@b.test', user_metadata: { full_name: 'Ana' } }));

    expect(await authService.fetchUserProfile('jwt')).toEqual({ email: 'a@b.test', name: 'Ana' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.endsWith('/auth/v1/user')).toBe(true);
    expect(init.headers.apikey).toBeTruthy();
    expect(init.headers.Authorization).toBe('Bearer jwt');
  });

  it('falls back to user_metadata.name', async () => {
    fetchMock.mockResolvedValue(json(200, { email: 'a@b.test', user_metadata: { name: 'Ana N' } }));
    expect(await authService.fetchUserProfile('jwt')).toEqual({ email: 'a@b.test', name: 'Ana N' });
  });

  it('returns null on 401', async () => {
    fetchMock.mockResolvedValue(json(401, {}));
    expect(await authService.fetchUserProfile('jwt')).toBeNull();
  });

  it('returns null when the request throws', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await authService.fetchUserProfile('jwt')).toBeNull();
  });
});

describe('refreshAccessToken', () => {
  beforeEach(() => { memory.clear(); fetchMock.mockReset(); });

  it('a renewal that finishes after a logout stores no tokens', async () => {
    memory.set('refresh_token', 'old-account');
    let resolveFetch;
    fetchMock.mockReturnValueOnce(new Promise(resolve => { resolveFetch = resolve; }));
    const renewing = authService.refreshAccessToken();
    authService.clearSession();
    resolveFetch(json(200, { access_token: 'old-jwt', refresh_token: 'old-refresh' }));
    const result = await renewing;

    expect(result.refreshed).toBe(false);
    expect(memory.size).toBe(0);
  });
});

// A QuickPitik connection must not outlive the BatchMyPhotos sign-in: on a
// shared PC the next person would upload into the first person's events.
describe('clearSession', () => {
  beforeEach(() => {
    memory.clear();
    quickpitik.disconnect.mockReset();
    authConfig.features.QUICKPITIK_UPLOAD_ENABLED = true;
  });

  it('also disconnects QuickPitik', () => {
    memory.set('session_token', 'jwt');
    authService.clearSession();
    expect(quickpitik.disconnect).toHaveBeenCalledTimes(1);
  });

  it('leaves QuickPitik alone (and writes no file for it) while the Upload view is off', () => {
    authConfig.features.QUICKPITIK_UPLOAD_ENABLED = false;
    authService.clearSession();
    expect(quickpitik.disconnect).not.toHaveBeenCalled();
  });

  it('still signs out of BatchMyPhotos when QuickPitik cannot be reached', () => {
    memory.set('session_token', 'jwt');
    quickpitik.disconnect.mockImplementation(() => { throw new Error('store locked'); });
    expect(() => authService.clearSession()).not.toThrow();
    expect(memory.has('session_token')).toBe(false);
  });

  // The upload service is never loaded just for a logout; one that is already running is stopped.
  describe('a running upload', () => {
    const nodeRequire = createRequire(import.meta.url);
    const uploadPath = nodeRequire.resolve('../src/main/quickpitikUploadService.js');
    const upload = { cancelUpload: vi.fn() };
    beforeEach(() => {
      upload.cancelUpload.mockReset();
      nodeRequire.cache[uploadPath] = { id: uploadPath, filename: uploadPath, loaded: true, exports: upload };
    });
    afterEach(() => { delete nodeRequire.cache[uploadPath]; });

    it('is cancelled when the upload service is already loaded', () => {
      authService.clearSession();
      expect(upload.cancelUpload).toHaveBeenCalledTimes(1);
    });

    it('is left alone, and the service not loaded, while the Upload view is off', () => {
      authConfig.features.QUICKPITIK_UPLOAD_ENABLED = false;
      authService.clearSession();
      expect(upload.cancelUpload).not.toHaveBeenCalled();
    });

    it('does not load the upload service when it was not loaded', () => {
      delete nodeRequire.cache[uploadPath];
      authService.clearSession();
      expect(nodeRequire.cache[uploadPath]).toBeUndefined();
    });
  });
});
