
import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTheme } from '../context/ThemeContext'
import {
  Camera, User, Mail, Lock, Eye, EyeOff, ArrowLeft, Loader2,
  Check, Sun, Moon, Monitor, ShieldCheck, ArrowRight, Palette,
} from 'lucide-react'

/* ─── Password strength (same logic as Register) ─────────────────────────── */
const getPasswordStrength = (pw) => {
  if (!pw) return { level: 0, label: '', color: '' }
  let score = 0
  if (pw.length >= 6) score++
  if (pw.length >= 10) score++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 1) return { level: 1, label: 'Weak', color: 'bg-red-500' }
  if (score <= 2) return { level: 2, label: 'Fair', color: 'bg-amber-500' }
  if (score <= 3) return { level: 3, label: 'Good', color: 'bg-indigo-500' }
  return { level: 4, label: 'Strong', color: 'bg-emerald-500' }
}

/* ─── Theme options ──────────────────────────────────────────────────────── */
const THEMES = [
  { key: 'light', label: 'Light', icon: Sun, desc: 'Clean & bright interface' },
  { key: 'dark',  label: 'Dark',  icon: Moon, desc: 'Easy on the eyes' },
  { key: 'system', label: 'System', icon: Monitor, desc: 'Match your OS setting' },
]

export default function Settings() {
  const navigate = useNavigate()

  /* ── Auth ── */
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { navigate('/login'); return }
      setUser(session.user)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate('/login')
      else setUser(session.user)
    })
    return () => subscription.unsubscribe()
  }, [navigate])

  /* ── Profile ── */
  const [displayName, setDisplayName] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState(null)

  useEffect(() => {
    if (user) setDisplayName(user.user_metadata?.full_name || '')
  }, [user])

  const handleProfileSave = async (e) => {
    e.preventDefault()
    setProfileSaving(true)
    setProfileMsg(null)
    const { error } = await supabase.auth.updateUser({ data: { full_name: displayName } })
    setProfileMsg(error ? { type: 'error', text: error.message } : { type: 'success', text: 'Profile updated!' })
    setProfileSaving(false)
  }

  /* ── Password ── */
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState(null)
  const strength = getPasswordStrength(newPassword)

  const handlePasswordSave = async (e) => {
    e.preventDefault()
    setPwMsg(null)
    if (newPassword.length < 6) { setPwMsg({ type: 'error', text: 'Password must be at least 6 characters.' }); return }
    if (newPassword !== confirmPassword) { setPwMsg({ type: 'error', text: 'Passwords do not match.' }); return }
    setPwSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPwMsg(error ? { type: 'error', text: error.message } : { type: 'success', text: 'Password changed successfully!' })
    if (!error) { setNewPassword(''); setConfirmPassword('') }
    setPwSaving(false)
  }

  /* ── Email ── */
  const [newEmail, setNewEmail] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailMsg, setEmailMsg] = useState(null)

  const handleEmailSave = async (e) => {
    e.preventDefault()
    setEmailMsg(null)
    if (!newEmail || newEmail === user?.email) { setEmailMsg({ type: 'error', text: 'Please enter a different email address.' }); return }
    setEmailSaving(true)
    const { error } = await supabase.auth.updateUser({ email: newEmail })
    setEmailMsg(error ? { type: 'error', text: error.message } : { type: 'success', text: 'Verification email sent! Check your inbox.' })
    if (!error) setNewEmail('')
    setEmailSaving(false)
  }

  /* ── Theme (from context) ── */
  const { theme, setTheme, isDark } = useTheme()

  /* ── Derived ── */
  const initials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : user?.email?.[0]?.toUpperCase() || '?'

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className={`min-h-screen ${isDark ? 'bg-slate-950' : 'bg-gray-50'} flex items-center justify-center`}>
        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className={`relative min-h-screen ${isDark ? 'bg-slate-950' : 'bg-gray-50'} overflow-hidden`}>
      {/* ── Ambient orbs ── */}
      <div className="absolute inset-0 pointer-events-none">
        <div className={`hero-orb-1 absolute top-20 -left-40 w-[500px] h-[500px] rounded-full blur-3xl ${isDark ? 'bg-indigo-600/10' : 'bg-indigo-200/30'}`} />
        <div className={`hero-orb-2 absolute bottom-20 -right-40 w-[500px] h-[500px] rounded-full blur-3xl ${isDark ? 'bg-purple-600/10' : 'bg-purple-200/30'}`} />
        <div className={`absolute inset-0 ${isDark ? 'bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.04)_0%,transparent_50%)]' : 'bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.03)_0%,transparent_50%)]'}`} />
      </div>

      {/* ── Content ── */}
      <div className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 pt-28 pb-20">

        {/* Back + heading */}
        <div className="auth-card-in mb-10">
          <button
            onClick={() => navigate('/dashboard')}
            className={`inline-flex items-center gap-1.5 text-sm ${isDark ? 'text-slate-500 hover:text-indigo-400' : 'text-gray-500 hover:text-indigo-600'} transition-colors mb-5 cursor-pointer group`}
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            Back to Dashboard
          </button>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-lg font-bold text-white shadow-lg shadow-indigo-500/20 shrink-0">
              {initials}
            </div>
            <div>
              <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} tracking-tight`}>Settings</h1>
              <p className={`text-sm ${isDark ? 'text-slate-500' : 'text-gray-500'} mt-0.5`}>{user?.email}</p>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            EDIT PROFILE
           ═══════════════════════════════════════════════════════════════════ */}
        <section className="auth-card-in mb-6" style={{ animationDelay: '0.05s' }}>
          <div className={`rounded-2xl border ${isDark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-gray-200 bg-white shadow-sm'} p-6 sm:p-7`}>
            <div className="flex items-center gap-2.5 mb-5">
              <div className={`w-8 h-8 rounded-lg ${isDark ? 'bg-slate-800' : 'bg-gray-100'} flex items-center justify-center`}>
                <User className={`w-4 h-4 ${isDark ? 'text-slate-400' : 'text-gray-500'}`} />
              </div>
              <h2 className={`text-[15px] font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Edit Profile</h2>
            </div>

            {profileMsg && (
              <div className={`mb-5 rounded-xl px-4 py-3 text-sm flex items-start gap-2 ${
                profileMsg.type === 'error'
                  ? 'bg-red-500/10 border border-red-500/20 text-red-300'
                  : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
              }`}>
                <span className="shrink-0 mt-0.5">{profileMsg.type === 'error' ? '⚠' : '✓'}</span>
                <span>{profileMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleProfileSave} className="space-y-5">
              <div>
                <label htmlFor="displayName" className={`block text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-700'} mb-2`}>
                  Display name
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <User className={`w-4 h-4 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
                  </div>
                  <input
                    id="displayName"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Jane Doe"
                    className={`auth-input block w-full rounded-xl border ${isDark ? 'border-white/[0.08] bg-white/[0.04] text-white placeholder:text-slate-600' : 'border-gray-300 bg-gray-50 text-gray-900 placeholder:text-gray-400'} py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all`}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-700'} mb-2`}>
                  Email address
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <Mail className={`w-4 h-4 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
                  </div>
                  <input
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className={`block w-full rounded-xl border ${isDark ? 'border-white/[0.06] bg-white/[0.02] text-slate-500' : 'border-gray-200 bg-gray-100 text-gray-400'} py-3 pl-10 pr-4 text-sm cursor-not-allowed`}
                  />
                </div>
                <p className={`mt-1.5 text-xs ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>To change your email, use the section below.</p>
              </div>

              <button
                type="submit"
                disabled={profileSaving}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/35 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                {profileSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Changes
              </button>
            </form>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════
            CHANGE PASSWORD
           ═══════════════════════════════════════════════════════════════════ */}
        <section className="auth-card-in mb-6" style={{ animationDelay: '0.1s' }}>
          <div className={`rounded-2xl border ${isDark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-gray-200 bg-white shadow-sm'} p-6 sm:p-7`}>
            <div className="flex items-center gap-2.5 mb-5">
              <div className={`w-8 h-8 rounded-lg ${isDark ? 'bg-slate-800' : 'bg-gray-100'} flex items-center justify-center`}>
                <Lock className={`w-4 h-4 ${isDark ? 'text-slate-400' : 'text-gray-500'}`} />
              </div>
              <h2 className={`text-[15px] font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Change Password</h2>
            </div>

            {pwMsg && (
              <div className={`mb-5 rounded-xl px-4 py-3 text-sm flex items-start gap-2 ${
                pwMsg.type === 'error'
                  ? 'bg-red-500/10 border border-red-500/20 text-red-300'
                  : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
              }`}>
                <span className="shrink-0 mt-0.5">{pwMsg.type === 'error' ? '⚠' : '✓'}</span>
                <span>{pwMsg.text}</span>
              </div>
            )}

            <form onSubmit={handlePasswordSave} className="space-y-5">
              {/* New password */}
              <div>
                <label htmlFor="newPassword" className={`block text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-700'} mb-2`}>
                  New password
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <Lock className={`w-4 h-4 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
                  </div>
                  <input
                    id="newPassword"
                    type={showNew ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`auth-input block w-full rounded-xl border ${isDark ? 'border-white/[0.08] bg-white/[0.04] text-white placeholder:text-slate-600' : 'border-gray-300 bg-gray-50 text-gray-900 placeholder:text-gray-400'} py-3 pl-10 pr-11 text-sm focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className={`absolute inset-y-0 right-0 flex items-center pr-3.5 ${isDark ? 'text-slate-500 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600'} transition-colors`}
                  >
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {/* Strength meter */}
                {newPassword && (
                  <div className="mt-2.5 space-y-1.5">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= strength.level ? strength.color : isDark ? 'bg-white/[0.06]' : 'bg-gray-200'}`} />
                      ))}
                    </div>
                    <p className={`text-xs ${strength.level <= 1 ? 'text-red-400' : strength.level <= 2 ? 'text-amber-400' : strength.level <= 3 ? 'text-indigo-400' : 'text-emerald-400'}`}>
                      {strength.label}
                    </p>
                  </div>
                )}
              </div>

              {/* Confirm password */}
              <div>
                <label htmlFor="confirmPw" className={`block text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-700'} mb-2`}>
                  Confirm new password
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <Lock className={`w-4 h-4 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
                  </div>
                  <input
                    id="confirmPw"
                    type={showConfirm ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`auth-input block w-full rounded-xl border ${isDark ? 'bg-white/[0.04] text-white placeholder:text-slate-600' : 'bg-gray-50 text-gray-900 placeholder:text-gray-400'} py-3 pl-10 pr-11 text-sm focus:outline-none focus:ring-2 transition-all ${
                      confirmPassword && confirmPassword !== newPassword
                        ? 'border-red-500/40 focus:border-red-500/50 focus:ring-red-500/20'
                        : confirmPassword && confirmPassword === newPassword
                          ? 'border-emerald-500/40 focus:border-emerald-500/50 focus:ring-emerald-500/20'
                          : isDark ? 'border-white/[0.08] focus:border-indigo-500/50 focus:ring-indigo-500/20' : 'border-gray-300 focus:border-indigo-500/50 focus:ring-indigo-500/20'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className={`absolute inset-y-0 right-0 flex items-center pr-3.5 ${isDark ? 'text-slate-500 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600'} transition-colors`}
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword && confirmPassword !== newPassword && (
                  <p className="mt-1.5 text-xs text-red-400">Passwords don't match</p>
                )}
              </div>

              <button
                type="submit"
                disabled={pwSaving || !newPassword || !confirmPassword}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/35 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                {pwSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                Update Password
              </button>
            </form>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════
            CHANGE EMAIL
           ═══════════════════════════════════════════════════════════════════ */}
        <section className="auth-card-in mb-6" style={{ animationDelay: '0.15s' }}>
          <div className={`rounded-2xl border ${isDark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-gray-200 bg-white shadow-sm'} p-6 sm:p-7`}>
            <div className="flex items-center gap-2.5 mb-5">
              <div className={`w-8 h-8 rounded-lg ${isDark ? 'bg-slate-800' : 'bg-gray-100'} flex items-center justify-center`}>
                <Mail className={`w-4 h-4 ${isDark ? 'text-slate-400' : 'text-gray-500'}`} />
              </div>
              <h2 className={`text-[15px] font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Change Email</h2>
            </div>

            {emailMsg && (
              <div className={`mb-5 rounded-xl px-4 py-3 text-sm flex items-start gap-2 ${
                emailMsg.type === 'error'
                  ? 'bg-red-500/10 border border-red-500/20 text-red-300'
                  : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
              }`}>
                <span className="shrink-0 mt-0.5">{emailMsg.type === 'error' ? '⚠' : '✓'}</span>
                <span>{emailMsg.text}</span>
              </div>
            )}

            {/* Current email */}
            <div className={`mb-5 rounded-xl ${isDark ? 'bg-white/[0.02] border border-white/[0.04]' : 'bg-gray-50 border border-gray-200'} px-4 py-3.5`}>
              <p className={`text-[11px] uppercase tracking-wider ${isDark ? 'text-slate-600' : 'text-gray-400'} mb-1`}>Current email</p>
              <div className="flex items-center gap-2">
                <p className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>{user?.email}</p>
                {user?.email_confirmed_at ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
                    <ShieldCheck className="w-3 h-3" /> Verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-400 uppercase tracking-wider">
                    Unverified
                  </span>
                )}
              </div>
            </div>

            <form onSubmit={handleEmailSave} className="space-y-5">
              <div>
                <label htmlFor="newEmail" className={`block text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-700'} mb-2`}>
                  New email address
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <Mail className={`w-4 h-4 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
                  </div>
                  <input
                    id="newEmail"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="newemail@example.com"
                    className={`auth-input block w-full rounded-xl border ${isDark ? 'border-white/[0.08] bg-white/[0.04] text-white placeholder:text-slate-600' : 'border-gray-300 bg-gray-50 text-gray-900 placeholder:text-gray-400'} py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all`}
                  />
                </div>
                <p className={`mt-1.5 text-xs ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>A verification link will be sent to both your current and new email.</p>
              </div>

              <button
                type="submit"
                disabled={emailSaving || !newEmail}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/35 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                {emailSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                Update Email
              </button>
            </form>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════
            THEME
           ═══════════════════════════════════════════════════════════════════ */}
        <section className="auth-card-in mb-6" style={{ animationDelay: '0.2s' }}>
          <div className={`rounded-2xl border ${isDark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-gray-200 bg-white shadow-sm'} p-6 sm:p-7`}>
            <div className="flex items-center gap-2.5 mb-5">
              <div className={`w-8 h-8 rounded-lg ${isDark ? 'bg-slate-800' : 'bg-gray-100'} flex items-center justify-center`}>
                <Palette className={`w-4 h-4 ${isDark ? 'text-slate-400' : 'text-gray-500'}`} />
              </div>
              <h2 className={`text-[15px] font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Appearance</h2>
            </div>

            <p className={`text-sm ${isDark ? 'text-slate-500' : 'text-gray-500'} mb-5`}>Choose how Batch My Photos looks. This applies across the entire site.</p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {THEMES.map(({ key, label, icon: I, desc }) => (
                <button
                  key={key}
                  onClick={() => setTheme(key)}
                  className={`group relative rounded-xl border p-4 text-left transition-all cursor-pointer ${
                    theme === key
                      ? 'border-indigo-500/40 bg-indigo-500/[0.06] shadow-lg shadow-indigo-500/5'
                      : isDark
                        ? 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.10]'
                        : 'border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300'
                  }`}
                >
                  {/* Selected indicator */}
                  {theme === key && (
                    <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 transition-colors ${
                    theme === key
                      ? 'bg-indigo-500/15 border border-indigo-500/20'
                      : isDark
                        ? 'bg-white/[0.03] border border-white/[0.06] group-hover:border-white/[0.10]'
                        : 'bg-white border border-gray-200 group-hover:border-gray-300'
                  }`}>
                    <I className={`w-4.5 h-4.5 transition-colors ${theme === key ? 'text-indigo-400' : isDark ? 'text-slate-500 group-hover:text-slate-400' : 'text-gray-400 group-hover:text-gray-500'}`} />
                  </div>
                  <p className={`text-sm font-semibold transition-colors ${theme === key ? (isDark ? 'text-white' : 'text-gray-900') : isDark ? 'text-slate-300' : 'text-gray-700'}`}>{label}</p>
                  <p className={`text-[12px] ${isDark ? 'text-slate-600' : 'text-gray-400'} mt-0.5`}>{desc}</p>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ── Privacy footer ── */}
        <div className={`auth-card-in flex items-center justify-center gap-2 text-xs ${isDark ? 'text-slate-600' : 'text-gray-400'} mt-8`} style={{ animationDelay: '0.25s' }}>
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Your photos never leave your device — we only store your email &amp; plan.</span>
        </div>
      </div>
    </div>
  )
}
