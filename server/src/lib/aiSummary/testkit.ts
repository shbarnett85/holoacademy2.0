/* עזרי בדיקה לשירות הסיכום המילולי: מקורות נתונים מעולם ההדגמה (כל ההיקפים והעדשות), LLM מזויף ותשובות "טובות" לשומר.
   לא נטען בפרודקשן — רק מקובצי *.test.ts. */
import { DEMO_SUBJECT_PERSONAS, type V2Viewer } from '../analyticsV2/access.js'
import { demoProvider, demoViewerClasses, getAnalysis } from '../analyticsV2/demoProvider.js'
import { buildClassView } from '../results/core.js'
import { DEMO_HOMEROOM_TEACHER, DEMO_SUBJECT_TEACHERS } from '../results/demoCatalog.js'
import { getDemoResults } from '../results/demoResults.js'
import { subjectName, type SubjectCode } from '../../../../src/shared/lib/subjects.js'
import type { SummaryLlm, SummaryLlmRequest, SummaryLlmResult } from './llm.js'
import { classDataCountsOf, type SummaryInput, type SummarySource } from './inputs.js'

export const NOW = new Date('2026-10-19T09:00:00Z')
export const homeroomOf = (cid: string): V2Viewer => ({ lens: 'homeroom', guest: true, homeroomClassId: cid, teachingClassIds: [], subjectCodes: [] })
export const subjectTeacher = (s: SubjectCode): V2Viewer => ({ lens: 'subject_teacher', guest: true, homeroomClassId: null, teachingClassIds: demoViewerClasses([s]), subjectCodes: [s] })

export interface LabeledSource { label: string; lens: 'homeroom' | 'subject'; subject: SubjectCode | null; source: SummarySource }

/* מקור "כיתה" מעולם ההדגמה, כולל ספירת התלמידים עם נתונים (נגזרת ממסכי המקצוע, כמו ב-deps.ts) */
export async function demoClassSource(classId: string): Promise<Extract<SummarySource, { scope: 'class' }>> {
  const a = getAnalysis(NOW)
  const c = a.classById.get(classId)!
  const hr = homeroomOf(classId)
  const overview = (await demoProvider.classOverview(hr, classId)).data
  const subjects = overview.rows.filter((r) => r.level !== null).map((r) => r.subject.code)
  const views = []
  for (const sub of subjects) views.push((await demoProvider.classSubject(hr, c.id, sub)).data)
  return { scope: 'class', overview, withData: classDataCountsOf(views) }
}

/* כל המקורות האפשריים בעולם ההדגמה: תלמידים (מחנך + כל מורה מקצועי), סקירות כיתה, מקצוע-בכיתה, וכל ההגשות */
let demoSourcesCache: Promise<LabeledSource[]> | null = null
/* נבנה פעם אחת לקובץ בדיקות (הבנייה כבדה: מאות מקורות) */
export const demoSources = (): Promise<LabeledSource[]> => (demoSourcesCache ??= buildDemoSources())

