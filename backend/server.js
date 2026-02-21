
require('dotenv').config()
const express = require('express')
const path = require('path')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const { createClient } = require('@supabase/supabase-js')
const { authenticateUser } = require('./middleware/auth')
const paymongoRoutes = require('./routes/paymongo')
const devicesRoutes = require('./routes/devices')
const { initCronJobs } = require('./services/cronService')

const app = express()
const port = process.env.PORT || 3000

// Trust the first proxy (Railway's reverse proxy) so Express uses the real client IP
// from the X-Forwarded-For header. Required for express-rate-limit to work correctly.
app.set('trust proxy', 1)

// ── Security Middleware ──────────────────────────────────────────────────────
const isDev = process.env.NODE_ENV !== 'production'

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: [
        "'self'",
        process.env.SUPABASE_URL,
        "https://*.supabase.co",
        "wss://*.supabase.co",
        "https://api.paymongo.com",
        ...(isDev ? ["http://127.0.0.1:7242"] : []),
      ],
      scriptSrc: [
        "'self'",
        ...(isDev ? ["'unsafe-inline'", "'unsafe-eval'"] : []),
      ],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      fontSrc: ["'self'", "https:", "data:"],
      upgradeInsecureRequests: isDev ? null : [],
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}))

// CORS — only allow listed origins (comma-separated in .env)
// Same-origin requests (website served by this server) don't need CORS,
// but the Electron desktop app makes cross-origin requests and needs it.
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:3000']

// SECURITY: In production, ALLOWED_ORIGINS must be explicitly configured
if (!isDev && !process.env.ALLOWED_ORIGINS) {
  throw new Error('Missing ALLOWED_ORIGINS in .env — required in production to restrict CORS.')
}

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}))

// JSON body parser — skip webhook path (it needs raw body for HMAC verification)
// Enforce 1 MB size limit to prevent denial-of-service via oversized payloads
app.use((req, res, next) => {
  if (req.path === '/api/webhooks/paymongo') return next()
  express.json({ limit: '1mb' })(req, res, next)
})

// Rate limiting for API routes (100 requests per 15 minutes per IP)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
})
app.use('/api/', apiLimiter)

// Stricter rate limiter for sensitive endpoints (10 requests per 15 minutes)
const sensitiveApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
})
app.use('/api/checkout', sensitiveApiLimiter)
app.use('/api/verify-payment', sensitiveApiLimiter)
app.use('/api/cancel-subscription', sensitiveApiLimiter)
app.use('/api/validate-coupon', sensitiveApiLimiter)

// Webhook rate limiter (higher threshold, protects against flood)
const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests.' },
})
app.use('/api/webhooks', webhookLimiter)

// Supabase Clients
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_ANON_KEY
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env — the server cannot start without these.'
  )
}

if (!process.env.PAYMONGO_SECRET_KEY) {
  throw new Error('Missing PAYMONGO_SECRET_KEY in .env — required for payment processing.')
}

if (!process.env.PAYMONGO_WEBHOOK_SECRET) {
  console.warn('⚠️  Missing PAYMONGO_WEBHOOK_SECRET — webhook signature verification will reject all incoming webhooks.')
}

// Anon client — for auth token verification
const supabase = createClient(supabaseUrl, supabaseKey)
app.locals.supabase = supabase

// Admin client — for server-side DB writes (webhooks) that bypass RLS
if (!supabaseServiceKey) {
  throw new Error(
    'Missing SUPABASE_SERVICE_ROLE_KEY in .env — required for webhook processing and usage tracking.'
  )
}
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
app.locals.supabaseAdmin = supabaseAdmin

// Routes
// (Root route removed to allow static website to serve index.html)

// ── App Version Check ────────────────────────────────────────────────────────
// The desktop app pings this on launch to check if a newer version is available.
// Update LATEST_APP_VERSION env var (or the default below) when you release.
app.get('/api/version', (req, res) => {
  res.json({
    latestVersion: process.env.LATEST_APP_VERSION || '1.0.1',
    downloadUrl: process.env.APP_DOWNLOAD_URL || 'https://www.batchmyphotos.com/#pricing',
    releaseDate: process.env.APP_RELEASE_DATE || '2026-02-18',
  })
})

// ── Health Check ─────────────────────────────────────────────────────────────
// Used by Railway/Render/monitoring tools to verify the service is healthy
app.get('/api/health', async (req, res) => {
  try {
    // Verify Supabase connectivity with a lightweight query.
    // If the table doesn't exist yet (pre-migration), treat as degraded but not down.
    const { error } = await supabaseAdmin
      .from('subscriptions')
      .select('user_id')
      .limit(1)

    const isTableMissing = error && error.code === '42P01'

    res.json({
      status: error && !isTableMissing ? 'degraded' : 'ok',
      timestamp: new Date().toISOString(),
      database: !error ? 'ok' : isTableMissing ? 'ok' : 'unreachable',
    })
  } catch (err) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      database: 'unreachable',
    })
  }
})

