/* המסע: לכל מקצוע מסע משלו, בצבע המקצוע. התחנות הן השיעורים שהתלמיד/ה קיבל/ה במקצוע, לפי הסדר.
   מצבי תחנה: הושלם (עם הגבישים שנאספו), עכשיו, פתוח ("מחכה לכם"). בלי רמות קושי ובלי השוואה לאחרים. */
import { useState } from 'react'
import { buildJourney, type JourneyLesson, type JourneyStation } from '../../shared/lib/gemModel'
import { subjectVisual, subjectName, UNCLASSIFIED_LABEL } from '../../shared/lib/subjects'
import { GemIcon } from '../../shared/ui/Gem'
import { JOURNEY_TEXT } from './gameFeel/text'

const SURFACE = '#0F1B30'
const LINE_SOFT = '#1B2D4B'

function Station({ s, color, onOpen }: { s: JourneyStation; color: string; onOpen?: (id: string) => void }) {
  const done = s.state === 'done' || (s.state === 'now' && s.gems !== null)
  const label = s.state === 'now' ? JOURNEY_TEXT.now : s.state === 'open' ? JOURNEY_TEXT.open : JOURNEY_TEXT.done(s.gems ?? 0)
  const body = (
    <>
      <span
        aria-hidden="true"
        style={{
          width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center', position: 'relative', zIndex: 1, background: '#0A1322',
          border: `2px ${s.state === 'open' ? 'dashed' : 'solid'} ${s.state === 'open' ? LINE_SOFT : color}`,
          boxShadow: s.state === 'now' ? `0 0 0 4px color-mix(in srgb, ${color} 24%, transparent)` : 'none',
        }}
      >
        {done && <GemIcon size={18} />}
      </span>
      <span style={{ fontSize: 13, lineHeight: 1.25, textAlign: 'center', color: s.state === 'open' ? '#9DB0CD' : '#EAF2FF', overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.title}</span>
      <span style={{ fontSize: 12, color: s.state === 'open' ? '#9DB0CD' : '#BFEAFA', fontWeight: 600 }}>{label}</span>
      {s.classClosed && <span data-class-closed style={{ fontSize: 11, color: '#F3B76A', textAlign: 'center', lineHeight: 1.2 }}>{JOURNEY_TEXT.classClosed}</span>}
    </>
  )
  const style = { flex: '0 0 auto', width: 104, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 4, position: 'relative' as const, background: 'none', border: 'none', color: 'inherit', fontFamily: 'var(--font-display)', padding: 0 }
  return onOpen && s.state !== 'now'
    ? <button type="button" data-station={s.state} style={{ ...style, cursor: 'pointer' }} onClick={() => onOpen(s.id)}>{body}</button>
    : <div data-station={s.state} style={style}>{body}</div>
}

function Path({ stations, color, onOpen }: { stations: JourneyStation[]; color: string; onOpen?: (id: string) => void }) {
  return (
    <div dir="rtl" style={{ overflowX: 'auto', paddingBottom: 4 }}>
      <div style={{ position: 'relative', display: 'inline-flex', gap: 4, minWidth: '100%' }}>
        <span aria-hidden="true" style={{ position: 'absolute', top: 14, insetInline: 50, height: 2, background: color, opacity: 0.45 }} />
        {stations.map((s) => <Station key={s.id} s={s} color={color} onOpen={onOpen} />)}
      </div>
    </div>
  )
}

/* במסך הסיום: המסע של המקצוע של השיעור הנוכחי */
export function SubjectJourney({ lessons, currentId, subjectCode }: { lessons: JourneyLesson[]; currentId: string; subjectCode: string | null }) {
  const subject = buildJourney(lessons, currentId).find((j) => j.subjectCode === subjectCode)
  if (!subject) return null
  return <Path stations={subject.stations} color={subjectVisual(subjectCode, 'dark').color} />
}

/* בעמוד הבית: "המסע שלי", עם טאב לכל מקצוע */
export function MyJourney({ lessons, onOpen }: { lessons: JourneyLesson[]; onOpen: (id: string) => void }) {
  const journey = buildJourney(lessons)
  const [active, setActive] = useState<string | null>(null)
  if (journey.length === 0) return null
  const current = journey.find((j) => (j.subjectCode ?? '') === active) ?? journey[0]
  const color = subjectVisual(current.subjectCode, 'dark').color
  return (
    <section aria-label={JOURNEY_TEXT.sectionTitle} data-my-journey style={{ background: SURFACE, border: '1px solid #26406A', borderRadius: 14, padding: '12px 16px', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px 12px', flexWrap: 'wrap', marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800, color: '#EAF2FF' }}>{JOURNEY_TEXT.sectionTitle}</h2>
        <div role="tablist" aria-label={JOURNEY_TEXT.sectionTitle} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {journey.map((j) => {
            const on = j === current
            const c = subjectVisual(j.subjectCode, 'dark').color
            return (
              <button
                key={j.subjectCode ?? 'none'}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setActive(j.subjectCode ?? '')}
                style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 999, cursor: 'pointer', color: on ? '#EAF2FF' : '#9DB0CD', background: on ? `color-mix(in srgb, ${c} 22%, transparent)` : 'transparent', border: `1.5px solid ${on ? c : LINE_SOFT}` }}
              >
                {j.subjectCode ? subjectName(j.subjectCode) : UNCLASSIFIED_LABEL}
              </button>
            )
          })}
        </div>
      </div>
      <Path stations={current.stations} color={color} onOpen={onOpen} />
    </section>
  )
}
