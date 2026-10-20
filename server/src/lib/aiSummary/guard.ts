/* ──────────────────────────────────────────────────────────────────────────
   guard — שומר פלט דטרמיניסטי לסיכום ה-AI (חוקים 1, 2, 6, 7, 12). **שום פלט של מודל לא מוצג בלי לעבור כאן.**
   · מבנה: JSON {paragraphs:[{text, facts:[ids]}]}, 1–4 פסקאות עד 900 תווים, בעברית.
   · ציטוט: כל פסקה מצטטת לפחות עובדה אחת, וכל המזהים קיימים (המודל לא ממציא).
   · מספרים: כל מספר בטקסט חייב להופיע בעובדות שצוטטו בפסקה (או להיות גודל המדגם) — אין חישוב/עיגול/המצאה.
   · שפה: בלי מונחים טכניים (FORBIDDEN_UI_TERMS), בלי שפה קלינית/שיפוטית/סיבתית/השוואתית, עם סימון זהירות בכל פסקה.
   · צורה: בלי שמות (רשת ביטחון), בלי placeholder/Markdown/HTML/אימוג'י.
   כישלון → הקורא מנסה שוב פעם אחת עם רשימת ההפרות, ואחר כך נופל לתבנית (fallback.ts).
   pure: אין I/O. אין כאן משפטי ממשק — הקודים פנימיים, והניסוח למודל חי ב-prompt.ts.
   ────────────────────────────────────────────────────────────────────────── */
import { FORBIDDEN_CAUSAL, FORBIDDEN_CLINICAL, FORBIDDEN_COMPARISON, FORBIDDEN_JUDGMENTAL, FORBIDDEN_UI_TERMS, type ForbiddenTerm } from '../../../../src/shared/lib/forbiddenTerms.js'
import { extractJson } from '../questSchemas.js'
import { numbersIn, type Fact, type SummaryInput } from './inputs.js'

export const GUARD_LIMITS = { minParagraphs: 1, maxParagraphs: 4, maxParagraphChars: 900, minHebrewShare: 0.85, minLetters: 12, maxFactsPerParagraph: 8 } as const

export type ViolationCode =
  | 'json' | 'shape' | 'paragraph_count' | 'paragraph_length' | 'language'
  | 'no_facts' | 'unknown_fact' | 'number_not_in_facts'
  | 'forbidden_ui' | 'clinical' | 'judgmental' | 'causal' | 'comparison'
  | 'no_caution' | 'markdown' | 'emoji' | 'name' | 'placeholder'

export interface Violation { code: ViolationCode; /* 0-based, או null להפרה ברמת המסמך */ paragraph: number | null; detail: string }
export interface GuardResult { ok: boolean; paragraphs: string[]; /* מזהי העובדות שכל פסקה ציטטה */ cited: string[][]; violations: Violation[] }
export interface GuardOptions { /* שמות תלמידים שאסור שיופיעו (רשת ביטחון; ה-AI לא קיבל אותם) */ knownNames?: readonly string[] }

/* סימון זהירות (חוק 7): "נראה ש", "ייתכן ש", "הנתונים מראים/מצביעים", "לפי הנתונים", "עולה מהנתונים", "נצפה/נצפתה/נצפו".
   הרשימה המוצגת למודל ב-prompt.ts (CAUTION_PHRASES) חייבת להתאים לכאן — נבדק ב-guard.test.ts. */
export const CAUTION_RE = /נראה ש|ייתכן ש|הנתונים מראים|הנתונים מצביעים|לפי הנתונים|מהנתונים עולה|עולה מהנתונים|נצפ(?:ה|תה|ו)(?![א-ת])/
const MARKDOWN_RE = /(^|\n)\s{0,3}(?:[#>]|[-*+•]\s|\d+[.)]\s)|\*\*|__|`|<[^>]*>|https?:\/\//
const PLACEHOLDER_RE = /\[\[|\]\]|\{\{|\}\}|\$\{/
const EMOJI_RE = /\p{Extended_Pictographic}/u

/* גבולות מילה עבריים + תחיליות (נבנים מליטרלי regex, לא ממחרוזות עבריות) */
const NOT_AFTER_HEBREW = /(?<![א-ת])/.source
const NOT_BEFORE_HEBREW = /(?![א-ת])/.source
const NAME_PREFIX = /[הובלכמש]{0,2}/.source

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/* שם: מילה שלמה, עם עד שתי אותיות תחילית עבריות (ה/ו/ב/ל/כ/מ/ש — "שלדנה", "ובדנה"). אסימונים קצרים מ-3 אותיות לא נבדקים (שיירי מילים נפוצות) */
export function nameRegexes(names: readonly string[]): RegExp[] {
  const out: RegExp[] = []
  const seen = new Set<string>()
  const push = (token: string): void => {
    const t = token.trim()
    if (t.length < 3 || seen.has(t)) return
    seen.add(t)
    out.push(new RegExp(`${NOT_AFTER_HEBREW}${NAME_PREFIX}${escapeRe(t)}${NOT_BEFORE_HEBREW}`))
  }
  for (const n of names) {
    push(n)
    for (const tok of n.split(/[\s\-–]+/)) push(tok)
  }
  return out
}

const normalizeText = (s: string): string => s.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim()

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

/* בדיקת טקסט פסקה אחד מול העובדות שציטטה. מחזיר הפרות (ריק = תקין) */
export function checkParagraph(text: string, index: number, citedFacts: Fact[], sampleSize: number, nameRes: RegExp[]): Violation[] {
  const v: Violation[] = []
  const add = (code: ViolationCode, detail: string): void => { v.push({ code, paragraph: index, detail }) }
  if (text.length > GUARD_LIMITS.maxParagraphChars) add('paragraph_length', String(text.length))
  const { letters, share } = hebrewShare(text)
  if (letters < GUARD_LIMITS.minLetters || share < GUARD_LIMITS.minHebrewShare) add('language', share.toFixed(2))

  const allowed = new Set<number>([sampleSize, ...citedFacts.flatMap((f) => f.numbers)])
  for (const n of new Set(numbersIn(text))) {
    if (![...allowed].some((a) => Math.abs(a - n) < 1e-9)) add('number_not_in_facts', String(n))
  }
  for (const { code, list } of LISTS) for (const t of list) if (t.re.test(text)) add(code, t.name)
  if (!CAUTION_RE.test(text)) add('no_caution', '')
  if (MARKDOWN_RE.test(text)) add('markdown', '')
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
    violations.push(...checkParagraph(text, i, known, input.sampleSize, nameRes))
    paragraphs.push(text)
    cited.push(ids)
  })

  if (violations.length > 0) return fail(violations, paragraphs, cited)
  return { ok: true, paragraphs, cited, violations: [] }
}
