/* ──────────────────────────────────────────────────────────────────────────
   guardText — עזרי טקסט טהורים לשומר הפלט (guard.ts): נרמול לפני כל בדיקה, זיהוי מספרים בכל צורה (ספרות מכל כתב, מילות מספר, שברים וכמויות),
   כיוון מגמה, ושמות מקצוע. pure: אין I/O ואין משפטי ממשק (המילים כאן הן תבניות זיהוי בלבד).
   למה: הבדיקה הישנה זיהתה רק ספרות ASCII, ולכן "ארבעה תלמידים", "כחצי מההדמיות", ספרות full-width/ערביות, ו"נצפתה עלייה" על עובדה שאומרת ירידה — כולם עברו.
   כל מה שמוחזר כאן הוא **טענה שהטקסט מציג**; ההחלטה אם היא נתמכת בעובדות שצוטטו נעשית ב-guard.ts.
   ────────────────────────────────────────────────────────────────────────── */
import { SUBJECTS } from '../../../../src/shared/lib/subjects.js'

/* ── נרמול ──
   NFKC (ספרות full-width, ליגטורות, צורות תצוגה), הסרת תווי אפס-רוחב וכיוון, הסרת ניקוד וטעמי מקרא (ה"מקף" העברי הופך למקף רגיל),
   המרת ספרות מכל כתב לספרות ASCII. כך ניקוד, תווי אפס-רוחב וספרות ערביות לא עוקפים את הרשימות. */
/* מחלקת תווים מטווחי קודים (בלי להטמיע תווים בלתי-נראים בקוד המקור) */
const charClass = (ranges: [number, number][]): RegExp =>
  new RegExp(`[${ranges.map(([a, b]) => String.fromCodePoint(a) + (b > a ? `-${String.fromCodePoint(b)}` : '')).join('')}]`, 'g')
/* soft hyphen · תווי אפס-רוחב וכיוון (200B-200F, 202A-202E, 2060-2064, 2066-2069) · BOM */
const FORMAT_CHARS = charClass([[0x00ad, 0x00ad], [0x200b, 0x200f], [0x202a, 0x202e], [0x2060, 0x2064], [0x2066, 0x2069], [0xfeff, 0xfeff]])
/* ניקוד וטעמי מקרא (0591-05BD, 05BF, 05C1-05C2, 05C4-05C5, 05C7) — לא כולל המקף העברי 05BE */
const HEBREW_MARKS = charClass([[0x0591, 0x05bd], [0x05bf, 0x05bf], [0x05c1, 0x05c2], [0x05c4, 0x05c5], [0x05c7, 0x05c7]])
const MAQAF = String.fromCodePoint(0x05be)
const GERSHAYIM = String.fromCodePoint(0x05f4)
const GERESH = String.fromCodePoint(0x05f3)
/* קוד התו "0" של כל בלוק ספרות נפוץ (לכל בלוק 10 ספרות רצופות) */
const DIGIT_ZEROS = [0x0660, 0x06f0, 0x07c0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66, 0x0e50, 0x0ed0, 0x0f20, 0x1040, 0x17e0, 0x1810, 0xff10] as const

function digitsToAscii(s: string): string {
  return s.replace(/\p{Nd}/gu, (d) => {
    const cp = d.codePointAt(0) as number
    for (const z of DIGIT_ZEROS) if (cp >= z && cp <= z + 9) return String(cp - z)
    return d
  })
}

export function normalizeForCheck(s: string): string {
  /* גרש וגרשיים עבריים (׳ ״) הופכים לתווי ASCII (' "), כדי ש-"תנ״ך" ו-'תנ"ך' יזוהו כאותו שם */
  return digitsToAscii(s.normalize('NFKC').replace(FORMAT_CHARS, '').replaceAll(MAQAF, '-').replace(HEBREW_MARKS, '').replaceAll(GERSHAYIM, '"').replaceAll(GERESH, "'"))
}

