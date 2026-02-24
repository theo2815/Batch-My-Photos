import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTheme } from '../context/ThemeContext'

const API_BASE = import.meta.env.VITE_API_URL || ''

/**
 * Route guard — requires active Supabase session + admin role verified by backend.
 * Non-admins see a 404-style page (don't reveal admin routes exist).
 * No admin emails are hardcoded in the frontend — the backend owns the allowlist.
 */
export default function AdminRoute({ children }) {
  const [state, setState] = useState('loading') // 'loading' | 'admin' | 'denied' | 'unauthenticated'
  const { isDark } = useTheme()

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        setState('unauthenticated')
        return
      }

      // Ask the backend if this user is an admin (no hardcoded emails in frontend)
      try {
        const res = await fetch(`${API_BASE}/api/admin/check`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setState(data.isAdmin ? 'admin' : 'denied')
        } else {
          setState('denied')
        }
      } catch {
        // Network error — deny access (admin dashboard requires connectivity)
        setState('denied')
      }
    })
  }, [])

  if (state === 'loading') {
    return (
      <div className={`min-h-screen ${isDark ? 'bg-bg-main' : 'bg-gray-50'} flex items-center justify-center`}>
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-10 h-10">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
          <p className={`text-sm ${isDark ? 'text-text-muted' : 'text-gray-400'} tracking-wide`}>Loading…</p>
        </div>
      </div>
    )
  }

  if (state === 'unauthenticated') {
    return <Navigate to="/login" replace />
  }

  // Non-admin users see a 404 page (don't reveal admin routes)
  if (state === 'denied') {
    return (
      <div className={`min-h-screen ${isDark ? 'bg-bg-main' : 'bg-gray-50'} flex flex-col items-center justify-center gap-4 px-4 text-center`}>
        <h1 className="text-6xl font-bold text-primary">404</h1>
        <p className={`text-lg ${isDark ? 'text-text-secondary' : 'text-gray-500'}`}>Page not found</p>
        <a href="/" className="mt-2 text-sm font-medium text-accent hover:text-accent transition-colors">← Back to home</a>
      </div>
    )
  }

  return children
}
