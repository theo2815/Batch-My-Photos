/**
 * Authentication Service for Desktop App
 *
 * Manages user login, session persistence, and token verification
 * for the BatchMyPhotos desktop application.
 *
 * Persistent session strategy:
 * - On login, both access_token (JWT) and refresh_token are stored.
 * - The JWT expires (default ~1h via Supabase), but the refresh token is
 *   long-lived.  When a JWT check returns 401, we silently refresh it using
 *   the stored refresh token via the backend’s /api/auth/refresh endpoint.
 * - Users remain logged in indefinitely until they explicitly log out.
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

// Prevent concurrent refresh attempts from racing
let _refreshPromise = null

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
 * Save refresh token separately (used for silent re-auth when JWT expires).
 * @param {string} refreshToken - Supabase refresh token
 */
function saveRefreshToken(refreshToken) {
  store.set('refresh_token', refreshToken)
  logger.log('🔒 [AUTH] Refresh token saved')
}

/**
 * Get stored refresh token.
 * @returns {string|null}
 */
function getStoredRefreshToken() {
  return store.get('refresh_token', null)
}

/**
 * Clear session (logout)
 */
function clearSession() {
  store.clear()
  _refreshPromise = null
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

// ============================================================================
// Silent Token Refresh
// ============================================================================

/**
 * Silently refresh the access token using the stored refresh token.
 * Uses the backend's /api/auth/refresh endpoint (which calls Supabase
 * setSession under the hood).
 *
 * Returns:
 *  - `{ refreshed: true, accessToken }` on success (new tokens saved)
 *  - `{ refreshed: false }` on any failure (invalid refresh token, offline, etc.)
 *
 * Coalesces concurrent calls: only one actual request is made at a time.
 */
async function refreshAccessToken() {
  // Coalesce concurrent refresh requests
  if (_refreshPromise) {
    logger.log('🔄 [AUTH] Joining existing refresh request...')
    return _refreshPromise
  }

  const refreshToken = getStoredRefreshToken()
  if (!refreshToken) {
    logger.warn('⚠️ [AUTH] No refresh token stored — cannot refresh')
    return { refreshed: false }
  }

  _refreshPromise = _doRefresh(refreshToken)
  try {
    return await _refreshPromise
  } finally {
    _refreshPromise = null
  }
}

/**
 * Internal: execute the actual refresh request.
 * @param {string} refreshToken
 * @returns {Promise<{refreshed: boolean, accessToken?: string}>}
 */
async function _doRefresh(refreshToken) {
  try {
    logger.log('🔄 [AUTH] Refreshing access token via backend...')

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000) // 10s timeout

    const response = await net.fetch(`${BACKEND_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      logger.warn(`⚠️ [AUTH] Refresh failed: ${response.status} — ${errorData.error || 'unknown'}`)

      // If the server says the refresh token itself is invalid (401/403),
      // it means the user must log in again — but we DON'T clear the session
      // here; the caller decides whether to clear based on context.
      return { refreshed: false, authRejected: response.status === 401 || response.status === 403 }
    }

    const data = await response.json()
    const newAccessToken = data.access_token
    const newRefreshToken = data.refresh_token

    if (!newAccessToken) {
      logger.error('❌ [AUTH] Refresh response missing access_token')
      return { refreshed: false }
    }

    // Save the new tokens
    store.set('session_token', newAccessToken)
    if (newRefreshToken) {
      store.set('refresh_token', newRefreshToken)
    }

    logger.log('✅ [AUTH] Access token refreshed successfully')
    return { refreshed: true, accessToken: newAccessToken }
  } catch (err) {
    logger.error('❌ [AUTH] Refresh error:', err.message)
    return { refreshed: false, networkError: true }
  }
}

// ============================================================================
// Legacy Session Migration
// ============================================================================

/**
 * Silently migrate a pre-refresh-token session to a full session.
 *
 * For users who logged in BEFORE refresh-token support was deployed:
 *   - Their stored access_token is valid but they have no refresh_token.
 *   - When the JWT expires (~1 hr), they'd be forced to re-login.
 *
 * This function calls the backend's /api/auth/exchange-session endpoint which
 * uses the Supabase admin API to generate a new session (access + refresh)
 * entirely server-side — no email, no user interaction.
 *
 * Must be called while the old JWT is still valid (the endpoint requires auth).
 *
 * @param {string} sessionToken - The still-valid access token
 * @returns {Promise<string|null>} New access token on success, null on failure
 */
async function _migrateSession(sessionToken) {
  try {
    logger.log('🔄 [AUTH] Migrating legacy session (acquiring refresh token)...')

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    const response = await net.fetch(`${BACKEND_URL}/api/auth/exchange-session`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      logger.warn(`⚠️ [AUTH] Session migration failed (${response.status}): ${err.error || 'unknown'}`)
      return null
    }

    const data = await response.json()

    if (!data.access_token || !data.refresh_token) {
      logger.warn('⚠️ [AUTH] Migration response missing tokens')
      return null
    }

    // Save the new full session
    store.set('session_token', data.access_token)
    saveRefreshToken(data.refresh_token)

    logger.log('✅ [AUTH] Legacy session migrated — refresh token acquired')
    return data.access_token
  } catch (err) {
    // Network error or timeout — not critical, will retry next launch
    logger.warn('⚠️ [AUTH] Session migration skipped (offline or error):', err.message)
    return null
  }
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
async function verifySession(sessionToken, { allowRefresh = true } = {}) {
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

        // 401/403 after retries — JWT is expired or revoked.
        // Try refreshing the token silently before giving up.
        if (status === 401 || status === 403) {
          if (allowRefresh) {
            logger.log('🔄 [AUTH] JWT expired — attempting silent token refresh...')
            const refreshResult = await refreshAccessToken()
            if (refreshResult.refreshed) {
              // Re-verify with the brand-new token (but don't allow another refresh
              // to prevent infinite loops)
              logger.log('✅ [AUTH] Token refreshed — re-verifying with new token...')
              return verifySession(refreshResult.accessToken, { allowRefresh: false })
            }
          }
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
  let sessionToken = getStoredSession()
  const userProfile = getStoredUser()

  if (!sessionToken || !userProfile) {
    logger.log('ℹ️  [AUTH] No stored session found')
    return { isAuthenticated: false, user: null, subscription: null }
  }

  // ── Proactive migration for legacy sessions ──────────────────────────────
  // If we have a stored access token but NO refresh token, this is a pre-update
  // session.  Try to exchange the still-valid JWT for a full session (with
  // refresh token) BEFORE it expires.  This is a one-time, zero-friction
  // migration that happens silently on startup.
  if (!getStoredRefreshToken()) {
    logger.log('🔄 [AUTH] No refresh token stored — attempting legacy migration...')
    const migratedToken = await _migrateSession(sessionToken)
    if (migratedToken) {
      sessionToken = migratedToken // Use the fresh token for verification
    }
    // If migration fails (offline, token already expired), continue with
    // the original token — verifySession will handle refresh/failure below.
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
    // Server explicitly rejected the session (401/403) — session is truly invalid.
    // Auto-open the login page so the user can re-authenticate with one click
    // instead of having to manually navigate to Settings → Login.
    logger.warn('⚠️ [AUTH] Stored session is invalid, clearing')
    clearSession()
    logger.log('🔄 [AUTH] Auto-opening login page for seamless re-authentication...')
    openLoginPage()
    return { isAuthenticated: false, user: null, subscription: null, sessionExpired: true }
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
  saveRefreshToken,
  getStoredRefreshToken,
  refreshAccessToken,
  checkAuthStatus,
  verifySession,
  openLoginPage,
  openDashboard,
}
