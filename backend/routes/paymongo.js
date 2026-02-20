const express = require('express')
const crypto = require('crypto')
const { authenticateUser } = require('../middleware/auth')
const { sendPaymentConfirmation, sendSubscriptionCancelled } = require('../services/emailService')
const router = express.Router()

// ── Constants ─────────────────────────────────────────────────────────────────

const PAYMONGO_API = 'https://api.paymongo.com/v1'

/** Pro plan price in centavos (₱499.00). Single source of truth for all payment operations. */
const PLAN_PRICE_CENTAVOS = 49900
const PLAN_CURRENCY = 'PHP'
const PLAN_DESCRIPTION = 'BatchMyPhotos Pro — Monthly Subscription'
const FREE_LIMIT = 2

/** Maximum age (in seconds) for webhook timestamps before they are rejected as replayed. */
const WEBHOOK_MAX_AGE_SECONDS = 300 // 5 minutes

// ── Coupon Codes ──────────────────────────────────────────────────────────────

const COUPONS = {
  EARLY249: {
    discountedPriceCentavos: 24900, // ₱249.00
    description: 'Early Bird Discount — ₱249 for first month',
    expiresAt: new Date('2026-03-31T23:59:59+08:00'), // March 31, 2026 PHT
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Base64-encoded secret key for PayMongo Authorization header */
const paymongoAuth = () =>
  'Basic ' + Buffer.from(process.env.PAYMONGO_SECRET_KEY + ':').toString('base64')

/** Verify PayMongo webhook signature (HMAC-SHA256) with replay protection. */
function verifyWebhookSignature(rawBody, signatureHeader, secret) {
  const parts = {}
  signatureHeader.split(',').forEach(p => {
    const [key, val] = p.split('=')
    parts[key.trim()] = val
  })

  const timestamp = parts.t
  // Use 'te' for test mode, 'li' for live mode
  const expectedSig = parts.te || parts.li

  if (!timestamp || !expectedSig) return false

  // SECURITY: Reject replayed webhooks — timestamp must be within tolerance window
  const age = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10))
  if (isNaN(age) || age > WEBHOOK_MAX_AGE_SECONDS) {
    console.warn(`Webhook: Timestamp too old or invalid (age: ${Math.round(age)}s)`)
    return false
  }

  const payload = timestamp + '.' + rawBody
  const computed = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')

  const computedBuf = Buffer.from(computed, 'hex')
  const expectedBuf = Buffer.from(expectedSig, 'hex')
  if (computedBuf.length !== expectedBuf.length) return false
  return crypto.timingSafeEqual(computedBuf, expectedBuf)
}

// ── POST /api/validate-coupon — Validate a coupon code ────────────────────────

router.post('/validate-coupon', authenticateUser, async (req, res) => {
  try {
    const { code } = req.body
    const user = req.user

    if (!code || typeof code !== 'string') {
      return res.json({ valid: false, reason: 'Please enter a coupon code.' })
    }

    const coupon = COUPONS[code.toUpperCase().trim()]
    if (!coupon) {
      return res.json({ valid: false, reason: 'Invalid coupon code.' })
    }

    // Check expiry
    if (new Date() > coupon.expiresAt) {
      return res.json({ valid: false, reason: 'This coupon has expired.' })
    }

    // Check if user already used any coupon (check transactions for coupon_code in metadata)
    const supabase = req.app.locals.supabaseAdmin
    const { data: prevTx } = await supabase
      .from('transactions')
      .select('id')
      .eq('user_id', user.id)
      .not('coupon_code', 'is', null)
      .limit(1)

    if (prevTx && prevTx.length > 0) {
      return res.json({ valid: false, reason: 'You have already used a coupon code.' })
    }

    // SECURITY: Reject coupon if user already has active Pro subscription
    const { data: activeSub } = await supabase
      .from('subscriptions')
      .select('plan, status, expires_at')
      .eq('user_id', user.id)
      .eq('plan', 'pro')
      .eq('status', 'active')
      .single()

    if (activeSub && activeSub.expires_at && new Date(activeSub.expires_at) > new Date()) {
      return res.json({ valid: false, reason: 'Coupons cannot be applied to existing subscriptions.' })
    }

    res.json({
      valid: true,
      code: code.toUpperCase().trim(),
      originalPrice: PLAN_PRICE_CENTAVOS,
      discountedPrice: coupon.discountedPriceCentavos,
      description: coupon.description,
    })
  } catch (err) {
    console.error('Validate coupon error:', err)
    res.status(500).json({ valid: false, reason: 'Internal server error' })
  }
})

