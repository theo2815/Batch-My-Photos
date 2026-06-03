
import { Link } from 'react-router-dom'
import { useState } from 'react'
import { Camera, Heart, ShieldCheck, Mail, Facebook } from 'lucide-react'
import InfoModal from './modals/InfoModal'

// ─── Footer ─────────────────────────────────────────────────────────────────
export default function Footer() {
  const year = new Date().getFullYear()
  const [activeModal, setActiveModal] = useState(null)

  const open = (key) => (e) => { e.preventDefault(); setActiveModal(key) }

  return (
    <>
      <footer className="bg-bg-main border-t border-border-subtle">
        <div className="mx-auto max-w-7xl px-6 lg:px-8 py-16">

          <div className="grid grid-cols-1 md:grid-cols-4 gap-10">

            {/* Brand column */}
            <div className="md:col-span-1">
              <Link to="/" className="flex items-center gap-2 group">
                <img src="/app_icon.png" alt="BatchMyPhotos" className="w-6 h-6 rounded-md shadow-sm" />
                <span className="font-display text-base font-bold text-text-primary">Batch My Photos</span>
              </Link>
              <p className={`mt-3 text-sm text-text-muted leading-relaxed`}>
                Sort thousands of photos into clean, labeled batches privately, on your machine.
              </p>
              <div className="flex items-center gap-3 mt-5">
                <a href="mailto:batchmyphotos@gmail.com" className={`w-8 h-8 rounded-lg bg-bg-elevated hover:bg-bg-surface border border-border-subtle text-text-muted hover:text-text-primary flex items-center justify-center transition-all`} aria-label="Email us">
                  <img src="/gmail.png" alt="Email" className="w-4 h-4 object-contain opacity-70 hover:opacity-100 transition-opacity" />
                </a>
                <a href="https://www.facebook.com/people/Batch-My-Photos/61588309656493/" target="_blank" rel="noopener noreferrer" className={`w-8 h-8 rounded-lg bg-bg-elevated hover:bg-bg-surface border border-border-subtle text-text-muted hover:text-text-primary flex items-center justify-center transition-all`} aria-label="Facebook">
                  <img src="/facebook.png" alt="Facebook" className="w-4 h-4 object-contain opacity-70 hover:opacity-100 transition-opacity" />
                </a>
                <a href="https://www.tiktok.com/@batchmyphotos5" target="_blank" rel="noopener noreferrer" className={`w-8 h-8 rounded-lg bg-bg-elevated hover:bg-bg-surface border border-border-subtle text-text-muted hover:text-text-primary flex items-center justify-center transition-all`} aria-label="TikTok">
                  <img src="/tik-tok.png" alt="TikTok" className="w-4 h-4 object-contain opacity-70 hover:opacity-100 transition-opacity" />
                </a>
              </div>
            </div>

            {/* Product column */}
            <div>
              <h4 className={`text-xs font-bold tracking-widest uppercase text-text-secondary mb-4`}>Product</h4>
              <ul className="space-y-2.5">
                <li><a href="/#features" className={`text-sm text-text-muted hover:text-text-primary transition-colors`}>Features</a></li>
                <li><a href="/demo" target="_blank" rel="noopener noreferrer" className={`text-sm text-text-muted hover:text-text-primary transition-colors`}>Live Demo</a></li>
                <li><Link to="/register" className={`text-sm text-text-muted hover:text-text-primary transition-colors`}>Download</Link></li>
                <li><a href="/#faq" className={`text-sm text-text-muted hover:text-text-primary transition-colors`}>FAQ</a></li>
              </ul>
            </div>

            {/* Resources column */}
            <div>
              <h4 className={`text-xs font-bold tracking-widest uppercase text-text-secondary mb-4`}>Resources</h4>
              <ul className="space-y-2.5">
                <li><a href="#" onClick={open('gettingStarted')} className={`text-sm text-text-muted hover:text-text-primary transition-colors`}>Getting Started</a></li>
                <li><a href="#" onClick={open('documentation')} className={`text-sm text-text-muted hover:text-text-primary transition-colors`}>Documentation</a></li>
                <li><a href="#" onClick={open('changelog')} className={`text-sm text-text-muted hover:text-text-primary transition-colors`}>Changelog</a></li>
              </ul>
            </div>

            {/* Legal column */}
            <div>
              <h4 className={`text-xs font-bold tracking-widest uppercase text-text-secondary mb-4`}>Legal</h4>
              <ul className="space-y-2.5">
                <li><a href="#" onClick={open('privacyPolicy')} className={`text-sm text-text-muted hover:text-text-primary transition-colors`}>Privacy Policy</a></li>
                <li><a href="#" onClick={open('termsOfService')} className={`text-sm text-text-muted hover:text-text-primary transition-colors`}>Terms of Service</a></li>
                <li><a href="mailto:batchmyphotos@gmail.com" className={`text-sm text-text-muted hover:text-text-primary transition-colors`}>Contact Us</a></li>
              </ul>
            </div>
          </div>

          {/* Divider */}
          <div className="mt-14 pt-8 border-t border-border-subtle flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className={`text-xs text-text-muted`}>&copy; {year} BatchMyPhotos. All rights reserved.</p>
            <div className={`flex flex-col sm:flex-row items-center gap-1.5 text-xs text-text-muted`}>
              <span>Developed by <strong className="text-text-secondary">Theo Cedric Chan</strong></span>
              <span className="hidden sm:inline">·</span>
              <a href="mailto:theocedricchan28@gmail.com" className="hover:text-accent transition-colors">theocedricchan28@gmail.com</a>
            </div>
            <div className={`flex items-center gap-1.5 text-xs text-text-muted`}>
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