/* ──────────────────────────────────────────────────────────────────────────
   guard — שומר פלט דטרמיניסטי לסיכום ה-AI (חוקים 1, 2, 6, 7, 12). **שום פלט של מודל לא מוצג בלי לעבור כאן.**
   · מבנה: JSON {paragraphs:[{text, facts:[ids]}]}, 1–4 פסקאות עד 900 תווים, בעברית.
   · נרמול: כל פסקה עוברת נרמול לפני הבדיקות (NFKC, בלי ניקוד/תווי אפס-רוחב/כיוון, ספרות מכל כתב → ASCII), והטקסט שנשמר הוא המנורמל —
     כך ניקוד, תווי אפס-רוחב וספרות ערביות לא עוקפים את הרשימות.
   · ציטוט: כל פסקה מצטטת לפחות עובדה אחת, וכל המזהים קיימים (המודל לא ממציא).
   · מספרים: כל מספר בטקסט — ספרות, מילות מספר ("ארבעה", "עשרים ושלושה"), ספרות עבריות ("י״ב") — חייב להופיע בעובדות שצוטטו בפסקה (או להיות גודל המדגם).
     כמויות בלי מספר ("כמחצית", "שליש", "רוב", "כולם", "אף תלמיד") חייבות להיתמך ביחס "X מתוך Y" שבעובדות שצוטטו או במילה זהה בהן.
   · כיוון: "עלייה"/"ירידה" חייבות להופיע גם בעובדות שצוטטו; "יציב" נפסל רק כשהעובדות אומרות עלייה/ירידה ולא יציבות (סתירה). שם מקצוע חייב להופיע בעובדות הקלט (המודל לא ממציא מקצוע).
   · שפה: בלי מונחים טכניים (FORBIDDEN_UI_TERMS), בלי שפה קלינית/שיפוטית/סיבתית/השוואתית, עם סימון זהירות בכל פסקה.
   · צורה: בלי שמות (רשת ביטחון), בלי placeholder/Markdown/HTML/אימוג'י, בלי קישורים/אימייל/כתובות, ובלי מילים לטיניות שאינן בעובדות שצוטטו.
   כישלון → הקורא מנסה שוב פעם אחת עם רשימת ההפרות, ואחר כך נופל לתבנית (fallback.ts).
   pure: אין I/O. אין כאן משפטי ממשק — הקודים פנימיים, והניסוח למודל חי ב-prompt.ts.
   ────────────────────────────────────────────────────────────────────────── */
import { FORBIDDEN_CAUSAL, FORBIDDEN_CLINICAL, FORBIDDEN_COMPARISON, FORBIDDEN_JUDGMENTAL, FORBIDDEN_UI_TERMS, type ForbiddenTerm } from '../../../../src/shared/lib/forbiddenTerms.js'
import { extractJson } from '../questSchemas.js'
import {
  LINK_RE, QUANTITY_RATIO, QUANTITY_SUPPORT_WORD, claimedDirections, factDirections, gematriaValues, latinWordsIn, normalizeForCheck, numberWordsIn,
  nameRegexes, quantityClaims, subjectNamesIn, type QuantityKind,
} from './guardText.js'
import { numbersIn, type Fact, type SummaryInput } from './inputs.js'

export { nameRegexes }

export const GUARD_LIMITS = { minParagraphs: 1, maxParagraphs: 4, maxParagraphChars: 900, minHebrewShare: 0.85, minLetters: 12, maxFactsPerParagraph: 10 } as const

export type ViolationCode =
  | 'json' | 'shape' | 'paragraph_count' | 'paragraph_length' | 'language'
  | 'no_facts' | 'unknown_fact' | 'number_not_in_facts' | 'quantity_not_in_facts' | 'trend_not_in_facts' | 'subject_not_in_facts'
  | 'forbidden_ui' | 'clinical' | 'judgmental' | 'causal' | 'comparison'
  | 'no_caution' | 'markdown' | 'link' | 'emoji' | 'name' | 'placeholder'

export interface Violation { code: ViolationCode; /* 0-based, או null להפרה ברמת המסמך */ paragraph: number | null; detail: string }
export interface GuardResult { ok: boolean; paragraphs: string[]; /* מזהי העובדות שכל פסקה ציטטה */ cited: string[][]; violations: Violation[] }
export interface GuardOptions { /* שמות תלמידים שאסור שיופיעו (רשת ביטחון; ה-AI לא קיבל אותם) */ knownNames?: readonly string[] }
/* הקשר ברמת המסמך: כל טקסט העובדות שה-AI קיבל (לבדיקת שמות מקצוע) */
export interface ParagraphContext { allFactsText: string }

/* סימון זהירות (חוק 7): "נראה ש", "ייתכן ש", "הנתונים מראים/מצביעים", "לפי הנתונים", "עולה מהנתונים", "נצפה/נצפתה/נצפו".
   הרשימה המוצגת למודל ב-prompt.ts (CAUTION_PHRASES) חייבת להתאים לכאן — נבדק ב-guard.test.ts. */
