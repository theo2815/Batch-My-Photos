/**
 * Tests for src/main/ipcRateLimiter.js
 *
 * Tests the sliding-window rate limiting logic that protects IPC channels
 * from abuse. Re-implements the core logic without Electron dependency.
 */

import { describe, it, expect, beforeEach } from 'vitest';

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
