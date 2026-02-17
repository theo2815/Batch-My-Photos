import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTheme } from '../context/ThemeContext'

/**
 * Route guard — redirects to /login if no active Supabase session.
 * Wrap any <Route> element that requires authentication.
 */
export default function ProtectedRoute({ children }) {
  const [session, setSession] = useState(undefined) // undefined = loading
  const { isDark } = useTheme()

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

  // Still loading
  if (session === undefined) {
    return (
      <div className={`min-h-screen ${isDark ? 'bg-slate-950' : 'bg-gray-50'} flex items-center justify-center`}>
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-10 h-10">
            <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20" />
            <div className="absolute inset-0 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          </div>
          <p className={`text-sm ${isDark ? 'text-slate-600' : 'text-gray-400'} tracking-wide`}>Loading…</p>
        </div>
      </div>
    )
  }

  // No session → redirect to login
  if (!session) {
    return <Navigate to="/login" replace />
  }

  return children
}
