/**
 * Shared authentication middleware.
 * Verifies Supabase JWT from the Authorization header and attaches req.user.
 */

async function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' })
  }

  const token = authHeader.slice(7)
  if (!token) {
    return res.status(401).json({ error: 'Missing token' })
  }

  const supabase = req.app.locals.supabase
  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  req.user = user
  next()
}

module.exports = { authenticateUser }
