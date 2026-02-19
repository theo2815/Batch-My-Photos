/**
 * Subscription Service for Desktop App
 *
 * Handles batch limit checking and usage tracking by communicating
 * with the backend API. Free users have a 2 batches/month limit,
 * Pro users have unlimited batches.
 *
 * Offline mode: When the backend is unreachable, enforces limits
 * against a locally cached subscription state instead of allowing
 * unlimited access. Cache is updated on every successful API call.
 *
 * All cached data is encrypted at rest via SecureStore (safeStorage).
 */

const { net } = require('electron')
const SecureStore = require('./secureStore')
const logger = require('../utils/logger')
const config = require('./config')
const deviceService = require('./deviceService')

const API_BASE = config.urls.BACKEND_URL

const FREE_LIMIT = 2
const CACHE_STALE_DAYS = 7

// Persistent cache for offline subscription enforcement.
// SecureStore encrypts the entire JSON file via safeStorage (OS keychain / DPAPI).
const cache = new SecureStore({ name: 'subscription-cache' })

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
 * @param {Object} data - API response from check-batch-limit
 */
function _cacheSubscriptionState(data) {
  const state = {
    lastVerifiedAt: Date.now(),
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
 * @param {number} batchCount - Number of batches to add
 */
function _incrementCachedUsage(batchCount) {
  const state = _readSecureCache()
  if (!state) return

  const usage = state.usage || { used: 0, limit: FREE_LIMIT, remaining: FREE_LIMIT }
  usage.used += batchCount
  usage.remaining = Math.max(0, (usage.limit === null ? Infinity : usage.limit) - usage.used)
  state.usage = usage
  _writeSecureCache(state)
}

/**
 * Enforce limits from the local cache when the backend is unreachable.
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

  // Cache too stale — require reconnection
  const staleDays = (Date.now() - state.lastVerifiedAt) / (1000 * 60 * 60 * 24)
  if (staleDays > CACHE_STALE_DAYS) {
    logger.warn(`⚠️ [SUBSCRIPTION] Cache is ${Math.floor(staleDays)} days old — requiring reconnection`)
    return {
      canExecute: false,
      offline: true,
      error: `Subscription status is ${Math.floor(staleDays)} days old. Please connect to the internet to verify your plan.`,
    }
  }

  // Pro users with fresh cache — check if subscription has expired since last verification
  if (state.isPro) {
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
    logger.log('✅ [SUBSCRIPTION] Offline mode — Pro plan cached, allowing batch')
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

  const headers = {
    'Authorization': `Bearer ${sessionToken}`,
    'Content-Type': 'application/json',
  }

  // Include device ID for HWID enforcement
  if (config.features.HWID_BINDING_ENABLED) {
    headers['X-Device-ID'] = deviceService.getHwid()
  }

  // Retry once on 401 — Supabase getUser() can fail transiently on cold starts
  const MAX_ATTEMPTS = 2
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      logger.log(`🔍 [SUBSCRIPTION] Checking batch limit... (attempt ${attempt})`)

      const response = await net.fetch(`${API_BASE}/api/check-batch-limit`, {
        method: 'POST',
        headers,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        logger.warn(`⚠️ [SUBSCRIPTION] Batch limit check failed: ${errorData.error}`)

        // On 401, retry once after a brief delay (token validation can be transient)
        if (response.status === 401 && attempt < MAX_ATTEMPTS) {
          logger.log('🔄 [SUBSCRIPTION] Retrying after 401...')
          await new Promise(r => setTimeout(r, 1500))
          continue
        }

        // All retries exhausted — fall back to cached subscription state
        // This lets Pro users batch even with an expired JWT (until cache goes stale)
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
 *
 * @param {string} sessionToken - User's session token
 * @param {number} batchCount - Number of batches executed (default: 1)
 * @returns {Promise<Object>} { success, usage?, offline?, error? }
 */
async function trackBatchExecution(sessionToken, batchCount = 1) {
  if (!sessionToken) {
    logger.warn('⚠️ [SUBSCRIPTION] Cannot track batch - not authenticated')
    return { success: false, error: 'Not authenticated' }
  }

  // Validate batch count
  if (typeof batchCount !== 'number' || batchCount < 1 || batchCount > 1000) {
    logger.error('❌ [SUBSCRIPTION] Invalid batch count:', batchCount)
    return { success: false, error: 'Invalid batch count' }
  }

  try {
    logger.log(`📊 [SUBSCRIPTION] Tracking ${batchCount} batch(es)...`)

    const headers = {
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
    }

    // Include device ID for HWID enforcement
    if (config.features.HWID_BINDING_ENABLED) {
      headers['X-Device-ID'] = deviceService.getHwid()
    }

    const response = await net.fetch(`${API_BASE}/api/track-batch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ batch_count: batchCount }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      logger.error(`❌ [SUBSCRIPTION] Track batch failed: ${errorData.error}`)
      return { success: false, error: errorData.error }
    }

    const data = await response.json()
    logger.log(`✅ [SUBSCRIPTION] Tracked ${batchCount} batch(es) successfully`)
    logger.log(`   Usage: ${data.usage.used}/${data.usage.limit == null ? '∞' : data.usage.limit}`)

    // Update cache with latest usage (preserve expiresAt from existing cache)
    const currentState = _readSecureCache()
    _cacheSubscriptionState({
      canExecute: true,
      isPro: currentState?.isPro || false,
      expiresAt: currentState?.expiresAt || null,
      usage: data.usage,
    })

    return { success: true, usage: data.usage }
  } catch (err) {
    logger.error('❌ [SUBSCRIPTION] Track batch error:', err.message)

    // Offline: increment local cache so limit enforcement stays accurate
    logger.warn('⚠️ [SUBSCRIPTION] Batch tracking failed (offline) — updating local cache')
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

    const headers = {
      'Authorization': `Bearer ${sessionToken}`,
    }

    // Include device ID for HWID enforcement
    if (config.features.HWID_BINDING_ENABLED) {
      headers['X-Device-ID'] = deviceService.getHwid()
    }

    const response = await net.fetch(`${API_BASE}/api/subscription`, {
      method: 'GET',
      headers,
    })

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
}
