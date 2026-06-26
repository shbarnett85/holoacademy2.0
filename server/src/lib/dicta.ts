/* ניקוד עברי תקני דרך Dicta Nakdan API (חינמי). מוסיף ניקוד מדויק תו-אחר-תו —
   אמין הרבה יותר מניקוד שמודל שפה מפיק. משמש לרמות הכתיבה הנמוכות (≤6) שדורשות
   ניקוד מלא לקוראים מתחילים.

   reconstruction: לכל token בוחרים את האופציה שהשלד העיצורי שלה תואם למקור (שומר
   על האיות המקורי, מונע המרת כתיב מלא↔חסר), אחרת האופציה הראשונה (הטובה ביותר).
   best-effort: על כל כשל (רשת/פורמט) מחזירים את הטקסט המקורי כפי שהוא. */

const DICTA_URL = 'https://nakdan-2-0.loadbalancer.dicta.org.il/api'

/* סימני ניקוד/טעמים + מפריד-מורפולוגיה (|) + ZWJ — להסרה לצורך השוואת שלד והסרת ניקוד קיים */
const MARKS = /[֑-ׇ‍|]/g
const stripMarks = (s: string) => s.replace(MARKS, '')

interface NakToken { word: string; sep?: boolean; options?: string[] }

export async function nakdan(text: string): Promise<string> {
  if (!text || !text.trim()) return text
  const clean = text.replace(/[֑-ׇ]/g, '') /* טקסט עיצורי בלבד ל-Dicta (גם אם המודל כבר ניקד) */
  try {
    const res = await fetch(DICTA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: 'nakdan', data: clean, genre: 'modern' }),
    })
    if (!res.ok) return text
    const toks = (await res.json()) as NakToken[]
    if (!Array.isArray(toks)) return text
    return toks
      .map((t) => {
        if (t.sep || !t.options || t.options.length === 0) return t.word
        const match = t.options.find((o) => stripMarks(o) === t.word)
        return (match ?? t.options[0]).replace(/\|/g, '')
      })
      .join('')
  } catch {
    return text /* כשל → שומרים את הטקסט (כולל ניקוד המודל אם קיים) */
  }
}
