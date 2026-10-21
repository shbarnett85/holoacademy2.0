import { describe, expect, it } from 'vitest'
import { AI_SUMMARY_HARDENING_TEXT, AI_SUMMARY_TEXT, CAVEAT_TREND } from '../../shared/lib/findingsNarrative'
import { DOC_COLORS, buildSummaryDocument, escapeHtml, exportLineOf, formatSummaryDate, summaryFileName } from './exportWord'
import type { SummaryDocInput } from './exportWord'
import { PARAS } from './testkit'

const BASE: SummaryDocInput = {
  scope: 'student', name: 'נועה כהן', paragraphs: PARAS, writtenBy: 'ai', edited: false, demo: false, basisText: 'מבוסס על 14 הדמיות', caveat: CAVEAT_TREND,
  writtenAt: '2026-10-05T08:00:00.000Z', date: new Date('2026-10-21T09:00:00Z'),
}

describe('buildSummaryDocument — מסמך ל-Word ולהדפסה', () => {
  const html = buildSummaryDocument(BASE)

  it('אין var( בכלל: ב-Word ובהדפסה אין משתני CSS של האתר, ולכן הצבעים ליטרליים', () => {
    expect(html).not.toContain('var(')
    expect(html).not.toContain('--t')
  })

  it('הצבעים במסמך הם הקסדצימליים ליטרליים (ורק הם), והכיוון ימין לשמאל', () => {
    for (const c of Object.values(DOC_COLORS)) {
      expect(c).toMatch(/^#[0-9a-f]{6}$/i)
      expect(html).toContain(c)
    }
    const colorsUsed = [...html.matchAll(/color:\s*([^;}\s]+)/g)].map((m) => m[1])
    expect(colorsUsed.length).toBeGreaterThan(3)
    for (const c of colorsUsed) expect(c).toMatch(/^#[0-9a-f]{6}$/i)
    expect(html).not.toMatch(/rgba?\(|hsla?\(/)
    expect(html).toContain('<html dir="rtl" lang="he"')
    expect(html).toContain('<meta charset="utf-8">')
  })

  it('כותרת עם השם מהמסך, תאריך, הפסקאות כפי שהן, שורת "נוצר בעזרת בינה מלאכותית", בסיס והסתייגות', () => {
    expect(html).toContain('<h1>סיכום מילולי על התלמיד/ה: נועה כהן</h1>')
    /* התאריך הוא תאריך הכתיבה (5 באוקטובר), לא יום הייצוא (21 באוקטובר) */
    expect(html).toContain(AI_SUMMARY_HARDENING_TEXT.writtenOn(formatSummaryDate('2026-10-05T08:00:00.000Z')))
    expect(html).not.toContain(formatSummaryDate('2026-10-21T09:00:00Z'))
    expect(html).not.toContain('הופק בתאריך')
    for (const p of PARAS) expect(html).toContain(`<p>${p}</p>`)
    expect(html).toContain(AI_SUMMARY_TEXT.exportLine.ai)
    expect(html).toContain('מבוסס על 14 הדמיות')
    expect(html).toContain(CAVEAT_TREND)
  })

  it('סיכום שייתכן שהנתונים שלו השתנו: המסמך המיוצא אומר זאת; סיכום טרי — לא', () => {
    expect(buildSummaryDocument({ ...BASE, stale: true })).toContain(AI_SUMMARY_HARDENING_TEXT.stale)
    expect(buildSummaryDocument(BASE)).not.toContain(AI_SUMMARY_HARDENING_TEXT.stale)
  })

  it('בלי writtenAt (סיכום שלא הגיע מהשרת) או עם תאריך לא תקין: נופל ל-date הנתון', () => {
    const noWritten = buildSummaryDocument({ ...BASE, writtenAt: undefined })
    expect(noWritten).toContain(AI_SUMMARY_HARDENING_TEXT.writtenOn(formatSummaryDate('2026-10-21T09:00:00Z')))
    expect(buildSummaryDocument({ ...BASE, writtenAt: 'לא תאריך' })).toContain(AI_SUMMARY_HARDENING_TEXT.writtenOn(formatSummaryDate('2026-10-21T09:00:00Z')))
  })

  it('המיוצא הוא הטקסט אחרי העריכה, עם שורה שאומרת שנערך על ידי המורה', () => {
    const edited = buildSummaryDocument({ ...BASE, paragraphs: ['הניסוח של המורה.', 'פסקה נוספת.'], edited: true })
    expect(edited).toContain('<p>הניסוח של המורה.</p>')
    expect(edited).not.toContain(PARAS[0])
    expect(edited).toContain(AI_SUMMARY_TEXT.exportLine.aiEdited)
  })

  it('שורת המקור לפי מי כתב: AI · AI ונערך · תבנית · הדגמה', () => {
    expect(exportLineOf({ writtenBy: 'ai', edited: false, demo: false })).toBe(AI_SUMMARY_TEXT.exportLine.ai)
    expect(exportLineOf({ writtenBy: 'ai', edited: true, demo: false })).toBe(AI_SUMMARY_TEXT.exportLine.aiEdited)
    expect(exportLineOf({ writtenBy: 'template', edited: false, demo: false })).toBe(AI_SUMMARY_TEXT.exportLine.template)
    expect(exportLineOf({ writtenBy: 'template', edited: true, demo: true })).toBe(AI_SUMMARY_TEXT.exportLine.demo)
    expect(buildSummaryDocument({ ...BASE, writtenBy: 'template', demo: true })).not.toContain(AI_SUMMARY_TEXT.exportLine.ai)
  })

  it('כל טקסט עובר escape — גם שם שמגיע מהמסך, גם עריכה חופשית', () => {
    const evil = buildSummaryDocument({ ...BASE, name: '<img src=x onerror=alert(1)>', paragraphs: ['<script>alert(1)</script> & "ציטוט"'] })
    expect(evil).not.toContain('<img')
    expect(evil).not.toContain('<script>')
    expect(evil).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;ציטוט&quot;')
    expect(escapeHtml(`a<b>&"'`)).toBe('a&lt;b&gt;&amp;&quot;&#39;')
  })

  it('בלי שם: הכותרת היא שם ההיקף בלבד; שורה חדשה בתוך פסקה נשמרת', () => {
    const noName = buildSummaryDocument({ ...BASE, name: '  ', paragraphs: ['שורה א\nשורה ב'] })
    expect(noName).toContain('<h1>סיכום מילולי על התלמיד/ה</h1>')
    expect(noName).toContain('שורה א<br/>שורה ב')
  })

  it('כותרת לפי ההיקף (כיתה / הגשה)', () => {
    expect(buildSummaryDocument({ ...BASE, scope: 'class', name: 'כיתה ו׳2' })).toContain('<h1>סיכום מילולי על הכיתה: כיתה ו׳2</h1>')
    expect(buildSummaryDocument({ ...BASE, scope: 'submission', name: 'צף או שוקע?' })).toContain('<h1>סיכום מילולי על ההדמיה: צף או שוקע?</h1>')
  })
})

describe('summaryFileName', () => {
  it('"סיכום מילולי - <שם>" בלי תווים שאסורים בשמות קבצים, עם סיומת .doc; בלי שם — "סיכום מילולי"', () => {
    expect(summaryFileName({ name: 'נועה כהן' })).toBe('סיכום מילולי - נועה כהן.doc')
    expect(summaryFileName({ name: 'צף או שוקע?' })).toBe('סיכום מילולי - צף או שוקע.doc')
    expect(summaryFileName({ name: 'כיתה ו׳2: "א/ב"' })).toBe('סיכום מילולי - כיתה ו׳2 אב.doc')
    expect(summaryFileName({ name: '  ' })).toBe('סיכום מילולי.doc')
  })
})
