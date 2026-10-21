/* ──────────────────────────────────────────────────────────────────────────
   scenePages — פיצול טקסט סצנה לעמודים בגבולות משפט (כלל "אורך טקסט לתלמיד").
   pure: אין DOM. ההחלטה "האם זה נכנס" מגיעה מבחוץ (fits) — בדפדפן מדידה אמיתית של גובה,
   ב-fitsScreen (lib/sceneText.ts) הערכה מכוילת. תיבת הטקסט לעולם לא גוללת; מה שלא נכנס מתחלק לעמודים.
   ────────────────────────────────────────────────────────────────────────── */

export interface TextUnit { text: string; sep: string }

/* יחידות: משפטים בתוך פסקאות. sep = מה שהיה לפני היחידה במקור ("" לראשונה, " " בין משפטים, "\n\n" בין פסקאות). */
export function splitUnits(text: string): TextUnit[] {
  const out: TextUnit[] = []
  const paras = text.split(/(\n+)/)
  let sepBefore = ''
  for (const part of paras) {
    if (/^\n+$/.test(part)) { sepBefore = part; continue }
    const trimmed = part.trim()
    if (!trimmed) continue
    /* גבול משפט: אחרי . ! ? … (ואחריהם אפשר מרכאות/סוגר) ורווח. לא שוברים בתוך "ד״ר" (גרשיים עבריים) */
    const sentences = trimmed.split(/(?<=[.!?…]["״”')\]]?)\s+/).map((s) => s.trim()).filter(Boolean)
    sentences.forEach((s, i) => {
      out.push({ text: s, sep: i === 0 ? sepBefore : ' ' })
    })
    sepBefore = ''
  }
  if (out.length) out[0].sep = ''
  return out
}

const join = (cur: string, u: TextUnit): string => (cur ? cur + u.sep + u.text : u.text)

/* פיצול יחידה בודדת שגדולה מעמוד שלם — לפי מילים */
function splitByWords(text: string, fits: (s: string) => boolean): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const pages: string[] = []
  let cur = ''
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w
    if (!cur || fits(cand)) cur = cand
    else { pages.push(cur); cur = w }
  }
  if (cur) pages.push(cur)
  return pages
}

/* חוצץ גרידי: ממלא עמוד ביחידות עד שלא נכנס. לעולם מחזיר לפחות עמוד אחד (גם אם הטקסט ריק). */
export function paginate(text: string, fits: (candidate: string) => boolean): string[] {
  const trimmed = text.trim()
  if (!trimmed) return ['']
  if (fits(trimmed)) return [trimmed]
  const pages: string[] = []
  let cur = ''
  for (const u of splitUnits(trimmed)) {
    const cand = join(cur, u)
    if (!cur) {
      if (fits(u.text)) { cur = u.text; continue }
      /* משפט ארוך מעמוד שלם */
      const parts = splitByWords(u.text, fits)
      pages.push(...parts.slice(0, -1))
      cur = parts[parts.length - 1] ?? ''
      continue
    }
    if (fits(cand)) { cur = cand; continue }
    pages.push(cur)
    if (fits(u.text)) cur = u.text
    else {
      const parts = splitByWords(u.text, fits)
      pages.push(...parts.slice(0, -1))
      cur = parts[parts.length - 1] ?? ''
    }
  }
  if (cur) pages.push(cur)
  return pages
}
