'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { Monitor, Loader2, LogOut, User } from 'lucide-react'

/**
 * ConnectApp page — shown when a user clicks "Log In" in the desktop app
 * but is ALREADY authenticated on the website.
 *
 * Displays an "Account Card" with the user's identity and a prominent
 * "Connect" button. On click, routes to /auth/desktop-callback which
 * extracts the session tokens and sends them to the desktop app via deep link.
 *
 * Security:
 * - No tokens are exposed in the URL or DOM.
 * - The existing DesktopCallback flow handles all token extraction.
 * - The desktop app verifies the token server-side before accepting it.
 * - If the session is invalid/expired, we redirect to the normal login page.
 */
export default function ConnectApp() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        // No valid session — redirect to normal login
        router.replace('/login?desktop=true')
        return
      }

      setUser(session.user)
      setLoading(false)
    }

    checkSession()
  }, [router])

  const handleConnect = () => {
    setConnecting(true)
    // Navigate to the existing callback page which extracts the session
    // tokens and triggers the deep link to the desktop app
    router.push('/auth/desktop-callback')
  }

  const handleDifferentAccount = async () => {
    // Sign out of the website session and redirect to login
    await supabase.auth.signOut()
    router.replace('/login?desktop=true')
  }

  // Derive display values from the Supabase user object
  const displayName = user?.user_metadata?.full_name
    || user?.user_metadata?.name
    || user?.email?.split('@')[0]
    || 'User'
  const displayEmail = user?.email || ''
  const avatarUrl = user?.user_metadata?.avatar_url || null

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-main">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    )
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-bg-main overflow-hidden px-4 py-20">
      {/* ── Background orbs (matching login page) ── */}
      <div className="absolute inset-0 pointer-events-none">
      </div>

      {/* ── Card ── */}
      <div className="auth-card-in relative z-10 w-full max-w-md">
        <div className="rounded-2xl border border-border-subtle bg-bg-elevated backdrop-blur-xl shadow-2xl shadow-black/40 p-8 sm:p-10">

          {/* ── Header ── */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 bg-primary/15 ring-1 ring-primary/20">
              <Monitor className="w-7 h-7 text-accent" />
            </div>
            <h1 className="font-display text-2xl font-bold text-text-primary">
              Connect to Desktop App
            </h1>
            <p className="mt-2 text-sm text-text-secondary">
              Link your account to the BatchMyPhotos desktop app
            </p>
          </div>

          {/* ── Account Card ── */}
          <div className="rounded-xl border p-4 mb-6 border-border-subtle bg-bg-elevated">
            <div className="flex items-center gap-4">
              {/* Avatar */}
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="w-12 h-12 rounded-full ring-2 ring-primary/20 object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-12 h-12 rounded-full flex items-center justify-center bg-primary/20 ring-1 ring-primary/30">
                  <User className="w-6 h-6 text-accent" />
                </div>
              )}

              {/* Name + Email */}
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-semibold truncate text-text-primary">
                  {displayName}
                </p>
                <p className="font-mono text-xs truncate text-text-secondary">
                  {displayEmail}
                </p>
              </div>

              {/* Verified badge */}
              <div className="shrink-0 px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/15 text-emerald-700">
                Signed in
              </div>
            </div>
          </div>

          {/* ── Connect Button ── */}
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="group flex w-full items-center justify-center gap-2.5 rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-white hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98] cursor-pointer"
          >
            {connecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Connecting…
              </>
            ) : (
              <>
                <Monitor className="w-4 h-4" />
                Connect to Desktop App
              </>
            )}
          </button>

          {/* ── Different account link ── */}
          <div className="mt-5 text-center">
            <button
              onClick={handleDifferentAccount}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
            >
              <LogOut className="w-3 h-3" />
              Sign in with a different account
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
