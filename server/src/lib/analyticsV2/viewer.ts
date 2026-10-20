/* ──────────────────────────────────────────────────────────────────────────
   viewer — גזירת ההקשר של האנליטיקה החדשה מהבקשה: מי הצופה (V2Viewer) ואיזה ספק משרת אותו. משותף לנקודות הקצה של האנליטיקה
   ולטאב "תוצאות" בהדגמה. הצופה נגזר בשרת בלבד; פרמטרי שאילתה (lens / subject / classId) נקראים **רק** למורה אורח.
   · מורה אורח: ספק הדגמה, העדשה והמקצוע מבורר העדשה (?lens=&subject=).
   · ארגון הדגמה (demo_data_enabled): ספק הדגמה, העדשה מהתפקיד האמיתי ולא ניתנת לעקיפה בשאילתה.
   · כל מורה / מנהל / מנהל עירוני אחר: ספק חי (grants פר-כיתה מ-class_teachers). מנהל-על: אין (נשאר בפאנל הקודם / ב-/admin).
   · כיבויים: ANALYTICS_V2=0 (גלובלי, גם לאורח) ו-ANALYTICS_V2_LIVE=0 (רק הספק החי → enabled:false → הלקוח מציג את הפאנל הקודם).
   ────────────────────────────────────────────────────────────────────────── */
import type { Request } from 'express'
import { type SubjectCode } from '../../../../src/shared/lib/subjects.js'
import { QuerySchema, type V2Query } from '../../../../src/shared/types/analyticsV2.js'
import { loadViewer, type Viewer } from '../authz.js'
import { isDemoGuest } from '../../middleware/staffAuth.js'
import { DEMO_HOMEROOM_CLASS, DEMO_SUBJECT_PERSONAS, type V2Viewer } from './access.js'
import { demoViewerClasses } from './demoProvider.js'
import { codesOfSubjectIds, toV2Viewer } from './liveViewer.js'

export interface V2Context {
  viewer: V2Viewer
  provider: 'demo' | 'live'
  /* ה-Viewer של authz (לכתיבה ליומן הגישה). null אצל מורה אורח — אין DB ואין רישום */
  authz: Viewer | null
}

/* kill-switch גלובלי: ANALYTICS_V2=0 */
const flagOn = (): boolean => process.env.ANALYTICS_V2 !== '0'
/* kill-switch של הספק החי בלבד: ANALYTICS_V2_LIVE=0 */
const liveOn = (): boolean => process.env.ANALYTICS_V2_LIVE !== '0'

const DEMO_BASE = { guest: false, source: 'demo' as const }

/* מורה אורח: העדשה והמקצוע מהבורר */
function guestViewer(query: V2Query): V2Viewer {
  const lens = query.lens ?? 'homeroom'
  const guest = { guest: true, source: 'demo' as const }
  if (lens === 'admin') return { ...guest, lens, homeroomClassId: null, teachingClassIds: [], subjectCodes: [] }
  if (lens === 'homeroom') return { ...guest, lens, homeroomClassId: DEMO_HOMEROOM_CLASS, teachingClassIds: [], subjectCodes: [] }
  const subject: SubjectCode = query.subject && DEMO_SUBJECT_PERSONAS.includes(query.subject as SubjectCode) ? (query.subject as SubjectCode) : 'math'
  return { ...guest, lens, homeroomClassId: null, teachingClassIds: demoViewerClasses([subject]), subjectCodes: [subject] }
}

/* ארגון הדגמה: התפקיד האמיתי ממופה לעולם ההדגמה (מחנך → כיתת ההדגמה; מקצועי → כיתות העולם שיש בהן את מקצועותיו).
   מי שאין לו מקצוע ואינו מחנך מקבל צופה ריק — אין ברירת מחדל למקצוע. */
async function demoOrgViewer(base: Viewer): Promise<V2Viewer> {
  if (base.role === 'admin' || base.role === 'municipal_admin') return { ...DEMO_BASE, lens: 'admin', homeroomClassId: null, teachingClassIds: [], subjectCodes: [] }
  const grants = [...base.grants.values()]
  if (grants.some((g) => g.homeroom)) return { ...DEMO_BASE, lens: 'homeroom', homeroomClassId: DEMO_HOMEROOM_CLASS, teachingClassIds: [], subjectCodes: [] }
  const subjectCodes = await codesOfSubjectIds(grants.flatMap((g) => [...g.subjectIds]))
  return { ...DEMO_BASE, lens: 'subject_teacher', homeroomClassId: null, teachingClassIds: subjectCodes.length ? demoViewerClasses(subjectCodes) : [], subjectCodes }
}

/* ignoreFlag: טאב "תוצאות" (הדגמה) אינו תלוי בדגל ANALYTICS_V2. demoOnly: רק צופים של ספק ההדגמה (בלי שאילתות DB לחי) */
export async function resolveV2Context(req: Request, opts: { ignoreFlag?: boolean; demoOnly?: boolean } = {}): Promise<V2Context | null> {
  if (!opts.ignoreFlag && !flagOn()) return null
  if (isDemoGuest(req)) {
    const q = QuerySchema.safeParse(req.query)
    return { viewer: guestViewer(q.success ? q.data : {}), provider: 'demo', authz: null }
  }
  if (req.staff?.role === 'super_admin') return null
  const base = await loadViewer(req)
  if (base.role === 'super_admin') return null
  if (base.seesSynthetic) return { viewer: await demoOrgViewer(base), provider: 'demo', authz: base }
  if (opts.demoOnly || !liveOn()) return null
  return { viewer: await toV2Viewer(base), provider: 'live', authz: base }
}

/* עטיפה תואמת-לאחור (demoResults ובדיקות): רק צופה של ספק ההדגמה; לכל השאר null */
export async function resolveV2Viewer(req: Request, opts: { ignoreFlag?: boolean } = {}): Promise<V2Viewer | null> {
  return (await resolveV2Context(req, { ...opts, demoOnly: true }))?.viewer ?? null
}
