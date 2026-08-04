import { useEffect, useMemo, useState } from 'react'
import { apiJson } from '../../shared/lib/api'
import { glass, micro } from '../creator/studioStyles'
import AssignmentDashboard from './AssignmentDashboard'
import StudentDetail from './StudentDetail'
import { pct } from './format'
import { HoloSelect, layerOf } from './index'

/* פיין "סיכום שיעורים" — אנליטיקת ההדמיות (רשימה→AssignmentDashboard→drill-down תלמיד).
   כולל בידול "ההדמיות האחרות" למחנך (הרשאה B). עצמאי — מנהל את ה-drill-down הפנימי שלו. */
interface AssignmentRow {
  id: string; questId: string; classId: string; classGradeLabel: string; title: string
  subject: string | null
  dueDate: string | null; createdAt: string | null
  students: number; completed: number; completionRate: number; avgSuccessRate: number | null
  own: boolean; homeroom: boolean; teacherName: string | null
}

type SortKey = 'newest' | 'successAsc' | 'successDesc' | 'completionAsc'
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'חדש ביותר' },
  { key: 'successAsc', label: 'אחוז הצלחה: נמוך → גבוה' },
  { key: 'successDesc', label: 'אחוז הצלחה: גבוה → נמוך' },
  { key: 'completionAsc', label: 'אחוז השלמה: נמוך → גבוה' },
]
const SINCE: { key: string; label: string; days: number | null }[] = [
  { key: 'all', label: 'הכל', days: null },
  { key: 'week', label: 'שבוע אחרון', days: 7 },
  { key: 'month', label: 'חודש אחרון', days: 30 },
  { key: 'term', label: 'מחצית אחרונה', days: 180 },
]

