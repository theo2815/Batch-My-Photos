
import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTheme } from '../context/ThemeContext'
import { Mail, Lock, Eye, EyeOff, ShieldCheck, ArrowRight, Loader2 } from 'lucide-react'
import GoogleAuthButton from '../components/GoogleAuthButton'
import InfoModal from '../components/modals/InfoModal'

export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isDesktop = searchParams.get('desktop') === 'true'
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [activeModal, setActiveModal] = useState(null)
  const [sessionChecked, setSessionChecked] = useState(!isDesktop) // skip check for non-desktop
  const { isDark } = useTheme()

  // ── Desktop fast-path: if user already has a website session, skip login ──
  // Redirect to the ConnectApp page which shows their identity + a "Connect" button.
  useEffect(() => {
    if (!isDesktop) return

    async function checkExistingSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          navigate('/auth/connect-app', { replace: true })
          return
        }
      } catch {
        // Session check failed — fall through to normal login
      }
      setSessionChecked(true)
    }

    checkExistingSession()
  }, [isDesktop, navigate])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError(authError.message)
    } else {
      navigate(isDesktop ? '/auth/desktop-callback' : '/dashboard')
    }
    setLoading(false)
  }

  // While checking for an existing session (desktop flow), show a brief loading state
  // so the login form doesn't flash before redirecting to /auth/connect-app.
  if (!sessionChecked) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-bg-main' : 'bg-gray-50'}`}>
        <Loader2 className={`w-8 h-8 animate-spin ${isDark ? 'text-accent' : 'text-primary'}`} />
      </div>
    )
  }

  return (
    <div className={`relative min-h-screen flex items-center justify-center ${isDark ? 'bg-bg-main' : 'bg-gray-50'} overflow-hidden px-4 py-20`}>
      {/* ── Background orbs (matching hero) ── */}
      <div className="absolute inset-0 pointer-events-none">
        <div className={`hero-orb-1 absolute top-1/4 -left-32 w-96 h-96 rounded-full blur-3xl ${isDark ? 'bg-primary/15' : 'bg-primary/10'}`} />
        <div className={`hero-orb-2 absolute bottom-1/4 -right-32 w-96 h-96 rounded-full blur-3xl ${isDark ? 'bg-accent/15' : 'bg-accent/10'}`} />
        <div className={`absolute top-0 left-0 w-full h-full ${isDark ? 'bg-[radial-gradient(ellipse_at_center,rgba(46,91,255,0.05)_0%,transparent_70%)]' : 'bg-[radial-gradient(ellipse_at_center,rgba(46,91,255,0.03)_0%,transparent_70%)]'}`} />
      </div>

      {/* ── Card ── */}
      <div className="auth-card-in relative z-10 w-full max-w-md">
        <div className={`rounded-2xl border ${isDark ? 'border-white/[0.08] bg-white/[0.03] backdrop-blur-xl shadow-2xl shadow-black/40' : 'border-gray-200 bg-white shadow-xl shadow-gray-200/50'} p-8 sm:p-10`}>

          {/* Logo + heading */}
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex items-center gap-2.5 group mb-6">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${isDark ? 'from-bg-surface to-bg-main border border-white/[0.08] shadow-xl shadow-black/30' : 'from-gray-100 to-gray-200 border border-gray-200 shadow-lg shadow-gray-200/50'} flex items-center justify-center`}>
                <img src="/app_icon.png" alt="Logo" className="w-7 h-7 rounded-md" />
              </div>
              <span className={`text-lg font-bold ${isDark ? 'text-white group-hover:text-accent' : 'text-gray-900 group-hover:text-primary'} transition-colors`}>Batch My Photos</span>
            </Link>
            <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Welcome back</h1>
            <p className={`mt-2 text-sm ${isDark ? 'text-text-secondary' : 'text-gray-500'}`}>Sign in to continue organizing your photos</p>
          </div>

          {/* Google Login */}
          <div className="mb-6">
            <GoogleAuthButton isDesktop={isDesktop} />
          </div>

          {/* Divider */}
          <div className="mb-6 flex items-center gap-3">
            <div className={`flex-1 h-px ${isDark ? 'bg-white/[0.06]' : 'bg-gray-200'}`} />
            <span className={`text-xs ${isDark ? 'text-text-muted' : 'text-gray-400'} uppercase tracking-wider`}>or sign in with email</span>
            <div className={`flex-1 h-px ${isDark ? 'bg-white/[0.06]' : 'bg-gray-200'}`} />
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-300 flex items-start gap-2">
              <span className="shrink-0 mt-0.5">⚠</span>
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email */}
            <div>
              <label htmlFor="email" className={`block text-sm font-medium ${isDark ? 'text-text-secondary' : 'text-gray-700'} mb-2`}>
                Email address
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <Mail className={`w-4 h-4 ${isDark ? 'text-text-muted' : 'text-gray-400'}`} />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={`auth-input block w-full rounded-xl border ${isDark ? 'border-white/[0.08] bg-white/[0.04] text-white placeholder:text-text-muted' : 'border-gray-300 bg-gray-50 text-gray-900 placeholder:text-gray-400'} py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all`}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="password" className={`block text-sm font-medium ${isDark ? 'text-text-secondary' : 'text-gray-700'}`}>
                  Password
                </label>
                <Link to="/forgot-password" className={`text-xs ${isDark ? 'text-accent hover:text-accent' : 'text-primary hover:text-primary-hover'} transition-colors`}>
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <Lock className={`w-4 h-4 ${isDark ? 'text-text-muted' : 'text-gray-400'}`} />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`auth-input block w-full rounded-xl border ${isDark ? 'border-white/[0.08] bg-white/[0.04] text-white placeholder:text-text-muted' : 'border-gray-300 bg-gray-50 text-gray-900 placeholder:text-gray-400'} py-3 pl-10 pr-11 text-sm focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute inset-y-0 right-0 flex items-center pr-3.5 ${isDark ? 'text-text-muted hover:text-text-secondary' : 'text-gray-400 hover:text-gray-600'} transition-colors`}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>



            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-md shadow-primary/20 hover:bg-primary-hover hover:shadow-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98] cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="my-8 flex items-center gap-3">
            <div className={`flex-1 h-px ${isDark ? 'bg-white/[0.06]' : 'bg-gray-200'}`} />
            <span className={`text-xs ${isDark ? 'text-text-muted' : 'text-gray-400'} uppercase tracking-wider`}>or</span>
            <div className={`flex-1 h-px ${isDark ? 'bg-white/[0.06]' : 'bg-gray-200'}`} />
          </div>

          {/* Register CTA */}
          <p className={`text-center text-sm ${isDark ? 'text-text-secondary' : 'text-gray-500'}`}>
            Don't have an account?{' '}
            <Link to="/register" className={`font-semibold ${isDark ? 'text-accent hover:text-accent' : 'text-primary hover:text-primary-hover'} transition-colors`}>
              Create one for free
            </Link>
          </p>
        </div>

        {/* Trust badge */}
        <div className={`mt-6 flex flex-col items-center gap-4 text-xs ${isDark ? 'text-text-muted' : 'text-gray-400'}`}>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Your photos are safe — everything stays on your device</span>
          </div>
          <div className="flex gap-4">
            <button onClick={(e) => { e.preventDefault(); setActiveModal('privacyPolicy') }} className="hover:underline cursor-pointer">Privacy Policy</button>
            <span>&bull;</span>
            <button onClick={(e) => { e.preventDefault(); setActiveModal('termsOfService') }} className="hover:underline cursor-pointer">Terms of Service</button>
          </div>
        </div>
      </div>
      {activeModal && <InfoModal modalKey={activeModal} onClose={() => setActiveModal(null)} />}

    </div>
  )
}
