/**
 * Device Service — Hardware ID (HWID) Binding & Heartbeat
 *
 * Generates a stable, anonymous hardware fingerprint using the OS-level
 * machine ID (Windows MachineGuid registry key / Linux machine-id / macOS IOPlatformUUID).
 * The ID is hashed with SHA-256 by `node-machine-id` so no raw hardware serial
 * is ever stored or transmitted.
 *
 * Responsibilities:
 * 1. Generate & cache a consistent HWID across app restarts and updates.
 * 2. Provide a human-readable device label (hostname).
 * 3. Bind the device to the user's subscription on the backend.
 * 4. Run a 5-minute heartbeat loop while the app is active.
 *
 * Integration points:
 * - authService.js  → verifySession sends X-Device-ID header
 * - subscriptionService.js → checkBatchLimit / trackBatch send X-Device-ID header
 * - ipcHandlers.js → exposes device-* IPC channels to the renderer
 * - main.js → starts/stops the heartbeat lifecycle
 */

const os = require('os')
const { machineIdSync } = require('node-machine-id')
const { net } = require('electron')
const SecureStore = require('./secureStore')
const logger = require('../utils/logger')
const config = require('./config')

// Persistent cache so we never need to re-query the OS after first run
const deviceStore = new SecureStore({ name: 'device-info' })

const API_BASE = config.urls.BACKEND_URL

/** Heartbeat interval: 5 minutes (in ms) */
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000

/** Active heartbeat timer reference */
let heartbeatTimer = null

// ============================================================================
// HWID Generation
// ============================================================================

/**
 * Get the stable Hardware ID for this machine.
 * Uses `node-machine-id` which returns a SHA-256 hash of the OS machine GUID.
 * The result is cached in electron-store so subsequent calls are instant.
 *
 * @returns {string} 64-char hex SHA-256 hash
 */
function getHwid() {
  // Return cached value if available
  const cached = deviceStore.get('hwid', null)
  if (cached) return cached

  try {
    // original: false → returns SHA-256 hash (not raw GUID)
    const hwid = machineIdSync({ original: false })
    deviceStore.set('hwid', hwid)
    logger.log('🔑 [DEVICE] Generated and cached HWID')
    return hwid
  } catch (err) {
    logger.error('❌ [DEVICE] Failed to generate HWID:', err.message)
    // Fallback: generate a random ID and persist it (better than crashing)
    const crypto = require('crypto')
    const fallback = crypto.randomBytes(32).toString('hex')
    deviceStore.set('hwid', fallback)
    logger.warn('⚠️ [DEVICE] Using random fallback device ID')
    return fallback
  }
}

/**
 * Get a human-readable label for this device (hostname truncated to 64 chars).
 * @returns {string}
 */
function getDeviceLabel() {
  try {
    return os.hostname().substring(0, 64)
  } catch {
    return 'Unknown Device'
  }
}

// ============================================================================
// Device Binding
// ============================================================================

/**
 * Bind this device to the user's subscription on the backend.
 * Called during session verification (authService.checkAuthStatus).
 *
 * @param {string} sessionToken - User's JWT
 * @returns {Promise<{bound: boolean, existing?: boolean, error?: string, code?: string, limit?: number, count?: number}>}
 */
async function bindDevice(sessionToken) {
  if (!sessionToken) return { bound: false, error: 'Not authenticated' }
  if (!config.features.HWID_BINDING_ENABLED) return { bound: true, skipped: true }

  try {
    const response = await net.fetch(`${API_BASE}/api/devices/bind`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
        'X-Device-ID': getHwid(),
      },
      body: JSON.stringify({
        hwid: getHwid(),
        device_label: getDeviceLabel(),
      }),
    })

    const data = await response.json()

    if (response.status === 403 && data.code === 'DEVICE_LIMIT_REACHED') {
      logger.warn(`⚠️ [DEVICE] Device limit reached: ${data.count}/${data.limit}`)
      deviceStore.set('isDeviceBlocked', true)
      return { bound: false, error: data.error, code: data.code, limit: data.limit, count: data.count }
    }

    if (response.status === 403 && data.code === 'COOLDOWN_ACTIVE') {
      logger.warn(`⚠️ [DEVICE] Cooldown active until ${data.cooldown_ends}`)
      deviceStore.set('isDeviceBlocked', true)
      return { bound: false, error: data.error, code: data.code, cooldownEnds: data.cooldown_ends }
    }

    if (!response.ok) {
      logger.warn(`⚠️ [DEVICE] Bind failed: ${response.status} — ${data.error || 'Unknown'}`)
      return { bound: false, error: data.error || 'Bind failed' }
    }

    // Successfully bound
    deviceStore.set('isDeviceBlocked', false)
    logger.log(`✅ [DEVICE] Device bound (existing: ${data.existing || false})`)
    return { bound: true, existing: data.existing }
  } catch (err) {
    logger.error('❌ [DEVICE] Bind request failed:', err.message)
    // Offline: allow if previously bound, block if never bound
    const wasBlocked = deviceStore.get('isDeviceBlocked', null)
    if (wasBlocked === null) {
      // Never bound before — require connectivity
      return { bound: false, error: 'Cannot verify device — please connect to the internet.' }
    }
    return { bound: !wasBlocked, offline: true }
  }
}

