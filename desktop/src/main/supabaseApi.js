/**
 * Minimal Supabase REST helper for the main process.
 *
 * No SDK: plain net.fetch against PostgREST (`/rest/v1/rpc/*`) and GoTrue
 * (`/auth/v1/*`). All business RPCs are SECURITY DEFINER functions that derive
 * the user from the JWT (auth.uid()) and return jsonb bodies mirroring the old
 * Express responses — callers keep their existing response-field logic.
 */

const { net } = require('electron')
const config = require('./config')

const SUPABASE_URL = config.urls.SUPABASE_URL
const ANON_KEY = config.urls.SUPABASE_ANON_KEY

/**
 * Call a PostgREST RPC. Returns the raw Response — callers own status/body
 * handling (mirrors their old net.fetch usage).
 *
 * @param {string} name - RPC function name (e.g. 'check_batch_limit')
 * @param {object} args - Named arguments (e.g. { p_hwid: '...' })
 * @param {string} token - User JWT (Authorization bearer)
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs] - Abort after this many ms (default: 15s)
 * @returns {Promise<Response>}
 */
const DEFAULT_TIMEOUT_MS = 15_000

async function rpc(name, args, token, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return net.fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args || {}),
    signal: AbortSignal.timeout(timeoutMs),
  })
}

module.exports = { rpc, SUPABASE_URL, ANON_KEY, DEFAULT_TIMEOUT_MS }
