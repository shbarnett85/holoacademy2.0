import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import {
  AI_SUMMARY_PANEL_TEXT, AI_SUMMARY_TEXT, CAVEAT_TREND, ERR_SUMMARY_LOAD, ERR_SUMMARY_SAVE, ERR_SUMMARY_WRITE, ERR_V2_FORBIDDEN, ERR_V2_UNAVAILABLE, aiSummaryGenerateHint,
} from '../../shared/lib/findingsNarrative'
import { FORBIDDEN_UI_TERMS, forbiddenHits } from '../../shared/lib/forbiddenTerms'
import type { SummaryScope } from '../../shared/types/aiSummaryV1'
import { AiSummaryView } from './AiSummaryPanel'
import type { AiSummaryViewProps } from './AiSummaryPanel'
import { derive, initialState, summaryReducer, targetKey } from './state'
import type { SummaryDispatch, SummaryUiState } from './state'
import { NOT_ENOUGH, PARAS, aiSummary, summaryState } from './testkit'
import type { AiSummaryActions } from './useAiSummary'

/* מרנדרים את התצוגה (AiSummaryView) מול מצב קבוע, בלי רשת — בודקים מה כתוב על המסך ואיך (מילים, אייקון, גדלים), לא איך הוא נראה. */
const NOOP: AiSummaryActions = { write: () => {}, editStart: () => {}, draftChange: () => {}, save: () => {}, cancel: () => {}, revert: () => {}, reload: () => {} }
const KEY = targetKey({ scope: 'student', id: 'st-1' }, {})
const SCOPE: SummaryScope = 'student'

const state = (...actions: SummaryDispatch[]): SummaryUiState => actions.reduce(summaryReducer, initialState)
const loaded = (over: Parameters<typeof summaryState>[0] = {}, ...more: SummaryDispatch[]): SummaryUiState => state({ type: 'loaded', key: KEY, data: summaryState(over) }, ...more)
const render = (s: SummaryUiState, props: Partial<AiSummaryViewProps> = {}, scope: SummaryScope = SCOPE): string =>
  renderToStaticMarkup(<MemoryRouter><AiSummaryView model={derive(s, KEY, scope)} actions={NOOP} exportName="נועה כהן" {...props} /></MemoryRouter>)

const EMOJI = /\p{Extended_Pictographic}/u
const text = (html: string): string => html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const buttons = (html: string): string[] => [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map((m) => m[0])
const buttonLabel = (b: string): string => text(b)
/* תווית "מי כתב": span שבתוכו אייקון (svg, aria-hidden) ומיד אחריו המילים */
const authorLabel = (html: string, kind: string): { icon: boolean; words: string } | null => {
  const m = new RegExp(`<span data-ai-label="${kind}"[^>]*><span[^>]*>(<svg aria-hidden="true"[\\s\\S]*?</svg>)</span>([^<]*)</span>`).exec(html)
  return m ? { icon: m[1].startsWith('<svg aria-hidden="true"'), words: m[2] } : null
}

/* כללים לכל מצב: אין אימוג'י, אין צבע מוחלט, אין מונחים טכניים, כל כפתור עם מילה ו-44px, וגוף הטקסט 16px לפחות */
function expectClean(html: string): void {
  expect(EMOJI.test(html), 'אימוג׳י').toBe(false)
  expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/)
  expect(forbiddenHits(text(html), FORBIDDEN_UI_TERMS), 'מונח אסור').toEqual([])
  expect(html).not.toMatch(/onmouse|title=/i)
  for (const b of buttons(html)) {
    expect(buttonLabel(b), `כפתור בלי מילה: ${b.slice(0, 80)}`).toMatch(/[א-ת]/)
    expect(b, 'כפתור קטן מ-44px').toContain('min-height:44px')
  }
  const sizes = [...html.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => parseFloat(m[1]))
  expect(sizes.length).toBeGreaterThan(0)
  expect(Math.min(...sizes), 'גופן קטן מ-16px').toBeGreaterThanOrEqual(16)
}

