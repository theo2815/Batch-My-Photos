/**
 * Tests for src/main/ipcRateLimiter.js
 *
 * Tests the sliding-window rate limiting logic that protects IPC channels
 * from abuse. Re-implements the core logic without Electron dependency.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

// ============================================================================
// RE-IMPLEMENT RATE LIMITER LOGIC FOR ISOLATED TESTING
// ============================================================================

const TIERS = {
  STRICT:  { maxCalls:  3,  windowMs: 10_000 },
  NORMAL:  { maxCalls: 30,  windowMs: 10_000 },
  RELAXED: { maxCalls: 60,  windowMs: 10_000 },
};

const CHANNEL_TIERS = {
  'execute-batch':          'STRICT',
  'rollback-batch':         'STRICT',
  'rollback-history-entry': 'STRICT',
  'resume-batch':           'STRICT',
  'resume-rollback':        'STRICT',
  'clear-operation-history':'STRICT',
  'export-batch-report':    'STRICT',
  'export-history-report':  'STRICT',
  'analyze-blur':           'STRICT',
  'get-theme':              'RELAXED',
  'set-theme':              'RELAXED',
  'get-presets':            'RELAXED',
  'get-recent-folders':     'RELAXED',
  'check-rollback-available': 'RELAXED',
  'auth-check-status':      'RELAXED',
  'auth-get-session':       'RELAXED',
  'check-interrupted-progress': 'RELAXED',
  'check-interrupted-rollback': 'RELAXED',
  'check-app-version':      'RELAXED',
  'open-store-url':          'RELAXED',
  'get-operation-history':  'RELAXED',
  'cancel-batch':           'RELAXED',
};

let counters;

function resetAll() {
  counters = new Map();
}

function checkLimit(channel, nowOverride) {
  const tierName = CHANNEL_TIERS[channel] || 'NORMAL';
  const tier = TIERS[tierName];
  const now = nowOverride ?? Date.now();
  const windowStart = now - tier.windowMs;

  if (!counters.has(channel)) {
    counters.set(channel, { timestamps: [] });
  }

  const entry = counters.get(channel);
  entry.timestamps = entry.timestamps.filter(t => t > windowStart);

  if (entry.timestamps.length >= tier.maxCalls) {
    const retryAfterMs = entry.timestamps[0] + tier.windowMs - now;
    return { allowed: false, retryAfterMs };
  }

  entry.timestamps.push(now);
  return { allowed: true };
}

// ============================================================================
// TESTS
// ============================================================================

describe('IPC Rate Limiter', () => {
  beforeEach(() => {
    resetAll();
  });

  describe('Tier configuration', () => {
    it('has three defined tiers', () => {
      expect(Object.keys(TIERS)).toEqual(['STRICT', 'NORMAL', 'RELAXED']);
    });

    it('STRICT is the most restrictive', () => {
      expect(TIERS.STRICT.maxCalls).toBeLessThan(TIERS.NORMAL.maxCalls);
      expect(TIERS.NORMAL.maxCalls).toBeLessThan(TIERS.RELAXED.maxCalls);
    });

    it('all tiers have positive maxCalls and windowMs', () => {
      for (const [name, tier] of Object.entries(TIERS)) {
        expect(tier.maxCalls).toBeGreaterThan(0);
        expect(tier.windowMs).toBeGreaterThan(0);
      }
    });
  });

  describe('Channel tier mapping', () => {
    it('maps execute-batch to STRICT', () => {
      expect(CHANNEL_TIERS['execute-batch']).toBe('STRICT');
    });

    it('maps rollback-batch to STRICT', () => {
      expect(CHANNEL_TIERS['rollback-batch']).toBe('STRICT');
    });

    it('maps get-theme to RELAXED', () => {
      expect(CHANNEL_TIERS['get-theme']).toBe('RELAXED');
    });

    it('unmapped channels default to NORMAL', () => {
      expect(CHANNEL_TIERS['scan-folder']).toBeUndefined();
      // In checkLimit, undefined maps to NORMAL by default
    });
  });

  describe('checkLimit - STRICT tier', () => {
    it('allows calls up to the STRICT limit', () => {
      const now = 1000000;
      for (let i = 0; i < TIERS.STRICT.maxCalls; i++) {
        const result = checkLimit('execute-batch', now + i);
        expect(result.allowed).toBe(true);
      }
    });

    it('blocks the call after reaching the STRICT limit', () => {
      const now = 1000000;
      for (let i = 0; i < TIERS.STRICT.maxCalls; i++) {
        checkLimit('execute-batch', now);
      }
      const blocked = checkLimit('execute-batch', now);
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfterMs).toBeGreaterThan(0);
    });

    it('allows calls again after the window expires', () => {
      const now = 1000000;
      for (let i = 0; i < TIERS.STRICT.maxCalls; i++) {
        checkLimit('execute-batch', now);
      }
      // After the window expires
      const afterWindow = now + TIERS.STRICT.windowMs + 1;
      const result = checkLimit('execute-batch', afterWindow);
      expect(result.allowed).toBe(true);
    });
  });

  describe('checkLimit - NORMAL tier (default)', () => {
    it('allows calls up to the NORMAL limit for unmapped channels', () => {
      const now = 1000000;
      for (let i = 0; i < TIERS.NORMAL.maxCalls; i++) {
        const result = checkLimit('scan-folder', now + i);
        expect(result.allowed).toBe(true);
      }
    });

    it('blocks after reaching the limit', () => {
      const now = 1000000;
      for (let i = 0; i < TIERS.NORMAL.maxCalls; i++) {
        checkLimit('scan-folder', now);
      }
      const blocked = checkLimit('scan-folder', now);
      expect(blocked.allowed).toBe(false);
    });
  });

  describe('checkLimit - RELAXED tier', () => {
    it('allows many more calls than STRICT', () => {
      const now = 1000000;
      for (let i = 0; i < TIERS.RELAXED.maxCalls; i++) {
        const result = checkLimit('get-theme', now + i);
        expect(result.allowed).toBe(true);
      }
    });

    it('still blocks after limit', () => {
      const now = 1000000;
      for (let i = 0; i < TIERS.RELAXED.maxCalls; i++) {
        checkLimit('get-theme', now);
      }
      const blocked = checkLimit('get-theme', now);
      expect(blocked.allowed).toBe(false);
    });
  });

  describe('Sliding window behavior', () => {
    it('prunes old timestamps outside the window', () => {
      const now = 1000000;
      // Fill up the limit
      for (let i = 0; i < TIERS.STRICT.maxCalls; i++) {
        checkLimit('execute-batch', now);
      }
      // Blocked immediately
      expect(checkLimit('execute-batch', now).allowed).toBe(false);

      // Half the window later — first call is still in window
      const halfWindow = now + TIERS.STRICT.windowMs / 2;
      expect(checkLimit('execute-batch', halfWindow).allowed).toBe(false);

      // Just past the window — first call is pruned, slot opens
      const pastWindow = now + TIERS.STRICT.windowMs + 1;
      expect(checkLimit('execute-batch', pastWindow).allowed).toBe(true);
    });

    it('returns correct retryAfterMs', () => {
      const now = 1000000;
      for (let i = 0; i < TIERS.STRICT.maxCalls; i++) {
        checkLimit('execute-batch', now);
      }
      const blocked = checkLimit('execute-batch', now + 1000);
      expect(blocked.allowed).toBe(false);
      // First timestamp was at `now`, so retry after (now + windowMs - (now+1000))
      expect(blocked.retryAfterMs).toBe(TIERS.STRICT.windowMs - 1000);
    });
  });

  describe('Channel isolation', () => {
    it('limits are tracked per channel independently', () => {
      const now = 1000000;
      // Max out execute-batch (STRICT)
      for (let i = 0; i < TIERS.STRICT.maxCalls; i++) {
        checkLimit('execute-batch', now);
      }
      expect(checkLimit('execute-batch', now).allowed).toBe(false);

      // A different channel should still be allowed
      const result = checkLimit('scan-folder', now);
      expect(result.allowed).toBe(true);
    });

    it('two STRICT channels have independent counters', () => {
      const now = 1000000;
      for (let i = 0; i < TIERS.STRICT.maxCalls; i++) {
        checkLimit('execute-batch', now);
      }
      // rollback-batch is also STRICT but its own counter
      const result = checkLimit('rollback-batch', now);
      expect(result.allowed).toBe(true);
    });
  });

  describe('resetAll', () => {
    it('clears all counters', () => {
      const now = 1000000;
      for (let i = 0; i < TIERS.STRICT.maxCalls; i++) {
        checkLimit('execute-batch', now);
      }
      expect(checkLimit('execute-batch', now).allowed).toBe(false);

      resetAll();
      expect(checkLimit('execute-batch', now).allowed).toBe(true);
    });
  });
});

// ============================================================================
// SENDER CHECK (real modules, loaded in vm)
// ============================================================================

const root = path.resolve(import.meta.dirname, '..');
const logger = { log() {}, warn() {}, error() {} };
const windowManager = { isAppUrl: url => url === 'file:///app/dist/index.html' };
function load(file, mocks) {
  const filename = path.join(root, file);
  const nativeRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, __dirname: path.dirname(filename),
    require: name => Object.hasOwn(mocks, name) ? mocks[name] : nativeRequire(name),
    process, console, setTimeout, clearTimeout,
  }, { filename });
  return module.exports;
}
const appEvent = { senderFrame: { url: 'file:///app/dist/index.html' } };
const foreignEvents = [
  ['a foreign page', { senderFrame: { url: 'file:///C:/Downloads/evil.html' } }],
  ['a frame that has gone', { senderFrame: null }],
  ['no frame at all', {}],
];

describe('rateLimitedHandle sender check', () => {
  function register() {
    const handlers = new Map();
    const inner = vi.fn(async () => 'answer');
    const limiter = load('src/main/ipcRateLimiter.js', { '../utils/logger': logger, './windowManager': windowManager });
    limiter.rateLimitedHandle({ handle: (name, fn) => handlers.set(name, fn) }, 'get-theme', inner);
    return { handler: handlers.get('get-theme'), inner };
  }

  it('answers the app\'s own page', async () => {
    const { handler, inner } = register();
    await expect(handler(appEvent, 'arg')).resolves.toBe('answer');
    expect(inner).toHaveBeenCalledWith(appEvent, 'arg');
  });

  it.each(foreignEvents)('refuses %s', async (_, event) => {
    const { handler, inner } = register();
    await expect(handler(event)).rejects.toThrow(/FORBIDDEN/);
    expect(inner).not.toHaveBeenCalled();
  });
});

describe('updateManager sender check', () => {
  function register(blurBeta) {
    const handlers = new Map();
    const updater = { on: vi.fn(), checkForUpdates: vi.fn(async () => {}), downloadUpdate: vi.fn(), quitAndInstall: vi.fn() };
    load('src/main/updateManager.js', {
      './config': { features: { BLUR_BETA_ENABLED: blurBeta } }, '../utils/logger': logger,
      './windowManager': windowManager, 'electron-updater': { autoUpdater: updater },
      electron: { app: { isPackaged: false }, ipcMain: { handle: (name, fn) => handlers.set(name, fn) } },
    }).initAutoUpdater(() => null);
    return { handlers, updater };
  }

  it('answers the app\'s own page', async () => {
    const { handlers, updater } = register(false);
    await expect(handlers.get('check-for-updates')(appEvent)).resolves.toEqual({ status: 'checking' });
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    await expect(register(true).handlers.get('check-for-updates')(appEvent)).resolves.toEqual({ status: 'disabled-beta' });
  });

  it.each(foreignEvents)('refuses %s', async (_, event) => {
    const { handlers, updater } = register(false);
    for (const name of ['check-for-updates', 'download-update', 'install-update']) {
      await expect(async () => handlers.get(name)(event)).rejects.toThrow(/FORBIDDEN/);
    }
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    const beta = register(true).handlers;
    for (const name of ['check-for-updates', 'download-update', 'install-update']) {
      await expect(async () => beta.get(name)(event)).rejects.toThrow(/FORBIDDEN/);
    }
  });
});
