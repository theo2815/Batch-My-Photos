const express = require('express')
const crypto = require('crypto')
const router = express.Router()

// ── Helpers ───────────────────────────────────────────────────────────────────

const PAYMONGO_API = 'https://api.paymongo.com/v1'

/** Base64-encoded secret key for PayMongo Authorization header */
const paymongoAuth = () =>
  'Basic ' + Buffer.from(process.env.PAYMONGO_SECRET_KEY + ':').toString('base64')

/** Verify PayMongo webhook signature (HMAC-SHA256) */
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

  const payload = timestamp + '.' + rawBody
  const computed = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')

  return crypto.timingSafeEqual(
    Buffer.from(computed, 'hex'),
    Buffer.from(expectedSig, 'hex')
  )
}

/** Auth middleware — verifies Supabase JWT, attaches req.user */
async function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' })
  }
  const token = authHeader.split(' ')[1]
  const supabase = req.app.locals.supabase
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
  req.user = user
  next()
}

// ── POST /api/checkout — Create a Checkout Session ────────────────────────────

router.post('/checkout', authenticateUser, async (req, res) => {
  try {
    const user = req.user // Set by authenticateUser middleware

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
            description: 'BatchMyPhotos Pro — Monthly Subscription',
            line_items: [
              {
                currency: 'PHP',
                amount: 50000, // ₱500.00 in centavos
                name: 'BatchMyPhotos Pro',
                description: 'Unlimited batches, watermarking, blur detection & more',
                quantity: 1,
              },
            ],
            payment_method_types: ['gcash', 'card'],
            success_url: `${process.env.FRONTEND_URL}/dashboard?payment=success`,
            cancel_url: `${process.env.FRONTEND_URL}/dashboard?payment=cancelled`,
            reference_number: user.id,
            metadata: {
              user_id: user.id,
              user_email: user.email,
              plan: 'pro',
            },
          },
        },
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('PayMongo checkout error:', JSON.stringify(data, null, 2))
      return res.status(response.status).json({
        error: data.errors?.[0]?.detail || 'Failed to create checkout session',
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
    const supabase = req.app.locals.supabaseAdmin // Use admin client to bypass RLS
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

    // If no subscription row, return free plan defaults
    if (!data) {
      return res.json({
        plan: 'free',
        status: 'active',
        usage: { used: 0, limit: 10 },
      })
    }

    // Check if subscription has expired
    const isExpired = data.expires_at && new Date(data.expires_at) < new Date()

    res.json({
      plan: isExpired ? 'free' : data.plan,
      status: isExpired ? 'expired' : data.status,
      paid_at: data.paid_at,
      expires_at: data.expires_at,
      amount: data.amount,
      currency: data.currency,
      paymongo_checkout_id: data.paymongo_checkout_id,
      usage: {
        used: 0, // TODO: Replace with actual usage tracking
        limit: isExpired ? 10 : (data.plan === 'pro' ? Infinity : 10),
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
    const supabase = req.app.locals.supabaseAdmin
    const user = req.user

    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Transactions fetch error:', error)
      return res.status(500).json({ error: 'Failed to fetch transactions' })
    }

    res.json(data)
  } catch (err) {
    console.error('Transactions endpoint error:', err)
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
      return res.status(response.status).json({
        error: data.errors?.[0]?.detail || 'Failed to verify payment',
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

    const { error: upsertError } = await supabase
      .from('subscriptions')
      .upsert(
        {
          user_id: user.id,
          plan: 'pro',
          status: 'active',
          paymongo_checkout_id: checkout_id,
          paymongo_payment_id: paymentId,
          amount: 50000,
          currency: 'PHP',
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
        amount: 50000,
        currency: 'PHP',
        status: 'paid',
        description: 'BatchMyPhotos Pro — Monthly Subscription',
        paymongo_checkout_id: checkout_id,
        created_at: paidAt.toISOString()
      })
    }

    console.log(`✅ Payment verified & subscription activated for user ${user.id}`)

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

      const { error: upsertError } = await supabase
        .from('subscriptions')
        .upsert(
          {
            user_id: userId,
            plan: 'pro',
            status: 'active',
            paymongo_checkout_id: checkoutData?.id,
            paymongo_payment_id: paymentId,
            amount: 50000,
            currency: 'PHP',
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
          amount: 50000,
          currency: 'PHP',
          status: 'paid',
          description: 'BatchMyPhotos Pro — Monthly Subscription',
          paymongo_checkout_id: checkoutData.id,
          created_at: paidAt.toISOString()
        })
      }

      console.log(`✅ Subscription activated for user ${userId} until ${expiresAt.toISOString()}`)
    }

    // Always respond 200 to acknowledge receipt
    res.status(200).json({ received: true })
  } catch (err) {
    console.error('Webhook processing error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

module.exports = router
