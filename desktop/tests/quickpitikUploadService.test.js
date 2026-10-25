import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Module, { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';
import EventEmitter from 'node:events';

// ── Stubs (injected through Module._load so no Electron starts) ───────────────
process.env.BATCH_QUICKPITIK_UPLOAD_ORIGIN = 'https://uploads.test'; // read by config.js at require time
const fetchMock = vi.fn();
const httpsMock = { request: vi.fn() };
class QpApiError extends Error {
  constructor({ status, code, message, retryAfterSeconds } = {}) {
    super(message || code); this.name = 'QpApiError'; this.status = status; this.code = code; this.retryAfterSeconds = retryAfterSeconds;
  }
}
class QpAuthError extends Error {}
const authStub = { authorizedFetch: vi.fn(), fetchJson: vi.fn(), getAccountId: vi.fn(() => 'u1'), QpApiError, QpAuthError };
const memory = new Map(); // the resume record's SecureStore
class FakeStore { get(k, d) { return memory.has(k) ? memory.get(k) : d; } set(k, v) { memory.set(k, v); } clear() { memory.clear(); } }
let online = true;
const stubs = {
  electron: { app: { isPackaged: false }, net: { fetch: (...a) => fetchMock(...a), isOnline: () => online } },
  https: httpsMock,
};
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (stubs[request]) return stubs[request];
  if (request.endsWith('/quickpitikAuthService')) return authStub;
  if (request.endsWith('/secureStore')) return FakeStore;
  return origLoad.call(this, request, ...rest);
};
const cjs = createRequire(import.meta.url);
const service = cjs('../src/main/quickpitikUploadService.js');
const uploadRecord = cjs('../src/main/quickpitikUploadRecord.js');
const { registerAllowedPath } = cjs('../src/main/securityManager.js');
const { ALLOWED_EXTENSIONS } = cjs('../src/main/batchEngine.js');
const { QP_MAX_FILE_BYTES } = cjs('../src/main/constants.js');

// ── Temp trees ────────────────────────────────────────────────────────────────
const temp = [];
function tempRoot(prefix) { const dir = fs.mkdtempSync(path.join(process.cwd(), prefix)); temp.push(dir); return dir; }
function write(root, rel, bytes = 'x') {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  return file;
}
function listAll(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    out.push(full);
    if (entry.isDirectory() && !entry.isSymbolicLink()) listAll(full, out);
  }
  return out.sort();
}
function shootFolder() {
  const root = tempRoot('qp-scan-');
  for (const rel of ['DSC_0001.JPG', 'DSC_0001.CR2', 'clip.MP4', 'notes.txt', 'IMG_0001.heic', 'Thumbs.db',
    'Race A/IMG_1.jpg', 'Race A/IMG_2.png', 'Race A/IMG_3.webp', 'Race A/IMG_1.NEF', 'Race A/Race A_Blurry/IMG_9.jpg',
    '.hidden/secret.jpg', 'd1/d2/d3/d4/d5/d6/deep.jpg', 'd1/d2/d3/d4/d5/d6/d7/too-deep.jpg']) write(root, rel);
  fs.truncateSync(write(root, 'big.jpg', ''), QP_MAX_FILE_BYTES + 1); // sparse: no 25 MiB is really written
  try { fs.symlinkSync(path.join(root, 'Race A'), path.join(root, 'Race A link'), 'junction'); } catch { /* links unsupported here: one fewer thing to skip */ }
  return root;
}
afterAll(() => { for (const dir of temp) fs.rmSync(dir, { recursive: true, force: true }); });
beforeEach(() => { authStub.authorizedFetch.mockReset(); authStub.fetchJson.mockReset(); httpsMock.request.mockReset(); fetchMock.mockReset(); online = true; memory.clear(); });

describe('classifyFile', () => {
  it('sorts names by what QuickPitik can take', () => {
    expect(service.classifyFile('IMG_1.JPG')).toEqual({ kind: 'uploadable', contentType: 'image/jpeg' });
    expect(service.classifyFile('a.jpeg')).toEqual({ kind: 'uploadable', contentType: 'image/jpeg' });
    expect(service.classifyFile('a.png')).toEqual({ kind: 'uploadable', contentType: 'image/png' });
    expect(service.classifyFile('a.webp')).toEqual({ kind: 'uploadable', contentType: 'image/webp' });
    expect(service.classifyFile('a.jpg', QP_MAX_FILE_BYTES + 1)).toEqual({ kind: 'oversize' });
    expect(service.classifyFile('a.jpg', QP_MAX_FILE_BYTES)).toEqual({ kind: 'uploadable', contentType: 'image/jpeg' });
    expect(service.classifyFile('a.CR2')).toEqual({ kind: 'raw' });
    expect(service.classifyFile('a.mov')).toEqual({ kind: 'video' });
    expect(service.classifyFile('a.HEIC')).toEqual({ kind: 'heic' });
    expect(service.classifyFile('a.txt')).toEqual({ kind: 'other' });
    expect(service.classifyFile('noext')).toEqual({ kind: 'other' });
    expect(service.classifyFile('a.constructor')).toEqual({ kind: 'other' });
    expect(service.classifyFile('.DS_Store')).toBeNull();
    expect(service.classifyFile('Thumbs.db')).toBeNull();
  });

  it('keeps the skip lists in step with batchEngine', () => {
    const { RAW_EXTENSIONS, VIDEO_EXTENSIONS, HEIC_EXTENSIONS } = service._internals;
    for (const ext of [...RAW_EXTENSIONS, ...VIDEO_EXTENSIONS, ...HEIC_EXTENSIONS]) expect(ALLOWED_EXTENSIONS.has(ext)).toBe(true);
  });
});

