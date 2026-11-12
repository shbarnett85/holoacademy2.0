/* סורק קוד מקור ומוצא שאריות של השפה החזותית הישנה: צבע קשיח, מעבר צבע, זוהר, טשטוש רקע, טוקנים ישנים.
   pure (בלי DOM / Node): משמש גם את הבדיקה `noHardcodedColors.test.ts` וגם את הכלי `e2e/redesign/scanColors.ts`.
   חריגה מוצדקת מסומנת באותה שורה או בשורה שמעליה בהערה שמכילה `redesign-allow: <סיבה>`. */

export interface ColorViolation { line: number; rule: string; text: string }

/* קבצים שלא נסרקים, עם הסיבה */
export const SCAN_EXCLUDE: readonly { re: RegExp; why: string }[] = [
  { re: /styles\/tokens\.css$/, why: 'קובץ הטוקנים עצמו' },
  { re: /\.test\.tsx?$/, why: 'בדיקות' },
  { re: /features\/player\/lab\//, why: 'מסכי המעבדה (פתיחה וסיכום): יוחלפו בנפרד' },
  { re: /features\/player\/DrHoloHologram\.tsx$/, why: 'הדמות של דוקטור הולו: תוחלף בנפרד' },
  { re: /features\/player\/drHoloClips\.ts$/, why: 'קטעי הווידאו של דוקטור הולו: יוחלפו בנפרד' },
  { re: /features\/deck\//, why: 'המצגת ב-/ges2026: מחוץ להיקף' },
  { re: /styles\/colorScan\.ts$/, why: 'הסורק עצמו' },
]

const NAMED = 'white|black|red|green|blue|gray|grey|orange|yellow|purple|cyan|magenta|pink|navy|teal|gold|silver'

const RULES: readonly { rule: string; re: RegExp }[] = [
  { rule: 'hex', re: /(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z_-])/ },
  { rule: 'rgb()', re: /\brgba?\(\s*[\d.]/ },
  { rule: 'hsl()', re: /\bhsla?\(\s*[\d.]/ },
  { rule: 'rgb-triplet', re: /['"`]\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*['"`]/ },
  { rule: 'named-color', re: new RegExp(`(?:color|background|backgroundColor|fill|stroke|borderColor|outlineColor|stopColor)\\s*[:=]\\s*['"\`]?\\s*(?:${NAMED})\\b`, 'i') },
  { rule: 'named-color', re: new RegExp(`\\b(?:solid|dashed|dotted)\\s+(?:${NAMED})\\b`, 'i') },
  { rule: 'gradient', re: /\b(?:linear|radial|conic)-gradient\(/ },
  { rule: 'backdrop-filter', re: /(?:backdrop-filter|[bB]ackdropFilter)\s*:(?!\s*['"`]?none)/ },
  { rule: 'text-shadow', re: /(?:text-shadow|textShadow)\s*:(?!\s*['"`]?(?:none|undefined))/ },
  { rule: 'old-token', re: /--holo-(?:bg|surface|cyan|blue|purple|text|glow|magenta|orange)\b|var\(--t\d+\)|--t-on-accent|--t-studio-bg/ },
  { rule: 'old-theme', re: /\bHoloTint\b|\bHoloTheme\b/ },
]

/* צל מטושטש: בתוך ערך של box-shadow / drop-shadow, רצף אורכים שהשלישי בו (הטשטוש) גדול מאפס.
   צל קשיח (0 בטשטוש) וטבעת (0 0 0 Npx) מותרים. ריפוד עם שלושה ערכים באותה שורה אינו צל ולא נבדק. */
const SHADOW_VALUE = /(?:box-shadow|boxShadow|drop-shadow)\s*[:(]\s*(['"`]?)([^;]*)/g
const LENGTH_RUN = /-?\d*\.?\d+(?:px|rem|em)?(?:\s+-?\d*\.?\d+(?:px|rem|em)?){2,3}/g

function hasBlurShadow(code: string): boolean {
  SHADOW_VALUE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = SHADOW_VALUE.exec(code))) {
    const quote = m[1]
    const end = quote ? m[2].indexOf(quote) : -1
    const value = end >= 0 ? m[2].slice(0, end) : m[2]
    for (const run of value.match(LENGTH_RUN) ?? []) {
      const parts = run.trim().split(/\s+/)
      if (parseFloat(parts[2]) > 0) return true
    }
  }
  return false
}

export function scanText(text: string): ColorViolation[] {
  const out: ColorViolation[] = []
  const lines = text.split('\n')
  let inBlock = false
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    /* מסירים הערות (בקירוב טוב מספיק לקוד שלנו): בלוק ושורה */
    let code = raw
    if (inBlock) {
      const end = code.indexOf('*/')
      if (end < 0) continue
      code = code.slice(end + 2); inBlock = false
    }
    code = code.replace(/\/\*.*?\*\//g, ' ')
    const open = code.indexOf('/*')
    if (open >= 0) { code = code.slice(0, open); inBlock = true }
    code = code.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')
    if (!code.trim()) continue
    if (/redesign-allow/.test(raw) || (i > 0 && /redesign-allow/.test(lines[i - 1]))) continue
    for (const r of RULES) {
      if (r.re.test(code)) out.push({ line: i + 1, rule: r.rule, text: raw.trim().slice(0, 160) })
    }
    if (hasBlurShadow(code)) out.push({ line: i + 1, rule: 'blur-shadow', text: raw.trim().slice(0, 160) })
  }
  return out
}

export function isExcluded(path: string): string | null {
  const p = path.replace(/\\/g, '/')
  for (const e of SCAN_EXCLUDE) if (e.re.test(p)) return e.why
  return null
}
