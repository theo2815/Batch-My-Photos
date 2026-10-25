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

process.env.BATCH_BLUR_BETA_ENABLED = 'true';
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
  root = fs.mkdtempSync(path.join(process.cwd(), 'resume-batch-'));
  userDataDir = path.join(root, 'userData');
  fs.mkdirSync(userDataDir);
  registerIpcHandlers({ handle: (name, fn) => handlers.set(name, fn) }, fakeStore, () => ({}), appState);
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
  delete process.env.BATCH_BLUR_BETA_ENABLED;
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

const stoppedBlurCopy = async (job) => {
  appState.cancelAfterReads = 70;
  const result = await call('execute-batch', {
    folderPath: job.src, maxFilesPerBatch: 10, outputPrefix: 'Run', mode: 'copy', outputDir: job.out,
    blurryGroups: ['IMG_0000', 'IMG_0001'],
  });
  appState.cancelAfterReads = null;
  return result;
};

describe('a resumed batch still reports its _Blurry folder', () => {
  it('returns the blurry folder name and count when the resume finishes the work', async () => {
    const job = newJob(200);
    const stopped = await stoppedBlurCopy(job);
    expect(stopped.cancelled).toBe(true);
    expect(stopped.blurryFolderName).toBe('Run_Blurry');

    const resumed = await call('resume-batch');
    expect(resumed).toMatchObject({ success: true, blurryFolderName: 'Run_Blurry', blurryFileCount: 2 });
    expect(resumed.batchesCreated).toBe(stopped.batchesCreated);
  });

  it('returns them too when every file was already in place', async () => {
    const job = newJob(200);
    await stoppedBlurCopy(job);
    for (const op of (await progressManager.loadProgress()).operations) {
      fs.mkdirSync(path.dirname(op.destPath), { recursive: true });
      if (!fs.existsSync(op.destPath)) fs.copyFileSync(op.sourcePath, op.destPath);
    }

    const resumed = await call('resume-batch');
    expect(resumed).toMatchObject({ success: true, message: 'Operation was already complete', blurryFolderName: 'Run_Blurry', blurryFileCount: 2 });
  });

  it('still resumes an old progress file that has no blurry folder name', async () => {
    const job = newJob(1);
    const dest = path.join(job.out, 'Run_001', 'IMG_0000.jpg');
    fs.mkdirSync(path.dirname(dest));
    fs.copyFileSync(path.join(job.src, 'IMG_0000.jpg'), dest);
    await progressManager.startProgress({
      folderPath: job.src, outputDir: job.out, mode: 'copy', maxFilesPerBatch: 10, outputPrefix: 'Run', totalFiles: 1,
      allFileNames: ['IMG_0000.jpg'],
      operations: [{ fileName: 'IMG_0000.jpg', sourcePath: path.join(job.src, 'IMG_0000.jpg'), destPath: dest }],
      batchInfo: [{ folder: 'Run_001', fileCount: 1 }],
    });

    const resumed = await call('resume-batch');
    expect(resumed).toMatchObject({ success: true, batchesCreated: 1 });
    expect(resumed.blurryFolderName).toBeUndefined();
    expect(resumed.blurryFileCount).toBeUndefined();
  });
});
