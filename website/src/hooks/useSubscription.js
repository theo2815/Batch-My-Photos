'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const FREE_DEFAULTS = { plan: 'free', status: 'active', usage: { used: 0, limit: null } }

/**
 * Custom hook to fetch and manage the current user's subscription status.
 * Data layer: Supabase RPC get_my_subscription (the Express backend is gone).
 * Returns { subscription, loading, error, refetch }
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
      // Unmount/StrictMode abort resolves as { error } rather than throwing — bail before we wrap it
      if (signal?.aborted) return

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
        .channel(`subscriptions:${session.user.id}:${Math.random().toString(36).slice(2)}`) // unique per hook instance — Navbar + Dashboard both mount this hook
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

  return { subscription, loading, error, refetch: fetchSubscription }
}
