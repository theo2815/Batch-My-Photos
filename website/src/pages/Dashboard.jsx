
import { useEffect, useState, useRef } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import PricingModal from '../components/PricingModal'
import InfoModal from '../components/modals/InfoModal'
import { supabase } from '../lib/supabase'
import { useSubscription } from '../hooks/useSubscription'
import { useDevices } from '../hooks/useDevices'
import { useTheme } from '../context/ThemeContext'
import {
  Crown, Sparkles, Download, Settings, HelpCircle, CreditCard,
  ShieldCheck, User, Key, Monitor, Smartphone, Trash2, RefreshCw,
  ArrowRight, ExternalLink, Lock, Play,
  Copy, Check, FileText, MessageCircle, X, AlertTriangle, Timer,
} from 'lucide-react'

/* ─── Modal content (dashboard-specific modals) ──────────────────────────── */
const getDashModals = () => ({
  managePlan: {
    title: 'Manage Your Plan',
    icon: CreditCard,
    color: 'text-indigo-400',
    body: null, // Placeholder — content will be injected dynamically
  },
})

function DashModal({ modalKey, onClose, onUpgrade, checkoutLoading }) {
  const { isDark } = useTheme()
  const content = getDashModals()[modalKey]
  useEffect(() => {
    if (!content) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose, content])
  if (!content) return null
  const Icon = content.icon
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className={`relative w-full max-w-lg max-h-[85vh] rounded-2xl border ${isDark ? 'border-white/[0.08] bg-slate-900 shadow-2xl shadow-black/50' : 'border-gray-200 bg-white shadow-2xl shadow-gray-300/50'} flex flex-col animate-[footerModalIn_0.2s_ease-out]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-white/[0.06]' : 'border-gray-200'} shrink-0`}>
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg ${isDark ? 'bg-white/[0.06]' : 'bg-gray-100'} flex items-center justify-center ${content.color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{content.title}</h3>
          </div>
          <button onClick={onClose} className={`w-8 h-8 rounded-lg ${isDark ? 'hover:bg-white/[0.06] text-slate-500 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-700'} flex items-center justify-center transition-colors cursor-pointer`} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1 custom-scrollbar">
          {content.body}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { isDark } = useTheme()
  const [user, setUser]             = useState(null)
  const [loading, setLoading]       = useState(true)
  const [copied, setCopied]         = useState(false)
  const [activeModal, setActiveModal] = useState(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [confirmCancel, setConfirmCancel]   = useState(false)
  const [paymentMsg, setPaymentMsg] = useState(null)
  const { subscription: sub, loading: subLoading, createCheckout, refetch: refetchSub, verifyPayment, cancelSubscription, validateCoupon } = useSubscription()
  const { devices, deviceLimit, loading: devicesLoading, error: devicesError, fetchDevices, removeDevice, removalsUsed, removalsLimit, cooldownEndsAt, removalsResetAt } = useDevices()
  const [removingDeviceId, setRemovingDeviceId] = useState(null)
  const [confirmRemoveDevice, setConfirmRemoveDevice] = useState(null) // { id, label }
  const [removeError, setRemoveError] = useState(null)
  const [cooldownText, setCooldownText] = useState('')
  const cooldownRef = useRef(null)
  const isFree = !sub || sub.plan === 'free'
  const timersRef = useRef([])

  // Clear all pending timeouts on unmount to prevent state updates after navigation
  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout)
      timersRef.current = []
    }
  }, [])

  const safeTimeout = (fn, ms) => {
    const id = setTimeout(fn, ms)
    timersRef.current.push(id)
    return id
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Fetch devices when user has a Pro subscription
  useEffect(() => {
    if (!isFree && !subLoading && user) {
      fetchDevices()
    }
  }, [isFree, subLoading, user, fetchDevices])

  // Cooldown countdown timer
  useEffect(() => {
    const tick = () => {
      if (!cooldownEndsAt) { setCooldownText(''); return }
      const ms = new Date(cooldownEndsAt).getTime() - Date.now()
      if (ms <= 0) { setCooldownText(''); return }
      const h = Math.floor(ms / 3_600_000)
      const m = Math.ceil((ms % 3_600_000) / 60_000)
      setCooldownText(h > 0 ? `${h}h ${m}m` : `${m}m`)
    }
    tick()
    cooldownRef.current = setInterval(tick, 30_000)
    return () => clearInterval(cooldownRef.current)
  }, [cooldownEndsAt])

  const atRemovalLimit = removalsUsed >= removalsLimit
  const hasCooldown = Boolean(cooldownText)

  const promptRemoveDevice = (deviceId, deviceLabel) => {
    setRemoveError(null)
    setConfirmRemoveDevice({ id: deviceId, label: deviceLabel || 'Unknown device' })
  }

  const executeRemoveDevice = async () => {
    if (!confirmRemoveDevice) return
    setRemovingDeviceId(confirmRemoveDevice.id)
    setConfirmRemoveDevice(null)
    setRemoveError(null)
    const result = await removeDevice(confirmRemoveDevice.id)
    setRemovingDeviceId(null)
    if (!result.success) {
      setRemoveError(result.error || 'Failed to remove device')
    }
  }

  const copyKey = () => {
    if (!sub?.licenseKey) return
    navigator.clipboard.writeText(sub.licenseKey)
    setCopied(true)
    safeTimeout(() => setCopied(false), 2000)
  }

  // Handle payment redirect params (?payment=success, ?payment=cancelled) or ?modal=pricing
  useEffect(() => {
    const paymentStatus = searchParams.get('payment')
    const modalParam = searchParams.get('modal')

    if (modalParam === 'pricing') {
      setActiveModal('pricing')
      // Optional: Clear the param so refreshing doesn't re-open it, 
      // but keeping it might be better for preserving state. 
      // Let's clear it to keep URL clean after opening.
      const newParams = new URLSearchParams(searchParams)
      newParams.delete('modal')
      setSearchParams(newParams, { replace: true })
    }

    // #region agent log
    if (paymentStatus === 'success') {
      setPaymentMsg({ type: 'success', text: '🎉 Verifying your payment…' })
      
      // Clean URL immediately to prevent re-triggering this effect
      const nextParams = new URLSearchParams(searchParams)
      nextParams.delete('payment')
      setSearchParams(nextParams, { replace: true })

      // Verify payment directly with PayMongo (webhook fallback)
      verifyPayment().then((result) => {
        console.log('Payment verification result:', result)
        if (result?.verified) {
          setPaymentMsg({ type: 'success', text: '🎉 Payment confirmed! Your Pro plan is now active.' })
        } else {
          // Webhook may have handled it — just refetch
          refetchSub()
          setPaymentMsg({ type: 'success', text: '🎉 Payment successful! Refreshing your plan…' })
        }
        safeTimeout(() => setPaymentMsg(null), 6000)
      })
    } else if (paymentStatus === 'cancelled') {
      setPaymentMsg({ type: 'info', text: 'Payment was cancelled. You can try again anytime.' })
      
      const nextParams = new URLSearchParams(searchParams)
      nextParams.delete('payment')
      setSearchParams(nextParams, { replace: true })
      
      safeTimeout(() => setPaymentMsg(null), 5000)
    }
  }, [searchParams])

  // Check for expired subscription and show notification
  useEffect(() => {
    if (!subLoading && sub && sub.status === 'expired' && sub.expires_at) {
      const daysExpired = Math.floor(
        (new Date() - new Date(sub.expires_at)) / (1000 * 60 * 60 * 24)
      )

      // Show notification for first 7 days
      if (daysExpired <= 7) {
        setPaymentMsg({
          type: 'warning',
          text: `Your Pro subscription expired ${daysExpired} day${daysExpired === 1 ? '' : 's'} ago. Renew now to continue using unlimited batches.`
        })
      }
    }
  }, [sub, subLoading])

  const handleUpgrade = async (couponCode = null) => {
    try {
      setCheckoutLoading(true)
      console.log('Initiating checkout process...', couponCode ? `with coupon: ${couponCode}` : '')
      
      const checkoutUrl = await createCheckout(couponCode)
      
      // Navigate to PayMongo checkout in the same tab to preserve session consistency
      if (checkoutUrl) {
        console.log('Redirecting to checkout:', checkoutUrl)
        // Force hard navigation, bypassing React router/hydration issues for external links
        window.location.href = checkoutUrl
      } else {
        throw new Error('No checkout URL returned')
      }
    } catch (err) {
      console.error('Checkout error:', err)
      setCheckoutLoading(false)
      // Re-throw so PricingModal can display the error inline
      throw err
    }
  }

  /* ── Loading state ── */
  // Only show full loading screen on initial load. 
  // If subLoading is true but we have old data (sub exists), keep showing the dashboard (optimistic/stale UI)
  if (loading || (subLoading && !sub)) return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-950' : 'bg-gray-50'} flex items-center justify-center`}>
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20" />
          <div className="absolute inset-0 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        </div>
        <p className={`text-sm ${isDark ? 'text-slate-600' : 'text-gray-400'} tracking-wide`}>Loading your dashboard…</p>
      </div>
    </div>
  )

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'
  const firstName   = displayName.split(' ')[0]
  const initials    = displayName.slice(0, 2).toUpperCase()
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : 'Recently'
  const greeting    = new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'

  return (
    <div className={`relative min-h-screen ${isDark ? 'bg-slate-950' : 'bg-gray-50'} overflow-hidden`}>

      {/* ── Ambient background (matches auth pages) ── */}
      <div className="pointer-events-none absolute inset-0">
        <div className={`hero-orb-1 absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full ${isDark ? 'bg-indigo-600/8' : 'bg-indigo-200/30'} blur-3xl`} />
        <div className={`hero-orb-2 absolute -bottom-32 -right-32 w-[420px] h-[420px] rounded-full ${isDark ? 'bg-purple-600/8' : 'bg-purple-200/30'} blur-3xl`} />
        <div className={`absolute inset-0 ${isDark ? 'bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.04)_0%,transparent_60%)]' : 'bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.03)_0%,transparent_60%)]'}`} />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-5 sm:px-8 pt-24 pb-20">

        {/* Payment notification toast */}
        {paymentMsg && (
          <div className={`mb-6 rounded-xl px-5 py-4 text-sm flex items-center gap-3 animate-[footerModalIn_0.2s_ease-out] ${
            paymentMsg.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
            : paymentMsg.type === 'error'   ? 'bg-red-500/10 border border-red-500/20 text-red-300'
            : 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-300'
          }`}>
            <span>{paymentMsg.text}</span>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            HERO  —  Welcome banner with avatar + profile menu
           ════════════════════════════════════════════════════════════════════ */}
        <section className="auth-card-in mb-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">

            {/* Left: greeting */}
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center text-lg font-bold text-white shadow-md shadow-indigo-500/20">
                  {initials}
                </div>
                <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 ${isDark ? 'border-slate-950' : 'border-gray-50'}`} title="Online" />
              </div>
              <div>
                <h1 className={`text-2xl sm:text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} leading-tight`}>
                  Good {greeting}, {firstName}
                </h1>
                <p className={`text-sm ${isDark ? 'text-slate-500' : 'text-gray-500'} mt-0.5`}>Welcome back to your BatchMyPhotos account</p>
              </div>
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-3 shrink-0">
              <Link
                to="/demo"
                className={`hidden sm:inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border ${isDark ? 'border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] text-slate-300' : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-600'} text-sm font-medium transition-colors`}
              >
                <Play className="w-3.5 h-3.5 text-indigo-400" /> Try Demo
              </Link>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════════
            DOWNLOAD  —  The primary CTA
           ════════════════════════════════════════════════════════════════════ */}
        <section className="auth-card-in mb-8" style={{ animationDelay: '0.05s' }}>
          <div className={`relative group rounded-2xl border ${isDark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-gray-200 bg-white shadow-sm'} overflow-hidden`}>
            {/* Gradient shimmer on hover */}
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/[0.04] to-purple-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="absolute top-0 right-0 w-72 h-72 bg-indigo-500/[0.03] rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/4" />

            <div className="relative p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-6">
              {/* App icon */}
              <div className={`shrink-0 w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-2xl bg-gradient-to-br ${isDark ? 'from-slate-800 to-slate-900 border border-white/[0.08] shadow-xl shadow-black/30' : 'from-gray-100 to-gray-200 border border-gray-200 shadow-lg shadow-gray-200/50'} flex items-center justify-center`}>
                <img src="/app_icon.png" alt="BatchMyPhotos" className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg" />
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <h2 className={`text-lg sm:text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} mb-1`}>Download BatchMyPhotos</h2>
                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'} leading-relaxed max-w-lg`}>
                  Organize, rename, and batch-process thousands of photos in seconds.
                  Everything runs locally, your files never leave your machine.
                </p>
              </div>

              {/* CTA */}
              <div className="shrink-0 flex flex-col gap-2.5">
                <a
                  href="https://apps.microsoft.com/detail/9N1KKMV4NX4J"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 transition-all"
                >
                  <Download className="w-4 h-4" />
                  <div className="flex flex-col items-center leading-none">
                    <span>Get it on Microsoft Store</span>
                  </div>
                </a>
                <span className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-gray-400'} text-center`}>Windows 10 / 11</span>
              </div>
            </div>

            {/* Trust strip */}
            <div className={`relative px-6 sm:px-8 py-3 border-t ${isDark ? 'border-white/[0.04]' : 'border-gray-100'} flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>
              <span className="inline-flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> 100% offline processing</span>
              <span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" /> No cloud uploads</span>
              <span className="inline-flex items-center gap-1"><Monitor className="w-3 h-3" /> Runs on your device</span>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════════
            BENTO GRID
           ════════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

          {/* ────────── Plan & Subscription  (7 cols) ────────── */}
          <section className="lg:col-span-7 auth-card-in" style={{ animationDelay: '0.1s' }}>
            <div className={`h-full rounded-2xl border ${isDark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-gray-200 bg-white shadow-sm'} p-6`}>

              {/* Header row */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                    <Crown className="w-4 h-4 text-indigo-400" />
                  </div>
                  <h3 className={`text-[15px] font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Your Plan</h3>
                </div>
                <span className={`text-[11px] font-semibold tracking-wide uppercase px-2.5 py-1 rounded-full ${
                  sub?.status === 'active'  ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20'
                : sub?.status === 'past_due'? 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20'
                :                            'bg-slate-800 text-slate-500 ring-1 ring-slate-700'
                }`}>
                  {sub?.status === 'active' ? 'Active' : sub?.status === 'past_due' ? 'Past Due' : sub?.status === 'trialing' ? 'Trial' : isFree ? 'Free' : 'Unknown'}
                </span>
              </div>

              {/* Plan name + badge */}
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/15 to-purple-500/15 border border-indigo-500/10 flex items-center justify-center">
                  {isFree
                    ? <Sparkles className="w-5 h-5 text-indigo-400" />
                    : <Crown  className="w-5 h-5 text-amber-400" />}
                </div>
                <div>
                  <p className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} tracking-tight`}>{isFree ? 'Free' : 'Pro'}</p>
                  <p className={`text-[13px] ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
                    {isFree ? 'Free forever · core features included' : sub?.expires_at ? `Active until ${new Date(sub.expires_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : 'Pro plan active'}
                  </p>
                </div>
              </div>

              {/* Quick details row */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                {[
                  { label: 'Plan', value: isFree ? 'Free' : 'Pro — ₱299/mo' },
                  { label: 'Status', value: sub?.status === 'active' ? 'Active' : sub?.status || '—' },
                  { label: 'Usage',   value: !isFree ? 'Unlimited' : `${sub?.usage?.used ?? 0} / ${sub?.usage?.limit ?? 2} batches`, full: true },
                ].map(d => (
                  <div key={d.label} className={`rounded-xl ${isDark ? 'bg-white/[0.02] border border-white/[0.04]' : 'bg-gray-50 border border-gray-200'} px-4 py-3 ${d.full ? 'col-span-2' : ''}`}>
                    <p className={`text-[11px] uppercase tracking-wider ${isDark ? 'text-slate-600' : 'text-gray-400'} mb-0.5`}>{d.label}</p>
                    <p className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>{d.value}</p>
                  </div>
                ))}
              </div>

              {/* License key (Pro only) */}
              {sub?.licenseKey && (
                <div className={`rounded-xl ${isDark ? 'bg-white/[0.02] border border-white/[0.04]' : 'bg-gray-50 border border-gray-200'} px-4 py-3 mb-6`}>
                  <p className={`text-[11px] uppercase tracking-wider ${isDark ? 'text-slate-600' : 'text-gray-400'} mb-1.5 flex items-center gap-1.5`}>
                    <Key className="w-3 h-3" /> License Key
                  </p>
                  <div className="flex items-center gap-2">
                    <code className={`flex-1 text-sm font-mono text-indigo-300 ${isDark ? 'bg-slate-900/60' : 'bg-indigo-50'} rounded-lg px-3 py-1.5 truncate select-all`}>{sub.licenseKey}</code>
                    <button onClick={copyKey} className={`shrink-0 p-2 rounded-lg ${isDark ? 'hover:bg-white/[0.05] text-slate-500 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-700'} transition-colors cursor-pointer`}>
                      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3">
                {isFree ? (
                  <div className="flex flex-col gap-1.5">
                    <button
                      onClick={() => setActiveModal('pricing')}
                      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all cursor-pointer`}
                    >
                      <Sparkles className="w-4 h-4 text-indigo-100" /> Upgrade to Pro
                    </button>
                    {/* <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-gray-400'} text-center italic`}>Under review</span> */}
                  </div>
                ) : (
                  <button onClick={() => setActiveModal('managePlan')} className={`px-5 py-2.5 rounded-xl border ${isDark ? 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-slate-300' : 'border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700'} text-sm font-medium transition-colors cursor-pointer`}>
                    Manage Plan
                  </button>
                )}
                <button onClick={() => navigate('/billing')} className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border ${isDark ? 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-slate-300' : 'border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700'} text-sm font-medium transition-colors cursor-pointer`}>
                  <CreditCard className={`w-4 h-4 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} /> Billing History
                </button>
              </div>
            </div>
          </section>

          {/* ────────── Account card  (5 cols) ────────── */}
          <section className="lg:col-span-5 auth-card-in" style={{ animationDelay: '0.15s' }}>
            <div className={`h-full rounded-2xl border ${isDark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-gray-200 bg-white shadow-sm'} p-6 flex flex-col`}>

              {/* Header */}
              <div className="flex items-center gap-2.5 mb-5">
                <div className={`w-8 h-8 rounded-lg ${isDark ? 'bg-slate-800' : 'bg-gray-100'} flex items-center justify-center`}>
                  <User className={`w-4 h-4 ${isDark ? 'text-slate-400' : 'text-gray-500'}`} />
                </div>
                <h3 className={`text-[15px] font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Account</h3>
              </div>

              {/* Avatar row */}
              <div className="flex items-center gap-3.5 mb-5">
                <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center text-base font-bold text-white shadow-md shadow-indigo-500/20 shrink-0">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'} truncate`}>{displayName}</p>
                  <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-gray-500'} truncate`}>{user?.email}</p>
                  <p className={`text-[11px] ${isDark ? 'text-slate-600' : 'text-gray-400'} mt-0.5`}>Member since {memberSince}</p>
                </div>
              </div>

              {/* Setting rows */}
              <div className="space-y-1.5 flex-1">
                {[
                  { icon: User, label: 'Edit Profile', path: '/settings' },
                  { icon: Lock, label: 'Change Password', path: '/settings#password' },
                  { icon: Settings, label: 'Preferences', path: '/settings#preferences' },
                ].map(({ icon: Icon, label, path }) => (
                  <button key={label} onClick={() => navigate(path)} className={`flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl ${isDark ? 'hover:bg-white/[0.04] text-slate-400 hover:text-slate-200' : 'hover:bg-gray-50 text-gray-500 hover:text-gray-700'} text-sm transition-colors cursor-pointer group`}>
                    <span className="flex items-center gap-2.5">
                      <Icon className={`w-3.5 h-3.5 ${isDark ? 'text-slate-600 group-hover:text-slate-400' : 'text-gray-400 group-hover:text-gray-500'} transition-colors`} /> {label}
                    </span>
                    <ArrowRight className={`w-3 h-3 ${isDark ? 'text-slate-700 group-hover:text-slate-500' : 'text-gray-300 group-hover:text-gray-400'} group-hover:translate-x-0.5 transition-all`} />
                  </button>
                ))}
              </div>

              {/* Privacy badge at bottom */}
              <div className={`mt-5 pt-4 border-t ${isDark ? 'border-white/[0.04]' : 'border-gray-100'}`}>
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-500/70 shrink-0 mt-0.5" />
                  <p className={`text-[11px] ${isDark ? 'text-slate-600' : 'text-gray-400'} leading-relaxed`}>
                    We only store your email &amp; plan — never your photos, file names, or anything from your device.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ────────── Help & Resources  (full width) ────────── */}
          {!isFree && (
          <section className="lg:col-span-12 auth-card-in" style={{ animationDelay: '0.18s' }}>
            <div className={`rounded-2xl border ${isDark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-gray-200 bg-white shadow-sm'} p-6`}>

              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                    <Monitor className="w-4 h-4 text-indigo-400" />
                  </div>
                  <h3 className={`text-[15px] font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Authorized Devices</h3>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>{devices.length} / {deviceLimit} used</span>
                  <button onClick={fetchDevices} className={`p-2 rounded-lg ${isDark ? 'hover:bg-white/[0.05] text-slate-500 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-700'} transition-colors cursor-pointer`} title="Refresh">
                    <RefreshCw className={`w-4 h-4 ${devicesLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Usage bar */}
              <div className={`w-full h-2 rounded-full ${isDark ? 'bg-white/[0.04]' : 'bg-gray-100'} mb-4 overflow-hidden`}>
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
                  style={{ width: `${Math.min((devices.length / Math.max(deviceLimit, 1)) * 100, 100)}%` }}
                />
              </div>

              {/* Removal limits info */}
              <div className={`flex items-center justify-between mb-4 text-[11px] ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>
                <span className={`flex items-center gap-1 ${atRemovalLimit ? (isDark ? 'text-red-400' : 'text-red-500') : ''}`}>
                  <Trash2 className="w-3 h-3" />
                  {removalsUsed} / {removalsLimit} removals used this month
                </span>
                {hasCooldown && (
                  <span className={`flex items-center gap-1 ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                    <Timer className="w-3 h-3" />
                    Cooldown: {cooldownText}
                  </span>
                )}
              </div>

              {/* Cooldown warning banner */}
              {hasCooldown && (
                <div className={`mb-4 rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs leading-relaxed ${isDark ? 'bg-amber-500/10 border border-amber-500/20 text-amber-300' : 'bg-amber-50 border border-amber-200 text-amber-700'}`}>
                  <Timer className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>A device was recently removed. New devices cannot be added for another <strong>{cooldownText}</strong>. Re-adding a previously used device is not affected.</span>
                </div>
              )}

              {/* At removal limit banner */}
              {atRemovalLimit && (
                <div className={`mb-4 rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs leading-relaxed ${isDark ? 'bg-red-500/10 border border-red-500/20 text-red-300' : 'bg-red-50 border border-red-200 text-red-600'}`}>
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>You&apos;ve used all {removalsLimit} device removals for this billing period. Removals will reset next month.</span>
                </div>
              )}

              {/* Error */}
              {(devicesError || removeError) && (
                <div className={`mb-4 rounded-xl px-4 py-3 text-sm ${isDark ? 'bg-red-500/10 border border-red-500/20 text-red-300' : 'bg-red-50 border border-red-200 text-red-600'}`}>
                  {devicesError || removeError}
                </div>
              )}

              {/* In-card confirmation dialog */}
              {confirmRemoveDevice && (
                <div className={`mb-4 rounded-xl p-4 ${isDark ? 'bg-amber-500/5 border border-amber-500/15' : 'bg-amber-50 border border-amber-200'}`}>
                  <div className="flex items-start gap-2.5 mb-3">
                    <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                    <div className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                      <p className="font-semibold mb-1">Remove &ldquo;{confirmRemoveDevice.label}&rdquo;?</p>
                      <ul className={`list-disc pl-4 space-y-0.5 ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
                        <li>A <strong>24-hour cooldown</strong> will start &mdash; no new devices can be added.</li>
                        <li>You have <strong>{removalsLimit - removalsUsed}</strong> removal{removalsLimit - removalsUsed !== 1 ? 's' : ''} left this month.</li>
                        <li>Re-adding the same device later will bypass the cooldown.</li>
                      </ul>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setConfirmRemoveDevice(null)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium ${isDark ? 'text-slate-400 hover:bg-white/[0.05] border border-white/[0.08]' : 'text-gray-500 hover:bg-gray-100 border border-gray-200'} transition-colors cursor-pointer`}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={executeRemoveDevice}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${isDark ? 'bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25' : 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'} transition-colors cursor-pointer`}
                    >
                      Remove Device
                    </button>
                  </div>
                </div>
              )}

              {/* Loading state */}
              {devicesLoading && devices.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <div className="relative w-8 h-8">
                    <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20" />
                    <div className="absolute inset-0 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                  </div>
                </div>
              ) : devices.length === 0 ? (
                <div className={`text-center py-8 text-sm ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>
                  <Smartphone className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No devices registered yet. Open the desktop app to bind this device.
                </div>
              ) : (
                <div className="space-y-2">
                  {devices.map((device) => {
                    const isActive = device.last_seen_at && (Date.now() - new Date(device.last_seen_at).getTime()) < 10 * 60 * 1000
                    const canRemove = !atRemovalLimit && removingDeviceId !== device.id
                    return (
                      <div key={device.id} className={`flex items-center justify-between rounded-xl px-4 py-3 ${isDark ? 'bg-white/[0.02] border border-white/[0.04]' : 'bg-gray-50 border border-gray-200'}`}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative shrink-0">
                            <Monitor className={`w-5 h-5 ${isDark ? 'text-slate-400' : 'text-gray-500'}`} />
                            {isActive && (
                              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-inherit" style={{ borderColor: isDark ? '#0f172a' : '#f9fafb' }} />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-gray-700'} truncate`}>
                              {device.device_label || 'Unknown device'}
                            </p>
                            <p className={`text-[11px] ${isDark ? 'text-slate-600' : 'text-gray-400'} font-mono truncate`}>
                              {device.hwid_hash ? `${device.hwid_hash.substring(0, 8)}…${device.hwid_hash.substring(device.hwid_hash.length - 4)}` : '—'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 ml-3">
                          <span className={`text-[11px] ${isActive ? 'text-emerald-400' : isDark ? 'text-slate-600' : 'text-gray-400'}`}>
                            {isActive ? 'Active now' : device.last_seen_at ? `Last seen ${new Date(device.last_seen_at).toLocaleDateString()}` : 'Never seen'}
                          </span>
                          <button
                            onClick={() => promptRemoveDevice(device.id, device.device_label)}
                            disabled={!canRemove}
                            className={`p-2 rounded-lg ${isDark ? 'hover:bg-red-500/10 text-slate-600 hover:text-red-400' : 'hover:bg-red-50 text-gray-400 hover:text-red-500'} transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed`}
                            title={atRemovalLimit ? 'Monthly removal limit reached' : removingDeviceId === device.id ? 'Removing…' : 'Remove device'}
                          >
                            {removingDeviceId === device.id ? (
                              <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Footer note */}
              <div className={`mt-4 pt-4 border-t ${isDark ? 'border-white/[0.04]' : 'border-gray-100'}`}>
                <p className={`text-[11px] ${isDark ? 'text-slate-600' : 'text-gray-400'} leading-relaxed`}>
                  Your Pro plan allows up to {deviceLimit} device{deviceLimit !== 1 ? 's' : ''}. Removing a device starts a 24-hour cooldown before new devices can be added. You get {removalsLimit} removals per billing month.
                </p>
              </div>
            </div>
          </section>
          )}

          {/* ────────── Help & Resources  (full width, original) ────────── */}
          <section className="lg:col-span-12 auth-card-in" style={{ animationDelay: '0.25s' }}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { icon: HelpCircle, label: 'FAQ',              desc: 'Common questions answered',    href: '/#faq' },
                { icon: FileText,   label: 'Documentation',    desc: 'Guides & getting started',     href: null, modal: 'documentation' },
                { icon: MessageCircle, label: 'Contact Support', desc: 'We typically reply same day', href: 'mailto:batchmyphotos@gmail.com' },
                { icon: ShieldCheck, label: 'Privacy Policy',  desc: 'How we protect your data',     href: null, modal: 'privacyPolicy' },
              ].map(({ icon: Icon, label, desc, href, modal }) => {
                const inner = (
                  <>
                    <div className={`w-9 h-9 rounded-xl ${isDark ? 'bg-white/[0.03] border border-white/[0.06]' : 'bg-gray-50 border border-gray-200'} flex items-center justify-center mb-3.5 group-hover:border-indigo-500/20 group-hover:bg-indigo-500/5 transition-colors`}>
                      <Icon className={`w-4 h-4 ${isDark ? 'text-slate-500' : 'text-gray-400'} group-hover:text-indigo-400 transition-colors`} />
                    </div>
                    <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-gray-700'} mb-0.5`}>{label}</p>
                    <p className={`text-[12px] ${isDark ? 'text-slate-600' : 'text-gray-400'} leading-snug`}>{desc}</p>
                  </>
                )
                return href ? (
                  href.startsWith('/#') ? (
                    <button
                      key={label}
                      onClick={() => navigate(href)}
                      className={`group rounded-2xl border ${isDark ? 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]' : 'border-gray-200 bg-white hover:bg-gray-50 shadow-sm'} p-5 text-left transition-colors cursor-pointer`}
                    >{inner}</button>
                  ) : (
                  <a
                    key={label}
                    href={href}
                    target={href.startsWith('mailto') ? undefined : '_blank'}
                    rel={href.startsWith('mailto') ? undefined : 'noopener noreferrer'}
                    className={`group rounded-2xl border ${isDark ? 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]' : 'border-gray-200 bg-white hover:bg-gray-50 shadow-sm'} p-5 transition-colors`}
                  >{inner}</a>
                  )
                ) : (
                  <button
                    key={label}
                    onClick={modal ? () => setActiveModal(modal) : undefined}
                    className={`group rounded-2xl border ${isDark ? 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]' : 'border-gray-200 bg-white hover:bg-gray-50 shadow-sm'} p-5 text-left transition-colors cursor-pointer`}
                  >{inner}</button>
                )
              })}
            </div>
          </section>

        </div>{/* end bento grid */}
      </div>

      {/* ── Modals ── */}
      {(activeModal === 'documentation' || activeModal === 'privacyPolicy') && (
        <InfoModal modalKey={activeModal} onClose={() => setActiveModal(null)} />
      )}
      {activeModal && activeModal !== 'managePlan' && activeModal !== 'pricing' && activeModal !== 'documentation' && activeModal !== 'privacyPolicy' && (
        <DashModal modalKey={activeModal} onClose={() => setActiveModal(null)} onUpgrade={handleUpgrade} checkoutLoading={checkoutLoading} />
      )}

      {/* ── Pricing Modal ── */}
      <PricingModal
        isOpen={activeModal === 'pricing'}
        onClose={() => setActiveModal(null)}
        onUpgrade={handleUpgrade}
        checkoutLoading={checkoutLoading}
        onValidateCoupon={validateCoupon}
      />

      {/* ── Manage Plan Modal ── */}
      {activeModal === 'managePlan' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => { setActiveModal(null); setConfirmCancel(false) }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className={`relative w-full max-w-md max-h-[85vh] rounded-2xl border ${isDark ? 'border-white/[0.08] bg-slate-900 shadow-2xl shadow-black/50' : 'border-gray-200 bg-white shadow-2xl shadow-gray-300/50'} flex flex-col animate-[footerModalIn_0.2s_ease-out]`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-white/[0.06]' : 'border-gray-200'} shrink-0`}>
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg ${isDark ? 'bg-indigo-500/10' : 'bg-indigo-50'} flex items-center justify-center text-indigo-400`}>
                  <CreditCard className="w-4 h-4" />
                </div>
                <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Manage Your Plan</h3>
              </div>
              <button onClick={() => { setActiveModal(null); setConfirmCancel(false) }} className={`w-8 h-8 rounded-lg ${isDark ? 'hover:bg-white/[0.06] text-slate-500 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-700'} flex items-center justify-center transition-colors cursor-pointer`} aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 overflow-y-auto flex-1 custom-scrollbar space-y-5">
              {confirmCancel ? (
                // Cancellation Confirmation View
                <div className="space-y-4">
                  <div className={`p-4 rounded-xl border ${isDark ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-200'} flex gap-3`}>
                    <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <h4 className={`font-bold text-sm ${isDark ? 'text-red-400' : 'text-red-700'} mb-1`}>Cancel Subscription?</h4>
                      <p className={`text-sm ${isDark ? 'text-red-200' : 'text-red-600'} leading-relaxed`}>
                        This will <strong>immediately</strong> downgrade your account to the Free plan. You will lose access to Pro features right now.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setConfirmCancel(false)}
                      className={`flex-1 py-2.5 rounded-xl border ${isDark ? 'border-white/[0.08] hover:bg-white/[0.04] text-slate-300' : 'border-gray-200 hover:bg-gray-50 text-gray-700'} text-sm font-medium transition-colors cursor-pointer`}
                    >
                      Keep Plan
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          setCheckoutLoading(true) // reuse loading state
                          await cancelSubscription()
                          setActiveModal(null)
                          setConfirmCancel(false)
                          setPaymentMsg({ type: 'info', text: 'Subscription cancelled. You are now on the Free plan.' })
                          safeTimeout(() => setPaymentMsg(null), 5000)
                        } catch (err) {
                          console.error(err)
                          setPaymentMsg({ type: 'error', text: 'Failed to cancel subscription' })
                        } finally {
                          setCheckoutLoading(false)
                        }
                      }}
                      disabled={checkoutLoading}
                      className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold shadow-lg shadow-red-500/20 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {checkoutLoading ? 'Processing…' : 'Confirm Cancel'}
                    </button>
                  </div>
                </div>
              ) : (
                // Standard Management View
                <>
                  {/* Current Plan Badge */}
                  <div className={`rounded-xl p-4 ${isDark ? 'bg-indigo-500/[0.06] border border-indigo-500/20' : 'bg-indigo-50 border border-indigo-100'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-indigo-300' : 'text-indigo-600'}`}>Current Plan</span>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
                        {sub?.plan === 'pro' ? 'Pro' : 'Free'}
                      </span>
                    </div>
                    <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {sub?.plan === 'pro' ? '₱299' : '₱0'}<span className={`text-sm font-normal ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>/month</span>
                    </p>
                  </div>

                  {/* Plan Details */}
                  <div className="space-y-3">
                    {[
                      { label: 'Status', value: sub?.status === 'active' ? '✅ Active' : '⚠️ ' + (sub?.status || 'Unknown') },
                      { label: 'Paid On', value: sub?.paid_at ? new Date(sub.paid_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—' },
                      { label: 'Expires', value: sub?.expires_at ? new Date(sub.expires_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—' },
                      { label: 'Batches', value: sub?.plan === 'pro' ? 'Unlimited' : `${sub?.usage?.used || 0} / 5 used` },
                    ].map((item) => (
                      <div key={item.label} className={`flex items-center justify-between py-2.5 px-3 rounded-lg ${isDark ? 'bg-white/[0.02]' : 'bg-gray-50'}`}>
                        <span className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{item.label}</span>
                        <span className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>{item.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Features list */}
                  <div className={`rounded-xl border ${isDark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-gray-200 bg-gray-50'} p-4`}>
                    <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>Included Features</p>
                    <ul className="space-y-2.5 text-sm">
                      {[
                        { text: 'Unlimited batches', included: sub?.plan === 'pro' },
                        { text: 'Custom watermarks', included: sub?.plan === 'pro' },
                        { text: 'Blur detection', included: sub?.plan === 'pro' },
                      ].map((f) => (
                        <li key={f.text} className={`flex items-center gap-2.5 ${f.included ? (isDark ? 'text-white' : 'text-gray-800') : (isDark ? 'text-slate-600' : 'text-gray-400')}`}>
                          {f.included
                            ? <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                            : <X className="w-4 h-4 shrink-0 opacity-50" />
                          }
                          <span>{f.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2.5 pt-1">
                    <button
                      onClick={() => { setActiveModal(null); navigate('/billing') }}
                      className={`w-full py-2.5 rounded-xl border ${isDark ? 'border-white/[0.08] hover:bg-white/[0.04] text-slate-300' : 'border-gray-200 hover:bg-gray-50 text-gray-700'} text-sm font-medium transition-colors cursor-pointer flex items-center justify-center gap-2`}
                    >
                      <CreditCard className="w-4 h-4" /> View Billing History
                    </button>
                    
                    {sub?.plan === 'pro' && (
                      <button
                        onClick={() => setConfirmCancel(true)}
                        className={`w-full py-2 text-xs font-medium ${isDark ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-700'} transition-colors cursor-pointer`}
                      >
                        Cancel Subscription
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
