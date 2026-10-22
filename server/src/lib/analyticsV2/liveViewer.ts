/* ──────────────────────────────────────────────────────────────────────────
   liveViewer — גזירת ה-V2Viewer של משתמש אמיתי מ-authz.Viewer (מקור ההרשאות היחיד — class_teachers דרך loadViewer).
   · מורה: grants פר-כיתה (מחנך / מקצועות שהוא מלמד בכיתה / שיוך בלי מקצוע). מקצוע מומר ממזהה לקוד דרך טבלת subjects.
     אין ברירת מחדל למקצוע: שיוך בלי מקצוע = אין גישה לאף מקצוע (הכיתה מופיעה, הכול נעול).
   · מנהל / מנהל עירוני: אגרגטים בלבד (lens='admin'), בלי grants.
   · הגנת עומק: grants של כיתה לא פעילה, כיתה פיקטיבית (מחוץ לארגון הדגמה) או כיתה של בית ספר אחר — נשמטים. כיתה בלי school_id (ישנה) נשארת.
   ────────────────────────────────────────────────────────────────────────── */
import { isSubjectCode, type SubjectCode } from '../../../../src/shared/lib/subjects.js'
import { ERR_V2_UNAVAILABLE } from '../../../../src/shared/lib/findingsNarrative.js'
import { AppError } from '../../middleware/errors.js'
import type { Viewer } from '../authz.js'
import { subjectById } from '../subjects.js'
import { supabaseAdmin } from '../supabase.js'
import { deriveLens, type V2ClassGrant, type V2Viewer } from './access.js'

/* מזהי מקצוע → קודים (לפי טבלת subjects). מזהה לא מוכר / מקצוע לא פעיל נשמט, ולא מנחשים */
export async function codesOfSubjectIds(ids: Iterable<string>): Promise<SubjectCode[]> {
  const out: SubjectCode[] = []
  for (const id of ids) {
    /* strict: כשל חולף בטבלת המקצועות ← 503 (ה-ViewerMemo לא שומר), לא "שיוך בלי מקצוע" ל-20 שניות */
    const row = await subjectById(id, { strict: true })
    if (row && isSubjectCode(row.code) && !out.includes(row.code)) out.push(row.code)
  }
  return out
}

interface ClassRow { id: string; name?: string | null; school_id?: string | null; is_active?: boolean | null; is_fictitious?: boolean | null }

/* שורות הכיתות של ה-grants (select('*') — עמיד לעמודות שעוד לא קיימות). כשל קריאה → 503, לא "אין כיתות" */
async function classRowsOf(ids: string[]): Promise<Map<string, ClassRow>> {
  const rows = new Map<string, ClassRow>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabaseAdmin.from('classes').select('*').in('id', ids.slice(i, i + 200))
    if (error) throw new AppError(503, ERR_V2_UNAVAILABLE)
    for (const r of (data ?? []) as ClassRow[]) rows.set(r.id, r)
  }
  return rows
}

const COLLATOR = new Intl.Collator('he')

