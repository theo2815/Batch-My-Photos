import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTheme } from '../context/ThemeContext'
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
  const { isDark } = useTheme()
  const [status, setStatus] = useState('loading') // 'loading' | 'redirecting' | 'success' | 'error'
  const [error, setError] = useState(null)
  const [deepLinkUrl, setDeepLinkUrl] = useState(null)

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
        const email = session.user?.email || ''
        const name = session.user?.user_metadata?.full_name || session.user?.user_metadata?.name || ''

        // Build deep link URL
        const url = `batchmyphotos://auth/callback?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`
        setDeepLinkUrl(url)
        setStatus('redirecting')

        // Trigger the deep link
        window.location.href = url

        // After a short delay, show success message
        // (the deep link redirect may or may not cause the browser tab to close)
        setTimeout(() => {
          setStatus('success')
        }, 2000)
      } catch (err) {
        console.error('Desktop callback error:', err)
        setError('Something went wrong. Please try again.')
        setStatus('error')
      }
    }

    handleCallback()
  }, [])

  const handleRetryDeepLink = () => {
    if (deepLinkUrl) {
      window.location.href = deepLinkUrl
    }
  }

  return (
    <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-slate-950' : 'bg-gray-50'} px-4`}>
      <div className={`w-full max-w-md rounded-2xl border ${isDark ? 'border-white/[0.08] bg-white/[0.03] backdrop-blur-xl shadow-2xl shadow-black/40' : 'border-gray-200 bg-white shadow-xl'} p-8 text-center`}>
        {status === 'loading' && (
          <>
            <div className="flex justify-center mb-6">
              <Loader2 className={`w-12 h-12 animate-spin ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
            </div>
            <h1 className={`text-xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Preparing redirect...
            </h1>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
              Connecting to BatchMyPhotos desktop app
            </p>
          </>
        )}

        {status === 'redirecting' && (
          <>
            <div className="flex justify-center mb-6">
              <Loader2 className={`w-12 h-12 animate-spin ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
            </div>
            <h1 className={`text-xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Redirecting to app...
            </h1>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
              Opening BatchMyPhotos desktop app
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="flex justify-center mb-6">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isDark ? 'bg-emerald-500/20' : 'bg-emerald-100'}`}>
                <CheckCircle2 className={`w-8 h-8 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
              </div>
            </div>
            <h1 className={`text-xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Authentication complete!
            </h1>
            <p className={`text-sm mb-6 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
              You can close this tab and return to the BatchMyPhotos app.
            </p>
            <button
              onClick={handleRetryDeepLink}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isDark ? 'text-indigo-400 hover:bg-white/[0.05]' : 'text-indigo-600 hover:bg-indigo-50'}`}
            >
              <ExternalLink className="w-4 h-4" />
              Click here if the app didn't open
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="flex justify-center mb-6">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isDark ? 'bg-red-500/20' : 'bg-red-100'}`}>
                <AlertCircle className={`w-8 h-8 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
              </div>
            </div>
            <h1 className={`text-xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Something went wrong
            </h1>
            <p className={`text-sm mb-6 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
              {error}
            </p>
            <a
              href="/login?desktop=true"
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isDark ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
            >
              Try again
            </a>
          </>
        )}
      </div>
    </div>
  )
}
