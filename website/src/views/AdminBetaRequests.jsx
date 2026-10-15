'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { FlaskConical, Mail, Loader2, AlertTriangle, X, Check, RotateCcw } from 'lucide-react'

const VOLUME_LABELS = {
  'under-500': 'Under 500',
  '500-2000': '500 – 2,000',
  '2000-5000': '2,000 – 5,000',
  'over-5000': 'Over 5,000',
}

const formatDate = (d) => new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })

export default function AdminBetaRequests() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState(null)

  // Direct table access — RLS lets admins read every row
  const loadRequests = () =>
    supabase
      .from('blur_beta_requests')
      .select('*')
      .order('key_sent_at', { ascending: false, nullsFirst: true })
      .order('created_at', { ascending: false })
      .then(({ data, error: listError }) => {
        if (listError) setError('Failed to load beta requests')
        else setRequests(data || [])
        setLoading(false)
      })

  useEffect(() => { loadRequests() }, [])

  const setKeySent = async (userId, sent) => {
    setSavingId(userId)
    setError('')
    const { error: updateError } = await supabase
      .from('blur_beta_requests')
      .update({ key_sent_at: sent ? new Date().toISOString() : null })
      .eq('user_id', userId)
    setSavingId(null)
    if (updateError) setError('Failed to update the request')
    else loadRequests()
  }

  const pending = requests.filter((r) => !r.key_sent_at).length

  return (
    <div className="min-h-screen bg-bg-main text-text-primary">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-16 sm:pt-20 pb-8 sm:pb-12">
        <div className="flex items-center gap-3 mb-10">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <FlaskConical className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-primary">Blur Beta Requests</h1>
            <p className="text-sm mt-0.5 text-text-muted">
              {loading ? 'Loading…' : `${requests.length} request${requests.length === 1 ? '' : 's'} · ${pending} waiting for a key`}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-5 px-4 py-3 rounded-xl flex items-center gap-3 text-sm bg-red-500/10 border border-red-500/20 text-red-700">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError('')} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity" aria-label="Dismiss">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
          </div>
        ) : requests.length === 0 ? (
          <p className="text-center py-20 text-sm text-text-muted">No requests yet.</p>
        ) : (
          <div className="space-y-4">
            {requests.map((r) => (
              <div key={r.user_id} className="p-5 rounded-2xl border bg-bg-elevated border-border-subtle">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="font-display font-semibold text-text-primary">{r.full_name}</p>
                      {r.key_sent_at ? (
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20">
                          Key sent {formatDate(r.key_sent_at)}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/20">
                          Waiting
                        </span>
                      )}
                    </div>
                    <a href={`mailto:${r.email}?subject=Your%20BatchMyPhotos%20blur%20beta%20key`} className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline break-all">
                      <Mail className="w-3.5 h-3.5 shrink-0" /> {r.email}
                    </a>
                    <dl className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1 text-sm">
                      <div><dt className="text-[11px] uppercase tracking-wider text-text-muted">Shoots</dt><dd className="text-text-secondary">{r.photography_type}</dd></div>
                      <div><dt className="text-[11px] uppercase tracking-wider text-text-muted">Photos per event</dt><dd className="text-text-secondary">{VOLUME_LABELS[r.photos_per_event] || r.photos_per_event}</dd></div>
                      <div><dt className="text-[11px] uppercase tracking-wider text-text-muted">Requested</dt><dd className="text-text-secondary font-mono">{formatDate(r.created_at)}</dd></div>
                    </dl>
                    {r.reason && <p className="mt-3 text-sm text-text-secondary whitespace-pre-line break-words">{r.reason}</p>}
                  </div>
                  <button
                    onClick={() => setKeySent(r.user_id, !r.key_sent_at)}
                    disabled={savingId === r.user_id}
                    className={`shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer disabled:opacity-50 ${
                      r.key_sent_at
                        ? 'border border-border-subtle bg-bg-elevated text-text-secondary hover:bg-bg-surface'
                        : 'bg-primary hover:bg-primary-hover text-white'
                    }`}
                  >
                    {savingId === r.user_id ? <Loader2 className="w-4 h-4 animate-spin" /> : r.key_sent_at ? <RotateCcw className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                    {r.key_sent_at ? 'Undo' : 'Mark key sent'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
