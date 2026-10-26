import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { LIBRARY_ASSIGN_TEXT } from '../../shared/lib/findingsNarrative'
import { SUBJECTS, SUBJECT_VISUAL } from '../../shared/lib/subjects'

vi.mock('./StudioTopBar', () => ({ default: () => null }))

import { MineToolbar, PublicCard, QuestCard, SubjectAssign } from './Library'

/* זרימת שיוך המקצוע בספרייה: רכיבים שמרנדרים בלי רשת. בודקים מה כתוב על המסך ואיך (מילים, גדלים), לא איך הוא נראה. */
const render = (el: React.ReactElement): string => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>)
const NOOP = () => {}
const toolbar = (over: Partial<Parameters<typeof MineToolbar>[0]> = {}): string =>
  render(<MineToolbar assignedNote={false} onlyNoSubject={false} noSubjectCount={0} onDismissAssigned={NOOP} onSetNoSubject={NOOP} {...over} />)
const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()
const buttons = (html: string): string[] => [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map((m) => m[0])
const links = (html: string): string[] => [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map((m) => m[0])

describe('צ׳יפ הסינון "ללא מקצוע (N)"', () => {
  it('יש שיעורים בלי מקצוע: שני צ׳יפים — "כל השיעורים" (נבחר) ו"ללא מקצוע (3)"', () => {
    const html = toolbar({ noSubjectCount: 3 })
    const labels = buttons(html).map(text)
    expect(labels).toEqual([LIBRARY_ASSIGN_TEXT.allChip, LIBRARY_ASSIGN_TEXT.noSubjectChip(3)])
    expect(LIBRARY_ASSIGN_TEXT.noSubjectChip(3)).toBe('ללא מקצוע (3)')
    expect(buttons(html)[0]).toContain('aria-pressed="true"')
    expect(buttons(html)[1]).toContain('aria-pressed="false"')
    expect(html).toContain(`aria-label="${LIBRARY_ASSIGN_TEXT.filterGroupLabel}"`)
    /* אין משפט פתיחה ואין הודעת שמירה עד שבוחרים/שומרים */
    expect(html).not.toContain('data-library-nosubject-intro')
    expect(html).not.toContain('data-library-assigned')
  })

  it('אין שיעורים בלי מקצוע: הצ׳יפים לא מופיעים', () => {
    expect(toolbar({ noSubjectCount: 0 })).toBe('')
  })

  it('הסינון פעיל: הצ׳יפ "ללא מקצוע" נבחר (aria-pressed + וי + מילים), ומשפט הפתיחה אומר מה עושים, עם קישור חזרה לאנליטיקה', () => {
    const html = toolbar({ onlyNoSubject: true, noSubjectCount: 2 })
    expect(buttons(html)[1]).toContain('aria-pressed="true"')
    expect(buttons(html)[1]).toContain('<svg aria-hidden="true"')
    expect(buttons(html)[0]).not.toContain('<svg')
    expect(text(html)).toContain(LIBRARY_ASSIGN_TEXT.intro)
    expect(LIBRARY_ASSIGN_TEXT.intro).toContain('בחרו מקצוע ליד כל אחד')
    const back = links(html)
    expect(back).toHaveLength(1)
    expect(back[0]).toContain('href="/analytics"')
    expect(text(back[0])).toBe(LIBRARY_ASSIGN_TEXT.backToAnalytics)
  })

  it('הסינון פעיל וכבר שויכו כולם (N=0): הצ׳יפים נשארים, כדי שאפשר יהיה לחזור ל"כל השיעורים"', () => {
    const html = toolbar({ onlyNoSubject: true, noSubjectCount: 0 })
    expect(buttons(html).map(text)).toEqual([LIBRARY_ASSIGN_TEXT.allChip, 'ללא מקצוע (0)'])
  })
})

describe('אחרי שיוך מקצוע', () => {
  it('הודעה שנשארת על המסך (role=status): מה ייכלל בהתקדמות ומה לא, קישור לחזרה וכפתור "סגירה"', () => {
    const html = toolbar({ assignedNote: true, noSubjectCount: 1 })
    expect(html).toContain('data-library-assigned')
    expect(html).toMatch(/<div role="status"[^>]*data-library-assigned/)
    expect(text(html)).toContain(LIBRARY_ASSIGN_TEXT.saved)
    /* אומר את האמת על שיוך בדיעבד: משחקים חדשים כן, משחקים שכבר שוחקו — לא */
    expect(LIBRARY_ASSIGN_TEXT.saved).toContain('המקצוע נשמר')
    expect(LIBRARY_ASSIGN_TEXT.saved).toContain('משחקים חדשים בשיעור הזה ייכללו בהתקדמות')
    expect(LIBRARY_ASSIGN_TEXT.saved).toContain('משחקים שכבר שוחקו בו לא ייכללו')
    expect(links(html).map(text)).toEqual([LIBRARY_ASSIGN_TEXT.backToAnalytics])
    expect(links(html)[0]).toContain('href="/analytics"')
    expect(buttons(html).map(text)).toContain(LIBRARY_ASSIGN_TEXT.dismiss)
  })

  it('הודעת השמירה וסינון פעיל יחד: ההודעה מחליפה את משפט הפתיחה (הרשימה נשארת גלויה), וקישור החזרה לאנליטיקה פעם אחת בלבד', () => {
    const html = toolbar({ assignedNote: true, onlyNoSubject: true, noSubjectCount: 1 })
    expect(links(html)).toHaveLength(1)
    expect(html).not.toContain('data-library-nosubject-intro')
    expect(text(html)).not.toContain(LIBRARY_ASSIGN_TEXT.intro)
    expect(text(html)).toContain(LIBRARY_ASSIGN_TEXT.saved)
  })
})

describe('פקד שיוך המקצוע בכרטיס שיעור', () => {
  const html = render(<SubjectAssign busy={false} onAssign={NOOP} />)
  const select = /<select\b[^>]*>/.exec(html)?.[0] ?? ''

  it('כפתור אחד "שיוך למקצוע": הטקסט הגלוי הוא שם הפעולה, ובחירת מקצוע שומרת מיד (אין כפתור שמירה נוסף)', () => {
    expect(text(html).startsWith(LIBRARY_ASSIGN_TEXT.selectLabel)).toBe(true)
    expect(LIBRARY_ASSIGN_TEXT.selectPlaceholder).toBe('שיוך למקצוע')
    expect(select).toContain(`aria-label="${LIBRARY_ASSIGN_TEXT.selectLabel}"`)
    expect(html).toMatch(new RegExp(`<option value=""[^>]*>${LIBRARY_ASSIGN_TEXT.selectPlaceholder}</option>`))
    expect(buttons(html)).toHaveLength(0)
  })

  it('גופן 16px ויעד 44px לפחות (לא 11px), ומסגרת רגילה — לא מקווקוות ולא עמומה', () => {
    expect(select).toContain('min-height:44px')
    expect(select).toContain('font-size:16px')
    expect(select).not.toMatch(/dashed|font-size:1[0-5]px/)
    expect(select).toMatch(/border:2px solid var\(--t\d+\)/)
  })

  it('כל המקצועות ברשימה (בסדר הקבוע), והפקד מושבת בזמן שמירה', () => {
    const options = [...html.matchAll(/<option value="([^"]+)">([^<]*)<\/option>/g)].map((m) => m[1])
    expect(options).toEqual(SUBJECTS.map((s) => s.code))
    expect(render(<SubjectAssign busy onAssign={NOOP} />)).toMatch(/<select[^>]*disabled/)
  })

  it('אין אימוג׳י', () => {
    expect(/\p{Extended_Pictographic}/u.test(html + toolbar({ assignedNote: true, onlyNoSubject: true, noSubjectCount: 4 }))).toBe(false)
  })
})

describe('גדלים בהודעות ובצ׳יפים', () => {
  it('כל כפתור וקישור: 44px לפחות, וגופן 16px לפחות', () => {
    const html = toolbar({ assignedNote: true, onlyNoSubject: true, noSubjectCount: 2 })
    for (const el of [...buttons(html), ...links(html)]) {
      expect(el, el.slice(0, 80)).toContain('min-height:44px')
      expect(el).toContain('font-size:16px')
    }
    const sizes = [...html.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => parseFloat(m[1]))
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16)
  })
})

/* ───────── כרטיסי שיעור בספרייה: אותו רכיב (LessonCard) כמו אצל התלמיד ─────────
   רינדור בצד שרת (בלי חלון): useTheme מחזיר "כהה", ולכן הצבעים הם הווריאנט הכהה של המקצוע; הבהיר נבדק ב-subjects.test.ts. */
describe('כרטיס שיעור בספרייה שלי', () => {
  const base = { id: 'q1', title: 'המהפכה הצרפתית', created_at: '2026-10-01T09:00:00Z', is_published: true, is_public: false, sceneCount: 6, subject: 'היסטוריה', subjectCode: 'history', thumbUrl: 'https://img.example/holo-thumbs/q1.jpg', gradeMin: 8, gradeMax: 9 }
  const card = (over: Record<string, unknown> = {}, props: Record<string, unknown> = {}): string =>
    render(<QuestCard q={{ ...base, ...over }} busy={false} isGuest={false} shareBlocked={false} onShareBlocked={NOOP} onOpen={NOOP} onPlay={NOOP}
      onShare={NOOP} onUnshare={NOOP} onDelete={NOOP} onAssignSubject={NOOP} {...props} />)
  const labels = (html: string): string[] => buttons(html).map(text)

  it('תמונה, כותרת, תגית מקצוע (השם על הצבע) ותגית שכבות — ואין סמל מקצוע נפרד', () => {
    const html = card()
    expect(html).toContain('data-lesson-card')
    expect(html).toMatch(/<img[^>]*src="https:\/\/img\.example\/holo-thumbs\/q1\.jpg"[^>]*loading="lazy"/)
    expect(text(html)).toContain('המהפכה הצרפתית')
    expect(html).toMatch(/data-subject-tag="history"[^>]*>[\s\S]*?היסטוריה/)
    expect(html).toMatch(/data-grade-tag[^>]*>שכבות ח׳–ט׳</)
    expect(html).not.toContain(SUBJECT_VISUAL.history.glyph)
  })

  it('מסגרת הכרטיס בצבע המקצוע', () => {
    expect(card()).toContain(`border:3px solid ${SUBJECT_VISUAL.history.dark}`)
    expect(card({ subject: 'מתמטיקה', subjectCode: 'math' })).toContain(`border:3px solid ${SUBJECT_VISUAL.math.dark}`)
  })

  it('אותן פעולות מורה בדיוק — מחק · שתף · ערוך · הפעל (והסר מהספרייה רק לשיעור משותף); בלי "שחקו"', () => {
    const own = labels(card())
    expect(own).toEqual(['מחק 🗑️', 'שתף', 'ערוך', 'הפעל ▶'])
    expect(labels(card({ is_public: true }))).toEqual(['הסר מהספרייה', 'מחק 🗑️', 'שתף', 'ערוך', 'הפעל ▶'])
    expect(own.join(' ')).not.toContain('שחקו')
  })

  it('"לא סווג": מסגרת אפורה, תגית "לא סווג" וכפתור "שיוך למקצוע" אחד', () => {
    const html = card({ subject: null, subjectCode: null })
    expect(html).toContain(`border:3px solid ${SUBJECT_VISUAL.unclassified.dark}`)
    expect(html).toMatch(/data-subject-tag="unclassified"[^>]*>[\s\S]*?לא סווג/)
    expect(html.match(/data-subject-assign/g)).toHaveLength(1)
    expect(html).toContain(`aria-label="${LIBRARY_ASSIGN_TEXT.selectLabel}"`)
    /* שיעור שכבר משויך — אין פקד שיוך */
    expect(card()).not.toContain('data-subject-assign')
  })

  it('שיעור בלי תמונה: משטח בצבע המקצוע ועליו שם המקצוע (בלי תגית כפולה)', () => {
    const html = card({ thumbUrl: null })
    expect(html).not.toContain('<img')
    expect(html).toMatch(new RegExp(`data-has-image="false"[^>]*background:${SUBJECT_VISUAL.history.dark}`))
    expect(html).toMatch(/data-thumb-name[^>]*>היסטוריה</)
    expect(html).not.toContain('data-subject-tag')
  })

  it('אין תגית שכבות כשלשיעור אין טווח שכבות', () => {
    expect(card({ gradeMin: null, gradeMax: null })).not.toContain('data-grade-tag')
  })
})

describe('כרטיס בספרייה הציבורית', () => {
  const pub = { id: 'p1', title: 'מסע טיפת המים', subject: 'מדעים', subjectCode: 'science', thumbUrl: 'https://img.example/holo-thumbs/p1.jpg', sceneCount: 7, puzzleTypes: ['multipleChoice', 'memory'], authorName: 'דנה', publishedAt: '2026-10-01', gradeMin: 5, gradeMax: 6, isOfficial: true }
  const html = render(<PublicCard q={pub} busy={false} onCopy={NOOP} onReport={NOOP} />)

  it('אותו כרטיס: תמונה, כותרת, תגית מקצוע ותגית שכבות, ובמקום "שחקו" — הפעולות הקיימות (דווח · השתמש)', () => {
    expect(html).toContain('data-lesson-card')
    expect(html).toMatch(/data-subject-tag="science"[^>]*>[\s\S]*?מדעים/)
    expect(html).toMatch(/data-grade-tag[^>]*>שכבות ה׳–ו׳</)
    expect(html).toContain(`border:3px solid ${SUBJECT_VISUAL.science.dark}`)
    expect(buttons(html).map(text)).toEqual(['דווח 🚩', 'השתמש (העתק אליי) 📥'])
    expect(text(html)).toContain('נוצר במקור על ידי דנה')
    expect(text(html)).toContain('✓ רשמי')
  })
})
