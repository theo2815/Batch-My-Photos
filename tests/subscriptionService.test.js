/**
 * Tests for src/main/subscriptionService.js
 *
 * Covers:
 * - Fix #4: Offline subscription bypass hardening
 *   • Clock-tampering detection (monotonic high-water mark)
 *   • Reduced 3-day cache staleness window
 *   • Offline batch count cap (10 batches)
 *
 * - Fix #5: Pending batch-tracking queue
 *   • Enqueue on failure, flush on success
 *   • Block execution when too many pending tracks
 *   • Queue persistence and draining
 *
 * Re-implements the pure logic from subscriptionService.js to avoid
 * the Electron dependency (same pattern as securityManager.test.js
 * and ipcRateLimiter.test.js).
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ============================================================================
// CONSTANTS (must match subscriptionService.js)
// ============================================================================

const FREE_LIMIT = 2;
const CACHE_STALE_DAYS = 3;
const MAX_OFFLINE_BATCHES = 10;
const MAX_PENDING_TRACKS = 5;
const FLUSH_TIMEOUT_MS = 5_000;
const API_TIMEOUT_MS = 8_000;
const CACHE_FRESH_MS = 120_000;

// ============================================================================
// IN-MEMORY STORES (simulate SecureStore)
// ============================================================================

let cacheStore = {};
let queueStore = {};

function _readSecureCache() {
  return cacheStore.state ? JSON.parse(JSON.stringify(cacheStore.state)) : null;
}

function _writeSecureCache(state) {
  cacheStore.state = JSON.parse(JSON.stringify(state));
}

function _readPendingQueue() {
  return queueStore.queue ? JSON.parse(JSON.stringify(queueStore.queue)) : [];
}

function _writePendingQueue(queue) {
  queueStore.queue = JSON.parse(JSON.stringify(queue));
}

// ============================================================================
// RE-IMPLEMENT PURE LOGIC (from subscriptionService.js)
// ============================================================================

function _cacheSubscriptionState(data) {
  const now = Date.now();
  const state = {
    lastVerifiedAt: now,
    highWaterMark: now,
    offlineBatches: 0,
    canExecute: data.canExecute,
    isPro: data.isPro || false,
    expiresAt: data.expiresAt || null,
    usage: data.usage || { used: 0, limit: FREE_LIMIT, remaining: FREE_LIMIT },
  };
  _writeSecureCache(state);
}

function _incrementCachedUsage(batchCount) {
  const state = _readSecureCache();
  if (!state) return;

  const usage = state.usage || { used: 0, limit: FREE_LIMIT, remaining: FREE_LIMIT };
  usage.used += batchCount;
  usage.remaining = Math.max(0, (usage.limit === null ? Infinity : usage.limit) - usage.used);
  state.usage = usage;
  state.offlineBatches = (state.offlineBatches || 0) + batchCount;
  const now = Date.now();
  state.highWaterMark = Math.max(state.highWaterMark || 0, now);
  _writeSecureCache(state);
}

function _enforceFromCache() {
  const state = _readSecureCache();

  if (!state || !state.lastVerifiedAt || !state.usage) {
    return {
      canExecute: false,
      offline: true,
      isPro: false,
      error: 'Please connect to the internet to verify your subscription before running your first batch.',
    };
  }

  const now = Date.now();

  // Clock-tampering detection
  const highWaterMark = state.highWaterMark || state.lastVerifiedAt;
  if (now < highWaterMark - 60_000) {
    const rewindMinutes = Math.floor((highWaterMark - now) / 60_000);
    return {
      canExecute: false,
      offline: true,
      clockTampered: true,
      error: 'System clock appears to have been set back. Please connect to the internet to re-verify your subscription.',
    };
  }

  // Update high-water mark
  if (now > highWaterMark) {
    state.highWaterMark = now;
    _writeSecureCache(state);
  }

  // Cache staleness check
  const staleDays = (now - state.lastVerifiedAt) / (1000 * 60 * 60 * 24);
  if (staleDays > CACHE_STALE_DAYS) {
    return {
      canExecute: false,
      offline: true,
      error: `Subscription status is ${Math.floor(staleDays)} days old. Please connect to the internet to verify your plan.`,
    };
  }

  if (state.isPro) {
    if (state.expiresAt && new Date(state.expiresAt) < new Date()) {
      return {
        canExecute: false,
        offline: true,
        isPro: false,
        subscriptionExpired: true,
        error: 'Your Pro subscription has expired. Please connect to the internet to renew.',
      };
    }

    const offlineBatches = state.offlineBatches || 0;
    if (offlineBatches >= MAX_OFFLINE_BATCHES) {
      return {
        canExecute: false,
        offline: true,
        isPro: true,
        offlineLimitReached: true,
        error: `You've used ${offlineBatches} batches offline. Please connect to the internet to sync your usage and continue.`,
      };
    }

    return { canExecute: true, offline: true, isPro: true, usage: state.usage };
  }

  return {
    canExecute: false,
    offline: true,
    isPro: false,
    freeOffline: true,
    error: 'You need an internet connection to run batches on the Free plan. Connect to Wi-Fi and try again, or upgrade to Pro for offline batching.',
  };
}

function _enqueuePendingTrack(batchCount) {
  const queue = _readPendingQueue();
  queue.push({ batchCount, timestamp: Date.now() });
  _writePendingQueue(queue);
}

function checkPendingTrackLimit() {
  const queue = _readPendingQueue();
  return {
    blocked: queue.length >= MAX_PENDING_TRACKS,
    pending: queue.length,
  };
}

// ============================================================================
// FIX #4 — OFFLINE BYPASS HARDENING
// ============================================================================

describe('Fix #4: Offline subscription bypass hardening', () => {
  beforeEach(() => {
    cacheStore = {};
    queueStore = {};
  });

  // ── Constants ────────────────────────────────────────────────────────────

  describe('Security constants', () => {
    it('grace period is 3 days (reduced from 7)', () => {
      expect(CACHE_STALE_DAYS).toBe(3);
    });

    it('offline batch cap is 10', () => {
      expect(MAX_OFFLINE_BATCHES).toBe(10);
    });

    it('flush timeout is 5 seconds', () => {
      expect(FLUSH_TIMEOUT_MS).toBe(5_000);
    });

    it('API timeout is 8 seconds', () => {
      expect(API_TIMEOUT_MS).toBe(8_000);
    });

    it('in-memory cache TTL is 2 minutes', () => {
      expect(CACHE_FRESH_MS).toBe(120_000);
    });
  });

  // ── Clock-tampering detection ──────────────────────────────────────────

  describe('Clock-tampering detection', () => {
    it('blocks execution when system clock is rewound past high-water mark', () => {
      const now = Date.now();
      _writeSecureCache({
        lastVerifiedAt: now - 60_000,
        highWaterMark: now + 300_000,   // 5 min in the "future" (user set clock back)
        offlineBatches: 0,
        canExecute: true,
        isPro: true,
        expiresAt: null,
        usage: { used: 0, limit: null, remaining: Infinity },
      });

      const result = _enforceFromCache();
      expect(result.canExecute).toBe(false);
      expect(result.clockTampered).toBe(true);
      expect(result.error).toMatch(/clock/i);
    });

    it('allows minor drift up to 60 seconds without flagging', () => {
      const now = Date.now();
      _writeSecureCache({
        lastVerifiedAt: now - 60_000,
        highWaterMark: now + 30_000,    // 30s ahead — within tolerance
        offlineBatches: 0,
        canExecute: true,
        isPro: true,
        expiresAt: null,
        usage: { used: 0, limit: null, remaining: Infinity },
      });

      const result = _enforceFromCache();
      expect(result.canExecute).toBe(true);
      expect(result.clockTampered).toBeUndefined();
    });

    it('updates high-water mark when time advances', () => {
      const now = Date.now();
      _writeSecureCache({
        lastVerifiedAt: now - 60_000,
        highWaterMark: now - 120_000,   // 2 min ago — current time is ahead
        offlineBatches: 0,
        canExecute: true,
        isPro: true,
        expiresAt: null,
        usage: { used: 0, limit: null, remaining: Infinity },
      });

      _enforceFromCache();

      const state = _readSecureCache();
      // high-water mark should be updated to ≈ now
      expect(state.highWaterMark).toBeGreaterThan(now - 120_000);
    });
  });

  // ── Reduced cache staleness ────────────────────────────────────────────

  describe('Cache staleness (3-day window)', () => {
    it('blocks Pro users after 3 days offline', () => {
      const threeDaysAgo = Date.now() - (3.1 * 24 * 60 * 60 * 1000);
      _writeSecureCache({
        lastVerifiedAt: threeDaysAgo,
        highWaterMark: threeDaysAgo,
        offlineBatches: 0,
        canExecute: true,
        isPro: true,
        expiresAt: null,
        usage: { used: 0, limit: null, remaining: Infinity },
      });

      const result = _enforceFromCache();
      expect(result.canExecute).toBe(false);
      expect(result.offline).toBe(true);
      expect(result.error).toMatch(/days old/);
    });

    it('allows Pro users within 3-day window', () => {
      const oneDayAgo = Date.now() - (1 * 24 * 60 * 60 * 1000);
      _writeSecureCache({
        lastVerifiedAt: oneDayAgo,
        highWaterMark: oneDayAgo,
        offlineBatches: 0,
        canExecute: true,
        isPro: true,
        expiresAt: null,
        usage: { used: 0, limit: null, remaining: Infinity },
      });

      const result = _enforceFromCache();
      expect(result.canExecute).toBe(true);
      expect(result.isPro).toBe(true);
    });
  });

  // ── Offline batch count cap ────────────────────────────────────────────

  describe('Offline batch count cap', () => {
    it('blocks Pro users after 10 offline batches', () => {
      _writeSecureCache({
        lastVerifiedAt: Date.now() - 60_000,
        highWaterMark: Date.now() - 60_000,
        offlineBatches: 10,
        canExecute: true,
        isPro: true,
        expiresAt: null,
        usage: { used: 10, limit: null, remaining: Infinity },
      });

      const result = _enforceFromCache();
      expect(result.canExecute).toBe(false);
      expect(result.offlineLimitReached).toBe(true);
      expect(result.error).toMatch(/10.*batches offline/i);
    });

    it('allows Pro users under 10 offline batches', () => {
      _writeSecureCache({
        lastVerifiedAt: Date.now() - 60_000,
        highWaterMark: Date.now() - 60_000,
        offlineBatches: 9,
        canExecute: true,
        isPro: true,
        expiresAt: null,
        usage: { used: 9, limit: null, remaining: Infinity },
      });

      const result = _enforceFromCache();
      expect(result.canExecute).toBe(true);
    });

    it('_incrementCachedUsage increases offlineBatches', () => {
      _writeSecureCache({
        lastVerifiedAt: Date.now() - 60_000,
        highWaterMark: Date.now() - 60_000,
        offlineBatches: 3,
        canExecute: true,
        isPro: true,
        expiresAt: null,
        usage: { used: 3, limit: null, remaining: Infinity },
      });

      _incrementCachedUsage(2);

      const state = _readSecureCache();
      expect(state.offlineBatches).toBe(5);
      expect(state.usage.used).toBe(5);
    });
  });

  // ── Cache reset on successful API contact ──────────────────────────────

  describe('Cache reset on successful verification', () => {
    it('_cacheSubscriptionState resets offlineBatches to 0', () => {
      _writeSecureCache({
        lastVerifiedAt: Date.now() - 100_000,
        highWaterMark: Date.now() - 100_000,
        offlineBatches: 8,
        canExecute: true,
        isPro: true,
        expiresAt: null,
        usage: { used: 8, limit: null, remaining: Infinity },
      });

      _cacheSubscriptionState({
        canExecute: true,
        isPro: true,
        expiresAt: null,
        usage: { used: 12, limit: null, remaining: Infinity },
      });

      const state = _readSecureCache();
      expect(state.offlineBatches).toBe(0);
      expect(state.highWaterMark).toBeGreaterThan(Date.now() - 1000);
    });
  });

  // ── Existing offline policies (regression tests) ──────────────────────

  describe('Existing offline policies', () => {
    it('requires internet on first-ever run (no cache)', () => {
      const result = _enforceFromCache();
      expect(result.canExecute).toBe(false);
      expect(result.offline).toBe(true);
    });

    it('blocks free users entirely when offline', () => {
      _writeSecureCache({
        lastVerifiedAt: Date.now() - 60_000,
        highWaterMark: Date.now() - 60_000,
        offlineBatches: 0,
        canExecute: true,
        isPro: false,
        expiresAt: null,
        usage: { used: 0, limit: 2, remaining: 2 },
      });

      const result = _enforceFromCache();
      expect(result.canExecute).toBe(false);
      expect(result.freeOffline).toBe(true);
    });

    it('blocks Pro user with expired subscription offline', () => {
      const expired = new Date(Date.now() - 86400_000).toISOString();
      _writeSecureCache({
        lastVerifiedAt: Date.now() - 60_000,
        highWaterMark: Date.now() - 60_000,
        offlineBatches: 0,
        canExecute: true,
        isPro: true,
        expiresAt: expired,
        usage: { used: 0, limit: null, remaining: Infinity },
      });

      const result = _enforceFromCache();
      expect(result.canExecute).toBe(false);
      expect(result.subscriptionExpired).toBe(true);
    });
  });
});

// ============================================================================
// FIX #5 — PENDING BATCH-TRACKING QUEUE
// ============================================================================

describe('Fix #5: Pending batch-tracking queue', () => {
  beforeEach(() => {
    cacheStore = {};
    queueStore = {};
  });

  describe('Queue persistence', () => {
    it('starts with an empty queue', () => {
      const queue = _readPendingQueue();
      expect(queue).toEqual([]);
    });

    it('enqueues entries and persists them', () => {
      _writePendingQueue([
        { batchCount: 1, timestamp: Date.now() },
        { batchCount: 3, timestamp: Date.now() },
      ]);

      const queue = _readPendingQueue();
      expect(queue).toHaveLength(2);
      expect(queue[0].batchCount).toBe(1);
      expect(queue[1].batchCount).toBe(3);
    });

    it('enqueue helper appends to queue', () => {
      _enqueuePendingTrack(2);
      _enqueuePendingTrack(1);
      _enqueuePendingTrack(5);

      const queue = _readPendingQueue();
      expect(queue).toHaveLength(3);
      expect(queue[0].batchCount).toBe(2);
      expect(queue[1].batchCount).toBe(1);
      expect(queue[2].batchCount).toBe(5);
    });
  });

  describe('checkPendingTrackLimit', () => {
    it('returns blocked=false when queue is empty', () => {
      const result = checkPendingTrackLimit();
      expect(result.blocked).toBe(false);
      expect(result.pending).toBe(0);
    });

    it('returns blocked=false when queue has fewer than MAX_PENDING_TRACKS entries', () => {
      const entries = Array.from({ length: MAX_PENDING_TRACKS - 1 }, (_, i) => ({
        batchCount: 1,
        timestamp: Date.now() + i,
      }));
      _writePendingQueue(entries);

      const result = checkPendingTrackLimit();
      expect(result.blocked).toBe(false);
      expect(result.pending).toBe(MAX_PENDING_TRACKS - 1);
    });

    it('returns blocked=true when queue reaches MAX_PENDING_TRACKS', () => {
      const entries = Array.from({ length: MAX_PENDING_TRACKS }, (_, i) => ({
        batchCount: 1,
        timestamp: Date.now() + i,
      }));
      _writePendingQueue(entries);

      const result = checkPendingTrackLimit();
      expect(result.blocked).toBe(true);
      expect(result.pending).toBe(MAX_PENDING_TRACKS);
    });

    it('returns blocked=true when queue exceeds MAX_PENDING_TRACKS', () => {
      const entries = Array.from({ length: MAX_PENDING_TRACKS + 3 }, (_, i) => ({
        batchCount: 1,
        timestamp: Date.now() + i,
      }));
      _writePendingQueue(entries);

      const result = checkPendingTrackLimit();
      expect(result.blocked).toBe(true);
      expect(result.pending).toBe(MAX_PENDING_TRACKS + 3);
    });
  });

  describe('MAX_PENDING_TRACKS constant', () => {
    it('is set to 5', () => {
      expect(MAX_PENDING_TRACKS).toBe(5);
    });
  });
});

// ============================================================================
// COMBINED SCENARIOS
// ============================================================================

describe('Combined: offline batches + pending queue interaction', () => {
  beforeEach(() => {
    cacheStore = {};
    queueStore = {};
  });

  it('_incrementCachedUsage tracks both usage and offlineBatches', () => {
    _writeSecureCache({
      lastVerifiedAt: Date.now(),
      highWaterMark: Date.now(),
      offlineBatches: 0,
      canExecute: true,
      isPro: true,
      expiresAt: null,
      usage: { used: 5, limit: null, remaining: Infinity },
    });

    _incrementCachedUsage(3);

    const state = _readSecureCache();
    expect(state.offlineBatches).toBe(3);
    expect(state.usage.used).toBe(8);
  });

  it('_cacheSubscriptionState clears offline counters on reconnection', () => {
    _writeSecureCache({
      lastVerifiedAt: Date.now() - 86400_000,
      highWaterMark: Date.now() - 86400_000,
      offlineBatches: 7,
      canExecute: true,
      isPro: true,
      expiresAt: null,
      usage: { used: 20, limit: null, remaining: Infinity },
    });

    _cacheSubscriptionState({
      canExecute: true,
      isPro: true,
      expiresAt: null,
      usage: { used: 20, limit: null, remaining: Infinity },
    });

    const state = _readSecureCache();
    expect(state.offlineBatches).toBe(0);
    expect(state.lastVerifiedAt).toBeGreaterThan(Date.now() - 1000);
  });

  it('enforcement order: clock check → staleness → expiry → offline cap → allow', () => {
    // Set up valid Pro user with 5 offline batches
    const halfDay = 0.5 * 24 * 60 * 60 * 1000;
    _writeSecureCache({
      lastVerifiedAt: Date.now() - halfDay,
      highWaterMark: Date.now() - halfDay,
      offlineBatches: 5,
      canExecute: true,
      isPro: true,
      expiresAt: null,
      usage: { used: 5, limit: null, remaining: Infinity },
    });

    // Should pass all checks and allow execution
    const result = _enforceFromCache();
    expect(result.canExecute).toBe(true);
    expect(result.isPro).toBe(true);
  });

  it('simultaneous offline batches + pending tracks accumulate independently', () => {
    _writeSecureCache({
      lastVerifiedAt: Date.now(),
      highWaterMark: Date.now(),
      offlineBatches: 0,
      canExecute: true,
      isPro: true,
      expiresAt: null,
      usage: { used: 0, limit: null, remaining: Infinity },
    });

    // Simulate 3 offline batches
    for (let i = 0; i < 3; i++) {
      _incrementCachedUsage(1);
      _enqueuePendingTrack(1);
    }

    const cacheState = _readSecureCache();
    expect(cacheState.offlineBatches).toBe(3);
    expect(cacheState.usage.used).toBe(3);

    const pendingState = checkPendingTrackLimit();
    expect(pendingState.pending).toBe(3);
    expect(pendingState.blocked).toBe(false);
  });

  it('pending queue reaches limit and blocks execution', () => {
    for (let i = 0; i < MAX_PENDING_TRACKS; i++) {
      _enqueuePendingTrack(1);
    }

    const result = checkPendingTrackLimit();
    expect(result.blocked).toBe(true);
    expect(result.pending).toBe(MAX_PENDING_TRACKS);
  });

  it('flushing the queue (clearing) unblocks execution', () => {
    for (let i = 0; i < MAX_PENDING_TRACKS + 2; i++) {
      _enqueuePendingTrack(1);
    }

    expect(checkPendingTrackLimit().blocked).toBe(true);

    // Simulate successful flush
    _writePendingQueue([]);

    expect(checkPendingTrackLimit().blocked).toBe(false);
    expect(checkPendingTrackLimit().pending).toBe(0);
  });
});

// ============================================================================
// IN-MEMORY SESSION CACHE
// ============================================================================

describe('In-memory session cache for checkBatchLimit', () => {
  // Simulate the in-memory cache logic (pure, no Electron dependency)
  let memoryCache = { result: null, timestamp: 0 };

  function checkBatchLimitWithCache(cachedResult, cacheTimestamp) {
    memoryCache = { result: cachedResult, timestamp: cacheTimestamp };
    const now = Date.now();

    if (
      memoryCache.result &&
      memoryCache.result.canExecute &&
      (now - memoryCache.timestamp) < CACHE_FRESH_MS
    ) {
      return { ...memoryCache.result, _fromMemoryCache: true };
    }
    return null; // Would proceed to API call
  }

  beforeEach(() => {
    memoryCache = { result: null, timestamp: 0 };
  });

  it('returns cached result instantly when cache is fresh', () => {
    const cachedResult = { canExecute: true, isPro: true, usage: { used: 5, limit: null } };
    const result = checkBatchLimitWithCache(cachedResult, Date.now() - 30_000); // 30s ago
    expect(result).not.toBeNull();
    expect(result._fromMemoryCache).toBe(true);
    expect(result.canExecute).toBe(true);
  });

  it('returns null (falls through to API) when cache is expired', () => {
    const cachedResult = { canExecute: true, isPro: true, usage: { used: 5, limit: null } };
    const result = checkBatchLimitWithCache(cachedResult, Date.now() - CACHE_FRESH_MS - 1000);
    expect(result).toBeNull();
  });

  it('returns null when cache result was canExecute: false', () => {
    // Should NOT serve a cached "blocked" result — always re-check with API
    const cachedResult = { canExecute: false, isPro: false, error: 'Limit reached' };
    const result = checkBatchLimitWithCache(cachedResult, Date.now() - 10_000);
    expect(result).toBeNull();
  });

  it('returns null when no cache exists', () => {
    const result = checkBatchLimitWithCache(null, 0);
    expect(result).toBeNull();
  });

  it('fresh interval is exactly 2 minutes', () => {
    const cachedResult = { canExecute: true, isPro: true };
    // Exactly at boundary: should NOT use cache (>= CACHE_FRESH_MS)
    const atBoundary = checkBatchLimitWithCache(cachedResult, Date.now() - CACHE_FRESH_MS);
    expect(atBoundary).toBeNull();

    // Well within boundary (50ms margin): should use cache
    const withinBoundary = checkBatchLimitWithCache(cachedResult, Date.now() - CACHE_FRESH_MS + 50);
    expect(withinBoundary).not.toBeNull();
    expect(withinBoundary._fromMemoryCache).toBe(true);
  });
});
