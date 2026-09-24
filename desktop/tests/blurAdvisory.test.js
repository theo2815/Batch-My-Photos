import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
  './rollbackManager': { init: noop },
  './blurDetectionService': {},
};

process.env.BATCH_BLUR_BETA_ENABLED = 'true';
process.env.BATCH_HWID_BINDING_ENABLED = 'false';
process.env.BATCH_BLUR_DETECTION_ENABLED = 'false';
Module._load = function (request, ...rest) {
  return Object.hasOwn(stubs, request) ? stubs[request] : originalLoad.call(this, request, ...rest);
};
const { registerIpcHandlers } = require('../src/main/ipcHandlers.js');
const { registerAllowedPath } = require('../src/main/securityManager.js');
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
  it('keeps a flagged photo in an ordinary copy batch even if the renderer supplies its group', async () => {
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
    expect(result.blurryFileCount).toBe(0);
    expect(fs.existsSync(path.join(fixtureOutput, 'Beta_Blurry'))).toBe(false);
    expect(fs.existsSync(path.join(fixtureOutput, 'Beta_001', 'IMG.jpg'))).toBe(true);
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
      ipcRenderer: { invoke: (name, ...args) => handlers.get(name)({}, ...args) },
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
