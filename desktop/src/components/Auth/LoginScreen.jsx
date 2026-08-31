import React, { useState, useEffect } from 'react'
import { LogIn, ExternalLink, Loader2, AlertCircle, ArrowLeft } from 'lucide-react'
import './LoginScreen.css'

export function LoginScreen({ onLoginSuccess, sessionExpired = false }) {
  const [isWaiting, setIsWaiting] = useState(false)
  const [error, setError] = useState(null)

  // If session expired, auto-set the waiting state (login page was already opened
  // by the main process). User just needs to click the email link.
  useEffect(() => {
    if (sessionExpired) {
      setIsWaiting(true)
    }
  }, [sessionExpired])

  // Listen for deep link auth callback from main process
  useEffect(() => {
    if (!window.electronAPI?.onAuthCallback) return

    const cleanup = window.electronAPI.onAuthCallback((data) => {
      if (data.success) {
        setIsWaiting(false)
        setError(null)
        onLoginSuccess()
      } else {
        setIsWaiting(false)
        setError(data.error || 'Authentication failed. Please try again.')
      }
    })

    return cleanup
  }, [onLoginSuccess])

  const handleOpenBrowser = async () => {
    setIsWaiting(true)
    setError(null)
    await window.electronAPI.authOpenLogin()
  }

  const handleCancel = () => {
    setIsWaiting(false)
    setError(null)
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-header">
          <div className="login-icon">
            <LogIn className="icon" />
          </div>
          <h1 className="login-title">Sign In to BatchMyPhotos</h1>
          <p className="login-subtitle">
            Connect your account to sync your subscription and batch history
          </p>
        </div>

        <div className="login-content">
          {!isWaiting ? (
            <>
              <button
                onClick={handleOpenBrowser}
                className="browser-login-button"
              >
                <ExternalLink className="button-icon" />
                Sign in with Browser
              </button>

              {error && (
                <div className="error-message">
                  <AlertCircle className="error-icon" />
                  {error}
                </div>
              )}
            </>
          ) : (
            <div className="waiting-state">
              <div className="waiting-spinner">
                <Loader2 className="spinner-icon" />
              </div>
              {sessionExpired ? (
                <>
                  <p className="waiting-text">Session refreshed — please sign in again</p>
                  <p className="waiting-hint">
                    Your sign-in page has been opened automatically. Complete sign-in in your browser and this page will update.
                  </p>
                </>
              ) : (
                <>
                  <p className="waiting-text">Waiting for authentication...</p>
                  <p className="waiting-hint">
                    Complete sign-in in your browser. This page will update automatically.
                  </p>
                </>
              )}
              <button
                onClick={handleCancel}
                className="cancel-button"
              >
                <ArrowLeft className="cancel-icon" />
                Cancel
              </button>
            </div>
          )}
        </div>

        <p className="login-footer">
          Don't have an account?{' '}
          <a href="#" onClick={handleOpenBrowser} className="signup-link">
            Sign up on our website
          </a>
        </p>
      </div>
    </div>
  )
}
