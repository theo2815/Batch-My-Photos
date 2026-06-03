
import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Mail, ArrowLeft, Loader2, ShieldCheck, RefreshCw } from 'lucide-react'

export default function VerifyEmail() {
  const navigate = useNavigate()
  const location = useLocation()

  // Read email + desktop flag passed from Register via navigate state
  const email = location.state?.email
  const isDesktop = location.state?.isDesktop || false

  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // Resend cooldown
  const [resendCooldown, setResendCooldown] = useState(0)
  const [resendCount, setResendCount] = useState(0)
  const MAX_RESENDS = 3

  // If no email in state, user navigated here directly — redirect to register
  useEffect(() => {
    if (!email) {
      navigate('/register', { replace: true })
    }
  }, [email, navigate])

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [resendCooldown])

  const handleVerifyOtp = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'signup',
    })

    if (verifyError) {
      setError(verifyError.message)
      setLoading(false)
    } else {
      navigate(isDesktop ? '/auth/desktop-callback' : '/dashboard')
    }
  }

  const handleResend = async () => {
    if (resendCooldown > 0 || resendCount >= MAX_RESENDS) return

    setError(null)
    setSuccess(null)

    const { error: resendError } = await supabase.auth.resend({
      email,
      type: 'signup',
    })

    if (resendError) {
      setError(resendError.message)
    } else {
      setSuccess('A new verification code has been sent to your email.')
      setResendCount((prev) => prev + 1)
      setResendCooldown(60)
    }
  }

  if (!email) return null

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-bg-main overflow-hidden px-4 py-20">
      {/* ── Background orbs ── */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="hero-orb-1 absolute top-1/3 -right-32 w-96 h-96 rounded-full blur-3xl bg-accent/15" />
        <div className="hero-orb-2 absolute bottom-1/4 -left-32 w-96 h-96 rounded-full blur-3xl bg-primary/15" />
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_center,rgba(255,122,69,0.05)_0%,transparent_70%)]" />
      </div>

      {/* ── Card ── */}
      <div className="auth-card-in relative z-10 w-full max-w-md">
        <div className="rounded-2xl border border-border-subtle bg-bg-surface backdrop-blur-xl shadow-2xl shadow-black/30 p-8 sm:p-10">

          {/* Logo + heading */}
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex items-center gap-2.5 group mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-bg-surface to-bg-main border border-border-subtle shadow-xl shadow-black/30 flex items-center justify-center">
                <img src="/app_icon.png" alt="Logo" className="w-7 h-7 rounded-md" />
              </div>
              <span className="text-lg font-bold text-text-primary group-hover:text-accent transition-colors">Batch My Photos</span>
            </Link>

            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Mail className="w-7 h-7 text-accent" />
            </div>
            <h1 className="font-display text-2xl font-bold text-text-primary">Verify your email</h1>
            <p className="mt-2 text-sm text-text-secondary">
              Enter the verification code sent to{' '}
              <strong className="text-text-primary">{email}</strong>{' '}
              to continue creating your account.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-300 flex items-start gap-2">
              <span className="shrink-0 mt-0.5">⚠</span>
              <span>{error}</span>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="mb-6 rounded-xl px-4 py-3 text-sm flex items-start gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
              <span className="shrink-0 mt-0.5">✓</span>
              <span>{success}</span>
            </div>
          )}

          {/* OTP Form */}
          <form onSubmit={handleVerifyOtp} className="space-y-5">
            <div>
              <label htmlFor="otp" className="block text-sm font-medium text-text-secondary mb-2">
                Verification code
              </label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter code"
                className="auth-input block w-full text-center tracking-[0.5em] text-xl font-bold font-mono rounded-xl border border-border-subtle bg-bg-elevated text-text-primary placeholder:text-text-muted/50 py-3.5 px-4 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>

            {/* Verify button */}
            <button
              type="submit"
              disabled={loading || otp.length < 6}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-md shadow-primary/20 hover:bg-primary-hover hover:shadow-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98] cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying…
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Verify Account
                </>
              )}
            </button>
          </form>

          {/* Resend + Back */}
          <div className="mt-6 flex flex-col items-center gap-3">
            {/* Resend */}
            <div className="text-center">
              {resendCount >= MAX_RESENDS ? (
                <p className="text-xs text-text-muted">
                  Maximum resend attempts reached. Please try registering again.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCooldown > 0}
                  className={`inline-flex items-center gap-1.5 text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed ${
                    resendCooldown > 0
                      ? 'text-text-muted'
                      : 'text-accent hover:text-accent'
                  }`}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {resendCooldown > 0
                    ? `Resend code in ${resendCooldown}s`
                    : "Didn't get the code? Resend"}
                </button>
              )}
            </div>

            {/* Divider */}
            <div className="w-full h-px bg-border-subtle" />

            {/* Back to register */}
            <Link
              to="/register"
              className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Use a different email
            </Link>
          </div>
        </div>

        {/* Trust badge */}
        <div className="mt-6 flex flex-col items-center gap-4 text-xs text-text-muted">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Your photos are safe — everything stays on your device</span>
          </div>
        </div>
      </div>
    </div>
  )
}
