import { useRef, useState, useEffect } from 'react'
import { motion, useScroll } from 'framer-motion'
import { useTheme } from '../context/ThemeContext'

export default function VerticalTimeline({ content }) {
  const { isDark } = useTheme()
  const containerRef = useRef(null)
  const [activeIndex, setActiveIndex] = useState(0)

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  })

  // ── Track which section is active based on scroll progress ────────────
  useEffect(() => {
    const n = content.length
    const unsubscribe = scrollYProgress.on('change', (v) => {
      setActiveIndex(Math.max(0, Math.min(Math.round(v * (n - 1)), n - 1)))
    })
    return () => unsubscribe()
  }, [scrollYProgress, content.length])



  return (
    <div ref={containerRef} className="relative mx-auto max-w-7xl px-6 lg:px-8">
      {/* ─── Timeline Track (background line) ─── */}
      <div className={`absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 hidden lg:block ${isDark ? 'bg-white/[0.06]' : 'bg-gray-200'}`} />

      {/* ─── Timeline Track (progress fill) ─── */}
      <motion.div
        className="absolute left-1/2 top-0 w-0.5 -translate-x-1/2 origin-top rounded-full hidden lg:block"
        style={{
          height: '100%',
          scaleY: scrollYProgress,
          background: 'linear-gradient(180deg, #6366f1 0%, #a855f7 50%, #6366f1 100%)',
          filter: 'drop-shadow(0 0 8px rgba(99,102,241,0.5))',
        }}
      />

      {/* ─── Sections ─── */}
      {content.map((item, index) => {
        const isLeft = index % 2 === 0
        const isActive = index === activeIndex
        const isPast = index < activeIndex

        return (
          <section
            key={index}
            className="min-h-screen flex items-center relative py-10"
          >
            {/* ── Circle marker on center line ── */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 hidden lg:block">
              <motion.div
                className="relative flex items-center justify-center"
                animate={isActive ? { scale: [1, 1.2, 1] } : { scale: 1 }}
                transition={
                  isActive
                    ? { duration: 2, repeat: Infinity, ease: 'easeInOut' }
                    : { duration: 0.3 }
                }
              >
                {/* Glow ring */}
                <div
                  className={`absolute -inset-3 rounded-full transition-all duration-700 ${
                    isActive ? 'bg-indigo-500/20' : 'bg-transparent'
                  }`}
                />
                {/* Solid circle */}
                <div
                  className={`w-4 h-4 rounded-full border-2 transition-all duration-500 ${
                    isActive
                      ? 'bg-indigo-500 border-indigo-400 shadow-[0_0_16px_rgba(99,102,241,0.7)]'
                      : isPast
                        ? 'bg-indigo-500/80 border-indigo-500/60'
                        : isDark ? 'bg-slate-900 border-slate-600' : 'bg-white border-gray-300'
                  }`}
                />
              </motion.div>
            </div>

            {/* ── Mobile step dot (left-aligned) ── */}
            <div className="absolute left-2 top-1/2 -translate-y-1/2 lg:hidden">
              <div
                className={`w-2.5 h-2.5 rounded-full transition-all duration-500 ${
                  isPast || isActive ? 'bg-indigo-500' : isDark ? 'bg-slate-700' : 'bg-gray-300'
                }`}
              />
            </div>

            {/* ── Alternating two-column content ── */}
            <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-24 pl-8 lg:pl-0">
              {isLeft ? (
                <>
                  <TimelineText item={item} index={index} align="right" slideFrom="left" />
                  <TimelineCard item={item} slideFrom="right" className="lg:pl-14" />
                </>
              ) : (
                <>
                  <TimelineCard item={item} slideFrom="left" className="lg:pr-14 order-2 lg:order-1" />
                  <TimelineText item={item} index={index} align="left" slideFrom="right" className="order-1 lg:order-2" />
                </>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════════════ */

function TimelineText({ item, index, align, slideFrom, className = '' }) {
  const { isDark } = useTheme()
  const x = slideFrom === 'left' ? -40 : 40
  return (
    <motion.div
      className={`flex flex-col justify-center ${
        align === 'right' ? 'lg:pr-14 lg:text-right' : 'lg:pl-14'
      } ${className}`}
      initial={{ opacity: 0, x }}
      whileInView={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      viewport={{ once: false, amount: 0.3 }}
    >
      <span className="text-xs font-bold tracking-widest uppercase text-indigo-400 mb-3">
        Step {index + 1}
      </span>
      <h3 className={`text-2xl sm:text-3xl font-bold mb-4 leading-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
        {item.title.replace(/^\d+\.\s*/, '')}
      </h3>
      <p
        className={`text-base sm:text-lg leading-relaxed max-w-md ${isDark ? 'text-slate-400' : 'text-gray-600'} ${
          align === 'right' ? 'lg:ml-auto' : ''
        }`}
      >
        {item.description}
      </p>
    </motion.div>
  )
}

function TimelineCard({ item, slideFrom, className = '' }) {
  const { isDark } = useTheme()
  const x = slideFrom === 'left' ? -40 : 40
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, x, y: 15 }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 }}
      viewport={{ once: false, amount: 0.3 }}
    >
      <div className={`w-full h-80 sm:h-96 lg:h-[32rem] rounded-2xl overflow-hidden border ${isDark ? 'border-white/[0.06] shadow-[0_0_40px_rgba(0,0,0,0.3)]' : 'border-gray-200 shadow-lg shadow-gray-200/50'}`}>
        {item.content}
      </div>
    </motion.div>
  )
}
