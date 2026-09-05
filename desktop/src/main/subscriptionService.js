/**
 * Subscription Service for Desktop App
 *
 * Handles batch limit checking and usage tracking via Supabase RPCs
 * (check_batch_limit / track_batch / get_my_subscription — SECURITY DEFINER,
 * user derived from the JWT). Free users have a 2 batches/month limit,
 * Pro users have unlimited batches.
 *
 * Offline mode: When Supabase is unreachable, enforces limits
 * against a locally cached subscription state instead of allowing
 * unlimited access. Cache is updated on every successful API call.
 *
 * All cached data is encrypted at rest via SecureStore (safeStorage).
 */

const { net } = require('electron')
const SecureStore = require('./secureStore')
const logger = require('../utils/logger')
const { rpc } = require('./supabaseApi')

const FREE_LIMIT = 2
const CACHE_STALE_DAYS = 3          // Reduced from 7 → 3 — smaller offline grace window
const MAX_OFFLINE_BATCHES = 10       // Pro users must reconnect after this many offline batches
const MAX_PENDING_TRACKS = 5         // Block execution when this many batch tracks are unsynced
const FLUSH_TIMEOUT_MS = 5_000       // Per-request timeout for pending track flush (5s)
const API_TIMEOUT_MS = 8_000         // Timeout for primary API calls (8s)
const CACHE_FRESH_MS = 120_000       // In-memory cache TTL: 2 minutes (instant check for back-to-back batches)

// Persistent cache for offline subscription enforcement.
// SecureStore encrypts the entire JSON file via safeStorage (OS keychain / DPAPI).
const cache = new SecureStore({ name: 'subscription-cache' })

// Persistent queue for unsynced batch-tracking attempts.
// Survives app restarts; flushed before each execution and on startup.
const trackingQueue = new SecureStore({ name: 'pending-batch-tracks' })

// ── In-memory session cache ──────────────────────────────────────────────────
// Keeps the last successful API result in RAM so back-to-back batches
// don't wait for a network round-trip.  Refreshed in background when used.
let _memoryCache = { result: null, timestamp: 0, refreshing: false }

// ── Cache helpers ────────────────────────────────────────────────────────────

/**
 * Read the subscription cache state.
 * @returns {Object|null} { lastVerifiedAt, canExecute, isPro, expiresAt, usage } or null
 */
function _readSecureCache() {
  return cache.get('state', null)
}

/**
 * Write the subscription cache state.
 * @param {Object} state - Complete cache state to persist
 */
function _writeSecureCache(state) {
  cache.set('state', state)
}

/**
 * Save subscription state to local cache after a successful API response.
 * Also resets the offline batch counter and updates the monotonic high-water mark
 * (used for clock-tampering detection).
 * @param {Object} data - API response from check-batch-limit
 */
function _cacheSubscriptionState(data) {
  const now = Date.now()
  const state = {
    lastVerifiedAt: now,
    highWaterMark: now,           // Monotonic: largest timestamp ever seen
    offlineBatches: 0,            // Reset on every successful API contact
    canExecute: data.canExecute,
    isPro: data.isPro || false,
    expiresAt: data.expiresAt || null,
    usage: data.usage || { used: 0, limit: FREE_LIMIT, remaining: FREE_LIMIT },
  }
  _writeSecureCache(state)
  logger.log('💾 [SUBSCRIPTION] Cached subscription state (encrypted)')
}

/**
 * Increment the locally cached usage count (for offline tracking).
 * Also increments the offline batch counter and updates the monotonic high-water mark.
 * @param {number} batchCount - Number of batches to add
 */
function _incrementCachedUsage(batchCount) {
  const state = _readSecureCache()
  if (!state) return

  const usage = state.usage || { used: 0, limit: FREE_LIMIT, remaining: FREE_LIMIT }
  usage.used += batchCount
  usage.remaining = Math.max(0, (usage.limit === null ? Infinity : usage.limit) - usage.used)
  state.usage = usage

  // Track offline batch count for abuse prevention
  state.offlineBatches = (state.offlineBatches || 0) + batchCount

  // Update monotonic high-water mark (clock-tampering detection)
  const now = Date.now()
  state.highWaterMark = Math.max(state.highWaterMark || 0, now)

  _writeSecureCache(state)
}

