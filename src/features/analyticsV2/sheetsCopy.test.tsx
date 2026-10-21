/* שכבות-העל (תדריך ומשוב) והטקסטים שלהן: שמות ברורים, "טיוטה למסירה" בלי להבטיח שהתלמיד/ה רואה את המשוב במערכת, בלי אימוג'י ובלי תוויות על תלמידים. */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BRIEFING_SECTION_TITLES, V2_CLIENT_TEXT, V2_SHEETS_TEXT } from '../../shared/lib/findingsNarrative'
import type { StudentFeedback } from '../../shared/types/analyticsV2'
import { L } from './labels'
import { FeedbackItems } from './Overlays'

const EMOJI = /\p{Extended_Pictographic}/u
const FEEDBACK: StudentFeedback = {
  firstName: 'נועה', intro: 'ישן', headline: 'שלום נועה, הנה מה שהשתפר אצלך לאחרונה',
  items: [
    { subject: { code: 'math', nameHe: 'מתמטיקה' }, kind: 'growth', text: 'הרמה במתמטיקה עלתה.' },
    { subject: { code: 'hebrew', nameHe: 'עברית' }, kind: 'streak', text: 'שיחקת שלוש פעמים השבוע.' },
    { subject: { code: 'history', nameHe: 'היסטוריה' }, kind: 'next_step', text: 'הצעד הבא: עוד תרגול קצר.' },
  ],
}

describe('משוב אישי לתלמיד/ה — טיוטה למסירה', () => {
  it('הכפתור והכותרת: "משוב אישי לתלמיד/ה" ו"טיוטה למסירה" — לא "כך התלמיד/ה רואה"', () => {
    expect(L.studentPreview).toBe('משוב אישי לתלמיד/ה')
    expect(V2_SHEETS_TEXT.feedback.title).toBe('משוב אישי לתלמיד/ה — טיוטה למסירה')
    for (const t of [L.studentPreview, V2_SHEETS_TEXT.feedback.title, V2_SHEETS_TEXT.feedback.intro]) expect(t).not.toContain('כך התלמיד')
  })

  it('הפתיח אומר מה עושים איתו (להדפיס, למסור, להראות) ושהמערכת לא שולחת אותו — ולא מבטיח שהתלמיד/ה רואה אותו במערכת', () => {
    const intro = V2_SHEETS_TEXT.feedback.intro
    expect(intro).toContain('טיוטה')
    expect(intro).toContain('להדפיס')
    expect(intro).toContain('למסור')
    expect(intro).toContain('המערכת לא שולחת אותה לתלמיד/ה')
    expect(intro).toContain('אין בה השוואה לתלמידים אחרים')
    expect(intro).not.toMatch(/התלמיד\/ה (רואה|יראה|מקבל)/)
  })

  it('הפריטים: אייקון של הערכה (svg) + מילה לכל סוג — צמיחה · התמדה · הצעד הבא — ובלי אימוג׳י', () => {
    const html = renderToStaticMarkup(<FeedbackItems data={FEEDBACK} />)
    expect(EMOJI.test(html)).toBe(false)
    expect((html.match(/<svg aria-hidden="true"/g) ?? []).length).toBe(3)
    for (const w of ['מתמטיקה · צמיחה', 'עברית · התמדה', 'היסטוריה · הצעד הבא']) expect(html.replace(/<[^>]+>/g, '')).toContain(w)
    expect(html).toContain('<h1')
    expect(html).toContain(FEEDBACK.headline)
  })

  it('שלושת סוגי הפריטים משתמשים באייקונים שונים', () => {
    const html = renderToStaticMarkup(<FeedbackItems data={FEEDBACK} />)
    const paths = [...html.matchAll(/<svg aria-hidden="true"[\s\S]*?<\/svg>/g)].map((m) => m[0])
    expect(new Set(paths).size).toBe(3)
  })
})

describe('הכנה לישיבה פדגוגית (תל״א)', () => {
  it('שם אחד ברור בכפתור; "תל״א" בסוגריים, בלי לוכסן', () => {
    expect(L.briefing).toBe('הכנה לישיבה פדגוגית (תל״א)')
    expect(L.briefing).not.toContain('/')
  })

  it('בכותרת המסמך (שמודפס איתו) תל״א מפוענח: תכנית לימודים אישית', () => {
    expect(V2_SHEETS_TEXT.briefing.student).toContain('תל״א')
    expect(V2_SHEETS_TEXT.briefing.student).toContain('תכנית לימודים אישית')
    expect(V2_SHEETS_TEXT.briefing.class).not.toContain('תל״א')
  })

  it('הסעיף שהיה "קשיים" נקרא "נקודות לשיחה" (לא תווית על התלמיד/ה), והסעיפים הריקים — במילים', () => {
    expect(BRIEFING_SECTION_TITLES.difficulties).toBe('נקודות לשיחה')
    expect(JSON.stringify(BRIEFING_SECTION_TITLES)).not.toContain('קשיים')
    expect(V2_SHEETS_TEXT.briefing.emptySection.difficulties).not.toContain('קושי')
    expect(V2_CLIENT_TEXT.briefingEmpty.title).toBeTruthy()
  })
})
