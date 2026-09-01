'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { Mail, ArrowRight, Loader2, ArrowLeft, KeyRound } from 'lucide-react'

export default function ForgotPassword() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState('email') // 'email' | 'otp'
  const [error, setError] = useState(null)

  const handleSendOtp = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
        },
      })

      if (otpError) throw otpError
      setStep('otp')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error: otpError } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'email',
      })

      if (otpError) throw otpError
      // If successful, user is logged in. Redirect to update password page.
      router.push('/update-password')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

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
            <h1 className="font-display text-2xl font-bold text-text-primary">
              {step === 'email' ? 'Reset password' : 'Enter code'}
            </h1>
            <p className="mt-2 text-sm text-text-secondary">
              {step === 'email' ? 'Enter your email to receive a code' : `We sent a code to ${email}`}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
              <span className="shrink-0 mt-0.5">⚠</span>
              <span>{error}</span>
            </div>
          )}

          {step === 'email' ? (
            /* ── Step 1: Email ── */
            <form onSubmit={handleSendOtp} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-2">
                  Email address
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <Mail className="w-4 h-4 text-text-muted" />
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
                    className="auth-input block w-full rounded-xl border border-border-subtle bg-bg-elevated text-text-primary placeholder:text-text-muted py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98] cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending code…
                  </>
                ) : (
                  <>
                    Send code
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* ── Step 2: OTP ── */
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div>
                <label htmlFor="otp" className="block text-sm font-medium text-text-secondary mb-2">
                  Verification Code
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <KeyRound className="w-4 h-4 text-text-muted" />
                  </div>
                  <input
                    id="otp"
                    name="otp"
                    type="text"
                    required
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="123456"
                    className="auth-input block w-full rounded-xl border border-border-subtle bg-bg-elevated text-text-primary placeholder:text-text-muted py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98] cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verifying…
                  </>
                ) : (
                  <>
                    Verify & Continue
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setStep('email')}
                className="w-full text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
              >
                Change email
              </button>
            </form>
          )}

          {/* Back to Login */}
          <div className="mt-6 text-center">
            <Link href="/login" className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors inline-flex items-center gap-2">
              <ArrowLeft className="w-3 h-3" />
              Back to login
            </Link>
          </div>

        </div>
      </div>
    </div>
  )
}