/* ── חיתוך למילים ── */
const WORD_SPLIT = /[\s,.;:!?()"'״׳–—\-/]+/u
export const wordsOf = (text: string): string[] => text.split(WORD_SPLIT).filter((w) => w.length > 0)

/* תחיליות עבריות (ה/ו/ב/ל/כ/מ/ש): עד שתיים. מחזיר את המילה כפי שהיא ואת הגרסאות בלי תחילית, עם האותיות שהוסרו */
const PREFIX_LETTERS = 'הובלכמש'
function stripped(word: string): { base: string; prefix: string }[] {
  const out = [{ base: word, prefix: '' }]
  for (let n = 1; n <= 2 && n < word.length; n++) {
    const p = word.slice(0, n)
    if ([...p].every((c) => PREFIX_LETTERS.includes(c))) out.push({ base: word.slice(n), prefix: p })
    else break
  }
  return out
}

/* ── מילות מספר ── */
const UNIT_WORDS: Record<string, number> = {
  שניים: 2, שתיים: 2, שני: 2, שתי: 2,
  שלושה: 3, שלוש: 3, שלושת: 3, ארבעה: 4, ארבע: 4, ארבעת: 4, חמישה: 5, חמש: 5, חמשת: 5,
  שישה: 6, שש: 6, ששת: 6, שבעה: 7, שבע: 7, שבעת: 7, שמונה: 8, שמונת: 8, תשעה: 9, תשע: 9, תשעת: 9, עשרה: 10, עשר: 10, עשרת: 10,
}
const ONE_WORDS = new Set(['אחד', 'אחת'])
const TENS_WORDS: Record<string, number> = { עשרים: 20, שלושים: 30, ארבעים: 40, חמישים: 50, שישים: 60, שבעים: 70, שמונים: 80, תשעים: 90, מאה: 100, מאתיים: 200, אלף: 1000, אלפיים: 2000 }
/* 11–19: "אחד עשר", "שתים עשרה", "שלוש עשרה" */
const TEEN_UNITS: Record<string, number> = {
  אחד: 11, אחת: 11, שנים: 12, שתים: 12, שניים: 12, שתיים: 12, שלושה: 13, שלוש: 13, ארבעה: 14, ארבע: 14, חמישה: 15, חמש: 15,
  שישה: 16, שש: 16, שבעה: 17, שבע: 17, שמונה: 18, תשעה: 19, תשע: 19,
}
/* "אחד/אחת" הם מספר רק לצד שם עצם נספר ("תלמיד אחד") או לפני "מתוך"; אחרת זה "אחד התחומים" (ניסוח רגיל) */
const COUNTED_NOUNS = new Set(['תלמיד', 'תלמידה', 'אתגר', 'מקצוע', 'כיתה', 'שיעור', 'פעם', 'תחום', 'נושא', 'שאלה', 'סצנה', 'משימה', 'טעות', 'שבוע', 'חודש', 'מקרה'])

const lookup = <T,>(table: Record<string, T>, word: string): { value: T; prefix: string } | null => {
  for (const { base, prefix } of stripped(word)) if (Object.prototype.hasOwnProperty.call(table, base)) return { value: table[base], prefix }
  return null
}

/* מילת מספר שנמצאה בטקסט: הערך, והמילה/ים כפי שנכתבו (להשוואה לטקסט העובדות — מילת מספר שמצוטטת מכותרת בעובדה אינה המצאה) */
export interface NumberWord { value: number; words: string }

/* כל מילות המספר בטקסט (ללא ספרות). "עשרים ושלושה" = 23, "שלוש עשרה" = 13, "תלמיד אחד" = 1 */
export function numberWordsIn(text: string): NumberWord[] {
  const w = wordsOf(text)
  const out: NumberWord[] = []
  for (let i = 0; i < w.length; i++) {
    const next = w[i + 1]
    const nextBase = next ? stripped(next).map((x) => x.base) : []
    /* 11–19 */
    const teen = lookup(TEEN_UNITS, w[i])
    if (teen && next && (nextBase.includes('עשר') || nextBase.includes('עשרה'))) { out.push({ value: teen.value, words: `${w[i]} ${next}` }); i++; continue }
    /* עשרות (+ ו-יחידה) */
    const tens = lookup(TENS_WORDS, w[i])
    if (tens) {
      let v = tens.value
      let words = w[i]
      if (next && next.startsWith('ו')) {
        const unit = lookup(UNIT_WORDS, next.slice(1))
        if (unit && !unit.prefix) { v += unit.value; words += ` ${next}`; i++ } else if (ONE_WORDS.has(next.slice(1))) { v += 1; words += ` ${next}`; i++ }
      }
      out.push({ value: v, words })
      continue
    }
    /* אחד/אחת */
    const one = stripped(w[i]).find((x) => ONE_WORDS.has(x.base))
    if (one) {
      const prev = w[i - 1] ? stripped(w[i - 1]).map((x) => x.base) : []
      if (prev.some((b) => COUNTED_NOUNS.has(b)) || nextBase.includes('מתוך')) out.push({ value: 1, words: w[i] })
      continue
    }
    const unit = lookup(UNIT_WORDS, w[i])
    if (unit) {
      /* "השני"/"השתי" — מספר סידורי ("המקצוע השני"), לא כמות */
      if (unit.value === 2 && unit.prefix.includes('ה')) continue
      out.push({ value: unit.value, words: w[i] })
    }
  }
  return out
}

/* ── ספרות עבריות (גימטריה): "י״ב" = 12. רק צורה תקפה של מספר (אותיות לא סופיות, בסדר יורד), ובלי קיצורים נפוצים ("ע״י") ── */
const GEMATRIA: Record<string, number> = { א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9, י: 10, כ: 20, ל: 30, מ: 40, נ: 50, ס: 60, ע: 70, פ: 80, צ: 90, ק: 100, ר: 200, ש: 300, ת: 400 }
const GEMATRIA_ABBREVIATIONS = new Set(['עי', 'בעמ', 'זל', 'דר', 'גכ', 'תנך', 'צהל', 'וכו'])
export function gematriaValues(text: string): number[] {
  const out: number[] = []
  for (const m of text.matchAll(/(?<![א-ת])([א-ת]{1,3})["״]([א-ת])(?![א-ת])/g)) {
    const letters = [...m[1], m[2]]
    if (GEMATRIA_ABBREVIATIONS.has(letters.join(''))) continue
    if (!letters.every((c) => c in GEMATRIA)) continue
    const vals = letters.map((c) => GEMATRIA[c])
    if (vals.some((v, i) => i > 0 && v > vals[i - 1])) continue
    const sum = vals.reduce((a, b) => a + b, 0)
    if (sum >= 10) out.push(sum)
  }
  return out
}

/* ── כמויות ושברים בלי מספר ("כמחצית", "רוב התלמידים", "כולם", "אף תלמיד") ── */
export type QuantityKind = 'half' | 'third' | 'two_thirds' | 'quarter' | 'three_quarters' | 'majority' | 'minority' | 'all' | 'none'
const QUANTITY_PATTERNS: { kind: QuantityKind; re: RegExp }[] = [
  { kind: 'half', re: /(?<![א-ת])[הובלכמש]{0,2}(?:מחצית|חצי)\s+מ/ },
  { kind: 'third', re: /(?<![א-ת])[הובלכמש]{0,2}שליש(?![א-ת])(?!\s+ה?(?:אחרון|ראשון))/ },
  { kind: 'two_thirds', re: /(?<![א-ת])[הובלכמש]{0,2}שני\s+שלישים/ },
  { kind: 'quarter', re: /(?<![א-ת])[הובלכמש]{0,2}רבע(?![א-ת])/ },
  { kind: 'three_quarters', re: /(?<![א-ת])[הובלכמש]{0,2}שלושה\s+רבעים|(?<![א-ת])[הובלכמש]{0,2}שלושת\s+רבעי/ },
  { kind: 'majority', re: /(?<![א-ת])[הובלכמש]{0,2}רוב(?:ם|ן)?(?![א-ת])/ },
  { kind: 'minority', re: /(?<![א-ת])[הובלכמש]{0,2}מיעוט(?:ם|ן)?(?![א-ת])/ },
  { kind: 'all', re: /(?<![א-ת])[הובלכמש]{0,2}(?:כולם|כולן)(?![א-ת])|(?<![א-ת])[הובלכמש]{0,2}כל\s+(?:התלמידים|התלמידות|הילדים)(?![א-ת])/ },
  { kind: 'none', re: /(?<![א-ת])[הובלכמש]{0,2}אף\s+(?:אחד|אחת|תלמיד|תלמידה)(?![א-ת])/ },
]
export const quantityClaims = (text: string): QuantityKind[] => QUANTITY_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.kind)

/* טווח היחס (חלק/שלם) שתומך בכל כמות. majority/minority נבדקות בנפרד (גם מילה זהה בעובדה תומכת) */
export const QUANTITY_RATIO: Record<QuantityKind, [number, number]> = {
  half: [0.4, 0.6], third: [0.27, 0.4], two_thirds: [0.58, 0.75], quarter: [0.2, 0.3], three_quarters: [0.68, 0.82],
  majority: [0.5001, 1], minority: [0, 0.4999], all: [1, 1], none: [0, 0],
}
/* מילה שמופיעה כבר בעובדה שצוטטה ("הצליחו ברוב האתגרים") תומכת בה ללא חישוב יחס */
export const QUANTITY_SUPPORT_WORD: Partial<Record<QuantityKind, RegExp>> = {
  majority: /רוב/, minority: /מעט|מיעוט/, all: /כולם|כולן|כל\s+התלמידים/,
}

/* ── כיוון מגמה ── */
export type Direction = 'up' | 'down' | 'steady'
const DIRECTION_WORDS: Record<Direction, RegExp> = {
  up: /^(?:עלי(?:ה|יה)|עלתה|עלו|עלה|משתפר(?:ת|ים|ות)?|השתפר(?:ה|ו)?|התקדם(?:ה|ו)?|התחזק(?:ה|ו)?)$/,
  down: /^(?:ירידה|ירידות|יורד(?:ת|ים|ות)?|ירדה|ירדו|ירד|נחלש(?:ה|ו)?|התדרדר(?:ה|ו)?|הידרדר(?:ה|ו)?|נסוג(?:ה)?|צניחה|צנח(?:ה|ו)?|הרעה|הורע(?:ה)?|פחת(?:ה|ו)?)$/,
  steady: /^(?:יציב(?:ה|ים|ות)?|יציבות)$/,
}
const NEGATIONS = new Set(['ללא', 'אין', 'בלי', 'לא', 'ואין', 'ולא', 'שלא', 'אינה', 'אינו', 'אינם', 'אינן', 'איננה', 'איננו'])

const directionOfWord = (w: string): Direction | null => {
  for (const { base } of stripped(w)) for (const d of ['up', 'down', 'steady'] as const) if (DIRECTION_WORDS[d].test(base)) return d
  return null
}
/* כיווני המגמה שהטקסט **טוען**. כיוון שמופיע אחרי שלילה ("ללא ירידה", "אין שינוי") אינו טענה */
export function claimedDirections(text: string): Set<Direction> {
  const w = wordsOf(text)
  const out = new Set<Direction>()
  w.forEach((word, i) => {
    const d = directionOfWord(word)
    if (!d) return
    /* שלילה עד שלוש מילים לפני ("אינם מצביעים על ירידה", "ללא ירידה", "אף תלמיד לא בירידה") */
    if ([1, 2, 3].some((k) => NEGATIONS.has(w[i - k] ?? ''))) return
    out.add(d)
  })
  return out
}
/* כיווני המגמה שהעובדות מכילות (בלי התחשבות בשלילה: עובדה היא ניסוח של המערכת) */
export function factDirections(text: string): Set<Direction> {
  const out = new Set<Direction>()
  for (const word of wordsOf(text)) { const d = directionOfWord(word); if (d) out.add(d) }
  return out
}

/* ── שמות מקצוע ── */
export const SUBJECT_NAMES: readonly string[] = SUBJECTS.filter((s) => s.code !== 'other').map((s) => normalizeForCheck(s.nameHe))
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const SUBJECT_RES: { name: string; re: RegExp }[] = SUBJECT_NAMES.map((name) => ({ name, re: new RegExp(`(?<![א-ת])[הובלכמש]{0,3}${escapeRe(name)}(?![א-ת])`) }))
/* שמות מקצוע מהרשימה הסגורה שמופיעים בטקסט */
export const subjectNamesIn = (text: string): string[] => SUBJECT_RES.filter((s) => s.re.test(text)).map((s) => s.name)

/* ── קישורים, אימייל, כתובות ── */
export const LINK_RE = /@|\]\(|https?:\/\/|(?<![A-Za-z0-9-])(?:www\.|[a-z0-9-]+\.[a-z]{2,}\b)/i
/* רצפים לטיניים באורך 4+ (בטקסט עברי אסורים, אלא אם הם מופיעים בעובדה שצוטטה) */
export const latinWordsIn = (text: string): string[] => text.match(/[A-Za-z]{4,}/g) ?? []

/* ── שמות ──
   גבולות מילה עבריים + תחיליות (נבנים מליטרל regex, לא ממחרוזות עבריות). עד שלוש תחיליות: "וכשדנה" = ו+כ+ש */
const NOT_AFTER_HEBREW = /(?<![א-ת])/.source
const NOT_BEFORE_HEBREW = /(?![א-ת])/.source
const NAME_PREFIX = /[הובלכמש]{0,3}/.source

/* שם: מילה שלמה, עם עד שלוש אותיות תחילית עבריות ("שלדנה", "ובדנה", "וכשדנה"). אסימונים קצרים מ-3 אותיות לא נבדקים (שיירי מילים נפוצות).
   גם השם עובר נרמול (ניקוד/אפס-רוחב), כמו הטקסט שנבדק מולו */
export function nameRegexes(names: readonly string[]): RegExp[] {
  const out: RegExp[] = []
  const seen = new Set<string>()
  const push = (token: string): void => {
    const t = normalizeForCheck(token).trim()
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

/* ── ניקוי טקסט חופשי שנכנס לעובדות (חוק 12) ──
   כותרות אתגרים, יעדי למידה, כותרות טעויות ותחומים נכתבים ע"י מורים/AI ולכן יכולים להכיל שם תלמיד, אימייל, טלפון, מספר זהות, קישור או טקסט ארוך מאוד.
   לפני שהם נכנסים לעובדה (ומשם ל-LLM) הם מנורמלים, מנוקים ומקוצרים. מי שקורא חייב לדלג על עובדה שהטקסט שלה התרוקן. */
export const FREE_TEXT_MAX_CHARS = 120
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g
const URL_RE = /(?:https?:\/\/|www\.)\S+|(?<![A-Za-z0-9-])[a-z0-9-]+\.[a-z]{2,}\S*/gi
/* רצף ספרות ארוך (טלפון, מספר זהות): 7 ספרות ומעלה, גם עם מקפים/רווחים/סוגריים ביניהן */
const LONG_NUMBER_RE = /(?<![\d.])\+?\d[\d\s\-()]{5,}\d(?!\d)/g
const MARKUP_RE = /[*_`#<>[\]{}|\\]/g
export const NAME_MASK = '(שם)'

export type Scrubber = (raw: string) => string
export function makeFreeTextScrubber(names: readonly string[]): Scrubber {
  const nameRes = nameRegexes(names).map((re) => new RegExp(re.source, 'g'))
  return (raw) => {
    let t = normalizeForCheck(raw).replace(/[\r\n\t]+/g, ' ')
    t = t.replace(EMAIL_RE, ' ').replace(URL_RE, ' ')
    t = t.replace(LONG_NUMBER_RE, (m) => (m.replace(/\D/g, '').length >= 7 ? ' ' : m))
    t = t.replace(MARKUP_RE, ' ')
    for (const re of nameRes) t = t.replace(re, NAME_MASK)
    t = t.replace(/\s{2,}/g, ' ').trim()
    if (t.length > FREE_TEXT_MAX_CHARS) {
      t = t.slice(0, FREE_TEXT_MAX_CHARS)
      const cut = t.lastIndexOf(' ')
      if (cut > FREE_TEXT_MAX_CHARS * 0.6) t = t.slice(0, cut)
      t = t.trim()
    }
    return t
  }
}
