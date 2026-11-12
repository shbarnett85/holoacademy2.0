/* זיהוי שברים בטקסט של תשובה (pure). התצוגה: shared/ui/MathText.tsx */
const VULGAR: Readonly<Record<string, [number, number]>> = {
  '½': [1, 2], '⅓': [1, 3], '⅔': [2, 3], '¼': [1, 4], '¾': [3, 4], '⅕': [1, 5], '⅖': [2, 5], '⅗': [3, 5], '⅘': [4, 5],
  '⅙': [1, 6], '⅚': [5, 6], '⅐': [1, 7], '⅛': [1, 8], '⅜': [3, 8], '⅝': [5, 8], '⅞': [7, 8], '⅑': [1, 9], '⅒': [1, 10],
}
const VULGAR_CHARS = Object.keys(VULGAR).join('')
/* שבר: ספרות/ספרות, שלא צמוד ללוכסן, לספרה או לנקודה עשרונית נוספים; או תו שבר של יוניקוד */
const FRACTION_RE = new RegExp(`(?<![\\d/.,])(\\d{1,4})\\s?/\\s?(\\d{1,4})(?![\\d/]|[.,]\\d)|([${VULGAR_CHARS}])`, 'g')

export interface FractionPart { kind: 'text' | 'fraction'; text: string; num?: string; den?: string }

/* פירוק הטקסט לחלקים (נבדק בנפרד) */
export function splitFractions(text: string): FractionPart[] {
  const parts: FractionPart[] = []
  let last = 0
  FRACTION_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = FRACTION_RE.exec(text))) {
    if (m.index > last) parts.push({ kind: 'text', text: text.slice(last, m.index) })
    if (m[3]) { const [n, d] = VULGAR[m[3]]; parts.push({ kind: 'fraction', text: m[0], num: String(n), den: String(d) }) }
    else parts.push({ kind: 'fraction', text: m[0], num: m[1], den: m[2] })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) })
  return parts
}
