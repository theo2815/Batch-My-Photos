
require('dotenv').config()
const express = require('express')
const path = require('path')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const { createClient } = require('@supabase/supabase-js')
const { authenticateUser } = require('./middleware/auth')
const paymongoRoutes = require('./routes/paymongo')

const app = express()
const port = process.env.PORT || 3000

// ── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: [
        "'self'",
        process.env.SUPABASE_URL,
        "https://*.supabase.co",
        "https://api.paymongo.com",
        "http://127.0.0.1:7242",
      ],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      fontSrc: ["'self'", "https:", "data:"],
      upgradeInsecureRequests: null,
    },
  },
}))

// CORS — only allow listed origins (comma-separated in .env)
// Same-origin requests (website served by this server) don't need CORS,
// but the Electron desktop app makes cross-origin requests and needs it.
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:3000']

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
    const dbStatus = !error ? 'connected' : isTableMissing ? 'connected (pending migrations)' : 'unreachable'

    res.json({
      status: error && !isTableMissing ? 'degraded' : 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: dbStatus,
    })
  } catch (err) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
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

// ── PayMongo Routes ─────────────────────────────────────────────────────────
// Mounted at /api — auth is handled per-route inside the router
app.use('/api', paymongoRoutes)

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
})
