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
              <h4 className="text-sm font-display font-semibold mb-2 text-text-primary">Your photos stay on your device unless you send them</h4>
              <p className="text-sm text-text-secondary leading-relaxed">Batch My Photos processes everything locally on your computer. Your photos are not sent to any server, cloud service, or third party unless you choose to: the opt-in blur detection beta and the QuickPitik upload, both described below.</p>
            </div>
            <div>
              <h4 className="text-sm font-display font-semibold mb-2 text-text-primary">What we collect</h4>
              <ul className="space-y-1.5 text-sm text-text-secondary">
                <li>• <strong className="text-text-secondary">Account info</strong> — When you create an account, we store your email and plan.</li>
                <li>• <strong className="text-text-secondary">Device identifiers</strong> — We store a hashed hardware ID to enforce the per-account device limit. We do not collect your device name, model, or operating system.</li>
                <li>• <strong className="text-text-secondary">Blur beta requests</strong> — If you ask to join the blur detection beta, we store your name, what you shoot, your photos per event, and your note, so we can choose testers and email your key.</li>
                <li>• <strong className="text-text-secondary">Blur beta photos</strong> — If you are a blur beta tester and run blur detection, resized copies of those photos are sent to the QuickPitik blur service for analysis. If you press &quot;Submit this example&quot; on a photo, that resized photo and your Sharp/Blurry label are stored privately so we can improve the detector. Only our team can see them.</li>
                <li>• <strong className="text-text-secondary">QuickPitik upload</strong> — If you connect a QuickPitik photographer account and press Upload, the photos you choose are sent to QuickPitik at full size, with their file names and the details stored inside each file (such as camera settings and the time taken). QuickPitik keeps them in your photographer account under the event you pick, and reads faces and bib numbers in them so runners can find their photos. Nothing is sent until you press Upload, and you can disconnect at any time.</li>
                <li>• <strong className="text-text-secondary">Usage analytics</strong> — We may collect anonymous, aggregated usage data (e.g., feature popularity, batch counts) to improve the app. This never includes file names, photo content, or personal data.</li>
                <li>• <strong className="text-text-secondary">Crash reports</strong> — Optional anonymous crash reports help us fix bugs faster.</li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-display font-semibold mb-2 text-text-primary">What we don't collect</h4>
              <ul className="space-y-1 text-sm text-text-secondary">
                <li>• Photo content, metadata, or file names (except the blur beta photos and the QuickPitik uploads above)</li>
                <li>• File system paths or folder structures</li>
                <li>• Any other data from your local machine</li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-display font-semibold mb-2 text-text-primary">Data handling & retention</h4>
              <ul className="space-y-1.5 text-sm text-text-secondary">
                <li>• <strong className="text-text-secondary">Photos</strong> — Outside the blur beta and the QuickPitik uploads you start, all photo processing happens on your device and no photos leave it. Beta examples you submit are kept until we no longer need them to improve the detector. They are not removed automatically when you delete your account; ask us and we will delete them. Photos you upload to QuickPitik stay there until you delete them on quickpitik.com.</li>
                <li>• <strong className="text-text-secondary">Account data</strong> — Your email, usage counts, and device bindings are stored securely in our database (hosted by Supabase) for as long as your account is active.</li>
                <li>• <strong className="text-text-secondary">Payment records</strong> — References for payments made while BatchMyPhotos had paid plans are retained for accounting and dispute resolution purposes.</li>
                <li>• <strong className="text-text-secondary">Deletion</strong> — When you delete your account, all associated data (account info, device bindings, usage history, and transaction records) is permanently removed from our systems.</li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-display font-semibold mb-2 text-text-primary">Cookies & local storage</h4>
              <p className="text-sm text-text-secondary leading-relaxed">We only use <strong className="text-text-secondary">essential cookies and local storage</strong> required for authentication (keeping you logged in). We do not use any third-party tracking cookies, advertising cookies, or analytics cookies. Because we only use essential cookies, no consent banner is required.</p>
            </div>
            <div>
              <h4 className="text-sm font-display font-semibold mb-2 text-text-primary">Third-party services</h4>
              <p className="text-sm text-text-secondary leading-relaxed">We use Supabase for sign-in, our database, and private file storage. PayMongo processed payments while BatchMyPhotos had paid plans; we no longer take payments. Both handle only the minimum data required and are GDPR-compliant. QuickPitik, made by the same team, receives the photos you choose to upload to it.</p>
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
              <p className="text-xs font-mono text-text-muted">Last updated: October 2026</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PrivacyPolicy
