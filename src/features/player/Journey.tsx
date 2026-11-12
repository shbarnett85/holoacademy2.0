/* המסע: לכל מקצוע מסע משלו. התחנות הן השיעורים שהתלמיד/ה קיבל/ה במקצוע, לפי הסדר.
   מצבי תחנה: הושלם (עם הגבישים שנאספו), עכשיו, פתוח ("מחכה לכם"). בלי רמות קושי ובלי השוואה לאחרים.
   צבע המקצוע מופיע רק כנקודה קטנה ליד שם המקצוע (בטאב). ההתקדמות לאורך המסילה: מילוי כתום על מסילה עם קו דיו. */
import { useState } from 'react'
import { buildJourney, type JourneyLesson, type JourneyStation } from '../../shared/lib/gemModel'
import { subjectVisual, subjectName, UNCLASSIFIED_LABEL } from '../../shared/lib/subjects'
import { GemIcon } from '../../shared/ui/Gem'
import { panelStudent, progressFill, progressTrack } from '../../styles/ui'
import { JOURNEY_TEXT } from './gameFeel/text'

/* רוחב תחנה והרווח בין תחנות: המסילה נמתחת ממרכז התחנה הראשונה עד מרכז האחרונה */
const STATION_W = 104
const STATION_GAP = 4

function Station({ s, onOpen }: { s: JourneyStation; onOpen?: (id: string) => void }) {
  const done = s.state === 'done' || (s.state === 'now' && s.gems !== null)
  const label = s.state === 'now' ? JOURNEY_TEXT.now : s.state === 'open' ? JOURNEY_TEXT.open : JOURNEY_TEXT.done(s.gems ?? 0)
  const clickable = !!onOpen && s.state !== 'now'
  const body = (
    <>
      <span
        aria-hidden="true"
        style={{
          width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center', position: 'relative', zIndex: 1, boxSizing: 'border-box',
          /* עכשיו: רקע אפרסק וקו עבה. פתוח: קו מקווקו. הושלם: לבן עם הגביש */
          background: s.state === 'now' ? 'var(--color-human-soft)' : 'var(--color-surface)',
          border: s.state === 'open' ? '2px dashed var(--color-muted)' : `${s.state === 'now' ? 3 : 2}px solid var(--color-ink)`,
        }}
      >
        {done && <GemIcon size={18} />}
      </span>
      <span style={{ fontSize: 13, lineHeight: 1.25, textAlign: 'center', color: s.state === 'open' ? 'var(--color-muted)' : 'var(--color-ink)', textDecoration: clickable ? 'underline' : 'none', textUnderlineOffset: 3, overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.title}</span>
      <span style={{ fontSize: 12, color: s.state === 'open' ? 'var(--color-muted)' : 'var(--color-ink)', fontWeight: 600 }}>{label}</span>
      {s.classClosed && <span data-class-closed style={{ fontSize: 11, color: 'var(--color-human-deep)', textAlign: 'center', lineHeight: 1.2 }}>{JOURNEY_TEXT.classClosed}</span>}
    </>
  )
  const style = { flex: '0 0 auto', width: STATION_W, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 4, position: 'relative' as const, background: 'none', border: 'none', color: 'inherit', fontFamily: 'var(--font-display)', fontWeight: 400, textDecoration: 'none', padding: 0 }
  /* תחנה לחיצה היא ניווט לשיעור: קישור בדיו (holo-link), שם השיעור בקו תחתון */
  return clickable
    ? <button type="button" className="holo-link" data-station={s.state} style={{ ...style, cursor: 'pointer' }} onClick={() => onOpen?.(s.id)}>{body}</button>
    : <div data-station={s.state} style={style}>{body}</div>
}

function Path({ stations, onOpen }: { stations: JourneyStation[]; onOpen?: (id: string) => void }) {
  /* המילוי מגיע עד התחנה האחרונה שהושלמה או שנמצאים בה עכשיו */
  const reached = stations.reduce((last, s, i) => (s.state === 'open' ? last : i), 0)
  const share = stations.length > 1 ? (reached / (stations.length - 1)) * 100 : 0
  return (
    <div dir="rtl" style={{ overflowX: 'auto', paddingBottom: 4 }}>
      <div style={{ position: 'relative', display: 'inline-flex', gap: STATION_GAP, minWidth: '100%' }}>
        {stations.length > 1 && (
          <span aria-hidden="true" style={{ ...progressTrack, position: 'absolute', top: 10, insetInlineStart: STATION_W / 2, width: (stations.length - 1) * (STATION_W + STATION_GAP), height: 10, boxSizing: 'border-box' }}>
            <i style={{ ...progressFill, display: 'block', width: `${share}%` }} />
          </span>
        )}
        {stations.map((s) => <Station key={s.id} s={s} onOpen={onOpen} />)}
      </div>
    </div>
  )
}

/* במסך הסיום: המסע של המקצוע של השיעור הנוכחי */
export function SubjectJourney({ lessons, currentId, subjectCode }: { lessons: JourneyLesson[]; currentId: string; subjectCode: string | null }) {
  const subject = buildJourney(lessons, currentId).find((j) => j.subjectCode === subjectCode)
  if (!subject) return null
  return <Path stations={subject.stations} />
}

/* בעמוד הבית: "המסע שלי", עם טאב לכל מקצוע */
export function MyJourney({ lessons, onOpen }: { lessons: JourneyLesson[]; onOpen: (id: string) => void }) {
  const journey = buildJourney(lessons)
  const [active, setActive] = useState<string | null>(null)
  if (journey.length === 0) return null
  const current = journey.find((j) => (j.subjectCode ?? '') === active) ?? journey[0]
  return (
    <section aria-label={JOURNEY_TEXT.sectionTitle} data-my-journey style={{ ...panelStudent, borderRadius: 16, padding: '12px 16px', marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px 12px', flexWrap: 'wrap', marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800, color: 'var(--color-machine-deep)' }}>{JOURNEY_TEXT.sectionTitle}</h2>
        <div role="tablist" aria-label={JOURNEY_TEXT.sectionTitle} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {journey.map((j) => {
            const on = j === current
            return (
              <button
                key={j.subjectCode ?? 'none'}
                type="button"
                role="tab"
                aria-selected={on}
                className="holo-button holo-button--sm"
                onClick={() => setActive(j.subjectCode ?? '')}
                style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {/* צבע המקצוע: נקודה קטנה, תמיד ליד שם המקצוע */}
                <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', flex: '0 0 auto', boxSizing: 'border-box', background: subjectVisual(j.subjectCode).color, border: '1.5px solid currentColor' }} />
                {j.subjectCode ? subjectName(j.subjectCode) : UNCLASSIFIED_LABEL}
              </button>
            )
          })}
        </div>
      </div>
      <Path stations={current.stations} onOpen={onOpen} />
    </section>
  )
}
