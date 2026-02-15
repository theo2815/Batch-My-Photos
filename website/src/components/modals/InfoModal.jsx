/**
 * Reusable info modal.
 *
 * Usage:
 *   import InfoModal from '@/components/modals/InfoModal'
 *   import MODAL_CONTENT from '@/components/modals/modalContents'
 *
 *   // inside JSX — open any modal by key:
 *   {activeModal && (
 *     <InfoModal modalKey={activeModal} onClose={() => setActiveModal(null)} />
 *   )}
 *
 * Or pass raw content directly (for one-off modals):
 *   <InfoModal content={{ title, icon, color, body }} onClose={...} />
 */

import { useEffect } from 'react'
import { X } from 'lucide-react'
import MODAL_CONTENT from './modalContents'

export default function InfoModal({ modalKey, content: contentProp, onClose }) {
  const content = contentProp || (modalKey ? MODAL_CONTENT[modalKey] : null)

  // Escape key + lock body scroll
  useEffect(() => {
    if (!content) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose, content])

  if (!content) return null
  const Icon = content.icon

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Dialog */}
      <div
        className="relative w-full max-w-lg max-h-[85vh] rounded-2xl border border-white/[0.08] bg-slate-900 shadow-2xl shadow-black/50 flex flex-col animate-[footerModalIn_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center ${content.color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <h3 className="text-lg font-bold text-white">{content.title}</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-white/[0.06] flex items-center justify-center text-slate-500 hover:text-white transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1 custom-scrollbar">
          {content.body}
        </div>
      </div>
    </div>
  )
}
