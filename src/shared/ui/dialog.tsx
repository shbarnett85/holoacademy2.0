import { useEffect, useState } from 'react'
import { useEscToClose } from './useModalA11y'

/* דיאלוג אישור/הודעה בשפת העיצוב ההולוגרפית — תחליף ל-window.confirm/alert
   הנייטיביים (ששוברים את השפה ואינם RTL). מבוסס Promise: הקורא await-י את
   הבחירה. Host יחיד (<HoloDialogHost/>) יושב ב-App ומאזין לבקשות. */

interface DialogRequest {
  kind: 'confirm' | 'alert'
  message: string
  confirmLabel: string
  cancelLabel: string
  resolve: (ok: boolean) => void
}

let pushRequest: ((req: DialogRequest) => void) | null = null

/* תחליף ל-window.confirm — מחזיר true אם המשתמש אישר */
export function holoConfirm(message: string, confirmLabel = 'אישור', cancelLabel = 'ביטול'): Promise<boolean> {
  return new Promise((resolve) => {
    if (!pushRequest) { resolve(window.confirm(message)); return } /* fallback אם ה-Host לא רונדר */
    pushRequest({ kind: 'confirm', message, confirmLabel, cancelLabel, resolve })
  })
}

/* תחליף ל-window.alert */
export function holoAlert(message: string, confirmLabel = 'הבנתי'): Promise<void> {
  return new Promise((resolve) => {
    if (!pushRequest) { window.alert(message); resolve(); return }
    pushRequest({ kind: 'alert', message, confirmLabel, cancelLabel: '', resolve: () => resolve() })
  })
}

export function HoloDialogHost() {
  const [req, setReq] = useState<DialogRequest | null>(null)

  useEffect(() => {
    pushRequest = (r) => setReq(r)
    return () => { pushRequest = null }
  }, [])

  function answer(ok: boolean) {
    req?.resolve(ok)
    setReq(null)
  }

  useEscToClose(() => answer(false), !!req)

  if (!req) return null
  return (
    <div
      dir="rtl"
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ background: 'rgba(5,5,18,0.75)', backdropFilter: 'blur(4px)', zIndex: 200 }}
      onClick={() => answer(false)}
      role="alertdialog"
      aria-modal="true"
      aria-label={req.kind === 'confirm' ? 'אישור פעולה' : 'הודעה'}
    >
      <div
        className="holo-panel w-full"
        style={{ maxWidth: '26rem', boxShadow: 'var(--holo-glow)', borderColor: 'rgba(47,243,255,.45)', fontFamily: 'var(--font-display)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.6, color: 'var(--holo-text)', whiteSpace: 'pre-line' }}>{req.message}</p>
        <div className="flex gap-3 justify-start" style={{ marginTop: 18 }}>
          <button className="holo-button" autoFocus onClick={() => answer(true)}>
            {req.confirmLabel}
          </button>
          {req.kind === 'confirm' && (
            <button
              onClick={() => answer(false)}
              style={{ background: 'rgba(47,243,255,.06)', border: '1px solid rgba(47,243,255,.3)', color: 'var(--holo-text)', borderRadius: 10, padding: '9px 20px', cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 14 }}
            >
              {req.cancelLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
