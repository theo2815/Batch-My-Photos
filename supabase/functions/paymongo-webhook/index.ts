// POST /functions/v1/paymongo-webhook — PayMongo event receiver.
// Replaces POST /api/webhooks/paymongo (backend/routes/paymongo.js:895-1030).
// verify_jwt = false (config.toml) — PayMongo can't send a Supabase JWT; the
// HMAC signature below is the auth. Only checkout_session.payment.paid is
// handled; everything else is acknowledged and dropped, as before.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { activateSubscription, PLAN_CURRENCY } from '../_shared/paymongo.ts'
import { sendPaymentConfirmation } from '../_shared/emails.ts'

const WEBHOOK_MAX_AGE_SECONDS = 300 // 5-minute replay window

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return null
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

async function verifyWebhookSignature(rawBody: string, signatureHeader: string, secret: string): Promise<boolean> {
  const parts: Record<string, string> = {}
  signatureHeader.split(',').forEach((p) => {
    const [key, val] = p.split('=')
    if (key && val) parts[key.trim()] = val
  })

  const timestamp = parts.t
  const expectedSig = parts.te || parts.li // te = test mode, li = live mode
  if (!timestamp || !expectedSig) return false

  const age = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10))
  if (isNaN(age) || age > WEBHOOK_MAX_AGE_SECONDS) {
    console.warn(`Webhook: timestamp too old or invalid (age: ${Math.round(age)}s)`)
    return false
  }

  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const computed = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${rawBody}`)),
  )
  const expected = hexToBytes(expectedSig)
  if (!expected) return false
  return timingSafeEqual(computed, expected)
}

Deno.serve(async (req) => {
  try {
    const signatureHeader = req.headers.get('paymongo-signature')
    const webhookSecret = Deno.env.get('PAYMONGO_WEBHOOK_SECRET')
    if (!signatureHeader || !webhookSecret) {
      console.warn('Webhook: missing signature header or secret')
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rawBody = await req.text()
    if (!(await verifyWebhookSignature(rawBody, signatureHeader, webhookSecret))) {
      console.warn('Webhook: invalid signature')
      return Response.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const event = JSON.parse(rawBody)
    const eventType = event.data?.attributes?.type
    console.log(`Webhook received: ${eventType}`)

    if (eventType === 'checkout_session.payment.paid') {
      const checkoutData = event.data?.attributes?.data
      const metadata = checkoutData?.attributes?.metadata || {}
      const userId = metadata.user_id
      if (!userId) {
        console.error('Webhook: no user_id in metadata')
        return Response.json({ error: 'Missing user_id in metadata' }, { status: 400 })
      }

      const admin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      )

      const { expiresAt, amount, txCreated } = await activateSubscription(admin, {
        userId,
        checkoutId: checkoutData?.id,
        paymentId: checkoutData?.attributes?.payments?.[0]?.id,
        couponCode: metadata.coupon_code || null,
      })

      console.log(`Subscription activated for user ${userId} until ${expiresAt}`)

      if (txCreated && metadata.user_email) {
        sendPaymentConfirmation({
          to: metadata.user_email,
          amount,
          currency: PLAN_CURRENCY,
          expiresAt,
        }).catch(() => {})
      }
    }

    return Response.json({ received: true })
  } catch (err) {
    console.error('Webhook processing error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
})