/**
 * Enforce limits from the local cache when the backend is unreachable.
 *
 * Security layers:
 * 1. Require internet on first-ever run (no cache)
 * 2. Clock-tampering detection (monotonic high-water mark)
 * 3. Cache staleness check (3-day grace window)
 * 4. Offline batch count cap (max 10 before reconnection)
 * 5. Pro subscription expiry check
 * 6. Free users always blocked offline
 *
 * @returns {Object} Subscription check result based on cached data
 */
function _enforceFromCache() {
  const state = _readSecureCache()

  // No cache at all (first-ever run, never connected) — require internet
  if (!state || !state.lastVerifiedAt || !state.usage) {
    logger.warn('⚠️ [SUBSCRIPTION] No cached state — internet connection required')
    return {
      canExecute: false,
      offline: true,
      isPro: false,
      error: 'Please connect to the internet to verify your subscription before running your first batch.',
    }
  }

  const now = Date.now()

  // ── Clock-tampering detection ──────────────────────────────────────────────
  // If the system clock is earlier than any timestamp we've previously recorded,
  // the user likely set the clock back to keep the cache "fresh".
  const highWaterMark = state.highWaterMark || state.lastVerifiedAt
  if (now < highWaterMark - 60_000) {
    // Allow 60 s of drift for minor OS adjustments / NTP corrections
    const rewindMinutes = Math.floor((highWaterMark - now) / 60_000)
    logger.warn(`🚨 [SUBSCRIPTION] Clock rewind detected (${rewindMinutes} min behind) — requiring reconnection`)
    return {
      canExecute: false,
      offline: true,
      clockTampered: true,
      error: 'System clock appears to have been set back. Please connect to the internet to re-verify your subscription.',
    }
  }

  // Update high-water mark with the current time (monotonic advancement)
  if (now > highWaterMark) {
    state.highWaterMark = now
    _writeSecureCache(state)
  }

  // ── Cache staleness check ──────────────────────────────────────────────────
  const staleDays = (now - state.lastVerifiedAt) / (1000 * 60 * 60 * 24)
  if (staleDays > CACHE_STALE_DAYS) {
    logger.warn(`⚠️ [SUBSCRIPTION] Cache is ${Math.floor(staleDays)} days old — requiring reconnection`)
    return {
      canExecute: false,
      offline: true,
      error: `Subscription status is ${Math.floor(staleDays)} days old. Please connect to the internet to verify your plan.`,
    }
  }

  // ── Pro user checks ────────────────────────────────────────────────────────
  if (state.isPro) {
    // Check subscription expiry
    if (state.expiresAt && new Date(state.expiresAt) < new Date()) {
      logger.warn('⚠️ [SUBSCRIPTION] Pro subscription expired while offline')
      return {
        canExecute: false,
        offline: true,
        isPro: false,
        subscriptionExpired: true,
        error: 'Your Pro subscription has expired. Please connect to the internet to renew.',
      }
    }

    // Check offline batch count cap
    const offlineBatches = state.offlineBatches || 0
    if (offlineBatches >= MAX_OFFLINE_BATCHES) {
      logger.warn(`⚠️ [SUBSCRIPTION] Offline batch limit reached (${offlineBatches}/${MAX_OFFLINE_BATCHES})`)
      return {
        canExecute: false,
        offline: true,
        isPro: true,
        offlineLimitReached: true,
        error: `You've used ${offlineBatches} batches offline. Please connect to the internet to sync your usage and continue.`,
      }
    }

    logger.log(`✅ [SUBSCRIPTION] Offline mode — Pro plan cached, allowing batch (${offlineBatches}/${MAX_OFFLINE_BATCHES} offline)`)
    return { canExecute: true, offline: true, isPro: true, usage: state.usage }
  }

  // Free users — MUST be online to batch (no offline batching for free accounts)
  logger.warn('⚠️ [SUBSCRIPTION] Free user offline — blocking batch execution')
  return {
    canExecute: false,
    offline: true,
    isPro: false,
    freeOffline: true,
    error: 'You need an internet connection to run batches on the Free plan. Connect to Wi-Fi and try again, or upgrade to Pro for offline batching.',
  }
}

