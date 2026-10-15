'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, X, Sparkles, ArrowRight, FlaskConical } from 'lucide-react'
import ModalShell from './modals/ModalShell'
import Select from './Select'
import { supabase } from '../lib/supabase'

const PHOTO_VOLUMES = [
  { value: 'under-500', label: 'Under 500' },
  { value: '500-2000', label: '500 – 2,000' },
  { value: '2000-5000', label: '2,000 – 5,000' },
  { value: 'over-5000', label: 'Over 5,000' },
]

const EMPTY_FORM = { full_name: '', photography_type: '', photos_per_event: '', reason: '' }

const inputClass =
  'block w-full rounded-xl border border-border-subtle bg-bg-elevated text-text-primary placeholder:text-text-muted py-2.5 px-3.5 text-sm focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all'

export default function PricingModal({ isOpen, onClose }) {
  const [user, setUser] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [existing, setExisting] = useState(null) // the user's saved request, if any
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  // Load the signed-in user and any request they already sent
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      setUser(session?.user ?? null)
      if (!session) return
      // Filter by user: admins can read every request
      const { data } = await supabase.from('blur_beta_requests').select('*').eq('user_id', session.user.id).maybeSingle()
      if (cancelled || !data) return
      setExisting(data)
      setForm({
        full_name: data.full_name,
        photography_type: data.photography_type,
        photos_per_event: data.photos_per_event,
        reason: data.reason || '',
      })
    })()
    return () => { cancelled = true }
  }, [isOpen])

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.photos_per_event) {
      setError('Choose how many photos you shoot per event.')
      return
    }
    setSending(true)
    setError('')
    const { error: rpcError } = await supabase.rpc('request_blur_beta', {
      p_full_name: form.full_name,
      p_photography_type: form.photography_type,
      p_photos_per_event: form.photos_per_event,
      p_reason: form.reason || null,
    })
    setSending(false)
    if (rpcError) {
      setError('Could not send your request. Please try again.')
      return
    }
    setSent(true)
  }

  const handleClose = () => {
    setSent(false)
    setError('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <ModalShell title="Pricing" icon={Sparkles} maxWidth="max-w-4xl" bodyClassName="px-6 sm:px-8 py-8" onClose={handleClose}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Free */}
        <div className="relative p-6 rounded-2xl border border-primary/30 bg-primary/[0.06] flex flex-col md:self-start">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-primary text-white">Everyone</span>
          </div>
          <div className="flex items-baseline gap-1 mb-2">
            <h3 className="font-display text-2xl font-bold text-text-primary">Free</h3>
            <span className="font-mono text-xl font-bold text-accent">— ₱0</span>
          </div>
          <p className="text-sm text-text-secondary mb-6">Every feature, no subscription.</p>

          <ul className="space-y-4 text-sm">
            {['Unlimited batches', 'Offline batching', 'Up to 3 devices', 'No card, no payments'].map((item) => (
              <li key={item} className="flex items-center gap-3 text-text-primary font-medium">
                <Check className="w-4 h-4 shrink-0 text-emerald-700" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Blur detection beta */}
        <div className="relative p-6 rounded-2xl border border-accent/30 bg-accent/[0.06] flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-warning text-white">Beta · Invite only</span>
          </div>
          <div className="flex items-baseline gap-1 mb-2">
            <h3 className="font-display text-2xl font-bold text-text-primary">Blur detection</h3>
            <span className="font-mono text-xl font-bold text-accent">— ₱0</span>
          </div>
          <p className="text-sm text-text-secondary mb-6">
            Flags blurry shots before you sort. It is still learning, so we open it to testers first. Works in the
            Microsoft Store version; we email you a personal beta key.
          </p>

          {!user ? (
            <Link
              href="/login"
              onClick={handleClose}
              className="mt-auto w-full py-3 rounded-xl bg-primary hover:bg-primary-hover text-sm font-semibold text-white transition-all flex items-center justify-center gap-2"
            >
              Sign in to request a key <ArrowRight className="w-4 h-4" />
            </Link>
          ) : sent ? (
            <div className="mt-auto flex items-start gap-2 px-3 py-3 rounded-lg border text-sm border-emerald-600/30 bg-emerald-600/10 text-emerald-800">
              <Check className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Request sent. We emailed a confirmation to <strong>{user.email}</strong>; your beta key will come there if you&apos;re picked.</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-auto">
              {existing && (
                <p className="text-xs text-text-muted">
                  {existing.key_sent_at
                    ? 'Your beta key has been emailed to you. You can still update your details.'
                    : 'We have your request. Update it below if anything changed.'}
                </p>
              )}
              <div>
                <label htmlFor="beta-name" className="block text-xs font-medium text-text-secondary mb-1.5">Full name</label>
                <input id="beta-name" required maxLength={100} autoComplete="name" value={form.full_name} onChange={set('full_name')} placeholder="Jane Doe" className={inputClass} />
              </div>
              <div>
                <label htmlFor="beta-type" className="block text-xs font-medium text-text-secondary mb-1.5">What do you shoot?</label>
                <input id="beta-type" required maxLength={100} value={form.photography_type} onChange={set('photography_type')} placeholder="Marathons, weddings, sports…" className={inputClass} />
              </div>
              <div>
                <label htmlFor="beta-volume" className="block text-xs font-medium text-text-secondary mb-1.5">Photos per event</label>
                <Select
                  id="beta-volume"
                  value={form.photos_per_event}
                  options={PHOTO_VOLUMES}
                  invalid={Boolean(error) && !form.photos_per_event}
                  onChange={(v) => { setForm((f) => ({ ...f, photos_per_event: v })); setError('') }}
                />
              </div>
              <div>
                <label htmlFor="beta-reason" className="block text-xs font-medium text-text-secondary mb-1.5">
                  Why do you want to test it? <span className="text-text-muted">(optional)</span>
                </label>
                <textarea id="beta-reason" rows={3} maxLength={1000} value={form.reason} onChange={set('reason')} className={`${inputClass} resize-none`} />
              </div>

              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs border-red-500/30 bg-red-500/10 text-red-700">
                  <X className="w-3.5 h-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={sending}
                className={`w-full py-3 rounded-xl bg-primary hover:bg-primary-hover text-sm font-semibold text-white transition-all cursor-pointer flex items-center justify-center gap-2 ${sending ? 'opacity-75 cursor-wait' : ''}`}
              >
                <FlaskConical className="w-4 h-4" />
                {sending ? 'Sending…' : existing ? 'Update my request' : 'Request a beta key'}
              </button>
            </form>
          )}
        </div>
      </div>
    </ModalShell>
  )
}
