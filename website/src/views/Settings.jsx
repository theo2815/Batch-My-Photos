'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import {
  User, Mail, Lock, Eye, EyeOff, ArrowLeft, Loader2,
  Check, ShieldCheck,
} from 'lucide-react'
import { getPasswordStrength } from '../utils/passwordStrength'

export default function Settings() {
  const router = useRouter()

  /* ── Auth ── */
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user)
      }
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.push('/')
      else setUser(session.user)
    })
    return () => subscription.unsubscribe()
  }, [router])

  /* ── Profile ── */
  const [displayName, setDisplayName] = useState('')
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState(null)

  useEffect(() => {
    if (user) setDisplayName(user.user_metadata?.full_name || '')
  }, [user])

  const handleEditClick = () => {
    setIsEditingProfile(true)
    setProfileMsg(null)
  }

  const handleCancelClick = () => {
    setIsEditingProfile(false)
    setDisplayName(user?.user_metadata?.full_name || '')
    setProfileMsg(null)
  }

  const handleProfileSave = async (e) => {
    e.preventDefault()
    setProfileSaving(true)
    setProfileMsg(null)

    const { data, error } = await supabase.auth.updateUser({ 
      data: { 
        full_name: displayName,
        name: displayName // Also update 'name' as some providers (like Google) use this field
      } 
    })
    
    if (error) {
      setProfileMsg({ type: 'error', text: error.message })
    } else {
      setUser(data.user) // Update local user state immediately
      setProfileMsg({ type: 'success', text: 'Profile updated!' })
      setIsEditingProfile(false)
      // Auto-dismiss success message
      setTimeout(() => setProfileMsg(null), 3000)
    }
    
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


  /* ── Derived ── */
  const initials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : user?.email?.[0]?.toUpperCase() || '?'

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="min-h-screen bg-bg-main flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-accent animate-spin" />
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-bg-main overflow-hidden">
      {/* ── Content ── */}
      <div className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 pt-28 pb-20">

        {/* Back + heading */}
        <div className="auth-card-in mb-10">
          <button
            onClick={() => router.push('/dashboard')}
            className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-accent transition-colors mb-5 cursor-pointer group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            Back to Dashboard
          </button>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center text-lg font-bold text-white shrink-0">
              {initials}
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold text-text-primary tracking-tight">Settings</h1>
              <p className="text-sm text-text-muted mt-0.5">{user?.email}</p>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            EDIT PROFILE
           ═══════════════════════════════════════════════════════════════════ */}
        <section id="profile" className="auth-card-in mb-6" style={{ animationDelay: '0.05s' }}>
          <div className="rounded-2xl border border-border-subtle bg-bg-elevated p-6 sm:p-7">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-bg-surface flex items-center justify-center">
                  <User className="w-4 h-4 text-text-secondary" />
                </div>
                <h2 className="text-[15px] font-display font-bold text-text-primary">Edit Profile</h2>
              </div>
              {!isEditingProfile && (
                <button
                  onClick={handleEditClick}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-border-subtle text-accent hover:bg-bg-surface"
                >
                  Edit
                </button>
              )}
            </div>

            {profileMsg && (
              <div className={`mb-5 rounded-xl px-4 py-3 text-sm flex items-start gap-2 ${
                profileMsg.type === 'error'
                  ? 'bg-red-500/10 border border-red-500/20 text-red-700'
                  : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-700'
              }`}>
                <span className="shrink-0 mt-0.5">{profileMsg.type === 'error' ? '⚠' : '✓'}</span>
                <span>{profileMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleProfileSave} className="space-y-5">
              <div>
                <label htmlFor="displayName" className="block text-sm font-medium text-text-secondary mb-2">
                  Display name
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <User className="w-4 h-4 text-text-muted" />
                  </div>
                  <input
                    id="displayName"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Jane Doe"
                    disabled={!isEditingProfile}
                    className="auth-input block w-full rounded-xl border border-border-subtle bg-bg-elevated text-text-primary placeholder:text-text-muted disabled:opacity-50 disabled:cursor-default py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Email address
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <Mail className="w-4 h-4 text-text-muted" />
                  </div>
                  <input
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className="block w-full rounded-xl border border-border-subtle bg-bg-elevated text-text-muted py-3 pl-10 pr-4 text-sm cursor-not-allowed"
                  />
                </div>
                <p className="mt-1.5 text-xs text-text-muted">To protect your account, email cannot be changed.</p>
              </div>

              {isEditingProfile && (
                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={profileSaving}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] cursor-pointer"
                  >
                    {profileSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Save Changes
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelClick}
                    disabled={profileSaving}
                    className="px-5 py-2.5 rounded-xl border text-sm font-semibold transition-all cursor-pointer border-border-subtle text-text-secondary hover:bg-bg-surface"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </form>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════
            CHANGE PASSWORD
           ═══════════════════════════════════════════════════════════════════ */}
        <section id="password" className="auth-card-in mb-6" style={{ animationDelay: '0.1s' }}>
          <div className="rounded-2xl border border-border-subtle bg-bg-elevated p-6 sm:p-7">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-8 h-8 rounded-lg bg-bg-surface flex items-center justify-center">
                <Lock className="w-4 h-4 text-text-secondary" />
              </div>
              <h2 className="text-[15px] font-display font-bold text-text-primary">Change Password</h2>
            </div>

            {pwMsg && (
              <div className={`mb-5 rounded-xl px-4 py-3 text-sm flex items-start gap-2 ${
                pwMsg.type === 'error'
                  ? 'bg-red-500/10 border border-red-500/20 text-red-700'
                  : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-700'
              }`}>
                <span className="shrink-0 mt-0.5">{pwMsg.type === 'error' ? '⚠' : '✓'}</span>
                <span>{pwMsg.text}</span>
              </div>
            )}

            <form onSubmit={handlePasswordSave} className="space-y-5">
              {/* New password */}
              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-text-secondary mb-2">
                  New password
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <Lock className="w-4 h-4 text-text-muted" />
                  </div>
                  <input
                    id="newPassword"
                    type={showNew ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="auth-input block w-full rounded-xl border border-border-subtle bg-bg-elevated text-text-primary placeholder:text-text-muted py-3 pl-10 pr-11 text-sm focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-text-muted hover:text-text-secondary transition-colors"
                  >
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {/* Strength meter */}
                {newPassword && (
                  <div className="mt-2.5 space-y-1.5">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= strength.level ? strength.color : 'bg-bg-surface'}`} />
                      ))}
                    </div>
                    <p className={`text-xs ${strength.level <= 1 ? 'text-red-700' : strength.level <= 2 ? 'text-amber-700' : strength.level <= 3 ? 'text-accent' : 'text-emerald-700'}`}>
                      {strength.label}
                    </p>
                  </div>
                )}
              </div>

              {/* Confirm password */}
              <div>
                <label htmlFor="confirmPw" className="block text-sm font-medium text-text-secondary mb-2">
                  Confirm new password
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <Lock className="w-4 h-4 text-text-muted" />
                  </div>
                  <input
                    id="confirmPw"
                    type={showConfirm ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`auth-input block w-full rounded-xl border bg-bg-elevated text-text-primary placeholder:text-text-muted py-3 pl-10 pr-11 text-sm focus:outline-none focus:ring-2 transition-all ${
                      confirmPassword && confirmPassword !== newPassword
                        ? 'border-red-500/40 focus:border-red-500/50 focus:ring-red-500/20'
                        : confirmPassword && confirmPassword === newPassword
                          ? 'border-emerald-500/40 focus:border-emerald-500/50 focus:ring-emerald-500/20'
                          : 'border-border-subtle focus:border-primary/50 focus:ring-primary/20'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-text-muted hover:text-text-secondary transition-colors"
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword && confirmPassword !== newPassword && (
                  <p className="mt-1.5 text-xs text-red-700">Passwords don't match</p>
                )}
              </div>

              <button
                type="submit"
                disabled={pwSaving || !newPassword || !confirmPassword}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] cursor-pointer"
              >
                {pwSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                Update Password
              </button>
            </form>
          </div>
        </section>

        {/* ── Privacy footer ── */}
        <div className="auth-card-in flex items-center justify-center gap-2 text-xs text-text-muted mt-8" style={{ animationDelay: '0.25s' }}>
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Your photos never leave your device — we only store your email &amp; plan.</span>
        </div>
      </div>
    </div>
  )
}
