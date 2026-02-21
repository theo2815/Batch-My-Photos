import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTheme } from '../context/ThemeContext'
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
  const navigate = useNavigate()
  const { isDark } = useTheme()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        // No valid session — redirect to normal login
        navigate('/login?desktop=true', { replace: true })
        return
      }

      setUser(session.user)
      setLoading(false)
    }

    checkSession()
  }, [navigate])

  const handleConnect = () => {
    setConnecting(true)
    // Navigate to the existing callback page which extracts the session
    // tokens and triggers the deep link to the desktop app
    navigate('/auth/desktop-callback')
  }

  const handleDifferentAccount = async () => {
    // Sign out of the website session and redirect to login
    await supabase.auth.signOut()
    navigate('/login?desktop=true', { replace: true })
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
      <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-slate-950' : 'bg-gray-50'}`}>
        <Loader2 className={`w-8 h-8 animate-spin ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
      </div>
    )
  }

  return (
    <div className={`relative min-h-screen flex items-center justify-center ${isDark ? 'bg-slate-950' : 'bg-gray-50'} overflow-hidden px-4 py-20`}>
      {/* ── Background orbs (matching login page) ── */}
      <div className="absolute inset-0 pointer-events-none">
        <div className={`hero-orb-1 absolute top-1/4 -left-32 w-96 h-96 rounded-full blur-3xl ${isDark ? 'bg-indigo-600/15' : 'bg-indigo-200/40'}`} />
        <div className={`hero-orb-2 absolute bottom-1/4 -right-32 w-96 h-96 rounded-full blur-3xl ${isDark ? 'bg-purple-600/15' : 'bg-purple-200/40'}`} />
        <div className={`absolute top-0 left-0 w-full h-full ${isDark ? 'bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.05)_0%,transparent_70%)]' : 'bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.03)_0%,transparent_70%)]'}`} />
      </div>

      {/* ── Card ── */}
      <div className="auth-card-in relative z-10 w-full max-w-md">
        <div className={`rounded-2xl border ${isDark ? 'border-white/[0.08] bg-white/[0.03] backdrop-blur-xl shadow-2xl shadow-black/40' : 'border-gray-200 bg-white shadow-xl shadow-gray-200/50'} p-8 sm:p-10`}>

          {/* ── Header ── */}
          <div className="text-center mb-8">
            <div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 ${isDark ? 'bg-indigo-500/15 ring-1 ring-indigo-500/20' : 'bg-indigo-50 ring-1 ring-indigo-100'}`}>
              <Monitor className={`w-7 h-7 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
            </div>
            <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Connect to Desktop App
            </h1>
            <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
              Link your account to the BatchMyPhotos desktop app
            </p>
          </div>

          {/* ── Account Card ── */}
          <div className={`rounded-xl border p-4 mb-6 ${isDark ? 'border-white/[0.08] bg-white/[0.04]' : 'border-gray-200 bg-gray-50'}`}>
            <div className="flex items-center gap-4">
              {/* Avatar */}
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="w-12 h-12 rounded-full ring-2 ring-indigo-500/20 object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isDark ? 'bg-indigo-500/20 ring-1 ring-indigo-500/30' : 'bg-indigo-100 ring-1 ring-indigo-200'}`}>
                  <User className={`w-6 h-6 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
                </div>
              )}

              {/* Name + Email */}
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {displayName}
                </p>
                <p className={`text-xs truncate ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                  {displayEmail}
                </p>
              </div>

              {/* Verified badge */}
              <div className={`shrink-0 px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>
                Signed in
              </div>
            </div>
          </div>

          {/* ── Connect Button ── */}
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="group flex w-full items-center justify-center gap-2.5 rounded-xl bg-indigo-600 px-4 py-3.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/20 hover:bg-indigo-500 hover:shadow-indigo-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98] cursor-pointer"
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
              className={`inline-flex items-center gap-1.5 text-xs font-medium ${isDark ? 'text-slate-500 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600'} transition-colors cursor-pointer`}
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
