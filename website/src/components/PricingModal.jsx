'use client'


import { useState } from 'react'
import { Check, X, Sparkles, ArrowRight, Tag, Loader2 } from 'lucide-react'
import ModalShell from './modals/ModalShell'

export default function PricingModal({ isOpen, onClose, onUpgrade, onStartTrial, checkoutLoading, onValidateCoupon, isPro = false, freeTrialUsed = false, subscriptionLoading = false, isTrialActive = false }) {
  // Free trial is available only once data is loaded and user hasn't used it
  const isTrialAvailable = !subscriptionLoading && !freeTrialUsed && !isPro

  // Coupon state
  const [couponInput, setCouponInput] = useState('')
  const [couponLoading, setCouponLoading] = useState(false)
  const [couponResult, setCouponResult] = useState(null) // { valid, code, discountedPrice, ... } or { valid: false, reason }
  const [couponError, setCouponError] = useState('')
  const [checkoutError, setCheckoutError] = useState('')
  const [trialLoading, setTrialLoading] = useState(false)

  const appliedCoupon = couponResult?.valid ? couponResult : null
  const displayPrice = isTrialAvailable ? 0 : (appliedCoupon ? appliedCoupon.discountedPrice / 100 : 299)

  const handleApplyCoupon = async () => {
    const code = couponInput.trim().toUpperCase()
    if (!code) { setCouponError('Please enter a coupon code.'); return }
    if (!onValidateCoupon) return

    setCouponLoading(true)
    setCouponError('')
    setCouponResult(null)
    try {
      const result = await onValidateCoupon(code)
      if (result.valid) {
        setCouponResult(result)
        setCouponError('')
      } else {
        setCouponError(result.reason || 'Invalid coupon code.')
        setCouponResult(null)
      }
    } catch {
      setCouponError('Failed to validate coupon.')
    } finally {
      setCouponLoading(false)
    }
  }

  const handleRemoveCoupon = () => {
    setCouponResult(null)
    setCouponInput('')
    setCouponError('')
  }

  const handleUpgradeClick = async () => {
    setCheckoutError('')
    try {
      if (isTrialAvailable && onStartTrial) {
        setTrialLoading(true)
        await onStartTrial()
      } else {
        await onUpgrade(appliedCoupon?.code || null)
      }
    } catch (err) {
      setCheckoutError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setTrialLoading(false)
    }
  }

  // Reset state when modal closes
  const handleClose = () => {
    setCouponInput('')
    setCouponResult(null)
    setCouponError('')
    setCheckoutError('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <ModalShell title="Upgrade Plan" icon={Sparkles} maxWidth="max-w-5xl" bodyClassName="px-8 py-8" onClose={handleClose}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Free Plan */}
        <div className="relative p-6 rounded-2xl border border-border-subtle bg-bg-elevated flex flex-col">
          <div className="flex items-baseline gap-1 mb-1">
            <h3 className="font-display text-2xl font-bold text-text-primary">Free</h3>
          </div>
          <p className="text-sm text-text-secondary mb-6">For casual use</p>

          <ul className="space-y-4 text-sm">
            <li className="flex items-center gap-3 text-text-secondary">
              <Check className="w-4 h-4 shrink-0 text-text-muted" />
              <span>Unlimited batches</span>
            </li>
            <li className="flex items-center gap-3 text-text-secondary">
              <Check className="w-4 h-4 shrink-0 text-text-muted" />
              <span>Internet connection required</span>
            </li>
            <li className="flex items-center gap-3 text-text-secondary">
              <Check className="w-4 h-4 shrink-0 text-text-muted" />
              <span>1 device</span>
            </li>
          </ul>
        </div>

        {/* Pro Plan */}
        <div className="relative p-6 rounded-2xl border border-primary/30 bg-primary/[0.06] overflow-hidden flex flex-col">
          {/* Glow effect */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

          <div className="flex items-center gap-2 mb-3 relative z-10">
            {isPro ? (
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-emerald-600 text-white">{isTrialActive ? 'Current Plan (Free Trial)' : 'Current Plan'}</span>
            ) : (
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-primary text-white">Recommended</span>
            )}
          </div>
          <div className="flex items-baseline gap-1 mb-2 relative z-10">
            <h3 className="font-display text-2xl font-bold text-text-primary">Pro</h3>
            {subscriptionLoading ? (
              <span className="font-mono text-xl font-bold text-accent">— ₱299/mo</span>
            ) : isTrialAvailable ? (
              <span className="font-mono text-xl font-bold text-accent">— ₱0 <span className="text-sm font-normal opacity-60">for 30 days</span></span>
            ) : appliedCoupon ? (
              <span className="font-mono text-xl font-bold text-accent">
                — <span className="line-through opacity-50">₱299</span> ₱{displayPrice}/mo
              </span>
            ) : (
              <span className="font-mono text-xl font-bold text-accent">— ₱299/mo</span>
            )}
          </div>
          <p className="text-sm text-accent/70 mb-6 relative z-10">For power users</p>

          <ul className="space-y-4 text-sm relative z-10 mb-8">
            {[
              'Unlimited batches',
              'Offline batching',
              'Up to 2 devices',
            ].map((input) => (
              <li key={input} className="flex items-center gap-3 text-text-primary font-medium">
                <Check className="w-4 h-4 shrink-0 text-emerald-700" />
                <span>{input}</span>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-3 mt-auto relative z-10">
            {isPro ? (
              /* ── Already Pro (paid or trial): show "Current Plan" indicator ── */
              <div className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 border border-success/30 bg-success/10 text-success">
                <Check className="w-4 h-4" />
                <span>{isTrialActive ? 'Current Plan (Free Trial)' : 'Current Plan'}</span>
              </div>
            ) : (
              /* ── Not Pro: show coupon input (if not trial) + upgrade/trial button ── */
              <>
                {/* Coupon input — hidden when free trial is available */}
                {!isTrialAvailable && (
                  <>
                    {!appliedCoupon ? (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary/50" />
                            <input
                              type="text"
                              value={couponInput}
                              onChange={(e) => { setCouponInput(e.target.value); setCouponError('') }}
                              onKeyDown={(e) => e.key === 'Enter' && handleApplyCoupon()}
                              placeholder="Coupon code"
                              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-border-subtle bg-bg-elevated text-text-primary placeholder:text-text-muted focus:border-primary/50 outline-none transition-colors font-mono"
                              disabled={couponLoading}
                            />
                          </div>
                          <button
                            onClick={handleApplyCoupon}
                            disabled={couponLoading || !couponInput.trim()}
                            className="px-3 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer bg-primary/20 text-accent hover:bg-primary/30 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                          >
                            {couponLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Apply'}
                          </button>
                        </div>
                        {couponError && (
                          <p className="text-[11px] text-red-700 px-1">{couponError}</p>
                        )}
                        <a
                          href="https://web.facebook.com/people/Batch-My-Photos/61588309656493/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] px-1 transition-colors text-accent hover:text-accent/80 hover:underline"
                        >
                          Claim your coupon here →
                        </a>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-success/30 bg-success/10">
                        <div className="flex items-center gap-2">
                          <Tag className="w-3.5 h-3.5 text-emerald-700" />
                          <span className="text-xs font-semibold font-mono text-success">{appliedCoupon.code}</span>
                          <span className="text-[11px] text-success/70">— First month only</span>
                        </div>
                        <button onClick={handleRemoveCoupon} className="text-success hover:text-error transition-colors cursor-pointer">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </>
                )}

                {checkoutError && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs border-red-500/30 bg-red-500/10 text-red-700">
                    <X className="w-3.5 h-3.5 shrink-0" />
                    <span>{checkoutError}</span>
                  </div>
                )}

                <button
                  onClick={handleUpgradeClick}
                  disabled={checkoutLoading || trialLoading}
                  className={`w-full py-3 rounded-xl bg-primary hover:bg-primary-hover text-sm font-semibold text-white transition-all cursor-pointer flex items-center justify-center gap-2 ${(checkoutLoading || trialLoading) ? 'opacity-75 cursor-wait' : ''}`}
                >
                  {(checkoutLoading || trialLoading) ? (
                    <div className="flex items-center gap-2">
                       <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin block" />
                      <span>{isTrialAvailable ? 'Activating…' : 'Redirecting...'}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span>{isTrialAvailable ? 'Start Your Free Trial' : 'Upgrade Now'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  )}
                </button>
                <div className="flex items-center justify-center gap-2">
                   <span className="text-[10px] text-accent/60 text-center">
                     {isTrialAvailable ? '30-day free trial · No payment required' : 'Secured by PayMongo'}
                   </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Pro+ Plan */}
        <div className="relative p-6 rounded-2xl border border-accent/30 bg-accent/[0.06] overflow-hidden opacity-90 flex flex-col">
          {/* Glow effect */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-accent/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

          <div className="flex items-center gap-2 mb-3 relative z-10">
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-warning text-white shadow-md shadow-warning/30">Coming Soon</span>
          </div>
          <div className="flex items-baseline gap-1 mb-2 relative z-10">
            <h3 className="font-display text-2xl font-bold text-text-primary">Pro+</h3>
            <span className="font-mono text-xl font-bold text-accent">— ₱₱₱/mo</span>
          </div>
          <p className="text-sm text-accent/70 mb-6 relative z-10">For professionals</p>

          <ul className="space-y-4 text-sm relative z-10 mb-8">
            {[
              'Unlimited batches',
              'Offline batching',
              'Up to 3 devices',
              'Custom Watermarks',
              'Blur detection',
            ].map((input) => (
              <li key={input} className="flex items-center gap-3 text-text-primary font-medium">
                <Check className="w-4 h-4 shrink-0 text-accent" />
                <span>{input}</span>
              </li>
            ))}
          </ul>

          <button
            disabled
            className="w-full py-3 rounded-xl bg-bg-elevated text-sm font-semibold text-text-muted cursor-not-allowed border border-border-subtle flex items-center justify-center gap-2 mt-auto"
          >
            Not Available Yet
          </button>
        </div>
      </div>
      <div className="text-center mt-6 relative z-10 text-accent/60">
        <p className="text-xs font-semibold">Manual monthly payment.</p>
        <p className="text-[11px] mt-1 leading-relaxed">Your subscription will not auto-renew. When your Pro access expires, you can manually renew anytime.</p>
        <div className="flex items-center justify-center gap-4 mt-2">
          <span className="flex items-center gap-1 text-[11px]"><Check className="w-3 h-3" /> No automatic charges</span>
          <span className="flex items-center gap-1 text-[11px]"><Check className="w-3 h-3" /> Full control over payments</span>
        </div>
      </div>
    </ModalShell>
  )
}
