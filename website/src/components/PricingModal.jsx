
import { useState } from 'react'
import { Check, X, Sparkles, ArrowRight, Tag, Loader2 } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

export default function PricingModal({ isOpen, onClose, onUpgrade, checkoutLoading, onValidateCoupon, isPro = false }) {
  const { isDark } = useTheme()

  // Coupon state
  const [couponInput, setCouponInput] = useState('')
  const [couponLoading, setCouponLoading] = useState(false)
  const [couponResult, setCouponResult] = useState(null) // { valid, code, discountedPrice, ... } or { valid: false, reason }
  const [couponError, setCouponError] = useState('')
  const [checkoutError, setCheckoutError] = useState('')

  const appliedCoupon = couponResult?.valid ? couponResult : null
  const displayPrice = appliedCoupon ? appliedCoupon.discountedPrice / 100 : 299

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
      await onUpgrade(appliedCoupon?.code || null)
    } catch (err) {
      setCheckoutError(err.message || 'Something went wrong. Please try again.')
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={handleClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className={`relative w-full max-w-5xl max-h-[90vh] rounded-3xl border ${isDark ? 'border-white/[0.08] bg-bg-surface shadow-2xl shadow-black/50' : 'border-gray-200 bg-bg-surface-light shadow-2xl shadow-gray-300/50'} flex flex-col animate-[footerModalIn_0.2s_ease-out] overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between px-8 py-6 border-b ${isDark ? 'border-white/[0.06]' : 'border-gray-200'} shrink-0`}>
          <div className="flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl ${isDark ? 'bg-white/[0.06]' : 'bg-bg-elevated-light'} flex items-center justify-center text-accent`}>
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className={`text-2xl font-bold ${isDark ? 'text-text-primary' : 'text-text-primary-light'}`}>Upgrade Plan</h3>
          </div>
          <button onClick={handleClose} className={`w-9 h-9 rounded-xl ${isDark ? 'hover:bg-white/[0.06] text-text-muted hover:text-white' : 'hover:bg-bg-elevated-light text-gray-400 hover:text-text-primary-light'} flex items-center justify-center transition-colors cursor-pointer`} aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="px-8 py-8 overflow-y-auto flex-1 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Free Plan */}
            <div className={`relative p-6 rounded-2xl border ${isDark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-gray-200 bg-bg-elevated-light'} flex flex-col`}>
              <div className="flex items-baseline gap-1 mb-1">
                <h3 className={`text-2xl font-bold ${isDark ? 'text-text-primary' : 'text-text-primary-light'}`}>Free</h3>
              </div>
              <p className={`text-sm ${isDark ? 'text-text-secondary' : 'text-text-secondary-light'} mb-6`}>For casual use</p>
              
              <ul className="space-y-4 text-sm">
                <li className={`flex items-center gap-3 ${isDark ? 'text-text-secondary' : 'text-text-secondary-light'}`}>
                  <Check className={`w-4 h-4 shrink-0 ${isDark ? 'text-text-muted' : 'text-gray-400'}`} />
                  <span>2 batches / month</span>
                </li>
                <li className={`flex items-center gap-3 ${isDark ? 'text-text-secondary' : 'text-text-secondary-light'}`}>
                  <Check className={`w-4 h-4 shrink-0 ${isDark ? 'text-text-muted' : 'text-gray-400'}`} />
                  <span>Internet connection required</span>
                </li>
                <li className={`flex items-center gap-3 ${isDark ? 'text-text-secondary' : 'text-text-secondary-light'}`}>
                  <Check className={`w-4 h-4 shrink-0 ${isDark ? 'text-text-muted' : 'text-gray-400'}`} />
                  <span>1 device</span>
                </li>
              </ul>
            </div>

            {/* Pro Plan */}
            <div className={`relative p-6 rounded-2xl border ${isDark ? 'border-primary/30 bg-primary/[0.04]' : 'border-primary/20 bg-primary/5'} overflow-hidden flex flex-col`}>
              {/* Glow effect */}
              <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
              
              <div className="flex items-center gap-2 mb-3 relative z-10">
                {isPro ? (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/30">Current Plan</span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-gradient-to-r from-primary to-accent text-white shadow-md shadow-primary/30">Recommended</span>
                )}
              </div>
              <div className="flex items-baseline gap-1 mb-2 relative z-10">
                <h3 className={`text-2xl font-bold ${isDark ? 'text-text-primary' : 'text-text-primary-light'}`}>Pro</h3>
                {appliedCoupon ? (
                  <span className={`text-xl font-bold ${isDark ? 'text-accent' : 'text-primary'}`}>
                    — <span className="line-through opacity-50">₱299</span> ₱{displayPrice}/mo
                  </span>
                ) : (
                  <span className={`text-xl font-bold ${isDark ? 'text-accent' : 'text-primary'}`}>— ₱299/mo</span>
                )}
              </div>
              <p className={`text-sm ${isDark ? 'text-accent/70' : 'text-primary'} mb-6 relative z-10`}>For power users</p>
              
              <ul className="space-y-4 text-sm relative z-10 mb-8">
                {[
                  'Unlimited batches',
                  'Offline batching',
                  'Up to 2 devices',
                ].map((input) => (
                  <li key={input} className={`flex items-center gap-3 ${isDark ? 'text-text-primary' : 'text-text-primary-light'} font-medium`}>
                    <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>{input}</span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col gap-3 mt-auto relative z-10">
                {isPro ? (
                  /* ── Already Pro: show "Current Plan" indicator ── */
                  <div className={`w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 border ${isDark ? 'border-success/30 bg-success/10 text-success' : 'border-success/20 bg-success/5 text-success'}`}>
                    <Check className="w-4 h-4" />
                    <span>Current Plan</span>
                  </div>
                ) : (
                  /* ── Not Pro: show coupon input + upgrade button ── */
                  <>
                    {/* Coupon input */}
                    {!appliedCoupon ? (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Tag className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${isDark ? 'text-primary/50' : 'text-primary/70'}`} />
                            <input
                              type="text"
                              value={couponInput}
                              onChange={(e) => { setCouponInput(e.target.value); setCouponError('') }}
                              onKeyDown={(e) => e.key === 'Enter' && handleApplyCoupon()}
                              placeholder="Coupon code"
                              className={`w-full pl-9 pr-3 py-2 text-xs rounded-lg border ${isDark ? 'border-white/10 bg-white/[0.04] text-white placeholder:text-text-muted focus:border-primary/50' : 'border-gray-300 bg-white text-text-primary-light placeholder:text-gray-400 focus:border-primary'} outline-none transition-colors`}
                              disabled={couponLoading}
                            />
                          </div>
                          <button
                            onClick={handleApplyCoupon}
                            disabled={couponLoading || !couponInput.trim()}
                            className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${isDark ? 'bg-primary/20 text-accent hover:bg-primary/30 disabled:opacity-40' : 'bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40'} disabled:cursor-not-allowed flex items-center gap-1.5`}
                          >
                            {couponLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Apply'}
                          </button>
                        </div>
                        {couponError && (
                          <p className="text-[11px] text-red-400 px-1">{couponError}</p>
                        )}
                        <a
                          href="https://web.facebook.com/people/Batch-My-Photos/61588309656493/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`text-[11px] px-1 transition-colors ${isDark ? 'text-accent hover:text-accent/80' : 'text-primary hover:text-primary-hover'} hover:underline`}
                        >
                          Claim your coupon here →
                        </a>
                      </div>
                    ) : (
                      <div className={`flex items-center justify-between px-3 py-2 rounded-lg border ${isDark ? 'border-success/30 bg-success/10' : 'border-success/20 bg-success/5'}`}>
                        <div className="flex items-center gap-2">
                          <Tag className="w-3.5 h-3.5 text-emerald-400" />
                          <span className={`text-xs font-semibold ${isDark ? 'text-success' : 'text-success'}`}>{appliedCoupon.code}</span>
                          <span className={`text-[11px] ${isDark ? 'text-success/70' : 'text-success/80'}`}>— First month only</span>
                        </div>
                        <button onClick={handleRemoveCoupon} className="text-success hover:text-error transition-colors cursor-pointer">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {checkoutError && (
                      <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs ${isDark ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-red-200 bg-red-50 text-red-600'}`}>
                        <X className="w-3.5 h-3.5 shrink-0" />
                        <span>{checkoutError}</span>
                      </div>
                    )}

                    <button
                      onClick={handleUpgradeClick}
                      disabled={checkoutLoading}
                      className={`w-full py-3 rounded-xl bg-gradient-to-r from-primary to-primary-hover hover:from-primary-hover hover:to-accent text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-all cursor-pointer flex items-center justify-center gap-2 ${checkoutLoading ? 'opacity-75 cursor-wait' : ''}`}
                    >
                      {checkoutLoading ? (
                        <div className="flex items-center gap-2">
                           <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin block" />
                          <span>Redirecting...</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span>Upgrade Now</span>
                          <ArrowRight className="w-4 h-4" />
                        </div>
                      )}
                    </button>
                    <div className="flex items-center justify-center gap-2">
                       <span className={`text-[10px] ${isDark ? 'text-accent/60' : 'text-primary/80'} text-center`}>Secured by PayMongo</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Pro+ Plan */}
            <div className={`relative p-6 rounded-2xl border ${isDark ? 'border-accent/30 bg-accent/[0.04]' : 'border-accent/20 bg-accent/5'} overflow-hidden opacity-90 flex flex-col`}>
              {/* Glow effect */}
              <div className="absolute top-0 right-0 w-48 h-48 bg-accent/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
              
              <div className="flex items-center gap-2 mb-3 relative z-10">
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-warning text-white shadow-md shadow-warning/30">Coming Soon</span>
              </div>
              <div className="flex items-baseline gap-1 mb-2 relative z-10">
                <h3 className={`text-2xl font-bold ${isDark ? 'text-text-primary' : 'text-text-primary-light'}`}>Pro+</h3>
                <span className={`text-xl font-bold ${isDark ? 'text-accent' : 'text-primary'}`}>— ₱₱₱/mo</span>
              </div>
              <p className={`text-sm ${isDark ? 'text-accent/70' : 'text-primary'} mb-6 relative z-10`}>For professionals</p>
              
              <ul className="space-y-4 text-sm relative z-10 mb-8">
                {[
                  'Unlimited batches',
                  'Offline batching',
                  'Up to 3 devices',
                  'Custom Watermarks',
                  'Blur detection',
                ].map((input) => (
                  <li key={input} className={`flex items-center gap-3 ${isDark ? 'text-text-primary' : 'text-text-primary-light'} font-medium`}>
                    <Check className="w-4 h-4 shrink-0 text-accent" />
                    <span>{input}</span>
                  </li>
                ))}
              </ul>

              <button
                disabled
                className="w-full py-3 rounded-xl bg-gray-400/20 text-sm font-semibold text-gray-400 cursor-not-allowed border border-gray-400/20 flex items-center justify-center gap-2 mt-auto"
              >
                Not Available Yet
              </button>
            </div>
          </div>
          <div className={`text-center mt-6 relative z-10 ${isDark ? 'text-accent/60' : 'text-primary'}`}>
            <p className="text-xs font-semibold">Manual monthly payment.</p>
            <p className="text-[11px] mt-1 leading-relaxed">Your subscription will not auto-renew. When your Pro access expires, you can manually renew anytime.</p>
            <div className="flex items-center justify-center gap-4 mt-2">
              <span className="flex items-center gap-1 text-[11px]"><Check className="w-3 h-3" /> No automatic charges</span>
              <span className="flex items-center gap-1 text-[11px]"><Check className="w-3 h-3" /> Full control over payments</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
