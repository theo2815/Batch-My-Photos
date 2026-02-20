import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CreditCard, Check, Clock, Sparkles } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { useSubscription } from '../hooks/useSubscription'
import { supabase } from '../lib/supabase'


export default function BillingHistory() {
  const navigate = useNavigate()
  const { isDark } = useTheme()
  const { subscription: sub, loading } = useSubscription()
  const [transactions, setTransactions] = useState([])
  const [txLoading, setTxLoading] = useState(true)

  const isFree = !sub || sub.plan === 'free'

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/transactions`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (res.ok) {
          const result = await res.json()
          // API returns { data, total, limit, offset } with pagination
          setTransactions(Array.isArray(result) ? result : result.data || [])
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
    <div className={`min-h-screen ${isDark ? 'bg-slate-950' : 'bg-gray-50'} flex items-center justify-center`}>
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20" />
        <div className="absolute inset-0 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      </div>
    </div>
  )

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-950' : 'bg-gray-50'} pt-24 pb-20`}>
      
      <div className="max-w-4xl mx-auto px-5 sm:px-8 mb-8">
        <button
          onClick={() => navigate('/dashboard')}
          className={`inline-flex items-center gap-1.5 text-sm ${isDark ? 'text-slate-500 hover:text-indigo-400' : 'text-gray-500 hover:text-indigo-600'} transition-colors mb-5 cursor-pointer group`}
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Back to Dashboard
        </button>
        
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl ${isDark ? 'bg-indigo-500/10' : 'bg-indigo-50'} flex items-center justify-center text-lg font-bold ${isDark ? 'text-indigo-400' : 'text-indigo-600'} border ${isDark ? 'border-indigo-500/20' : 'border-indigo-100'}`}>
            <CreditCard className="w-7 h-7" />
          </div>
          <div>
            <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} tracking-tight`}>Billing & Invoices</h1>
            <p className={`text-sm ${isDark ? 'text-slate-500' : 'text-gray-500'} mt-0.5`}>Manage your subscription and payment history</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-5 sm:px-8 pt-8 space-y-8">

        {/* ── Subscription Summary ── */}
        <section className="auth-card-in" style={{ animationDelay: '0.05s' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-sm font-semibold ${isDark ? 'text-slate-400' : 'text-gray-500'} uppercase tracking-wide`}>Current Subscription</h2>
          </div>
          
          <div className={`grid grid-cols-1 md:grid-cols-3 gap-4`}>
            {/* Plan Details */}
            <div className={`p-5 rounded-2xl border ${isFree
              ? isDark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-gray-200 bg-gray-50'
              : isDark ? 'border-indigo-500/20 bg-indigo-500/[0.03]' : 'border-indigo-100 bg-indigo-50/50'
            } relative overflow-hidden`}>
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${
                    sub?.status === 'active'
                      ? 'bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20'
                      : 'bg-slate-800 text-slate-500 ring-1 ring-slate-700'
                  }`}>{sub?.status === 'active' ? 'Active' : sub?.status || 'Inactive'}</span>
                </div>
                <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{isFree ? 'Free Plan' : 'Pro Plan'}</h3>
                <p className={`text-sm ${isDark ? 'text-indigo-300' : 'text-indigo-600'}`}>{isFree ? '₱0/month' : '₱499/month'}</p>
              </div>
            </div>

            {/* Next Billing / Expiry */}
            <div className={`p-5 rounded-2xl border ${isDark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-gray-200 bg-white shadow-sm'}`}>
              <p className={`text-[11px] font-semibold uppercase tracking-wide ${isDark ? 'text-slate-500' : 'text-gray-400'} mb-1`}>
                {isFree ? 'Plan Type' : 'Expires On'}
              </p>
              <div className="flex items-center gap-2">
                <Clock className={`w-4 h-4 ${isDark ? 'text-slate-400' : 'text-gray-500'}`} />
                <span className={`text-base font-medium ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>
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
            <div className={`p-5 rounded-2xl border ${isDark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-gray-200 bg-white shadow-sm'} flex flex-col justify-center`}>
              {isFree ? (
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => navigate('/dashboard?modal=pricing')}
                    className={`inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all cursor-pointer`}
                  >
                    <Sparkles className="w-4 h-4 text-indigo-100" /> Upgrade to Pro
                  </button>
                </div>
              ) : (
                <>
                  <p className={`text-[11px] font-semibold uppercase tracking-wide ${isDark ? 'text-slate-500' : 'text-gray-400'} mb-1`}>Last Payment</p>
                  <div className="flex items-center gap-2">
                    <Check className={`w-4 h-4 text-emerald-500`} />
                    <span className={`text-base font-medium ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>
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
          <h2 className={`text-sm font-semibold ${isDark ? 'text-slate-400' : 'text-gray-500'} uppercase tracking-wide mb-4`}>Transaction History</h2>
          
          <div className={`rounded-2xl border ${isDark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-gray-200 bg-white shadow-sm'} overflow-hidden`}>
            {txLoading ? (
              <div className="p-8 flex justify-center">
                <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
              </div>
            ) : transactions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className={`text-[11px] uppercase tracking-wider ${isDark ? 'text-slate-500 border-b border-white/[0.06]' : 'text-gray-400 border-b border-gray-100'}`}>
                      <th className="px-6 py-4 font-semibold">Date</th>
                      <th className="px-6 py-4 font-semibold">Description</th>
                      <th className="px-6 py-4 font-semibold">Amount</th>
                      <th className="px-6 py-4 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className={`text-sm ${isDark ? 'divide-y divide-white/[0.04]' : 'divide-y divide-gray-50'}`}>
                    {transactions.map((tx) => (
                      <tr key={tx.id} className={`group ${isDark ? 'hover:bg-white/[0.02]' : 'hover:bg-gray-50'} transition-colors`}>
                        <td className={`px-6 py-4 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                          {new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className={`px-6 py-4 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                          {tx.description || 'BatchMyPhotos Subscription'}
                        </td>
                        <td className={`px-6 py-4 font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
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
                <div className={`w-12 h-12 mx-auto mb-4 rounded-full ${isDark ? 'bg-slate-800' : 'bg-gray-100'} flex items-center justify-center`}>
                  <CreditCard className={`w-5 h-5 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
                </div>
                <h3 className={`text-base font-medium ${isDark ? 'text-white' : 'text-gray-900'} mb-1`}>No invoices yet</h3>
                <p className={`text-sm ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>Transactions will appear here once you make a payment.</p>
              </div>
            )}
          </div>
        </section>

      </div>


    </div>
  )
}
