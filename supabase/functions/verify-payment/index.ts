// POST /functions/v1/verify-payment — client-driven fallback for the webhook.
// Replaces POST /api/verify-payment (backend/routes/paymongo.js:706-841).
// verify_jwt = true. Improvement over Express: the confirmation email is only
// sent when this call actually created the transaction row, so the
// webhook+verify overlap no longer double-emails.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, corsJson } from '../_shared/cors.ts'
import { PAYMONGO_API, PLAN_CURRENCY, paymongoAuth, activateSubscription } from '../_shared/paymongo.ts'
import { sendPaymentConfirmation } from '../_shared/emails.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return corsJson({ error: 'Unauthorized' }, 401)

    const { checkout_id } = await req.json().catch(() => ({}))
    if (!checkout_id) return corsJson({ error: 'Missing checkout_id' }, 400)
    if (typeof checkout_id !== 'string' || !/^cs_[a-zA-Z0-9_-]+$/.test(checkout_id)) {
      return corsJson({ error: 'Invalid checkout_id format' }, 400)
    }

    const response = await fetch(`${PAYMONGO_API}/checkout_sessions/${checkout_id}`, {
      headers: { Authorization: paymongoAuth(), Accept: 'application/json' },
    })
    const data = await response.json()
    if (!response.ok) {
      console.error('PayMongo verify error:', JSON.stringify(data))
      return corsJson({ error: 'Payment verification failed. Please try again.' }, 502)
    }

    const attrs = data.data?.attributes
    const paymentStatus = attrs?.payment_intent?.attributes?.status
    if (paymentStatus !== 'succeeded' && attrs?.status !== 'paid') {
      return corsJson({ verified: false, status: paymentStatus || attrs?.status })
    }

    const metaUserId = attrs?.metadata?.user_id
    if (metaUserId && metaUserId !== user.id) {
      return corsJson({ error: 'Payment does not belong to this user' }, 403)
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { expiresAt, amount, txCreated } = await activateSubscription(admin, {
      userId: user.id,
      checkoutId: checkout_id,
      paymentId: attrs?.payments?.[0]?.id,
      couponCode: attrs?.metadata?.coupon_code || null,
    })

    if (txCreated && user.email) {
      sendPaymentConfirmation({
        to: user.email,
        amount,
        currency: PLAN_CURRENCY,
        expiresAt,
      }).catch(() => {})
    }

    return corsJson({ verified: true, plan: 'pro', status: 'active', expires_at: expiresAt })
  } catch (err) {
    console.error('Verify-payment error:', err)
    return corsJson({ error: 'Internal server error' }, 500)
  }
})
