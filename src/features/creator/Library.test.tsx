import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { LIBRARY_ASSIGN_TEXT } from '../../shared/lib/findingsNarrative'
import { SUBJECTS } from '../../shared/lib/subjects'

vi.mock('./StudioTopBar', () => ({ default: () => null }))

import { MineToolbar, SubjectAssign } from './Library'

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
  it('הודעה שנשארת על המסך (role=status): מה ייכלל באנליטיקה ומה לא, קישור "חזרה לאנליטיקה" וכפתור "סגירה"', () => {
    const html = toolbar({ assignedNote: true, noSubjectCount: 1 })
    expect(html).toContain('data-library-assigned')
    expect(html).toMatch(/<div role="status"[^>]*data-library-assigned/)
    expect(text(html)).toContain(LIBRARY_ASSIGN_TEXT.saved)
    /* אומר את האמת על שיוך בדיעבד: משחקים חדשים כן, משחקים שכבר שוחקו — לא */
    expect(LIBRARY_ASSIGN_TEXT.saved).toContain('המקצוע נשמר')
    expect(LIBRARY_ASSIGN_TEXT.saved).toContain('משחקים חדשים בשיעור הזה ייכללו באנליטיקה')
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

  it('תווית "מקצוע" גלויה, שדה שנבחר ממנה (label עוטף), ואפשרות ראשונה שמבקשת לבחור', () => {
    expect(text(html).startsWith(LIBRARY_ASSIGN_TEXT.selectLabel)).toBe(true)
    expect(html).toMatch(/^<label\b/)
    expect(html).toMatch(new RegExp(`<option value=""[^>]*>${LIBRARY_ASSIGN_TEXT.selectPlaceholder}</option>`))
  })

  it('גופן 16px ויעד 44px לפחות (לא 11px), ומסגרת רגילה — לא מקווקוות ולא עמומה', () => {
    expect(select).toContain('min-height:44px')
    expect(select).toContain('font-size:16px')
    expect(select).not.toMatch(/dashed|font-size:1[0-5]px/)
    expect(select).toMatch(/border:2px solid var\(--t\d+\)/)
    expect(html).toMatch(/^<label[^>]*font-size:16px/)
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
