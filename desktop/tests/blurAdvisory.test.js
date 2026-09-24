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
