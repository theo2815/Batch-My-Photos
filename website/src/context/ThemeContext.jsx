'use client'

import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)

// SSR guards: on the server, render with the dark defaults — the inline
// <head> script (app/layout.jsx) sets the real .dark class before paint.
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() =>
    typeof window === 'undefined' ? 'dark' : localStorage.getItem('bmp-theme') || 'dark'
  )

  // Track system preference for 'system' mode
  const [systemDark, setSystemDark] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia('(prefers-color-scheme: dark)').matches
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e) => setSystemDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Resolved boolean
  const isDark = theme === 'dark' || (theme === 'system' && systemDark)

  // Sync a CSS class on <html> so pure-CSS rules (scrollbar, etc.) can react
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  const setTheme = (t) => {
    setThemeState(t)
    localStorage.setItem('bmp-theme', t)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
