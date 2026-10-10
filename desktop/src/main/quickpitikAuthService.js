/**
 * QuickPitik Session Service (Upload view)
 *
 * Holds the photographer's QuickPitik sign-in for the feature-flagged Upload
 * view. This is a separate account from BatchMyPhotos' own sign-in: it never
 * touches authService.js or the `auth-session` store.
 *
 * Connect is a browser hand-off: the app opens quickpitik.com with a one-time
 * state and a PKCE challenge, the website sends a one-time code back through a
 * batchmyphotos:// link, and the code is swapped here for a token pair. Tokens
 * stay in the main process; the renderer only learns { connected, email, name }.
 *
 * Spec: desktop/docs/superpowers/specs/2026-10-10-quickpitik-upload-workflow-design.md
 * Contract: QuickPitik monorepo docs/desktop-upload-integration-guide.md § 1
 */

const { net, shell } = require('electron')
const crypto = require('crypto')
const SecureStore = require('./secureStore')
const config = require('./config')
const { QP_API_TIMEOUT_MS, QP_CONNECT_PENDING_TTL_MS } = require('./constants')
const { getMainWindow } = require('./windowManager')
const logger = require('../utils/logger')

const store = new SecureStore({ name: 'quickpitik-session' })

const API_URL = config.urls.QUICKPITIK_API_URL
const WEB_URL = config.urls.QUICKPITIK_WEB_URL
const BASE64URL_43 = /^[A-Za-z0-9_-]{43}$/

// The one Connect the browser has not answered yet: { state, verifier, createdAt }
let _pending = null

// Prevent concurrent refresh attempts from racing
let _refreshPromise = null

class QpApiError extends Error {
  constructor({ status, code, message, retryAfterSeconds }) {
    super(message)
    this.name = 'QpApiError'
    this.status = status
    this.code = code
    this.retryAfterSeconds = retryAfterSeconds
  }
}

class QpAuthError extends Error {}

// ============================================================================
// HTTP
// ============================================================================

/**
 * One call to QuickPitik. Parses the { success, data, errors } envelope.
 * A network failure is re-thrown as it is (no status), so callers can tell
 * "offline" from "refused".
 * @param {string} url
 * @param {{ method?: string, body?: object|FormData, headers?: object, timeoutMs?: number }} [init]
 * @returns {Promise<{ data: any, response: Response }>}
 * @throws {QpApiError} on an error envelope or a non-2xx answer
 */
async function request(url, init = {}) {
  const headers = { ...init.headers }
  let body = init.body
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(body)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? QP_API_TIMEOUT_MS)
  try {
    const response = await net.fetch(url, { method: init.method || 'GET', headers, body, signal: controller.signal })
    const envelope = await response.json().catch(() => null)
    if (!response.ok || envelope?.success !== true) {
      const first = envelope?.errors?.[0] || {}
      const retryAfter = Number(response.headers.get('Retry-After'))
      throw new QpApiError({
        status: response.status,
        code: first.code || 'UNKNOWN',
        message: first.message || `Request failed (${response.status})`,
        retryAfterSeconds: retryAfter > 0 ? retryAfter : undefined,
      })
    }
    return { data: envelope.data, response }
  } finally {
    clearTimeout(timeout)
  }
}

// ============================================================================
// Connect (browser hand-off)
// ============================================================================

const randomBase64url = () => crypto.randomBytes(32).toString('base64url')

/**
 * Open the QuickPitik connect page in the browser. A new Connect replaces
 * the one before it.
 * @returns {Promise<{ success: true } | { success: false, error: string }>}
 */
async function startConnect() {
  const state = randomBase64url()
  const verifier = randomBase64url()
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  _pending = { state, verifier, createdAt: Date.now() }
  try {
    await shell.openExternal(`${WEB_URL}/connect/desktop?state=${state}&challenge=${challenge}`)
    return { success: true }
  } catch (err) {
    logger.error('❌ [QP-AUTH] Could not open the browser:', err.message)
    return { success: false, error: 'Could not open your browser. Try again.' }
  }
}

function sendConnectResult(result) {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) win.webContents.send('qp-connect-result', result)
}

/**
 * Finish a Connect from the batchmyphotos://quickpitik/callback deep link.
 * Always ends by sending `qp-connect-result` to the main window.
 * @param {string|null} code - One-time code from the website
 * @param {string|null} state - Must be the state of the newest Connect
 */
async function completeConnect(code, state) {
  const pending = _pending
  if (!pending
    || Date.now() - pending.createdAt > QP_CONNECT_PENDING_TTL_MS
    || state !== pending.state
    || !BASE64URL_43.test(code) || !BASE64URL_43.test(state)) {
    // _pending stays as it is: a stale link must not cancel a fresh Connect
    logger.warn('⚠️ [QP-AUTH] Connect callback refused')
    sendConnectResult({ success: false, error: 'This connect link is not valid. Press Connect in BatchMyPhotos again.' })
    return
  }

  let data
  try {
    ({ data } = await request(`${API_URL}/auth/desktop/exchange`, {
      method: 'POST',
      body: { code, codeVerifier: pending.verifier },
    }))
  } catch (err) {
    logger.warn(`⚠️ [QP-AUTH] Connect exchange failed: ${err.message}`)
    let error = 'Could not reach QuickPitik. Check your connection and press Connect again.'
    if (err instanceof QpApiError) {
      error = err.status === 401 ? 'This connect link has expired. Try again from BatchMyPhotos.' : err.message
    }
    sendConnectResult({ success: false, error })
    return
  }

  const { id, email, name, role } = data.user
  store.set('access_token', data.accessToken)
  store.set('refresh_token', data.refreshToken)
  store.set('user_profile', { id, email, name, role })
  if (_pending === pending) _pending = null
  logger.log(`✅ [QP-AUTH] Connected as ${email}`)
  sendConnectResult({ success: true, email, name })

  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
}

