const express = require('express')
const { authenticateUser } = require('../middleware/auth')
const router = express.Router()

// ── Admin Email Allowlist ────────────────────────────────────────────────────
// Comma-separated list from env, fallback to default
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'batchmyphotos@gmail.com')
  .split(',')
  .map(e => e.trim().toLowerCase())

/** Middleware: reject non-admin users with 404 (don't reveal admin routes exist) */
function requireAdmin(req, res, next) {
  const userEmail = req.user?.email?.toLowerCase()
  if (!userEmail || !ADMIN_EMAILS.includes(userEmail)) {
    return res.status(404).json({ error: 'Not found' })
  }
  next()
}

// ── GET /api/admin/check — Check if authenticated user is an admin ────────────
// This endpoint is intentionally OUTSIDE the requireAdmin middleware so the
// frontend can call it without knowing admin emails. Returns 404 for non-admins.
router.get('/check', authenticateUser, (req, res) => {
  const userEmail = req.user?.email?.toLowerCase()
  if (!userEmail || !ADMIN_EMAILS.includes(userEmail)) {
    return res.status(404).json({ error: 'Not found' })
  }
  res.json({ isAdmin: true })
})

// All remaining admin routes require auth + admin check
router.use(authenticateUser, requireAdmin)

// ── GET /api/admin/coupons — List all referral coupons ────────────────────────

