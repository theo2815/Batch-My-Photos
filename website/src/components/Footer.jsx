
import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useTheme } from '../context/ThemeContext'
import { Camera, Heart, ShieldCheck, Mail, Facebook } from 'lucide-react'
import InfoModal from './modals/InfoModal'

// ─── Footer ─────────────────────────────────────────────────────────────────
export default function Footer() {
  const year = new Date().getFullYear()
  const [activeModal, setActiveModal] = useState(null)
  const { isDark } = useTheme()

  const open = (key) => (e) => { e.preventDefault(); setActiveModal(key) }

  return (
    <>
      <footer className={`${isDark ? 'bg-bg-main border-t border-white/[0.06]' : 'bg-bg-elevated-light border-t border-gray-200'}`}>
        <div className="mx-auto max-w-7xl px-6 lg:px-8 py-16">

          <div className="grid grid-cols-1 md:grid-cols-4 gap-10">

            {/* Brand column */}
            <div className="md:col-span-1">
              <Link to="/" className="flex items-center gap-2 group">
                <img src="/app_icon.png" alt="BatchMyPhotos" className="w-6 h-6 rounded-md shadow-sm" />
                <span className={`text-base font-bold ${isDark ? 'text-text-primary' : 'text-text-primary-light'}`}>Batch My Photos</span>
              </Link>
              <p className={`mt-3 text-sm ${isDark ? 'text-text-muted' : 'text-text-secondary-light'} leading-relaxed`}>
                Sort thousands of photos into clean, labeled batches privately, on your machine.
              </p>
              <div className="flex items-center gap-3 mt-5">
                <a href="mailto:batchmyphotos@gmail.com" className={`w-8 h-8 rounded-lg ${isDark ? 'bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-text-muted hover:text-white' : 'bg-white hover:bg-gray-100 border border-gray-200 text-gray-400 hover:text-text-primary-light'} flex items-center justify-center transition-all`} aria-label="Email us">
                  <img src="/gmail.png" alt="Email" className="w-4 h-4 object-contain opacity-70 hover:opacity-100 transition-opacity" />
                </a>
                <a href="https://www.facebook.com/people/Batch-My-Photos/61588309656493/" target="_blank" rel="noopener noreferrer" className={`w-8 h-8 rounded-lg ${isDark ? 'bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-text-muted hover:text-white' : 'bg-white hover:bg-gray-100 border border-gray-200 text-gray-400 hover:text-text-primary-light'} flex items-center justify-center transition-all`} aria-label="Facebook">
                  <img src="/facebook.png" alt="Facebook" className="w-4 h-4 object-contain opacity-70 hover:opacity-100 transition-opacity" />
                </a>
                <a href="https://www.tiktok.com/@batchmyphotos5" target="_blank" rel="noopener noreferrer" className={`w-8 h-8 rounded-lg ${isDark ? 'bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-text-muted hover:text-white' : 'bg-white hover:bg-gray-100 border border-gray-200 text-gray-400 hover:text-text-primary-light'} flex items-center justify-center transition-all`} aria-label="TikTok">
                  <img src="/tik-tok.png" alt="TikTok" className="w-4 h-4 object-contain opacity-70 hover:opacity-100 transition-opacity" />
                </a>
              </div>
            </div>

            {/* Product column */}
            <div>
              <h4 className={`text-xs font-bold tracking-widest uppercase ${isDark ? 'text-text-secondary' : 'text-text-secondary-light'} mb-4`}>Product</h4>
              <ul className="space-y-2.5">
                <li><a href="/#features" className={`text-sm ${isDark ? 'text-text-muted hover:text-white' : 'text-text-secondary-light hover:text-text-primary-light'} transition-colors`}>Features</a></li>
                <li><a href="/demo" target="_blank" rel="noopener noreferrer" className={`text-sm ${isDark ? 'text-text-muted hover:text-white' : 'text-text-secondary-light hover:text-text-primary-light'} transition-colors`}>Live Demo</a></li>
                <li><Link to="/register" className={`text-sm ${isDark ? 'text-text-muted hover:text-white' : 'text-text-secondary-light hover:text-text-primary-light'} transition-colors`}>Download</Link></li>
                <li><a href="/#faq" className={`text-sm ${isDark ? 'text-text-muted hover:text-white' : 'text-text-secondary-light hover:text-text-primary-light'} transition-colors`}>FAQ</a></li>
              </ul>
            </div>

            {/* Resources column */}
            <div>
              <h4 className={`text-xs font-bold tracking-widest uppercase ${isDark ? 'text-text-secondary' : 'text-text-secondary-light'} mb-4`}>Resources</h4>
              <ul className="space-y-2.5">
                <li><a href="#" onClick={open('gettingStarted')} className={`text-sm ${isDark ? 'text-text-muted hover:text-white' : 'text-text-secondary-light hover:text-text-primary-light'} transition-colors`}>Getting Started</a></li>
                <li><a href="#" onClick={open('documentation')} className={`text-sm ${isDark ? 'text-text-muted hover:text-white' : 'text-text-secondary-light hover:text-text-primary-light'} transition-colors`}>Documentation</a></li>
                <li><a href="#" onClick={open('changelog')} className={`text-sm ${isDark ? 'text-text-muted hover:text-white' : 'text-text-secondary-light hover:text-text-primary-light'} transition-colors`}>Changelog</a></li>
              </ul>
            </div>

            {/* Legal column */}
            <div>
              <h4 className={`text-xs font-bold tracking-widest uppercase ${isDark ? 'text-text-secondary' : 'text-text-secondary-light'} mb-4`}>Legal</h4>
              <ul className="space-y-2.5">
                <li><a href="#" onClick={open('privacyPolicy')} className={`text-sm ${isDark ? 'text-text-muted hover:text-white' : 'text-text-secondary-light hover:text-text-primary-light'} transition-colors`}>Privacy Policy</a></li>
                <li><a href="#" onClick={open('termsOfService')} className={`text-sm ${isDark ? 'text-text-muted hover:text-white' : 'text-text-secondary-light hover:text-text-primary-light'} transition-colors`}>Terms of Service</a></li>
                <li><a href="mailto:batchmyphotos@gmail.com" className={`text-sm ${isDark ? 'text-text-muted hover:text-white' : 'text-text-secondary-light hover:text-text-primary-light'} transition-colors`}>Contact Us</a></li>
              </ul>
            </div>
          </div>

          {/* Divider */}
          <div className={`mt-14 pt-8 border-t ${isDark ? 'border-white/[0.04]' : 'border-gray-200'} flex flex-col sm:flex-row items-center justify-between gap-4`}>
            <p className={`text-xs ${isDark ? 'text-text-muted' : 'text-gray-400'}`}>&copy; {year} BatchMyPhotos. All rights reserved.</p>
            <div className={`flex flex-col sm:flex-row items-center gap-1.5 text-xs ${isDark ? 'text-text-muted' : 'text-gray-400'}`}>
              <span>Developed by <strong className={isDark ? 'text-text-secondary' : 'text-text-secondary-light'}>Theo Cedric Chan</strong></span>
              <span className="hidden sm:inline">·</span>
              <a href="mailto:theocedricchan28@gmail.com" className="hover:text-accent transition-colors">theocedricchan28@gmail.com</a>
            </div>
            <div className={`flex items-center gap-1.5 text-xs ${isDark ? 'text-text-muted' : 'text-gray-400'}`}>
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