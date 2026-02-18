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

  // Verify token by fetching user
  const { data: { user }, error } = await userSupabase.auth.getUser()

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  req.user = user
  req.supabase = userSupabase // Attached for use in routes
  next()
}

module.exports = { authenticateUser }
