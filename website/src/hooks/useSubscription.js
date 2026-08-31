'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const FREE_DEFAULTS = { plan: 'free', status: 'active', usage: { used: 0, limit: 2 } }

/**
 * Read the error payload out of a supabase.functions.invoke error.
 * FunctionsHttpError carries the Response in error.context.
 */
async function functionErrorMessage(error, fallback) {
  try {
    const body = await error.context.json()
    return body.error || fallback
  } catch {
    return fallback
  }
}

/**
 * Custom hook to fetch and manage the current user's subscription status.
 * Data layer: Supabase RPCs + Edge Functions (the Express backend is gone).
 * Returns { subscription, loading, error, refetch, createCheckout, verifyPayment,
 *           startFreeTrial, cancelSubscription, validateCoupon }
 */
export function useSubscription() {
  const [subscription, setSubscription] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchSubscription = useCallback(async (signal) => {
    try {
      setLoading(true)
      setError(null)

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setSubscription(FREE_DEFAULTS)
        return
      }

      let query = supabase.rpc('get_my_subscription')
      if (signal) query = query.abortSignal(signal)
      const { data, error: rpcError } = await query

      if (rpcError) {
        throw new Error(rpcError.message || 'Failed to fetch subscription')
      }

      setSubscription(data || FREE_DEFAULTS)
    } catch (err) {
      if (err.name === 'AbortError') return
      console.error('useSubscription error:', err)
      setError(err.message)
      // Fallback to free plan on error
      setSubscription(FREE_DEFAULTS)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    let realtimeChannel = null
    const controller = new AbortController()

    // Wrapper to safely call fetchSubscription only if mounted
    const safeFetch = () => {
      if (mounted) fetchSubscription()
    }

    // Initial fetch
    fetchSubscription(controller.signal)

    const setupRealtime = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!mounted || !session) return

      realtimeChannel = supabase
        .channel('public:subscriptions')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'subscriptions',
            filter: `user_id=eq.${session.user.id}`,
          },
          (payload) => {
            console.log('Realtime update received:', payload)
            safeFetch()
          }
        )
        .subscribe()
    }

    setupRealtime()

    return () => {
      mounted = false
      controller.abort()
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel)
      }
    }
  }, [fetchSubscription])

  /**
   * Creates a PayMongo checkout session (Edge Function) and returns the URL.
   * Also saves checkout_id to localStorage for verification on return.
   */
  const createCheckout = useCallback(async (couponCode) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

    const body = { redirect_url: window.location.origin }
    if (couponCode) body.coupon_code = couponCode

    const { data, error: fnError } = await supabase.functions.invoke('checkout', { body })
    if (fnError) {
      throw new Error(await functionErrorMessage(fnError, 'Failed to create checkout session'))
    }

    const { checkout_url, checkout_id } = data

    // Save checkout_id for verification when user returns
    if (checkout_id) {
      localStorage.setItem('pending_checkout_id', checkout_id)
    }

    console.log('Checkout session created:', { checkout_id, checkout_url })
    return checkout_url
  }, [])

  /**
   * Verifies a pending payment directly with PayMongo (webhook fallback,
   * Edge Function). Checks localStorage for pending checkout_id.
   * Returns { verified, plan, status } or null if no pending checkout.
   */
  const verifyPayment = useCallback(async () => {
    const checkoutId = localStorage.getItem('pending_checkout_id')
    if (!checkoutId) {
      console.log('No pending checkout ID found in localStorage')
      return null
    }

    try {
      console.log('Verifying payment for checkout ID:', checkoutId)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return null

      const { data: result, error: fnError } = await supabase.functions.invoke('verify-payment', {
        body: { checkout_id: checkoutId },
      })

      if (fnError) {
        console.error('Verify payment error:', await functionErrorMessage(fnError, fnError.message))
        return null
      }

      console.log('Verify payment response:', result)

      if (result.verified) {
        // Payment confirmed — clean up and refresh subscription
        localStorage.removeItem('pending_checkout_id')
        await fetchSubscription()
      }

      return result
    } catch (err) {
      console.error('verifyPayment error:', err)
      return null
    }
  }, [fetchSubscription])

  /**
   * Starts the user's one-time free trial (30 days of Pro, no payment).
   * Returns the trial result or throws on error.
   */
  const startFreeTrial = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

    const { data: result, error: rpcError } = await supabase.rpc('start_free_trial')
    if (rpcError) throw new Error(rpcError.message || 'Failed to start free trial')
    if (!result?.success) throw new Error(result?.error || 'Failed to start free trial')

    await fetchSubscription()
    return result
  }, [fetchSubscription])

  /**
   * Cancels the user's subscription immediately.
   */
  const cancelSubscription = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

    const { data: result, error: rpcError } = await supabase.rpc('cancel_my_subscription')
    if (rpcError) throw new Error(rpcError.message || 'Failed to cancel subscription')
    if (!result?.success) throw new Error(result?.error || 'Failed to cancel subscription')

    await fetchSubscription()
    return true
  }, [fetchSubscription])

  /**
   * Validates a coupon code server-side (SECURITY DEFINER RPC — users have no
   * read access to the coupons table).
   * Returns { valid, code, originalPrice, discountedPrice, description } or { valid: false, reason }
   */
  const validateCoupon = useCallback(async (code) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { valid: false, reason: 'Not authenticated' }

    const { data, error: rpcError } = await supabase.rpc('validate_coupon', { p_code: code })
    if (rpcError) return { valid: false, reason: 'Server error' }
    return data
  }, [])

  return { subscription, loading, error, refetch: fetchSubscription, createCheckout, verifyPayment, startFreeTrial, cancelSubscription, validateCoupon }
}
