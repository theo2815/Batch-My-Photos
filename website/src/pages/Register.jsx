
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTheme } from '../context/ThemeContext'
import { Mail, Lock, Eye, EyeOff, User, ShieldCheck, ArrowRight, Loader2, Sparkles } from 'lucide-react'
import GoogleAuthButton from '../components/GoogleAuthButton'
import { getPasswordStrength } from '../utils/passwordStrength'
import InfoModal from '../components/modals/InfoModal'

export default function Register() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isDesktop = searchParams.get('desktop') === 'true'
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState(false)
  const [activeModal, setActiveModal] = useState(null)
  const { isDark } = useTheme()

  const handleRegister = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      setLoading(false)
      return
    }

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
      },
    })

    if (authError) {
      setError(authError.message)
    } else if (!data.session) {
      // Email confirmation is required — user has no session yet
      setConfirmEmail(true)
    } else {
      navigate(isDesktop ? '/auth/desktop-callback' : '/dashboard')
    }
    setLoading(false)
  }

  const strength = getPasswordStrength(password)

  return (
    <div className={`relative min-h-screen flex items-center justify-center ${isDark ? 'bg-bg-main' : 'bg-gray-50'} overflow-hidden px-4 py-20`}>
      {/* ── Background orbs (matching hero / login) ── */}
      <div className="absolute inset-0 pointer-events-none">
        <div className={`hero-orb-1 absolute top-1/3 -right-32 w-96 h-96 rounded-full blur-3xl ${isDark ? 'bg-accent/15' : 'bg-accent/10'}`} />
        <div className={`hero-orb-2 absolute bottom-1/4 -left-32 w-96 h-96 rounded-full blur-3xl ${isDark ? 'bg-primary/15' : 'bg-primary/10'}`} />
        <div className={`absolute top-0 left-0 w-full h-full ${isDark ? 'bg-[radial-gradient(ellipse_at_center,rgba(0,209,255,0.05)_0%,transparent_70%)]' : 'bg-[radial-gradient(ellipse_at_center,rgba(0,209,255,0.03)_0%,transparent_70%)]'}`} />
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
            <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Create your account</h1>
            <p className={`mt-2 text-sm ${isDark ? 'text-text-secondary' : 'text-gray-500'}`}>Start organizing your photos in minutes</p>
          </div>

          {/* Google Register */}
          <div className="mb-6">
            <GoogleAuthButton text="Sign up with Google" isDesktop={isDesktop} />
          </div>

          {/* Divider */}
          <div className="mb-6 flex items-center gap-3">
            <div className={`flex-1 h-px ${isDark ? 'bg-white/[0.06]' : 'bg-gray-200'}`} />
            <span className={`text-xs ${isDark ? 'text-text-muted' : 'text-gray-400'} uppercase tracking-wider`}>or sign up with email</span>
            <div className={`flex-1 h-px ${isDark ? 'bg-white/[0.06]' : 'bg-gray-200'}`} />
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-300 flex items-start gap-2">
              <span className="shrink-0 mt-0.5">⚠</span>
              <span>{error}</span>
            </div>
          )}

          {/* Email confirmation notice */}
          {confirmEmail && (
            <div className={`mb-6 rounded-xl px-5 py-4 text-center ${isDark ? 'bg-primary/10 border border-primary/20' : 'bg-primary/5 border border-primary/20'}`}>
              <Mail className={`w-8 h-8 mx-auto mb-3 ${isDark ? 'text-accent' : 'text-primary'}`} />
              <h2 className={`text-lg font-bold mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>Check your email</h2>
              <p className={`text-sm ${isDark ? 'text-text-secondary' : 'text-gray-500'}`}>
                We sent a confirmation link to <strong className={isDark ? 'text-white' : 'text-gray-900'}>{email}</strong>. Click the link to activate your account.
              </p>
              <Link to="/login" className={`inline-block mt-4 text-sm font-semibold ${isDark ? 'text-accent hover:text-accent' : 'text-primary hover:text-primary-hover'} transition-colors`}>
                Go to Sign In
              </Link>
            </div>
          )}

          {/* Form */}
          {!confirmEmail && <form onSubmit={handleRegister} className="space-y-5">
            {/* Name */}
            <div>
              <label htmlFor="name" className={`block text-sm font-medium ${isDark ? 'text-text-secondary' : 'text-gray-700'} mb-2`}>
                Full name
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <User className={`w-4 h-4 ${isDark ? 'text-text-muted' : 'text-gray-400'}`} />
                </div>
                <input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  className={`auth-input block w-full rounded-xl border ${isDark ? 'border-white/[0.08] bg-white/[0.04] text-white placeholder:text-text-muted' : 'border-gray-300 bg-gray-50 text-gray-900 placeholder:text-gray-400'} py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all`}
                />
              </div>
            </div>

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
              <label htmlFor="password" className={`block text-sm font-medium ${isDark ? 'text-text-secondary' : 'text-gray-700'} mb-2`}>
                Password
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <Lock className={`w-4 h-4 ${isDark ? 'text-text-muted' : 'text-gray-400'}`} />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
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
              {/* Strength meter */}
              {password && (
                <div className="mt-2.5 space-y-1.5">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= strength.level ? strength.color : isDark ? 'bg-white/[0.06]' : 'bg-gray-200'}`} />
                    ))}
                  </div>
                  <p className={`text-xs ${strength.level <= 1 ? 'text-red-400' : strength.level <= 2 ? 'text-amber-400' : strength.level <= 3 ? 'text-accent' : 'text-emerald-400'}`}>
                    {strength.label}
                  </p>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className={`block text-sm font-medium ${isDark ? 'text-text-secondary' : 'text-gray-700'} mb-2`}>
                Confirm password
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <Lock className={`w-4 h-4 ${isDark ? 'text-text-muted' : 'text-gray-400'}`} />
                </div>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`auth-input block w-full rounded-xl border ${isDark ? 'bg-white/[0.04] text-white placeholder:text-text-muted' : 'bg-gray-50 text-gray-900 placeholder:text-gray-400'} py-3 pl-10 pr-11 text-sm focus:outline-none focus:ring-2 transition-all ${
                    confirmPassword && confirmPassword !== password
                      ? 'border-red-500/40 focus:border-red-500/50 focus:ring-red-500/20'
                      : confirmPassword && confirmPassword === password
                        ? 'border-emerald-500/40 focus:border-emerald-500/50 focus:ring-emerald-500/20'
                        : `${isDark ? 'border-white/[0.08]' : 'border-gray-300'} focus:border-primary/50 focus:ring-primary/20`
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className={`absolute inset-y-0 right-0 flex items-center pr-3.5 ${isDark ? 'text-text-muted hover:text-text-secondary' : 'text-gray-400 hover:text-gray-600'} transition-colors`}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmPassword && confirmPassword !== password && (
                <p className="mt-1.5 text-xs text-red-400">Passwords don't match</p>
              )}
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
                  Creating account…
                </>
              ) : (
                <>
                  Create account
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>}

          {!confirmEmail && (<>
          {/* Trust chips */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {[
              { icon: ShieldCheck, text: '100% private' },
              { icon: Sparkles, text: 'Free demo included' },
            ].map(({ icon: I, text }) => (
              <span key={text} className={`inline-flex items-center gap-1.5 rounded-full ${isDark ? 'bg-white/[0.04] border border-white/[0.06] text-text-muted' : 'bg-gray-100 border border-gray-200 text-gray-500'} px-3 py-1 text-xs`}>
                <I className="w-3 h-3" />
                {text}
              </span>
            ))}
          </div>

          {/* Divider */}
          <div className="my-7 flex items-center gap-3">
            <div className={`flex-1 h-px ${isDark ? 'bg-white/[0.06]' : 'bg-gray-200'}`} />
            <span className={`text-xs ${isDark ? 'text-text-muted' : 'text-gray-400'} uppercase tracking-wider`}>or</span>
            <div className={`flex-1 h-px ${isDark ? 'bg-white/[0.06]' : 'bg-gray-200'}`} />
          </div>

          {/* Login CTA */}
          <p className={`text-center text-sm ${isDark ? 'text-text-secondary' : 'text-gray-500'}`}>
            Already have an account?{' '}
            <Link to="/login" className={`font-semibold ${isDark ? 'text-accent hover:text-accent' : 'text-primary hover:text-primary-hover'} transition-colors`}>
              Sign in
            </Link>
          </p>
          </>)}
        </div>

        {/* Trust badge */}
        <div className={`mt-6 flex flex-col items-center gap-4 text-xs ${isDark ? 'text-text-muted' : 'text-gray-400'}`}>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>No credit card required · Cancel anytime</span>
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