// ── POST /api/checkout — Create a Checkout Session ────────────────────────────

router.post('/checkout', authenticateUser, async (req, res) => {
  try {
    const user = req.user // Set by authenticateUser middleware

    const { redirect_url, coupon_code } = req.body

    // ── Coupon validation (server-side, never trust the client price) ──────────
    let finalAmount = PLAN_PRICE_CENTAVOS
    let finalDescription = PLAN_DESCRIPTION
    let validatedCoupon = null

    if (coupon_code && typeof coupon_code === 'string') {
      const coupon = COUPONS[coupon_code.toUpperCase().trim()]
      if (coupon && new Date() <= coupon.expiresAt) {
        // Check one-time usage per user (transactions + active subscription with coupon)
        const supabaseAdmin = req.app.locals.supabaseAdmin
        const { data: prevTx } = await supabaseAdmin
          .from('transactions')
          .select('id')
          .eq('user_id', user.id)
          .not('coupon_code', 'is', null)
          .limit(1)

        // SECURITY: Also check if user already has an active pro subscription to prevent
        // race condition where two concurrent checkout calls both pass the transactions check
        const { data: activeSub } = await supabaseAdmin
          .from('subscriptions')
          .select('plan, status, expires_at')
          .eq('user_id', user.id)
          .eq('plan', 'pro')
          .eq('status', 'active')
          .single()

        const hasActivePro = activeSub && activeSub.expires_at && new Date(activeSub.expires_at) > new Date()

        if (hasActivePro) {
          console.log(`Coupon rejected for user ${user.id}: already has active Pro subscription`)
          // Still allow checkout at full price (renewal), just ignore the coupon
        } else if (!prevTx || prevTx.length === 0) {
          finalAmount = coupon.discountedPriceCentavos
          finalDescription = `${PLAN_DESCRIPTION} (${coupon.description})`
          validatedCoupon = coupon_code.toUpperCase().trim()
          console.log(`Coupon ${validatedCoupon} applied for user ${user.id}: ₱${finalAmount / 100}`)
        } else {
          console.log(`Coupon rejected for user ${user.id}: already used a coupon`)
        }
      } else {
        console.log(`Coupon rejected: invalid or expired code "${coupon_code}"`)
      }
    }
    
    // Use provided redirect_url (from client) or fallback to env var
    // This ensures users on localhost:5173 get redirected back to localhost:5173 (preserving session)
    // SECURITY: Validate redirect_url against allowlist to prevent open redirect attacks
    const ALLOWED_REDIRECT_HOSTS = ['batchmyphotos.com', 'www.batchmyphotos.com', 'localhost']
    let baseUrl = process.env.FRONTEND_URL
    if (redirect_url && typeof redirect_url === 'string') {
      try {
        const parsed = new URL(redirect_url)
        if (ALLOWED_REDIRECT_HOSTS.includes(parsed.hostname)) {
          baseUrl = redirect_url.replace(/\/$/, '') // remove trailing slash
        } else {
          console.warn(`Checkout: rejected redirect_url with host "${parsed.hostname}"`)
        }
      } catch {
        console.warn('Checkout: rejected malformed redirect_url')
      }
    }

    const response = await fetch(`${PAYMONGO_API}/checkout_sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: paymongoAuth(),
        Accept: 'application/json',
      },
      body: JSON.stringify({
        data: {
          attributes: {
            send_email_receipt: true,
            show_description: true,
            show_line_items: true,
            description: finalDescription,
            line_items: [
              {
                currency: PLAN_CURRENCY,
                amount: finalAmount,
                name: validatedCoupon ? `BatchMyPhotos Pro (${validatedCoupon})` : 'BatchMyPhotos Pro',
                description: validatedCoupon
                  ? `First month discounted — ₱${finalAmount / 100} (regular ₱${PLAN_PRICE_CENTAVOS / 100}/mo)`
                  : 'Unlimited batches & more',
                quantity: 1,
              },
            ],
            payment_method_types: ['gcash', 'card', 'qrph', 'paymaya', 'grab_pay', 'dob', 'billease'],
            success_url: `${baseUrl}/dashboard?payment=success`,
            cancel_url: `${baseUrl}/dashboard?payment=cancelled`,
            reference_number: user.id,
            metadata: {
              user_id: user.id,
              user_email: user.email,
              plan: 'pro',
              ...(validatedCoupon && { coupon_code: validatedCoupon }),
            },
          },
        },
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('PayMongo checkout error:', JSON.stringify(data, null, 2))
      return res.status(502).json({
        error: 'Checkout failed. Please try again.',
      })
    }

    const checkoutUrl = data.data.attributes.checkout_url
    const checkoutId = data.data.id

    res.json({ checkout_url: checkoutUrl, checkout_id: checkoutId })
  } catch (err) {
    console.error('Checkout creation error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── GET /api/subscription — Read user's subscription status ───────────────────

router.get('/subscription', authenticateUser, async (req, res) => {
  try {
    const supabase = req.supabase // Use RLS-enabled client
    const user = req.user

    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = "No rows found" — that's OK (user is on free plan)
      console.error('Subscription fetch error:', error)
      return res.status(500).json({ error: 'Failed to fetch subscription' })
    }

    // Calculate REAL current month's usage (replaces hardcoded 0)
    const currentMonth = new Date().toISOString().slice(0, 7) // "2026-02"
    const { data: usageData, error: usageError } = await supabase
      .from('batch_usage')
      .select('batch_count')
      .eq('user_id', user.id)
      .eq('month_year', currentMonth)

    if (usageError) {
      console.error('Usage fetch error:', usageError)
      return res.status(500).json({ error: 'Failed to fetch usage data' })
    }

    const usedThisMonth = usageData?.reduce((sum, row) => sum + row.batch_count, 0) || 0

    // If no subscription row, return free plan defaults
    if (!data) {
      return res.json({
        plan: 'free',
        status: 'active',
        usage: { used: usedThisMonth, limit: FREE_LIMIT },
      })
    }

    // Check if subscription has expired
    const isExpired = data.expires_at && new Date(data.expires_at) < new Date()
    const effectivePlan = isExpired ? 'free' : data.plan

    res.json({
      plan: effectivePlan,
      status: isExpired ? 'expired' : data.status,
      paid_at: data.paid_at,
      expires_at: data.expires_at,
      amount: data.amount,
      currency: data.currency,
      paymongo_checkout_id: data.paymongo_checkout_id,
      usage: {
        used: usedThisMonth,
        limit: effectivePlan === 'pro' ? null : FREE_LIMIT, // null = unlimited
      },
    })
  } catch (err) {
    console.error('Subscription read error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── GET /api/transactions — Fetch transaction history ─────────────────────────

router.get('/transactions', authenticateUser, async (req, res) => {
  try {
    const supabase = req.supabase // Use RLS-enabled client
    const user = req.user

    // Pagination: ?limit=50&offset=0 (defaults)
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100)
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0)

    const { data, error, count } = await supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Transactions fetch error:', error)
      return res.status(500).json({ error: 'Failed to fetch transactions' })
    }

    res.json({ data, total: count, limit, offset })
  } catch (err) {
    console.error('Transactions endpoint error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── POST /api/check-batch-limit — Check if user can execute batch ────────────

router.post('/check-batch-limit', authenticateUser, async (req, res) => {
  try {
    const user = req.user
    const supabaseAdmin = req.app.locals.supabaseAdmin // Use admin client — bypasses RLS
    const currentMonth = new Date().toISOString().slice(0, 7)

    // Get current usage
    const { data: usageData, error: usageError } = await supabaseAdmin
      .from('batch_usage')
      .select('batch_count')
      .eq('user_id', user.id)
      .eq('month_year', currentMonth)

    if (usageError) {
      console.error('Batch usage query error:', usageError)
      return res.status(503).json({ error: 'Unable to check usage. Try again.' })
    }

    const currentUsage = usageData?.reduce((sum, row) => sum + row.batch_count, 0) || 0

    // Get subscription status
    const { data: sub, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('plan, status, expires_at')
      .eq('user_id', user.id)
      .single()

    if (subError && subError.code !== 'PGRST116') {
      // PGRST116 = "no rows returned" — expected for new users with no subscription row
      console.error('Subscription query error:', subError)
    }

    const isExpired = sub?.expires_at && new Date(sub.expires_at) < new Date()
    const isPro = sub && sub.plan === 'pro' && !isExpired && sub.status === 'active'

    const canExecute = isPro || currentUsage < FREE_LIMIT
    const remaining = isPro ? null : Math.max(0, FREE_LIMIT - currentUsage)

    console.log(`[CHECK-LIMIT] user=${user.id} plan=${sub?.plan} status=${sub?.status} expired=${isExpired} isPro=${isPro} usage=${currentUsage} canExecute=${canExecute}`)

    res.json({
      can_execute: canExecute,
      is_pro: isPro,
      usage: {
        used: currentUsage,
        limit: isPro ? null : FREE_LIMIT, // null = unlimited
        remaining: remaining              // null = unlimited
      },
      expires_at: sub?.expires_at || null,
      subscription_expired: !!isExpired,
      needs_renewal: !!(isExpired && sub),
    })
  } catch (err) {
    console.error('Check batch limit error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── POST /api/track-batch — Track batch execution ─────────────────────────────

router.post('/track-batch', authenticateUser, async (req, res) => {
  try {
    const user = req.user
    const { batch_count = 1 } = req.body

    // Validate batch_count (must be a positive integer)
    if (typeof batch_count !== 'number' || !Number.isInteger(batch_count) || batch_count < 1 || batch_count > 1000) {
      return res.status(400).json({ error: 'Invalid batch_count' })
    }

    const supabase = req.app.locals.supabaseAdmin
    const currentMonth = new Date().toISOString().slice(0, 7)

    // Check subscription (to determine limit)
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('plan, status, expires_at')
      .eq('user_id', user.id)
      .single()

    const isExpired = sub?.expires_at && new Date(sub.expires_at) < new Date()
    const isPro = sub && sub.plan === 'pro' && !isExpired && sub.status === 'active'

    // Limit is FREE_LIMIT for free users, null (unlimited) for Pro
    const limit = isPro ? null : FREE_LIMIT

    // Call the RPC to atomically check and insert
    const { data: result, error: rpcError } = await supabase.rpc('track_batch_usage', {
      p_user_id: user.id,
      p_month_year: currentMonth,
      p_count: batch_count,
      p_limit: limit
    })

    if (rpcError) {
      console.error('Track batch RPC error:', rpcError)
      return res.status(500).json({ error: 'Failed to track batch usage' })
    }

    if (!result.success) {
      return res.status(403).json({
        error: result.error,
        used: result.used,
        limit: result.limit,
        upgrade_required: true
      })
    }

    console.log(`✅ Tracked ${batch_count} batch(es) for user ${user.id} (${result.used}/${isPro ? '∞' : FREE_LIMIT})`)

    res.json({
      success: true,
      usage: {
        used: result.used,
        limit: result.limit,
        remaining: result.remaining
      }
    })
  } catch (err) {
    console.error('Track batch error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── POST /api/verify-payment — Fallback: verify checkout directly with PayMongo ──

router.post('/verify-payment', authenticateUser, async (req, res) => {
  try {
    const user = req.user
    const { checkout_id } = req.body

    if (!checkout_id) {
      return res.status(400).json({ error: 'Missing checkout_id' })
    }

    // SECURITY: Validate checkout_id format to prevent URL manipulation
    if (typeof checkout_id !== 'string' || !/^cs_[a-zA-Z0-9_-]+$/.test(checkout_id)) {
      return res.status(400).json({ error: 'Invalid checkout_id format' })
    }

    // Fetch the checkout session from PayMongo
    const response = await fetch(`${PAYMONGO_API}/checkout_sessions/${checkout_id}`, {
      headers: {
        Authorization: paymongoAuth(),
        Accept: 'application/json',
      },
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('PayMongo verify error:', JSON.stringify(data, null, 2))
      return res.status(502).json({
        error: 'Payment verification failed. Please try again.',
      })
    }

    const attrs = data.data?.attributes
    const paymentStatus = attrs?.payment_intent?.attributes?.status

    // Check if the checkout session was actually paid
    if (paymentStatus !== 'succeeded' && attrs?.status !== 'paid') {
      return res.json({ verified: false, status: paymentStatus || attrs?.status })
    }

    // Verify metadata matches this user
    const metaUserId = attrs?.metadata?.user_id
    if (metaUserId && metaUserId !== user.id) {
      return res.status(403).json({ error: 'Payment does not belong to this user' })
    }

    // Upsert subscription in Supabase
    const paidAt = new Date()
    const expiresAt = new Date(paidAt)
    expiresAt.setDate(expiresAt.getDate() + 30)

    const supabase = req.app.locals.supabaseAdmin
    const paymentId = attrs?.payments?.[0]?.id

    // Determine actual amount paid (may be discounted via coupon)
    const verifyMeta = attrs?.metadata || {}
    const verifyCouponCode = verifyMeta.coupon_code || null
    const verifyCouponDef = verifyCouponCode ? COUPONS[verifyCouponCode] : null
    const verifyAmount = verifyCouponDef ? verifyCouponDef.discountedPriceCentavos : PLAN_PRICE_CENTAVOS

    const { error: upsertError } = await supabase
      .from('subscriptions')
      .upsert(
        {
          user_id: user.id,
          plan: 'pro',
          status: 'active',
          device_limit: 2,
          device_removals_limit: 3,
          device_removals_reset_at: expiresAt.toISOString(),
          paymongo_checkout_id: checkout_id,
          paymongo_payment_id: paymentId,
          amount: verifyAmount,
          currency: PLAN_CURRENCY,
          paid_at: paidAt.toISOString(),
          expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

    if (upsertError) {
      console.error('Verify-payment: Supabase upsert error:', upsertError)
      return res.status(500).json({ error: 'Database error' })
    }

    // Insert into transactions history (idempotent check)
    const { data: existingTx } = await supabase
      .from('transactions')
      .select('id')
      .eq('paymongo_checkout_id', checkout_id)
      .single()

    if (!existingTx) {
      await supabase.from('transactions').insert({
        user_id: user.id,
        amount: verifyAmount,
        currency: PLAN_CURRENCY,
        status: 'paid',
        description: verifyCouponCode ? `${PLAN_DESCRIPTION} (${verifyCouponCode})` : PLAN_DESCRIPTION,
        paymongo_checkout_id: checkout_id,
        coupon_code: verifyCouponCode,
        created_at: paidAt.toISOString()
      })
    }

    console.log(`✅ Payment verified & subscription activated for user ${user.id}${verifyCouponCode ? ` (coupon: ${verifyCouponCode})` : ''}`)

    // Fire-and-forget payment confirmation email
    sendPaymentConfirmation({
      to: user.email,
      amount: verifyAmount,
      currency: PLAN_CURRENCY,
      plan: 'pro',
      expiresAt: expiresAt.toISOString(),
    }).catch(() => { /* logged inside sendPaymentConfirmation */ })

    res.json({
      verified: true,
      plan: 'pro',
      status: 'active',
      expires_at: expiresAt.toISOString(),
    })
  } catch (err) {
    console.error('Verify-payment error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── POST /api/cancel-subscription — Immediately cancel subscription ───────────

router.post('/cancel-subscription', authenticateUser, async (req, res) => {
  try {
    const user = req.user
    const supabase = req.app.locals.supabaseAdmin

    // Check if subscription exists
    const { data: sub, error: fetchError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (fetchError || !sub) {
      return res.status(404).json({ error: 'Subscription not found' })
    }

    if (sub.status === 'cancelled') {
      return res.status(400).json({ error: 'Subscription is already cancelled' })
    }

    // Immediate cancellation: set plan to free, status to cancelled, expires_at to now
    const { error: updateError } = await supabase
      .from('subscriptions')
      .update({
        plan: 'free',
        status: 'cancelled',
        expires_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Cancel subscription error:', updateError)
      return res.status(500).json({ error: 'Failed to cancel subscription' })
    }

    console.log(`User ${user.id} cancelled subscription immediately.`)

    // Fire-and-forget cancellation email
    sendSubscriptionCancelled({ to: user.email }).catch(() => {})

    res.json({ success: true, message: 'Subscription cancelled successfully' })
  } catch (err) {
    console.error('Cancel subscription error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── POST /api/webhooks/paymongo — Handle payment events ───────────────────────

router.post('/webhooks/paymongo', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signatureHeader = req.headers['paymongo-signature']
    const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET

    if (!signatureHeader || !webhookSecret) {
      console.warn('Webhook: Missing signature header or secret', { hasSignature: !!signatureHeader, hasSecret: !!webhookSecret })
      return res.status(401).json({ error: 'Unauthorized' })
    }

    // req.body can be a Buffer (express.raw), string, or parsed object depending on middleware
    let rawBody
    if (Buffer.isBuffer(req.body)) {
      rawBody = req.body.toString('utf8')
    } else if (typeof req.body === 'string') {
      rawBody = req.body
    } else {
      // Body was already parsed as JSON by global middleware — stringify it back
      rawBody = JSON.stringify(req.body)
    }

    console.log('Webhook: signature header received, verifying...')

    if (!verifyWebhookSignature(rawBody, signatureHeader, webhookSecret)) {
      console.warn('Webhook: Invalid signature')
      return res.status(401).json({ error: 'Invalid signature' })
    }

    const event = JSON.parse(rawBody)
    const eventType = event.data?.attributes?.type

    console.log(`Webhook received: ${eventType}`)

    if (eventType === 'checkout_session.payment.paid') {
      const checkoutData = event.data?.attributes?.data
      const metadata = checkoutData?.attributes?.metadata || {}
      const userId = metadata.user_id
      const paymentId = checkoutData?.attributes?.payments?.[0]?.id

      if (!userId) {
        console.error('Webhook: No user_id in metadata')
        return res.status(400).json({ error: 'Missing user_id in metadata' })
      }

      // Calculate expiry: 30 days from now
      const paidAt = new Date()
      const expiresAt = new Date(paidAt)
      expiresAt.setDate(expiresAt.getDate() + 30)

      const supabase = req.app.locals.supabaseAdmin // Use admin client (service role) for webhook writes

      // Determine actual amount paid (may be discounted via coupon)
      const couponCode = metadata.coupon_code || null
      const couponDef = couponCode ? COUPONS[couponCode] : null
      const actualAmount = couponDef ? couponDef.discountedPriceCentavos : PLAN_PRICE_CENTAVOS

      const { error: upsertError } = await supabase
        .from('subscriptions')
        .upsert(
          {
            user_id: userId,
            plan: 'pro',
            status: 'active',
            device_limit: 2,
            device_removals_limit: 3,
            device_removals_reset_at: expiresAt.toISOString(),
            paymongo_checkout_id: checkoutData?.id,
            paymongo_payment_id: paymentId,
            amount: actualAmount,
            currency: PLAN_CURRENCY,
            paid_at: paidAt.toISOString(),
            expires_at: expiresAt.toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )

      if (upsertError) {
        console.error('Webhook: Supabase upsert error:', upsertError)
        return res.status(500).json({ error: 'Database error' })
      }

      // Insert into transactions history (idempotent check)
      const { data: existingTx } = await supabase
        .from('transactions')
        .select('id')
        .eq('paymongo_checkout_id', checkoutData?.id)
        .single()

      if (!existingTx && checkoutData?.id) {
        await supabase.from('transactions').insert({
          user_id: userId,
          amount: actualAmount,
          currency: PLAN_CURRENCY,
          status: 'paid',
          description: couponCode ? `${PLAN_DESCRIPTION} (${couponCode})` : PLAN_DESCRIPTION,
          paymongo_checkout_id: checkoutData.id,
          coupon_code: couponCode,
          created_at: paidAt.toISOString()
        })
      }

      console.log(`✅ Subscription activated for user ${userId} until ${expiresAt.toISOString()}${couponCode ? ` (coupon: ${couponCode})` : ''}`)

      // Fire-and-forget payment confirmation email
      const userEmail = metadata.user_email
      if (userEmail) {
        sendPaymentConfirmation({
          to: userEmail,
          amount: actualAmount,
          currency: PLAN_CURRENCY,
          plan: 'pro',
          expiresAt: expiresAt.toISOString(),
        }).catch(() => { /* logged inside sendPaymentConfirmation */ })
      }
    }

    // Always respond 200 to acknowledge receipt
    res.status(200).json({ received: true })
  } catch (err) {
    console.error('Webhook processing error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

module.exports = router
