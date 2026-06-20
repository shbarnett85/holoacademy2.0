interface Props {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/* מודאל אישור הולוגרפי — לפני פעולות השבתה */
export default function ConfirmModal({ title, message, confirmLabel = 'אישור', danger, onConfirm, onCancel }: Props) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ background: 'rgba(5,5,18,0.7)', backdropFilter: 'blur(4px)', zIndex: 80 }}
      onClick={onCancel}
    >
      <div className="holo-panel max-w-sm w-full text-center" style={{ boxShadow: 'var(--holo-glow)' }} onClick={(e) => e.stopPropagation()}>
        <h3 className="holo-text-glow text-lg font-bold">{title}</h3>
        <p className="mt-3 text-sm" style={{ opacity: 0.85 }}>{message}</p>
        <div className="flex gap-3 justify-center mt-5">
          <button
            className="holo-button"
            style={danger ? { background: 'linear-gradient(135deg, #a33, #722)' } : {}}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
          <button
            className="holo-button"
            style={{ background: 'transparent', border: '1px solid rgba(0,246,255,0.35)' }}
            onClick={onCancel}
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}
