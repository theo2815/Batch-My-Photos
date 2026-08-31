'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CreditCard, Check, Clock, Sparkles } from 'lucide-react'
import { useSubscription } from '../hooks/useSubscription'
import { supabase } from '../lib/supabase'


export default function BillingHistory() {
  const router = useRouter()
  const { subscription: sub, loading } = useSubscription()
  const [transactions, setTransactions] = useState([])
  const [txLoading, setTxLoading] = useState(true)

  const isFree = !sub || sub.plan === 'free'

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        // Direct RLS read — users can only ever see their own rows
        const { data, error } = await supabase
          .from('transactions')
          .select('*')
          .order('created_at', { ascending: false })
          .range(0, 49)
        if (!error) {
          setTransactions(data || [])
        }
      } catch (err) {
        console.error('Failed to fetch transactions:', err)
      } finally {
        setTxLoading(false)
      }
    }
    fetchTransactions()
  }, [])

  if (loading) return (
    <div className="min-h-screen bg-bg-main flex items-center justify-center">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
        <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-bg-main pt-24 pb-20">

      <div className="max-w-4xl mx-auto px-5 sm:px-8 mb-8">
        <button
          onClick={() => router.push('/dashboard')}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-accent transition-colors mb-5 cursor-pointer group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Back to Dashboard
        </button>

        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-lg font-bold text-accent border border-primary/20">
            <CreditCard className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-text-primary tracking-tight">Billing & Invoices</h1>
            <p className="text-sm text-text-muted mt-0.5">Manage your subscription and payment history</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-5 sm:px-8 pt-8 space-y-8">

        {/* ── Subscription Summary ── */}
        <section className="auth-card-in" style={{ animationDelay: '0.05s' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">Current Subscription</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Plan Details */}
            <div className={`p-5 rounded-2xl border ${isFree
              ? 'border-border-subtle bg-bg-elevated'
              : 'border-primary/20 bg-primary/[0.03]'
            } relative overflow-hidden`}>
              <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${
                    sub?.status === 'active'
                      ? 'bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20'
                      : 'bg-bg-elevated text-text-muted ring-1 ring-border-subtle'
                  }`}>{sub?.status === 'active' ? 'Active' : sub?.status || 'Inactive'}</span>
                </div>
                <h3 className="text-xl font-display font-bold text-text-primary">{isFree ? 'Free Plan' : 'Pro Plan'}</h3>
                <p className="text-sm font-mono text-accent">{isFree ? '₱0/month' : '₱299/month'}</p>
              </div>
            </div>

            {/* Next Billing / Expiry */}
            <div className="p-5 rounded-2xl border border-border-subtle bg-bg-elevated">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-1">
                {isFree ? 'Plan Type' : 'Expires On'}
              </p>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-text-secondary" />
                <span className="text-base font-mono font-medium text-text-primary">
                  {isFree
                    ? 'Free — No expiry'
                    : sub?.expires_at
                      ? new Date(sub.expires_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                      : '—'
                  }
                </span>
              </div>
            </div>

            {/* Payment Info / Upgrade CTA */}
            <div className="p-5 rounded-2xl border border-border-subtle bg-bg-elevated flex flex-col justify-center">
              {isFree ? (
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => router.push('/dashboard?modal=pricing')}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent hover:brightness-110 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-all cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-white" /> Upgrade to Pro
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-1">Last Payment</p>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500" />
                    <span className="text-base font-mono font-medium text-text-primary">
                      {sub?.paid_at
                        ? new Date(sub.paid_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                        : '—'
                      }
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        {/* ── Transaction History ── */}
        <section className="auth-card-in" style={{ animationDelay: '0.1s' }}>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-4">Transaction History</h2>

          <div className="rounded-2xl border border-border-subtle bg-bg-elevated overflow-hidden">
            {txLoading ? (
              <div className="p-8 flex justify-center">
                <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : transactions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-text-muted border-b border-border-subtle">
                      <th className="px-6 py-4 font-semibold">Date</th>
                      <th className="px-6 py-4 font-semibold">Description</th>
                      <th className="px-6 py-4 font-semibold">Amount</th>
                      <th className="px-6 py-4 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-border-subtle">
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="group hover:bg-bg-surface transition-colors">
                        <td className="px-6 py-4 font-mono text-text-secondary">
                          {new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className="px-6 py-4 font-mono text-text-secondary">
                          {tx.description || 'BatchMyPhotos Subscription'}
                        </td>
                        <td className="px-6 py-4 font-mono font-medium text-text-primary">
                          {tx.currency} { (tx.amount / 100).toFixed(2) }
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${
                            tx.status === 'paid' 
                              ? 'bg-emerald-500/10 text-emerald-500' 
                              : tx.status === 'pending'
                                ? 'bg-amber-500/10 text-amber-500'
                                : 'bg-red-500/10 text-red-500'
                          }`}>
                            {tx.status === 'paid' && <Check className="w-3 h-3" />}
                            {tx.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center">
                <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-bg-elevated flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-text-muted" />
                </div>
                <h3 className="text-base font-medium text-text-primary mb-1">No invoices yet</h3>
                <p className="text-sm text-text-muted">Transactions will appear here once you make a payment.</p>
              </div>
            )}
          </div>
        </section>

      </div>


    </div>
  )
}