describe('מצבי הפאנל — כללי הממשק', () => {
  const cases: [string, string][] = [
    ['טוען', render(initialState)],
    ['שגיאת טעינה (עומס)', render(state({ type: 'loadFailed', key: KEY, error: { action: 'load', status: 503, message: ERR_V2_UNAVAILABLE } }))],
    ['אין מספיק נתונים', render(loaded({ eligibility: NOT_ENOUGH, summary: null }))],
    ['אין סיכום עדיין', render(loaded({ summary: null }))],
    ['כותב', render(loaded({ summary: null }, { type: 'writeStarted', key: KEY }))],
    ['מוכן (AI)', render(loaded())],
    ['מוכן (תבנית)', render(loaded({ summary: aiSummary({ writtenBy: 'template' }) }))],
    ['מוכן (הדגמה)', render(loaded({ demo: true, persisted: false, summary: aiSummary({ writtenBy: 'template', id: null, label: AI_SUMMARY_TEXT.label.demo, notice: AI_SUMMARY_TEXT.notice.demo }) }))],
    ['נערך', render(loaded({ summary: aiSummary({ edited: true }) }))],
    ['לא נשמר בשרת', render(loaded({ persisted: false, persistenceNote: AI_SUMMARY_TEXT.persistenceNote, summary: aiSummary({ id: null }) }))],
    ['עריכה', render(loaded({}, { type: 'editStarted', key: KEY }))],
    ['שגיאה בכתיבה מחדש', render(loaded({}, { type: 'writeFailed', key: KEY, error: { action: 'write', status: 429, message: 'הסיכום נכתב לפני רגע. אפשר לכתוב מחדש בעוד כמה שניות.' } }))],
    ['כרטיס מוטמע: אין סיכום', render(loaded({ summary: null }), { compact: true })],
    ['כרטיס מוטמע: סגור', render(loaded(), { compact: true })],
    ['כרטיס מוטמע: פתוח', render(loaded(), { compact: true, defaultOpen: true })],
    ['כרטיס מוטמע: אין מספיק נתונים', render(loaded({ eligibility: NOT_ENOUGH, summary: null }), { compact: true })],
    ['שכבת-על (בלי כותרת וכרטיס)', render(loaded(), { showHeading: false, plain: true, note: AI_SUMMARY_PANEL_TEXT.subjectOnly })],
  ]
  it.each(cases)('%s: אין אימוג׳י, צבע מוחלט או מונח טכני; כל כפתור עם מילה ו-44px; גופן 16px לפחות', (_name, html) => {
    expect(html).toContain('data-ai-summary')
    expectClean(html)
  })
})

describe('אין סיכום עדיין / אין מספיק נתונים / כותב', () => {
  it('אין סיכום: ההסבר, והכפתור "כתבו לי סיכום" פעיל', () => {
    const html = render(loaded({ summary: null }))
    expect(html).toContain('data-ai-state="none"')
    expect(text(html)).toContain(aiSummaryGenerateHint('student'))
    const [b] = buttons(html)
    expect(buttonLabel(b)).toBe(AI_SUMMARY_TEXT.ui.generate)
    expect(b).not.toContain('disabled')
  })

  it('אין מספיק נתונים: מצב ריק במילים (מה קורה), והכפתור מושבת עם הסיבה (מה יקרה) כתובה לידו', () => {
    const html = render(loaded({ eligibility: NOT_ENOUGH, summary: null }))
    expect(html).toContain('data-ai-state="ineligible"')
    expect(html).toContain('data-empty-state')
    expect(text(html)).toContain(NOT_ENOUGH.text)
    expect(text(html)).toContain(NOT_ENOUGH.whatNext)
    const [b] = buttons(html)
    expect(buttonLabel(b)).toBe(AI_SUMMARY_TEXT.ui.generate)
    expect(b).toContain('disabled')
    /* הסיבה מופיעה פעם אחת, ליד הכפתור */
    expect(text(html).split(NOT_ENOUGH.whatNext).length - 1).toBe(1)
  })

  it('כותב: role=status עם "זה לוקח כחצי דקה", הכפתור מושבת, והמסך מסומן כעסוק', () => {
    const html = render(loaded({ summary: null }, { type: 'writeStarted', key: KEY }))
    expect(html).toContain('data-ai-state="writing"')
    expect(html).toContain('aria-busy="true"')
    expect(html).toMatch(/<p role="status"[^>]*>[^<]*זה לוקח כחצי דקה/)
    expect(buttons(html).find((b) => buttonLabel(b) === AI_SUMMARY_TEXT.ui.generate)).toContain('disabled')
  })

  it('סיבה חיצונית לכך שאי אפשר לכתוב: הכפתור מושבת והסיבה כתובה', () => {
    const html = render(loaded({ summary: null }), { disabledReason: 'אין לכם הרשאה לכתוב סיכום כאן.' })
    expect(buttons(html)[0]).toContain('disabled')
    expect(text(html)).toContain('אין לכם הרשאה לכתוב סיכום כאן.')
  })

  it('כשל בכתיבה: ההודעה בעברית פשוטה ב-role=alert, והכפתור פעיל לניסיון חוזר', () => {
    const html = render(loaded({ summary: null }, { type: 'writeFailed', key: KEY, error: { action: 'write', status: 503, message: ERR_V2_UNAVAILABLE } }))
    expect(html).toMatch(/<p role="alert"[^>]*>[\s\S]*?השירות אינו זמין לרגע/)
    expect(buttons(html)[0]).not.toContain('disabled')
  })
})

