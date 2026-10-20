/* ──────────────────────────────────────────────────────────────────────────
   viewer — גזירת ה-V2Viewer מהבקשה (משותף לנקודות הקצה של האנליטיקה החדשה ולטאב "תוצאות" בהדגמה).
   · מורה אורח: מבורר העדשה (?lens=&subject=). ארגון הדגמה: מהתפקיד האמיתי (לא ניתן לעקיפה בשאילתה).
   · כל משתמש אחר / ANALYTICS_V2=0 → null.
   ────────────────────────────────────────────────────────────────────────── */
import type { Request } from 'express'
import { isSubjectCode, type SubjectCode } from '../../../../src/shared/lib/subjects.js'
import { QuerySchema } from '../../../../src/shared/types/analyticsV2.js'
import { loadViewer } from '../authz.js'
import { subjectById } from '../subjects.js'
import { isDemoGuest } from '../../middleware/staffAuth.js'
import { DEMO_HOMEROOM_CLASS, DEMO_SUBJECT_PERSONAS, type V2Viewer } from './access.js'
import { demoViewerClasses } from './demoProvider.js'

/* kill-switch גלובלי: ANALYTICS_V2=0 */
const flagOn = (): boolean => process.env.ANALYTICS_V2 !== '0'

/* גזירת הצופה: מורה אורח — מבורר העדשה; ארגון הדגמה — מהתפקיד האמיתי; אחרת null (הדגל כבוי) */
/* ignoreFlag: טאב "תוצאות" (הדגמה) אינו תלוי בדגל ANALYTICS_V2 */
export async function resolveV2Viewer(req: Request, opts: { ignoreFlag?: boolean } = {}): Promise<V2Viewer | null> {
  if (!opts.ignoreFlag && !flagOn()) return null
  const q = QuerySchema.safeParse(req.query)
  const query = q.success ? q.data : {}

  if (isDemoGuest(req)) {
    const lens = query.lens ?? 'homeroom'
    if (lens === 'admin') return { lens, guest: true, homeroomClassId: null, teachingClassIds: [], subjectCodes: [] }
    if (lens === 'homeroom') return { lens, guest: true, homeroomClassId: DEMO_HOMEROOM_CLASS, teachingClassIds: [], subjectCodes: [] }
    const subject: SubjectCode = query.subject && DEMO_SUBJECT_PERSONAS.includes(query.subject as SubjectCode) ? (query.subject as SubjectCode) : 'math'
    return { lens, guest: true, homeroomClassId: null, teachingClassIds: demoViewerClasses([subject]), subjectCodes: [subject] }
  }

  const viewer = await loadViewer(req)
  if (!viewer.seesSynthetic) return null
  if (viewer.role === 'admin' || viewer.role === 'municipal_admin') return { lens: 'admin', guest: false, homeroomClassId: null, teachingClassIds: [], subjectCodes: [] }
  if (viewer.role !== 'teacher') return null
  const homeroom = [...viewer.grants.values()].some((g) => g.homeroom)
  if (homeroom) return { lens: 'homeroom', guest: false, homeroomClassId: DEMO_HOMEROOM_CLASS, teachingClassIds: [], subjectCodes: [] }
  const codes: SubjectCode[] = []
  for (const g of viewer.grants.values()) for (const sid of g.subjectIds) {
    const row = await subjectById(sid)
    if (row && isSubjectCode(row.code) && !codes.includes(row.code)) codes.push(row.code)
  }
  const subjectCodes = codes.length ? codes : ['math' as SubjectCode]
  return { lens: 'subject_teacher', guest: false, homeroomClassId: null, teachingClassIds: demoViewerClasses(subjectCodes), subjectCodes }
}