export async function toV2Viewer(base: Viewer): Promise<V2Viewer> {
  const common = { guest: false, source: 'live' as const, schoolId: base.schoolId, seesSynthetic: base.seesSynthetic }
  if (base.role === 'admin' || base.role === 'municipal_admin') {
    return { ...common, lens: deriveLens(base.role, []), homeroomClassId: null, teachingClassIds: [], subjectCodes: [] }
  }

  const grants = [...base.grants.values()]
  const rows = grants.length ? await classRowsOf(grants.map((g) => g.classId)) : new Map<string, ClassRow>()
  const usable = (row: ClassRow | undefined): row is ClassRow =>
    !!row && row.is_active !== false && !(row.is_fictitious === true && !base.seesSynthetic)
    && (row.school_id == null || base.schoolId == null || row.school_id === base.schoolId)

  const kept: { grant: V2ClassGrant; name: string }[] = []
  for (const g of grants) {
    const row = rows.get(g.classId)
    if (!usable(row)) continue
    const subjects = await codesOfSubjectIds(g.subjectIds)
    kept.push({ grant: { classId: g.classId, homeroom: g.homeroom, subjects, unspecified: !g.homeroom && subjects.length === 0 }, name: row.name ?? '' })
  }
  /* סדר יציב: לפי שם הכיתה (איסוף עברי), ובשוויון — לפי המזהה */
  kept.sort((x, y) => COLLATOR.compare(x.name, y.name) || (x.grant.classId < y.grant.classId ? -1 : x.grant.classId > y.grant.classId ? 1 : 0))
  const classGrants = kept.map((k) => k.grant)

  return {
    ...common,
    lens: deriveLens('teacher', classGrants),
    /* שדות תאימות בלבד — ההרשאה נגזרת מ-classGrants */
    homeroomClassId: classGrants.find((g) => g.homeroom)?.classId ?? null,
    teachingClassIds: classGrants.filter((g) => g.subjects.length > 0).map((g) => g.classId),
    subjectCodes: [...new Set(classGrants.flatMap((g) => g.subjects))],
    classGrants,
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   מטמון קצר של הצופה (authz.Viewer של המשתמש). כל בקשה לאנליטיקה הייתה מבצעת כמה סבבי DB רק כדי לדעת מי הצופה (class_teachers, schools, classes),
   גם כשהניתוח עצמו כבר במטמון. כאן: TTL קצר (ברירת מחדל 20 שניות), single-flight (בקשות מקבילות של אותו משתמש = טעינה אחת), וכשל לא נשמר.
   · המפתח כולל משתמש + תפקיד + בית ספר (אלה נקראים טרי ב-requireStaff בכל בקשה), ולכן שינוי תפקיד/בית ספר ו**השבתת חשבון** נאכפים מיד.
   · **שינוי הרשאות (שיוך מורה לכיתה/מקצוע, סימון מחנך) יתפוס תוך TTL לכל היותר** — זה המחיר המוצהר. ANALYTICS_V2_VIEWER_TTL_MS=0 מכבה את המטמון.
   · בבדיקות (VITEST) המטמון כבוי כברירת מחדל; בדיקות שבודקות אותו מגדירות TTL ושעון במפורש.
   ══════════════════════════════════════════════════════════════════════════ */
export const VIEWER_MEMO_DEFAULT_TTL_MS = 20_000
export const VIEWER_MEMO_MAX_ENTRIES = 500

export function viewerMemoTtlMs(): number {
  const raw = process.env.ANALYTICS_V2_VIEWER_TTL_MS
  if (raw !== undefined && raw !== '') {
    const n = Number(raw)
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : VIEWER_MEMO_DEFAULT_TTL_MS
  }
  return process.env.VITEST ? 0 : VIEWER_MEMO_DEFAULT_TTL_MS
}

export interface ViewerMemoOptions { ttlMs: () => number; maxEntries: number; now: () => number }

export class ViewerMemo<T> {
  private readonly opts: ViewerMemoOptions
  private slots = new Map<string, { at: number; value?: T; promise?: Promise<T> }>()
  constructor(opts: Partial<ViewerMemoOptions> = {}) {
    this.opts = { ttlMs: viewerMemoTtlMs, maxEntries: VIEWER_MEMO_MAX_ENTRIES, now: () => Date.now(), ...opts }
  }
  get size(): number { return this.slots.size }
  clear(): void { this.slots.clear() }

  get(key: string, load: () => Promise<T>): Promise<T> {
    const ttl = this.opts.ttlMs()
    if (ttl <= 0) { this.slots.clear(); return load() }
    const hit = this.slots.get(key)
    if (hit) {
      if (hit.promise) return hit.promise /* טעינה בטיסה: כולם מחכים לאותה */
      if (this.opts.now() - hit.at < ttl) return Promise.resolve(hit.value as T)
      this.slots.delete(key)
    }
    const slot: { at: number; value?: T; promise?: Promise<T> } = { at: 0 }
    const promise = load().then(
      (value) => {
        if (this.slots.get(key) === slot) { slot.value = value; slot.at = this.opts.now(); slot.promise = undefined }
        return value
      },
      (err) => {
        /* כשל לא נשמר: הבקשה הבאה תנסה שוב */
        if (this.slots.get(key) === slot) this.slots.delete(key)
        throw err
      },
    )
    slot.promise = promise
    this.slots.set(key, slot)
    while (this.slots.size > this.opts.maxEntries) this.slots.delete(this.slots.keys().next().value as string)
    return promise
  }
}
