/**
 * Subscription Service for Desktop App
 *
 * Handles batch limit checking and usage tracking by communicating
 * with the backend API. Free users have a 5 batches/month limit,
 * Pro users have unlimited batches.
 *
 * Offline mode: When the backend is unreachable, enforces limits
 * against a locally cached subscription state instead of allowing
 * unlimited access. Cache is updated on every successful API call.
 */

const { net } = require('electron')
const Store = require('electron-store')
const logger = require('../utils/logger')
const config = require('./config')

const API_BASE = config.urls.BACKEND_URL

const FREE_LIMIT = 2
const CACHE_STALE_DAYS = 7

// Persistent cache for offline subscription enforcement
const cache = new Store({ name: 'subscription-cache' })

/**
 * Save subscription state to local cache after a successful API response.
 * @param {Object} data - API response from check-batch-limit
 */
function _cacheSubscriptionState(data) {
  cache.set('lastVerifiedAt', Date.now())
  cache.set('canExecute', data.canExecute)
  cache.set('isPro', data.isPro || false)
  cache.set('usage', data.usage || { used: 0, limit: FREE_LIMIT, remaining: FREE_LIMIT })
  logger.log('💾 [SUBSCRIPTION] Cached subscription state')
}

/**
 * Increment the locally cached usage count (for offline tracking).
 * @param {number} batchCount - Number of batches to add
 */
function _incrementCachedUsage(batchCount) {
  const usage = cache.get('usage', { used: 0, limit: FREE_LIMIT, remaining: FREE_LIMIT })
  usage.used += batchCount
  usage.remaining = Math.max(0, (usage.limit === null ? Infinity : usage.limit) - usage.used)
  cache.set('usage', usage)
}

/**
 * Enforce limits from the local cache when the backend is unreachable.
 * @returns {Object} Subscription check result based on cached data
 */
function _enforceFromCache() {
  const lastVerified = cache.get('lastVerifiedAt', null)
  const isPro = cache.get('isPro', false)
  const usage = cache.get('usage', null)

  // No cache at all (first-ever run, never connected) — require internet
  if (!lastVerified || !usage) {
    logger.warn('⚠️ [SUBSCRIPTION] No cached state — internet connection required')
    return {
      canExecute: false,
      offline: true,
      isPro: false,
      error: 'Please connect to the internet to verify your subscription before running your first batch.',
    }
  }

  // Cache too stale — require reconnection
  const staleDays = (Date.now() - lastVerified) / (1000 * 60 * 60 * 24)
  if (staleDays > CACHE_STALE_DAYS) {
    logger.warn(`⚠️ [SUBSCRIPTION] Cache is ${Math.floor(staleDays)} days old — requiring reconnection`)
    return {
      canExecute: false,
      offline: true,
      error: `Subscription status is ${Math.floor(staleDays)} days old. Please connect to the internet to verify your plan.`,
    }
  }

  // Pro users with fresh cache — allow
  if (isPro) {
    logger.log('✅ [SUBSCRIPTION] Offline mode — Pro plan cached, allowing batch')
    return { canExecute: true, offline: true, isPro: true, usage }
  }

  // Free users — enforce cached limits
  const canExecute = usage.used < FREE_LIMIT
  logger.log(`✅ [SUBSCRIPTION] Offline mode — Free plan: ${usage.used}/${FREE_LIMIT} used, canExecute=${canExecute}`)
  return {
    canExecute,
    offline: true,
    isPro: false,
    usage: { ...usage, limit: FREE_LIMIT, remaining: Math.max(0, FREE_LIMIT - usage.used) },
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

  try {
    logger.log('🔍 [SUBSCRIPTION] Checking batch limit...')

    const response = await net.fetch(`${API_BASE}/api/check-batch-limit`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      logger.warn(`⚠️ [SUBSCRIPTION] Batch limit check failed: ${errorData.error}`)
      return { canExecute: false, error: errorData.error }
    }

    const data = await response.json()
    logger.log(`✅ [SUBSCRIPTION] Can execute: ${data.can_execute}, Pro: ${data.is_pro}`)

    const result = {
      canExecute: data.can_execute,
      usage: data.usage,
      isPro: data.is_pro,
      needsRenewal: data.needs_renewal,
      subscriptionExpired: data.subscription_expired,
    }

    // Cache the successful response for offline enforcement
    _cacheSubscriptionState(result)

    return result
  } catch (err) {
    logger.error('❌ [SUBSCRIPTION] Check batch limit failed:', err.message)

    // Offline: enforce limits from cached subscription state
    logger.warn('⚠️ [SUBSCRIPTION] Operating in offline mode — enforcing cached limits')
    return _enforceFromCache()
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

    const response = await net.fetch(`${API_BASE}/api/track-batch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
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

    // Update cache with latest usage
    _cacheSubscriptionState({
      canExecute: true,
      isPro: cache.get('isPro', false),
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

    const response = await net.fetch(`${API_BASE}/api/subscription`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
      },
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
