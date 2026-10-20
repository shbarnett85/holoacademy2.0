/* ──────────────────────────────────────────────────────────────────────────
   queryUtil — עזרי שאילתה לטעינה החיה: חלוקת מזהים לאצוות, דפדוף 1000 שורות, ובדיקות סכמה שנכשלות סגור.
   · PostgREST מחזיר לכל היותר 1000 שורות לקריאה — מדפדפים עד שנגמרות; השאילתה חייבת מיון יציב.
   · schemaHas: אותו עיקרון כמו checkStrict ב-activeColumn — "העמודה/הטבלה חסרה" (קודי סכמה) ← false; כל שגיאה אחרת ← זורק (503), ואינה נשמרת.
     תוצאה חיובית נשמרת. כך תקלה זמנית לא נקראת "אין עמודה" ולא מייצרת ניתוח ריק שנשמר במטמון.
   ────────────────────────────────────────────────────────────────────────── */
import { ProbeUnavailableError, isSchemaMissingError } from '../../activeColumn.js'
import { supabaseAdmin } from '../../supabase.js'

export const CHUNK = 150
export const PAGE = 1000

type PageResult = { data: unknown; error: { message: string; code?: string | null } | null }

export function chunks<T>(arr: readonly T[], n = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

export async function paged<T>(build: (from: number, to: number) => PromiseLike<PageResult>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

/* מזהים ייחודיים, באצוות מקבילות; כל אצווה מדפדפת בעצמה (run מקבל את האצווה ומחזיר את כל שורותיה) */
export async function inChunks<T>(ids: readonly string[], run: (part: string[]) => Promise<T[]>, n = CHUNK): Promise<T[]> {
  const uniq = [...new Set(ids)]
  if (uniq.length === 0) return []
  return (await Promise.all(chunks(uniq, n).map(run))).flat()
}

const present = new Set<string>()
export async function schemaHas(table: string, column = 'id'): Promise<boolean> {
  const key = `${table}.${column}`
  if (present.has(key)) return true
  const { error } = await supabaseAdmin.from(table).select(column).limit(1)
  if (!error) { present.add(key); return true }
  if (isSchemaMissingError(error)) return false
  throw new ProbeUnavailableError(key, String(error.code || error.message || 'unknown'))
}
export function resetSchemaProbes(): void { present.clear() }

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
