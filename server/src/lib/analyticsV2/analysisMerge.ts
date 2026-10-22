/* ──────────────────────────────────────────────────────────────────────────
   analysisMerge — מיזוג ניתוחי כיתות (כל אחד נבנה בנפרד, BH פר כיתה) לניתוח אחד: מורה עם כמה כיתות, ומנהל (כל כיתות בית הספר).
   · כיתות זרות: classFindings / misByClass של כל כיתה נשמרים כמות שהם. misByGrade מצטבר לפי שכבה (סכום חשיפות והצגות; האחוז מחושב מחדש).
   · תלמיד בכמה כיתות (חבר בכיתות של כמה חלקים): נשאר ברשימת כל כיתה (לא נעלם ממורה), אך בעולם הממוזג הוא רשומה אחת:
     הרשומה והניתוח (ss / crossSubject) מהחלק של הכיתה העיקרית שלו (primaryClassOf) אם היא בין החלקים, אחרת מהחלק הראשון (לפי מזהה כיתה).
     המקצועות הם איחוד המקצועות בכל החלקים. (הספירה הכפולה ב-misByGrade של תלמיד כזה — מגבלה ידועה, והקטלוג ריק עד שיתויגו.)
   · world.data ריק (הועבר ל-analyzeRaw). סדר החלקים דטרמיניסטי: לפי מזהה הכיתה הראשונה של כל חלק.
   ────────────────────────────────────────────────────────────────────────── */
import { MIN_CELL_SIZE } from '../../../../src/shared/lib/analyticsConfig.js'
import type { Finding } from '../../../../src/shared/types/analyticsV2.js'
import type { SubjectCode } from '../../../../src/shared/lib/subjects.js'
import type { WorldClass, WorldStudent } from './demoWorld.js'
import { skey } from './demoWorld.js'
import type { MisStat, SubjectAnalysis } from './engine.js'
import { orderSubjects } from './realWorld/assemble.js'
import { sumCoverage, type LiveAnalysis } from './realWorld/coverage.js'

const firstClassId = (a: LiveAnalysis): string => a.world.classes[0]?.id ?? '￿'

function mergeStat(parts: MisStat[]): MisStat {
  const exposed = parts.reduce((s, p) => s + p.studentsExposed, 0)
  const students = parts.flatMap((p) => p.students)
  return {
    misconceptionId: parts[0].misconceptionId, scopeId: parts[0].scopeId,
    studentsExposed: exposed, studentsShowing: students.length,
    sharePct: exposed >= MIN_CELL_SIZE ? Math.round((100 * students.length) / exposed) : null, students,
  }
}

export function mergeAnalyses(list: readonly LiveAnalysis[]): LiveAnalysis {
  if (list.length === 0) throw new Error('mergeAnalyses: empty list')
  if (list.length === 1) return list[0]
  const parts = [...list].sort((a, b) => (firstClassId(a) < firstClassId(b) ? -1 : firstClassId(a) > firstClassId(b) ? 1 : 0))
  const newest = parts.reduce((best, p) => (p.world.now.getTime() > best.world.now.getTime() ? p : best), parts[0])

  /* כיתות (ללא כפילויות) */
  const classes: WorldClass[] = []
  const seenClass = new Set<string>()
  for (const p of parts) for (const c of p.world.classes) if (!seenClass.has(c.id)) { seenClass.add(c.id); classes.push(c) }

  /* תלמידים: קבוצות לפי מזהה */
  const primaryClassOf = new Map<string, string>()
  for (const p of parts) for (const [sid, cid] of p.primaryClassOf) if (!primaryClassOf.has(sid)) primaryClassOf.set(sid, cid)
  const holders = new Map<string, { part: LiveAnalysis; student: WorldStudent }[]>()
  for (const p of parts) for (const st of p.world.students) holders.set(st.id, [...(holders.get(st.id) ?? []), { part: p, student: st }])

  const students: WorldStudent[] = []
  const ss = new Map<string, SubjectAnalysis>()
  const crossSubject = new Map<string, Finding[]>()
  let duplicated = 0
  for (const [sid, hs] of holders) {
    if (hs.length > 1) duplicated++
    const primary = primaryClassOf.get(sid)
    const chosen = hs.find((h) => h.part.classById.has(primary ?? '')) ?? hs[0]
    const subjects: SubjectCode[] = orderSubjects(hs.flatMap((h) => h.student.subjects))
    students.push({ ...chosen.student, subjects })
    const order = [chosen, ...hs.filter((h) => h !== chosen)]
    for (const sub of subjects) {
      const key = skey(sid, sub)
      const owner = order.find((h) => h.part.ss.has(key))
      if (owner) ss.set(key, owner.part.ss.get(key)!)
    }
    const cross = order.find((h) => h.part.crossSubject.has(sid))
    if (cross) crossSubject.set(sid, cross.part.crossSubject.get(sid)!)
  }
  students.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  /* ממצאים כיתתיים ותפיסות */
  const classFindings = new Map<string, { subject: SubjectCode; finding: Finding }[]>()
  const misByClass = new Map<string, MisStat>()
  const gradeParts = new Map<string, MisStat[]>()
  for (const p of parts) {
    for (const [cid, fs] of p.classFindings) classFindings.set(cid, [...(classFindings.get(cid) ?? []), ...fs])
    for (const [k, v] of p.misByClass) if (!misByClass.has(k)) misByClass.set(k, v)
    for (const [k, v] of p.misByGrade) gradeParts.set(k, [...(gradeParts.get(k) ?? []), v])
  }
  const misByGrade = new Map<string, MisStat>([...gradeParts].map(([k, v]) => [k, v.length === 1 ? v[0] : mergeStat(v)]))

  /* מפתחות הממצאים המדווחים — מחושבים מהתוצאה הממוזגת (לא איחוד גולמי: תלמיד כפול נספר לפי החלק שנבחר) */
  const reportedKeys = new Set<string>()
  const note = (f: Finding): void => { if (f.status === 'reported') reportedKeys.add(f.id) }
  for (const sa of ss.values()) sa.findings.forEach(note)
  for (const fs of classFindings.values()) fs.forEach((x) => note(x.finding))
  for (const fs of crossSubject.values()) fs.forEach(note)

  const coverage = sumCoverage(parts.map((p) => p.coverage))
  coverage.classesTotal = classes.length
  coverage.studentsTotal = students.length
  coverage.studentsInMultipleClasses = duplicated

  const world = {
    ...newest.world,
    term: parts.map((p) => p.world.term).find((t) => t !== null) ?? null,
    school: parts.map((p) => p.world.school).find((s) => s.id || s.name) ?? newest.world.school,
    classes, students, data: new Map(),
  }
  const classById = new Map(classes.map((c) => [c.id, c]))
  return {
    world, catalog: newest.catalog, coverage, primaryClassOf, ss, crossSubject, classFindings, misByClass, misByGrade,
    ageNormOf: (grade) => (parts.find((p) => p.world.classes.some((c) => c.grade === grade)) ?? parts[0]).ageNormOf(grade),
    studentById: new Map(students.map((s) => [s.id, s])), classById, reportedKeys,
  }
}
