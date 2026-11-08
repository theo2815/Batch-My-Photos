import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Module from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const originalLoad = Module._load;
const noop = () => {};
const logger = { log: noop, warn: noop, error: noop, time: noop, timeEnd: noop };
const stubs = {
  electron: { app: { isPackaged: false }, dialog: {}, shell: {} },
  '../utils/logger': logger,
  './authService': { getStoredSession: () => 'test-session' },
  './subscriptionService': {
    checkPendingTrackLimit: () => ({ blocked: false }),
    checkBatchLimit: async () => ({ canExecute: true }),
    flushPendingTracks: async () => {},
    trackBatchExecution: async () => ({ success: true }),
  },
  './deviceService': {},
  './progressManager': {
    startProgress: async () => {},
    addProcessedFiles: noop,
    saveProgressToDisk: async () => {},
    clearProgress: async () => {},
  },
  './rollbackManager': { init: noop, clearRollbackManifest: noop, saveRollbackManifest: async () => {} },
  './blurDetectionService': {},
  './windowManager': { isAppUrl: () => true },
};

process.env.BATCH_BLUR_BETA_ENABLED = 'true';
process.env.BATCH_HWID_BINDING_ENABLED = 'false';
process.env.BATCH_BLUR_DETECTION_ENABLED = 'false';
Module._load = function (request, ...rest) {
  return Object.hasOwn(stubs, request) ? stubs[request] : originalLoad.call(this, request, ...rest);
};
const { registerIpcHandlers } = require('../src/main/ipcHandlers.js');
const { registerAllowedPath } = require('../src/main/securityManager.js');
const { resetAll } = require('../src/main/ipcRateLimiter.js');
Module._load = originalLoad;

let fixtureRoot;
let fixtureFolder;
let fixtureOutput;

beforeAll(() => {
  fixtureRoot = fs.mkdtempSync(path.join(process.cwd(), 'blur-advisory-'));
  fixtureFolder = path.join(fixtureRoot, 'photos');
  fixtureOutput = path.join(fixtureRoot, 'output');
  fs.mkdirSync(fixtureFolder);
  fs.mkdirSync(fixtureOutput);
  fs.writeFileSync(path.join(fixtureFolder, 'IMG.jpg'), 'photo');
  registerAllowedPath(fixtureFolder);
  registerAllowedPath(fixtureOutput);
});

afterAll(() => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  delete process.env.BATCH_BLUR_BETA_ENABLED;
  delete process.env.BATCH_HWID_BINDING_ENABLED;
  delete process.env.BATCH_BLUR_DETECTION_ENABLED;
});