describe('scanFolder', () => {
  it('refuses a folder that was not registered', async () => { // Review Focus 1
    const root = tempRoot('qp-unregistered-');
    write(root, 'a.jpg');
    const readdir = vi.spyOn(fs.promises, 'readdir');
    expect(await service.scanFolder(root)).toEqual({ success: false, error: 'Access denied: folder not selected through dialog' });
    expect(readdir).not.toHaveBeenCalled();
    readdir.mockRestore();
  });

  it('walks subfolders read-only and classifies every file', async () => {
    const root = shootFolder();
    registerAllowedPath(root);
    const before = listAll(root);
    const result = await service.scanFolder(root);
    expect(listAll(root)).toEqual(before);
    expect(result.success).toBe(true);
    expect(result.root).toBe(root);
    const byPath = Object.fromEntries(result.folders.map(folder => [folder.relPath, folder]));
    expect(Object.keys(byPath).sort()).toEqual(['', 'Race A', 'Race A/Race A_Blurry', 'd1/d2/d3/d4/d5/d6'].sort());
    expect(byPath['']).toEqual({ relPath: '', name: path.basename(root), uploadable: { count: 1, bytes: 1 }, skipped: { raw: 1, video: 1, heic: 1, oversize: 1, other: 1 }, defaultSelected: true });
    expect(byPath['Race A']).toEqual({ relPath: 'Race A', name: 'Race A', uploadable: { count: 3, bytes: 3 }, skipped: { raw: 1, video: 0, heic: 0, oversize: 0, other: 0 }, defaultSelected: true });
    expect(byPath['Race A/Race A_Blurry']).toMatchObject({ name: 'Race A_Blurry', uploadable: { count: 1, bytes: 1 }, defaultSelected: false });
    expect(byPath['d1/d2/d3/d4/d5/d6']).toMatchObject({ name: 'd6', uploadable: { count: 1, bytes: 1 } });
    expect(result.totals).toEqual({ folders: 4, uploadable: { count: 6, bytes: 6 }, skipped: { raw: 2, video: 1, heic: 1, oversize: 1, other: 1 } });
  });

  it('lists one folder with names, sizes and types, sorted', async () => {
    const root = tempRoot('qp-list-');
    write(root, 'IMG_10.jpg', 'ten'); write(root, 'IMG_2.png', 'two'); write(root, 'IMG_2.CR2'); write(root, 'sub/x.jpg');
    const listing = await service._internals.listFolder(root);
    expect(listing.files).toEqual([
      { name: 'IMG_2.png', sizeBytes: 3, contentType: 'image/png' },
      { name: 'IMG_10.jpg', sizeBytes: 3, contentType: 'image/jpeg' },
    ]);
    expect(listing.skipped).toEqual({ raw: 1, video: 0, heic: 0, oversize: 0, other: 0 });
    expect(listing.subdirs).toEqual(['sub']);
  });

  it('keeps the rest of a folder when one file cannot be read', async () => {
    const root = tempRoot('qp-stat-');
    write(root, 'Sub/a.jpg'); write(root, 'Sub/gone.jpg'); write(root, 'Sub/Deeper/c.jpg');
    registerAllowedPath(root);
    const realStat = fs.promises.stat;
    const stat = vi.spyOn(fs.promises, 'stat').mockImplementation((file, ...rest) => (path.basename(String(file)) === 'gone.jpg'
      ? Promise.reject(Object.assign(new Error('gone'), { code: 'ENOENT' })) : realStat(file, ...rest)));
    const result = await service.scanFolder(root);
    stat.mockRestore();
    const byPath = Object.fromEntries(result.folders.map(folder => [folder.relPath, folder]));
    expect(byPath.Sub).toMatchObject({ uploadable: { count: 1, bytes: 1 }, skipped: { raw: 0, video: 0, heic: 0, oversize: 0, other: 1 } });
    expect(byPath['Sub/Deeper']).toMatchObject({ uploadable: { count: 1, bytes: 1 } });
  });

  it('fails plainly when the dropped path itself cannot be listed', async () => {
    const root = tempRoot('qp-notdir-');
    const file = write(root, 'a.jpg');
    registerAllowedPath(root);
    expect(await service.scanFolder(file)).toEqual({ success: false, error: 'Could not read this folder.' });
  });

  it('lists folders in name order and unticks only names that end in _Blurry', async () => {
    const root = tempRoot('qp-order-');
    for (const rel of ['b/a.jpg', 'a/a.jpg', 'a/z/a.jpg', 'Blurry_keep/a.jpg', 'x_blurry/a.jpg', 'x_Blurry2/a.jpg']) write(root, rel);
    registerAllowedPath(root);
    const { folders } = await service.scanFolder(root);
    expect(folders.map(folder => [folder.relPath, folder.defaultSelected])).toEqual(
      [['a', true], ['a/z', true], ['b', true], ['Blurry_keep', true], ['x_blurry', false], ['x_Blurry2', true]]);
  });
});

describe('listEvents', () => {
  const now = new Date('2026-10-10T12:00:00+08:00');

  it('applies the public upload window: race day through the third day after, Manila time', () => {
    const { canUploadPublic } = service._internals;
    expect(canUploadPublic('2026-10-11', now)).toBe(false);
    expect(canUploadPublic('2026-10-10', now)).toBe(true);
    expect(canUploadPublic('2026-10-07', now)).toBe(true);
    expect(canUploadPublic('2026-10-06', now)).toBe(false);
  });

  it('closes an owned event one calendar month after race day, clamped to month end', () => {
    const { ownerCloseDate, canUploadOwned } = service._internals;
    expect(ownerCloseDate('2026-01-31')).toBe('2026-02-28');
    expect(ownerCloseDate('2026-12-15')).toBe('2027-01-15');
    expect(canUploadOwned('2026-09-10', now)).toBe(true);
    expect(canUploadOwned('2026-09-09', now)).toBe(false);
    expect(canUploadOwned('2026-11-01', now)).toBe(true); // not run yet: the owner may stage photos ahead
  });

  it("merges the public catalog with the photographer's events: open ones newest first, then closed, no duplicates", async () => {
    authStub.fetchJson.mockResolvedValue({ data: { items: [
      { id: 'A', name: 'Cebu Marathon 2026', date: '2026-10-09', location: 'Cebu City' },
      { id: 'B', name: 'Old Race', date: '2026-10-01', location: 'Mandaue' },
    ], total: 2, offset: 0, limit: 200 } });
    authStub.authorizedFetch.mockResolvedValue({ data: { items: [
      { id: 'A', name: 'Cebu Marathon 2026', date: '2026-10-09', location: 'Cebu City', state: 'live', ownedByMe: false },
      { id: 'C', name: 'My Fun Run', date: '2026-09-20', location: 'Talisay', state: 'open', ownedByMe: true },
      { id: 'D', name: 'My Old Run', date: '2026-08-01', location: 'Talisay', state: 'open', ownedByMe: true },
    ], total: 3, offset: 0, limit: 200 } });

    const events = await service.listEvents(now);

    expect(authStub.fetchJson).toHaveBeenCalledWith(expect.stringMatching(/\/events\?limit=200$/));
    expect(authStub.authorizedFetch).toHaveBeenCalledWith('/me/photographer/events?limit=200');
    expect(events).toEqual([
      { id: 'A', name: 'Cebu Marathon 2026', date: '2026-10-09', location: 'Cebu City', ownedByMe: false, state: 'live', uploadWindow: 'open', closesOn: '2026-10-12' },
      { id: 'C', name: 'My Fun Run', date: '2026-09-20', location: 'Talisay', ownedByMe: true, state: 'open', uploadWindow: 'open', closesOn: '2026-10-20' },
      { id: 'D', name: 'My Old Run', date: '2026-08-01', location: 'Talisay', ownedByMe: true, state: 'open', uploadWindow: 'closed', closesOn: '2026-09-01' },
    ]);
  });

  it('tells the last upload day: a month after race day for an own event, the third day after for a public one', async () => {
    authStub.fetchJson.mockResolvedValue({ data: { items: [{ id: 'P', name: 'Public Race', date: '2026-10-10', location: 'Cebu City' }] } });
    authStub.authorizedFetch.mockResolvedValue({ data: { items: [
      { id: 'O', name: 'My Run', date: '2026-09-25', location: 'Talisay', state: 'open', ownedByMe: true },
    ] } });
    const events = await service.listEvents(now);
    expect(events.map(event => [event.id, event.closesOn])).toEqual([['P', '2026-10-13'], ['O', '2026-10-25']]);
  });

  it('puts upcoming events after the open ones, the next race first; an own event before race day is already open', async () => {
    authStub.fetchJson.mockResolvedValue({ data: { items: [
      { id: 'U2', name: 'Later Race', date: '2026-10-20', location: 'Cebu City' },
      { id: 'U1', name: 'Next Race', date: '2026-10-12', location: 'Cebu City' },
      { id: 'P', name: 'Race Today', date: '2026-10-10', location: 'Cebu City' },
    ] } });
    authStub.authorizedFetch.mockResolvedValue({ data: { items: [
      { id: 'O', name: 'My Future Run', date: '2026-11-01', location: 'Talisay', state: 'upcoming', ownedByMe: true, reviewStatus: 'approved' },
    ] } });
    const events = await service.listEvents(now);
    expect(events.map(event => [event.id, event.uploadWindow])).toEqual([['O', 'open'], ['P', 'open'], ['U1', 'upcoming'], ['U2', 'upcoming']]);
    expect(events.find(event => event.id === 'U1').state).toBe('upcoming');
  });

  it('asks for both lists at the same time, not one after the other', async () => {
    let release;
    authStub.fetchJson.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    authStub.authorizedFetch.mockClear();
    authStub.authorizedFetch.mockResolvedValue({ data: { items: [] } });
    const pending = service.listEvents(now);
    expect(authStub.authorizedFetch).toHaveBeenCalledTimes(1); // asked before the public list answered
    release({ data: { items: [] } });
    expect(await pending).toEqual([]);
  });

  it('a sign-in that cannot be renewed still fails the whole list', async () => {
    authStub.fetchJson.mockResolvedValue({ data: { items: [] } });
    authStub.authorizedFetch.mockRejectedValue(new QpAuthError('QuickPitik sign-in expired'));
    await expect(service.listEvents(now)).rejects.toBeInstanceOf(QpAuthError);
  });

  it('leaves out own events not approved yet, and lists archived ones as closed', async () => {
    authStub.fetchJson.mockResolvedValue({ data: { items: [] } });
    const mine = (id, extra) => ({ id, name: id, date: '2026-10-09', location: 'Cebu City', state: 'open', ownedByMe: true, ...extra });
    authStub.authorizedFetch.mockResolvedValue({ data: { items: [
      mine('approved', { reviewStatus: 'approved' }),
      mine('parked', { reviewStatus: 'change_pending' }),
      mine('pending', { reviewStatus: 'pending', state: 'upcoming' }),
      mine('rejected', { reviewStatus: 'rejected', state: 'upcoming' }),
      mine('archived-own', { reviewStatus: 'approved', state: 'past' }),
      mine('archived-covered', { ownedByMe: false, state: 'past' }),
    ] } });
    expect((await service.listEvents(now)).map(event => [event.id, event.uploadWindow])).toEqual([
      ['approved', 'open'], ['parked', 'open'], ['archived-own', 'closed'], ['archived-covered', 'closed'],
    ]);
  });

  it('counts the day in Manila, not in UTC or on this PC', () => {
    const { canUploadPublic } = service._internals;
    expect(canUploadPublic('2026-10-10', new Date('2026-10-09T15:59:59Z'))).toBe(false); // 23:59 on the 9th in Manila
    expect(canUploadPublic('2026-10-10', new Date('2026-10-09T16:00:00Z'))).toBe(true); // midnight in Manila
  });
});

