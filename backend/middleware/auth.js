const { createClient } = require('@supabase/supabase-js')

async function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' })
  }

  const token = authHeader.slice(7)
  if (!token) {
    return res.status(401).json({ error: 'Missing token' })
  }

  // Create a client scoped to this user's token (RLS enabled)
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_ANON_KEY
  
  const userSupabase = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: { Authorization: `Bearer ${token}` }
    }
  })

  // Verify token by fetching user — retry once on transient failures
  // Supabase getUser() can fail on cold starts or right after login
  let user = null
  let lastError = null

  for (let attempt = 1; attempt <= 2; attempt++) {
    const { data, error } = await userSupabase.auth.getUser()
    if (!error && data?.user) {
      user = data.user
      break
    }
    lastError = error
    if (attempt < 2) {
      await new Promise(r => setTimeout(r, 1500))
    }
  }

  if (!user) {
    // Distinguish between "token is invalid" vs "can't reach Supabase"
    // Supabase returns status 401/403 for invalid tokens.
    // Network errors have no status, status 0, or messages like "fetch failed".
    const errorStatus = lastError?.status
    const isAuthRejection = errorStatus === 401 || errorStatus === 403

    if (isAuthRejection) {
      console.error('[AUTH] Token explicitly rejected by Supabase:', lastError?.message)
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    // Network/transient error — Supabase is unreachable, don't blame the token
    console.error('[AUTH] Cannot reach Supabase to verify token:', lastError?.message)
    return res.status(503).json({ error: 'Authentication service temporarily unavailable' })
  }

  req.user = user
  req.supabase = userSupabase // Attached for use in routes

  // Extract device ID from header (if present) for HWID enforcement
  req.deviceId = req.headers['x-device-id'] || null

  next()
}

module.exports = { authenticateUser }
