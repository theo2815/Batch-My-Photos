
import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useTheme } from '../context/ThemeContext'
import { Camera, Heart, ShieldCheck, Mail, X, BookOpen, FileText, Clock, Shield, ScrollText } from 'lucide-react'

// ─── Modal content ──────────────────────────────────────────────────────────
const MODALS = {
  gettingStarted: {
    title: 'Getting Started',
    icon: BookOpen,
    color: 'text-indigo-400',
    body: (
      <div className="space-y-5">
        <p className="text-slate-400 leading-relaxed">Welcome to Batch My Photos! Here's how to get organized in just a few minutes.</p>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">1. Import your photos</h4>
          <p className="text-sm text-slate-400 leading-relaxed">Drag and drop a folder containing your photos directly into the app. We'll scan everything instantly — no uploading, no cloud, just your local files.</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">2. Configure your settings</h4>
          <p className="text-sm text-slate-400 leading-relaxed">Set your batch size (e.g., 500 photos per folder), choose a naming convention, and optionally enable blur detection to automatically separate blurry shots.</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">3. Preview your batches</h4>
          <p className="text-sm text-slate-400 leading-relaxed">Before anything moves, you'll see a full preview of how your photos will be organized. Check file counts, review batch names, and make adjustments.</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">4. Process &amp; done</h4>
          <p className="text-sm text-slate-400 leading-relaxed">Hit Start and watch your photos get sorted into clean, labeled folders. If you change your mind, hit Undo — everything goes right back where it was.</p>
        </div>
        <div className="pt-3 border-t border-white/[0.06]">
          <p className="text-xs text-slate-500">💡 Tip: Try the Live Demo first to see the full workflow without installing anything.</p>
        </div>
      </div>
    ),
  },

  documentation: {
    title: 'Documentation',
    icon: FileText,
    color: 'text-cyan-400',
    body: (
      <div className="space-y-5">
        <p className="text-slate-400 leading-relaxed">Everything you need to know about using Batch My Photos effectively.</p>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Batch Settings</h4>
          <ul className="space-y-1.5 text-sm text-slate-400">
            <li>• <strong className="text-slate-300">Max Photos per Batch</strong> — Controls how many photos go into each folder. Default is 500.</li>
            <li>• <strong className="text-slate-300">Folder Naming</strong> — Name your output folders with a custom prefix (e.g., "Wedding — Batch 1").</li>
            <li>• <strong className="text-slate-300">Sort Order</strong> — Sort by date (ascending/descending) or by filename.</li>
            <li>• <strong className="text-slate-300">Batch Mode</strong> — Choose between Move (relocate files) or Copy (keep originals).</li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Blur Detection</h4>
          <p className="text-sm text-slate-400 leading-relaxed">When enabled, the app identifies blurry photos and separates them into a dedicated folder. Three sensitivity levels:</p>
          <ul className="space-y-1 text-sm text-slate-400 mt-2">
            <li>• <strong className="text-slate-300">Low</strong> — Only catches very blurry images</li>
            <li>• <strong className="text-slate-300">Moderate</strong> — Balanced detection (recommended)</li>
            <li>• <strong className="text-slate-300">Strict</strong> — Catches slightly soft images too</li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Undo &amp; Recovery</h4>
          <p className="text-sm text-slate-400 leading-relaxed">Every batch operation is fully reversible. Click Undo to restore all files to their original locations. Your session state is saved automatically, so even after a crash or accidental close, you can resume right where you left off.</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Troubleshooting</h4>
          <ul className="space-y-1.5 text-sm text-slate-400">
            <li>• <strong className="text-slate-300">Photos not appearing?</strong> — Make sure you're dropping a folder, not individual files.</li>
            <li>• <strong className="text-slate-300">Batch counts look off?</strong> — Check your "Max Photos" setting and blur detection toggle.</li>
            <li>• <strong className="text-slate-300">App closed unexpectedly?</strong> — Reopen the app — your last session is preserved.</li>
          </ul>
        </div>
      </div>
    ),
  },

  changelog: {
    title: 'Changelog',
    icon: Clock,
    color: 'text-amber-400',
    body: (
      <div className="space-y-6">
        <p className="text-slate-400 leading-relaxed">What's new, what's fixed, and what's coming next.</p>
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">v1.0.0</span>
            <span className="text-xs text-slate-600">February 2026</span>
          </div>
          <h4 className="text-sm font-semibold text-white mb-1.5">🎉 Initial Release</h4>
          <ul className="space-y-1 text-sm text-slate-400">
            <li>• Drag-and-drop folder import with instant scanning</li>
            <li>• Configurable batch sizes, naming, and sort order</li>
            <li>• Full batch preview before processing</li>
            <li>• Move or Copy batch modes</li>
            <li>• Blur detection with three sensitivity levels</li>
            <li>• One-click Undo for all operations</li>
            <li>• Crash recovery with automatic session restore</li>
            <li>• Interactive live demo on the website</li>
          </ul>
        </div>
        <div className="pt-3 border-t border-white/[0.06]">
          <h4 className="text-sm font-semibold text-white mb-1.5">🔮 Coming Soon</h4>
          <ul className="space-y-1 text-sm text-slate-400">
            <li>• Watermarking support</li>
            <li>• Face recognition grouping</li>
            <li>• Custom batch presets</li>
            <li>• Multi-folder processing</li>
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
        <p className="text-slate-400 leading-relaxed">Your privacy matters to us. Here's exactly how Batch My Photos handles your data.</p>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Your photos stay on your device</h4>
          <p className="text-sm text-slate-400 leading-relaxed">Batch My Photos processes everything locally on your computer. Your photos are never uploaded, transmitted, or shared with any server, cloud service, or third party. Period.</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">What we collect</h4>
          <ul className="space-y-1.5 text-sm text-slate-400">
            <li>• <strong className="text-slate-300">Account info</strong> — If you create an account (for Pro features), we store your email and subscription status.</li>
            <li>• <strong className="text-slate-300">Usage analytics</strong> — We may collect anonymous, aggregated usage data (e.g., feature popularity) to improve the app. This never includes file names, photo content, or personal data.</li>
            <li>• <strong className="text-slate-300">Crash reports</strong> — Optional anonymous crash reports help us fix bugs faster.</li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">What we don't collect</h4>
          <ul className="space-y-1 text-sm text-slate-400">
            <li>• ❌ Photo content, metadata, or file names</li>
            <li>• ❌ File system paths or folder structures</li>
            <li>• ❌ Any data from your local machine</li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Third-party services</h4>
          <p className="text-sm text-slate-400 leading-relaxed">We use Supabase for authentication and Stripe for payment processing. Both handle only the minimum data required (email, payment info) and are GDPR-compliant.</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Your rights</h4>
          <p className="text-sm text-slate-400 leading-relaxed">You can request deletion of your account and all associated data at any time by emailing <a href="mailto:batchmyphotos@gmail.com" className="text-indigo-400 hover:text-indigo-300 transition-colors">batchmyphotos@gmail.com</a>.</p>
        </div>
        <div className="pt-3 border-t border-white/[0.06]">
          <p className="text-xs text-slate-600">Last updated: February 2026</p>
        </div>
      </div>
    ),
  },

  termsOfService: {
    title: 'Terms of Service',
    icon: ScrollText,
    color: 'text-purple-400',
    body: (
      <div className="space-y-5">
        <p className="text-slate-400 leading-relaxed">By using Batch My Photos, you agree to the following terms. We've kept them short, clear, and fair.</p>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Usage</h4>
          <p className="text-sm text-slate-400 leading-relaxed">Batch My Photos is a desktop application for organizing photos on your local machine. You may use it for personal and commercial purposes. You are responsible for the content you process — we don't monitor, review, or access your files.</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Free &amp; Pro plans</h4>
          <ul className="space-y-1.5 text-sm text-slate-400">
            <li>• The <strong className="text-slate-300">Free plan</strong> includes core features with limited batch sizes (up to 500 photos) and moderate blur detection. No time limit, no credit card.</li>
            <li>• The <strong className="text-slate-300">Pro plan</strong> unlocks unlimited batch sizes, all blur sensitivity levels, and upcoming features. Billed monthly. Cancel anytime.</li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Your responsibility</h4>
          <p className="text-sm text-slate-400 leading-relaxed">You own your photos and files. We don't claim any rights over your content. While the app includes Undo and crash recovery, we recommend keeping backups of critical data.</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Limitation of liability</h4>
          <p className="text-sm text-slate-400 leading-relaxed">Batch My Photos is provided "as is." We do our best to ensure reliability, but we are not liable for data loss or damages arising from use of the application. Always keep backups.</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Changes to terms</h4>
          <p className="text-sm text-slate-400 leading-relaxed">We may update these terms from time to time. Significant changes will be communicated via the app or email. Continued use constitutes acceptance.</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Contact</h4>
          <p className="text-sm text-slate-400 leading-relaxed">Questions? Reach us at <a href="mailto:batchmyphotos@gmail.com" className="text-indigo-400 hover:text-indigo-300 transition-colors">batchmyphotos@gmail.com</a>.</p>
        </div>
        <div className="pt-3 border-t border-white/[0.06]">
          <p className="text-xs text-slate-600">Last updated: February 2026</p>
        </div>
      </div>
    ),
  },
}

