/**
 * IPC Rate Limiter — prevents renderer-side abuse of IPC channels.
 *
 * Uses a sliding-window counter per channel. Each call increments the
 * counter; once the limit is hit within the window, further calls are
 * rejected with a clear error until the window expires.
 *
 * Three tiers are provided:
 *   STRICT  — heavy / destructive operations (execute-batch, rollback, etc.)
 *   NORMAL  — typical interactive calls (scan-folder, preview, thumbnails)
 *   RELAXED — lightweight reads / preference gets (get-theme, get-presets)
 *
 * Channels not explicitly mapped default to NORMAL.
 */

const logger = require('../utils/logger');

// ============================================================================
// TIER DEFINITIONS
// ============================================================================

/**
 * Rate limit tiers: { maxCalls, windowMs }
 *   maxCalls  — max invocations per sliding window
 *   windowMs  — window duration in milliseconds
 */
const TIERS = {
  STRICT:  { maxCalls:  3,  windowMs: 10_000 },  // 3 calls / 10 s
  NORMAL:  { maxCalls: 30,  windowMs: 10_000 },  // 30 calls / 10 s
  RELAXED: { maxCalls: 60,  windowMs: 10_000 },  // 60 calls / 10 s
};

// ============================================================================
// CHANNEL → TIER MAPPING
// ============================================================================

/**
 * Explicit per-channel tier overrides.
 * Any channel not listed here defaults to NORMAL.
 */
const CHANNEL_TIERS = {
  // STRICT — heavy / destructive / costly
  'execute-batch':          'STRICT',
  'rollback-batch':         'STRICT',
  'rollback-history-entry': 'STRICT',
  'resume-batch':           'STRICT',
  'resume-rollback':        'STRICT',
  'clear-operation-history':'STRICT',
  'export-batch-report':    'STRICT',
  'export-history-report':  'STRICT',
  'analyze-blur':           'STRICT',

  // RELAXED — lightweight reads / preference getters
  'get-theme':              'RELAXED',
  'set-theme':              'RELAXED',
  'get-presets':            'RELAXED',
  'get-recent-folders':     'RELAXED',
  'check-rollback-available': 'RELAXED',
  'auth-check-status':      'RELAXED',
  'auth-get-session':       'RELAXED',
  'device-get-hwid':        'RELAXED',
  'device-check-authorized':'RELAXED',
  'check-interrupted-progress': 'RELAXED',
  'check-interrupted-rollback': 'RELAXED',
  'clear-interrupted-progress': 'RELAXED',
  'clear-interrupted-rollback': 'RELAXED',
  'check-app-version':      'RELAXED',
  'get-operation-history':  'RELAXED',
  'cancel-batch':           'RELAXED',
  'clear-rollback-manifest':'RELAXED',
};

// ============================================================================
// SLIDING-WINDOW COUNTERS
// ============================================================================

/**
 * Map<channel, { timestamps: number[] }>
 * Each entry stores the array of call timestamps that fall within the
 * current window. Stale entries are lazily pruned on each call.
 */
const counters = new Map();

/**
 * Check whether a call to `channel` is allowed under the rate limit.
 *
 * @param {string} channel - IPC channel name
 * @returns {{ allowed: boolean, retryAfterMs?: number }}
 */
function checkLimit(channel) {
  const tierName = CHANNEL_TIERS[channel] || 'NORMAL';
  const tier = TIERS[tierName];

  const now = Date.now();
  const windowStart = now - tier.windowMs;

  if (!counters.has(channel)) {
    counters.set(channel, { timestamps: [] });
  }

  const entry = counters.get(channel);

  // Prune timestamps older than the window
  entry.timestamps = entry.timestamps.filter(t => t > windowStart);

  if (entry.timestamps.length >= tier.maxCalls) {
    // Oldest timestamp still in window → next call allowed after it expires
    const retryAfterMs = entry.timestamps[0] + tier.windowMs - now;
    return { allowed: false, retryAfterMs };
  }

  // Record this call
  entry.timestamps.push(now);
  return { allowed: true };
}

/**
 * Reset all counters (useful for testing).
 */
function resetAll() {
  counters.clear();
}

/**
 * Wrap an existing ipcMain.handle registration with rate limiting.
 *
 * Usage (drop-in replacement):
 *   rateLimitedHandle(ipcMain, 'channel-name', async (event, args) => { ... });
 *
 * If the channel is rate-limited, the handler rejects with an error whose
 * message starts with "RATE_LIMITED:" so the renderer can display a
 * user-friendly message.
 *
 * @param {Object} ipcMain - Electron ipcMain instance
 * @param {string} channel - IPC channel name
 * @param {Function} handler - Original handler function
 */
function rateLimitedHandle(ipcMain, channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    const { allowed, retryAfterMs } = checkLimit(channel);
    if (!allowed) {
      logger.warn(`⚠️ [RATE-LIMIT] Blocked ${channel} — retry in ${retryAfterMs}ms`);
      throw new Error(`RATE_LIMITED: Too many requests on "${channel}". Please wait a moment and try again.`);
    }
    return handler(event, ...args);
  });
}

module.exports = {
  TIERS,
  CHANNEL_TIERS,
  checkLimit,
  resetAll,
  rateLimitedHandle,
};
