import { useCallback, useEffect, useState } from 'react'
import { apiJson } from '../../shared/lib/api'
import ConfirmModal from '../superadmin/ConfirmModal'
import type { ClassRow } from './index'

/* ── נתוני דוגמה (ארגון הדגמה בלבד) ───────────────────────────────────────────
   הפאנל מופיע רק כשהשרת מדווח enabled:true לארגון. כל הפעולות רצות בשרת
   (נקודות /api/staff/demo) — הממשק רק מפעיל אותן ומציג את המצב. התוצאות נכתבות
   לאותן טבלאות כמו משחק אמיתי, לכן האנליטיקה מציגה אותן בלי שום נתיב מיוחד. */

interface Status { enabled: boolean; classes?: number; students?: number; readyQuests?: number }

const btn: React.CSSProperties = {
  border: '1px solid var(--t299)', background: 'transparent', color: 'var(--t301)',
  borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
}

export default function DemoDataPanel({ classes, onChanged }: { classes: ClassRow[]; onChanged: () => void }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const demoClasses = classes.filter((c) => c.is_fictitious)
  const [targetClass, setTargetClass] = useState('')

  const refresh = useCallback(() => {
    apiJson<Status>('/api/staff/demo/status').then(setStatus).catch(() => setStatus({ enabled: false }))
  }, [])
  useEffect(refresh, [refresh, classes.length])
  useEffect(() => {
    if (!demoClasses.some((c) => c.id === targetClass)) setTargetClass(demoClasses[0]?.id ?? '')
  }, [demoClasses, targetClass])

  async function run(key: string, path: string, init: RequestInit, done: (b: Record<string, number>) => string) {
    if (busy) return
    setBusy(key); setErr(null); setMsg(null)
    try {
      const b = await apiJson<Record<string, number>>(path, init)
      setMsg(done(b))
      refresh(); onChanged()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'הפעולה נכשלה')
    } finally {
      setBusy(null)
    }
  }

  if (!status?.enabled) return null
  const post = (body?: unknown): RequestInit => ({ method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
  const results = (b: Record<string, unknown>) => {
    const r = (b.results ?? b) as { created?: number; skipped?: number }
    return `נוצרו ${r.created ?? 0} תוצאות חדשות${r.skipped ? ` · ${r.skipped} כבר היו קיימות` : ''}`
  }

  return (
    <section className="holo-panel w-full" style={{ padding: '14px 16px' }} aria-label="נתוני דוגמה">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-bold">🧪 נתוני דוגמה</h2>
        <span className="text-xs" style={{ opacity: 0.65 }}>
          {status.classes ?? 0} כיתות · {status.students ?? 0} תלמידים לדוגמה · {status.readyQuests ?? 0} שיעורים מוכנים
        </span>
      </div>
      <p className="text-xs mt-1" style={{ opacity: 0.6 }}>
        תלמידים פיקטיביים עם תוצאות מוכנות על השיעורים שלך, כדי לראות את האנליטיקה מלאה. מסומנים &quot;תלמיד לדוגמה&quot; ואינם נספרים בשום מקום אחר.
      </p>

      <div className="flex gap-2 flex-wrap mt-3 items-center">
        <button style={{ ...btn, opacity: busy ? 0.5 : 1 }} disabled={!!busy}
          onClick={() => run('class', '/api/staff/demo/class', post({}), (b) => `נוצרה כיתת דוגמה עם ${b.students ?? 12} תלמידים · ${results(b)}`)}>
          {busy === 'class' ? 'יוצר…' : '+ צור כיתה לדוגמה'}
        </button>

        <span className="flex gap-1 items-center">
          <select value={targetClass} onChange={(e) => setTargetClass(e.target.value)} disabled={demoClasses.length === 0}
            style={{ background: 'var(--t253)', border: '1px solid var(--t219)', borderRadius: 8, color: 'var(--t301)', padding: '5px 8px', fontSize: 12 }}>
            {demoClasses.length === 0 && <option value="">אין כיתת דוגמה</option>}
            {demoClasses.map((c) => <option key={c.id} value={c.id}>{c.gradeLabel}</option>)}
          </select>
          <button style={{ ...btn, opacity: busy || !targetClass ? 0.5 : 1 }} disabled={!!busy || !targetClass}
            onClick={() => run('students', '/api/staff/demo/students', post({ classId: targetClass, count: 1 }), (b) => `נוסף תלמיד לדוגמה · ${results(b)}`)}>
            {busy === 'students' ? 'מוסיף…' : '+ הוסף תלמיד לדוגמה'}
          </button>
        </span>

        <button style={{ ...btn, opacity: busy ? 0.5 : 1 }} disabled={!!busy}
          onClick={() => run('refresh', '/api/staff/demo/refresh', post(), (b) => `רוענן · ${results(b)}`)}>
          {busy === 'refresh' ? 'מרענן…' : '↻ רענן נתוני דוגמה'}
        </button>

        <button style={{ ...btn, color: 'var(--t18)', borderColor: 'var(--t298)', opacity: busy || !(status.students ?? 0) ? 0.5 : 1 }}
          disabled={!!busy || !(status.students ?? 0)} onClick={() => setConfirmDelete(true)}>
          🗑 מחק נתוני דוגמה
        </button>
      </div>

      {msg && <p className="text-sm mt-2" style={{ color: 'var(--t3)' }}>✓ {msg}</p>}
      {err && <p className="text-sm mt-2" style={{ color: 'var(--t18)' }}>⚠️ {err}</p>}

      {confirmDelete && (
        <ConfirmModal
          title="מחיקת נתוני דוגמה"
          message="יימחקו כיתות ותלמידי הדוגמה והתוצאות שלהם בלבד. תלמידים, כיתות ושיעורים אמיתיים לא ייגעו."
          confirmLabel="מחק" danger
          onConfirm={() => {
            setConfirmDelete(false)
            run('delete', '/api/staff/demo/data', { method: 'DELETE' }, (b) => `נמחקו ${b.classes ?? 0} כיתות, ${b.students ?? 0} תלמידים ו-${b.sessions ?? 0} משחקים לדוגמה`)
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </section>
  )
}