describe('מוכן', () => {
  it('סיכום שנכתב ב-AI: פסקאות 17px עם מרווח שורות 1.7, תווית AI באייקון+מילים, בסיס, תאריך והסתייגות קבועה', () => {
    const html = render(loaded())
    expect(html).toContain('data-ai-state="ready"')
    for (const p of PARAS) expect(html).toMatch(new RegExp(`<p style="[^"]*font-size:17px[^"]*line-height:1\\.7[^"]*">${p}</p>`))
    expect(authorLabel(html, 'ai'), 'תווית AI: אייקון + מילים').toEqual({ icon: true, words: AI_SUMMARY_TEXT.label.ai })
    /* מתחת לטקסט (לפי המפרט), ולפני ההסתייגות הקבועה */
    expect(html.indexOf('data-ai-label')).toBeGreaterThan(html.lastIndexOf(PARAS[PARAS.length - 1]))
    expect(html.indexOf('data-ai-label')).toBeLessThan(html.indexOf('data-ai-caveat'))
    expect(text(html)).toContain('מבוסס על 14 הדמיות')
    expect(text(html)).toContain(AI_SUMMARY_PANEL_TEXT.writtenOn('20 באוקטובר 2026'))
    expect(text(html)).toContain(CAVEAT_TREND)
    expect(text(html)).not.toContain(AI_SUMMARY_TEXT.notice.template)
  })

  it('הכפתורים: עריכה · ייצוא ל-Word · הדפסה · כתיבה מחדש (ואין "נסו שוב עם ד״ר הולו")', () => {
    const labels = buttons(render(loaded())).map(buttonLabel)
    expect(labels).toEqual([AI_SUMMARY_TEXT.ui.edit, AI_SUMMARY_TEXT.ui.exportWord, AI_SUMMARY_TEXT.ui.print, AI_SUMMARY_TEXT.ui.regenerate])
  })

  it('תבניתי (כשל בבדיקת הפלט): התווית "סיכום אוטומטי מהנתונים" עם אייקון, באנר "לא נכתב בבינה מלאכותית", ו"נסו שוב עם ד״ר הולו"', () => {
    const html = render(loaded({ summary: aiSummary({ writtenBy: 'template' }) }))
    expect(authorLabel(html, 'template')).toEqual({ icon: true, words: AI_SUMMARY_TEXT.label.template })
    expect(text(html)).toContain(AI_SUMMARY_TEXT.notice.template)
    const labels = buttons(html).map(buttonLabel)
    expect(labels).toContain(AI_SUMMARY_TEXT.ui.retryAi)
    expect(labels).not.toContain(AI_SUMMARY_TEXT.ui.regenerate)
  })

  it('הדגמה (אורח / ארגון הדגמה): "זה סיכום הדגמה", בלי עריכה, בלי כתיבה מחדש ובלי ניסיון חוזר — רק ייצוא והדפסה', () => {
    const html = render(loaded({
      demo: true, persisted: false, summary: aiSummary({ writtenBy: 'template', id: null, label: AI_SUMMARY_TEXT.label.demo, notice: AI_SUMMARY_TEXT.notice.demo }),
    }))
    expect(html).toContain('data-ai-label="demo"')
    expect(text(html)).toContain(AI_SUMMARY_TEXT.label.demo)
    expect(text(html)).toContain(AI_SUMMARY_TEXT.notice.demo)
    expect(buttons(html).map(buttonLabel)).toEqual([AI_SUMMARY_TEXT.ui.exportWord, AI_SUMMARY_TEXT.ui.print])
    /* בהדגמה אין הערת "לא נשמר" נוספת: הבאנר כבר אומר זאת */
    expect(text(html)).not.toContain(AI_SUMMARY_TEXT.persistenceNote)
  })

  it('נערך על ידי המורה: תג "נערך על ידך" ו"חזרה לטקסט" זמין רק בעריכה', () => {
    const html = render(loaded({ summary: aiSummary({ edited: true, paragraphs: ['הניסוח של המורה.'] }) }))
    expect(text(html)).toContain(AI_SUMMARY_TEXT.editedBadge)
    expect(text(html)).toContain('הניסוח של המורה.')
    expect(text(render(loaded()))).not.toContain(AI_SUMMARY_TEXT.editedBadge)
  })

  it('לא נשמר בשרת (לפני המיגרציה): ההערה במילים; העריכה זמינה (נשמרת לסשן)', () => {
    const html = render(loaded({ persisted: false, persistenceNote: AI_SUMMARY_TEXT.persistenceNote, summary: aiSummary({ id: null }) }))
    expect(text(html)).toContain(AI_SUMMARY_TEXT.persistenceNote)
    expect(buttons(html).map(buttonLabel)).toContain(AI_SUMMARY_TEXT.ui.edit)
  })

  it('"איך נכתב הסיכום?" מקופל מאחורי <details> (כמו "איך חישבנו?"), והשורות בתוכו', () => {
    const s = aiSummary()
    const html = render(loaded())
    const details = /<details data-how-we-calc[\s\S]*?<\/details>/.exec(html)?.[0] ?? ''
    expect(text(details)).toContain(AI_SUMMARY_TEXT.howWrittenTitle)
    for (const line of s.howWritten) expect(text(details)).toContain(line.slice(0, 40))
    expect(details).not.toContain(' open')
  })

  it('הערה מעל הטקסט (מורה מקצועי): מוצגת רק כשהועברה', () => {
    expect(text(render(loaded(), { note: AI_SUMMARY_PANEL_TEXT.subjectOnly }))).toContain(AI_SUMMARY_PANEL_TEXT.subjectOnly)
    expect(text(render(loaded()))).not.toContain(AI_SUMMARY_PANEL_TEXT.subjectOnly)
  })

  it('לפי היקף: כותרת הפאנל', () => {
    for (const scope of ['student', 'class', 'class_subject', 'submission'] as const) {
      const html = render(loaded(), {}, scope)
      expect(html).toContain(`aria-label="${AI_SUMMARY_TEXT.headingByScope[scope]}"`)
    }
  })
})

