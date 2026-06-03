import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { CheckCircle2, Loader2, ExternalLink, AlertCircle } from 'lucide-react'

/**
 * DesktopCallback page — bridges website login to the desktop app.
 *
 * After the user logs in on the website (email/password or Google OAuth),
 * they are redirected here. This page:
 * 1. Extracts the Supabase session (access_token + user email)
 * 2. Triggers a deep link: batchmyphotos://auth/callback?token=XXX&email=YYY
 * 3. Shows a "You can close this tab" message
 */
export default function DesktopCallback() {
  const [status, setStatus] = useState('loading') // 'loading' | 'redirecting' | 'success' | 'error'
  const [error, setError] = useState(null)
  const [deepLinkUrl, setDeepLinkUrl] = useState(null)
  const timerRef = useRef(null)

  useEffect(() => {
    async function handleCallback() {
      try {
        // Get current session from Supabase
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()

        if (sessionError || !session) {
          setError('No active session found. Please log in first.')
          setStatus('error')
          return
        }

        const token = session.access_token
        const refreshToken = session.refresh_token
        const email = session.user?.email || ''
        const name = session.user?.user_metadata?.full_name || session.user?.user_metadata?.name || ''

        // Build deep link URL (includes refresh_token for persistent sessions)
        const url = `batchmyphotos://auth/callback?token=${encodeURIComponent(token)}&refresh_token=${encodeURIComponent(refreshToken)}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`
        setDeepLinkUrl(url)
        setStatus('redirecting')

        // Trigger the deep link
        window.location.href = url

        // After a short delay, show success message
        // (the deep link redirect may or may not cause the browser tab to close)
        timerRef.current = setTimeout(() => {
          setStatus('success')
        }, 2000)
      } catch (err) {
        console.error('Desktop callback error:', err)
        setError('Something went wrong. Please try again.')
        setStatus('error')
      }
    }

    handleCallback()
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  const handleRetryDeepLink = () => {
    if (deepLinkUrl) {
      window.location.href = deepLinkUrl
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-main px-4">
      <div className="w-full max-w-md rounded-2xl border border-border-subtle bg-bg-elevated backdrop-blur-xl shadow-2xl shadow-black/40 p-8 text-center">
        {status === 'loading' && (
          <>
            <div className="flex justify-center mb-6">
              <Loader2 className="w-12 h-12 animate-spin text-accent" />
            </div>
            <h1 className="text-xl font-bold mb-2 text-text-primary">
              Preparing redirect...
            </h1>
            <p className="text-sm text-text-secondary">
              Connecting to BatchMyPhotos desktop app
            </p>
          </>
        )}

        {status === 'redirecting' && (
          <>
            <div className="flex justify-center mb-6">
              <Loader2 className="w-12 h-12 animate-spin text-accent" />
            </div>
            <h1 className="text-xl font-bold mb-2 text-text-primary">
              Redirecting to app...
            </h1>
            <p className="text-sm text-text-secondary">
              Opening BatchMyPhotos desktop app
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-full flex items-center justify-center bg-emerald-500/20">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
            </div>
            <h1 className="text-xl font-bold mb-2 text-text-primary">
              Authentication complete!
            </h1>
            <p className="text-sm mb-6 text-text-secondary">
              You can close this tab and return to the BatchMyPhotos app.
            </p>
            <button
              onClick={handleRetryDeepLink}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors text-accent hover:bg-bg-surface"
            >
              <ExternalLink className="w-4 h-4" />
              Click here if the app didn't open
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-full flex items-center justify-center bg-red-500/20">
                <AlertCircle className="w-8 h-8 text-red-400" />
              </div>
            </div>
            <h1 className="text-xl font-bold mb-2 text-text-primary">
              Something went wrong
            </h1>
            <p className="text-sm mb-6 text-text-secondary">
              {error}
            </p>
            <a
              href="/login?desktop=true"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-primary text-white hover:bg-primary-hover"
            >
              Try again
            </a>
          </>
        )}
      </div>
    </div>
  )
}
