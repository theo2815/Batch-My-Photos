import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Module from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const originalLoad = Module._load;
const noop = () => {};
const logger = { log: noop, warn: noop, error: noop, time: noop, timeEnd: noop };

let root;
let userDataDir;
let caseCount = 0;
const map = new Map();
const fakeStore = { get: (k, d) => (map.has(k) ? map.get(k) : d), set: (k, v) => map.set(k, v) };
const stubs = {
  electron: { app: { isPackaged: false, getPath: () => userDataDir } },
  '../utils/logger': logger,
};

Module._load = function (request, ...rest) {
  return Object.hasOwn(stubs, request) ? stubs[request] : originalLoad.call(this, request, ...rest);
};
const rm = require('../src/main/rollbackManager.js');
Module._load = originalLoad;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(process.cwd(), 'copy-undo-'));
  userDataDir = path.join(root, 'userData');
  fs.mkdirSync(userDataDir);
  rm.init(fakeStore);
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

beforeEach(async () => {
  await rm.clearHistory();
  rm.clearRollbackManifest();
  await rm.clearRollbackProgress();
});

// Builds S (originals) and O (output) with one copy of each name; names are split over two batch folders.
function makeRun(names) {
  const dir = path.join(root, `case-${caseCount++}`);
  const S = path.join(dir, 'S');
  const O = path.join(dir, 'O');
  fs.mkdirSync(S, { recursive: true });
  const batchFolders = ['Copy_001', 'Copy_002'];
  for (const f of batchFolders) fs.mkdirSync(path.join(O, f), { recursive: true });
  const operations = names.map((fileName, i) => {
    const sourcePath = path.join(S, fileName);
    fs.writeFileSync(sourcePath, `photo-${fileName}`);
    const destPath = path.join(O, batchFolders[i % 2], fileName);
    fs.copyFileSync(sourcePath, destPath);
    return { fileName, sourcePath, destPath };
  });
  return { S, O, batchFolders, operations };
}

function saveCopy(run, extra = {}) {
  return rm.saveRollbackManifest({
    sourceFolder: run.S,
    outputFolder: run.O,
    mode: 'copy',
    progressId: 'p1',
    operations: run.operations,
    batchFolders: run.batchFolders,
    totalFiles: run.operations.length,
    ...extra,
  });
}

const appState = () => ({ batchCancelled: false });
const later = () => new Date(Date.now() + 60_000);

