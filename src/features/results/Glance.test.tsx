import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { countNb, DONUT_TEXT, donutBandsHelp } from '../../shared/lib/findingsNarrative'
import type { ClassSubmissionView, SuccessBands } from '../../shared/types/resultsV1'
import Glance from './Glance'

/* תצוגת "במבט אחד" מול חוזה resultsV1: שני גרפים (מי סיים · כמה אתגרים הצליחו מי שסיימו) וחריץ הסיכום המילולי */
const ONE_CHALLENGE = { sceneId: 's1', order: 1, title: 'אתגר', type: 'multipleChoice', typeLabel: 'רב-ברירה', attempted: 0, solved: 0, gaveUp: 0, gaveUpStudents: [], items: [], commonError: null }
function view(over: { counts?: Partial<ClassSubmissionView['head']['counts']>; bands?: Partial<SuccessBands>; challenges?: number } = {}): ClassSubmissionView {
  const counts = { total: 25, completed: 14, inProgress: 6, notStarted: 5, ...over.counts }
  return {
    head: { id: 'a1', questId: 'q1', title: 'צף או שוקע?', thumbUrl: null, subject: null, classId: 'c1', className: 'ו׳2', sentAt: '2026-10-10T08:00:00Z', counts },
    summary: 'משפט סיכום.',
    detailAvailableFrom: null, hasAnswerDetail: true,
    roster: { completed: [], inProgress: [], notStarted: [] },
    successBands: { basis: 14, low: 1, mid: 8, high: 5, enough: true, ...over.bands },
    challenges: Array.from({ length: over.challenges ?? 6 }, (_, i) => ({ ...ONE_CHALLENGE, sceneId: `s${i}`, order: i + 1 })),
    commonErrors: [], objectives: [], review: { weakCount: 0 }, howWeCalculated: [],
  }
}
const html = (v: ClassSubmissionView): string => renderToStaticMarkup(<Glance view={v} />)
/* מקטע ה-HTML של כרטיס אחד: מתחילת הכרטיס עד תחילת הכרטיס הבא (או עד חריץ הסיכום) */
const card = (h: string, name: string): string => {
  const start = h.indexOf(`data-donut-card="${name}"`)
  expect(start, name).toBeGreaterThan(-1)
  const end = [h.indexOf('data-donut-card="success"', start + 1), h.indexOf('data-ai-summary-area')].filter((i) => i > start).sort((a, b) => a - b)[0]
  return h.slice(start, end)
}

describe('Glance — שני הגרפים', () => {
  const h = html(view())

  it('הגרף הראשון מי סיים (מספירת הסטטוסים), הגרף השני כמה אתגרים הצליחו מי שסיימו — כל אחד עם כותרת-שאלה', () => {
    const first = card(h, 'completion')
    const second = card(h, 'success')
    expect(h.indexOf('data-donut-card="completion"')).toBeLessThan(h.indexOf('data-donut-card="success"'))
    expect(first).toContain(DONUT_TEXT.completionTitle)
    expect(second).toContain(DONUT_TEXT.successTitle)
    expect(first).toContain(`${countNb(14, 25)} (56%)`)
    expect(first).toContain(`${countNb(6, 25)} (24%)`)
    expect(first).toContain(`${countNb(5, 25)} (20%)`)
    expect(second).toContain(`${countNb(5, 14)} (36%)`)
    expect(second).toContain(`${countNb(8, 14)} (57%)`)
    expect(second).toContain(`${countNb(1, 14)} (7%)`)
  })

  it('המילים: סיימו · באמצע · עוד לא התחילו / ברוב · בחלק · במעט (ברוב קודם)', () => {
    const first = card(h, 'completion')
    const second = card(h, 'success')
    expect([DONUT_TEXT.completionFinished, DONUT_TEXT.completionMiddle, DONUT_TEXT.completionNotStarted].map((w) => first.indexOf(w)).every((x, i, a) => x >= 0 && (i === 0 || x > a[i - 1]))).toBe(true)
    expect([DONUT_TEXT.bandHigh, DONUT_TEXT.bandMid, DONUT_TEXT.bandLow].map((w) => second.indexOf(w)).every((x, i, a) => x >= 0 && (i === 0 || x > a[i - 1]))).toBe(true)
  })

  it('התווית השלישית משלימה את הנושא ("מהאתגרים"), והספים גלויים על המסך בשורת עזר — לא רק מאחורי "איך חישבנו?"', () => {
    expect(DONUT_TEXT.bandLow).toBe('הצליחו במעט מהאתגרים')
    const second = card(h, 'success')
    expect(second).toContain('data-donut-bands-help')
    const help = /<p data-donut-bands-help[^>]*>([^<]*)<\/p>/.exec(second)?.[1] ?? ''
    expect(help).toBe(donutBandsHelp())
    /* הספים מהתצורה (75% ו-50%) במילים */
    expect(help).toContain('3 מכל 4 אתגרים או יותר')
    expect(help).toContain('פחות ממחצית האתגרים')
    /* בגרף הראשון אין שורת עזר, ובמצב ריק של הגרף השני — גם לא */
    expect(card(h, 'completion')).not.toContain('data-donut-bands-help')
    expect(card(html(view({ bands: { basis: 1, low: 0, mid: 0, high: 1, enough: false } })), 'success')).not.toContain('data-donut-bands-help')
  })

  it('שורת העזר לפי הספים שמגיעים מהתצורה: ספים לא מוכרים נכתבים באחוזים', () => {
    expect(donutBandsHelp({ low: 0.4, high: 0.9 })).toBe('ברוב: 90% מהאתגרים או יותר. במעט: פחות מ-40% מהאתגרים. בחלק: כל מה שביניהם.')
    expect(donutBandsHelp({ low: 0.5, high: 0.75 })).toBe(donutBandsHelp())
  })

  it('המרכז: כל תלמידי הכיתה / מי שסיימו', () => {
    expect(card(h, 'completion')).toContain('>25<')
    expect(card(h, 'completion')).toContain(`>${DONUT_TEXT.centerStudents}<`)
    expect(card(h, 'success')).toContain('>14<')
    expect(card(h, 'success')).toContain(`>${DONUT_TEXT.centerFinished}<`)
  })

  it('לכל גרף תיאור לקוראי מסך עם הספירות; הנתח הנמוך מסומן באייקון התראה (לא באדום)', () => {
    expect(card(h, 'completion')).toContain(`aria-label="${DONUT_TEXT.completionTitle} ${countNb(14, 25)} ${DONUT_TEXT.completionFinished}`)
    expect(card(h, 'success')).toContain(`aria-label="${DONUT_TEXT.successTitle} ${countNb(5, 14)} ${DONUT_TEXT.bandHigh}`)
    const low = /<li data-donut-row="low"[\s\S]*?<\/li>/.exec(h)![0]
    expect(low).toContain('M12 3.5L22 20.5H2z')
    expect(low).toContain(DONUT_TEXT.bandLow)
    expect(h).not.toContain('--t5)')
  })

  it('חריץ הסיכום המילולי: קיים, ריק, ולא תופס מקום (בלי גובה, ריפוד או ריווח)', () => {
    expect(h).toContain('<div data-ai-summary-area="true" style="min-width:0"><div data-ai-summary-slot="true"></div></div>')
    expect(h).not.toMatch(/data-ai-summary-slot[^>]*style=/)
    /* החריץ בא אחרי שני הגרפים, מחוץ לכרטיסים */
    expect(h.indexOf('data-ai-summary-slot')).toBeGreaterThan(h.lastIndexOf('</section>'))
  })

  it('אין שום מחרוזת אימוג׳י, אין hover ואין צבע מוחלט', () => {
    expect(h).not.toMatch(/\p{Extended_Pictographic}/u)
    expect(h).not.toMatch(/onmouse|title=/i)
    expect(h).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/)
  })
})

