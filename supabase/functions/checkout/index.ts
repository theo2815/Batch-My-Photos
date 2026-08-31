// POST /functions/v1/checkout — create a PayMongo checkout session.
// Replaces POST /api/checkout (backend/routes/paymongo.js:328-460).
// verify_jwt = true (gateway rejects anonymous calls before we run).

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, corsJson } from '../_shared/cors.ts'
import {
  PAYMONGO_API, PLAN_PRICE_CENTAVOS, PLAN_CURRENCY, PLAN_DESCRIPTION,
  paymongoAuth, lookupReferralCoupon,
} from '../_shared/paymongo.ts'

const ALLOWED_REDIRECT_HOSTS = ['batchmyphotos.com', 'www.batchmyphotos.com', 'localhost']

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

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { redirect_url, coupon_code } = await req.json().catch(() => ({}))

    // ── Server-side coupon validation (never trust the client price) ─────────
    let finalAmount = PLAN_PRICE_CENTAVOS
    let finalDescription = PLAN_DESCRIPTION
    let validatedCoupon: string | null = null

    if (coupon_code && typeof coupon_code === 'string') {
      const cleanCode = coupon_code.toUpperCase().trim()
      const coupon = await lookupReferralCoupon(admin, cleanCode)

      if (coupon && new Date() <= coupon.expiresAt) {
        const { data: prevTx } = await admin
          .from('transactions').select('id')
          .eq('user_id', user.id).not('coupon_code', 'is', null).limit(1)

        const { data: activeSub } = await admin
          .from('subscriptions').select('plan, status, expires_at')
          .eq('user_id', user.id).eq('plan', 'pro').eq('status', 'active').single()
        const hasActivePro = activeSub?.expires_at && new Date(activeSub.expires_at) > new Date()

        if (hasActivePro) {
          console.log(`Coupon rejected for user ${user.id}: already has active Pro subscription`)
        } else if (!prevTx || prevTx.length === 0) {
          finalAmount = coupon.discountedPriceCentavos
          finalDescription = `${PLAN_DESCRIPTION} (${coupon.description})`
          validatedCoupon = cleanCode
        } else {
          console.log(`Coupon rejected for user ${user.id}: already used a coupon`)
        }
      } else {
        console.log(`Coupon rejected: invalid or expired code "${coupon_code}"`)
      }
    }

    // ── Redirect URL allowlist (open-redirect protection) ────────────────────
    let baseUrl = Deno.env.get('FRONTEND_URL') || 'https://www.batchmyphotos.com'
    if (redirect_url && typeof redirect_url === 'string') {
      try {
        const parsed = new URL(redirect_url)
        if (ALLOWED_REDIRECT_HOSTS.includes(parsed.hostname)) {
          baseUrl = redirect_url.replace(/\/$/, '')
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
            line_items: [{
              currency: PLAN_CURRENCY,
              amount: finalAmount,
              name: validatedCoupon ? `BatchMyPhotos Pro (${validatedCoupon})` : 'BatchMyPhotos Pro',
              description: validatedCoupon
                ? `First month discounted — ₱${finalAmount / 100} (regular ₱${PLAN_PRICE_CENTAVOS / 100}/mo)`
                : 'Unlimited batches & more',
              quantity: 1,
            }],
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
      console.error('PayMongo checkout error:', JSON.stringify(data))
      return corsJson({ error: 'Checkout failed. Please try again.' }, 502)
    }

    return corsJson({
      checkout_url: data.data.attributes.checkout_url,
      checkout_id: data.data.id,
    })
  } catch (err) {
    console.error('Checkout creation error:', err)
    return corsJson({ error: 'Internal server error' }, 500)
  }
})
