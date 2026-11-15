/* מדף הספרים של התלמיד ("הספרייה ההולוגרפית"): כל שיעור הוא כריכה שעומדת על מדף.
   · כריכה = תמונת השיעור, שם השיעור ופס בצבע המקצוע (שדרת הספר). הצבע לעולם לא לבד: שם המקצוע כתוב בתגית שעל התמונה.
   · מצבים: חדש · בקריאה, עם סימנייה "עמוד 3" · הושלם, עם הקריסטלים שהושגו. מועד ההגשה מוצג כשיש.
   · הכריכה כולה היא קישור בדיו עם קו מתאר (לא כפתור תכלת): לחיצה פותחת את השיעור.
   הסגנון ב-index.css (.book-case / .book-shelf / .book-cover); הטקסטים ב-gameFeel/text.ts (SHELF_TEXT). */
import { Link } from 'react-router-dom'
import { GEM_TOTAL } from '../../shared/lib/gemModel'
import { gemTier } from '../../shared/lib/gemTier'
import { formatIsraelDate } from '../../shared/lib/lessonState'
import { subjectTagColors, subjectVisual } from '../../shared/lib/subjects'
import { GemSocket } from '../../shared/ui/Gem'
import LessonThumb from '../../shared/ui/LessonThumb'
import SubjectTag from '../../shared/ui/SubjectTag'
import { infoChip } from '../../styles/ui'
import { SHELF_TEXT } from './gameFeel/text'

export interface ShelfBook {
  id: string
  title: string
  subjectCode?: string | null
  thumbUrl?: string | null
  dueAt?: string | null
  state?: 'active_now' | 'open' | 'ended'
  late?: boolean
  sessionStatus: 'completed' | 'in_progress' | null
  crystals: number | null
  gems?: number | null
  isReview?: boolean
  /* העמוד שבו נעצרה הקריאה (מהשרת). בלי ערך: "בקריאה" בלי מספר עמוד */
  bookmarkPage?: number | null
}

/* הגבישים של המשחק הטוב ביותר */
function GemRow({ gems }: { gems: number }) {
  return (
    <span dir="ltr" role="img" aria-label={SHELF_TEXT.gems(gems)} className="book-gems">
      {Array.from({ length: GEM_TOTAL }).map((_, i) => <GemSocket key={i} fill={i < gems ? 1 : 0} size={19} tier={gemTier(gems)} />)}
    </span>
  )
}

/* הסימנייה: סרט כתום (התקדמות) שיוצא מראש הכריכה. הצורה ב-SVG, כדי שקו הדיו ימשיך גם לאורך החיתוך שבתחתית */
function Bookmark({ page }: { page: number | null }) {
  return (
    <span className="book-mark" data-bookmark={page ?? ''} aria-hidden="true">
      <svg viewBox="0 0 40 60" preserveAspectRatio="none" focusable="false">
        <path d="M1.5 1.5 H38.5 V58 L20 47 L1.5 58 Z" style={{ fill: 'var(--color-human)', stroke: 'var(--color-ink)', strokeWidth: 3, strokeLinejoin: 'round', vectorEffect: 'non-scaling-stroke' }} />
      </svg>
      {page ? <b>{SHELF_TEXT.bookmark(page)}</b> : null}
    </span>
  )
}

const TAG = { ...infoChip, borderRadius: 7, padding: '1px 8px', fontWeight: 800, lineHeight: 1.35, whiteSpace: 'nowrap' as const }

function BookCover({ q, fresh }: { q: ShelfBook; fresh: boolean }) {
  const done = q.sessionStatus === 'completed'
  const reading = q.sessionStatus === 'in_progress'
  const gems = q.gems ?? q.crystals ?? 0
  const page = reading ? (q.bookmarkPage ?? null) : null
  /* "להגשה עד [תאריך]" רק לשיעור שעוד לא הושלם; אחרי המועד: "המועד עבר" (השיעור לא ננעל) */
  const due = q.dueAt && !done ? (q.state === 'ended' ? SHELF_TEXT.duePassed(formatIsraelDate(q.dueAt)) : SHELF_TEXT.dueBy(formatIsraelDate(q.dueAt))) : null
  const stateText = done ? (q.late ? SHELF_TEXT.doneLate : SHELF_TEXT.done) : reading ? (page ? SHELF_TEXT.readingAt(page) : SHELF_TEXT.reading) : SHELF_TEXT.fresh
  const label = [q.title, subjectTagColors(q.subjectCode).label, done ? `${stateText}, ${SHELF_TEXT.gems(gems)}` : stateText, due].filter(Boolean).join('. ')

  return (
    <li className="book-cell">
      <Link to={`/play/${q.id}`} className="book-cover" data-book-cover={q.id} data-book-state={done ? 'done' : reading ? 'reading' : 'new'} aria-label={label}
        style={{ borderStyle: subjectVisual(q.subjectCode).code === 'unclassified' ? 'dashed' : 'solid' }}>
        {reading && <Bookmark page={page} />}
        <span className="book-cover__inner">
          {/* שדרת הספר: פס בצבע המקצוע */}
          <span className="book-spine" data-subject-stripe aria-hidden="true" style={{ background: subjectVisual(q.subjectCode).color }} />
          <span className="book-img">
            <LessonThumb url={q.thumbUrl} subjectCode={q.subjectCode} mode="dark" width="100%" height="100%" radius={0} frame={0} tag="none" alt="">
              {({ hasImage }) => (
                <>
                  {/* תגית המקצוע בתחתית התמונה: ראש הכריכה נשאר פנוי לסימנייה */}
                  {hasImage && <span className="book-tags"><SubjectTag code={q.subjectCode} mode="dark" size="sm" /></span>}
                  {q.isReview && <span className="book-tags book-tags--top"><span style={{ ...TAG, fontSize: 12 }}>{SHELF_TEXT.review}</span></span>}
                </>
              )}
            </LessonThumb>
          </span>
          <span className="book-body">
            <span className="book-title" data-lesson-title title={q.title}>{q.title}</span>
            <span className="book-foot">
              {done
                ? <><span className="book-line">{stateText}</span><GemRow gems={gems} /></>
                : <>
                    {due && <span className="book-line" data-book-due style={{ color: q.state === 'ended' ? 'var(--color-human-deep)' : undefined }}>{due}</span>}
                    <span data-book-tag style={{ ...TAG, alignSelf: 'flex-start', fontSize: 12.5 }}>{reading ? SHELF_TEXT.reading : fresh ? SHELF_TEXT.freshMark : SHELF_TEXT.fresh}</span>
                  </>}
            </span>
          </span>
        </span>
      </Link>
    </li>
  )
}

export default function BookShelf({ books, freshIds }: { books: ShelfBook[]; freshIds: ReadonlySet<string> }) {
  return (
    <div className="book-case" data-book-shelf>
      <ul className="book-shelf">
        {books.map((q) => <BookCover key={q.id} q={q} fresh={freshIds.has(q.id)} />)}
      </ul>
    </div>
  )
}