describe('עריכה', () => {
  it('שדה עם תווית גלויה, גוף 17px, מגבלת אורך; שמירה · ביטול · חזרה לטקסט של ד״ר הולו (כשנערך)', () => {
    const html = render(loaded({ summary: aiSummary({ edited: true }) }, { type: 'editStarted', key: KEY }))
    expect(html).toContain('data-ai-state="editing"')
    expect(html).toMatch(/<textarea[^>]*maxLength="6000"/)
    expect(html).toMatch(/<textarea[^>]*font-size:17px/)
    expect(html).toMatch(/<label[^>]*>עריכת הסיכום<\/label>/)
    expect(buttons(html).map(buttonLabel)).toEqual([AI_SUMMARY_TEXT.ui.save, AI_SUMMARY_TEXT.ui.cancel, AI_SUMMARY_TEXT.ui.revert])
    expect(html).toContain(PARAS[0].slice(0, 5))
  })

  it('סיכום שלא נערך: אין "חזרה לטקסט" (אין לאן לחזור)', () => {
    expect(buttons(render(loaded({}, { type: 'editStarted', key: KEY }))).map(buttonLabel)).toEqual([AI_SUMMARY_TEXT.ui.save, AI_SUMMARY_TEXT.ui.cancel])
  })

  it('בזמן שמירה: הכפתורים מושבתים והשדה נעול; שגיאת שמירה נראית ב-role=alert', () => {
    const saving = render(loaded({}, { type: 'editStarted', key: KEY }, { type: 'saveStarted', key: KEY }))
    for (const b of buttons(saving)) expect(b).toContain('disabled')
    expect(text(saving)).toContain(AI_SUMMARY_PANEL_TEXT.saving)
    const failed = render(loaded({}, { type: 'editStarted', key: KEY }, { type: 'saveFailed', key: KEY, error: { action: 'save', status: 500, message: 'לא הצלחנו לשמור את העריכה. אפשר לנסות שוב.' } }))
    expect(failed).toMatch(/<p role="alert"[^>]*>[\s\S]*?לא הצלחנו לשמור/)
  })
})