export default function LessonsPane() {
  const [assignments, setAssignments] = useState<AssignmentRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [assignmentId, setAssignmentId] = useState<string | null>(null)
  const [studentId, setStudentId] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [layer, setLayer] = useState('')
  const [klass, setKlass] = useState('')
  const [subject, setSubject] = useState('')
  const [since, setSince] = useState('all')
  const [sinceCutoff, setSinceCutoff] = useState<number | null>(null)
  const [sort, setSort] = useState<SortKey>('newest')

  function pickSince(key: string) {
    const k = key || 'all'
    setSince(k)
    const days = SINCE.find((s) => s.key === k)?.days ?? null
    setSinceCutoff(days ? Date.now() - days * 864e5 : null)
  }

  useEffect(() => {
    apiJson<{ assignments: AssignmentRow[] }>('/api/analytics/assignments').then((b) => setAssignments(b.assignments)).catch((e: Error) => setError(e.message))
  }, [])

  /* "ד"ר הולו מציע" — מטלות בחלון ההיזכרות (5-14 יום) עם מושגים חלשים ובלי הדמיית-חזרה.
     best-effort: כשל שקט (ההצעה היא תוספת, לא ליבה). ניתן לסגור לסשן. */
  const [suggestions, setSuggestions] = useState<{ assignmentId: string; title: string; className: string; weakCount: number }[]>([])
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(() => sessionStorage.getItem('holo_review_sugg_dismissed') === '1')
  useEffect(() => {
    let cancelled = false
    apiJson<{ suggestions: typeof suggestions }>('/api/analytics/review-suggestions')
      .then((b) => { if (!cancelled) setSuggestions(b.suggestions ?? []) })
      .catch(() => { /* שקט */ })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const all = useMemo(() => assignments ?? [], [assignments])
  const layers = useMemo(() => [...new Set(all.map((a) => layerOf(a.classGradeLabel)))].filter(Boolean).sort((x, y) => x.localeCompare(y, 'he')), [all])
  const classOptions = useMemo(() => {
    const pool = layer ? all.filter((a) => layerOf(a.classGradeLabel) === layer) : all
    return [...new Set(pool.map((a) => a.classGradeLabel))].filter(Boolean).sort((x, y) => x.localeCompare(y, 'he'))
  }, [all, layer])
  const subjectOptions = useMemo(() => [...new Set(all.map((a) => a.subject).filter((s): s is string => !!s))].sort((x, y) => x.localeCompare(y, 'he')), [all])

  const dirty = !!(query.trim() || layer || klass || subject || since !== 'all' || sort !== 'newest')
  const clearAll = () => { setQuery(''); setLayer(''); setKlass(''); setSubject(''); setSince('all'); setSinceCutoff(null); setSort('newest') }

  const filtered = useMemo(() => {
    const cutoff = sinceCutoff
    const q = query.trim().toLowerCase()
    const out = all.filter((a) => {
      if (q && !a.title.toLowerCase().includes(q)) return false
      if (layer && layerOf(a.classGradeLabel) !== layer) return false
      if (klass && a.classGradeLabel !== klass) return false
      if (subject && a.subject !== subject) return false
      if (cutoff && a.createdAt && new Date(a.createdAt).getTime() < cutoff) return false
      return true
    })
    const nullLast = (r: number | null) => (r === null ? Infinity : r)
    out.sort((a, b) => {
      switch (sort) {
        case 'successAsc': return nullLast(a.avgSuccessRate) - nullLast(b.avgSuccessRate)
        case 'successDesc': return nullLast(b.avgSuccessRate) - nullLast(a.avgSuccessRate)
        case 'completionAsc': return a.completionRate - b.completionRate
        default: return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
      }
    })
    return out
  }, [all, query, layer, klass, subject, sinceCutoff, sort])

  if (studentId) return <StudentDetail studentId={studentId} onBack={() => setStudentId(null)} backLabel="השיעור" />
  if (assignmentId) return <AssignmentDashboard assignmentId={assignmentId} onBack={() => setAssignmentId(null)} onStudent={setStudentId} />

  return (
    <>
      {error && <p style={{ color: 'var(--t18)', fontSize: 14 }}>⚠️ {error}</p>}
      <div style={{ ...micro, fontSize: 9, color: 'var(--t28)', flex: '0 0 auto' }}>📚 סיכום שיעורים</div>

      {/* ד"ר הולו מציע — הדמיות חזרה למטלות בחלון ההיזכרות */}
      {suggestions.length > 0 && !suggestionsDismissed && (
        <div style={{ ...glass, padding: '12px 16px', borderColor: 'var(--t29)', flex: '0 0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ ...micro, fontSize: 9, color: 'var(--t16)' }}>🔄 ד"ר הולו מציע</div>
            <button onClick={() => { setSuggestionsDismissed(true); sessionStorage.setItem('holo_review_sugg_dismissed', '1') }}
              style={{ background: 'none', border: 'none', color: 'var(--t30)', cursor: 'pointer', fontSize: 13 }} title="סגור">✕</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 8 }}>
            {suggestions.map((s) => (
              <div key={s.assignmentId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: 'var(--t12)' }}>
                  ב"<b>{s.title}</b>" (כיתה {s.className}) נותרו <b style={{ color: 'var(--t4)' }}>{s.weakCount}</b> מושגים חלשים — זה הזמן להדמיית חזרה.
                </span>
                <button onClick={() => setAssignmentId(s.assignmentId)}
                  style={{ padding: '5px 13px', borderRadius: 9, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: 'var(--t31)', background: 'var(--t32)', border: '1px solid var(--t29)', whiteSpace: 'nowrap' }}>
                  פתח ←
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* שורת סינון */}
      <div style={{ ...glass, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: '0 0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--t25)', border: '1px solid var(--t33)', borderRadius: 10, padding: '7px 14px', flex: '1 1 160px', minWidth: 140 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ stroke: 'var(--t1)' }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש שיעור…" style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--t68)', fontSize: 13, fontFamily: 'var(--font-display)' }} />
        </div>
        <HoloSelect value={layer} onChange={(v) => { setLayer(v); setKlass('') }} options={layers.map((l) => ({ v: l, label: 'שכבה ' + l }))} placeholder="שכבה" />
        <HoloSelect value={klass} onChange={setKlass} options={classOptions.map((c) => ({ v: c, label: 'כיתה ' + c }))} placeholder="כיתה" />
        {subjectOptions.length > 0 && <HoloSelect value={subject} onChange={setSubject} options={subjectOptions.map((sub) => ({ v: sub, label: sub }))} placeholder="מקצוע" />}
        <HoloSelect value={since === 'all' ? '' : since} onChange={pickSince} options={SINCE.filter((s) => s.key !== 'all').map((s) => ({ v: s.key, label: s.label }))} placeholder="ממתי" />
        <HoloSelect value={sort === 'newest' ? '' : sort} onChange={(v) => setSort((v || 'newest') as SortKey)} options={SORTS.filter((s) => s.key !== 'newest').map((s) => ({ v: s.key, label: s.label }))} placeholder="מיון" />
        {dirty && <button onClick={clearAll} style={{ fontSize: 12, fontWeight: 600, color: 'var(--t34)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid var(--t35)', whiteSpace: 'nowrap' }}>נקה</button>}
        <div style={{ ...micro, fontSize: 9.5, color: 'var(--t36)', marginRight: 'auto' }}>{filtered.length} שיעורים</div>
      </div>

      {/* רשימת השיעורים */}
      <div style={{ ...glass, padding: 16, display: 'flex', flexDirection: 'column', flex: '0 0 auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!assignments && !error && <p style={{ ...micro, color: 'var(--t22)', textAlign: 'center', padding: 28 }}>טוען…</p>}
          {assignments && filtered.length === 0 && <p style={{ ...micro, color: 'var(--t37)', textAlign: 'center', padding: 28, fontSize: 11 }}>{all.length === 0 ? 'אין עדיין שיעורים מוקצים.' : 'אין שיעורים התואמים לסינון.'}</p>}
          {filtered.map((a) => {
            const sr = a.avgSuccessRate
            const srColor = sr === null ? 'var(--t6)' : sr < 0.6 ? 'var(--t5)' : sr < 0.85 ? 'var(--t4)' : 'var(--t3)'
            const hr = a.homeroom
            const baseBorder = hr ? '1px dashed var(--t38)' : '1px solid var(--t26)'
            return (
              <button key={a.id} onClick={() => setAssignmentId(a.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderRadius: 14, cursor: 'pointer', textAlign: 'right', background: 'var(--t25)', border: baseBorder, borderRight: hr ? '3px solid var(--t39)' : baseBorder, transition: 'all .15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--t40)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--t25)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {hr && <span title="הוקצה לכיתת-החינוך שלך ע״י מורה אחר" style={{ fontSize: 14, flexShrink: 0 }}>🎓</span>}
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t68)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title || '(ללא שם)'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t19)', padding: '3px 9px', borderRadius: 20, background: 'var(--t20)', border: '1px solid var(--t41)' }}>כיתה {a.classGradeLabel}</span>
                    {hr && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t4)', padding: '3px 9px', borderRadius: 20, background: 'var(--t42)', border: '1px solid var(--t43)' }}>כיתתי{a.subject ? ` · ${a.subject}` : ''}{a.teacherName ? ` · ${a.teacherName}` : ''}</span>}
                    <span style={{ fontSize: 12, color: 'var(--t6)' }}>{a.completed}/{a.students} השלימו</span>
                    {a.createdAt && <span style={{ fontSize: 11.5, color: 'var(--t44)' }}>· {new Date(a.createdAt).toLocaleDateString('he-IL')}</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'center', flexShrink: 0, width: 66 }}>
                  <div style={{ fontSize: 19, fontWeight: 800, color: srColor }}>{pct(sr)}</div>
                  <div style={{ ...micro, fontSize: 8 }}>הצלחה</div>
                </div>
                <div style={{ textAlign: 'center', flexShrink: 0, width: 66 }}>
                  <div style={{ fontSize: 19, fontWeight: 800, color: a.completionRate >= 0.85 ? 'var(--t3)' : 'var(--t1)' }}>{pct(a.completionRate)}</div>
                  <div style={{ ...micro, fontSize: 8 }}>השלמה</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
