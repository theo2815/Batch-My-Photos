/**
 * Authentication Service for Desktop App
 *
 * Manages user login, session persistence, and token verification
 * for the BatchMyPhotos desktop application.
 *
 * Uses electron-store for encrypted session storage.
 */

const { net, shell } = require('electron')
const Store = require('electron-store')
const logger = require('../utils/logger')
const config = require('./config')

// Encrypted store for auth tokens
const store = new Store({
  name: 'auth-session',
  encryptionKey: 'batch-my-photos-auth-key-v1', // Use secure key in production
})

const BACKEND_URL = process.env.BATCH_BACKEND_API_URL || 'http://localhost:3000'
const FRONTEND_URL = process.env.BATCH_FRONTEND_URL || 'http://localhost:5173'

// ============================================================================
// Session Management
// ============================================================================

/**
 * Get stored session token
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
 * Save session to encrypted store
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
  store.delete('session_token')
  store.delete('user_profile')
  logger.log('🚪 [AUTH] Session cleared (logout)')
}

// ============================================================================
// Session Verification
// ============================================================================

/**
 * Verify session is still valid with backend
 * @param {string} sessionToken - JWT token to verify
 * @returns {Promise<{valid: boolean, subscription: object|null}>}
 */
async function verifySession(sessionToken) {
  if (!sessionToken) return { valid: false }

  try {
    const response = await net.fetch(`${BACKEND_URL}/api/subscription`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
      },
    })

    if (!response.ok) {
      logger.warn(`⚠️ [AUTH] Session verification failed: ${response.status}`)
      return { valid: false }
    }

    const data = await response.json()
    return { valid: true, subscription: data }
  } catch (err) {
    logger.error('❌ [AUTH] Session verification error:', err.message)
    return { valid: false }
  }
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
    logger.warn('⚠️ [AUTH] Stored session is invalid, clearing')
    clearSession()
    return { isAuthenticated: false, user: null, subscription: null }
  }

  logger.log(`✅ [AUTH] Session valid for user: ${userProfile.email}`)
  return {
    isAuthenticated: true,
    user: userProfile,
    subscription: verification.subscription,
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
