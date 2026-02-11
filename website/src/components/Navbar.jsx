
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTheme } from '../context/ThemeContext'
import { Play, Menu, X } from 'lucide-react'

const NAV_LINKS = [
  { label: 'Features', href: '/#features' },
  { label: 'Demo', href: '/demo', external: true },
  { label: 'FAQ', href: '/#faq' },
  { label: 'Contact', href: 'mailto:batchmyphotos@gmail.com', external: true },
]

export default function Navbar() {
  const [user, setUser] = useState(null)
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const isLanding = location.pathname === '/'

  // Handle hash links (e.g. /#faq) — scroll if on landing, navigate if not
  const handleHashClick = (e, href) => {
    e.preventDefault()
    const hash = href.split('#')[1]
    if (isLanding && hash) {
      const el = document.getElementById(hash)
      if (el) el.scrollIntoView({ behavior: 'smooth' })
    } else {
      navigate(href)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Track scroll for background transition
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  // Theme-driven styling
  const { isDark: dark } = useTheme()

  return (
    <>
      <nav
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
          scrolled
            ? dark
              ? 'bg-slate-950/80 backdrop-blur-xl shadow-lg shadow-black/20'
              : 'bg-white/80 backdrop-blur-xl border-b border-gray-200 shadow-sm'
            : 'bg-transparent'
        }`}
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">

            {/* Logo */}
            <Link to="/" className="flex items-center gap-2.5 group shrink-0">
              <img
                src="/app_icon.png"
                alt="Batch My Photos"
                className="w-8 h-8 rounded-lg group-hover:scale-105 transition-transform"
              />
              <span className={`text-base font-bold tracking-tight transition-colors ${dark ? 'text-white' : 'text-slate-900'}`}>
                Batch My Photos
              </span>
            </Link>

            {/* Desktop nav links */}
            <div className="hidden md:flex items-center gap-1">
              {NAV_LINKS.map(link => (
                link.external ? (
                  <a
                    key={link.label}
                    href={link.href}
                    target={link.href.startsWith('mailto') ? undefined : '_blank'}
                    rel={link.href.startsWith('mailto') ? undefined : 'noopener noreferrer'}
                    className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                      dark
                        ? 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    {link.label}
                  </a>
                ) : (
                  <a
                    key={link.label}
                    href={link.href}
                    onClick={(e) => handleHashClick(e, link.href)}
                    className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                      dark
                        ? 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    {link.label}
                  </a>
                )
              ))}
            </div>

            {/* Desktop right side */}
            <div className="hidden md:flex items-center gap-3">
              {user ? (
                <>
                  <Link
                    to="/dashboard"
                    className={`text-sm font-medium px-3.5 py-2 rounded-lg transition-colors ${
                      dark ? 'text-slate-400 hover:text-white hover:bg-white/[0.06]' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    Dashboard
                  </Link>
                  <button
                    onClick={handleLogout}
                    className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
                      dark ? 'text-slate-300 bg-white/[0.06] hover:bg-white/[0.1]' : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
                    }`}
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    className={`text-sm font-medium px-3.5 py-2 rounded-lg transition-colors ${
                      dark ? 'text-slate-400 hover:text-white hover:bg-white/[0.06]' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    Login
                  </Link>
                  <a
                    href="/demo"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-md shadow-indigo-500/20 hover:shadow-indigo-500/30 hover:-translate-y-px transition-all"
                  >
                    <Play className="w-3.5 h-3.5" /> Try Demo
                  </a>
                </>
              )}
            </div>

            {/* Mobile hamburger */}
            <button
              className={`md:hidden p-2 rounded-lg transition-colors ${
                dark ? 'text-slate-400 hover:text-white hover:bg-white/[0.06]' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <div
          className={`md:hidden overflow-hidden transition-all duration-300 ${
            mobileOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className={`px-6 pb-6 pt-2 space-y-1 ${
            dark ? 'bg-slate-950/95 backdrop-blur-xl border-t border-white/[0.04]' : 'bg-white/95 backdrop-blur-xl border-t border-gray-100'
          }`}>
            {NAV_LINKS.map(link => (
              link.external ? (
                <a
                  key={link.label}
                  href={link.href}
                  target={link.href.startsWith('mailto') ? undefined : '_blank'}
                  rel={link.href.startsWith('mailto') ? undefined : 'noopener noreferrer'}
                  className={`block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    dark ? 'text-slate-400 hover:text-white hover:bg-white/[0.06]' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </a>
              ) : (
                <a
                  key={link.label}
                  href={link.href}
                  className={`block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    dark ? 'text-slate-400 hover:text-white hover:bg-white/[0.06]' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                  onClick={(e) => { handleHashClick(e, link.href); setMobileOpen(false) }}
                >
                  {link.label}
                </a>
              )
            ))}

            <div className={`pt-3 border-t ${dark ? 'border-white/[0.04]' : 'border-gray-200'} space-y-2`}>
              {user ? (
                <>
                  <Link to="/dashboard" className={`block px-3 py-2.5 rounded-lg text-sm font-medium ${dark ? 'text-slate-300' : 'text-gray-700'}`}>Dashboard</Link>
                  <button onClick={handleLogout} className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium ${dark ? 'text-slate-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}>Logout</button>
                </>
              ) : (
                <>
                  <Link to="/login" className={`block px-3 py-2.5 rounded-lg text-sm font-medium ${dark ? 'text-slate-300' : 'text-gray-700'}`}>Login</Link>
                  <a
                    href="/demo"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
                    onClick={() => setMobileOpen(false)}
                  >
                    <Play className="w-3.5 h-3.5" /> Try Demo
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>
    </>
  )
}
