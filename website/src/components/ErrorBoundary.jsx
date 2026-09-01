'use client'

import { Component } from 'react'

/**
 * Catches runtime errors in child components and shows a friendly fallback.
 * Prevents the entire app from white-screening on unexpected errors
 * (especially important when adding payment components).
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-bg-main px-4">
          <div className="text-center max-w-md">
            <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-error/10 border border-error/20 flex items-center justify-center">
              <span className="text-2xl">⚠</span>
            </div>
            <h1 className="text-xl font-bold text-text-primary mb-2">Something went wrong</h1>
            <p className="text-sm text-text-secondary mb-6 leading-relaxed">
              An unexpected error occurred. Please try refreshing the page.
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false })
                window.location.reload()
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-sm font-semibold text-white hover:brightness-110 transition-all cursor-pointer"
            >
              Refresh page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
