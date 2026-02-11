
import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTheme } from '../context/ThemeContext'
import {
  Crown, Sparkles, Download, Settings, HelpCircle, CreditCard,
  ChevronDown, ShieldCheck, LogOut, User, Key, Monitor,
  ArrowRight, ExternalLink, Mail, Lock, Play,
  Copy, Check, Camera, FileText, MessageCircle, X, Shield,
} from 'lucide-react'

/* ─── Modal content (mirrors Footer modals) ──────────────────────────────── */
const getDashModals = (isDark) => ({
  documentation: {
    title: 'Documentation',
    icon: FileText,
    color: 'text-cyan-400',
    body: (
      <div className="space-y-5">
        <p className={`${isDark ? 'text-slate-400' : 'text-gray-600'} leading-relaxed`}>Everything you need to know about using Batch My Photos effectively.</p>
        <div>
          <h4 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'} mb-2`}>Batch Settings</h4>
          <ul className={`space-y-1.5 text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
            <li>• <strong className={isDark ? 'text-slate-300' : 'text-gray-700'}>Max Photos per Batch</strong> — Controls how many photos go into each folder. Default is 500.</li>
            <li>• <strong className={isDark ? 'text-slate-300' : 'text-gray-700'}>Folder Naming</strong> — Name your output folders with a custom prefix (e.g., "Wedding — Batch 1").</li>
            <li>• <strong className={isDark ? 'text-slate-300' : 'text-gray-700'}>Sort Order</strong> — Sort by date (ascending/descending) or by filename.</li>
            <li>• <strong className={isDark ? 'text-slate-300' : 'text-gray-700'}>Batch Mode</strong> — Choose between Move (relocate files) or Copy (keep originals).</li>
          </ul>
        </div>
        <div>
          <h4 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'} mb-2`}>Blur Detection</h4>
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'} leading-relaxed`}>When enabled, the app identifies blurry photos and separates them into a dedicated folder. Three sensitivity levels:</p>
          <ul className={`space-y-1 text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'} mt-2`}>
            <li>• <strong className={isDark ? 'text-slate-300' : 'text-gray-700'}>Low</strong> — Only catches very blurry images</li>
            <li>• <strong className={isDark ? 'text-slate-300' : 'text-gray-700'}>Moderate</strong> — Balanced detection (recommended)</li>
            <li>• <strong className={isDark ? 'text-slate-300' : 'text-gray-700'}>Strict</strong> — Catches slightly soft images too</li>
          </ul>
        </div>
        <div>
          <h4 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'} mb-2`}>Undo &amp; Recovery</h4>
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'} leading-relaxed`}>Every batch operation is fully reversible. Click Undo to restore all files to their original locations. Your session state is saved automatically, so even after a crash or accidental close, you can resume right where you left off.</p>
        </div>
        <div>
          <h4 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'} mb-2`}>Troubleshooting</h4>
          <ul className={`space-y-1.5 text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
            <li>• <strong className={isDark ? 'text-slate-300' : 'text-gray-700'}>Photos not appearing?</strong> — Make sure you're dropping a folder, not individual files.</li>
            <li>• <strong className={isDark ? 'text-slate-300' : 'text-gray-700'}>Batch counts look off?</strong> — Check your "Max Photos" setting and blur detection toggle.</li>
            <li>• <strong className={isDark ? 'text-slate-300' : 'text-gray-700'}>App closed unexpectedly?</strong> — Reopen the app — your last session is preserved.</li>
          </ul>
        </div>
      </div>
    ),
  },
  privacyPolicy: {
    title: 'Privacy Policy',
    icon: Shield,
    color: 'text-emerald-400',
    body: (
      <div className="space-y-5">
        <p className={`${isDark ? 'text-slate-400' : 'text-gray-600'} leading-relaxed`}>Your privacy matters to us. Here's exactly how Batch My Photos handles your data.</p>
        <div>
          <h4 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'} mb-2`}>Your photos stay on your device</h4>
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'} leading-relaxed`}>Batch My Photos processes everything locally on your computer. Your photos are never uploaded, transmitted, or shared with any server, cloud service, or third party. Period.</p>
        </div>
        <div>
          <h4 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'} mb-2`}>What we collect</h4>
          <ul className={`space-y-1.5 text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
            <li>• <strong className={isDark ? 'text-slate-300' : 'text-gray-700'}>Account info</strong> — If you create an account, we store your email and subscription status.</li>
            <li>• <strong className={isDark ? 'text-slate-300' : 'text-gray-700'}>Usage analytics</strong> — We may collect anonymous, aggregated usage data to improve the app. This never includes file names, photo content, or personal data.</li>
            <li>• <strong className={isDark ? 'text-slate-300' : 'text-gray-700'}>Crash reports</strong> — Optional anonymous crash reports help us fix bugs faster.</li>
          </ul>
        </div>
        <div>
          <h4 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'} mb-2`}>What we don't collect</h4>
          <ul className={`space-y-1 text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
            <li>• ❌ Photo content, metadata, or file names</li>
            <li>• ❌ File system paths or folder structures</li>
            <li>• ❌ Any data from your local machine</li>
          </ul>
        </div>
        <div>
          <h4 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'} mb-2`}>Third-party services</h4>
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'} leading-relaxed`}>We use Supabase for authentication and Stripe for payment processing. Both handle only the minimum data required (email, payment info) and are GDPR-compliant.</p>
        </div>
        <div>
          <h4 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'} mb-2`}>Your rights</h4>
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'} leading-relaxed`}>You can request deletion of your account and all associated data at any time by emailing <a href="mailto:batchmyphotos@gmail.com" className="text-indigo-400 hover:text-indigo-300 transition-colors">batchmyphotos@gmail.com</a>.</p>
        </div>
        <div className={`pt-3 border-t ${isDark ? 'border-white/[0.06]' : 'border-gray-200'}`}>
          <p className={`text-xs ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>Last updated: February 2026</p>
        </div>
      </div>
    ),
  },
})

function DashModal({ modalKey, onClose }) {
  const { isDark } = useTheme()
  const content = getDashModals(isDark)[modalKey]
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

/* ─── Mock subscription (swap with real Stripe/DB later) ─────────────────── */
const MOCK_SUB = {
  plan: 'Free',
  status: 'active',
  renewalDate: null,
  billingCycle: null,
  paymentMethod: null,
  licenseKey: null,
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const navigate = useNavigate()
  const { isDark } = useTheme()
  const [user, setUser]             = useState(null)
  const [loading, setLoading]       = useState(true)
  const [profileOpen, setProfileOpen] = useState(false)
  const [copied, setCopied]         = useState(false)
  const [activeModal, setActiveModal] = useState(null)
  const sub   = MOCK_SUB
  const isFree = sub.plan === 'Free'

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { navigate('/login'); return }
      setUser(session.user)
      setLoading(false)
    })
  }, [navigate])

  const handleLogout = async () => { await supabase.auth.signOut(); navigate('/') }

  const copyKey = () => {
    if (!sub.licenseKey) return
    navigator.clipboard.writeText(sub.licenseKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  /* ── Loading state ── */
  if (loading) return (
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

        {/* ════════════════════════════════════════════════════════════════════
            HERO  —  Welcome banner with avatar + profile menu
           ════════════════════════════════════════════════════════════════════ */}
        <section className="auth-card-in mb-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">

            {/* Left: greeting */}
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-lg font-bold text-white shadow-lg shadow-indigo-500/25">
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

              {/* Profile button */}
              <div className="relative">
                <button
                  onClick={() => setProfileOpen(p => !p)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${isDark ? 'border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06]' : 'border-gray-200 bg-white hover:bg-gray-50'} transition-colors cursor-pointer`}
                >
                  <Settings className={`w-4 h-4 ${isDark ? 'text-slate-400' : 'text-gray-500'}`} />
                  <ChevronDown className={`w-3.5 h-3.5 ${isDark ? 'text-slate-500' : 'text-gray-400'} transition-transform duration-200 ${profileOpen ? 'rotate-180' : ''}`} />
                </button>

                {profileOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                    <div className={`absolute right-0 mt-2.5 w-60 rounded-2xl border ${isDark ? 'border-white/[0.08] bg-slate-900/95 backdrop-blur-xl shadow-2xl shadow-black/50' : 'border-gray-200 bg-white shadow-xl shadow-gray-200/50'} py-1.5 z-50`} style={{ animation: 'footerModalIn 0.15s ease-out' }}>
                      <div className={`px-4 py-3 border-b ${isDark ? 'border-white/[0.06]' : 'border-gray-200'}`}>
                        <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'} truncate`}>{displayName}</p>
                        <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-gray-500'} truncate mt-0.5`}>{user?.email}</p>
                      </div>
                      {[
                        { icon: User, label: 'Edit Profile' },
                        { icon: Lock, label: 'Change Password' },
                        { icon: Mail, label: 'Update Email' },
                        { icon: Settings, label: 'Preferences' },
                      ].map(({ icon: I, label }) => (
                        <button key={label} onClick={() => { setProfileOpen(false); navigate('/settings') }} className={`flex items-center gap-2.5 w-full px-4 py-2.5 text-[13px] ${isDark ? 'text-slate-400 hover:text-white hover:bg-white/[0.04]' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'} transition-colors cursor-pointer`}>
                          <I className="w-4 h-4" /> {label}
                        </button>
                      ))}
                      <div className={`border-t ${isDark ? 'border-white/[0.06]' : 'border-gray-200'} mt-1 pt-1`}>
                        <button onClick={handleLogout} className="flex items-center gap-2.5 w-full px-4 py-2.5 text-[13px] text-red-400 hover:text-red-300 hover:bg-red-500/[0.06] transition-colors cursor-pointer">
                          <LogOut className="w-4 h-4" /> Sign out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
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
                  Everything runs locally — your files never leave your machine.
                </p>
              </div>

              {/* CTA */}
              <div className="shrink-0 flex flex-col gap-2.5">
                <button className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:brightness-110 transition-all cursor-pointer">
                  <Download className="w-4 h-4" /> Download for Windows
                </button>
                <span className={`text-[11px] ${isDark ? 'text-slate-600' : 'text-gray-400'} text-center`}>v1.0.0 · Windows 10+</span>
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
                  sub.status === 'active'  ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20'
                : sub.status === 'past_due'? 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20'
                :                            'bg-slate-800 text-slate-500 ring-1 ring-slate-700'
                }`}>
                  {sub.status === 'active' ? 'Active' : sub.status === 'past_due' ? 'Past Due' : sub.status === 'trialing' ? 'Trial' : 'Canceled'}
                </span>
              </div>

              {/* Plan name + badge */}
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/15 to-purple-500/15 border border-indigo-500/10 flex items-center justify-center">
                  {isFree
                    ? <Camera className="w-5 h-5 text-indigo-400" />
                    : <Crown  className="w-5 h-5 text-amber-400" />}
                </div>
                <div>
                  <p className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} tracking-tight`}>{sub.plan}</p>
                  <p className={`text-[13px] ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
                    {isFree ? 'Free forever · core features included' : `Billed ${sub.billingCycle?.toLowerCase()} · renews ${sub.renewalDate}`}
                  </p>
                </div>
              </div>

              {/* Quick details row */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                {[
                  { label: 'Billing', value: sub.billingCycle || '—' },
                  { label: 'Payment', value: sub.paymentMethod || '—' },
                ].map(d => (
                  <div key={d.label} className={`rounded-xl ${isDark ? 'bg-white/[0.02] border border-white/[0.04]' : 'bg-gray-50 border border-gray-200'} px-4 py-3`}>
                    <p className={`text-[11px] uppercase tracking-wider ${isDark ? 'text-slate-600' : 'text-gray-400'} mb-0.5`}>{d.label}</p>
                    <p className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>{d.value}</p>
                  </div>
                ))}
              </div>

              {/* License key (Pro only) */}
              {sub.licenseKey && (
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
                  <button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/35 hover:brightness-110 transition-all cursor-pointer">
                    <Sparkles className="w-4 h-4" /> Upgrade to Pro
                  </button>
                ) : (
                  <button className={`px-5 py-2.5 rounded-xl border ${isDark ? 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-slate-300' : 'border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700'} text-sm font-medium transition-colors cursor-pointer`}>
                    Manage Plan
                  </button>
                )}
                <button className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border ${isDark ? 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-slate-300' : 'border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700'} text-sm font-medium transition-colors cursor-pointer`}>
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
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-base font-bold text-white shadow-md shadow-indigo-500/20 shrink-0">
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
                  { icon: User, label: 'Edit Profile' },
                  { icon: Lock, label: 'Change Password' },
                  { icon: Mail, label: 'Update Email' },
                ].map(({ icon: I, label }) => (
                  <button key={label} onClick={() => navigate('/settings')} className={`flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl ${isDark ? 'hover:bg-white/[0.04] text-slate-400 hover:text-slate-200' : 'hover:bg-gray-50 text-gray-500 hover:text-gray-700'} text-sm transition-colors cursor-pointer group`}>
                    <span className="flex items-center gap-2.5">
                      <I className={`w-3.5 h-3.5 ${isDark ? 'text-slate-600 group-hover:text-slate-400' : 'text-gray-400 group-hover:text-gray-500'} transition-colors`} /> {label}
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
          <section className="lg:col-span-12 auth-card-in" style={{ animationDelay: '0.2s' }}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { icon: HelpCircle, label: 'FAQ',              desc: 'Common questions answered',    href: '/#faq' },
                { icon: FileText,   label: 'Documentation',    desc: 'Guides & getting started',     href: null, modal: 'documentation' },
                { icon: MessageCircle, label: 'Contact Support', desc: 'We typically reply same day', href: 'mailto:batchmyphotos@gmail.com' },
                { icon: ShieldCheck, label: 'Privacy Policy',  desc: 'How we protect your data',     href: null, modal: 'privacyPolicy' },
              ].map(({ icon: I, label, desc, href, modal }) => {
                const inner = (
                  <>
                    <div className={`w-9 h-9 rounded-xl ${isDark ? 'bg-white/[0.03] border border-white/[0.06]' : 'bg-gray-50 border border-gray-200'} flex items-center justify-center mb-3.5 group-hover:border-indigo-500/20 group-hover:bg-indigo-500/5 transition-colors`}>
                      <I className={`w-4 h-4 ${isDark ? 'text-slate-500' : 'text-gray-400'} group-hover:text-indigo-400 transition-colors`} />
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
      {activeModal && <DashModal modalKey={activeModal} onClose={() => setActiveModal(null)} />}
    </div>
  )
}
