/**
 * Shared modal content definitions.
 *
 * Import `MODAL_CONTENT` anywhere you need to open one of these modals
 * (Footer, Navbar, Settings, Dashboard, etc.) so the copy stays in one place.
 *
 * Each entry has: title, icon (Lucide component), color (Tailwind text-* class), body (JSX).
 */

import { BookOpen, FileText, Clock, Shield, ScrollText } from 'lucide-react'

const MODAL_CONTENT = {
  /* ── Resources ─────────────────────────────────────────────────────── */
  gettingStarted: {
    title: 'Getting Started',
    icon: BookOpen,
    color: 'text-accent',
    body: (
      <div className="space-y-5">
        <p className="text-text-secondary leading-relaxed">Welcome to Batch My Photos! Here's how to get organized in just a few minutes.</p>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">1. Import your photos</h4>
          <p className="text-sm text-text-secondary leading-relaxed">Drag and drop a folder containing your photos directly into the app. We'll scan everything instantly, no uploading, no cloud, just your local files.</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">2. Configure your settings</h4>
          <p className="text-sm text-text-secondary leading-relaxed">Set your batch size (e.g., 500 photos per folder), choose a naming convention.</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">3. Preview your batches</h4>
          <p className="text-sm text-text-secondary leading-relaxed">Before anything moves, you'll see a full preview of how your photos will be organized. Check file counts, review batch names, and make adjustments.</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">4. Process &amp; done</h4>
          <p className="text-sm text-text-secondary leading-relaxed">Hit Start and watch your photos get sorted into clean, labeled folders. If you change your mind, hit undo and everything goes right back where it was.</p>
        </div>
        <div className="pt-3 border-t border-white/[0.06]">
          <p className="text-xs text-text-muted">💡 Tip: Try the Live Demo first to see the full workflow without installing anything.</p>
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
        <p className="text-text-secondary leading-relaxed">Everything you need to know about using Batch My Photos effectively.</p>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Batch Settings</h4>
          <ul className="space-y-1.5 text-sm text-text-secondary">
            <li>• <strong className="text-text-secondary">Max Photos per Batch</strong> — Controls how many photos go into each folder. Default is 500.</li>
            <li>• <strong className="text-text-secondary">Folder Naming</strong> — Name your output folders with a custom prefix (e.g., "Wedding — Batch 1").</li>
            <li>• <strong className="text-text-secondary">Sort Order</strong> — Sort by date (ascending/descending) or by filename.</li>
            <li>• <strong className="text-text-secondary">Batch Mode</strong> — Choose between Move (relocate files) or Copy (keep originals).</li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Undo &amp; Recovery</h4>
          <p className="text-sm text-text-secondary leading-relaxed">Every batch operation is fully reversible. Click Undo to restore all files to their original locations. Your session state is saved automatically, so even after a crash or accidental close, you can resume right where you left off.</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Troubleshooting</h4>
          <ul className="space-y-1.5 text-sm text-text-secondary">
            <li>• <strong className="text-text-secondary">Photos not appearing?</strong> — Make sure you're dropping a folder, not individual files.</li>
            <li>• <strong className="text-text-secondary">Batch counts look off?</strong> — Check your "Max Photos" setting.</li>
            <li>• <strong className="text-text-secondary">App closed unexpectedly?</strong> — Reopen the app — your last session is preserved.</li>
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
        <p className="text-text-secondary leading-relaxed">What's new, what's fixed, and what's coming next.</p>
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/20 text-accent">v1.0.0</span>
            <span className="text-xs text-text-muted">February 2026</span>
          </div>
          <h4 className="text-sm font-semibold text-white mb-1.5">🎉 Initial Release</h4>
          <ul className="space-y-1 text-sm text-text-secondary">
            <li>• Drag-and-drop folder import with instant scanning</li>
            <li>• Configurable batch sizes, naming, and sort order</li>
            <li>• Full batch preview before processing</li>
            <li>• Move or Copy batch modes</li>
            <li>• One-click Undo for all operations</li>
            <li>• Crash recovery with automatic session restore</li>
            <li>• Interactive live demo on the website</li>
          </ul>
        </div>
        <div className="pt-3 border-t border-white/[0.06]">
          <h4 className="text-sm font-semibold text-white mb-1.5">🔮 Coming Soon</h4>
          <ul className="space-y-1 text-sm text-text-secondary">
            <li>• Blur detection</li>
            <li>• Watermarking support</li>
            <li>• Multi-folder processing</li>
            <li>• And more coming soon!</li>
          </ul>
        </div>
      </div>
    ),
  },

  /* ── Legal ─────────────────────────────────────────────────────────── */
  privacyPolicy: {
    title: 'Privacy Policy',
    icon: Shield,
    color: 'text-emerald-400',
    body: (
      <div className="space-y-5">
        <p className="text-text-secondary leading-relaxed">Your privacy matters to us. Here's exactly how Batch My Photos handles your data.</p>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Your photos stay on your device</h4>
          <p className="text-sm text-text-secondary leading-relaxed">Batch My Photos processes everything locally on your computer. Your photos are never uploaded, transmitted, or shared with any server, cloud service, or third party. Period.</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">What we collect</h4>
          <ul className="space-y-1.5 text-sm text-text-secondary">
            <li>• <strong className="text-text-secondary">Account info</strong> — If you create an account (for Pro features), we store your email and subscription status.</li>
            <li>• <strong className="text-text-secondary">Device identifiers</strong> — We store a hashed hardware ID to enforce per-plan device limits. We do not collect your device name, model, or operating system.</li>
            <li>• <strong className="text-text-secondary">Subscription & payment data</strong> — Plan type, payment status, and PayMongo transaction references. We never store full card numbers.</li>
            <li>• <strong className="text-text-secondary">Usage analytics</strong> — We may collect anonymous, aggregated usage data (e.g., feature popularity, batch counts) to improve the app. This never includes file names, photo content, or personal data.</li>
            <li>• <strong className="text-text-secondary">Crash reports</strong> — Optional anonymous crash reports help us fix bugs faster.</li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">What we don't collect</h4>
          <ul className="space-y-1 text-sm text-text-secondary">
            <li>• ❌ Photo content, metadata, or file names</li>
            <li>• ❌ File system paths or folder structures</li>
            <li>• ❌ Any data from your local machine</li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Data handling & retention</h4>
          <ul className="space-y-1.5 text-sm text-text-secondary">
            <li>• <strong className="text-text-secondary">Photos</strong> — All photo processing happens entirely on your local device. No images are ever uploaded to our servers.</li>
            <li>• <strong className="text-text-secondary">Account data</strong> — Your email, subscription status, and device bindings are stored securely in our database (hosted by Supabase) for as long as your account is active.</li>
            <li>• <strong className="text-text-secondary">Payment records</strong> — Transaction references are retained for accounting and dispute resolution purposes.</li>
            <li>• <strong className="text-text-secondary">Deletion</strong> — When you delete your account, all associated data (account info, device bindings, usage history, and transaction records) is permanently removed from our systems.</li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Cookies & local storage</h4>
          <p className="text-sm text-text-secondary leading-relaxed">We only use <strong className="text-text-secondary">essential cookies and local storage</strong> required for authentication (keeping you logged in). We do not use any third-party tracking cookies, advertising cookies, or analytics cookies. Because we only use essential cookies, no consent banner is required.</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Third-party services</h4>
          <p className="text-sm text-text-secondary leading-relaxed">We use Supabase for authentication and Paymongo for payment processing. Both handle only the minimum data required (email, payment info) and are GDPR-compliant.</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Your rights</h4>
          <ul className="space-y-1.5 text-sm text-text-secondary">
            <li>• <strong className="text-text-secondary">Access</strong> — You can request a copy of all personal data we hold about you.</li>
            <li>• <strong className="text-text-secondary">Correction</strong> — You can ask us to correct any inaccurate data.</li>
            <li>• <strong className="text-text-secondary">Deletion</strong> — You can request deletion of your account and all associated data at any time.</li>
            <li>• <strong className="text-text-secondary">Portability</strong> — You can request your data in a portable format.</li>
          </ul>
          <p className="text-sm text-text-secondary leading-relaxed mt-2">To exercise any of these rights, email <a href="mailto:batchmyphotos@gmail.com" className="text-accent hover:text-accent transition-colors">batchmyphotos@gmail.com</a>. We will respond within 30 days.</p>
        </div>
        <div className="pt-3 border-t border-white/[0.06]">
          <p className="text-xs text-text-muted">Last updated: February 2026</p>
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
        <p className="text-text-secondary leading-relaxed">By using Batch My Photos, you agree to the following terms. We've kept them short, clear, and fair.</p>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Usage</h4>
          <p className="text-sm text-text-secondary leading-relaxed">Batch My Photos is a desktop application for organizing photos on your local machine. You may use it for personal and commercial purposes. You are responsible for the content you process we don't monitor, review, or access your files.</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Free &amp; Pro plans</h4>
          <ul className="space-y-1.5 text-sm text-text-secondary">
            <li>• The <strong className="text-text-secondary">Free plan</strong> lets you process up to 2 batches per month.</li>
            <li>• The <strong className="text-text-secondary">Pro plan</strong> gives you unlimited batch processing. Monthly billing. Cancel anytime.</li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Your responsibility</h4>
          <p className="text-sm text-text-secondary leading-relaxed">You own your photos and files. We don't claim any rights over your content. While the app includes Undo and crash recovery, we recommend keeping backups of critical data.</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Limitation of liability</h4>
          <p className="text-sm text-text-secondary leading-relaxed">Batch My Photos is provided "as is." We do our best to ensure reliability, but we are not liable for data loss or damages arising from use of the application. Always keep backups.</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Changes to terms</h4>
          <p className="text-sm text-text-secondary leading-relaxed">We may update these terms from time to time. Significant changes will be communicated via the app or email. Continued use constitutes acceptance.</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Contact</h4>
          <p className="text-sm text-text-secondary leading-relaxed">Questions? Reach us at <a href="mailto:batchmyphotos@gmail.com" className="text-accent hover:text-accent transition-colors">batchmyphotos@gmail.com</a>.</p>
        </div>
        <div className="pt-3 border-t border-white/[0.06]">
          <p className="text-xs text-text-muted">Last updated: February 2026</p>
        </div>
      </div>
    ),
  },
}

export default MODAL_CONTENT
