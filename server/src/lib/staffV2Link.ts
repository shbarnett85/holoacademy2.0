/* ──────────────────────────────────────────────────────────────────────────
   staffV2Link — האם קיים מסך אנליטיקה (v2) לתלמידים/כיתות שרוסטר הניהול מחזיר, כדי שהלקוח לא ינווט ל-404.
   הרוסטר (GET /api/staff/students, /classes) מחזיר שורות DB. מסכי האנליטיקה מוגשים לפי הצופה (resolveV2Context):
     · מורה אורח: עולם ההדגמה — והרוסטר שלו (demoRosterV2) מגיע מאותו עולם, לכן יש מסך לכל תלמיד/ה.
     · ארגון הדגמה (demo_data_enabled): האנליטיקה משרתת את עולם ההדגמה בזיכרון, ואילו הרוסטר מחזיר את תלמידי ה-DB הפיקטיביים שלו —
       מזהים שאינם קיימים בעולם ההדגמה (404 אחיד). לכן אין מסך תלמיד/ה לתלמידים האלה.
     · מורה/מנהל אמיתי: הספק החי מכיר את כל תלמידי הכיתות שבהיקפו. מנהל (אגרגטים בלבד) אינו מקבל מסך תלמיד/ה בכלל.
     · הכול כבוי (ANALYTICS_V2=0 / ANALYTICS_V2_LIVE=0), מנהל-על, או כשל בבירור הצופה: אין מסך (נכשל-סגור — מסתירים, לא מנווטים).
   הקודים בלבד עוברים ללקוח; כל משפט בעברית חי בלקוח (findingsNarrative).
   ────────────────────────────────────────────────────────────────────────── */
import type { Request } from 'express'
import { resolveV2Context, type V2Context } from './analyticsV2/viewer.js'
import { warn } from './log.js'

/** demo_org = ארגון הדגמה (תלמידים פיקטיביים); unavailable = אין מסך כזה לחשבון הזה כרגע */
export type V2UnlinkedReason = 'demo_org' | 'unavailable'

export interface V2Link {
  v2Linked: boolean
  v2UnlinkedReason: V2UnlinkedReason | null
}

const LINKED: V2Link = { v2Linked: true, v2UnlinkedReason: null }
const DEMO_ORG: V2Link = { v2Linked: false, v2UnlinkedReason: 'demo_org' }
const UNAVAILABLE: V2Link = { v2Linked: false, v2UnlinkedReason: 'unavailable' }

/* מה שההחלטה צריכה מהקשר האנליטיקה (V2Context מתאים מבנית) */
export interface V2LinkInput { provider: V2Context['provider']; authz: object | null; viewer: { lens: string } }

/* ההחלטה עצמה (טהורה): authz=null = מורה אורח (אין DB, הרוסטר שלו מעולם ההדגמה) */
export function v2LinkOf(ctx: V2LinkInput | null): V2Link {
  if (!ctx) return UNAVAILABLE
  if (ctx.authz === null) return LINKED
  if (ctx.provider === 'demo') return DEMO_ORG
  return ctx.viewer.lens === 'admin' ? UNAVAILABLE : LINKED
}

export async function v2LinkFor(req: Request): Promise<V2Link> {
  try {
    return v2LinkOf(await resolveV2Context(req))
  } catch (e) {
    /* תקלה זמנית בבירור הצופה לא מפילה את הרוסטר: מסתירים את הקישורים (לא מנווטים לעמוד שעלול להיכשל) */
    warn('[staff] בירור זמינות מסך האנליטיקה נכשל:', e instanceof Error ? e.message : String(e))
    return UNAVAILABLE
  }
}
