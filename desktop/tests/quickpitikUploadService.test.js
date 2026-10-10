import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Module, { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

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
const authStub = { authorizedFetch: vi.fn(), fetchJson: vi.fn(), QpApiError, QpAuthError };
let online = true;
const stubs = {
  electron: { app: { isPackaged: false }, net: { fetch: (...a) => fetchMock(...a), isOnline: () => online } },
  https: httpsMock,
};
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (stubs[request]) return stubs[request];
  if (request.endsWith('/quickpitikAuthService')) return authStub;
  return origLoad.call(this, request, ...rest);
};
const cjs = createRequire(import.meta.url);
const service = cjs('../src/main/quickpitikUploadService.js');
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
beforeEach(() => { authStub.authorizedFetch.mockReset(); authStub.fetchJson.mockReset(); httpsMock.request.mockReset(); fetchMock.mockReset(); online = true; });

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

  it("merges the public catalog with the photographer's events, owned first, no duplicates", async () => {
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
      { id: 'C', name: 'My Fun Run', date: '2026-09-20', location: 'Talisay', ownedByMe: true, state: 'open' },
      { id: 'A', name: 'Cebu Marathon 2026', date: '2026-10-09', location: 'Cebu City', ownedByMe: false, state: 'live' },
    ]);
  });
});
