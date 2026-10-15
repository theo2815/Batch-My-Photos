'use client'

/**
 * Select — the site's dropdown. Same feel as the desktop/simulator CustomSelect
 * (rotating chevron, sliding options panel, highlighted active option), styled
 * with the website tokens, plus keyboard and screen-reader support.
 *
 * Usage:
 *   <Select id="volume" value={v} onChange={setV} placeholder="Choose one"
 *           options={[{ value: 'a', label: 'A' }]} />
 */
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'

export default function Select({ id, value, options, onChange, placeholder = 'Choose one', invalid = false }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0) // keyboard-highlighted option
  const ref = useRef(null)
  const selected = options.find((o) => o.value === value)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const openList = () => {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    setOpen(true)
  }

  const choose = (opt) => {
    onChange(opt.value)
    setOpen(false)
  }

  const onKeyDown = (e) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openList() }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, options.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(options[active]) }
    else if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } // don't also close a surrounding modal
    else if (e.key === 'Tab') setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-invalid={invalid || undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={`flex w-full items-center justify-between gap-3 rounded-xl border bg-bg-elevated py-2.5 px-3.5 text-left text-sm transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20 ${
          open ? 'border-primary/50' : invalid ? 'border-red-500/50' : 'border-border-subtle hover:border-primary/30'
        }`}
      >
        <span className={selected ? 'text-text-primary' : 'text-text-muted'}>{selected ? selected.label : placeholder}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-200 ${open ? 'rotate-180 text-text-primary' : 'text-text-muted'}`} />
      </button>

      <ul
        id={`${id}-list`}
        role="listbox"
        aria-labelledby={id}
        className={`absolute left-0 right-0 top-full z-20 mt-2 rounded-xl border border-border-subtle bg-bg-surface p-1.5 shadow-lg shadow-black/10 transition-all duration-200 ${
          open ? 'opacity-100 translate-y-0' : 'pointer-events-none invisible opacity-0 -translate-y-1'
        }`}
      >
        {options.map((opt, i) => {
          const isSelected = opt.value === value
          return (
            <li
              key={opt.value}
              role="option"
              aria-selected={isSelected}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()} // keep focus on the button
              onClick={() => choose(opt)}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors ${
                i === active ? 'bg-primary/10 text-text-primary' : 'text-text-secondary'
              } ${isSelected ? 'font-semibold text-accent' : ''}`}
            >
              {opt.label}
              {isSelected && <Check className="w-3.5 h-3.5 text-accent" />}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
