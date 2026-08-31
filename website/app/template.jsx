'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'

// Aliased so core ESLint's no-unused-vars sees the JSX usage (no
// eslint-plugin-react in this repo to teach it about <MotionDiv>).
const MotionDiv = motion.div

/**
 * Per-navigation wrapper (remounts on every route change).
 * Replaces the old AnimatePresence + PageTransition pair: App Router unmounts
 * the previous page immediately, so route EXIT animations are gone — this
 * keeps the enter animation only. Also owns the scroll-to-top + hash-scroll
 * behavior the old AppContent had (App.jsx:32-45, onExitComplete scroll).
 */
export default function Template({ children }) {
  useEffect(() => {
    const hash = window.location.hash
    if (!hash) {
      window.scrollTo(0, 0)
      return
    }
    // Delay needs to outlast the enter transition (400ms + render)
    const timer = setTimeout(() => {
      try {
        const el = document.querySelector(hash)
        if (el) el.scrollIntoView({ behavior: 'smooth' })
      } catch {
        // Ignore invalid selectors (e.g. Supabase auth tokens in hash)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [])

  return (
    <MotionDiv
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="w-full"
    >
      {children}
    </MotionDiv>
  )
}
