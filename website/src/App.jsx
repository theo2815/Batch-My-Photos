
import { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom'
import { ThemeProvider, useTheme } from './context/ThemeContext'
import Navbar from './components/Navbar'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
import LandingPage from './pages/LandingPage'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import DemoPage from './pages/DemoPage'
import ForgotPassword from './pages/ForgotPassword'
import UpdatePassword from './pages/UpdatePassword'
import BillingHistory from './pages/BillingHistory'
import DesktopCallback from './pages/DesktopCallback'
import ConnectApp from './pages/ConnectApp'
import PrivacyPolicy from './pages/PrivacyPolicy'
import TermsOfService from './pages/TermsOfService'
import AdminCoupons from './pages/AdminCoupons'
import AdminRoute from './components/AdminRoute'

import { AnimatePresence } from 'framer-motion'
import PageTransition from './components/PageTransition'
const AppContent = () => {
  const location = useLocation();
  const isDemo = location.pathname === '/demo';
  const { isDark } = useTheme();

  // Scroll to hash element after navigation (e.g. /#faq from /dashboard)
  useEffect(() => {
    if (location.hash) {
      // Delay needs to be longer than the page transition (250ms + render)
      const timer = setTimeout(() => {
        try {
          const el = document.querySelector(location.hash)
          if (el) el.scrollIntoView({ behavior: 'smooth' })
        } catch {
          // Ignore invalid selectors (e.g. Supabase auth tokens in hash)
        }
      }, 500)
      return () => clearTimeout(timer)
    } else {
      window.scrollTo(0, 0)
    }
  }, [location.pathname, location.hash])

  return (
    <div className={`min-h-screen font-sans ${isDark ? 'bg-slate-950 text-white' : 'bg-gray-50 text-gray-900'}`}>
      {!isDemo && <Navbar />}
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<PageTransition><LandingPage /></PageTransition>} />
          <Route path="/login" element={<PageTransition><Login /></PageTransition>} />
          <Route path="/register" element={<PageTransition><Register /></PageTransition>} />
          <Route path="/auth/desktop-callback" element={<PageTransition><DesktopCallback /></PageTransition>} />
          <Route path="/auth/connect-app" element={<PageTransition><ConnectApp /></PageTransition>} />
          <Route path="/dashboard" element={<PageTransition><ProtectedRoute><Dashboard /></ProtectedRoute></PageTransition>} />
          <Route path="/settings" element={<PageTransition><ProtectedRoute><Settings /></ProtectedRoute></PageTransition>} />
          <Route path="/billing" element={<PageTransition><ProtectedRoute><BillingHistory /></ProtectedRoute></PageTransition>} />
          <Route path="/demo" element={<PageTransition><DemoPage /></PageTransition>} />
          <Route path="/privacy" element={<PageTransition><PrivacyPolicy /></PageTransition>} />
          <Route path="/terms" element={<PageTransition><TermsOfService /></PageTransition>} />
          <Route path="/forgot-password" element={<PageTransition><ForgotPassword /></PageTransition>} />
          <Route path="/update-password" element={<PageTransition><ProtectedRoute><UpdatePassword /></ProtectedRoute></PageTransition>} />
          <Route path="/admin/coupons" element={<PageTransition><AdminRoute><AdminCoupons /></AdminRoute></PageTransition>} />
          <Route path="*" element={
            <PageTransition>
              <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
                <h1 className="text-6xl font-bold text-indigo-500">404</h1>
                <p className="text-lg text-slate-400">Page not found</p>
                <a href="/" className="mt-2 text-sm font-medium text-indigo-400 hover:text-indigo-300 transition-colors">← Back to home</a>
              </div>
            </PageTransition>
          } />
        </Routes>
      </AnimatePresence>
    </div>
  );
};

function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <Router>
          <AppContent />
        </Router>
      </ErrorBoundary>
    </ThemeProvider>
  )
}

export default App