/**
 * Check if this device is currently authorized (cached state — fast, no I/O).
 * @returns {boolean}
 */
function isDeviceAuthorized() {
  if (!config.features.HWID_BINDING_ENABLED) return true
  return !deviceStore.get('isDeviceBlocked', false)
}

/**
 * Live-verify this device is still registered on the server.
 * Calls the heartbeat endpoint; a 404 means the device was removed remotely.
 * Falls back to the local cache when the network is unreachable.
 *
 * @param {string|null} sessionToken
 * @returns {Promise<{authorized: boolean, reason?: string, offline?: boolean}>}
 */
async function verifyDeviceLive(sessionToken) {
  if (!config.features.HWID_BINDING_ENABLED) return { authorized: true }

  // Fast-fail: already flagged locally
  if (deviceStore.get('isDeviceBlocked', false)) {
    return { authorized: false, reason: 'Device is blocked (cached).' }
  }

  if (!sessionToken) {
    // No token — fall back to cache
    return { authorized: !deviceStore.get('isDeviceBlocked', false), offline: true }
  }

  try {
    const response = await net.fetch(`${API_BASE}/api/devices/heartbeat`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
        'X-Device-ID': getHwid(),
      },
      body: JSON.stringify({ hwid: getHwid() }),
    })

    if (response.status === 404) {
      logger.warn('⚠️ [DEVICE] Live check: device not found — marking blocked')
      deviceStore.set('isDeviceBlocked', true)
      return { authorized: false, reason: 'This device has been removed from your account. Please log in again or re-authorize this device.' }
    }

    if (response.status === 409) {
      const data = await response.json()
      if (data.invalidated) {
        logger.warn('⚠️ [DEVICE] Live check: session invalidated (concurrent limit)')
        deviceStore.set('isDeviceBlocked', true)
        return { authorized: false, reason: 'Too many active devices. Remove a device from your account to continue.' }
      }
    }

    if (response.ok) {
      deviceStore.set('isDeviceBlocked', false)
      return { authorized: true }
    }

    // Unexpected status — allow (fail-open for unknown server errors)
    logger.warn(`⚠️ [DEVICE] Live check unexpected status ${response.status} — allowing`)
    return { authorized: true }
  } catch (err) {
    // Network error — fall back to cache
    logger.debug('⚠️ [DEVICE] Live check failed (offline?):', err.message)
    return { authorized: !deviceStore.get('isDeviceBlocked', false), offline: true }
  }
}

// ============================================================================
// Device Management (API calls for Manage Devices UI)
// ============================================================================

/**
 * Fetch all devices bound to the current user.
 * @param {string} sessionToken
 * @returns {Promise<{devices?: Array, error?: string}>}
 */
async function listDevices(sessionToken) {
  if (!sessionToken) return { error: 'Not authenticated' }

  try {
    const response = await net.fetch(`${API_BASE}/api/devices`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'X-Device-ID': getHwid(),
      },
    })

    if (!response.ok) {
      const data = await response.json()
      return { error: data.error || `Failed (${response.status})` }
    }

    const data = await response.json()
    return {
      devices: data.devices,
      currentHwid: getHwid(),
      deviceLimit: data.device_limit,
      removalsUsed: data.removals_used,
      removalsLimit: data.removals_limit,
      removalsResetAt: data.removals_reset_at,
      cooldownEndsAt: data.cooldown_ends_at,
    }
  } catch (err) {
    logger.error('❌ [DEVICE] List devices failed:', err.message)
    return { error: 'Network error — could not fetch devices.' }
  }
}

