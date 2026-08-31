// Shared PayMongo + subscription-activation logic.
// Ported from backend/routes/paymongo.js. The hardcoded EARLY149 coupon was
// dropped (expired 2026-03-31) — referral_coupons is the only coupon source.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export const PAYMONGO_API = 'https://api.paymongo.com/v1'
export const PLAN_PRICE_CENTAVOS = 29900 // ₱299.00
export const PLAN_CURRENCY = 'PHP'
export const PLAN_DESCRIPTION = 'BatchMyPhotos Pro — Monthly Subscription'

export const paymongoAuth = () =>
  'Basic ' + btoa(Deno.env.get('PAYMONGO_SECRET_KEY') + ':')

export interface Coupon {
  id: string
  code: string
  discountedPriceCentavos: number
  description: string
  expiresAt: Date
  isReferral: true
}

export async function lookupReferralCoupon(supabase: SupabaseClient, code: string): Promise<Coupon | null> {
  const { data } = await supabase
    .from('referral_coupons')
    .select('*')
    .eq('code', code.toUpperCase().trim())
    .eq('is_active', true)
    .single()
  if (!data) return null
  return {
    id: data.id,
    code: data.code,
    discountedPriceCentavos: data.discounted_price_centavos,
    description: data.description,
    expiresAt: new Date(data.expires_at),
    isReferral: true,
  }
}

async function recordReferralUsage(supabase: SupabaseClient, couponCode: string, userId: string) {
  try {
    const { data: coupon } = await supabase
      .from('referral_coupons').select('id').eq('code', couponCode).single()
    if (!coupon) return
    const { error } = await supabase.from('referral_usage').insert({
      coupon_id: coupon.id,
      user_id: userId,
      coupon_code: couponCode,
      used_at: new Date().toISOString(),
    })
    if (error && error.code !== '23505') console.error('Record referral usage error:', error)
  } catch (err) {
    console.error('Record referral usage error:', err)
  }
}

/**
 * Activate a paid Pro subscription: upsert subscriptions (+30d), insert the
 * transaction row (idempotent on paymongo_checkout_id), record referral usage.
 * Returns { expiresAt, txCreated } — txCreated=false means this payment was
 * already processed (webhook/verify-payment overlap), so skip the email.
 */
export async function activateSubscription(supabase: SupabaseClient, opts: {
  userId: string
  checkoutId: string
  paymentId?: string
  couponCode: string | null
}): Promise<{ expiresAt: string; amount: number; txCreated: boolean }> {
  const { userId, checkoutId, paymentId, couponCode } = opts

  const couponDef = couponCode ? await lookupReferralCoupon(supabase, couponCode) : null
  const amount = couponDef ? couponDef.discountedPriceCentavos : PLAN_PRICE_CENTAVOS

  const paidAt = new Date()
  const expiresAt = new Date(paidAt)
  expiresAt.setDate(expiresAt.getDate() + 30)

  const { error: upsertError } = await supabase.from('subscriptions').upsert({
    user_id: userId,
    plan: 'pro',
    status: 'active',
    device_limit: 2,
    device_removals_limit: 3,
    device_removals_reset_at: expiresAt.toISOString(),
    paymongo_checkout_id: checkoutId,
    paymongo_payment_id: paymentId,
    amount,
    currency: PLAN_CURRENCY,
    paid_at: paidAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (upsertError) throw new Error(`subscriptions upsert failed: ${upsertError.message}`)

  const { data: existingTx } = await supabase
    .from('transactions').select('id').eq('paymongo_checkout_id', checkoutId).single()

  let txCreated = false
  if (!existingTx) {
    await supabase.from('transactions').insert({
      user_id: userId,
      amount,
      currency: PLAN_CURRENCY,
      status: 'paid',
      description: couponCode ? `${PLAN_DESCRIPTION} (${couponCode})` : PLAN_DESCRIPTION,
      paymongo_checkout_id: checkoutId,
      coupon_code: couponCode,
      created_at: paidAt.toISOString(),
    })
    txCreated = true
  }

  if (couponCode && couponDef?.isReferral) {
    await recordReferralUsage(supabase, couponCode, userId)
  }

  return { expiresAt: expiresAt.toISOString(), amount, txCreated }
}