export const CAUTION_RE = /נראה (?:ש|כי)|ייתכן (?:ש|כי)|הנתונים מראים|הנתונים מצביעים|לפי הנתונים|מהנתונים עולה|עולה מהנתונים|נצפ(?:ה|תה|ו)(?![א-ת])/
const MARKDOWN_RE = /(^|\n)\s{0,3}(?:[#>]|[-*+•]\s|\d+[.)]\s)|\*\*|__|`|<[^>]*>|https?:\/\//
const PLACEHOLDER_RE = /\[\[|\]\]|\{\{|\}\}|\$\{/
const EMOJI_RE = /\p{Extended_Pictographic}/u

/* נרמול טקסט הפסקה: שורות חדשות אחידות, רווחים, ואז נרמול הבדיקה (NFKC, ניקוד, אפס-רוחב, ספרות) */
const normalizeText = (s: string): string => normalizeForCheck(s.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ')).trim()

const hebrewShare = (text: string): { letters: number; share: number } => {
  const heb = (text.match(/[א-ת]/g) ?? []).length
  const latin = (text.match(/[A-Za-z]/g) ?? []).length
  const letters = heb + latin
  return { letters, share: letters ? heb / letters : 0 }
}

const LISTS: { code: ViolationCode; list: readonly ForbiddenTerm[] }[] = [
  { code: 'forbidden_ui', list: FORBIDDEN_UI_TERMS },
  { code: 'clinical', list: FORBIDDEN_CLINICAL },
  { code: 'judgmental', list: FORBIDDEN_JUDGMENTAL },
  { code: 'causal', list: FORBIDDEN_CAUSAL },
  { code: 'comparison', list: FORBIDDEN_COMPARISON },
]

const approx = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9

/* יחסים (חלק/שלם) שהעובדות שצוטטו תומכות בהם: רק עובדות שמנסחות "X מתוך Y" ("מתוך"/"מבין"); השלם = המספר הגדול בעובדה, החלקים = היתר.
   מספר שווה לשלם (כולם) נחשב יחס 1; אפס בעובדה (0 מתוך Y) = יחס 0 */
function ratiosOf(facts: Fact[]): number[] {
  const out: number[] = []
  for (const f of facts) {
    if (!/מתוך|מבין/.test(f.text) || f.numbers.length < 2) continue
    const whole = Math.max(...f.numbers)
    if (whole <= 0) continue
    /* האיבר הגדול הוא השלם עצמו (לא חלק); שווה לו נוסף = חלק שלם (יחס 1) */
    const wholeAt = f.numbers.indexOf(whole)
    f.numbers.forEach((n, i) => { if (i !== wholeAt) out.push(n / whole) })
  }
  return out
}

function quantitySupported(kind: QuantityKind, cited: Fact[], citedText: string): boolean {
  const word = QUANTITY_SUPPORT_WORD[kind]
  if (word && word.test(citedText)) return true
  if (kind === 'none' && cited.some((f) => f.numbers.includes(0))) return true
  const [lo, hi] = QUANTITY_RATIO[kind]
  return ratiosOf(cited).some((r) => r >= lo - 1e-9 && r <= hi + 1e-9 && !(kind === 'majority' && r >= 1) && !(kind === 'minority' && r <= 0))
}

/* ניסוחי הסתייגות של המערכת עצמה בעובדות ("הנתונים אינם מסבירים מה גרם לכך") — שולל סיבה, לא טוען סיבה, ולכן לא נבדק מול רשימת הסיבתיות */
const SYSTEM_HEDGES = /הנתונים אינם מסבירים (?:את הסיבה|מה גרם לכך)/g

/* בדיקת טקסט פסקה אחד מול העובדות שציטטה. מחזיר הפרות (ריק = תקין). הטקסט מנורמל כבר (parseAndGuard); קריאה ישירה מנרמלת שוב — אידמפוטנטי */
export function checkParagraph(rawText: string, index: number, citedFacts: Fact[], sampleSize: number, nameRes: RegExp[], ctx: ParagraphContext = { allFactsText: '' }): Violation[] {
  const text = normalizeText(rawText)
  const v: Violation[] = []
  const add = (code: ViolationCode, detail: string): void => { v.push({ code, paragraph: index, detail }) }
  if (text.length > GUARD_LIMITS.maxParagraphChars) add('paragraph_length', String(text.length))
  const citedText = citedFacts.map((f) => normalizeForCheck(f.text)).join(' ')
  const citedLower = citedText.toLowerCase()
  /* מילה לטינית שמצוטטת בעובדה (כותרת אתגר באנגלית) לא נחשבת "לא-עברית" בחישוב חלק העברית */
  const { letters, share } = hebrewShare(text.replace(/[A-Za-z]{4,}/g, (w) => (citedLower.includes(w.toLowerCase()) ? '' : w)))
  if (letters < GUARD_LIMITS.minLetters || share < GUARD_LIMITS.minHebrewShare) add('language', share.toFixed(2))

  const allowed = [sampleSize, ...citedFacts.flatMap((f) => f.numbers)]
  const isAllowed = (n: number): boolean => allowed.some((a) => approx(a, n))
  /* מספרים: ספרות, מילות מספר, ספרות עבריות — כולם אל אותה קבוצה מותרת. מילת מספר שמופיעה כלשונה בעובדה שצוטטה (בכותרת טעות/יעד: "שני צדדים") אינה המצאה */
  const found = new Set<number>([...numbersIn(text), ...gematriaValues(text)])
  for (const n of found) if (!isAllowed(n)) add('number_not_in_facts', String(n))
  for (const nw of numberWordsIn(text)) if (!isAllowed(nw.value) && !citedText.includes(nw.words)) add('number_not_in_facts', String(nw.value))
  /* כמויות ושברים בלי מספר */
  for (const kind of quantityClaims(text)) if (!quantitySupported(kind, citedFacts, citedText)) add('quantity_not_in_facts', kind)
  /* כיוון מגמה */
  /* עלייה/ירידה חייבות להופיע בעובדה שצוטטה. "יציב" — רק סתירה נתפסת: העובדות אומרות עלייה/ירידה ואף אחת לא אומרת יציבות
     (טענת יציבות בלי עובדת מגמה היא ניסוח כללי נפוץ שנמדד כמקור הפסילות הנפוץ ביותר בקבלה החיה, ואינה הופכת כיוון) */
  const factDirs = factDirections(citedText)
  for (const d of claimedDirections(text)) {
    if (factDirs.has(d)) continue
    if (d === 'steady' && !factDirs.has('up') && !factDirs.has('down')) continue
    add('trend_not_in_facts', d)
  }
  /* שמות מקצוע שלא בקלט */
  const allFacts = normalizeForCheck(ctx.allFactsText)
  for (const s of subjectNamesIn(text)) if (!allFacts.includes(s)) add('subject_not_in_facts', s)

  const worded = text.replace(SYSTEM_HEDGES, ' ')
  for (const { code, list } of LISTS) for (const t of list) if (t.re.test(worded)) add(code, t.name)
  if (!CAUTION_RE.test(text)) add('no_caution', '')
  if (MARKDOWN_RE.test(text)) add('markdown', '')
  if (LINK_RE.test(text)) add('link', '')
  /* מילים לטיניות (4+ אותיות) מותרות רק אם הן מצוטטות בעובדה (למשל כותרת אתגר באנגלית) */
  for (const w of new Set(latinWordsIn(text))) if (!citedLower.includes(w.toLowerCase())) add('language', 'latin')
  if (PLACEHOLDER_RE.test(text)) add('placeholder', '')
  if (EMOJI_RE.test(text)) add('emoji', '')
  if (nameRes.some((re) => re.test(text))) add('name', '')
  return v
}

export function parseAndGuard(raw: string, input: SummaryInput, opts: GuardOptions = {}): GuardResult {
  const fail = (violations: Violation[], paragraphs: string[] = [], cited: string[][] = []): GuardResult => ({ ok: false, paragraphs, cited, violations })
  let parsed: unknown
  try { parsed = extractJson(raw) } catch { return fail([{ code: 'json', paragraph: null, detail: '' }]) }
  const arr = (parsed as { paragraphs?: unknown } | null)?.paragraphs
  if (!Array.isArray(arr) || arr.length === 0) return fail([{ code: 'shape', paragraph: null, detail: 'paragraphs' }])

  const violations: Violation[] = []
  if (arr.length > GUARD_LIMITS.maxParagraphs) violations.push({ code: 'paragraph_count', paragraph: null, detail: String(arr.length) })
  const byId = new Map(input.facts.map((f) => [f.id, f]))
  const nameRes = nameRegexes(opts.knownNames ?? [])
  const ctx: ParagraphContext = { allFactsText: input.facts.map((f) => f.text).join(' ') }
  const paragraphs: string[] = []
  const cited: string[][] = []

  arr.slice(0, GUARD_LIMITS.maxParagraphs + 1).forEach((p, i) => {
    const obj = p as { text?: unknown; facts?: unknown } | null
    if (!obj || typeof obj.text !== 'string' || normalizeText(obj.text).length === 0) {
      violations.push({ code: 'shape', paragraph: i, detail: 'text' })
      return
    }
    const text = normalizeText(obj.text)
    const ids = Array.isArray(obj.facts) ? obj.facts.filter((x): x is string => typeof x === 'string') : []
    if (ids.length === 0) violations.push({ code: 'no_facts', paragraph: i, detail: '' })
    if (ids.length > GUARD_LIMITS.maxFactsPerParagraph) violations.push({ code: 'shape', paragraph: i, detail: 'facts' })
    const unknown = ids.filter((id) => !byId.has(id))
    for (const id of unknown) violations.push({ code: 'unknown_fact', paragraph: i, detail: id })
    const known = ids.filter((id) => byId.has(id)).map((id) => byId.get(id) as Fact)
    violations.push(...checkParagraph(text, i, known, input.sampleSize, nameRes, ctx))
    paragraphs.push(text)
    cited.push(ids)
  })

  if (violations.length > 0) return fail(violations, paragraphs, cited)
  return { ok: true, paragraphs, cited, violations: [] }
}
