/**
 * Tests for src/main/authService.js — the Supabase-direct session path.
 *
 * electron / secureStore / deviceService are injected through Module._load
 * (same pattern as supabaseApi.test.js) so no DPAPI, no network, no OS calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Module from 'node:module';

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
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (stubs[request]) return stubs[request];
  if (request.endsWith('/secureStore')) return FakeStore;
  if (request.endsWith('/deviceService')) return { bindDevice: async () => ({ bound: true }) };
  return origLoad.call(this, request, ...rest);
};

const authService = await import('../src/main/authService.js');

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
});
