import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
  electron: { app: { isPackaged: false, getPath: () => userDataDir }, dialog: {}, shell: {} },
  '../utils/logger': logger,
  './authService': { getStoredSession: () => 'test-session' },
  './subscriptionService': {
    checkPendingTrackLimit: () => ({ blocked: false }),
    checkBatchLimit: async () => ({ canExecute: true }),
    flushPendingTracks: async () => {},
    trackBatchExecution: async () => ({ success: true }),
  },
  './deviceService': {},
  './blurDetectionService': {},
  './windowManager': { isAppUrl: () => true },
};

process.env.BATCH_HWID_BINDING_ENABLED = 'false';
Module._load = function (request, ...rest) {
  return Object.hasOwn(stubs, request) ? stubs[request] : originalLoad.call(this, request, ...rest);
};
const { registerIpcHandlers } = require('../src/main/ipcHandlers.js');
const { registerAllowedPath } = require('../src/main/securityManager.js');
const rollbackManager = require('../src/main/rollbackManager.js');
const progressManager = require('../src/main/progressManager.js');
const { resetAll } = require('../src/main/ipcRateLimiter.js');
Module._load = originalLoad;

// Copies are all taken at once by the 64 workers, so 70 reads of the cancel flag stops a 200-file run part-way.
const appState = {
  cancelAfterReads: null,
  reads: 0,
  get batchCancelled() {
    return this.cancelAfterReads !== null && ++this.reads > this.cancelAfterReads;
  },
  resetBatchCancellation() { this.reads = 0; },
};
const handlers = new Map();
const event = { sender: { send: noop } };
const call = (name, arg) => {
  resetAll();
  return handlers.get(name)(event, arg);
};

beforeAll(() => {
  root = fs.mkdtempSync(path.join(process.cwd(), 'copy-undo-'));
  userDataDir = path.join(root, 'userData');
  fs.mkdirSync(userDataDir);
  registerIpcHandlers({ handle: (name, fn) => handlers.set(name, fn) }, fakeStore, () => ({}), appState);
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
  delete process.env.BATCH_HWID_BINDING_ENABLED;
});

beforeEach(async () => {
  await rollbackManager.clearHistory();
  rollbackManager.clearRollbackManifest();
  await rollbackManager.clearRollbackProgress();
  await progressManager.clearProgress();
  appState.cancelAfterReads = null;
});

function newJob(count) {
  const dir = path.join(root, `case-${caseCount++}`);
  const src = path.join(dir, 'src');
  const out = path.join(dir, 'out');
  fs.mkdirSync(src, { recursive: true });
  fs.mkdirSync(out);
  for (let i = 0; i < count; i++) fs.writeFileSync(path.join(src, `IMG_${String(i).padStart(4, '0')}.jpg`), `photo-${i}`);
  registerAllowedPath(src);
  registerAllowedPath(out);
  return { src, out };
}

const run = (job, mode, maxFilesPerBatch = 10) =>
  call('execute-batch', {
    folderPath: job.src,
    maxFilesPerBatch,
    outputPrefix: 'Run',
    mode,
    ...(mode === 'copy' ? { outputDir: job.out } : {}),
  });

const stoppedCopy = async (job) => {
  appState.cancelAfterReads = 70;
  const result = await run(job, 'copy');
  appState.cancelAfterReads = null;
  return result;
};

