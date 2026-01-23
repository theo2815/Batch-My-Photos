/**
 * ErrorBoundary Component
 * 
 * Catches JavaScript errors anywhere in the child component tree,
 * logs the error, and displays a fallback UI instead of crashing.
 * 
 * IMPORTANT: Error boundaries only catch errors in:
 * - Render methods
 * - Lifecycle methods
 * - Constructors of the whole tree below them
 * 
 * They do NOT catch errors in:
 * - Event handlers (use try/catch)
 * - Async code (use try/catch)
 * - Server-side rendering
 * - Errors in the boundary itself
 */

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import './ErrorBoundary.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null,
      errorInfo: null 
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render shows the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error to console for debugging
    console.error('🚨 [ERROR BOUNDARY] Caught error:', error);
    console.error('🚨 [ERROR BOUNDARY] Component stack:', errorInfo.componentStack);
    
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <div className="error-icon">
              <AlertTriangle size={64} strokeWidth={1.5} />
            </div>
            <h1>Something went wrong</h1>
            <p className="error-message">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <p className="error-hint">
              Don't worry, your files are safe. Try reloading the app.
            </p>
            <div className="error-actions">
              <button className="btn primary" onClick={this.handleReload}>
                <RefreshCw size={16} className="icon-inline" />
                Reload App
              </button>
              <button className="btn secondary" onClick={this.handleReset}>
                Try Again
              </button>
            </div>
            {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
              <details className="error-details">
                <summary>Technical Details (Dev Only)</summary>
                <pre>{this.state.error?.stack}</pre>
                <pre>{this.state.errorInfo.componentStack}</pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
