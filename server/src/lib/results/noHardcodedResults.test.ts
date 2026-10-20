import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEMO_QUESTS, DEMO_SUBJECT_TEACHERS } from './demoCatalog.js'

/* חוק שלב UX/D: אסור משפטים בעברית בקוד ספק ההדגמה. כל טקסט שמוצג למשתמש (סיכום, תשומת לב, "זמין מתאריך") מגיע מ-findingsNarrative.ts
   דרך ליבת התוצאות. תוכן ההדמיות עצמן (שאלות, נרטיב, תשובות) הוא נתוני דומיין ומקומו demoCatalog.ts בלבד. */
const here = (f: string): string => fileURLToPath(new URL(f, import.meta.url))
const read = (f: string): string => readFileSync(here(f), 'utf8')
const strip = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
/* מחרוזת עם שתי מילים עבריות ויותר = משפט */
const SENTENCE = /(['"`])(?:(?!\1)[^\n])*?[א-ת]{2,}[ ,][א-ת]{2,}(?:(?!\1)[^\n])*?\1/g
const ANY_HEBREW = /['"`][^'"`\n]*[א-ת][^'"`\n]*['"`]/g

describe('ספק ההדגמה של התוצאות: אין טקסט קשיח', () => {
  it('demoResults.ts: אין משפטים בעברית (ובכלל — אין מחרוזת עברית; ההודעה היחידה מיובאת מהספק האמיתי)', () => {
    const code = strip(read('./demoResults.ts'))
    expect(code.match(SENTENCE) ?? [], 'משפטים').toEqual([])
    expect(code.match(ANY_HEBREW) ?? [], 'מחרוזות עבריות').toEqual([])
  })

  it('demoResults.ts ו-demoCatalog.ts: דטרמיניסטי — בלי Date.now / Math.random / new Date() בלי ארגומנט', () => {
    for (const f of ['./demoResults.ts', './demoCatalog.ts']) {
      const code = strip(read(f))
      expect(code, f).not.toMatch(/Date\.now\s*\(/)
      expect(code, f).not.toMatch(/Math\.random\s*\(/)
      expect(code, f).not.toMatch(/new Date\(\s*\)/)
    }
  })

  it('demoResults.ts: קריאה בלבד — אין חיבור ל-DB ואין כתיבה', () => {
    const code = strip(read('./demoResults.ts'))
    expect(code).not.toMatch(/supabase/i)
    expect(code).not.toMatch(/\.(insert|update|upsert|delete)\s*\(/)
    expect(code).not.toMatch(/process\.env\.\w+\s*=[^=]/)
  })

  it('demoResults.ts: הליבה היא core.ts — אין חישוב ספירות/סיכומים בקובץ', () => {
    const code = strip(read('./demoResults.ts'))
    for (const fn of ['buildClassView', 'buildListRow', 'buildStudentView']) expect(code).toContain(fn)
    for (const banned of ['narrateClassSummary', 'narrateListSummary', 'narrateStudentSummary', 'howWeCalcResultsLines', 'attentionReasonText']) expect(code).not.toContain(banned)
  })
})

describe('demoCatalog.ts: תוכן דומיין בלבד — אין ממצאים או משפטי סיכום', () => {
  /* ניסוחים שמקומם בלעדית ב-findingsNarrative (סיכומי תוצאות, תשומת לב, הסברי חישוב) */
  const NARRATIVE_PHRASES = [
    'סיימו עד עכשיו', 'רוב הכיתה', 'התקשה', 'האתגר הקשה', 'התוצאות יופיעו', 'פתר/ה', 'ויתר/ה', 'תשומת לב', 'עוד לא התחיל', 'פירוט התשובות זמין',
    'טעות נפוצה', 'מתוך', 'הצליחו', 'איך חישבנו',
  ]
  function* texts(): Generator<string> {
    for (const q of DEMO_QUESTS) {
      yield q.title
      for (const o of q.objectives ?? []) yield o.text
      for (const s of q.scenes) {
        yield s.title; yield s.narrative
        const p = s.puzzle
        if (!p) continue
        yield p.question
        if (p.kind === 'choice') for (const o of p.options) yield o.text
        if (p.kind === 'quiz') for (const qq of p.questions) { yield qq.question; yield* qq.options }
        if (p.kind === 'moral') { yield p.situation; yield* p.choices }
      }
    }
    yield* Object.values(DEMO_SUBJECT_TEACHERS) as string[]
  }

  it('אף טקסט בקטלוג אינו ניסוח של סיכום/ממצא/תשומת לב', () => {
    for (const t of texts()) for (const phrase of NARRATIVE_PHRASES) expect(t.includes(phrase), `${phrase} ⊂ ${t}`).toBe(false)
  })

  it('אין מונחים טכניים/סטטיסטיים בתוכן ההדמיות', () => {
    const FORBIDDEN = [/וקטור/, /מובהק/, /BH/, /אינדקס/, /קורלציה/, /הסתברות/, /אפקט/, /סטטיסט/, /מתוקן/, /מסיח/, /\bN\s*=/]
    for (const t of texts()) for (const re of FORBIDDEN) expect(re.test(t), t).toBe(false)
  })

  it('אין תאריכים מוחלטים בקטלוג (רק היסטים של ימי לימוד)', () => {
    const src = strip(read('./demoCatalog.ts'))
    expect(src).not.toMatch(/\b20\d\d-\d\d-\d\d/)
    expect(src).not.toMatch(/new Date\(/)
  })
})
