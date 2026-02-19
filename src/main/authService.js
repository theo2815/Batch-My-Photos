/**
 * Authentication Service for Desktop App
 *
 * Manages user login, session persistence, and token verification
 * for the BatchMyPhotos desktop application.
 *
 * All data is stored in a SecureStore instance which encrypts the
 * entire JSON file via Electron safeStorage (OS keychain / Windows DPAPI).
 * No sensitive data (tokens, plan info) is ever written to disk in plain text.
 */

const { app, net, shell } = require('electron')
const SecureStore = require('./secureStore')
const logger = require('../utils/logger')
const config = require('./config')
const deviceService = require('./deviceService')

// SecureStore encrypts all data at rest via safeStorage.
// Automatic migration: existing plain-text keys from older versions
// are encrypted into the blob on first access.
const store = new SecureStore({ name: 'auth-session' })

const BACKEND_URL = config.urls.BACKEND_URL
const FRONTEND_URL = config.urls.FRONTEND_URL

// ============================================================================
// Session Management
// ============================================================================

/**
 * Get stored session token.
 * SecureStore handles decryption transparently.
 * @returns {string|null} Session token or null if not logged in
 */
function getStoredSession() {
  return store.get('session_token', null)
}

/**
 * Get stored user profile
 * @returns {object|null} User profile or null
 */
function getStoredUser() {
  return store.get('user_profile', null)
}

/**
 * Save session to store. SecureStore encrypts everything at rest.
 * @param {string} sessionToken - Supabase JWT token
 * @param {object} userProfile - User profile data
 */
function saveSession(sessionToken, userProfile) {
  store.set('session_token', sessionToken)
  store.set('user_profile', userProfile)
  logger.log(`✅ [AUTH] Session saved for user: ${userProfile.email}`)
}

/**
 * Clear session (logout)
 */
function clearSession() {
  store.clear()
  logger.log('🚪 [AUTH] Session cleared (logout)')
}

// ============================================================================
// Session Verification
// ============================================================================

/**
 * Cache subscription data in the auth store for offline startup.
 * SecureStore encrypts it at rest automatically.
 * @param {Object} subscriptionData - Subscription data from /api/subscription
 */
function _cacheSubscription(subscriptionData) {
  store.set('cached_subscription', subscriptionData)
}

/**
 * Get cached subscription data (for offline use).
 * @returns {Object|null}
 */
function getCachedSubscription() {
  return store.get('cached_subscription', null)
}

/**
 * Verify session is still valid with backend.
 * Retries once on 401 (transient Supabase getUser failures on cold starts).
 *
 * Returns:
 *  - `{ valid: true, subscription }` — server confirmed the session
 *  - `{ valid: false }` — server explicitly rejected (401/403)
 *  - `{ valid: false, networkError: true }` — could not reach server
 *
 * @param {string} sessionToken - JWT token to verify
 * @returns {Promise<{valid: boolean, subscription?: object, networkError?: boolean}>}
 */
async function verifySession(sessionToken) {
  if (!sessionToken) return { valid: false }

  const MAX_ATTEMPTS = 2
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const headers = {
        'Authorization': `Bearer ${sessionToken}`,
      }

      // Include device ID for HWID binding enforcement
      if (config.features.HWID_BINDING_ENABLED) {
        headers['X-Device-ID'] = deviceService.getHwid()
      }

      const response = await net.fetch(`${BACKEND_URL}/api/subscription`, {
        method: 'GET',
        headers,
      })

      if (!response.ok) {
        const status = response.status

        // 401: retry once (transient Supabase getUser() failures on cold starts)
        if (status === 401 && attempt < MAX_ATTEMPTS) {
          logger.log('🔄 [AUTH] Retrying session verification after 401...')
          await new Promise(r => setTimeout(r, 1500))
          continue
        }

        // 401/403 after retries: server explicitly rejected the session
        if (status === 401 || status === 403) {
          logger.warn(`⚠️ [AUTH] Session explicitly rejected: ${status}`)
          return { valid: false }
        }

        // Any other status (0, 500, 502, 503, etc.) — treat as transient/network error
        // Don't invalidate the session when the server is just having issues
        if (attempt < MAX_ATTEMPTS) {
          logger.log(`🔄 [AUTH] Retrying after unexpected status ${status}...`)
          await new Promise(r => setTimeout(r, 1000))
          continue
        }
        logger.warn(`⚠️ [AUTH] Server returned ${status} — treating as network error`)
        return { valid: false, networkError: true }
      }

      const data = await response.json()
      // Cache subscription for offline use
      _cacheSubscription(data)
      return { valid: true, subscription: data }
    } catch (err) {
      // Network errors: retry once, then report networkError
      if (attempt < MAX_ATTEMPTS) {
        logger.log('🔄 [AUTH] Retrying session verification after network error...')
        await new Promise(r => setTimeout(r, 1000))
        continue
      }
      // Network errors (ERR_CONNECTION_REFUSED, DNS failure, etc.)
      // should NOT invalidate a locally-stored session — server is just unreachable.
      logger.error('❌ [AUTH] Session verification error:', err.message)
      return { valid: false, networkError: true }
    }
  }

  // Safety fallback: if loop exits without returning (should never happen),
  // treat as network error to avoid clearing a valid session
  return { valid: false, networkError: true }
}