/**
 * Who is connected. Never carries a token.
 * @returns {{ connected: boolean, email: string|null, name: string|null }}
 */
function getStatus() {
  const user = store.get('user_profile', null)
  return {
    connected: Boolean(store.get('refresh_token', null)),
    email: user?.email ?? null,
    name: user?.name ?? null,
  }
}

// ============================================================================
// Token Refresh
// ============================================================================

/**
 * Swap the stored refresh token for a new pair (QuickPitik rotates both).
 * Coalesces concurrent calls: only one actual request is made at a time.
 * @returns {Promise<{ refreshed: true, accessToken: string } | { refreshed: false, authRejected?: true, networkError?: true }>}
 */
async function refreshAccessToken() {
  if (_refreshPromise) return _refreshPromise

  const refreshToken = store.get('refresh_token', null)
  if (!refreshToken) {
    logger.warn('⚠️ [QP-AUTH] No refresh token stored — cannot refresh')
    return { refreshed: false, authRejected: true }
  }

  _refreshPromise = _doRefresh(refreshToken)
  try {
    return await _refreshPromise
  } finally {
    _refreshPromise = null
  }
}

async function _doRefresh(refreshToken) {
  // False once a disconnect or a new Connect replaced the session this
  // refresh was started for: a late answer must not touch the newer state.
  const stillCurrent = () => store.get('refresh_token', null) === refreshToken
  try {
    const { data } = await request(`${API_URL}/auth/refresh`, { method: 'POST', body: { refreshToken } })
    if (!stillCurrent()) return { refreshed: false, authRejected: true }
    // Both tokens are written here, before anyone waiting sees the result
    store.set('access_token', data.accessToken)
    store.set('refresh_token', data.refreshToken)
    return { refreshed: true, accessToken: data.accessToken }
  } catch (err) {
    logger.warn(`⚠️ [QP-AUTH] Refresh failed: ${err.message}`)
    if (!(err instanceof QpApiError)) return { refreshed: false, networkError: true }
    if (err.status === 401 || err.code === 'INVALID_REFRESH_TOKEN') {
      if (stillCurrent()) store.clear()
      return { refreshed: false, authRejected: true }
    }
    return { refreshed: false }
  }
}

/**
 * A signed-in call to the QuickPitik API. On a 401 it refreshes once and
 * retries once.
 * @param {string} path - Relative to QUICKPITIK_API_URL, e.g. '/me/photographer/events'
 * @param {{ method?: string, body?: object|FormData, headers?: object, timeoutMs?: number }} [init]
 * @returns {Promise<{ data: any, response: Response }>}
 * @throws {QpAuthError} when there is no session or the refresh is rejected
 * @throws {QpApiError} on any other error answer
 */
async function authorizedFetch(path, init = {}) {
  const call = token => request(`${API_URL}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  })

  const accessToken = store.get('access_token', null)
  if (!accessToken) throw new QpAuthError('Not connected to QuickPitik')
  try {
    return await call(accessToken)
  } catch (err) {
    if (!(err instanceof QpApiError) || err.status !== 401) throw err
  }

  const result = await refreshAccessToken()
  if (result.refreshed) return call(result.accessToken)
  if (result.authRejected) throw new QpAuthError('QuickPitik sign-in expired')
  // The refresh could not be completed (offline, server busy) but the session
  // is intact: no status, so callers treat it as retryable, not as signed out.
  throw new QpApiError({ code: 'REFRESH_FAILED', message: 'Could not reach QuickPitik to renew the sign-in.' })
}

// ============================================================================
// Disconnect
// ============================================================================

/**
 * Sign out of QuickPitik: tell the server (best effort), then forget the
 * session locally whatever the server said.
 */
async function disconnect() {
  const refreshToken = store.get('refresh_token', null)
  if (refreshToken) {
    const accessToken = store.get('access_token', null)
    try {
      await request(`${API_URL}/auth/logout`, {
        method: 'POST',
        body: { refreshToken },
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      })
    } catch (err) {
      logger.warn(`⚠️ [QP-AUTH] Logout request failed: ${err.message}`)
    }
  }
  clearSession()
}

function clearSession() {
  store.clear()
  _pending = null
  _refreshPromise = null
}

module.exports = {
  startConnect,
  completeConnect,
  getStatus,
  refreshAccessToken,
  authorizedFetch,
  fetchJson: request,
  disconnect,
  clearSession,
  QpApiError,
  QpAuthError,
}