async function buildDemoSources(): Promise<LabeledSource[]> {
  const a = getAnalysis(NOW)
  const out: LabeledSource[] = []
  for (const c of a.world.classes) {
    const hr = homeroomOf(c.id)
    const overview = (await demoProvider.classOverview(hr, c.id)).data
    const subjects = [...new Set(c.studentIds.flatMap((sid) => a.studentById.get(sid)!.subjects))]
    const views = new Map<SubjectCode, Awaited<ReturnType<typeof demoProvider.classSubject>>['data']>()
    for (const sub of subjects) views.set(sub, (await demoProvider.classSubject(hr, c.id, sub)).data)
    /* אותה גזירה כמו demoClassSource: רק מקצועות שיש להם רמה בסקירה */
    const withData = classDataCountsOf(overview.rows.filter((r) => r.level !== null).flatMap((r) => views.get(r.subject.code) ?? []))
    out.push({ label: `class ${c.id}`, lens: 'homeroom', subject: null, source: { scope: 'class', overview, withData } })
    for (const sub of subjects) out.push({ label: `class-subject ${c.id} ${sub}`, lens: 'homeroom', subject: null, source: { scope: 'class_subject', view: views.get(sub)! } })
    for (const sid of c.studentIds) {
      const gender = a.studentById.get(sid)!.displayName.length % 2 === 0 ? 'male' : 'female'
      out.push({ label: `student ${sid}`, lens: 'homeroom', subject: null, source: { scope: 'student', overview: (await demoProvider.student(hr, sid)).data, gender } })
    }
  }
  for (const sub of DEMO_SUBJECT_PERSONAS) {
    const t = subjectTeacher(sub)
    for (const cid of t.teachingClassIds) {
      out.push({ label: `class-subject ${cid} ${sub} (teacher)`, lens: 'subject', subject: sub, source: { scope: 'class_subject', view: (await demoProvider.classSubject(t, cid, sub)).data } })
      for (const sid of a.classById.get(cid)!.studentIds) {
        if (!a.studentById.get(sid)!.subjects.includes(sub)) continue
        out.push({ label: `student ${sid} (teacher ${sub})`, lens: 'subject', subject: sub, source: { scope: 'student', overview: (await demoProvider.student(t, sid)).data, gender: null } })
      }
    }
  }
  for (const s of getDemoResults(NOW).submissions) out.push({ label: `submission ${s.def.id}`, lens: 'homeroom', subject: null, source: { scope: 'submission', view: buildClassView(s.input) } })
  return out
}

/* כל מה ש"מזהה" בעולם ההדגמה ואסור שיגיע ל-LLM: שמות מלאים, מזהי תלמידים וכיתות, שמות כיתות, שמות מורים */
export function demoIdentifiers(): { names: string[]; ids: string[]; classNames: string[]; teachers: string[] } {
  const a = getAnalysis(NOW)
  return {
    names: a.world.students.map((s) => s.displayName),
    ids: [...a.world.students.map((s) => s.id), ...a.world.classes.map((c) => c.id)],
    classNames: a.world.classes.map((c) => c.name),
    teachers: [DEMO_HOMEROOM_TEACHER, ...Object.values(DEMO_SUBJECT_TEACHERS).filter((t): t is string => !!t)],
  }
}

/* שמות מקצוע של מקצוע "אחר" — לבדיקת "מורה מקצועי לא מקבל מקצוע אחר" */
export const otherSubjectNames = (own: SubjectCode): string[] => DEMO_SUBJECT_PERSONAS.filter((s) => s !== own).map((s) => subjectName(s))

/* ── LLM מזויף ── */
export interface FakeLlm extends SummaryLlm { calls: SummaryLlmRequest[] }
export function fakeLlm(responses: (string | Error | ((req: SummaryLlmRequest, n: number) => string))[], model = 'fake-model-1'): FakeLlm {
  const calls: SummaryLlmRequest[] = []
  return {
    calls,
    async generate(req): Promise<SummaryLlmResult> {
      calls.push(req)
      const r = responses[Math.min(calls.length - 1, responses.length - 1)]
      if (r instanceof Error) throw r
      return { text: typeof r === 'function' ? r(req, calls.length) : r, model }
    },
  }
}

/* תשובה שעוברת את השומר: שתי פסקאות שמצטטות עובדות אמיתיות, עם סימון זהירות, ובלי מספרים מחוץ לעובדות */
export function goodResponse(input: SummaryInput): string {
  const f = input.facts
  const pick = (i: number) => f[i % f.length]
  const a = [pick(0), pick(1)]
  const b = [pick(2)]
  return JSON.stringify({
    paragraphs: [
      { text: `לפי הנתונים, ${a.map((x) => x.text).join(' ')}`, facts: a.map((x) => x.id) },
      { text: `נראה ש${b.map((x) => x.text).join(' ')} כדאי לקיים שיחה קצרה ולעקוב שוב בעוד כמה שבועות.`, facts: b.map((x) => x.id) },
    ],
  })
}