describe('beta batch safety', () => {
  beforeEach(resetAll);

  it('copies a flagged photo into <prefix>_Blurry in beta mode', async () => {
    const handlers = new Map();
    const ipcMain = { handle: (name, fn) => handlers.set(name, fn) };
    registerIpcHandlers(ipcMain, {}, () => ({}), {
      batchCancelled: false,
      resetBatchCancellation: noop,
    });
    const event = { sender: { send: noop } };
    const result = await handlers.get('execute-batch')(event, {
      folderPath: fixtureFolder,
      maxFilesPerBatch: 10,
      outputPrefix: 'Beta',
      mode: 'copy',
      outputDir: fixtureOutput,
      blurryGroups: ['IMG'],
    });

    expect(result.success, JSON.stringify(result)).toBe(true);
    expect(result.blurryFileCount).toBe(1);
    expect(fs.existsSync(path.join(fixtureOutput, 'Beta_Blurry', 'IMG.jpg'))).toBe(true);
    expect(fs.existsSync(path.join(fixtureOutput, 'Beta_001', 'IMG.jpg'))).toBe(false);
  });

  it('moves a flagged photo into <prefix>_Blurry and records it for Undo', async () => {
    const source = path.join(fixtureRoot, 'move-source');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'SHARP.jpg'), 'photo');
    fs.writeFileSync(path.join(source, 'BLUR.jpg'), 'photo');
    registerAllowedPath(source);

    let manifest;
    stubs['./rollbackManager'].saveRollbackManifest = async arg => { manifest = arg; };

    try {
      const handlers = new Map();
      registerIpcHandlers({ handle: (name, fn) => handlers.set(name, fn) }, {}, () => ({}), {
        batchCancelled: false,
        resetBatchCancellation: noop,
      });
      const result = await handlers.get('execute-batch')({ sender: { send: noop } }, {
        folderPath: source,
        maxFilesPerBatch: 10,
        outputPrefix: 'Mv',
        mode: 'move',
        blurryGroups: ['BLUR'],
      });

      expect(result.success, JSON.stringify(result)).toBe(true);
      expect(fs.existsSync(path.join(source, 'Mv_Blurry', 'BLUR.jpg'))).toBe(true);
      expect(fs.existsSync(path.join(source, 'Mv_001', 'SHARP.jpg'))).toBe(true);
      expect(fs.existsSync(path.join(source, 'BLUR.jpg'))).toBe(false);
      const blurOp = manifest.operations.find(op => op.fileName === 'BLUR.jpg');
      expect(blurOp.destPath).toBe(path.join(source, 'Mv_Blurry', 'BLUR.jpg'));
    } finally {
      delete stubs['./rollbackManager'].saveRollbackManifest;
    }
  });

  it.each(['move', 'copy'])('refuses a %s run that would overwrite files in an existing batch or _Blurry folder', async mode => {
    const source = path.join(fixtureRoot, `clash-${mode}`);
    const out = path.join(source, 'out');
    const dest = mode === 'copy' ? out : source;
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(source, 'A.jpg'), 'photo');
    fs.writeFileSync(path.join(source, 'B.jpg'), 'photo');
    fs.mkdirSync(path.join(dest, 'Mv_001'));
    fs.mkdirSync(path.join(dest, 'Mv_Blurry'));
    fs.writeFileSync(path.join(dest, 'Mv_001', 'A.jpg'), 'old-a');
    fs.writeFileSync(path.join(dest, 'Mv_Blurry', 'B.jpg'), 'old-b');
    registerAllowedPath(source);
    registerAllowedPath(out);

    let saved = false;
    let cleared = false;
    stubs['./rollbackManager'].saveRollbackManifest = async () => { saved = true; };
    stubs['./rollbackManager'].clearRollbackManifest = () => { cleared = true; };

    try {
      const handlers = new Map();
      registerIpcHandlers({ handle: (name, fn) => handlers.set(name, fn) }, {}, () => ({}), {
        batchCancelled: false,
        resetBatchCancellation: noop,
      });
      const result = await handlers.get('execute-batch')({ sender: { send: noop } }, {
        folderPath: source,
        maxFilesPerBatch: 10,
        outputPrefix: 'Mv',
        mode,
        outputDir: mode === 'copy' ? out : null,
        blurryGroups: ['B'],
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Mv_001|Mv_Blurry/);
      expect(result.error).toMatch(/A\.jpg|B\.jpg/);
      expect(result.error).toBe('Mv_001 already has 1 file with the same name (for example A.jpg). Choose another folder name.');
      expect(fs.readFileSync(path.join(dest, 'Mv_001', 'A.jpg'), 'utf8')).toBe('old-a');
      expect(fs.readFileSync(path.join(dest, 'Mv_Blurry', 'B.jpg'), 'utf8')).toBe('old-b');
      expect(fs.existsSync(path.join(source, 'A.jpg'))).toBe(true);
      expect(fs.existsSync(path.join(source, 'B.jpg'))).toBe(true);
      expect(saved).toBe(false);
      expect(cleared).toBe(false);
    } finally {
      delete stubs['./rollbackManager'].saveRollbackManifest;
      stubs['./rollbackManager'].clearRollbackManifest = noop;
    }
  });

  it('refuses a run when only the _Blurry folder already has a same-name file', async () => {
    const source = path.join(fixtureRoot, 'clash-blurry-only');
    fs.mkdirSync(path.join(source, 'Mv_Blurry'), { recursive: true });
    fs.writeFileSync(path.join(source, 'A.jpg'), 'photo');
    fs.writeFileSync(path.join(source, 'B.jpg'), 'photo');
    fs.writeFileSync(path.join(source, 'Mv_Blurry', 'B.jpg'), 'old-b');
    registerAllowedPath(source);
    let saved = false;
    let cleared = false;
    stubs['./rollbackManager'].saveRollbackManifest = async () => { saved = true; };
    stubs['./rollbackManager'].clearRollbackManifest = () => { cleared = true; };

    try {
      const handlers = new Map();
      registerIpcHandlers({ handle: (name, fn) => handlers.set(name, fn) }, {}, () => ({}), {
        batchCancelled: false,
        resetBatchCancellation: noop,
      });
      const result = await handlers.get('execute-batch')({ sender: { send: noop } }, {
        folderPath: source,
        maxFilesPerBatch: 10,
        outputPrefix: 'Mv',
        mode: 'move',
        blurryGroups: ['B'],
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Mv_Blurry already has 1 file with the same name (for example B.jpg). Choose another folder name.');
      expect(fs.readFileSync(path.join(source, 'Mv_Blurry', 'B.jpg'), 'utf8')).toBe('old-b');
      expect(fs.existsSync(path.join(source, 'A.jpg'))).toBe(true);
      expect(fs.existsSync(path.join(source, 'B.jpg'))).toBe(true);
      expect(fs.existsSync(path.join(source, 'Mv_001'))).toBe(false);
      expect(saved).toBe(false);
      expect(cleared).toBe(false);
    } finally {
      delete stubs['./rollbackManager'].saveRollbackManifest;
      stubs['./rollbackManager'].clearRollbackManifest = noop;
    }
  });

  it('does not refuse a run when the existing batch folder is empty', async () => {
    const source = path.join(fixtureRoot, 'empty-existing');
    fs.mkdirSync(path.join(source, 'Mv_001'), { recursive: true });
    fs.writeFileSync(path.join(source, 'A.jpg'), 'photo');
    registerAllowedPath(source);
    stubs['./rollbackManager'].saveRollbackManifest = async () => {};

    try {
      const handlers = new Map();
      registerIpcHandlers({ handle: (name, fn) => handlers.set(name, fn) }, {}, () => ({}), {
        batchCancelled: false,
        resetBatchCancellation: noop,
      });
      const result = await handlers.get('execute-batch')({ sender: { send: noop } }, {
        folderPath: source,
        maxFilesPerBatch: 10,
        outputPrefix: 'Mv',
        mode: 'move',
      });

      expect(result.success, JSON.stringify(result)).toBe(true);
      expect(fs.existsSync(path.join(source, 'Mv_001', 'A.jpg'))).toBe(true);
    } finally {
      delete stubs['./rollbackManager'].saveRollbackManifest;
    }
  });

  it('makes a completed move visible in History before returning its result', async () => {
    const source = path.join(fixtureRoot, 'history-source');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'HISTORY.jpg'), 'photo');
    registerAllowedPath(source);

    const history = [];
    let saveStarted;
    let finishSave;
    const started = new Promise(resolve => { saveStarted = resolve; });
    const save = new Promise(resolve => { finishSave = resolve; });
    stubs['./rollbackManager'].saveRollbackManifest = async () => {
      saveStarted();
      await save;
      history.push({ operationId: 'saved-move' });
    };
    stubs['./rollbackManager'].getOperationHistory = () => history;

    try {
      const handlers = new Map();
      registerIpcHandlers({ handle: (name, fn) => handlers.set(name, fn) }, {}, () => ({}), {
        batchCancelled: false,
        resetBatchCancellation: noop,
      });
      const event = { sender: { send: noop } };
      const pending = handlers.get('execute-batch')(event, {
        folderPath: source,
        maxFilesPerBatch: 10,
        outputPrefix: 'History',
        mode: 'move',
      });

      await started;
      const first = await Promise.race([
        pending.then(() => 'completed'),
        new Promise(resolve => setImmediate(() => resolve('waiting'))),
      ]);
      expect(first).toBe('waiting');

      finishSave();
      expect((await pending).success).toBe(true);
      expect(await handlers.get('get-operation-history')()).toEqual([{ operationId: 'saved-move' }]);
    } finally {
      finishSave();
      delete stubs['./rollbackManager'].saveRollbackManifest;
      delete stubs['./rollbackManager'].getOperationHistory;
    }
  });
});

describe('blur beta flag bridge', () => {
  it('preserves the boolean availability call and reports beta details when requested', async () => {
    const handlers = new Map();
    registerIpcHandlers({ handle: (name, fn) => handlers.set(name, fn) }, {}, () => ({}), {
      batchCancelled: false,
      resetBatchCancellation: noop,
    });
    let api;
    const electron = {
      contextBridge: { exposeInMainWorld: (_name, exposed) => { api = exposed; } },
      ipcRenderer: { invoke: (name, ...args) => handlers.get(name)({}, ...args), on() {} },
    };
    const original = Module._load;
    Module._load = function (request, ...rest) {
      return request === 'electron' ? electron : original.call(this, request, ...rest);
    };
    try {
      require('../preload.js');
    } finally {
      Module._load = original;
    }

    expect(await api.getBlurDetectionEnabled()).toBe(false);
    expect(await api.getBlurDetectionEnabled(true)).toEqual({ enabled: false, betaEnabled: true });
  });
});
