import { motion, useReducedMotion } from 'framer-motion'
import { Folder, Play, ArrowRight } from 'lucide-react'

// ── Deterministic gradient for fake thumbnails ──
const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0; return Math.abs(h) }
const thumb = (name) => {
  const h = hash(name)
  const a = h % 360, b = ((h >> 4) + 120) % 360, angle = (h % 4) * 45 + 90
  return `linear-gradient(${angle}deg, hsl(${a},40%,19%), hsl(${b},46%,27%))`
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
 * unsorted photos (BEFORE) → amber arrow → clean numbered folders (AFTER).
 * No slider, no scrubbing; just one gentle reveal on load (BEFORE settles, then
 * AFTER, so the eye reads the transformation). Reduced-motion = static.
 */
export default function HeroBeforeAfter() {
  const reduce = useReducedMotion()
  const initial = reduce ? 'show' : 'hidden'

  return (
    <section className="relative isolate overflow-hidden bg-bg-main min-h-svh flex items-center">
      <div className="film-grain" aria-hidden="true" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_72%_18%,rgba(255,122,69,0.12),transparent)]" aria-hidden="true" />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 lg:px-8 py-24 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 mb-6">
          <span className="text-xs font-semibold tracking-wide text-accent">Windows desktop app · 100% local</span>
        </div>

        {/* Headline */}
        <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.08] text-text-primary max-w-3xl mx-auto">
          Drop a messy folder. Get{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-deep-ember">clean, numbered batches</span>{' '}
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
            className="rounded-xl border border-[rgba(255,255,255,0.07)] overflow-hidden bg-[#100f0e] shadow-2xl shadow-black/40"
          >
            <div className="h-8 flex items-center justify-between px-3 border-b border-[rgba(255,255,255,0.06)] bg-[#1a1613]">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#6f6257]">Before</span>
              <span className="text-[10px] font-mono text-[#6f6257]">unsorted · 12,480 files</span>
            </div>
            <div className="relative h-52 sm:h-60 overflow-hidden">
              {PILE.map((it) => (
                <div
                  key={it.name}
                  className="absolute w-16 sm:w-20 rounded shadow-lg shadow-black/50"
                  style={{ top: `${it.top}%`, left: `${it.left}%`, rotate: `${it.rot}deg`, zIndex: it.z }}
                >
                  <div className="aspect-[4/3] rounded-t" style={{ background: thumb(it.name) }} />
                  <div className="bg-[#1a1714] px-1 py-0.5 rounded-b">
                    <span className="text-[8px] font-mono text-[#6f6257] truncate block">{it.name}</span>
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
            <span className="text-[10px] font-mono text-text-muted">3.1s</span>
          </div>

          {/* AFTER */}
          <motion.div
            variants={panelReveal} custom={0.35} initial={initial} animate="show"
            className="rounded-xl border border-primary/20 overflow-hidden bg-[#17120f] shadow-2xl shadow-primary/10"
          >
            <div className="h-8 flex items-center justify-between px-3 border-b border-[rgba(255,255,255,0.06)] bg-[#211a15]">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-accent">After</span>
              <span className="text-[10px] font-mono text-[#a89a8c]">~/Marathon · 25 folders</span>
            </div>
            <div className="h-52 sm:h-60 p-3 grid grid-cols-2 sm:grid-cols-3 gap-2 content-start">
              {FOLDERS.map((f) => (
                <div key={f.name} className="rounded-lg bg-[#211a15] border border-[rgba(255,255,255,0.06)] p-2.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Folder className="w-3.5 h-3.5 text-accent shrink-0" />
                    <span className="text-[11px] font-mono font-medium text-[#f4ece2] truncate">{f.name}</span>
                  </div>
                  <div className="text-[10px] text-[#6f6257] font-mono">{f.count} photos</div>
                  <div className="mt-1.5 h-1 rounded-full bg-[#100f0e] overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#ff7a45] to-[#c7472a]" style={{ width: '100%' }} />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* CTAs */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          <a href="/demo" target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-base font-semibold shadow-lg shadow-primary/25 hover:-translate-y-0.5 transition-all">
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