describe('שגיאת טעינה', () => {
  it('עומס/תקלה: ההודעה בעברית פשוטה ו"נסו שוב"; הרשאה: ההודעה בלי "נסו שוב"', () => {
    const busy = render(state({ type: 'loadFailed', key: KEY, error: { action: 'load', status: 503, message: ERR_V2_UNAVAILABLE } }))
    expect(busy).toContain('data-ai-state="loadError"')
    expect(busy).toMatch(/<p role="alert"/)
    expect(buttons(busy).map(buttonLabel)).toEqual([AI_SUMMARY_PANEL_TEXT.retry])
    const denied = render(state({ type: 'loadFailed', key: KEY, error: { action: 'load', status: 403, message: ERR_V2_FORBIDDEN } }))
    expect(text(denied)).toContain(ERR_V2_FORBIDDEN)
    expect(buttons(denied)).toEqual([])
  })
})

describe('כרטיס מוטמע (compact) — בטאב "במבט אחד"', () => {
  it('אין סיכום: כותרת + הכפתור באותה שורה, וההסבר מתחת — כותרת h3', () => {
    const html = render(loaded({ summary: null }), { compact: true })
    expect(html).toMatch(/<h3[^>]*>[\s\S]*?סיכום מילולי על התלמיד\/ה<\/h3>/)
    expect(buttons(html).map(buttonLabel)).toEqual([AI_SUMMARY_TEXT.ui.generate])
    expect(html.indexOf('<button')).toBeLessThan(html.indexOf(aiSummaryGenerateHint('student').slice(0, 20)))
    expect(html).toMatch(/margin-top:8px/)
  })

  it('סיכום שמור: סגור כברירת מחדל — רק הכותרת וכפתור "קריאת הסיכום" (aria-expanded=false); הטקסט לא ב-DOM', () => {
    const html = render(loaded(), { compact: true })
    expect(buttons(html).map(buttonLabel)).toEqual([AI_SUMMARY_PANEL_TEXT.read])
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain(PARAS[0])
  })

  it('נכתב עכשיו (wrote) או defaultOpen: פתוח, עם "הסתרת הסיכום"', () => {
    const wrote = render(state({ type: 'loaded', key: KEY, data: summaryState({ summary: null }) }, { type: 'writeStarted', key: KEY }, { type: 'written', key: KEY, data: summaryState() }), { compact: true })
    expect(wrote).toContain(PARAS[0])
    expect(buttons(wrote).map(buttonLabel)).toContain(AI_SUMMARY_PANEL_TEXT.hide)
    expect(render(loaded(), { compact: true, defaultOpen: true })).toContain('aria-expanded="true"')
  })

  it('אין מספיק נתונים: הכפתור מושבת בשורת הכותרת והסיבה כתובה מתחת', () => {
    const html = render(loaded({ eligibility: NOT_ENOUGH, summary: null }), { compact: true })
    expect(buttons(html)).toHaveLength(1)
    expect(buttons(html)[0]).toContain('disabled')
    expect(text(html)).toContain(NOT_ENOUGH.text)
    expect(text(html)).toContain(NOT_ENOUGH.whatNext)
  })
})

describe('שכבת-על', () => {
  it('בלי כותרת וכרטיס משלה (יש לשכבה כותרת), עם ההערה; הסיכום מוצג כרגיל', () => {
    const html = render(loaded(), { showHeading: false, plain: true, note: AI_SUMMARY_PANEL_TEXT.subjectOnly })
    expect(html).not.toMatch(/<h2/)
    expect(html).toContain('border:none')
    expect(text(html)).toContain(AI_SUMMARY_PANEL_TEXT.subjectOnly)
    expect(html).toContain(PARAS[0])
  })
})

describe('הטקסטים של הפאנל (AI_SUMMARY_PANEL_TEXT)', () => {
  function* strings(v: unknown): Generator<string> {
    if (typeof v === 'string') yield v
    else if (typeof v === 'function') yield (v as (...a: string[]) => string)('דוגמה', 'שם')
    else if (v && typeof v === 'object') for (const x of Object.values(v)) yield* strings(x)
  }
  it('כל המחרוזות בעברית פשוטה: בלי אימוג׳י ובלי מונחים טכניים; השגיאות כמו כן', () => {
    const all = [...strings(AI_SUMMARY_PANEL_TEXT), ERR_SUMMARY_LOAD, ERR_SUMMARY_WRITE, ERR_SUMMARY_SAVE]
    expect(all.length).toBeGreaterThan(12)
    for (const s of all) {
      expect(EMOJI.test(s), s).toBe(false)
      expect(forbiddenHits(s, FORBIDDEN_UI_TERMS), s).toEqual([])
      expect(s.trim().length, s).toBeGreaterThan(0)
    }
  })
})