// ── Pending Tracking Queue ─────────────────────────────────────────────────
// Batch tracks that failed to reach the backend are queued here and flushed on
// the next successful internet contact.  When the queue exceeds MAX_PENDING_TRACKS
// the user is blocked from further execution until they come online to sync.

/**
 * Read the pending tracking queue.
 * @returns {Array<{batchCount: number, timestamp: number}>}
 */
function _readPendingQueue() {
  return trackingQueue.get('queue', [])
}

/**
 * Write the pending tracking queue.
 * @param {Array} queue
 */
function _writePendingQueue(queue) {
  trackingQueue.set('queue', queue)
}

/**
 * Enqueue a failed batch-tracking attempt for later retry.
 * @param {number} batchCount
 */
function _enqueuePendingTrack(batchCount) {
  const queue = _readPendingQueue()
  queue.push({ batchCount, timestamp: Date.now() })
  _writePendingQueue(queue)
  logger.warn(`📥 [SUBSCRIPTION] Enqueued pending batch track (queue size: ${queue.length})`)
}

/**
 * Flush pending tracking queue by re-submitting each entry to the backend.
 * Removes successfully tracked entries; leaves failed ones for next attempt.
 *
 * @param {string} sessionToken
 * @returns {Promise<{flushed: number, remaining: number}>}
 */
async function flushPendingTracks(sessionToken) {
  const queue = _readPendingQueue()
  if (queue.length === 0) return { flushed: 0, remaining: 0 }

  // Fast-path: skip flush entirely when offline — no point waiting for timeouts
  if (!net.isOnline()) {
    logger.log('📡 [SUBSCRIPTION] Offline — skipping pending track flush')
    return { flushed: 0, remaining: queue.length }
  }

  logger.log(`🔄 [SUBSCRIPTION] Flushing ${queue.length} pending batch track(s) in parallel...`)

  // Flush all entries in parallel with per-request timeouts (not sequentially).
  // track_batch counts 1 per call server-side; limit-exceeded comes back as
  // 200 + success:false — treat it as 'fail' so the entry stays queued
  // (same behavior as the old 403).
  const results = await Promise.allSettled(
    queue.map(async () => {
      try {
        const response = await rpc('track_batch', {}, sessionToken, { timeoutMs: FLUSH_TIMEOUT_MS })
        if (!response.ok) return 'fail'
        const data = await response.json().catch(() => ({}))
        return data.success === true ? 'ok' : 'fail'
      } catch (_err) {
        return 'fail'
      }
    })
  )

  const remaining = []
  let flushed = 0
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value === 'ok') {
      flushed++
    } else {
      remaining.push(queue[i])
    }
  })

  _writePendingQueue(remaining)
  logger.log(`✅ [SUBSCRIPTION] Flushed ${flushed} pending track(s), ${remaining.length} remaining`)
  return { flushed, remaining: remaining.length }
}

/**
 * Check whether execution should be blocked due to too many unsynced tracks.
 * @returns {{blocked: boolean, pending: number}}
 */
function checkPendingTrackLimit() {
  const queue = _readPendingQueue()
  return {
    blocked: queue.length >= MAX_PENDING_TRACKS,
    pending: queue.length,
  }
}

/**
 * Check if user can execute a batch operation.
 * Queries the backend to check current usage and subscription status.
 * Falls back to cached state when offline.
 *
 * @param {string} sessionToken - User's session token
 * @returns {Promise<Object>} { canExecute, usage, isPro, needsRenewal, offline?, error? }
 */
async function checkBatchLimit(sessionToken) {
  if (!sessionToken) {
    return { canExecute: false, error: 'Not authenticated' }
  }

  // ── Instant path: in-memory session cache ──────────────────────────────────
  // If we verified the subscription recently (within CACHE_FRESH_MS), return that
  // result immediately and refresh in the background for the next call.
  const now = Date.now()
  if (
    _memoryCache.result &&
    _memoryCache.result.canExecute &&
    (now - _memoryCache.timestamp) < CACHE_FRESH_MS
  ) {
    logger.log('⚡ [SUBSCRIPTION] Using in-memory cache (instant) — background refresh queued')

    // Trigger a non-blocking background refresh so the next batch has fresh data
    if (!_memoryCache.refreshing) {
      _memoryCache.refreshing = true
      _checkBatchLimitFromAPI(sessionToken)
        .then(freshResult => {
          _memoryCache.result = freshResult
          _memoryCache.timestamp = Date.now()
        })
        .catch(() => {})  // Failures are fine — we still have the cached result
        .finally(() => { _memoryCache.refreshing = false })
    }

    return { ..._memoryCache.result }
  }

  // ── Fast-path: skip all network calls when offline ─────────────────────────
  if (!net.isOnline()) {
    logger.warn('📡 [SUBSCRIPTION] Device offline — enforcing cached limits directly')
    return _enforceFromCache()
  }

  // ── Normal path: call API and populate memory cache ────────────────────────
  const result = await _checkBatchLimitFromAPI(sessionToken)
  if (result.canExecute) {
    _memoryCache.result = result
    _memoryCache.timestamp = Date.now()
  }
  return result
}

