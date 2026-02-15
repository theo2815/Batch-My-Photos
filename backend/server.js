
require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const { createClient } = require('@supabase/supabase-js')
const paymongoRoutes = require('./routes/paymongo')

const app = express()
const port = process.env.PORT || 3000

// ── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet())

// CORS — only allow listed origins (comma-separated in .env)
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173']

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}))

// JSON body parser — skip webhook path (it needs raw body for HMAC verification)
app.use((req, res, next) => {
  if (req.path === '/api/webhooks/paymongo') return next()
  express.json()(req, res, next)
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
const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : supabase // Fallback to anon if no service key
app.locals.supabaseAdmin = supabaseAdmin

// Authentication Middleware
const authenticateUser = async (req, res, next) => {
  const authHeader = req.headers.authorization
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' })
  }

  const token = authHeader.split(' ')[1]
  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  req.user = user
  next()
}

// Routes
app.get('/', (req, res) => {
  res.send('BatchMyPhotos Backend is running!')
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

app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`)
})
