
import { Check, X, CreditCard, Sparkles } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

export default function PricingModal({ isOpen, onClose, onUpgrade, checkoutLoading }) {
  const { isDark } = useTheme()

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className={`relative w-full max-w-3xl max-h-[90vh] rounded-3xl border ${isDark ? 'border-white/[0.08] bg-slate-900 shadow-2xl shadow-black/50' : 'border-gray-200 bg-white shadow-2xl shadow-gray-300/50'} flex flex-col animate-[footerModalIn_0.2s_ease-out] overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between px-8 py-6 border-b ${isDark ? 'border-white/[0.06]' : 'border-gray-200'} shrink-0`}>
          <div className="flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl ${isDark ? 'bg-white/[0.06]' : 'bg-gray-100'} flex items-center justify-center text-cyan-400`}>
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Upgrade Plan</h3>
          </div>
          <button onClick={onClose} className={`w-9 h-9 rounded-xl ${isDark ? 'hover:bg-white/[0.06] text-slate-500 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-700'} flex items-center justify-center transition-colors cursor-pointer`} aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="px-8 py-8 overflow-y-auto flex-1 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Free Plan */}
            <div className={`relative p-6 rounded-2xl border ${isDark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-gray-200 bg-gray-50'}`}>
              <div className="flex items-baseline gap-1 mb-1">
                <h3 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Free</h3>
              </div>
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'} mb-6`}>For casual use</p>
              
              <ul className="space-y-4 text-sm">
                <li className={`flex items-center gap-3 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                  <Check className={`w-4 h-4 shrink-0 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
                  <span>5 batches / month</span>
                </li>
                <li className={`flex items-center gap-3 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                  <Check className={`w-4 h-4 shrink-0 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
                  <span>Requires internet</span>
                </li>
                <li className={`flex items-center gap-3 ${isDark ? 'text-slate-500' : 'text-gray-400'} opacity-75`}>
                  <X className="w-4 h-4 shrink-0" />
                  <span>Watermarking</span>
                </li>
                <li className={`flex items-center gap-3 ${isDark ? 'text-slate-500' : 'text-gray-400'} opacity-75`}>
                  <X className="w-4 h-4 shrink-0" />
                  <span>Blur detection (Coming Soon)</span>
                </li>
              </ul>
            </div>

            {/* Pro Plan */}
            <div className={`relative p-6 rounded-2xl border ${isDark ? 'border-indigo-500/30 bg-indigo-500/[0.04]' : 'border-indigo-200 bg-indigo-50/50'} overflow-hidden`}>
              {/* Glow effect */}
              <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
              
              <div className="flex items-center gap-2 mb-3 relative z-10">
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/30">Recommended</span>
              </div>
              <div className="flex items-baseline gap-1 mb-2 relative z-10">
                <h3 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Pro</h3>
                <span className={`text-xl font-bold ${isDark ? 'text-indigo-300' : 'text-indigo-600'}`}>— ₱249/mo</span>
              </div>
              <p className={`text-sm ${isDark ? 'text-indigo-200' : 'text-indigo-600'} mb-6 relative z-10`}>For power users</p>
              
              <ul className="space-y-4 text-sm relative z-10 mb-8">
                {[
                  'Unlimited batches',
                  'Process offline',
                  'Custom Watermarks (Coming Soon)',
                  'Blur detection (Coming Soon)'
                ].map((input) => (
                  <li key={input} className={`flex items-center gap-3 ${isDark ? 'text-white' : 'text-gray-900'} font-medium`}>
                    <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>{input}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={onUpgrade}
                disabled={checkoutLoading}
                className="w-full py-3 rounded-xl bg-indigo-600 text-sm font-semibold text-white shadow-md shadow-indigo-500/20 hover:bg-indigo-500 hover:shadow-indigo-500/30 transition-all active:scale-[0.98] cursor-pointer relative z-10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {checkoutLoading ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing…</>
                ) : (
                  <><Sparkles className="w-4 h-4" /> Upgrade to Pro</>
                )}
              </button>
            </div>
          </div>
          <p className={`text-xs text-center mt-6 ${isDark ? 'text-indigo-300/60' : 'text-indigo-400'} relative z-10`}>Subscription billed monthly. Cancel anytime.</p>
        </div>
      </div>
    </div>
  )
}