/**
 * Check authentication status on app startup
 * @returns {Promise<{isAuthenticated: boolean, user: object|null, subscription: object|null}>}
 */
async function checkAuthStatus() {
  const sessionToken = getStoredSession()
  const userProfile = getStoredUser()

  if (!sessionToken || !userProfile) {
    logger.log('ℹ️  [AUTH] No stored session found')
    return { isAuthenticated: false, user: null, subscription: null }
  }

  // Verify session is still valid
  logger.log('🔍 [AUTH] Verifying stored session...')
  const verification = await verifySession(sessionToken)

  if (!verification.valid) {
    if (verification.networkError) {
      // Server unreachable — trust the locally stored session (offline-resilient).
      // Return cached subscription so the UI can display plan info.
      const cachedSub = getCachedSubscription()
      logger.warn('⚠️ [AUTH] Backend unreachable — keeping local session (offline mode)')
      return {
        isAuthenticated: true,
        user: userProfile,
        subscription: cachedSub,
        offline: true,
        deviceBlocked: false,
      }
    }
    // Server explicitly rejected the session (401/403) — session is truly invalid
    logger.warn('⚠️ [AUTH] Stored session is invalid, clearing')
    clearSession()
    return { isAuthenticated: false, user: null, subscription: null }
  }

  // Bind this device to the user's subscription (HWID enforcement)
  let deviceStatus = { bound: true }
  if (config.features.HWID_BINDING_ENABLED) {
    deviceStatus = await deviceService.bindDevice(sessionToken)
    if (!deviceStatus.bound && deviceStatus.code === 'DEVICE_LIMIT_REACHED') {
      logger.warn('⚠️ [AUTH] Device limit reached — blocking access')
      return {
        isAuthenticated: true,
        user: userProfile,
        subscription: verification.subscription,
        deviceBlocked: true,
        deviceError: deviceStatus.error,
        deviceLimit: deviceStatus.limit,
        deviceCount: deviceStatus.count,
      }
    }
  }

  logger.log(`✅ [AUTH] Session valid for user: ${userProfile.email}`)
  return {
    isAuthenticated: true,
    user: userProfile,
    subscription: verification.subscription,
    deviceBlocked: false,
  }
}

// ============================================================================
// Login/Logout
// ============================================================================

/**
 * Open login page in external browser
 * User will authenticate on website, then copy their token back to desktop app
 */
function openLoginPage() {
  const loginUrl = `${FRONTEND_URL}/login?desktop=true`
  logger.log(`[AUTH] Opening login page: ${loginUrl}`)
  shell.openExternal(loginUrl)
}

/**
 * Open dashboard in external browser
 * Used for "View Profile" and "Upgrade to Pro" actions
 */
function openDashboard() {
  const dashboardUrl = `${FRONTEND_URL}/dashboard`
  logger.log(`🌐 [AUTH] Opening dashboard: ${dashboardUrl}`)
  shell.openExternal(dashboardUrl)
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  getStoredSession,
  getStoredUser,
  saveSession,
  clearSession,
  checkAuthStatus,
  verifySession,
  openLoginPage,
  openDashboard,
}
