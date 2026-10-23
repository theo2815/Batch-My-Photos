import { beforeEach, describe, expect, it } from 'vitest';
import Module, { createRequire } from 'node:module';
import path from 'node:path';

// The record's SecureStore is swapped for a map, so no DPAPI and no file.
const memory = new Map();
class FakeStore {
  get(k, d) { return memory.has(k) ? memory.get(k) : d; }
  set(k, v) { memory.set(k, v); }
  clear() { memory.clear(); }
}
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'electron') return { app: { isPackaged: false } }; // read by config.js through the logger
  if (request.endsWith('/secureStore')) return FakeStore;
  return origLoad.call(this, request, ...rest);
};
const record = createRequire(import.meta.url)('../src/main/quickpitikUploadRecord.js');

const ROOT = path.resolve('Shoots', 'Cebu Marathon');
const run = { account: 'u1', eventId: 'e1', eventName: 'Cebu Marathon 2026', root: ROOT, selected: ['', 'Race A', 'Race B'] };
const saved = (over = {}) => ({ version: 1, ...run, finished: [], startedAt: '2026-10-23T01:00:00.000Z', updatedAt: '2026-10-23T01:00:00.000Z', ...over });

beforeEach(() => memory.clear());

describe('upload resume record', () => {
  it('keeps only the account, the event, the folder, the ticked and the finished subfolders, and two times', () => {
    record.save(run);
    expect(record.load()).toEqual({ ...saved(), startedAt: expect.any(String), updatedAt: expect.any(String) });
    expect([...memory.keys()]).toEqual(['record']);
    expect(Object.keys(memory.get('record')).sort())
      .toEqual(['account', 'eventId', 'eventName', 'finished', 'root', 'selected', 'startedAt', 'updatedAt', 'version']);
  });

  it('adds each finished subfolder, and forgets the run once none is left', () => {
    record.save(run);
    record.markFinished('');
    record.markFinished('Race A');
    expect(record.load().finished).toEqual(['', 'Race A']);
    record.markFinished('Race B');
    expect(record.load()).toBeNull();
    expect(memory.size).toBe(0);
  });

  it('a new upload replaces the record', () => { // R11
    record.save(run);
    record.markFinished('');
    record.save({ ...run, eventId: 'e2', eventName: 'Mandaue Dash', selected: ['Race C'] });
    expect(record.load()).toMatchObject({ eventId: 'e2', eventName: 'Mandaue Dash', selected: ['Race C'], finished: [] });
  });

  it('clear forgets it, and marking a folder with no record writes nothing', () => {
    record.save(run);
    record.clear();
    expect(record.load()).toBeNull();
    record.markFinished('');
    expect(memory.size).toBe(0);
  });

  it.each([
    ['not an object', 'x'],
    ['an array', []],
    ['another version', saved({ version: 2 })],
    ['no account', saved({ account: undefined })],
    ['an empty account', saved({ account: '' })],
    ['an event id that is not text', saved({ eventId: 7 })],
    ['an event name that is far too long', saved({ eventName: 'x'.repeat(201) })],
    ['a relative folder', saved({ root: 'Shoots/Cebu' })],
    ['no ticked subfolder', saved({ selected: [] })],
    ['a subfolder that climbs out', saved({ selected: ['Race A/../..'] })],
    ['an absolute subfolder', saved({ selected: [path.resolve('elsewhere')] })],
    ['a subfolder with a backslash', saved({ selected: ['..\\Windows'] })],
    ['a subfolder that is not text', saved({ selected: [1] })],
    ['a finished subfolder that was never ticked', saved({ finished: ['Race Z'] })],
    ['a time that is not a time', saved({ startedAt: 'yesterday' })],
  ])('treats a record with %s as no record and clears it', (_label, bad) => { // R8
    memory.set('record', bad);
    expect(record.load()).toBeNull();
    expect(memory.size).toBe(0);
  });

  it('a store that cannot be read or written never throws', () => { // R8
    const broken = () => { throw new Error('disk gone'); };
    const methods = ['get', 'set', 'clear'].map(name => [name, FakeStore.prototype[name]]);
    for (const [name] of methods) FakeStore.prototype[name] = broken;
    try {
      expect(record.load()).toBeNull();
      expect(() => { record.save(run); record.markFinished(''); record.clear(); }).not.toThrow();
    } finally {
      for (const [name, fn] of methods) FakeStore.prototype[name] = fn;
    }
  });
});