// ── Upload engine helpers ─────────────────────────────────────────────────────
function fakeHttps(statusFor = () => 200) {
  const puts = [];
  httpsMock.request.mockImplementation((url, options, onResponse) => {
    const chunks = [];
    const request = new Writable({ write(chunk, _encoding, callback) { chunks.push(chunk); callback(); } });
    request.on('finish', () => {
      puts.push({ url: String(url), options, body: Buffer.concat(chunks) });
      const response = new EventEmitter();
      response.statusCode = statusFor(puts.length);
      response.resume = () => setImmediate(() => response.emit('end'));
      onResponse(response);
    });
    return request;
  });
  return puts;
}
function routes(table) {
  authStub.authorizedFetch.mockImplementation(async (p, init = {}) => {
    const key = p.endsWith('/photos/exists') ? 'exists' : p.endsWith('/direct/commit') ? 'commit' : p.endsWith('/direct') ? 'begin' : 'multipart';
    if (!table[key]) throw new Error(`unexpected ${key} call`);
    return { data: await table[key](init.body, p, init) };
  });
}
function calls(key) {
  const suffix = { exists: '/photos/exists', commit: '/direct/commit', begin: '/direct', multipart: '/photos' }[key];
  return authStub.authorizedFetch.mock.calls.filter(([p]) => p.endsWith(suffix));
}
const future = () => new Date(Date.now() + 600000).toISOString();
function directTable(overrides = {}) {
  return {
    exists: async ({ hashes }) => ({ results: hashes.map(hash => ({ hash, status: 'new', eventName: null })) }),
    begin: async (body) => ({ mode: 'direct', photoId: `photo-${body.contentHash.slice(0, 8)}`, key: `k/${body.contentHash}`,
      uploadUrl: `https://uploads.test/${body.contentHash}`, expiresAt: future(), uploadHeaders: { 'Content-Type': body.contentType } }),
    commit: async (body) => ({ id: body.photoId }),
    ...overrides,
  };
}
async function untilSettled(events) {
  for (let i = 0; i < 400 && !['done', 'cancelled', 'error'].includes(events.at(-1)?.phase); i++) await new Promise(r => setTimeout(r, 5));
  return events.at(-1);
}
async function run(root, folders, eventId = 'event-1') {
  const events = [];
  const started = await service.startUpload({ rootPath: root, eventId, folders }, (payload) => events.push(payload));
  return { started, events, finished: () => untilSettled(events) };
}
const netError = (code) => Object.assign(new Error(code), { code });