describe('copy undo', () => {
  it('saves a copy record with its mode and progressId', async () => {
    const run = makeRun(['A.jpg']);
    expect(await saveCopy(run)).toBe(true);
    expect(rm.getOperationHistory()[0]).toMatchObject({ mode: 'copy', progressId: 'p1' });
    expect(rm.checkRollbackAvailable().mode).toBe('copy');
    expect(await saveCopy(run, { mode: 'xyz' })).toBe(false);
  });

  it('deletes the copies and the emptied batch folders, leaving the originals', async () => {
    const run = makeRun(['A.jpg', 'A.CR3', 'B.jpg']);
    await saveCopy(run);
    const result = await rm.executeRollback(appState());
    expect(result).toMatchObject({ success: true, mode: 'copy', restoredFiles: 3, keptFiles: 0, deletedFolders: 2, progressId: 'p1' });
    for (const op of run.operations) {
      expect(fs.existsSync(op.destPath)).toBe(false);
      expect(fs.readFileSync(op.sourcePath, 'utf8')).toBe(`photo-${op.fileName}`);
    }
    for (const f of run.batchFolders) expect(fs.existsSync(path.join(run.O, f))).toBe(false);
  });

  it('keeps a copy whose original is missing', async () => {
    const run = makeRun(['A.jpg', 'B.jpg']);
    await saveCopy(run);
    fs.unlinkSync(run.operations[1].sourcePath);
    const result = await rm.executeRollback(appState());
    expect(result).toMatchObject({ success: true, restoredFiles: 1, keptFiles: 1, deletedFolders: 1 });
    expect(fs.existsSync(run.operations[1].destPath)).toBe(true);
    expect(fs.existsSync(path.join(run.O, 'Copy_002'))).toBe(true);
  });

  it('keeps a copy whose size differs from the original', async () => {
    const run = makeRun(['A.jpg']);
    await saveCopy(run);
    fs.appendFileSync(run.operations[0].destPath, 'x');
    const result = await rm.executeRollback(appState());
    expect(result).toMatchObject({ success: true, restoredFiles: 0, keptFiles: 1 });
    expect(fs.existsSync(run.operations[0].destPath)).toBe(true);
  });

  it('keeps a copy edited after the run', async () => {
    const run = makeRun(['A.jpg']);
    await saveCopy(run);
    fs.utimesSync(run.operations[0].destPath, later(), later());
    const result = await rm.executeRollback(appState());
    expect(result).toMatchObject({ success: true, restoredFiles: 0, keptFiles: 1 });
    expect(fs.existsSync(run.operations[0].destPath)).toBe(true);
  });

  it('keeps a copy whose original was edited after the run', async () => {
    const run = makeRun(['A.jpg']);
    await saveCopy(run);
    fs.utimesSync(run.operations[0].sourcePath, later(), later());
    const result = await rm.executeRollback(appState());
    expect(result).toMatchObject({ success: true, restoredFiles: 0, keptFiles: 1 });
    expect(fs.existsSync(run.operations[0].destPath)).toBe(true);
  });

  it('keeps a file whose copy path is its own original path', async () => {
    const run = makeRun(['A.jpg']);
    const own = run.operations[0].destPath;
    run.operations[0].sourcePath = own;
    await saveCopy(run);
    const result = await rm.executeRollback(appState());
    expect(result).toMatchObject({ success: true, mode: 'copy', restoredFiles: 0, keptFiles: 1 });
    expect(fs.readFileSync(own, 'utf8')).toBe('photo-A.jpg');
  });

  it('counts a copy already deleted by hand as removed', async () => {
    const run = makeRun(['A.jpg', 'B.jpg']);
    await saveCopy(run);
    fs.unlinkSync(run.operations[0].destPath);
    const result = await rm.executeRollback(appState());
    expect(result).toMatchObject({ success: true, restoredFiles: 2, keptFiles: 0, hasErrors: false });
  });

  it('refuses a record with a copy outside its batch folders and deletes nothing', async () => {
    const run = makeRun(['A.jpg', 'B.jpg']);
    fs.mkdirSync(path.join(run.O, 'Other'));
    const stray = path.join(run.O, 'Other', 'A.jpg');
    fs.copyFileSync(run.operations[0].sourcePath, stray);
    run.operations[0].destPath = stray;
    await saveCopy(run);
    const result = await rm.executeRollback(appState());
    expect(result.success).toBe(false);
    expect(fs.existsSync(stray)).toBe(true);
    expect(fs.existsSync(run.operations[1].destPath)).toBe(true);
    expect(fs.existsSync(run.operations[0].sourcePath)).toBe(true);
  });

  it('refuses a record whose batch folder names are odd and deletes nothing', async () => {
    const run = makeRun(['A.jpg']);
    const outside = path.join(run.O, '..', 'A.jpg');
    fs.copyFileSync(run.operations[0].sourcePath, outside);
    run.operations[0].destPath = outside;
    await saveCopy(run, { batchFolders: ['..'] });
    const result = await rm.executeRollback(appState());
    expect(result.success).toBe(false);
    expect(fs.existsSync(outside)).toBe(true);
    expect(fs.existsSync(run.operations[0].sourcePath)).toBe(true);
  });

  it('undoes a copy entry from History and removes the entry', async () => {
    const run = makeRun(['A.jpg', 'A.CR3', 'B.jpg']);
    await saveCopy(run);
    const id = rm.getOperationHistory()[0].operationId;
    const result = await rm.executeHistoryRollback(id, appState());
    expect(result).toMatchObject({ success: true, mode: 'copy', restoredFiles: 3, keptFiles: 0, deletedFolders: 2 });
    for (const op of run.operations) expect(fs.existsSync(op.destPath)).toBe(false);
    expect(rm.getOperationHistory()).toHaveLength(0);
  });

  it('resumes an interrupted copy undo until every copy is gone', async () => {
    const names = Array.from({ length: 20 }, (_, i) => `P${i}.jpg`);
    const run = makeRun(names);
    await saveCopy(run);
    let reads = 0;
    const stopping = { get batchCancelled() { return ++reads > 5; } };
    const first = await rm.executeRollback(stopping);
    expect(first.success).toBe(false);
    expect(run.operations.some(op => fs.existsSync(op.destPath))).toBe(true);
    expect((await rm.checkInterruptedRollback()).mode).toBe('copy');
    const result = await rm.resumeInterruptedRollback(appState());
    expect(result).toMatchObject({ success: true, mode: 'copy' });
    for (const op of run.operations) expect(fs.existsSync(op.destPath)).toBe(false);
  });

  it('keeps a History copy entry when its output folder is missing', async () => {
    const run = makeRun(['A.jpg', 'B.jpg']);
    await saveCopy(run);
    const id = rm.getOperationHistory()[0].operationId;
    fs.renameSync(run.O, `${run.O}-away`);
    const result = await rm.executeHistoryRollback(id, appState());
    expect(result).toMatchObject({ success: false, error: 'Cannot find the output folder. Connect the drive and try again.' });
    expect(rm.getOperationHistory()).toHaveLength(1);
    fs.renameSync(`${run.O}-away`, run.O);
    for (const op of run.operations) expect(fs.existsSync(op.destPath)).toBe(true);
  });

  it('keeps an interrupted copy undo while its output folder is missing, then finishes it', async () => {
    const run = makeRun(Array.from({ length: 20 }, (_, i) => `P${i}.jpg`));
    await saveCopy(run);
    let reads = 0;
    await rm.executeRollback({ get batchCancelled() { return ++reads > 5; } });
    fs.renameSync(run.O, `${run.O}-away`);
    const missing = await rm.resumeInterruptedRollback(appState());
    expect(missing.success).toBe(false);
    expect(await rm.checkInterruptedRollback()).not.toBeNull();
    fs.renameSync(`${run.O}-away`, run.O);
    const result = await rm.resumeInterruptedRollback(appState());
    expect(result).toMatchObject({ success: true, mode: 'copy' });
    for (const op of run.operations) expect(fs.existsSync(op.destPath)).toBe(false);
  });

  it('still undoes a History entry with no mode field as a Move', async () => {
    const dir = path.join(root, `case-${caseCount++}`);
    const S = path.join(dir, 'S');
    const batch = path.join(S, 'Batch_001');
    fs.mkdirSync(batch, { recursive: true });
    const sourcePath = path.join(S, 'A.jpg');
    const destPath = path.join(batch, 'A.jpg');
    fs.writeFileSync(destPath, 'photo-A.jpg');
    await rm.saveRollbackManifest({
      sourceFolder: S, outputFolder: S, mode: 'move',
      operations: [{ fileName: 'A.jpg', sourcePath, destPath }],
      batchFolders: ['Batch_001'], totalFiles: 1,
    });
    const entry = rm.getOperationHistory()[0];
    delete entry.mode;
    const result = await rm.executeHistoryRollback(entry.operationId, appState());
    expect(result.success).toBe(true);
    expect(fs.readFileSync(sourcePath, 'utf8')).toBe('photo-A.jpg');
    expect(fs.existsSync(destPath)).toBe(false);
  });
});
