/**
 * Reusable info modal — thin wrapper over ModalShell (portal + escape +
 * scroll-lock live there).
 *
 * Usage:
 *   {activeModal && <InfoModal modalKey={activeModal} onClose={() => setActiveModal(null)} />}
 * Or pass raw content directly:
 *   <InfoModal content={{ title, icon, color, body }} onClose={...} />
 */
import MODAL_CONTENT from './modalContents'
import ModalShell from './ModalShell'

export default function InfoModal({ modalKey, content: contentProp, onClose }) {
  const content = contentProp || (modalKey ? MODAL_CONTENT[modalKey] : null)
  if (!content) return null

  return (
    <ModalShell title={content.title} icon={content.icon} iconColor={content.color} onClose={onClose}>
      {content.body}
    </ModalShell>
  )
}
