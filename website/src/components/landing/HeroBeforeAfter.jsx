'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { Folder, Play, ArrowRight } from 'lucide-react'

// ── Deterministic gradient for fake thumbnails ──
const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0; return Math.abs(h) }
const thumb = (name) => {
  const h = hash(name)
  const a = h % 360, b = ((h >> 4) + 120) % 360, angle = (h % 4) * 45 + 90
  return `linear-gradient(${angle}deg, hsl(${a},35%,72%), hsl(${b},40%,80%))`
}

// Deterministic pseudo-random in [0,1) — well-distributed so the pile scatters
// across the whole panel instead of clustering (modular sequences bunch up).
const rand = (n) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x) }

// BEFORE: a dense pile of unsorted shots scattered across the whole panel, clipped inside it.
const PILE = Array.from({ length: 40 }, (_, i) => ({
  name: `IMG_${String(4100 + ((i * 53) % 900) + i).padStart(4, '0')}.jpg`,
  rot: rand(i + 1) * 44 - 22,         // ±22° tilt
  top: 1 + rand(i + 7) * 74,          // 1..75% — fills vertically, stays below the header
  left: -6 + rand(i + 13) * 94,       // full width, side bleed (clipped)
  z: Math.floor(rand(i + 19) * 40),   // jumbled stacking order
}))
// AFTER: clean numbered folders.
const FOLDERS = Array.from({ length: 6 }, (_, i) => ({ name: `Batch_${String(i + 1).padStart(3, '0')}`, count: i === 5 ? 235 : 500 }))

const panelReveal = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  show: (d) => ({ opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease: 'easeOut', delay: d } }),
}

/**
 * Hook-first hero — a static before/after told in one glance: a messy pile of
 * unsorted photos (BEFORE) → arrow → clean numbered folders (AFTER).
 * No slider, no scrubbing; just one gentle reveal on load (BEFORE settles, then
 * AFTER, so the eye reads the transformation). Reduced-motion = static.
 */
export default function HeroBeforeAfter() {
  const reduce = useReducedMotion()
  const initial = reduce ? 'show' : 'hidden'

  return (
    <section className="relative isolate overflow-hidden bg-bg-main min-h-svh flex items-center">
      <div className="film-grain" aria-hidden="true" />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 lg:px-8 py-24 text-center">
        {/* Eyebrow */}
        <div className="inline-flex items-center gap-3 mb-6">
          <span className="race-stripe" aria-hidden="true">
            <span className="bg-primary" /><span className="bg-accent-strong" /><span className="bg-deep-ember" />
          </span>
          <span className="kicker">Windows desktop app · 100% local</span>
        </div>

        {/* Headline */}
        <h1 className="font-hero text-5xl sm:text-6xl lg:text-7xl text-text-primary max-w-4xl mx-auto">
          Drop a messy folder.{' '}
          <span className="text-primary">Get clean, numbered batches</span>{' '}
          in seconds.
        </h1>
        <p className="mt-5 text-lg text-text-secondary max-w-2xl mx-auto">
          BatchMyPhotos sorts 5,000–20,000 photos into numbered folders on your drive — no uploads, fully reversible.
        </p>

        {/* Before → After diagram */}
        <div className="mt-12 grid gap-4 sm:gap-5 lg:grid-cols-[1fr_auto_1fr] items-stretch text-left">
          {/* BEFORE */}
          <motion.div
            variants={panelReveal} custom={0.1} initial={initial} animate="show"
            className="rounded-xl border border-border-subtle overflow-hidden bg-bg-elevated shadow-card"
          >
            <div className="h-8 flex items-center justify-between px-3 border-b border-border-subtle bg-bg-surface">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted">Before</span>
              <span className="text-[10px] font-mono text-text-muted tnum">unsorted · 12,480 files</span>
            </div>
            <div className="relative h-52 sm:h-60 overflow-hidden">
              {PILE.map((it) => (
                <div
                  key={it.name}
                  className="absolute w-16 sm:w-20 rounded shadow-md shadow-black/15"
                  style={{ top: `${it.top}%`, left: `${it.left}%`, rotate: `${it.rot}deg`, zIndex: it.z }}
                >
                  <div className="aspect-[4/3] rounded-t" style={{ background: thumb(it.name) }} />
                  <div className="bg-bg-surface px-1 py-0.5 rounded-b">
                    <span className="text-[8px] font-mono text-text-muted truncate block">{it.name}</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Arrow */}
          <div className="flex lg:flex-col items-center justify-center gap-2 py-1">
            <motion.div
              initial={reduce ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: reduce ? 0 : 0.5, duration: 0.4, ease: 'backOut' }}
              className="w-12 h-12 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0"
            >
              <ArrowRight className="w-6 h-6 text-accent rotate-90 lg:rotate-0" />
            </motion.div>
            <span className="text-[10px] font-mono text-text-muted tnum">3.1s</span>
          </div>

          {/* AFTER */}
          <motion.div
            variants={panelReveal} custom={0.35} initial={initial} animate="show"
            className="rounded-xl border border-primary/25 overflow-hidden bg-bg-elevated shadow-card"
          >
            <div className="h-8 flex items-center justify-between px-3 border-b border-border-subtle bg-bg-surface">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-accent">After</span>
              <span className="text-[10px] font-mono text-text-secondary tnum">~/Marathon · 25 folders</span>
            </div>
            <div className="h-52 sm:h-60 p-3 grid grid-cols-2 sm:grid-cols-3 gap-2 content-start">
              {FOLDERS.map((f) => (
                <div key={f.name} className="rounded-lg bg-bg-surface border border-border-subtle p-2.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Folder className="w-3.5 h-3.5 text-accent shrink-0" />
                    <span className="text-[11px] font-mono font-medium text-text-primary truncate">{f.name}</span>
                  </div>
                  <div className="text-[10px] text-text-muted font-mono tnum">{f.count} photos</div>
                  <div className="mt-1.5 h-1 rounded-full bg-border-subtle overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: '100%' }} />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* CTAs */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          <a href="/demo" target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-2.5 px-7 py-3.5 rounded-full bg-primary hover:bg-primary-hover text-white text-base font-bold transition-colors">
            <Play className="w-5 h-5" /> Try the demo
          </a>
          <a href="https://apps.microsoft.com/detail/9N1KKMV4NX4J" target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">
            Get it on the Microsoft Store →
          </a>
        </div>
      </div>
    </section>
  )
}