/**
 * De-authorize (remove) a device binding.
 * @param {string} sessionToken
 * @param {string} deviceId - UUID of the device_bindings row
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function deauthorizeDevice(sessionToken, deviceId) {
  if (!sessionToken) return { success: false, error: 'Not authenticated' }

  try {
    const response = await net.fetch(`${API_BASE}/api/devices/${deviceId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'X-Device-ID': getHwid(),
      },
    })

    const data = await response.json()

    if (response.status === 403 && data.code === 'REMOVAL_LIMIT_REACHED') {
      logger.warn(`⚠️ [DEVICE] Removal limit reached: ${data.removals_used}/${data.removals_limit}`)
      return {
        success: false,
        error: data.error,
        code: data.code,
        removalsUsed: data.removals_used,
        removalsLimit: data.removals_limit,
        removalsResetAt: data.removals_reset_at,
      }
    }

    if (!response.ok) {
      return { success: false, error: data.error || `Failed (${response.status})` }
    }

    logger.log(`✅ [DEVICE] Device ${deviceId} de-authorized`)
    return {
      success: true,
      removalsUsed: data.removals_used,
      removalsLimit: data.removals_limit,
      cooldownEndsAt: data.cooldown_ends_at,
      removalsResetAt: data.removals_reset_at,
    }
  } catch (err) {
    logger.error('❌ [DEVICE] De-authorize failed:', err.message)
    return { success: false, error: 'Network error — could not remove device.' }
  }
}

// ============================================================================
// Heartbeat
// ============================================================================

/**
 * Send a single heartbeat ping to the backend.
 * Updates `last_seen_at` for this device binding.
 *
 * @param {string} sessionToken
 * @returns {Promise<void>}
 */
async function _sendHeartbeat(sessionToken) {
  if (!sessionToken || !config.features.HWID_BINDING_ENABLED) return

  try {
    const response = await net.fetch(`${API_BASE}/api/devices/heartbeat`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
        'X-Device-ID': getHwid(),
      },
      body: JSON.stringify({ hwid: getHwid() }),
    })

    if (response.status === 404) {
      // Device was de-authorized remotely — mark as blocked
      logger.warn('⚠️ [DEVICE] Heartbeat: device not found — may have been de-authorized')
      deviceStore.set('isDeviceBlocked', true)
    } else if (response.status === 409) {
      // Concurrent session limit exceeded — oldest session invalidated
      const data = await response.json()
      if (data.invalidated) {
        logger.warn('⚠️ [DEVICE] Heartbeat: session invalidated due to concurrent device limit')
        deviceStore.set('isDeviceBlocked', true)
      }
    } else if (response.ok) {
      deviceStore.set('isDeviceBlocked', false)
    }
  } catch (err) {
    // Network error — non-fatal, will retry next interval
    logger.debug('⚠️ [DEVICE] Heartbeat failed (offline?):', err.message)
  }
}

/**
 * Start the heartbeat loop. Should be called after successful authentication.
 * @param {() => string|null} getSessionToken - Function that returns the current session token
 */
function startHeartbeat(getSessionToken) {
  stopHeartbeat()

  if (!config.features.HWID_BINDING_ENABLED) {
    logger.log('ℹ️  [DEVICE] Heartbeat disabled (HWID binding off)')
    return
  }

  logger.log('💓 [DEVICE] Starting heartbeat (every 5 minutes)')

  // Send first heartbeat immediately
  const token = getSessionToken()
  if (token) _sendHeartbeat(token)

  heartbeatTimer = setInterval(() => {
    const currentToken = getSessionToken()
    if (currentToken) {
      _sendHeartbeat(currentToken)
    } else {
      logger.debug('⚠️ [DEVICE] Heartbeat skipped — no session token')
    }
  }, HEARTBEAT_INTERVAL_MS)
}

/**
 * Stop the heartbeat loop. Called on logout or app shutdown.
 */
function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
    logger.log('💔 [DEVICE] Heartbeat stopped')
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  getHwid,
  getDeviceLabel,
  bindDevice,
  isDeviceAuthorized,
  verifyDeviceLive,
  listDevices,
  deauthorizeDevice,
  startHeartbeat,
  stopHeartbeat,
}
