/**
 * Authentication Service for Desktop App
 *
 * Manages user login, session persistence, and token verification
 * for the BatchMyPhotos desktop application.
 *
 * Uses Electron safeStorage (OS keychain / Windows DPAPI) to encrypt
 * sensitive session data at rest. Non-sensitive profile data (email, name)
 * is stored in plain electron-store.
 */

const { app, net, shell, safeStorage } = require('electron')
const Store = require('electron-store')
const path = require('path')
const fs = require('fs')
const logger = require('../utils/logger')
const config = require('./config')

// Store for auth data — session token is encrypted via safeStorage,
// profile data (email, name) is non-sensitive and stored as plain JSON.
//
// Migration: The old version used a hardcoded encryptionKey which produced
// binary data in the JSON file. Without that key, electron-store fails to
// parse it on construction. Delete the old file if it exists so we start fresh.
let store
try {
  store = new Store({ name: 'auth-session' })
} catch (_err) {
  logger.warn('⚠️ [AUTH] Old encrypted store is unreadable — deleting and starting fresh')
  const storeFile = path.join(app.getPath('userData'), 'auth-session.json')
  try { fs.unlinkSync(storeFile) } catch (_e) { /* file may not exist */ }
  store = new Store({ name: 'auth-session' })
}

const BACKEND_URL = config.urls.BACKEND_URL
const FRONTEND_URL = config.urls.FRONTEND_URL

// ============================================================================
// Session Management
// ============================================================================

/**
 * Get stored session token (decrypted via OS keychain).
 * @returns {string|null} Session token or null if not logged in
 */
function getStoredSession() {
  try {
    const encrypted = store.get('session_token_encrypted', null)
    if (!encrypted) return null

    if (!safeStorage.isEncryptionAvailable()) {
      logger.warn('⚠️ [AUTH] safeStorage not available, cannot decrypt token')
      return null
    }

    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  } catch (err) {
    logger.error('❌ [AUTH] Failed to decrypt session token:', err.message)
    store.delete('session_token_encrypted')
    return null
  }
}

/**
 * Get stored user profile
 * @returns {object|null} User profile or null
 */
function getStoredUser() {
  return store.get('user_profile', null)
}

/**
 * Save session to store. Token is encrypted via OS keychain (safeStorage).
 * @param {string} sessionToken - Supabase JWT token
 * @param {object} userProfile - User profile data
 */
function saveSession(sessionToken, userProfile) {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(sessionToken)
    store.set('session_token_encrypted', encrypted.toString('base64'))
  } else {
    logger.warn('⚠️ [AUTH] safeStorage not available, storing token without OS encryption')
    store.set('session_token_encrypted', Buffer.from(sessionToken).toString('base64'))
  }
  store.set('user_profile', userProfile)
  logger.log(`✅ [AUTH] Session saved for user: ${userProfile.email}`)
}

/**
 * Clear session (logout)
 */
function clearSession() {
  store.delete('session_token_encrypted')
  store.delete('user_profile')
  // Clean up legacy key from old versions
  store.delete('session_token')
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
