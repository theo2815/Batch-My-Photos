'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { Mail, ArrowLeft, Loader2, ShieldCheck, RefreshCw } from 'lucide-react'

export default function VerifyEmail() {
  const router = useRouter()

  // Read email + desktop flag passed from Login/Register via sessionStorage nav state.
  // Starts null until the mount effect runs, so the redirect check waits for it.
  const [email, setEmail] = useState(null)
  const [isDesktop, setIsDesktop] = useState(false)
  const [stateLoaded, setStateLoaded] = useState(false)

  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // Resend cooldown
  const [resendCooldown, setResendCooldown] = useState(0)
  const [resendCount, setResendCount] = useState(0)
  const MAX_RESENDS = 3

  // Load nav state on mount
  useEffect(() => {
    const raw = sessionStorage.getItem('bmp_nav_state')
    sessionStorage.removeItem('bmp_nav_state')
    try {
      const state = raw ? JSON.parse(raw) : null
      if (state?.email) {
        setEmail(state.email)
        setIsDesktop(!!state.isDesktop)
      }
    } catch {
      // Malformed nav state — treated as missing
    }
    setStateLoaded(true)
  }, [])

  // If no email in state, user navigated here directly — redirect to register
  useEffect(() => {
    if (stateLoaded && !email) {
      router.replace('/register')
    }
  }, [stateLoaded, email, router])

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
      router.push(isDesktop ? '/auth/desktop-callback' : '/dashboard')
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
      </div>

      {/* ── Card ── */}
      <div className="auth-card-in relative z-10 w-full max-w-md">
        <div className="rounded-2xl border border-border-subtle bg-bg-surface backdrop-blur-xl shadow-2xl shadow-black/30 p-8 sm:p-10">

          {/* Logo + heading */}
          <div className="text-center mb-8">
            <Link href="/" className="inline-flex items-center gap-2.5 group mb-6">
              <div className="w-12 h-12 rounded-xl bg-bg-elevated border border-border-subtle shadow-card flex items-center justify-center">
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
            <div className="mb-6 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
              <span className="shrink-0 mt-0.5">⚠</span>
              <span>{error}</span>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="mb-6 rounded-xl px-4 py-3 text-sm flex items-start gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-700">
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
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98] cursor-pointer"
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
              href="/register"
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
