/**
 * Subscription Service for Desktop App
 *
 * Handles batch limit checking and usage tracking by communicating
 * with the backend API. Free users have a 5 batches/month limit,
 * Pro users have unlimited batches.
 *
 * This service gracefully handles offline scenarios - if the API is
 * unreachable, it allows batch execution to proceed (fail-safe mode).
 */

const { net } = require('electron')
const logger = require('../utils/logger')
const config = require('./config')

const API_BASE = process.env.BATCH_BACKEND_API_URL || 'http://localhost:3000'

/**
 * Check if user can execute a batch operation.
 * Queries the backend to check current usage and subscription status.
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

    return {
      canExecute: data.can_execute,
      usage: data.usage,
      isPro: data.is_pro,
      needsRenewal: data.needs_renewal,
      subscriptionExpired: data.subscription_expired,
    }
  } catch (err) {
    logger.error('❌ [SUBSCRIPTION] Check batch limit failed:', err.message)

    // FAIL-SAFE: Allow offline usage
    // If the backend is unreachable, don't block the user from working
    logger.warn('⚠️ [SUBSCRIPTION] Operating in offline mode - batch execution allowed')
    return { canExecute: true, offline: true }
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
    logger.log(`   Usage: ${data.usage.used}/${data.usage.limit === Infinity ? '∞' : data.usage.limit}`)

    return { success: true, usage: data.usage }
  } catch (err) {
    logger.error('❌ [SUBSCRIPTION] Track batch error:', err.message)

    // FAIL-SAFE: Don't block on tracking failure
    // If tracking fails, log warning but don't fail the batch operation
    logger.warn('⚠️ [SUBSCRIPTION] Batch tracking failed (offline or network error)')
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