const copiesIn = (out) => fs.readdirSync(out, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .flatMap(d => fs.readdirSync(path.join(out, d.name)).map(f => path.join(out, d.name, f)));

describe('copy runs keep an undo record', () => {
  it('records a finished Copy run and Undo deletes its copies', async () => {
    const job = newJob(25);
    const result = await run(job, 'copy');
    expect(result.success, JSON.stringify(result)).toBe(true);

    const history = await call('get-operation-history');
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ mode: 'copy', totalFiles: 25 });
    expect((await call('check-rollback-available')).mode).toBe('copy');

    const undo = await call('rollback-batch');
    expect(undo).toMatchObject({ success: true, mode: 'copy', restoredFiles: 25 });
    expect(fs.readdirSync(job.out)).toHaveLength(0);
    expect(fs.readdirSync(job.src)).toHaveLength(25);
  });

  it('records a stopped Copy run with only the files it copied, and Undo clears its resume offer', async () => {
    const job = newJob(200);
    const result = await stoppedCopy(job);
    expect(result.cancelled).toBe(true);
    expect(result.filesProcessed).toBeLessThan(result.totalFiles);
    expect(await call('check-interrupted-progress')).not.toBeNull();

    const present = copiesIn(job.out);
    const history = await call('get-operation-history');
    expect(history).toHaveLength(1);
    expect(history[0].totalFiles).toBe(present.length);
    expect(rollbackManager.getRollbackManifest().operations.map(o => o.currentPath).sort()).toEqual([...present].sort());
    for (const r of history[0].batchResults) {
      expect(r.fileCount).toBe(fs.readdirSync(path.join(job.out, r.folder)).length);
    }
    expect(history[0].batchResults.reduce((n, r) => n + r.fileCount, 0)).toBe(present.length);

    const undo = await call('rollback-batch');
    expect(undo.success, JSON.stringify(undo)).toBe(true);
    expect(fs.readdirSync(job.out)).toHaveLength(0);
    expect(await call('check-interrupted-progress')).toBeNull();
  });

  it('leaves a newer run\'s resume record alone when an older stopped run is undone', async () => {
    const older = newJob(200);
    await stoppedCopy(older);
    const olderEntry = (await call('get-operation-history'))[0];
    const newer = newJob(200);
    await stoppedCopy(newer);

    const undo = await call('rollback-history-entry', olderEntry.operationId);
    expect(undo.success, JSON.stringify(undo)).toBe(true);
    const pending = await call('check-interrupted-progress');
    expect(pending.folderPath).toBe(newer.src);
  });

  it('keeps one History entry for a stopped Copy run that was resumed, and Undo removes every copy', async () => {
    const job = newJob(200);
    await stoppedCopy(job);
    const stoppedEntry = (await call('get-operation-history'))[0];

    const resumed = await call('resume-batch');
    expect(resumed).toMatchObject({ success: true, mode: 'copy' });
    const history = await call('get-operation-history');
    expect(history).toHaveLength(1);
    expect(history[0].operationId).not.toBe(stoppedEntry.operationId);
    expect(history[0].totalFiles).toBe(200);
    expect(copiesIn(job.out)).toHaveLength(200);

    const undo = await call('rollback-batch');
    expect(undo).toMatchObject({ success: true, restoredFiles: 200 });
    expect(fs.readdirSync(job.out)).toHaveLength(0);
  });

  it('keeps the stopped run\'s History entry when the resumed run\'s record fails to save', async () => {
    const job = newJob(200);
    await stoppedCopy(job);
    const stoppedEntry = (await call('get-operation-history'))[0];

    const realWrite = fs.promises.writeFile;
    let failed = false;
    const spy = vi.spyOn(fs.promises, 'writeFile').mockImplementation((file, ...rest) => {
      if (!failed && String(file).includes('batch-history')) {
        failed = true;
        return Promise.reject(new Error('disk full'));
      }
      return realWrite.call(fs.promises, file, ...rest);
    });
    try {
      const resumed = await call('resume-batch');
      expect(resumed.success).toBe(true);
    } finally {
      spy.mockRestore();
    }
    expect(failed).toBe(true);
    const history = await call('get-operation-history');
    expect(history.map(e => e.operationId)).toEqual([stoppedEntry.operationId]);
  });

  it('still saves a record for a finished Move and none for a cancelled Move', async () => {
    const finished = newJob(5);
    expect((await run(finished, 'move')).success).toBe(true);
    const history = await call('get-operation-history');
    expect(history).toHaveLength(1);
    expect(history[0].mode).toBe('move');
    expect((await call('check-rollback-available')).mode).toBe('move');

    await rollbackManager.clearHistory();
    const cancelled = newJob(250);
    appState.cancelAfterReads = 1;
    const result = await run(cancelled, 'move', 100);
    appState.cancelAfterReads = null;
    expect(result.cancelled).toBe(true);
    expect(await call('get-operation-history')).toHaveLength(0);
  });

  it('saves one record covering the whole job for a resumed Move', async () => {
    const job = newJob(250);
    appState.cancelAfterReads = 1;
    const stopped = await run(job, 'move', 100);
    appState.cancelAfterReads = null;
    expect(stopped.cancelled).toBe(true);

    const resumed = await call('resume-batch');
    expect(resumed).toMatchObject({ success: true, mode: 'move' });
    const history = await call('get-operation-history');
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ mode: 'move', totalFiles: 250 });
  });

  it('does not offer Undo of an older run after a Copy run stopped before its first file', async () => {
    const first = newJob(5);
    await run(first, 'move');
    expect(await call('check-rollback-available')).not.toBeNull();

    const second = newJob(20);
    appState.cancelAfterReads = 0;
    const result = await run(second, 'copy');
    appState.cancelAfterReads = null;
    expect(result.cancelled).toBe(true);
    expect(await call('check-rollback-available')).toBeNull();
  });
});
