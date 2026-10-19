import type { AdminCell, AdminOverview } from '../../shared/types/analyticsV2'
import { MultiLineChart } from './LevelChart'
import { Chip, ErrorBox, Loading, Notice, Panel } from './ui'
import { C, SERIES } from './tokens'
import { useV2, type V2Params } from './v2api'

const deltaText = (d: number): string => (d > 0 ? `+${d}` : `${d}`)

function CellView({ cell }: { cell: AdminCell }) {
  if (cell.status === 'hidden') {
    return <span title="פחות מ-5 תלמידים — הנתון מוסתר כדי לשמור על פרטיות" style={{ color: C.faint, fontSize: 12 }}>🔒 מוסתר (פחות מ-5 תלמידים)</span>
  }
  const arrow = cell.trendDelta > 0.05 ? '▲' : cell.trendDelta < -0.05 ? '▼' : '●'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontWeight: 800, color: C.accentBright, fontSize: 16 }}>{cell.avgLevel}</span>
      <span style={{ fontSize: 11.5, color: C.muted }}>מול הרצועה: {deltaText(cell.deltaVsNorm)}</span>
      <span style={{ fontSize: 11.5, color: C.muted }}><span aria-hidden>{arrow}</span> מגמה {deltaText(cell.trendDelta)} · {cell.studentCount} תלמידים</span>
    </div>
  )
}

/* עדשת מנהל: אגרגטים בלבד. אין שמות תלמידים, אין מזהים, אין דירוג או השוואה בין מורים. */
export default function AdminView({ params }: { params: V2Params }) {
  const { data, loading, error } = useV2<AdminOverview>('/admin/overview', params)
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox message={error} />
  if (!data) return null
  const subjects = [...new Map(data.cells.map((c) => [c.subject.code, c.subject])).values()]
  const cellOf = (grade: number, code: string): AdminCell | undefined => data.cells.find((c) => c.grade === grade && c.subject.code === code)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 22, color: C.text }}>{data.school.name}</h2>
        {data.grades.map((g) => <Chip key={g.grade} tone="accent">שכבה {g.gradeLabel}: {g.classCount} כיתות · {g.studentCount} תלמידים</Chip>)}
      </div>
      <Notice tone="accent">תצוגת הנהלה: תמונות רחבות, מגמות והשוואות בלבד. אין כאן שמות או נתונים של תלמידים בודדים; תא עם פחות מ-5 תלמידים מוסתר. אין דירוג או השוואה בין מורים.</Notice>
      <Notice>{data.caveats.ageNorm}</Notice>

      <Panel title="שכבות ומקצועות — רמה ממוצעת">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: C.textSoft }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'start', padding: '6px 8px', color: C.muted, fontSize: 11.5, borderBottom: `1px solid ${C.border}` }}>מקצוע</th>
                {data.grades.map((g) => <th key={g.grade} style={{ textAlign: 'start', padding: '6px 8px', color: C.muted, fontSize: 11.5, borderBottom: `1px solid ${C.border}` }}>שכבה {g.gradeLabel}</th>)}
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <tr key={s.code}>
                  <th scope="row" style={{ textAlign: 'start', padding: '10px 8px', fontWeight: 700, color: C.text, borderBottom: `1px solid ${C.border}` }}>{s.nameHe}</th>
                  {data.grades.map((g) => {
                    const c = cellOf(g.grade, s.code)
                    return <td key={g.grade} style={{ padding: '10px 8px', borderBottom: `1px solid ${C.border}`, verticalAlign: 'top' }}>{c ? <CellView cell={c} /> : <span style={{ color: C.faint }}>—</span>}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.hiddenCells > 0 && <div style={{ marginTop: 8, fontSize: 11.5, color: C.muted }}>{data.hiddenCells} תאים מוסתרים בשל גודל קבוצה קטן.</div>}
      </Panel>

      <Panel title="התקדמות לאורך השנה — לפי שכבה">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          {subjects.map((s) => {
            const lines = data.progress.filter((p) => p.subject.code === s.code && p.series.length > 0).map((p) => ({
              name: `שכבה ${data.grades.find((g) => g.grade === p.grade)?.gradeLabel ?? p.grade}`,
              points: p.series.map((x) => ({ date: x.date, v: x.avgLevel })),
            }))
            if (!lines.length) return null
            return (
              <figure key={s.code} style={{ margin: 0 }}>
                <figcaption style={{ fontSize: 12.5, fontWeight: 700, color: C.textSoft, marginBottom: 4 }}>{s.nameHe}</figcaption>
                <MultiLineChart lines={lines} label={`התקדמות ממוצעת ב${s.nameHe} לפי שכבה`} />
                <div style={{ display: 'flex', gap: 10, fontSize: 11, color: C.muted, flexWrap: 'wrap' }}>
                  {lines.map((l, i) => (
                    <span key={l.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <svg width="22" height="6" aria-hidden><line x1="0" x2="22" y1="3" y2="3" strokeWidth="2.2" strokeDasharray={SERIES[i % SERIES.length].dash} style={{ stroke: SERIES[i % SERIES.length].color }} /></svg>{l.name}
                    </span>
                  ))}
                </div>
              </figure>
            )
          })}
        </div>
      </Panel>

      <Panel title="השוואת שכבות ביחס לרצועת הגיל">
        <Notice tone="accent" style={{ marginBottom: 10 }}>{data.caveats.crossSubject}</Notice>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
          {data.comparisons.map((c) => (
            <div key={c.subject.code} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 10 }}>
              <div style={{ fontWeight: 700, color: C.textSoft, marginBottom: 6, fontSize: 13 }}>{c.subject.nameHe}</div>
              {c.rows.map((r) => (
                <div key={r.grade} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: C.muted }}>
                  <span>שכבה {r.gradeLabel}</span>
                  <strong style={{ color: C.accentBright }}>{deltaText(r.deltaVsNorm)} רמות</strong>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="תפיסות שגויות מצטברות">
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.misconceptions.map((m) => (
            <li key={`${m.id}-${m.grade}`} style={{ display: 'grid', gridTemplateColumns: '56px 1fr', gap: 12, alignItems: 'start' }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: C.accentBright }}>{m.sharePct}%</span>
              <div>
                <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.7 }}>{m.text}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  <Chip>{m.subject.nameHe}</Chip>
                  <Chip>מתוך {m.studentsExposed} תלמידים</Chip>
                  {m.curriculumGoal && <Chip tone="accent" title="מיפוי לדוגמה — ללא קודים רשמיים">{m.curriculumGoal.title} · מיפוי לדוגמה</Chip>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}