/**
 * Internal: actually call the backend API to check batch limits.
 * Separated from checkBatchLimit so the memory-cache layer can call this
 * in the background without recursion.
 *
 * @param {string} sessionToken
 * @returns {Promise<Object>}
 */
async function _checkBatchLimitFromAPI(sessionToken) {
  // Retry once on 401 — token validation can fail transiently on cold starts
  const MAX_ATTEMPTS = 2
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      logger.log(`🔍 [SUBSCRIPTION] Checking batch limit... (attempt ${attempt})`)

      const response = await rpc('check_batch_limit', {}, sessionToken, { timeoutMs: API_TIMEOUT_MS })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        logger.warn(`⚠️ [SUBSCRIPTION] Batch limit check failed: ${errorData.message || errorData.error || 'Unknown error'}`)

        // On 401, retry once after a brief delay (token validation can be transient)
        if (response.status === 401 && attempt < MAX_ATTEMPTS) {
          logger.log('🔄 [SUBSCRIPTION] Retrying after 401...')
          await new Promise(r => setTimeout(r, 1500))
          continue
        }

        // All retries exhausted — fall back to cached subscription state
        logger.warn('⚠️ [SUBSCRIPTION] API auth failed — falling back to cached state')
        return _enforceFromCache()
      }

      const data = await response.json()
      logger.log(`✅ [SUBSCRIPTION] Can execute: ${data.can_execute}, Pro: ${data.is_pro}`)

      const result = {
        canExecute: data.can_execute,
        usage: data.usage,
        isPro: data.is_pro,
        expiresAt: data.expires_at || null,
        needsRenewal: data.needs_renewal,
        subscriptionExpired: data.subscription_expired,
      }

      // Cache the successful response for offline enforcement
      _cacheSubscriptionState(result)

      return result
    } catch (err) {
      logger.error('❌ [SUBSCRIPTION] Check batch limit failed:', err.message)

      // On network error, retry once before falling back to cache
      if (attempt < MAX_ATTEMPTS) {
        logger.log('🔄 [SUBSCRIPTION] Retrying after network error...')
        await new Promise(r => setTimeout(r, 1000))
        continue
      }

      // Offline: enforce limits from cached subscription state
      logger.warn('⚠️ [SUBSCRIPTION] Operating in offline mode — enforcing cached limits')
      return _enforceFromCache()
    }
  }
}

/**
 * Track a batch execution after successful completion.
 * Records usage in the backend database for limit enforcement.
 * On failure, enqueues the track for later retry so usage is never lost.
 *
 * @param {string} sessionToken - User's session token
 * @param {number} batchCount - Number of batches executed (default: 1)
 * @returns {Promise<Object>} { success, usage?, offline?, error? }
 */
