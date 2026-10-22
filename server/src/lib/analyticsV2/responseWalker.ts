/* ──────────────────────────────────────────────────────────────────────────
   responseWalker — עזר לבדיקות: אוסף את כל תגובות הספק (כל נקודות הקצה, כל התלמידים והכיתות) ועובר על כל ערך מחרוזת.
   משמש את בדיקות העברית הפשוטה והניסוח (languagePolish.test.ts). אינו חלק מהקוד שרץ בשרת.
   ────────────────────────────────────────────────────────────────────────── */
import { AppError } from '../../middleware/errors.js'
import type { V2Viewer } from './access.js'
import { getAnalysis } from './demoProvider.js'
import type { AnalyticsV2Provider } from './provider.js'

/* מעבר על כל ערכי המחרוזת (לא מפתחות), עם נתיב */
export function* strings(value: unknown, path = '$'): Generator<{ path: string; text: string }> {
  if (typeof value === 'string') yield { path, text: value }
  else if (Array.isArray(value)) for (let i = 0; i < value.length; i++) yield* strings(value[i], `${path}[${i}]`)
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) yield* strings(v, `${path}.${k}`)
}

export interface Collected { label: string; endpoint: string; data: unknown }

/* כל תגובות הספק לצופה אחד. 403/404 צפויים (עדשה שאינה רשאית) ולכן מדולגים. */
export async function collectAll(p: AnalyticsV2Provider, v: V2Viewer, label: string): Promise<Collected[]> {
  const a = getAnalysis()
  const out: Collected[] = []
  const add = async (endpoint: string, what: string, fn: () => Promise<{ data: unknown }>): Promise<void> => {
    try { out.push({ label: `${label} ${what}`, endpoint, data: (await fn()).data }) } catch (e) { if (!(e instanceof AppError)) throw e }
  }
  await add('config', 'config', () => p.config(v))
  await add('roster', 'roster', () => p.roster(v))
  await add('entry', 'entry', () => p.entry(v))
  await add('admin', 'admin', () => p.admin(v))
  const classIds = v.lens === 'homeroom' ? [v.homeroomClassId as string] : v.lens === 'subject_teacher' ? v.teachingClassIds : a.world.classes.map((c) => c.id)
  for (const cid of classIds) {
    await add('classOverview', `overview:${cid}`, () => p.classOverview(v, cid))
    await add('briefing', `briefing-class:${cid}`, () => p.briefing(v, 'class', cid))
    const cls = a.classById.get(cid)
    const subjects = [...new Set((cls?.studentIds ?? []).flatMap((sid) => a.studentById.get(sid)!.subjects))]
    for (const sub of subjects) await add('classSubject', `class:${cid}:${sub}`, () => p.classSubject(v, cid, sub))
    for (const sid of cls?.studentIds ?? []) {
      await add('student', `student:${sid}`, () => p.student(v, sid))
      await add('feedback', `feedback:${sid}`, () => p.feedback(v, sid))
      await add('briefing', `briefing-student:${sid}`, () => p.briefing(v, 'student', sid))
    }
  }
  return out
}

/* הסעיף "איך חישבנו?" בתדריך הוא המקום היחיד שבו מותר פירוט חישובי */
export function withoutHowWeCalculated(data: unknown): unknown {
  const d = data as { sections?: { id: string }[] }
  return Array.isArray(d?.sections) ? { ...d, sections: d.sections.filter((s) => s.id !== 'how_we_calculated') } : data
}
