import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const API_BASE = import.meta.env.VITE_API_URL || ''

/**
 * Custom hook to fetch and manage the current user's subscription status.
 * Returns { subscription, loading, error, refetch, createCheckout, verifyPayment }
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
        setSubscription({ plan: 'free', status: 'active', usage: { used: 0, limit: 2 } })
        return
      }

      const res = await fetch(`${API_BASE}/api/subscription`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        signal,
      })

      if (!res.ok) {
        throw new Error('Failed to fetch subscription')
      }

      const data = await res.json()
      setSubscription(data || { plan: 'free', status: 'active', usage: { used: 0, limit: 2 } })
    } catch (err) {
      if (err.name === 'AbortError') return
      console.error('useSubscription error:', err)
      setError(err.message)
      // Fallback to free plan on error
      setSubscription({ plan: 'free', status: 'active', usage: { used: 0, limit: 2 } })
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
   * Creates a PayMongo checkout session and returns the checkout URL.
   * Also saves checkout_id to localStorage for verification on return.
   */
  const createCheckout = useCallback(async (couponCode) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

    const body = { redirect_url: window.location.origin }
    if (couponCode) body.coupon_code = couponCode

    const res = await fetch(`${API_BASE}/api/checkout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      if (res.status === 429) {
        throw new Error('You\'re doing that too fast. Please wait a few minutes and try again.')
      }
      const errData = await res.json()
      throw new Error(errData.error || 'Failed to create checkout session')
    }

    const { checkout_url, checkout_id } = await res.json()

    // Save checkout_id for verification when user returns
    if (checkout_id) {
      localStorage.setItem('pending_checkout_id', checkout_id)
    }
    
    console.log('Checkout session created:', { checkout_id, checkout_url })
    return checkout_url
  }, [])

  /**
   * Verifies a pending payment directly with PayMongo API (webhook fallback).
   * Checks localStorage for pending checkout_id.
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

      const res = await fetch(`${API_BASE}/api/verify-payment`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ checkout_id: checkoutId }),
      })

      if (!res.ok) {
        const errData = await res.json()
        console.error('Verify payment error response:', errData)
        return null
      }

      const result = await res.json()
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
   * Cancels the user's subscription immediately.
   */
  const cancelSubscription = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

    const res = await fetch(`${API_BASE}/api/cancel-subscription`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      const errData = await res.json()
      throw new Error(errData.error || 'Failed to cancel subscription')
    }

    await fetchSubscription()
    return true
  }, [fetchSubscription])

  /**
   * Validates a coupon code server-side.
   * Returns { valid, code, originalPrice, discountedPrice, description } or { valid: false, reason }
   */
  const validateCoupon = useCallback(async (code) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { valid: false, reason: 'Not authenticated' }

    const res = await fetch(`${API_BASE}/api/validate-coupon`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code }),
    })

    if (!res.ok) {
      if (res.status === 429) return { valid: false, reason: 'You\'re doing that too fast. Please wait a few minutes and try again.' }
      return { valid: false, reason: 'Server error' }
    }
    return res.json()
  }, [])

  return { subscription, loading, error, refetch: fetchSubscription, createCheckout, verifyPayment, cancelSubscription, validateCoupon }
}
