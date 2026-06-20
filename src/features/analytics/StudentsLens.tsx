import { useEffect, useMemo, useState } from 'react'
import { apiJson } from '../../shared/lib/api'
import { glass, micro } from '../creator/studioStyles'
import { pct, FLAG_META } from './format'
import { HoloSelect, layerOf } from './index'

/* עדשת "תלמידים" — ממוקדת-תלמיד: רשימת פרופילים + כרטיס התקדמות פר-תלמיד
   + מקום לגרף ההשוואה (מבלוק מודל ההשוואה). הסקופ מגיע מהשרת (RLS/הרשאות), לא מהסתרת UI:
   מורה מקצועי מקבל רק תלמידי הקצאותיו; מחנך/מנהל — תמונה חוצת-מקצוע (crossSubject). */
interface StudentRow {
  studentId: string; name: string; className: string
  crossSubject: boolean
  textLevel: number | null
  sessionsCount: number
  avgSuccessRate: number | null
  lastActive: string | null
  flags: string[]
}

function rateColor(r: number | null) {
  if (r === null) return '#8aa0b8'
  return r < 0.6 ? '#ff7099' : r < 0.85 ? '#ffce5e' : '#5fffb0'
}

function dateStr(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
}

export default function StudentsLens({ onStudent }: { onStudent: (id: string) => void }) {
  const [students, setStudents] = useState<StudentRow[] | null>(null)
  const [canCompare, setCanCompare] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [layer, setLayer] = useState('')
  const [klass, setKlass] = useState('')

  useEffect(() => {
    apiJson<{ students: StudentRow[]; canCompare: boolean }>('/api/analytics/students')
      .then((b) => { setStudents(b.students); setCanCompare(b.canCompare) })
      .catch((e: Error) => setError(e.message))
  }, [])

  const all = useMemo(() => students ?? [], [students])
  const layers = useMemo(() => [...new Set(all.map((s) => layerOf(s.className)))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'he')), [all])
  const classOptions = useMemo(() => {
    const pool = layer ? all.filter((s) => layerOf(s.className) === layer) : all
    return [...new Set(pool.map((s) => s.className))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'he'))
  }, [all, layer])
  const dirty = !!(query.trim() || layer || klass)
  const clearAll = () => { setQuery(''); setLayer(''); setKlass('') }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter((s) => {
      if (q && !s.name.toLowerCase().includes(q)) return false
      if (layer && layerOf(s.className) !== layer) return false
      if (klass && s.className !== klass) return false
      return true
    })
  }, [all, query, layer, klass])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minHeight: 0 }}>
      {error && <p style={{ color: '#ff9bb3', fontSize: 14 }}>⚠️ {error}</p>}

      {/* שורת סינון */}
      <div style={{ ...glass, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: '0 0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(4,9,18,.5)', border: '1px solid rgba(47,243,255,.13)', borderRadius: 10, padding: '7px 14px', flex: '1 1 180px', minWidth: 150 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7ef6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש תלמיד…" style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--holo-text-bright)', fontSize: 13, fontFamily: 'var(--font-display)' }} />
        </div>
        <HoloSelect value={layer} onChange={(v) => { setLayer(v); setKlass('') }} options={layers.map((l) => ({ v: l, label: 'שכבה ' + l }))} placeholder="שכבה" />
        <HoloSelect value={klass} onChange={setKlass} options={classOptions.map((c) => ({ v: c, label: 'כיתה ' + c }))} placeholder="כיתה" />
        {dirty && <button onClick={clearAll} style={{ fontSize: 12, fontWeight: 600, color: '#ff8af0', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,69,230,.4)', whiteSpace: 'nowrap' }}>נקה סינון</button>}
        <div style={{ ...micro, fontSize: 9.5, color: 'rgba(47,243,255,.45)', marginRight: 'auto' }}>{filtered.length} תלמידים</div>
      </div>

      {/* מקום לגרף ההשוואה (מבלוק מודל ההשוואה) — רק בתמונה מלאה (מחנך/מנהל) */}
      {canCompare && (
        <div style={{ ...glass, padding: 20, flex: '0 0 auto', borderColor: 'rgba(120,200,255,.18)' }}>
          <div style={{ ...micro, fontSize: 9, marginBottom: 10 }}>◇ השוואת תלמידים (חוצת-מקצוע)</div>
          <p style={{ fontSize: 12.5, color: '#8aa0b8', margin: 0 }}>גרף ההשוואה ישולב כאן ממודל ההשוואה. בינתיים — לחצו על תלמיד לצפייה בכרטיס ההתקדמות המלא.</p>
        </div>
      )}

      {/* רשימת פרופילים + כרטיס התקדמות פר-תלמיד */}
      <div style={{ ...glass, padding: 18, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="cf-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0, overflowY: 'auto', paddingLeft: 6 }}>
          {!students && !error && <p style={{ ...micro, color: 'rgba(140,170,200,.6)', textAlign: 'center', padding: 28 }}>טוען…</p>}
          {students && filtered.length === 0 && (
            <p style={{ ...micro, color: 'rgba(140,170,200,.5)', textAlign: 'center', padding: 28, fontSize: 11 }}>
              {all.length === 0 ? 'אין עדיין תלמידים עם נתונים בכיתותיך.' : 'אין תלמידים התואמים לסינון.'}
            </p>
          )}
          {filtered.map((s) => {
            const rc = rateColor(s.avgSuccessRate)
            const bar = s.avgSuccessRate !== null ? Math.round(s.avgSuccessRate * 100) : 0
            return (
              <button key={s.studentId} onClick={() => onStudent(s.studentId)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderRadius: 14, cursor: 'pointer', textAlign: 'right', background: 'rgba(4,9,18,.5)', border: '1px solid rgba(120,200,255,.12)', transition: 'all .15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(47,243,255,.45)'; e.currentTarget.style.background = 'rgba(47,243,255,.06)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(120,200,255,.12)'; e.currentTarget.style.background = 'rgba(4,9,18,.5)' }}>
                {/* אווטאר */}
                <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(47,243,255,.18), rgba(255,69,230,.14))', border: '1px solid rgba(47,243,255,.3)', fontWeight: 800, color: '#cdeeff', fontSize: 15 }}>{s.name.charAt(0)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--holo-text-bright)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                    {s.flags.map((f) => FLAG_META[f] && <span key={f} title={FLAG_META[f].label} style={{ fontSize: 13 }}>{FLAG_META[f].icon}</span>)}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#bfe9ff', padding: '3px 9px', borderRadius: 20, background: 'rgba(47,243,255,.08)', border: '1px solid rgba(47,243,255,.25)' }}>כיתה {s.className}</span>
                    {s.crossSubject && s.textLevel !== null && <span style={{ fontSize: 11, color: '#9fb6cf' }}>רמת טקסט {s.textLevel}/16</span>}
                    <span style={{ fontSize: 11.5, color: '#6b7f99' }}>{s.sessionsCount} הדמיות · פעיל {dateStr(s.lastActive)}</span>
                  </div>
                  {/* כרטיס התקדמות — בר הצלחה */}
                  <div style={{ marginTop: 8, width: '100%', borderRadius: 999, overflow: 'hidden', height: 6, background: 'rgba(255,255,255,0.07)' }} dir="ltr">
                    <div style={{ width: `${bar}%`, height: '100%', background: rc, transition: 'width .4s ease' }} />
                  </div>
                </div>
                <div style={{ textAlign: 'center', flexShrink: 0, width: 70 }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: rc }}>{pct(s.avgSuccessRate)}</div>
                  <div style={{ ...micro, fontSize: 8 }}>הצלחה</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