// Protected Route Example
app.get('/api/me', authenticateUser, (req, res) => {
  res.json({
    message: `Hello ${req.user.email}! This message is from the secure backend.`,
    user: {
      id: req.user.id,
      email: req.user.email,
      last_sign_in: req.user.last_sign_in_at
    }
  })
})

// ── Token Refresh ────────────────────────────────────────────────────────────
// Accepts a Supabase refresh_token, exchanges it for a new access_token +
// refresh_token pair.  No Bearer auth required (the old JWT is expired).
// Rate-limited: 10 requests per 15 minutes (same as other sensitive endpoints).
app.use('/api/auth/refresh', sensitiveApiLimiter)

app.post('/api/auth/refresh', async (req, res) => {
  const { refresh_token } = req.body

  if (!refresh_token || typeof refresh_token !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid refresh_token' })
  }

  try {
    // Use the anon client to exchange the refresh token.
    // Supabase's setSession validates the refresh_token server-side and
    // returns a fresh session (new access_token + new refresh_token).
    const { data, error } = await supabase.auth.setSession({
      access_token: 'expired',   // placeholder — Supabase only needs the refresh_token
      refresh_token,
    })

    if (error || !data?.session) {
      console.error('❌ [AUTH/REFRESH] Supabase error:', error?.message || 'No session returned')
      return res.status(401).json({ error: 'Invalid or expired refresh token' })
    }

    const session = data.session
    console.log(`✅ [AUTH/REFRESH] Token refreshed for user: ${session.user?.email || 'unknown'}`)

    return res.json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    })
  } catch (err) {
    console.error('❌ [AUTH/REFRESH] Unexpected error:', err.message)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Session Migration (Legacy → Refresh Token) ──────────────────────────────
// For users who logged in BEFORE refresh-token support was added:
// Exchanges a still-valid access_token for a brand-new session that includes a
// refresh_token.  This happens silently on app startup — no user interaction.
//
// Security: requires a valid JWT (authenticateUser middleware verifies it).
// The magic link is generated and consumed entirely server-side — never emailed.
app.use('/api/auth/exchange-session', sensitiveApiLimiter)

app.post('/api/auth/exchange-session', authenticateUser, async (req, res) => {
  const userEmail = req.user.email

  if (!userEmail) {
    return res.status(400).json({ error: 'User email not found in token' })
  }

  try {
    // Step 1: Generate a magic link server-side (no email sent)
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: userEmail,
    })

    if (linkError || !linkData) {
      console.error('❌ [AUTH/EXCHANGE] generateLink failed:', linkError?.message)
      return res.status(500).json({ error: 'Failed to generate session link' })
    }

    const hashedToken = linkData.properties?.hashed_token
    if (!hashedToken) {
      console.error('❌ [AUTH/EXCHANGE] No hashed_token in generateLink response')
      return res.status(500).json({ error: 'Failed to extract token hash' })
    }

    // Step 2: Verify the OTP server-side to produce a full session
    const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: hashedToken,
      type: 'email',
    })

    if (verifyError || !verifyData?.session) {
      console.error('❌ [AUTH/EXCHANGE] verifyOtp failed:', verifyError?.message)
      return res.status(500).json({ error: 'Failed to create session' })
    }

    const session = verifyData.session
    console.log(`✅ [AUTH/EXCHANGE] Session migrated for user: ${userEmail}`)

    return res.json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    })
  } catch (err) {
    console.error('❌ [AUTH/EXCHANGE] Unexpected error:', err.message)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ── PayMongo Routes ─────────────────────────────────────────────────────────
// Mounted at /api — auth is handled per-route inside the router
app.use('/api', paymongoRoutes)

// ── Device Management Routes ────────────────────────────────────────────────
// HWID binding, heartbeat, device CRUD — auth handled per-route
app.use('/api', devicesRoutes)

// ── Website Static Files ────────────────────────────────────────────────────
// Serve the built React website from the same server.
// In production, `npm run build` compiles website/ into website/dist/.
// This must come AFTER all /api routes so API endpoints take priority.
const websiteDistPath = path.join(__dirname, '../website/dist')
app.use(express.static(websiteDistPath))

// SPA fallback — any non-API route serves index.html so client-side
// routing (react-router) handles it. This covers /dashboard, /login, etc.
app.get(/.*/, (req, res, next) => {
  // Don't intercept API routes (safety check)
  if (req.path.startsWith('/api')) return next()
  res.sendFile(path.join(websiteDistPath, 'index.html'), (err) => {
    if (err) {
      // Website not built yet — show a helpful message
      res.status(503).send('Website not built. Run "npm run build" in the website/ directory first.')
    }
  })
})

app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`)

  // Start scheduled background jobs (expiry reminders, usage summaries)
  initCronJobs(app.locals.supabaseAdmin)
})
