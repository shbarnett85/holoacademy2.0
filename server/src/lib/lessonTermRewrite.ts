/* חלקים טהורים של המרת המינוח "הדמיה" → "שיעור" בתוכן קיים (scripts/lessonTermLibrary.ts) — מופרדים כדי שיהיו ניתנים לבדיקה.
   · TERM: הדמיה / הדמיות / הדמיית (וגם הכתיב עם שתי יודים), כולל תחיליות. לא "הדמיון" ולא "הדמים" ולא "הדמיונית".
   · termSlots: כל מחרוזת בתוך game_data שמכילה את המונח, עם נתיב יציב (מזהים/כתובות/הנחיות תמונה אינם נבדקים).
   · slotProblem: אימות מחרוזת שנכתבה מחדש — אפס מונח, ספרות/סוגריים/קווים תחתונים זהים, אורך וחפיפת מילים סבירים. */
export const TERM_SOURCE = 'הדמי(?:ה|ות|ית|יה|יות|יית)'
export const TERM_RE = new RegExp(TERM_SOURCE)
export const TERM_RE_G = new RegExp(TERM_SOURCE, 'g')
export const termCount = (s: string): number => (s.match(TERM_RE_G) ?? []).length

export type Path = (string | number)[]
export interface Slot { key: string; path: Path; sceneId: string | null; get(): string; set(v: string): void }

/* מפתחות שאינם טקסט למשתמש (מזהים/כתובות/הנחיות תמונה באנגלית) — לא נוגעים */
const SKIP_KEYS = new Set(['id', 'sceneId', 'nextSceneId', 'entrySceneId', 'imageUrl', 'imagePrompt', 'type', 'objectiveId', 'misconception_id', 'variantId', 'questId', 'assignmentId', 'status'])

export function termSlots(gd: unknown): Slot[] {
  const out: Slot[] = []
  const root = gd as Record<string, unknown>
  const sceneIdAt = (path: Path): string | null => {
    if (path[0] === 'scenes' && typeof path[1] === 'number') return ((root.scenes as { id?: string }[])[path[1]]?.id) ?? null
    if (path[0] === 'endingGood') return '__endingGood__'
    if (path[0] === 'endingBad') return '__endingBad__'
    return null
  }
  const at = (path: Path): unknown => path.reduce<unknown>((o, k) => (o as Record<string | number, unknown>)[k], root)
  const visit = (node: unknown, path: Path): void => {
    if (typeof node === 'string') {
      if (TERM_RE.test(node)) {
        out.push({
          key: path.join('.'), path, sceneId: sceneIdAt(path),
          get: () => at(path) as string,
          set: (v) => { (at(path.slice(0, -1)) as Record<string | number, unknown>)[path[path.length - 1]] = v },
        })
      }
      return
    }
    if (Array.isArray(node)) { node.forEach((v, i) => visit(v, [...path, i])); return }
    if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) if (!SKIP_KEYS.has(k)) visit(v, [...path, k])
  }
  visit(gd, [])
  return out
}

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim()
const digits = (s: string): string => (s.match(/\d+/g) ?? []).join(',')
const braces = (s: string): string => (s.match(/\{[^}]*\}|_{3,}/g) ?? []).join('|')

/* שיעור המילים של `b` שנמצאות גם ב-`a` (רב-קבוצה) */
export function overlap(a: string, b: string): number {
  const ta = norm(a).split(' '); const tb = norm(b).split(' ')
  const pool = new Map<string, number>()
  for (const t of ta) pool.set(t, (pool.get(t) ?? 0) + 1)
  let hit = 0
  for (const t of tb) { const n = pool.get(t) ?? 0; if (n > 0) { hit++; pool.set(t, n - 1) } }
  return tb.length ? hit / tb.length : 1
}

/* null = תקין; אחרת הסיבה (בעברית) */
export function slotProblem(before: string, after: string | undefined): string | null {
  if (after === undefined) return 'המודל לא החזיר את המחרוזת'
  if (!after.trim()) return 'מחרוזת ריקה'
  if (TERM_RE.test(after)) return 'נשאר "הדמי"'
  if (digits(before) !== digits(after)) return 'ספרות השתנו'
  if (braces(before) !== braces(after)) return 'סוגריים/קווים תחתונים השתנו'
  const ratio = norm(after).length / Math.max(1, norm(before).length)
  if (ratio < 0.6 || ratio > 1.25) return 'אורך שונה בהרבה'
  if (norm(before).split(' ').length >= 5 && overlap(before, after) < 0.6) return 'התרחק מהמקור'
  return null
}