describe('Glance — מצבים ריקים אומרים מה קורה ומה יקרה', () => {
  it('פחות מ-2 סיימו (enough=false): הגרף השני הוא מצב ריק, הראשון נשאר', () => {
    const h = html(view({ counts: { total: 25, completed: 1, inProgress: 2, notStarted: 22 }, bands: { basis: 1, low: 0, mid: 0, high: 1, enough: false } }))
    const second = card(h, 'success')
    expect(second).toContain('data-empty-state')
    expect(second).toContain(DONUT_TEXT.successEmpty)
    expect(second).toContain(DONUT_TEXT.successEmptyNext)
    expect(second).not.toContain('data-donut-slice')
    expect(card(h, 'completion')).toContain('data-donut-slice')
  })

  it('הדמיה בלי אתגרים: ההסבר אומר שאין מה למדוד (ולא "עוד אין מספיק תלמידים")', () => {
    const h = html(view({ challenges: 0, counts: { total: 25, completed: 25, inProgress: 0, notStarted: 0 }, bands: { basis: 0, low: 0, mid: 0, high: 0, enough: false } }))
    const second = card(h, 'success')
    expect(second).toContain(DONUT_TEXT.successNoChallenges)
    expect(second).toContain(DONUT_TEXT.successNoChallengesNext)
    expect(second).not.toContain(DONUT_TEXT.successEmpty)
  })

  it('כיתה בלי תלמידים: הגרף הראשון הוא מצב ריק', () => {
    const h = html(view({ counts: { total: 0, completed: 0, inProgress: 0, notStarted: 0 }, bands: { basis: 0, low: 0, mid: 0, high: 0, enough: false } }))
    expect(card(h, 'completion')).toContain(DONUT_TEXT.completionEmpty)
    expect(card(h, 'completion')).toContain(DONUT_TEXT.completionEmptyNext)
  })

  it('כולם סיימו: "באמצע" ו"עוד לא התחילו" נשארים במקרא במילים "אף אחד"', () => {
    const h = html(view({ counts: { total: 25, completed: 25, inProgress: 0, notStarted: 0 }, bands: { basis: 25, low: 0, mid: 5, high: 20, enough: true } }))
    const first = card(h, 'completion')
    expect((first.match(new RegExp(DONUT_TEXT.nobody, 'g')) ?? []).length).toBe(2)
    expect(first).toContain(`${countNb(25, 25)} (100%)`)
    expect(first).toContain('fill-rule:evenodd')
  })
})
