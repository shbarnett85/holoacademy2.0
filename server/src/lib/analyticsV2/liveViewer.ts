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
    const row = await subjectById(id)
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
