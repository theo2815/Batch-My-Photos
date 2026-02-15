
import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useTheme } from '../context/ThemeContext'
import { Camera, Heart, ShieldCheck, Mail } from 'lucide-react'
import InfoModal from './modals/InfoModal'

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
                <img src="/app_icon.png" alt="BatchMyPhotos" className="w-6 h-6 rounded-md shadow-sm" />
                <span className={`text-base font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Batch My Photos</span>
              </Link>
              <p className={`mt-3 text-sm ${isDark ? 'text-slate-500' : 'text-gray-500'} leading-relaxed`}>
                Sort thousands of photos into clean, labeled batches privately, on your machine.
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
            <div className={`flex flex-col sm:flex-row items-center gap-1.5 text-xs ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>
              <span>Developed by <strong className={isDark ? 'text-slate-500' : 'text-gray-500'}>Theo Cedric Chan</strong></span>
              <span className="hidden sm:inline">·</span>
              <a href="mailto:theocedricchan28@gmail.com" className="hover:text-indigo-400 transition-colors">theocedricchan28@gmail.com</a>
            </div>
            <div className={`flex items-center gap-1.5 text-xs ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Your photos never leave your device</span>
            </div>
          </div>
        </div>
      </footer> 

      {activeModal && <InfoModal modalKey={activeModal} onClose={() => setActiveModal(null)} />}
    </>
  )
}