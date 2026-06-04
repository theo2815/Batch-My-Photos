
import { useEffect, useState, useRef } from 'react'
import { useNavigate, Link, useSearchParams, useLocation } from 'react-router-dom'
import PricingModal from '../components/PricingModal'
import InfoModal from '../components/modals/InfoModal'
import ModalShell from '../components/modals/ModalShell'
import { supabase } from '../lib/supabase'
import { useSubscription } from '../hooks/useSubscription'
import { useDevices } from '../hooks/useDevices'
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
    color: 'text-accent',
    body: null, // Placeholder — content will be injected dynamically
  },
})

function DashModal({ modalKey, onClose }) {
  const content = getDashModals()[modalKey]
  if (!content) return null
  return (
    <ModalShell title={content.title} icon={content.icon} iconColor={content.color} onClose={onClose}>
      {content.body}
    </ModalShell>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [user, setUser]             = useState(null)
  const [loading, setLoading]       = useState(true)
  const [copied, setCopied]         = useState(false)
  const [activeModal, setActiveModal] = useState(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [confirmCancel, setConfirmCancel]   = useState(false)
  const [paymentMsg, setPaymentMsg] = useState(null)
  const { subscription: sub, loading: subLoading, createCheckout, refetch: refetchSub, verifyPayment, startFreeTrial, cancelSubscription, validateCoupon } = useSubscription()
  const { devices, deviceLimit, loading: devicesLoading, error: devicesError, fetchDevices, removeDevice, removalsUsed, removalsLimit, cooldownEndsAt} = useDevices()
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

  // Handle trial activation redirect from Navbar
  useEffect(() => {
    if (location.state?.trialActivated) {
      setPaymentMsg({ type: 'success', text: 'Your 30-day Pro trial is active.' })
      safeTimeout(() => setPaymentMsg(null), 6000)
      // Clear the state so refreshing doesn't re-trigger
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state, location.pathname, navigate])

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
      setPaymentMsg({ type: 'success', text: 'Verifying your payment…' })
      
      // Clean URL immediately to prevent re-triggering this effect
      const nextParams = new URLSearchParams(searchParams)
      nextParams.delete('payment')
      setSearchParams(nextParams, { replace: true })

      // Verify payment directly with PayMongo (webhook fallback)
      verifyPayment().then((result) => {
        console.log('Payment verification result:', result)
        if (result?.verified) {
          setPaymentMsg({ type: 'success', text: 'Payment confirmed. Your Pro plan is active.' })
        } else {
          // Webhook may have handled it — just refetch
          refetchSub()
          setPaymentMsg({ type: 'success', text: 'Payment received. Refreshing your plan…' })
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

  const handleStartTrial = async () => {
    await startFreeTrial()
    setActiveModal(null)
    setPaymentMsg({ type: 'success', text: 'Your 30-day Pro trial is active.' })
    safeTimeout(() => setPaymentMsg(null), 6000)
  }

  /* ── Loading state ── */
  // Only show full loading screen on initial load. 
  // If subLoading is true but we have old data (sub exists), keep showing the dashboard (optimistic/stale UI)
  if (loading || (subLoading && !sub)) return (
    <div className="min-h-screen bg-bg-main flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
          <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
        <p className="text-sm text-text-muted tracking-wide">Loading your dashboard…</p>
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
    <div className="relative min-h-screen bg-bg-main overflow-hidden">

      {/* ── Ambient background (matches auth pages) ── */}
      <div className="pointer-events-none absolute inset-0">
        <div className="hero-orb-1 absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-primary/8 blur-3xl" />
        <div className="hero-orb-2 absolute -bottom-32 -right-32 w-[420px] h-[420px] rounded-full bg-deep-ember/8 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,122,69,0.04)_0%,transparent_60%)]" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-5 sm:px-8 pt-24 pb-20">

        {/* Payment notification toast */}
        {paymentMsg && (
          <div className={`mb-6 rounded-xl px-5 py-4 text-sm flex items-center gap-3 animate-[footerModalIn_0.2s_ease-out] ${
            paymentMsg.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
            : paymentMsg.type === 'error'   ? 'bg-red-500/10 border border-red-500/20 text-red-300'
            : 'bg-primary/10 border border-primary/20 text-accent'
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
                <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center text-lg font-bold text-white shadow-md shadow-primary/20">
                  {initials}
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-bg-main" title="Online" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-display font-bold text-text-primary leading-tight">
                  Good {greeting}, {firstName}
                </h1>
                <p className="text-sm text-text-muted mt-0.5">Welcome back to your BatchMyPhotos account</p>
              </div>
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-3 shrink-0">
              <Link
                to="/demo"
                className="hidden sm:inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border-subtle bg-bg-elevated hover:bg-bg-surface text-text-secondary text-sm font-medium transition-colors"
              >
                <Play className="w-3.5 h-3.5 text-accent" /> Try Demo
              </Link>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════════
            DOWNLOAD  —  The primary CTA
           ════════════════════════════════════════════════════════════════════ */}
        <section className="auth-card-in mb-8" style={{ animationDelay: '0.05s' }}>
          <div className="relative group rounded-2xl border border-border-subtle bg-bg-elevated overflow-hidden">
            {/* Gradient shimmer on hover */}
            <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/[0.04] to-accent/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="absolute top-0 right-0 w-72 h-72 bg-primary/[0.03] rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/4" />

            <div className="relative p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-6">
              {/* App icon */}
              <div className="shrink-0 w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-2xl bg-gradient-to-br from-bg-surface to-bg-main border border-border-subtle shadow-xl shadow-black/30 flex items-center justify-center">
                <img src="/app_icon.png" alt="BatchMyPhotos" className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg" />
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <h2 className="text-lg sm:text-xl font-display font-bold text-text-primary mb-1">Download BatchMyPhotos</h2>
                <p className="text-sm text-text-secondary leading-relaxed max-w-lg">
                  Organize, rename, and batch-process thousands of photos in seconds.
                  Everything runs locally, your files never leave your machine.
                </p>
              </div>

              {/* CTA */}
              <div className="shrink-0 flex flex-col items-center gap-2">
                <a
                  href="https://apps.microsoft.com/detail/9N1KKMV4NX4J"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center hover:-translate-y-1 transition-transform"
                  aria-label="Get it from Microsoft Store"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="200" height="58" viewBox="0 0 200 58">
                    <defs><linearGradient id="ms-badge-dash" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2a2a2a"/><stop offset="100%" stopColor="#1a1a1a"/></linearGradient></defs>
                    <rect width="200" height="58" rx="8" fill="url(#ms-badge-dash)" stroke="rgba(255,255,255,0.15)" strokeWidth="1"/>
                    <text x="68" y="22" fill="#ccc" fontSize="10" fontFamily="Segoe UI, sans-serif" fontWeight="400">Get it from</text>
                    <text x="68" y="40" fill="#fff" fontSize="16" fontFamily="Segoe UI, sans-serif" fontWeight="600">Microsoft Store</text>
                    <g transform="translate(18,14)">
                      <rect x="0" y="0" width="13" height="13" rx="1.5" fill="#F25022"/>
                      <rect x="15" y="0" width="13" height="13" rx="1.5" fill="#7FBA00"/>
                      <rect x="0" y="15" width="13" height="13" rx="1.5" fill="#00A4EF"/>
                      <rect x="15" y="15" width="13" height="13" rx="1.5" fill="#FFB900"/>
                    </g>
                  </svg>
                </a>
                <span className="text-[11px] font-mono text-text-muted">Windows 10 / 11</span>
              </div>
            </div>

            {/* Trust strip */}
            <div className="relative px-6 sm:px-8 py-3 border-t border-border-subtle flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-text-muted">
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
            <div className="h-full rounded-2xl border border-border-subtle bg-bg-elevated p-6">

              {/* Header row */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Crown className="w-4 h-4 text-accent" />
                  </div>
                  <h3 className="text-[15px] font-display font-bold text-text-primary">Your Plan</h3>
                </div>
                <span className={`text-[11px] font-semibold tracking-wide uppercase px-2.5 py-1 rounded-full ${
                  sub?.status === 'active'  ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20'
                : sub?.status === 'past_due'? 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20'
                :                            'bg-bg-elevated text-text-muted ring-1 ring-border-subtle'
                }`}>
                  {sub?.status === 'active' ? 'Active' : sub?.status === 'past_due' ? 'Past Due' : sub?.status === 'trialing' ? 'Trial' : isFree ? 'Free' : 'Unknown'}
                </span>
              </div>

              {/* Plan name + badge */}
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/15 to-accent/15 border border-primary/10 flex items-center justify-center">
                  {isFree
                    ? <Sparkles className="w-5 h-5 text-accent" />
                    : <Crown  className="w-5 h-5 text-amber-400" />}
                </div>
                <div>
                  <p className="text-xl font-display font-bold text-text-primary tracking-tight">{isFree ? 'Free' : 'Pro'}</p>
                  <p className="text-[13px] text-text-muted">
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
                  <div key={d.label} className={`rounded-xl bg-bg-elevated border border-border-subtle px-4 py-3 ${d.full ? 'col-span-2' : ''}`}>
                    <p className="text-[11px] uppercase tracking-wider text-text-muted mb-0.5">{d.label}</p>
                    <p className="text-sm font-mono font-medium text-text-secondary">{d.value}</p>
                  </div>
                ))}
              </div>

              {/* License key (Pro only) */}
              {sub?.licenseKey && (
                <div className="rounded-xl bg-bg-elevated border border-border-subtle px-4 py-3 mb-6">
                  <p className="text-[11px] uppercase tracking-wider text-text-muted mb-1.5 flex items-center gap-1.5">
                    <Key className="w-3 h-3" /> License Key
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm font-mono text-accent bg-bg-surface/60 rounded-lg px-3 py-1.5 truncate select-all">{sub.licenseKey}</code>
                    <button onClick={copyKey} className="shrink-0 p-2 rounded-lg hover:bg-bg-surface text-text-muted hover:text-text-primary transition-colors cursor-pointer">
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
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent hover:brightness-110 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-all cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4 text-white" /> {!sub?.free_trial_used ? 'Start Free Trial' : 'Upgrade to Pro'}
                    </button>
                    {/* <span className="text-[10px] text-text-muted text-center italic">Under review</span> */}
                  </div>
                ) : (
                  <button onClick={() => setActiveModal('managePlan')} className="px-5 py-2.5 rounded-xl border border-border-subtle bg-bg-elevated hover:bg-bg-surface text-text-secondary text-sm font-medium transition-colors cursor-pointer">
                    Manage Plan
                  </button>
                )}
                <button onClick={() => navigate('/billing')} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border-subtle bg-bg-elevated hover:bg-bg-surface text-text-secondary text-sm font-medium transition-colors cursor-pointer">
                  <CreditCard className="w-4 h-4 text-text-muted" /> Billing History
                </button>
              </div>
            </div>
          </section>

          {/* ────────── Account card  (5 cols) ────────── */}
          <section className="lg:col-span-5 auth-card-in" style={{ animationDelay: '0.15s' }}>
            <div className="h-full rounded-2xl border border-border-subtle bg-bg-elevated p-6 flex flex-col">

              {/* Header */}
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-8 h-8 rounded-lg bg-bg-elevated flex items-center justify-center">
                  <User className="w-4 h-4 text-text-secondary" />
                </div>
                <h3 className="text-[15px] font-display font-bold text-text-primary">Account</h3>
              </div>

              {/* Avatar row */}
              <div className="flex items-center gap-3.5 mb-5">
                <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-base font-bold text-white shadow-md shadow-primary/20 shrink-0">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-display font-semibold text-text-primary truncate">{displayName}</p>
                  <p className="text-xs text-text-muted truncate">{user?.email}</p>
                  <p className="text-[11px] text-text-muted mt-0.5">Member since <span className="font-mono">{memberSince}</span></p>
                </div>
              </div>

              {/* Setting rows */}
              <div className="space-y-1.5 flex-1">
                {[
                  { icon: User, label: 'Edit Profile', path: '/settings' },
                  { icon: Lock, label: 'Change Password', path: '/settings#password' },
                  { icon: Settings, label: 'Preferences', path: '/settings#preferences' },
                ].map(({ icon: Icon, label, path }) => (
                  <button key={label} onClick={() => navigate(path)} className="flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl hover:bg-bg-surface text-text-secondary hover:text-text-primary text-sm transition-colors cursor-pointer group">
                    <span className="flex items-center gap-2.5">
                      <Icon className="w-3.5 h-3.5 text-text-muted group-hover:text-text-secondary transition-colors" /> {label}
                    </span>
                    <ArrowRight className="w-3 h-3 text-text-muted group-hover:text-text-secondary group-hover:translate-x-0.5 transition-all" />
                  </button>
                ))}
              </div>

              {/* Privacy badge at bottom */}
              <div className="mt-5 pt-4 border-t border-border-subtle">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-500/70 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-text-muted leading-relaxed">
                    We only store your email &amp; plan — never your photos, file names, or anything from your device.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ────────── Help & Resources  (full width) ────────── */}
          {!isFree && (
          <section className="lg:col-span-12 auth-card-in" style={{ animationDelay: '0.18s' }}>
            <div className="rounded-2xl border border-border-subtle bg-bg-elevated p-6">

              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Monitor className="w-4 h-4 text-accent" />
                  </div>
                  <h3 className="text-[15px] font-display font-bold text-text-primary">Authorized Devices</h3>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono font-medium text-text-muted">{devices.length} / {deviceLimit} used</span>
                  <button onClick={fetchDevices} className="p-2 rounded-lg hover:bg-bg-surface text-text-muted hover:text-text-primary transition-colors cursor-pointer" title="Refresh">
                    <RefreshCw className={`w-4 h-4 ${devicesLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Usage bar */}
              <div className="w-full h-2 rounded-full bg-bg-elevated mb-4 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
                  style={{ width: `${Math.min((devices.length / Math.max(deviceLimit, 1)) * 100, 100)}%` }}
                />
              </div>

              {/* Removal limits info */}
              <div className="flex items-center justify-between mb-4 text-[11px] text-text-muted">
                <span className={`flex items-center gap-1 ${atRemovalLimit ? 'text-red-400' : ''}`}>
                  <Trash2 className="w-3 h-3" />
                  <span className="font-mono">{removalsUsed} / {removalsLimit}</span> removals used this month
                </span>
                {hasCooldown && (
                  <span className="flex items-center gap-1 text-amber-400">
                    <Timer className="w-3 h-3" />
                    Cooldown: <span className="font-mono">{cooldownText}</span>
                  </span>
                )}
              </div>

              {/* Cooldown warning banner */}
              {hasCooldown && (
                <div className="mb-4 rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs leading-relaxed bg-amber-500/10 border border-amber-500/20 text-amber-300">
                  <Timer className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>A device was recently removed. New devices cannot be added for another <strong>{cooldownText}</strong>. Re-adding a previously used device is not affected.</span>
                </div>
              )}

              {/* At removal limit banner */}
              {atRemovalLimit && (
                <div className="mb-4 rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs leading-relaxed bg-red-500/10 border border-red-500/20 text-red-300">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>You&apos;ve used all {removalsLimit} device removals for this billing period. Removals will reset next month.</span>
                </div>
              )}

              {/* Error */}
              {(devicesError || removeError) && (
                <div className="mb-4 rounded-xl px-4 py-3 text-sm bg-red-500/10 border border-red-500/20 text-red-300">
                  {devicesError || removeError}
                </div>
              )}

              {/* In-card confirmation dialog */}
              {confirmRemoveDevice && (
                <div className="mb-4 rounded-xl p-4 bg-amber-500/5 border border-amber-500/15">
                  <div className="flex items-start gap-2.5 mb-3">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <div className="text-xs leading-relaxed text-text-secondary">
                      <p className="font-semibold mb-1">Remove &ldquo;{confirmRemoveDevice.label}&rdquo;?</p>
                      <ul className="list-disc pl-4 space-y-0.5 text-text-muted">
                        <li>A <strong>24-hour cooldown</strong> will start &mdash; no new devices can be added.</li>
                        <li>You have <strong>{removalsLimit - removalsUsed}</strong> removal{removalsLimit - removalsUsed !== 1 ? 's' : ''} left this month.</li>
                        <li>Re-adding the same device later will bypass the cooldown.</li>
                      </ul>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setConfirmRemoveDevice(null)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:bg-bg-surface border border-border-subtle transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={executeRemoveDevice}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition-colors cursor-pointer"
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
                    <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
                    <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  </div>
                </div>
              ) : devices.length === 0 ? (
                <div className="text-center py-8 text-sm text-text-muted">
                  <Smartphone className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No devices registered yet. Open the desktop app to bind this device.
                </div>
              ) : (
                <div className="space-y-2">
                  {devices.map((device) => {
                    const isActive = device.last_seen_at && (Date.now() - new Date(device.last_seen_at).getTime()) < 10 * 60 * 1000
                    const canRemove = !atRemovalLimit && removingDeviceId !== device.id
                    return (
                      <div key={device.id} className="flex items-center justify-between rounded-xl px-4 py-3 bg-bg-elevated border border-border-subtle">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative shrink-0">
                            <Monitor className="w-5 h-5 text-text-secondary" />
                            {isActive && (
                              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-bg-elevated" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-text-primary truncate">
                              {device.device_label || 'Unknown device'}
                            </p>
                            <p className="text-[11px] text-text-muted font-mono truncate">
                              {device.hwid_hash ? `${device.hwid_hash.substring(0, 8)}…${device.hwid_hash.substring(device.hwid_hash.length - 4)}` : '—'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 ml-3">
                          <span className={`text-[11px] font-mono ${isActive ? 'text-emerald-400' : 'text-text-muted'}`}>
                            {isActive ? 'Active now' : device.last_seen_at ? `Last seen ${new Date(device.last_seen_at).toLocaleDateString()}` : 'Never seen'}
                          </span>
                          <button
                            onClick={() => promptRemoveDevice(device.id, device.device_label)}
                            disabled={!canRemove}
                            className="p-2 rounded-lg hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
              <div className="mt-4 pt-4 border-t border-border-subtle">
                <p className="text-[11px] text-text-muted leading-relaxed">
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
                    <div className="w-9 h-9 rounded-xl bg-bg-elevated border border-border-subtle flex items-center justify-center mb-3.5 group-hover:border-primary/20 group-hover:bg-primary-hover/5 transition-colors">
                      <Icon className="w-4 h-4 text-text-muted group-hover:text-accent transition-colors" />
                    </div>
                    <p className="text-sm font-display font-semibold text-text-primary mb-0.5">{label}</p>
                    <p className="text-[12px] text-text-muted leading-snug">{desc}</p>
                  </>
                )
                return href ? (
                  href.startsWith('/#') ? (
                    <button
                      key={label}
                      onClick={() => navigate(href)}
                      className="group rounded-2xl border border-border-subtle bg-bg-elevated hover:bg-bg-surface p-5 text-left transition-colors cursor-pointer"
                    >{inner}</button>
                  ) : (
                  <a
                    key={label}
                    href={href}
                    target={href.startsWith('mailto') ? undefined : '_blank'}
                    rel={href.startsWith('mailto') ? undefined : 'noopener noreferrer'}
                    className="group rounded-2xl border border-border-subtle bg-bg-elevated hover:bg-bg-surface p-5 transition-colors"
                  >{inner}</a>
                  )
                ) : (
                  <button
                    key={label}
                    onClick={modal ? () => setActiveModal(modal) : undefined}
                    className="group rounded-2xl border border-border-subtle bg-bg-elevated hover:bg-bg-surface p-5 text-left transition-colors cursor-pointer"
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
        onStartTrial={handleStartTrial}
        checkoutLoading={checkoutLoading}
        onValidateCoupon={validateCoupon}
        isPro={sub?.plan === 'pro' && sub?.status === 'active'}
        freeTrialUsed={!!sub?.free_trial_used}
        subscriptionLoading={subLoading}
        isTrialActive={!!sub?.free_trial_used && sub?.plan === 'pro' && sub?.status === 'active' && sub?.free_trial_end_at && new Date(sub.free_trial_end_at) >= new Date()}
      />

      {/* ── Manage Plan Modal ── */}
      {activeModal === 'managePlan' && (
        <ModalShell
          title="Manage Your Plan"
          icon={CreditCard}
          maxWidth="max-w-md"
          bodyClassName="px-6 py-5 space-y-5"
          onClose={() => { setActiveModal(null); setConfirmCancel(false) }}
        >
              {confirmCancel ? (
                // Cancellation Confirmation View
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border bg-red-500/10 border-red-500/20 flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-sm text-red-400 mb-1">Cancel Subscription?</h4>
                      <p className="text-sm text-red-200 leading-relaxed">
                        This will <strong>immediately</strong> downgrade your account to the Free plan. You will lose access to Pro features right now.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setConfirmCancel(false)}
                      className="flex-1 py-2.5 rounded-xl border border-border-subtle hover:bg-bg-surface text-text-secondary text-sm font-medium transition-colors cursor-pointer"
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
                  <div className="rounded-xl p-4 bg-primary/[0.06] border border-primary/20">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-accent">Current Plan</span>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-gradient-to-r from-primary to-accent text-white">
                        {sub?.plan === 'pro' ? 'Pro' : 'Free'}
                      </span>
                    </div>
                    <p className="text-2xl font-mono font-bold text-text-primary">
                      {sub?.plan === 'pro' ? '₱299' : '₱0'}<span className="text-sm font-sans font-normal text-text-muted">/month</span>
                    </p>
                  </div>

                  {/* Plan Details */}
                  <div className="space-y-3">
                    {[
                      { label: 'Status', value: sub?.status === 'active' ? 'Active' : (sub?.status || 'Unknown') },
                      { label: 'Paid On', value: sub?.paid_at ? new Date(sub.paid_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—' },
                      { label: 'Expires', value: sub?.expires_at ? new Date(sub.expires_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—' },
                      { label: 'Batches', value: sub?.plan === 'pro' ? 'Unlimited' : `${sub?.usage?.used || 0} / 2 used` },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-bg-elevated">
                        <span className="text-sm text-text-secondary">{item.label}</span>
                        <span className="text-sm font-mono font-medium text-text-primary">{item.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Features list */}
                  <div className="rounded-xl border border-border-subtle bg-bg-elevated p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider mb-3 text-text-muted">Included Features</p>
                    <ul className="space-y-2.5 text-sm">
                      {[
                        { text: 'Unlimited batches', included: sub?.plan === 'pro' },
                        { text: 'Offline batching', included: sub?.plan === 'pro' },
                        { text: 'Up to 2 devices', included: sub?.plan === 'pro' },
                      ].map((f) => (
                        <li key={f.text} className={`flex items-center gap-2.5 ${f.included ? 'text-text-primary' : 'text-text-muted'}`}>
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
                      className="w-full py-2.5 rounded-xl border border-border-subtle hover:bg-bg-surface text-text-secondary text-sm font-medium transition-colors cursor-pointer flex items-center justify-center gap-2"
                    >
                      <CreditCard className="w-4 h-4" /> View Billing History
                    </button>

                    {sub?.plan === 'pro' && (
                      <button
                        onClick={() => setConfirmCancel(true)}
                        className="w-full py-2 text-xs font-medium text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                      >
                        Cancel Subscription
                      </button>
                    )}
                  </div>
                </>
              )}
        </ModalShell>
      )}
    </div>
  )
}
