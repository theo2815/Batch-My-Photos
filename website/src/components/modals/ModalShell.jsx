/**
 * ModalShell — the single overlay primitive for the site.
 *
 * Renders into document.body via createPortal (so it escapes any transformed/
 * stacking-context ancestor), and centralizes the behaviors every modal needs:
 * Escape-to-close, body scroll-lock, backdrop click-to-close, z-[100], and the
 * `footerModalIn` entrance. Darkroom-styled (warm surface + hairline border).
 *
 * Usage:
 *   <ModalShell title="Upgrade Plan" icon={Sparkles} maxWidth="max-w-5xl" onClose={close}>
 *     …body…
 *   </ModalShell>
 * Pass no `title` to render a fully custom dialog (no header chrome).
 */
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export default function ModalShell({
  onClose,
  title,
  icon: Icon,
  iconColor = 'text-accent',
  maxWidth = 'max-w-lg',
  bodyClassName = 'px-6 py-5',
  children,
}) {
  // Escape key + lock body scroll while open
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Dialog */}
      <div
        className={`relative w-full ${maxWidth} max-h-[90vh] rounded-2xl border border-border-subtle bg-bg-surface shadow-2xl shadow-black/50 flex flex-col animate-[footerModalIn_0.2s_ease-out] overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle shrink-0">
            <div className="flex items-center gap-3">
              {Icon && (
                <div className={`w-8 h-8 rounded-lg bg-bg-elevated flex items-center justify-center ${iconColor}`}>
                  <Icon className="w-4 h-4" />
                </div>
              )}
              <h3 className="font-display text-lg font-bold text-text-primary">{title}</h3>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-bg-elevated flex items-center justify-center text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className={`overflow-y-auto flex-1 custom-scrollbar ${bodyClassName}`}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
