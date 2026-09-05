/**
 * Tests for src/main/supabaseApi.js — every RPC carries an abort signal by
 * default so a blackholed connection can never hang startup.
 *
 * The module is CJS and does a native require('electron'), which vi.mock
 * cannot intercept, so the electron stub is injected through Module._load.
 */

import { describe, it, expect, vi } from 'vitest';
import Module from 'node:module';

const fetchMock = vi.fn(async () => ({ ok: true }));
const electronStub = { app: { isPackaged: false }, net: { fetch: (...args) => fetchMock(...args) } };
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  return request === 'electron' ? electronStub : origLoad.call(this, request, ...rest);
};

const { rpc, DEFAULT_TIMEOUT_MS } = await import('../src/main/supabaseApi.js');

describe('rpc()', () => {
  it('attaches a timeout signal when the caller passes none', async () => {
    await rpc('get_my_subscription', {}, 'jwt');
    const { signal } = fetchMock.mock.calls[0][1];
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
    expect(DEFAULT_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it('aborts after an explicit timeoutMs', async () => {
    // AbortSignal.timeout uses Node's internal timer, which fake timers cannot drive
    await rpc('track_batch', {}, 'jwt', { timeoutMs: 20 });
    const { signal } = fetchMock.mock.calls.at(-1)[1];
    expect(signal.aborted).toBe(false);
    await new Promise(r => setTimeout(r, 60));
    expect(signal.aborted).toBe(true);
  });
});