describe('upload engine', () => {
  beforeEach(() => { service._internals.sleep = async () => {}; service._internals.now = () => Date.now(); });

  it('sha256File matches a known digest', async () => {
    const file = write(tempRoot('qp-hash-'), 'hello.jpg', 'hello');
    expect(await service.sha256File(file)).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('refuses an empty selection, an unregistered folder and a path that escapes the root', async () => { // Review Focus 4
    const root = tempRoot('qp-empty-'); write(root, 'Race/IMG_1.CR2'); registerAllowedPath(root);
    expect(await service.startUpload({ rootPath: root, eventId: 'e', folders: [] }, () => {})).toEqual({ success: false, error: 'Nothing to upload.' });
    expect(await service.startUpload({ rootPath: root, eventId: 'e', folders: ['Race'] }, () => {})).toEqual({ success: false, error: 'Nothing to upload.' });
    expect(await service.startUpload({ rootPath: root, eventId: 'e', folders: ['../x'] }, () => {})).toEqual({ success: false, error: 'Invalid upload request.' });
    expect(await service.startUpload({ rootPath: root, eventId: 'e', folders: ['Race\\..\\..\\x'] }, () => {})).toEqual({ success: false, error: 'Invalid upload request.' });
    const other = tempRoot('qp-unregistered-upload-'); write(other, 'a.jpg');
    expect(await service.startUpload({ rootPath: other, eventId: 'e', folders: [''] }, () => {})).toEqual({ success: false, error: 'Access denied: folder not selected through dialog' });
  });

  it('sends the original file name unchanged through begin, PUT and commit', async () => { // Review Focus 2
    const root = tempRoot('qp-one-'); const name = 'Race (1) #2 café.jpg'; write(root, name, 'photo-bytes'); registerAllowedPath(root);
    routes(directTable()); const puts = fakeHttps();
    const { started, finished } = await run(root, ['']);
    expect(started).toEqual({ success: true, total: 1 });
    const last = await finished();
    expect(last.phase).toBe('done');
    expect(last.counts).toEqual({ uploaded: 1, alreadyThere: 0, inTrash: 0, failed: 0, total: 1 });
    expect(last.bytes).toEqual({ sent: 11, total: 11 });
    expect(last.failures).toEqual([]);
    const hash = await service.sha256File(path.join(root, name));
    expect(calls('exists')[0][1].body).toEqual({ hashes: [hash] });
    const beginBody = calls('begin')[0][1].body;
    expect(beginBody).toEqual({ contentHash: hash, contentType: 'image/jpeg', sizeBytes: 11, originalFilename: name, requestId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(beginBody).not.toHaveProperty('client');
    expect(puts).toHaveLength(1);
    expect(puts[0].url).toBe(`https://uploads.test/${hash}`);
    expect(puts[0].options).toEqual({ method: 'PUT', headers: { 'Content-Type': 'image/jpeg', 'Content-Length': 11 } });
    expect(puts[0].body.toString()).toBe('photo-bytes');
    expect(calls('commit')[0][1]).toMatchObject({ timeoutMs: 120000, body: { photoId: `photo-${hash.slice(0, 8)}`, key: `k/${hash}`, contentHash: hash, sizeBytes: 11, contentType: 'image/jpeg' } });
  });

  it('counts a repeat of the same bytes as already there instead of failing', async () => { // Review Focus 3
    const root = tempRoot('qp-dup-'); write(root, 'A/same.jpg', 'same-bytes'); write(root, 'B/same.jpg', 'same-bytes'); write(root, 'B/other.jpg', 'other'); registerAllowedPath(root);
    const stored = new Set();
    routes(directTable({
      exists: async ({ hashes }) => ({ results: hashes.map(hash => ({ hash, status: stored.has(hash) ? 'same_event' : 'new', eventName: null })) }),
      commit: async (body) => { stored.add(body.contentHash); return { id: body.photoId }; },
    }));
    const puts = fakeHttps();
    const last = await (await run(root, ['A', 'B'])).finished();
    expect(last.phase).toBe('done');
    expect(last.counts).toEqual({ uploaded: 2, alreadyThere: 1, inTrash: 0, failed: 0, total: 3 });
    expect(puts).toHaveLength(2);
    expect(last.bytes.sent).toBe(last.bytes.total);
  });

  it('a begin that answers existing counts as already there', async () => {
    const root = tempRoot('qp-existing-'); write(root, 'a.jpg', 'a'); registerAllowedPath(root);
    routes(directTable({ begin: async () => ({ mode: 'existing', existing: { id: 'p1' } }) }));
    const puts = fakeHttps();
    const last = await (await run(root, [''])).finished();
    expect(puts).toHaveLength(0);
    expect(last.counts).toEqual({ uploaded: 0, alreadyThere: 1, inTrash: 0, failed: 0, total: 1 });
  });

  it('photos in the trash on quickpitik.com are counted apart, not as already there', async () => {
    const root = tempRoot('qp-trash-'); write(root, 'a.jpg', 'a'); write(root, 'b.jpg', 'b'); write(root, 'c.jpg', 'c'); registerAllowedPath(root);
    const hashA = await service.sha256File(path.join(root, 'a.jpg'));
    const hashB = await service.sha256File(path.join(root, 'b.jpg'));
    routes(directTable({
      // a: the pre-flight says it is there but in the trash; b and c: begin answers existing, b in the trash, c live
      exists: async ({ hashes }) => ({ results: hashes.map(hash => ({ hash, status: hash === hashA ? 'same_event' : 'new', eventName: null, inTrash: hash === hashA })) }),
      begin: async (body) => ({ mode: 'existing', existing: { id: `p-${body.contentHash.slice(0, 8)}`, inTrash: body.contentHash === hashB } }),
    }));
    const puts = fakeHttps();
    const last = await (await run(root, [''])).finished();
    expect(puts).toHaveLength(0);
    expect(last.phase).toBe('done');
    expect(last.counts).toEqual({ uploaded: 0, alreadyThere: 1, inTrash: 2, failed: 0, total: 3 });
    expect(last.bytes.sent).toBe(last.bytes.total);
  });

  it('rejects an upload link on another origin without sending bytes, and stops the run there', async () => {
    const root = tempRoot('qp-origin-'); for (let i = 0; i < 6; i++) write(root, `p${i}.jpg`, `p${i}`); registerAllowedPath(root);
    routes(directTable({ begin: async () => ({ mode: 'direct', photoId: 'p', key: 'k', uploadUrl: 'https://elsewhere.test/k', expiresAt: future(), uploadHeaders: {} }) }));
    const puts = fakeHttps();
    const last = await (await run(root, [''])).finished();
    expect(puts).toHaveLength(0);
    expect(last.phase).toBe('error');
    expect(last.error).toEqual({ code: 'UPLOAD_LINK_REJECTED', message: 'This version of BatchMyPhotos is not set up for uploads to QuickPitik. Update the app and try again.' });
    expect(calls('begin').length).toBeLessThanOrEqual(4); // the four in flight; a fifth photo never began
    expect(calls('commit')).toHaveLength(0);
  });

  it('treats UPLOAD_IN_PROGRESS on commit as a wait, not a failure', async () => {
    const root = tempRoot('qp-busy-'); write(root, 'a.jpg', 'a'); registerAllowedPath(root);
    let commits = 0;
    routes(directTable({ commit: async (body) => { if (++commits < 3) throw new QpApiError({ status: 409, code: 'UPLOAD_IN_PROGRESS', message: 'verifying' }); return { id: body.photoId }; } }));
    fakeHttps();
    const last = await (await run(root, [''])).finished();
    expect(commits).toBe(3);
    expect(last.counts).toMatchObject({ uploaded: 1, failed: 0 });
  });

  it('retries a server error with backoff and gives up after three retries per phase', async () => {
    const root = tempRoot('qp-5xx-'); write(root, 'a.jpg', 'a'); registerAllowedPath(root);
    const waits = []; service._internals.sleep = async (ms) => { waits.push(ms); };
    routes(directTable({ begin: async () => { throw new QpApiError({ status: 503, code: 'SERVICE_UNAVAILABLE', message: 'down', retryAfterSeconds: 2 }); } }));
    const last = await (await run(root, [''])).finished();
    expect(calls('begin')).toHaveLength(4);
    expect(waits).toHaveLength(3);
    expect(waits.every(ms => ms >= 2000)).toBe(true);
    expect(last.failures[0]).toMatchObject({ code: 'SERVICE_UNAVAILABLE', retryable: true });
  });

  it('a lost PUT reply is reconciled by commit before bytes are sent again', async () => {
    const root = tempRoot('qp-lost-'); write(root, 'a.jpg', 'a'); registerAllowedPath(root);
    routes(directTable());
    const puts = fakeHttps((n) => (n === 1 ? 502 : 200));
    const last = await (await run(root, [''])).finished();
    expect(puts).toHaveLength(1);
    expect(calls('commit')).toHaveLength(1);
    expect(last.counts).toMatchObject({ uploaded: 1, failed: 0 });
  });

  it('PUTs again when storage has nothing after a failed PUT', async () => {
    const root = tempRoot('qp-missing-'); write(root, 'a.jpg', 'a'); registerAllowedPath(root);
    let commits = 0;
    routes(directTable({ commit: async (body) => { if (++commits === 1) throw new QpApiError({ status: 409, code: 'UPLOAD_OBJECT_MISSING', message: 'nothing stored' }); return { id: body.photoId }; } }));
    const puts = fakeHttps((n) => (n === 1 ? 502 : 200));
    const last = await (await run(root, [''])).finished();
    expect(puts).toHaveLength(2);
    expect(commits).toBe(2);
    expect(last.counts).toMatchObject({ uploaded: 1, failed: 0 });
    expect(last.bytes.sent).toBe(1);
  });

  it('a terminal event error stops the whole upload', async () => {
    const root = tempRoot('qp-event-'); for (let i = 0; i < 6; i++) write(root, `p${i}.jpg`, `p${i}`); registerAllowedPath(root);
    routes(directTable({ begin: async () => { throw new QpApiError({ status: 403, code: 'EVENT_NOT_UPLOADABLE', message: 'Upload window for this event has closed.' }); } }));
    fakeHttps();
    const last = await (await run(root, [''])).finished();
    expect(last.phase).toBe('error');
    expect(last.error).toEqual({ code: 'EVENT_NOT_UPLOADABLE', message: 'Upload window for this event has closed.' });
    expect(calls('begin').length).toBeLessThanOrEqual(4); // the four in flight; a fifth file never started
    expect(calls('commit')).toHaveLength(0);
  });

  it('a per-file terminal error records the failure and continues', async () => {
    const root = tempRoot('qp-perfile-'); write(root, 'bad.jpg', 'bad'); write(root, 'good.jpg', 'good'); registerAllowedPath(root);
    const table = directTable(); const begin = table.begin;
    routes({ ...table, begin: async (body) => { if (body.originalFilename === 'bad.jpg') throw new QpApiError({ status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Not an image.' }); return begin(body); } });
    fakeHttps();
    const last = await (await run(root, [''])).finished();
    expect(last.phase).toBe('done');
    expect(last.counts).toEqual({ uploaded: 1, alreadyThere: 0, inTrash: 0, failed: 1, total: 2 });
    expect(last.failures).toEqual([{ relPath: '', name: 'bad.jpg', code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Not an image.', retryable: false }]);
  });

  it('cancel stops after the files in flight and reports what finished', async () => {
    const root = tempRoot('qp-cancel-'); for (let i = 0; i < 8; i++) write(root, `p${i}.jpg`, `p${i}`); registerAllowedPath(root);
    let commits = 0;
    routes(directTable({ commit: async (body) => { if (++commits === 1) service.cancelUpload(); return { id: body.photoId }; } }));
    fakeHttps();
    const last = await (await run(root, [''])).finished();
    expect(last.phase).toBe('cancelled');
    expect(last.counts.uploaded).toBeGreaterThanOrEqual(1);
    expect(last.counts.uploaded + last.counts.failed).toBeLessThan(8);
  });

  it('cancel while the folders are listed stops the upload', async () => {
    const root = tempRoot('qp-listcancel-'); write(root, 'a.jpg', 'a'); registerAllowedPath(root);
    routes(directTable()); fakeHttps();
    const real = fs.promises.readdir;
    const readdir = vi.spyOn(fs.promises, 'readdir').mockImplementationOnce((...args) => { service.cancelUpload(); return real(...args); });
    const { finished } = await run(root, ['']);
    readdir.mockRestore();
    expect((await finished()).phase).toBe('cancelled');
    expect(calls('begin')).toHaveLength(0);
    expect(uploadRecord.load()).toBeNull();
  });

  it('falls back to multipart when begin says so', async () => {
    const root = tempRoot('qp-multipart-'); write(root, 'a.jpg', 'multipart-bytes'); registerAllowedPath(root);
    let form;
    routes(directTable({ begin: async () => ({ mode: 'multipart' }), multipart: async (_body, _p, init) => { form = init.body; return { id: 'm' }; } }));
    const puts = fakeHttps();
    const last = await (await run(root, [''])).finished();
    expect(puts).toHaveLength(0);
    expect(calls('multipart')).toHaveLength(1);
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('file')).toBeInstanceOf(Blob);
    expect(form.get('file').name).toBe('a.jpg');
    expect(await form.get('file').text()).toBe('multipart-bytes');
    expect(last.counts).toMatchObject({ uploaded: 1, failed: 0 });
  });

  it('a session that cannot be refreshed pauses the upload with SESSION_EXPIRED', async () => {
    const root = tempRoot('qp-session-'); write(root, 'a.jpg', 'a'); registerAllowedPath(root);
    routes(directTable({ begin: async () => { throw new QpAuthError('Session expired'); } }));
    const last = await (await run(root, [''])).finished();
    expect(last.phase).toBe('error');
    expect(last.error.code).toBe('SESSION_EXPIRED');
  });

  it('a pre-flight that keeps failing treats every file as new', async () => {
    const root = tempRoot('qp-exists-'); write(root, 'a.jpg', 'a'); write(root, 'b.jpg', 'b'); registerAllowedPath(root);
    routes(directTable({ exists: async () => { throw netError('ECONNRESET'); } }));
    fakeHttps();
    const last = await (await run(root, [''])).finished();
    expect(calls('exists')).toHaveLength(4);
    expect(calls('begin')).toHaveLength(2);
    expect(last.counts).toMatchObject({ uploaded: 2, failed: 0 });
  });

  it('waits for the connection to come back instead of counting a retry', async () => {
    const root = tempRoot('qp-offline-'); write(root, 'a.jpg', 'a'); registerAllowedPath(root);
    let attempts = 0;
    const table = directTable(); const begin = table.begin;
    routes({ ...table, begin: async (body) => { if (++attempts <= 5) { online = false; throw netError('ENOTFOUND'); } return begin(body); } });
    service._internals.sleep = async () => { online = true; };
    fakeHttps();
    const { events, finished } = await run(root, ['']);
    const last = await finished();
    expect(events.some(event => event.phase === 'waiting')).toBe(true);
    expect(attempts).toBe(6);
    expect(last.counts).toMatchObject({ uploaded: 1, failed: 0 });
  });

  it('a host that cannot be reached while Windows says online fails the file after the normal retries', async () => {
    const root = tempRoot('qp-blocked-'); write(root, 'a.jpg', 'a'); registerAllowedPath(root);
    let attempts = 0;
    routes({ ...directTable(), begin: async () => { attempts += 1; throw netError('ENOTFOUND'); } });
    service._internals.sleep = () => new Promise(resolve => setTimeout(resolve, 1)); // a real tick, so a runaway loop shows as a timeout
    const last = await (await run(root, [''])).finished();
    expect(attempts).toBe(4); // the first try and QP_MAX_RETRIES_PER_PHASE (3) retries
    expect(last.counts).toMatchObject({ uploaded: 0, failed: 1 });
  }, 3000);

  it('does not leave "Waiting for connection" as the last word after the final failed try', async () => {
    const root = tempRoot('qp-blocked-last-'); write(root, 'a.jpg', 'a'); registerAllowedPath(root);
    routes({ ...directTable(), begin: async () => { throw netError('ENOTFOUND'); } });
    let t = 1e6; // time moves only when the retry wait sleeps, so the 250 ms throttle is the same as in real use
    service._internals.now = () => t;
    service._internals.sleep = async () => { t += 5000; };
    const { events, finished } = await run(root, ['']);
    await finished();
    const beforeEnd = events.slice(0, events.findIndex(event => event.phase === 'folder-done'));
    expect(beforeEnd.at(-1).phase).toBe('uploading');
  });

  it('a run of failed files stops the whole upload and keeps the record', async () => {
    const root = tempRoot('qp-unreachable-'); for (let i = 0; i < 20; i++) write(root, `IMG_${i}.jpg`, `p${i}`); registerAllowedPath(root);
    routes({ ...directTable(), begin: async () => { throw netError('ENOTFOUND'); } });
    service._internals.sleep = () => new Promise(r => setTimeout(r, 1));
    const last = await (await run(root, [''])).finished();
    expect(last.phase).toBe('error');
    expect(last.error.code).toBe('UNREACHABLE');
    expect(calls('begin').length).toBeLessThan(80);
    expect(uploadRecord.load()).not.toBeNull();
  });

  it('a slow network with some successes does not stop', async () => {
    const root = tempRoot('qp-flaky-'); for (let i = 0; i < 20; i++) write(root, `IMG_${i}.jpg`, `p${i}`); registerAllowedPath(root);
    const table = directTable();
    routes({ ...table, begin: async (body) => {
      if (Number(/\d+/.exec(body.originalFilename)[0]) % 5 !== 4) throw netError('ENOTFOUND');
      return table.begin(body);
    } });
    fakeHttps();
    service._internals.sleep = () => new Promise(r => setTimeout(r, 1));
    const last = await (await run(root, [''])).finished();
    expect(last.phase).toBe('done');
  });

  it('refuses to start while another upload is running', async () => {
    const root = tempRoot('qp-twice-'); write(root, 'a.jpg', 'a'); registerAllowedPath(root);
    let release;
    routes(directTable({ begin: () => new Promise(resolve => { release = () => resolve({ mode: 'multipart' }); }), multipart: async () => ({ id: 'm' }) }));
    const first = await run(root, ['']);
    expect(first.started.success).toBe(true);
    expect(await service.startUpload({ rootPath: root, eventId: 'e', folders: [''] }, () => {})).toEqual({ success: false, error: 'An upload is already running.' });
    await vi.waitFor(() => expect(release).toBeTypeOf('function')); // begin is reached after hashing and the pre-flight
    release();
    expect((await first.finished()).phase).toBe('done');
  });

  // ── Found by the Task 15 review ──
  const pause = (ms) => new Promise(r => setTimeout(r, ms));
  const everyEventPasses = () => { let t = Date.now(); service._internals.now = () => (t += 1000); }; // defeats the progress throttle

  it("retries Electron's own network errors and timeouts, and waits when the server name does not resolve", async () => {
    const root = tempRoot('qp-neterr-'); write(root, 'a.jpg', 'a'); registerAllowedPath(root);
    let begins = 0; let commits = 0;
    const table = directTable(); const begin = table.begin;
    routes({ ...table,
      begin: async (body) => { begins += 1; if (begins === 1) throw new Error('net::ERR_NAME_NOT_RESOLVED'); if (begins === 2) throw new Error('net::ERR_EMPTY_RESPONSE'); return begin(body); },
      commit: async (body) => { if (++commits === 1) throw Object.assign(new Error('This operation was aborted'), { name: 'AbortError', code: 20 }); return { id: body.photoId }; } });
    fakeHttps();
    const { events, finished } = await run(root, ['']);
    const last = await finished();
    expect(events.some(event => event.phase === 'waiting')).toBe(true);
    expect([begins, commits]).toEqual([3, 2]);
    expect(last.counts).toMatchObject({ uploaded: 1, failed: 0 });
  });

  it('a call that keeps timing out fails as a retryable TIMEOUT', async () => {
    const root = tempRoot('qp-abort-'); write(root, 'a.jpg', 'a'); registerAllowedPath(root);
    routes(directTable({ begin: async () => { throw Object.assign(new Error('This operation was aborted'), { name: 'AbortError', code: 20 }); } }));
    const last = await (await run(root, [''])).finished();
    expect(calls('begin')).toHaveLength(4);
    expect(last.failures).toEqual([{ relPath: '', name: 'a.jpg', code: 'TIMEOUT', message: expect.any(String), retryable: true }]);
  });

  it('gives up on a photo whose upload link keeps expiring', async () => {
    const root = tempRoot('qp-renew-'); write(root, 'a.jpg', 'a'); registerAllowedPath(root);
    routes(directTable({
      begin: async (body) => ({ mode: 'direct', photoId: 'p', key: 'k', uploadUrl: `https://uploads.test/${body.contentHash}`, expiresAt: new Date(Date.now() - 1000).toISOString(), uploadHeaders: {} }),
      commit: async () => { throw new QpApiError({ status: 409, code: 'UPLOAD_OBJECT_MISSING', message: 'nothing stored' }); },
    }));
    fakeHttps(() => 502);
    const last = await (await run(root, [''])).finished();
    expect(last.phase).toBe('done');
    expect(calls('begin')).toHaveLength(4);
    expect(last.counts).toMatchObject({ uploaded: 0, failed: 1 });
    expect(last.bytes.sent).toBeLessThanOrEqual(last.bytes.total);
  });

  it('accepts only one of two starts made at the same moment', async () => {
    const root = tempRoot('qp-race-'); write(root, 'a.jpg', 'a'); registerAllowedPath(root);
    routes(directTable()); fakeHttps();
    const events = [];
    const answers = await Promise.all([1, 2].map(() => service.startUpload({ rootPath: root, eventId: 'e', folders: [''] }, (payload) => events.push(payload))));
    expect(answers.filter(answer => answer.success)).toHaveLength(1);
    expect(answers.find(answer => !answer.success)).toEqual({ success: false, error: 'An upload is already running.' });
    await untilSettled(events);
  });

  it('the last event waits for the photos in flight and counts them', async () => {
    const root = tempRoot('qp-final-'); for (let i = 0; i < 4; i++) write(root, `p${i}.jpg`, `p${i}`); registerAllowedPath(root);
    let committing = 0;
    const table = directTable(); const begin = table.begin;
    routes({ ...table,
      begin: async (body) => {
        if (body.originalFilename !== 'p0.jpg') return begin(body);
        while (committing < 3) await pause(2);
        throw new QpApiError({ status: 403, code: 'EVENT_NOT_UPLOADABLE', message: 'closed' });
      },
      commit: async (body) => { committing += 1; await pause(30); return { id: body.photoId }; } });
    fakeHttps();
    const { events, finished } = await run(root, ['']);
    const last = await finished();
    await pause(60);
    expect(events.at(-1)).toBe(last);
    expect(last.phase).toBe('error');
    expect(last.counts).toMatchObject({ uploaded: 3, failed: 0 });
  });

  it('stops reading a photo once its upload is cancelled', async () => {
    const root = tempRoot('qp-stopread-'); write(root, 'big.jpg', Buffer.alloc(1024 * 1024)); registerAllowedPath(root);
    routes(directTable());
    httpsMock.request.mockImplementation(() => new Writable({ write(_chunk, _encoding, callback) { service.cancelUpload(); setTimeout(callback, 5); } }));
    everyEventPasses();
    const { events, finished } = await run(root, ['']);
    const last = await finished();
    await pause(100);
    expect(last.phase).toBe('cancelled');
    expect(events.at(-1)).toBe(last);
  });

  it('sends nothing after the cancelled event when cancel arrives during hashing', async () => {
    const root = tempRoot('qp-hashcancel-'); for (let i = 0; i < 8; i++) write(root, `p${i}.jpg`, `p${i}`); registerAllowedPath(root);
    routes(directTable()); fakeHttps();
    everyEventPasses();
    const real = fs.createReadStream;
    const spy = vi.spyOn(fs, 'createReadStream').mockImplementation((...args) => { service.cancelUpload(); return real(...args); });
    const { events, finished } = await run(root, ['']);
    const last = await finished();
    await pause(50);
    spy.mockRestore();
    expect(last.phase).toBe('cancelled');
    expect(events.at(-1)).toBe(last);
  });

  it('cancel is seen at once during a retry wait', async () => {
    const root = tempRoot('qp-sleepcancel-'); write(root, 'a.jpg', 'a'); registerAllowedPath(root);
    let sleeping; const asleep = new Promise(resolve => { sleeping = resolve; });
    service._internals.sleep = () => { sleeping(); return new Promise(() => {}); };
    routes(directTable({ begin: async () => { throw new QpApiError({ status: 503, code: 'SERVICE_UNAVAILABLE', message: 'down', retryAfterSeconds: 300 }); } }));
    const { finished } = await run(root, ['']);
    await asleep;
    service.cancelUpload();
    expect((await finished()).phase).toBe('cancelled');
  });
});

describe('resume record', () => {
  beforeEach(() => { service._internals.sleep = async () => {}; service._internals.now = () => Date.now(); });

  const start = (root, folders, send, extra = {}) => service.startUpload({ rootPath: root, eventId: 'event-1', eventName: 'Cebu Marathon 2026', folders, ...extra }, send);
  function shoot(prefix) {
    const root = tempRoot(prefix);
    write(root, 'A/a.jpg', 'a'); write(root, 'B/bad.jpg', 'bad'); write(root, 'B/good.jpg', 'good'); write(root, 'C/c.jpg', 'c');
    registerAllowedPath(root);
    return root;
  }
  const failBad = (table) => ({ ...table, begin: async (body) => {
    if (body.originalFilename === 'bad.jpg') throw new QpApiError({ status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Not an image.' });
    return table.begin(body);
  } });

  it('is saved at the start and lists each subfolder that finished with no failed photo', async () => { // R1, R2
    const root = shoot('qp-record-');
    routes(failBad(directTable())); fakeHttps();
    const events = []; const atFolderDone = [];
    expect(await start(root, ['A', 'B', 'C'], (payload) => {
      events.push(payload);
      if (payload.phase === 'folder-done') atFolderDone.push(uploadRecord.load().finished);
    })).toEqual({ success: true, total: 4 });
    expect(uploadRecord.load()).toEqual({ version: 1, account: 'u1', eventId: 'event-1', eventName: 'Cebu Marathon 2026', root,
      rootBirth: fs.statSync(root).birthtimeMs, selected: ['A', 'B', 'C'], finished: [], startedAt: expect.any(String), updatedAt: expect.any(String) });
    expect((await untilSettled(events)).phase).toBe('done');
    expect(atFolderDone).toEqual([['A'], ['A'], ['A', 'C']]); // B had a failed photo: a resume reads it again
  });

  it('a run that reaches done clears it, even with failed photos', async () => { // D5
    const root = shoot('qp-record-done-');
    routes(failBad(directTable())); fakeHttps();
    const events = []; const kept = [];
    await start(root, ['A', 'B', 'C'], (payload) => { events.push(payload); if (payload.phase === 'folder-done') kept.push(uploadRecord.load() !== null); });
    const last = await untilSettled(events);
    expect(last.counts.failed).toBe(1);
    expect(kept).toEqual([true, true, true]);
    expect(uploadRecord.load()).toBeNull();
  });

  it('Cancel clears it', async () => { // R3
    const root = shoot('qp-record-cancel-');
    let before;
    routes(directTable({ commit: async (body) => { before ??= uploadRecord.load(); service.cancelUpload(); return { id: body.photoId }; } })); fakeHttps();
    const events = [];
    await start(root, ['A', 'B', 'C'], (payload) => events.push(payload));
    expect((await untilSettled(events)).phase).toBe('cancelled');
    expect(before).toMatchObject({ eventId: 'event-1' });
    expect(uploadRecord.load()).toBeNull();
  });

  it('an error that stops the run, or an expired sign-in, keeps it', async () => { // R3, R9
    for (const failure of [new QpApiError({ status: 403, code: 'EVENT_NOT_UPLOADABLE', message: 'closed' }), new QpAuthError('expired')]) {
      memory.clear();
      const root = shoot('qp-record-kept-');
      routes(directTable({ begin: async () => { throw failure; } })); fakeHttps();
      const events = [];
      await start(root, ['A', 'B'], (payload) => events.push(payload));
      expect((await untilSettled(events)).phase).toBe('error');
      expect(uploadRecord.load()).toMatchObject({ eventId: 'event-1', selected: ['A', 'B'], finished: [] });
    }
  });

  it('a new upload replaces it, named by its id when the screen sent no name', async () => { // R11
    const root = shoot('qp-record-new-');
    routes(directTable({ begin: async () => { throw new QpApiError({ status: 403, code: 'EVENT_NOT_UPLOADABLE', message: 'closed' }); } })); fakeHttps();
    let events = [];
    await start(root, ['A', 'B'], (payload) => events.push(payload));
    await untilSettled(events);
    events = [];
    await service.startUpload({ rootPath: root, eventId: 'event-2', folders: ['C'] }, (payload) => events.push(payload));
    expect(uploadRecord.load()).toMatchObject({ eventId: 'event-2', eventName: 'event-2', selected: ['C'], finished: [] });
    service.cancelUpload(); // still reading photos: nothing reaches the server
    expect((await untilSettled(events)).phase).toBe('cancelled');
  });
});

describe('resume', () => {
  beforeEach(() => { service._internals.sleep = async () => {}; service._internals.now = () => Date.now(); });

  // A shoot folder that was dropped in an earlier session: on disk, but not allowed in this one.
  function earlierRun(prefix, finished = ['A'], rootBirth) {
    const root = tempRoot(prefix);
    write(root, 'A/a.jpg', 'a'); write(root, 'B/b.jpg', 'b'); write(root, 'C/c.jpg', 'c');
    uploadRecord.save({ account: 'u1', eventId: 'event-1', eventName: 'Cebu Marathon 2026', root, rootBirth: rootBirth ?? fs.statSync(root).birthtimeMs, selected: ['A', 'B', 'C'] });
    for (const rel of finished) uploadRecord.markFinished(rel);
    return root;
  }

  it("offers the connected account's unfinished upload, and hides another account's without deleting it", async () => { // R5
    const root = earlierRun('qp-pending-');
    expect(await service.getPending()).toEqual({ running: false,
      pending: { eventId: 'event-1', eventName: 'Cebu Marathon 2026', folder: root, folderMissing: false } });
    authStub.getAccountId.mockReturnValueOnce('u2');
    expect(await service.getPending()).toEqual({ running: false, pending: null });
    authStub.getAccountId.mockReturnValueOnce(null); // signed out: Reconnect first (R9)
    expect(await service.getPending()).toEqual({ running: false, pending: null });
    expect(uploadRecord.load()).not.toBeNull();
  });

  it('says when the saved folder is gone, refuses to resume it, and keeps the record', async () => { // R7
    const root = earlierRun('qp-missing-');
    fs.rmSync(root, { recursive: true, force: true });
    expect((await service.getPending()).pending.folderMissing).toBe(true);
    expect(await service.startUpload({ resume: true }, () => {})).toEqual({ success: false, error: 'The folder is not there. Plug in the card or choose the folder again.' });
    expect(uploadRecord.load()).not.toBeNull();
  });

  it('reports a running upload instead of an offer, and Discard leaves its record alone', async () => { // R10
    const root = tempRoot('qp-running-'); write(root, 'a.jpg', 'a'); registerAllowedPath(root);
    routes(directTable()); fakeHttps();
    const events = [];
    await service.startUpload({ rootPath: root, eventId: 'event-1', eventName: 'Cebu Marathon 2026', folders: [''] }, (payload) => events.push(payload));
    expect(await service.getPending()).toEqual({ running: true, pending: null });
    expect(service.isUploading()).toBe(true);
    expect(service.discardPending()).toEqual({ success: true });
    expect(uploadRecord.load()).not.toBeNull();
    await untilSettled(events);
    expect(service.isUploading()).toBe(false);
  });

  it('Discard clears the record', async () => { // R3
    earlierRun('qp-discard-');
    expect(service.discardPending()).toEqual({ success: true });
    expect(uploadRecord.load()).toBeNull();
  });

  it('re-allows only the saved folder, ignores every path the screen sends, and uploads only the unfinished subfolders', async () => { // D2, R2
    const root = earlierRun('qp-resume-');
    const elsewhere = tempRoot('qp-not-mine-'); write(elsewhere, 'x.jpg', 'x');
    expect((await service.scanFolder(root)).success).toBe(false); // not allowed before Resume
    routes(directTable()); fakeHttps();
    const events = [];
    const answer = await service.startUpload({ resume: true, rootPath: elsewhere, eventId: 'event-9', folders: [''] }, (payload) => events.push(payload));
    expect(answer).toMatchObject({ success: true, total: 2, eventId: 'event-1', folders: ['B', 'C'], scan: { success: true, root } });
    expect((await untilSettled(events)).phase).toBe('done');
    expect([...new Set(events.map(e => e.folder?.relPath).filter(Boolean))]).toEqual(['B', 'C']); // A is not read again
    expect(calls('begin')).toHaveLength(2);
    expect(calls('begin').every(([p]) => p.includes('/events/event-1/'))).toBe(true);
    expect(await service.scanFolder(elsewhere)).toEqual({ success: false, error: 'Access denied: folder not selected through dialog' });
    expect(uploadRecord.load()).toBeNull();
  });

  it('the resume scan holds the upload slot', async () => {
    earlierRun('qp-resume-slot-');
    routes(directTable()); fakeHttps();
    const real = fs.promises.readdir;
    let open; const gate = new Promise(resolve => { open = resolve; });
    const readdir = vi.spyOn(fs.promises, 'readdir').mockImplementation(async (...args) => { await gate; return real(...args); });
    const events = [];
    const first = service.startUpload({ resume: true }, (payload) => events.push(payload));
    try {
      await vi.waitFor(() => expect(readdir).toHaveBeenCalled());
      expect(service.isUploading()).toBe(true);
      service.discardPending();
      expect(uploadRecord.load()).not.toBeNull();
      expect(await service.startUpload({ resume: true }, () => {})).toEqual({ success: false, error: 'An upload is already running.' });
    } finally { open(); readdir.mockRestore(); }
    expect(await first).toMatchObject({ success: true, total: 2 });
    expect((await untilSettled(events)).phase).toBe('done');
  });

  it('a missing subfolder is reported and the rest resumes', async () => { // D1 (a)
    const root = earlierRun('qp-gone-');
    fs.rmSync(path.join(root, 'B'), { recursive: true });
    routes(directTable()); fakeHttps();
    const events = [];
    expect(await service.startUpload({ resume: true }, (payload) => events.push(payload))).toMatchObject({ success: true, total: 1 });
    const last = await untilSettled(events);
    expect(last.phase).toBe('done');
    expect(last.failures[0].code).toBe('FOLDER_MISSING');
    expect(calls('begin')).toHaveLength(1);
  });

  it('refuses a folder made at another time (another card on the same drive letter) and keeps the record', async () => { // M3, D2
    earlierRun('qp-other-card-', ['A'], 1);
    routes(directTable()); fakeHttps();
    expect(await service.startUpload({ resume: true }, () => {})).toEqual({ success: false, error: 'This folder is not the one the upload started from. Discard it and choose the folder again.' });
    expect(calls('begin')).toHaveLength(0);
    expect(uploadRecord.load()).not.toBeNull();
  });

  it('resumes the folder it started from', async () => { // M3
    earlierRun('qp-same-card-');
    routes(directTable()); fakeHttps();
    const events = [];
    expect(await service.startUpload({ resume: true }, (payload) => events.push(payload))).toMatchObject({ success: true, total: 2 });
    expect((await untilSettled(events)).phase).toBe('done');
  });

  it('an old record without the folder time still resumes', async () => { // Review Focus 5
    earlierRun('qp-old-record-');
    const { rootBirth, ...old } = memory.get('record');
    memory.set('record', old);
    routes(directTable()); fakeHttps();
    const events = [];
    expect(await service.startUpload({ resume: true }, (payload) => events.push(payload))).toMatchObject({ success: true, total: 2 });
    expect((await untilSettled(events)).phase).toBe('done');
  });

  it('a photo culled from an unfinished subfolder does not block the resume', async () => { // Review Focus 2
    const root = earlierRun('qp-culled-');
    fs.rmSync(path.join(root, 'B', 'b.jpg'));
    routes(directTable()); fakeHttps();
    const events = [];
    expect(await service.startUpload({ resume: true }, (payload) => events.push(payload))).toMatchObject({ success: true, total: 1 });
    expect((await untilSettled(events)).phase).toBe('done');
  });

  it("has nothing to resume without a record or for another account's", async () => { // R5
    expect(await service.startUpload({ resume: true }, () => {})).toEqual({ success: false, error: 'There is no upload to resume.' });
    earlierRun('qp-other-account-');
    authStub.getAccountId.mockReturnValueOnce('u2');
    expect(await service.startUpload({ resume: true }, () => {})).toEqual({ success: false, error: 'There is no upload to resume.' });
  });
});
