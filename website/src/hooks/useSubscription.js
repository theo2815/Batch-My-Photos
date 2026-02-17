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
    const controller = new AbortController()
    fetchSubscription(controller.signal)
    return () => controller.abort()
  }, [fetchSubscription])

  /**
   * Creates a PayMongo checkout session and returns the checkout URL.
   * Also saves checkout_id to localStorage for verification on return.
   */
  const createCheckout = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

    const res = await fetch(`${API_BASE}/api/checkout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        redirect_url: window.location.origin
      })
    })

    if (!res.ok) {
      const errData = await res.json()
      throw new Error(errData.error || 'Failed to create checkout session')
    }

    const { checkout_url, checkout_id } = await res.json()

    // Save checkout_id for verification when user returns
    if (checkout_id) {
      localStorage.setItem('pending_checkout_id', checkout_id)
    }

    return checkout_url
  }, [])

  /**
   * Verifies a pending payment directly with PayMongo API (webhook fallback).
   * Checks localStorage for pending checkout_id.
   * Returns { verified, plan, status } or null if no pending checkout.
   */
  const verifyPayment = useCallback(async () => {
    const checkoutId = localStorage.getItem('pending_checkout_id')
    if (!checkoutId) return null

    try {
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
        console.error('Verify payment error:', errData)
        return null
      }

      const result = await res.json()

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

  return { subscription, loading, error, refetch: fetchSubscription, createCheckout, verifyPayment, cancelSubscription }
}
