/**
 * Tests for src/main/deviceService.js — bind_device outcomes and the offline
 * fail-closed rule for a never-bound machine.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Module from 'node:module';

const fetchMock = vi.fn();
const memory = new Map();
class FakeStore {
  get(k, d = null) { return memory.has(k) ? memory.get(k) : d; }
  set(k, v) { memory.set(k, v); }
}
const stubs = {
  electron: { app: { isPackaged: false }, net: { fetch: (...a) => fetchMock(...a) } },
  'node-machine-id': { machineIdSync: () => 'a'.repeat(64) },
};
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (stubs[request]) return stubs[request];
  if (request.endsWith('/secureStore')) return FakeStore;
  return origLoad.call(this, request, ...rest);
};

const deviceService = await import('../src/main/deviceService.js');
const json = (status, body) => ({ ok: status < 400, status, json: async () => body });

describe('bindDevice', () => {
  beforeEach(() => { memory.clear(); fetchMock.mockReset(); });

  it('DEVICE_LIMIT_REACHED → not bound, blocked state cached', async () => {
    fetchMock.mockResolvedValue(json(200, { code: 'DEVICE_LIMIT_REACHED', error: 'limit', limit: 1, count: 2 }));

    const r = await deviceService.bindDevice('jwt');

    expect(r.bound).toBe(false);
    expect(r.code).toBe('DEVICE_LIMIT_REACHED');
    expect(memory.get('isDeviceBlocked')).toBe(true);
    expect(deviceService.isDeviceAuthorized()).toBe(false);
  });

  it('bound:true → authorized and cached', async () => {
    fetchMock.mockResolvedValue(json(200, { bound: true, existing: true }));

    const r = await deviceService.bindDevice('jwt');

    expect(r).toEqual({ bound: true, existing: true });
    expect(deviceService.isDeviceAuthorized()).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/rest\/v1\/rpc\/bind_device$/);
  });

  it('offline + never bound → fail closed', async () => {
    fetchMock.mockRejectedValue(new Error('ENOTFOUND'));

    const r = await deviceService.bindDevice('jwt');

    expect(r.bound).toBe(false);
    expect(r.error).toMatch(/connect to the internet/);
  });

  it('offline + previously bound → allowed (offline grace)', async () => {
    memory.set('isDeviceBlocked', false);
    fetchMock.mockRejectedValue(new Error('ENOTFOUND'));

    expect(await deviceService.bindDevice('jwt')).toEqual({ bound: true, offline: true });
  });
});