async function trackBatchExecution(sessionToken, batchCount = 1) {
  if (!sessionToken) {
    logger.warn('⚠️ [SUBSCRIPTION] Cannot track batch - not authenticated')
    _enqueuePendingTrack(batchCount)
    return { success: false, error: 'Not authenticated' }
  }

  // Validate batch count
  if (typeof batchCount !== 'number' || batchCount < 1 || batchCount > 1000) {
    logger.error('❌ [SUBSCRIPTION] Invalid batch count:', batchCount)
    return { success: false, error: 'Invalid batch count' }
  }

  // Fast-path: if offline, enqueue immediately — no timeout wait
  if (!net.isOnline()) {
    logger.warn('📡 [SUBSCRIPTION] Offline — enqueuing batch track immediately')
    _enqueuePendingTrack(batchCount)
    _incrementCachedUsage(batchCount)
    return { success: false, offline: true }
  }

  try {
    logger.log(`📊 [SUBSCRIPTION] Tracking ${batchCount} batch(es)...`)

    // track_batch counts 1 per call server-side (the old backend hotfix,
    // now baked into the RPC). Limit-exceeded is 200 + success:false —
    // treat it exactly like the old 403: enqueue + increment local cache.
    const response = await rpc('track_batch', {}, sessionToken, { timeoutMs: API_TIMEOUT_MS })
    const data = await response.json().catch(() => ({}))

    if (!response.ok || data.success !== true) {
      logger.error(`❌ [SUBSCRIPTION] Track batch failed: ${data.error || data.message || 'Unknown'}`)

      // Enqueue for retry so usage is never silently lost
      _enqueuePendingTrack(batchCount)
      _incrementCachedUsage(batchCount)
      return { success: false, error: data.error || data.message }
    }

    logger.log(`✅ [SUBSCRIPTION] Tracked ${batchCount} batch(es) successfully`)
    logger.log(`   Usage: ${data.usage.used}/${data.usage.limit === null || data.usage.limit === undefined ? '∞' : data.usage.limit}`)

    // Update cache with latest usage (preserve expiresAt from existing cache)
    const currentState = _readSecureCache()
    _cacheSubscriptionState({
      canExecute: true,
      isPro: currentState?.isPro || false,
      expiresAt: currentState?.expiresAt || null,
      usage: data.usage,
    })

    // Opportunistically flush any pending tracks while online (non-blocking)
    flushPendingTracks(sessionToken).catch(err =>
      logger.warn('⚠️ [SUBSCRIPTION] Background queue flush failed:', err.message)
    )

    return { success: true, usage: data.usage }
  } catch (err) {
    logger.error('❌ [SUBSCRIPTION] Track batch error:', err.message)

    // Offline: enqueue for retry AND increment local cache
    logger.warn('⚠️ [SUBSCRIPTION] Batch tracking failed (offline) — enqueuing for retry')
    _enqueuePendingTrack(batchCount)
    _incrementCachedUsage(batchCount)

    return { success: false, offline: true }
  }
}

/**
 * Refresh subscription status from backend.
 * Used to update local subscription info after payment or renewal.
 *
 * @param {string} sessionToken - User's session token
 * @returns {Promise<Object>} { subscription?, error? }
 */
async function refreshSubscription(sessionToken) {
  if (!sessionToken) {
    return { error: 'Not authenticated' }
  }

  try {
    logger.log('🔄 [SUBSCRIPTION] Refreshing subscription status...')

    const response = await rpc('get_my_subscription', {}, sessionToken)

    if (!response.ok) {
      logger.warn(`⚠️ [SUBSCRIPTION] Refresh failed: ${response.status}`)
      return { error: 'Failed to refresh subscription' }
    }

    const data = await response.json()
    logger.log(`✅ [SUBSCRIPTION] Refreshed - Plan: ${data.plan}, Status: ${data.status}`)

    // Update cache with refreshed data
    _cacheSubscriptionState({
      canExecute: true,
      isPro: data.plan === 'pro',
      expiresAt: data.expires_at || null,
      usage: data.usage,
    })

    return { subscription: data }
  } catch (err) {
    logger.error('❌ [SUBSCRIPTION] Refresh error:', err.message)
    return { error: err.message }
  }
}

module.exports = {
  checkBatchLimit,
  trackBatchExecution,
  refreshSubscription,
  flushPendingTracks,
  checkPendingTrackLimit,
  // Exposed for testing only
  _readSecureCache,
  _writeSecureCache,
  _readPendingQueue,
  _writePendingQueue,
  _enforceFromCache,
  _incrementCachedUsage,
  _cacheSubscriptionState,
  _checkBatchLimitFromAPI,
  _resetMemoryCache: () => { _memoryCache = { result: null, timestamp: 0, refreshing: false } },
  // Constants (for tests)
  CACHE_STALE_DAYS,
  MAX_OFFLINE_BATCHES,
  MAX_PENDING_TRACKS,
  FLUSH_TIMEOUT_MS,
  API_TIMEOUT_MS,
  CACHE_FRESH_MS,
}
