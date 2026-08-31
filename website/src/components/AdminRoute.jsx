'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'

/**
 * Route guard — requires active Supabase session + admin role via is_admin().
 * Non-admins see a 404-style page (don't reveal admin routes exist).
 * No admin emails are hardcoded in the frontend — the admin_users table owns it.
 */
export default function AdminRoute({ children }) {
  const router = useRouter()
  const [state, setState] = useState('loading') // 'loading' | 'admin' | 'denied' | 'unauthenticated'

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        setState('unauthenticated')
        return
      }

      try {
        const { data, error } = await supabase.rpc('is_admin')
        setState(!error && data === true ? 'admin' : 'denied')
      } catch {
        // Network error — deny access (admin dashboard requires connectivity)
        setState('denied')
      }
    })
  }, [])

  useEffect(() => {
    if (state === 'unauthenticated') router.replace('/login')
  }, [state, router])

  if (state === 'loading') {
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

  if (state === 'unauthenticated') {
    return null // redirecting to /login via the effect above
  }

  // Non-admin users see a 404 page (don't reveal admin routes)
  if (state === 'denied') {
    return (
      <div className="min-h-screen bg-bg-main flex flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="font-display text-6xl font-bold text-primary">404</h1>
        <p className="text-lg text-text-secondary">Page not found</p>
        <a href="/" className="mt-2 text-sm font-medium text-accent hover:text-accent transition-colors">← Back to home</a>
      </div>
    )
  }

  return children
}