// ─── Reusable modal ─────────────────────────────────────────────────────────
function FooterModal({ modalKey, onClose }) {
  const content = MODALS[modalKey]

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
        className="relative w-full max-w-lg max-h-[85vh] rounded-2xl border border-white/[0.08] bg-slate-900 shadow-2xl shadow-black/50 flex flex-col animate-[footerModalIn_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center ${content.color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <h3 className="text-lg font-bold text-white">{content.title}</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-white/[0.06] flex items-center justify-center text-slate-500 hover:text-white transition-colors cursor-pointer" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1 custom-scrollbar">
          {content.body}
        </div>
      </div>
    </div>
  )
}

// ─── Footer ─────────────────────────────────────────────────────────────────
export default function Footer() {
  const year = new Date().getFullYear()
  const [activeModal, setActiveModal] = useState(null)
  const { isDark } = useTheme()

  const open = (key) => (e) => { e.preventDefault(); setActiveModal(key) }

  return (
    <>
      <footer className={`${isDark ? 'bg-slate-950 border-t border-white/[0.06]' : 'bg-gray-50 border-t border-gray-200'}`}>
        <div className="mx-auto max-w-7xl px-6 lg:px-8 py-16">

          <div className="grid grid-cols-1 md:grid-cols-4 gap-10">

            {/* Brand column */}
            <div className="md:col-span-1">
              <Link to="/" className="flex items-center gap-2 group">
                <Camera className="w-6 h-6 text-indigo-400 group-hover:text-indigo-300 transition-colors" />
                <span className={`text-base font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Batch My Photos</span>
              </Link>
              <p className={`mt-3 text-sm ${isDark ? 'text-slate-500' : 'text-gray-500'} leading-relaxed`}>
                Sort thousands of photos into clean, labeled batches — privately, on your machine.
              </p>
              <div className="flex items-center gap-3 mt-5">
                <a href="mailto:batchmyphotos@gmail.com" className={`w-8 h-8 rounded-lg ${isDark ? 'bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-slate-500 hover:text-white' : 'bg-white hover:bg-gray-100 border border-gray-200 text-gray-400 hover:text-gray-700'} flex items-center justify-center transition-all`} aria-label="Email us">
                  <Mail className="w-4 h-4" />
                </a>
              </div>
            </div>

            {/* Product column */}
            <div>
              <h4 className={`text-xs font-bold tracking-widest uppercase ${isDark ? 'text-slate-400' : 'text-gray-400'} mb-4`}>Product</h4>
              <ul className="space-y-2.5">
                <li><a href="/#features" className={`text-sm ${isDark ? 'text-slate-500 hover:text-white' : 'text-gray-500 hover:text-gray-900'} transition-colors`}>Features</a></li>
                <li><a href="/demo" target="_blank" rel="noopener noreferrer" className={`text-sm ${isDark ? 'text-slate-500 hover:text-white' : 'text-gray-500 hover:text-gray-900'} transition-colors`}>Live Demo</a></li>
                <li><Link to="/register" className={`text-sm ${isDark ? 'text-slate-500 hover:text-white' : 'text-gray-500 hover:text-gray-900'} transition-colors`}>Download</Link></li>
                <li><a href="/#faq" className={`text-sm ${isDark ? 'text-slate-500 hover:text-white' : 'text-gray-500 hover:text-gray-900'} transition-colors`}>FAQ</a></li>
              </ul>
            </div>

            {/* Resources column */}
            <div>
              <h4 className={`text-xs font-bold tracking-widest uppercase ${isDark ? 'text-slate-400' : 'text-gray-400'} mb-4`}>Resources</h4>
              <ul className="space-y-2.5">
                <li><a href="#" onClick={open('gettingStarted')} className={`text-sm ${isDark ? 'text-slate-500 hover:text-white' : 'text-gray-500 hover:text-gray-900'} transition-colors`}>Getting Started</a></li>
                <li><a href="#" onClick={open('documentation')} className={`text-sm ${isDark ? 'text-slate-500 hover:text-white' : 'text-gray-500 hover:text-gray-900'} transition-colors`}>Documentation</a></li>
                <li><a href="#" onClick={open('changelog')} className={`text-sm ${isDark ? 'text-slate-500 hover:text-white' : 'text-gray-500 hover:text-gray-900'} transition-colors`}>Changelog</a></li>
              </ul>
            </div>

            {/* Legal column */}
            <div>
              <h4 className={`text-xs font-bold tracking-widest uppercase ${isDark ? 'text-slate-400' : 'text-gray-400'} mb-4`}>Legal</h4>
              <ul className="space-y-2.5">
                <li><a href="#" onClick={open('privacyPolicy')} className={`text-sm ${isDark ? 'text-slate-500 hover:text-white' : 'text-gray-500 hover:text-gray-900'} transition-colors`}>Privacy Policy</a></li>
                <li><a href="#" onClick={open('termsOfService')} className={`text-sm ${isDark ? 'text-slate-500 hover:text-white' : 'text-gray-500 hover:text-gray-900'} transition-colors`}>Terms of Service</a></li>
                <li><a href="mailto:batchmyphotos@gmail.com" className={`text-sm ${isDark ? 'text-slate-500 hover:text-white' : 'text-gray-500 hover:text-gray-900'} transition-colors`}>Contact Us</a></li>
              </ul>
            </div>
          </div>

          {/* Divider */}
          <div className={`mt-14 pt-8 border-t ${isDark ? 'border-white/[0.04]' : 'border-gray-200'} flex flex-col sm:flex-row items-center justify-between gap-4`}>
            <p className={`text-xs ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>&copy; {year} BatchMyPhotos. All rights reserved.</p>
            <p className={`flex items-center gap-1.5 text-xs ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>
              Made with <Heart className="w-3 h-3 text-rose-500/70" /> for photographers everywhere
            </p>
            <div className={`flex items-center gap-1.5 text-xs ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Your photos never leave your device</span>
            </div>
          </div>
        </div>
      </footer>

      {activeModal && <FooterModal modalKey={activeModal} onClose={() => setActiveModal(null)} />}
    </>
  )
}