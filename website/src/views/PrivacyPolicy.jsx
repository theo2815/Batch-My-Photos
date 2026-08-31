'use client'

import Link from 'next/link'
import { Shield, ArrowLeft } from 'lucide-react'

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen py-20 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-accent transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Shield className="w-6 h-6 text-accent" />
            </div>
            <h1 className="text-2xl font-display font-bold text-text-primary">
              Privacy Policy
            </h1>
          </div>
        </div>

        {/* Content */}
        <div className="rounded-xl border p-6 sm:p-8 bg-bg-surface/50 border-border-subtle">
          <div className="space-y-5">
            <p className="text-text-secondary leading-relaxed">Exactly how Batch My Photos handles your data.</p>
            <div>
              <h4 className="text-sm font-display font-semibold mb-2 text-text-primary">Your photos stay on your device</h4>
              <p className="text-sm text-text-secondary leading-relaxed">Batch My Photos processes everything locally on your computer. Your photos are never uploaded, transmitted, or shared with any server, cloud service, or third party.</p>
            </div>
            <div>
              <h4 className="text-sm font-display font-semibold mb-2 text-text-primary">What we collect</h4>
              <ul className="space-y-1.5 text-sm text-text-secondary">
                <li>• <strong className="text-text-secondary">Account info</strong> — If you create an account (for Pro features), we store your email and subscription status.</li>
                <li>• <strong className="text-text-secondary">Device identifiers</strong> — We store a hashed hardware ID to enforce per-plan device limits. We do not collect your device name, model, or operating system.</li>
                <li>• <strong className="text-text-secondary">Subscription & payment data</strong> — Plan type, payment status, and PayMongo transaction references. We never store full card numbers.</li>
                <li>• <strong className="text-text-secondary">Usage analytics</strong> — We may collect anonymous, aggregated usage data (e.g., feature popularity, batch counts) to improve the app. This never includes file names, photo content, or personal data.</li>
                <li>• <strong className="text-text-secondary">Crash reports</strong> — Optional anonymous crash reports help us fix bugs faster.</li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-display font-semibold mb-2 text-text-primary">What we don't collect</h4>
              <ul className="space-y-1 text-sm text-text-secondary">
                <li>• Photo content, metadata, or file names</li>
                <li>• File system paths or folder structures</li>
                <li>• Any data from your local machine</li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-display font-semibold mb-2 text-text-primary">Data handling & retention</h4>
              <ul className="space-y-1.5 text-sm text-text-secondary">
                <li>• <strong className="text-text-secondary">Photos</strong> — All photo processing happens entirely on your local device. No images are ever uploaded to our servers.</li>
                <li>• <strong className="text-text-secondary">Account data</strong> — Your email, subscription status, and device bindings are stored securely in our database (hosted by Supabase) for as long as your account is active.</li>
                <li>• <strong className="text-text-secondary">Payment records</strong> — Transaction references are retained for accounting and dispute resolution purposes.</li>
                <li>• <strong className="text-text-secondary">Deletion</strong> — When you delete your account, all associated data (account info, device bindings, usage history, and transaction records) is permanently removed from our systems.</li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-display font-semibold mb-2 text-text-primary">Cookies & local storage</h4>
              <p className="text-sm text-text-secondary leading-relaxed">We only use <strong className="text-text-secondary">essential cookies and local storage</strong> required for authentication (keeping you logged in). We do not use any third-party tracking cookies, advertising cookies, or analytics cookies. Because we only use essential cookies, no consent banner is required.</p>
            </div>
            <div>
              <h4 className="text-sm font-display font-semibold mb-2 text-text-primary">Third-party services</h4>
              <p className="text-sm text-text-secondary leading-relaxed">We use Supabase for authentication and Paymongo for payment processing. Both handle only the minimum data required (email, payment info) and are GDPR-compliant.</p>
            </div>
            <div>
              <h4 className="text-sm font-display font-semibold mb-2 text-text-primary">Your rights</h4>
              <ul className="space-y-1.5 text-sm text-text-secondary">
                <li>• <strong className="text-text-secondary">Access</strong> — You can request a copy of all personal data we hold about you.</li>
                <li>• <strong className="text-text-secondary">Correction</strong> — You can ask us to correct any inaccurate data.</li>
                <li>• <strong className="text-text-secondary">Deletion</strong> — You can request deletion of your account and all associated data at any time.</li>
                <li>• <strong className="text-text-secondary">Portability</strong> — You can request your data in a portable format.</li>
              </ul>
              <p className="text-sm text-text-secondary leading-relaxed mt-2">To exercise any of these rights, email <a href="mailto:batchmyphotos@gmail.com" className="text-accent hover:text-accent transition-colors">batchmyphotos@gmail.com</a>. We will respond within 30 days.</p>
            </div>
            <div className="pt-3 border-t border-border-subtle">
              <p className="text-xs font-mono text-text-muted">Last updated: February 2026</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PrivacyPolicy
