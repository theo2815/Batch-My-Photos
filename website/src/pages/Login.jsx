
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTheme } from '../context/ThemeContext'
import { Camera, Mail, Lock, Eye, EyeOff, ShieldCheck, ArrowRight, Loader2 } from 'lucide-react'

export default function Login() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const { isDark } = useTheme()

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
    } else {
      navigate('/dashboard')
    }
    setLoading(false)
  }

  return (
    <div className={`relative min-h-screen flex items-center justify-center ${isDark ? 'bg-slate-950' : 'bg-gray-50'} overflow-hidden px-4 py-20`}>
      {/* ── Background orbs (matching hero) ── */}
      <div className="absolute inset-0 pointer-events-none">
        <div className={`hero-orb-1 absolute top-1/4 -left-32 w-96 h-96 rounded-full blur-3xl ${isDark ? 'bg-indigo-600/15' : 'bg-indigo-200/40'}`} />
        <div className={`hero-orb-2 absolute bottom-1/4 -right-32 w-96 h-96 rounded-full blur-3xl ${isDark ? 'bg-purple-600/15' : 'bg-purple-200/40'}`} />
        <div className={`absolute top-0 left-0 w-full h-full ${isDark ? 'bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.05)_0%,transparent_70%)]' : 'bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.03)_0%,transparent_70%)]'}`} />
      </div>

      {/* ── Card ── */}
      <div className="auth-card-in relative z-10 w-full max-w-md">
        <div className={`rounded-2xl border ${isDark ? 'border-white/[0.08] bg-white/[0.03] backdrop-blur-xl shadow-2xl shadow-black/40' : 'border-gray-200 bg-white shadow-xl shadow-gray-200/50'} p-8 sm:p-10`}>

          {/* Logo + heading */}
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex items-center gap-2.5 group mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                <Camera className="w-5 h-5 text-white" />
              </div>
              <span className={`text-lg font-bold ${isDark ? 'text-white group-hover:text-indigo-300' : 'text-gray-900 group-hover:text-indigo-600'} transition-colors`}>Batch My Photos</span>
            </Link>
            <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Welcome back</h1>
            <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Sign in to continue organizing your photos</p>
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
              <label htmlFor="email" className={`block text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-700'} mb-2`}>
                Email address
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <Mail className={`w-4 h-4 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
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
                  className={`auth-input block w-full rounded-xl border ${isDark ? 'border-white/[0.08] bg-white/[0.04] text-white placeholder:text-slate-600' : 'border-gray-300 bg-gray-50 text-gray-900 placeholder:text-gray-400'} py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all`}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="password" className={`block text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                  Password
                </label>
                <button type="button" className={`text-xs ${isDark ? 'text-indigo-400 hover:text-indigo-300' : 'text-indigo-600 hover:text-indigo-500'} transition-colors`}>
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <Lock className={`w-4 h-4 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
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
                  className={`auth-input block w-full rounded-xl border ${isDark ? 'border-white/[0.08] bg-white/[0.04] text-white placeholder:text-slate-600' : 'border-gray-300 bg-gray-50 text-gray-900 placeholder:text-gray-400'} py-3 pl-10 pr-11 text-sm focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute inset-y-0 right-0 flex items-center pr-3.5 ${isDark ? 'text-slate-500 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600'} transition-colors`}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <div className="flex items-center gap-2">
              <input
                id="remember"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className={`w-4 h-4 rounded ${isDark ? 'border-white/[0.15] bg-white/[0.04]' : 'border-gray-300 bg-white'} text-indigo-500 focus:ring-indigo-500/30 focus:ring-offset-0 cursor-pointer`}
              />
              <label htmlFor="remember" className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'} cursor-pointer select-none`}>
                Remember me
              </label>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer"
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
            <span className={`text-xs ${isDark ? 'text-slate-600' : 'text-gray-400'} uppercase tracking-wider`}>or</span>
            <div className={`flex-1 h-px ${isDark ? 'bg-white/[0.06]' : 'bg-gray-200'}`} />
          </div>

          {/* Register CTA */}
          <p className={`text-center text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
            Don't have an account?{' '}
            <Link to="/register" className={`font-semibold ${isDark ? 'text-indigo-400 hover:text-indigo-300' : 'text-indigo-600 hover:text-indigo-500'} transition-colors`}>
              Create one for free
            </Link>
          </p>
        </div>

        {/* Trust badge */}
        <div className={`mt-6 flex items-center justify-center gap-2 text-xs ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Your photos are safe — everything stays on your device</span>
        </div>
      </div>
    </div>
  )
}
