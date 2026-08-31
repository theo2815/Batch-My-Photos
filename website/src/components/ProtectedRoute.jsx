'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'

/**
 * Route guard — redirects to /login if no active Supabase session.
 * Wrap any <Route> element that requires authentication.
 */
export default function ProtectedRoute({ children }) {
  const router = useRouter()
  const [session, setSession] = useState(undefined) // undefined = loading

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    // React to auth state changes (logout, token expiry, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  // No session → redirect to login (effect, since render-time navigation
  // isn't allowed in Next)
  useEffect(() => {
    if (session === null) router.replace('/login')
  }, [session, router])

  // Still loading
  if (session === undefined) {
    return (
      <div className="min-h-screen bg-bg-main flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-10 h-10">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
          <p className="text-sm text-text-muted tracking-wide">Loading…</p>
        </div>
      </div>
    )
  }

  // No session → the effect above is redirecting; render nothing meanwhile
  if (!session) {
    return null
  }

  return children
}