router.get('/coupons', async (req, res) => {
  try {
    const supabase = req.app.locals.supabaseAdmin

    const { data, error } = await supabase
      .from('referral_coupons')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Admin: list coupons error:', error)
      return res.status(500).json({ error: 'Failed to fetch coupons' })
    }

    // Fetch usage counts for each coupon
    const couponIds = data.map(c => c.id)
    let usageCounts = {}

    if (couponIds.length > 0) {
      const { data: usage, error: usageError } = await supabase
        .from('referral_usage')
        .select('coupon_id')

      if (!usageError && usage) {
        usage.forEach(u => {
          usageCounts[u.coupon_id] = (usageCounts[u.coupon_id] || 0) + 1
        })
      }
    }

    const couponsWithUsage = data.map(c => ({
      ...c,
      usage_count: usageCounts[c.id] || 0,
    }))

    res.json({ data: couponsWithUsage })
  } catch (err) {
    console.error('Admin: list coupons error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── POST /api/admin/coupons — Create a new referral coupon ────────────────────

router.post('/coupons', async (req, res) => {
  try {
    const supabase = req.app.locals.supabaseAdmin
    const { code, referrer_name, discounted_price_centavos, description, expires_at } = req.body

    // Validation
    if (!code || typeof code !== 'string' || code.trim().length < 3) {
      return res.status(400).json({ error: 'Coupon code must be at least 3 characters.' })
    }

    if (!referrer_name || typeof referrer_name !== 'string' || referrer_name.trim().length < 1) {
      return res.status(400).json({ error: 'Referrer name is required.' })
    }

    // Allow only alphanumeric codes (plus underscores/hyphens)
    const cleanCode = code.trim().toUpperCase()
    if (!/^[A-Z0-9_-]+$/.test(cleanCode)) {
      return res.status(400).json({ error: 'Coupon code can only contain letters, numbers, hyphens, and underscores.' })
    }

    // Check for duplicate code
    const { data: existing } = await supabase
      .from('referral_coupons')
      .select('id')
      .eq('code', cleanCode)
      .single()

    if (existing) {
      return res.status(409).json({ error: `Coupon code "${cleanCode}" already exists.` })
    }

    const { data, error } = await supabase
      .from('referral_coupons')
      .insert({
        code: cleanCode,
        referrer_name: referrer_name.trim(),
        discounted_price_centavos: discounted_price_centavos || 12900,
        description: description?.trim() || `Referral Discount — ${referrer_name.trim()}`,
        expires_at: expires_at || '2026-03-31T23:59:59+08:00',
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      console.error('Admin: create coupon error:', error)
      return res.status(500).json({ error: 'Failed to create coupon' })
    }

    console.log(`✅ Admin created referral coupon: ${cleanCode} (referrer: ${referrer_name.trim()})`)
    res.status(201).json({ data })
  } catch (err) {
    console.error('Admin: create coupon error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── PATCH /api/admin/coupons/:id — Update a referral coupon ───────────────────

router.patch('/coupons/:id', async (req, res) => {
  try {
    const supabase = req.app.locals.supabaseAdmin
    const { id } = req.params
    const { code, referrer_name, discounted_price_centavos, description, expires_at, is_active } = req.body

    // Build update object (only include provided fields)
    const updates = { updated_at: new Date().toISOString() }

    if (code !== undefined) {
      const cleanCode = code.trim().toUpperCase()
      if (!/^[A-Z0-9_-]+$/.test(cleanCode) || cleanCode.length < 3) {
        return res.status(400).json({ error: 'Invalid coupon code format.' })
      }
      // Check duplicate (excluding current coupon)
      const { data: existing } = await supabase
        .from('referral_coupons')
        .select('id')
        .eq('code', cleanCode)
        .neq('id', id)
        .single()
      if (existing) {
        return res.status(409).json({ error: `Coupon code "${cleanCode}" already exists.` })
      }
      updates.code = cleanCode
    }
    if (referrer_name !== undefined) updates.referrer_name = referrer_name.trim()
    if (discounted_price_centavos !== undefined) updates.discounted_price_centavos = discounted_price_centavos
    if (description !== undefined) updates.description = description.trim()
    if (expires_at !== undefined) updates.expires_at = expires_at
    if (is_active !== undefined) updates.is_active = is_active

    const { data, error } = await supabase
      .from('referral_coupons')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Admin: update coupon error:', error)
      return res.status(500).json({ error: 'Failed to update coupon' })
    }

    if (!data) {
      return res.status(404).json({ error: 'Coupon not found' })
    }

    console.log(`✅ Admin updated referral coupon: ${data.code}`)
    res.json({ data })
  } catch (err) {
    console.error('Admin: update coupon error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── DELETE /api/admin/coupons/:id — Delete a referral coupon ──────────────────

router.delete('/coupons/:id', async (req, res) => {
  try {
    const supabase = req.app.locals.supabaseAdmin
    const { id } = req.params

    // Check if coupon has usage — if so, soft-delete (deactivate) instead
    const { data: usage } = await supabase
      .from('referral_usage')
      .select('id')
      .eq('coupon_id', id)
      .limit(1)

    if (usage && usage.length > 0) {
      // Soft delete: deactivate instead of hard delete to preserve referral history
      const { data, error } = await supabase
        .from('referral_coupons')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('Admin: soft-delete coupon error:', error)
        return res.status(500).json({ error: 'Failed to deactivate coupon' })
      }

      console.log(`✅ Admin deactivated coupon: ${data?.code} (has usage history)`)
      return res.json({ data, soft_deleted: true, message: 'Coupon deactivated (has usage history)' })
    }

    // Hard delete: no usage, safe to remove
    const { data, error } = await supabase
      .from('referral_coupons')
      .delete()
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Admin: delete coupon error:', error)
      return res.status(500).json({ error: 'Failed to delete coupon' })
    }

    if (!data) {
      return res.status(404).json({ error: 'Coupon not found' })
    }

    console.log(`✅ Admin deleted referral coupon: ${data.code}`)
    res.json({ data, soft_deleted: false })
  } catch (err) {
    console.error('Admin: delete coupon error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── GET /api/admin/coupons/:id/usage — View usage for a specific coupon ───────

router.get('/coupons/:id/usage', async (req, res) => {
  try {
    const supabase = req.app.locals.supabaseAdmin
    const { id } = req.params

    const { data, error } = await supabase
      .from('referral_usage')
      .select('id, user_id, coupon_code, used_at')
      .eq('coupon_id', id)
      .order('used_at', { ascending: false })

    if (error) {
      console.error('Admin: coupon usage error:', error)
      return res.status(500).json({ error: 'Failed to fetch usage data' })
    }

    res.json({ data })
  } catch (err) {
    console.error('Admin: coupon usage error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

module.exports = router
