import { Link } from 'react-router-dom'
import { ScrollText, ArrowLeft } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

const TermsOfService = () => {
  const { isDark } = useTheme()

  return (
    <div className="min-h-screen py-20 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-accent transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <ScrollText className="w-6 h-6 text-purple-400" />
            </div>
            <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Terms of Service
            </h1>
          </div>
        </div>

        {/* Content */}
        <div className={`rounded-xl border p-6 sm:p-8 ${isDark ? 'bg-bg-surface/50 border-white/6' : 'bg-white border-gray-200'}`}>
          <div className="space-y-5">
            <p className="text-text-secondary leading-relaxed">By using Batch My Photos, you agree to the following terms. We've kept them short, clear, and fair.</p>
            <div>
              <h4 className={`text-sm font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>Usage</h4>
              <p className="text-sm text-text-secondary leading-relaxed">Batch My Photos is a desktop application for organizing photos on your local machine. You may use it for personal and commercial purposes. You are responsible for the content you process — we don't monitor, review, or access your files.</p>
            </div>
            <div>
              <h4 className={`text-sm font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>Free &amp; Pro plans</h4>
              <ul className="space-y-1.5 text-sm text-text-secondary">
                <li>• The <strong className="text-text-secondary">Free plan</strong> lets you process up to 2 batches per month.</li>
                <li>• The <strong className="text-text-secondary">Pro plan</strong> gives you unlimited batch processing. Monthly billing. Cancel anytime.</li>
              </ul>
            </div>
            <div>
              <h4 className={`text-sm font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>Your responsibility</h4>
              <p className="text-sm text-text-secondary leading-relaxed">You own your photos and files. We don't claim any rights over your content. While the app includes Undo and crash recovery, we recommend keeping backups of critical data.</p>
            </div>
            <div>
              <h4 className={`text-sm font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>Limitation of liability</h4>
              <p className="text-sm text-text-secondary leading-relaxed">Batch My Photos is provided "as is." We do our best to ensure reliability, but we are not liable for data loss or damages arising from use of the application. Always keep backups.</p>
            </div>
            <div>
              <h4 className={`text-sm font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>Changes to terms</h4>
              <p className="text-sm text-text-secondary leading-relaxed">We may update these terms from time to time. Significant changes will be communicated via the app or email. Continued use constitutes acceptance.</p>
            </div>
            <div>
              <h4 className={`text-sm font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>Contact</h4>
              <p className="text-sm text-text-secondary leading-relaxed">Questions? Reach us at <a href="mailto:batchmyphotos@gmail.com" className="text-accent hover:text-accent transition-colors">batchmyphotos@gmail.com</a>.</p>
            </div>
            <div className="pt-3 border-t border-white/6">
              <p className="text-xs text-text-muted">Last updated: February 2026</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TermsOfService
