import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEMO_SUBJECT_PERSONAS } from '../analyticsV2/access.js'
import { demoProvider, getAnalysis } from '../analyticsV2/demoProvider.js'
import { buildClassView } from '../results/core.js'
import { getDemoResults } from '../results/demoResults.js'
import { subjectName } from '../../../../src/shared/lib/subjects.js'
import { buildSummaryPrompt } from './prompt.js'
import { collectKnownNames, inputHash, layerOf, numbersIn, projectClass, projectClassSubject, projectSource, projectStudent, projectSubmission, type SummarySource } from './inputs.js'
import { NOW, demoIdentifiers, demoSources, homeroomOf, otherSubjectNames, subjectTeacher } from './testkit.js'

/* ══════════════════════════════════════════════════════════════════════════
   חוק 12 (canary): ל-LLM לא נשלחים שמות תלמידים, מזהים, שמות כיתות או שמות מורים — בשום היקף ובשום עדשה.
   הבדיקה עוברת על **כל** מקור בעולם ההדגמה (תלמידים בעדשת מחנך ובכל עדשת מורה מקצועי, סקירות כיתה, מקצוע-בכיתה, כל ההגשות),
   ובודקת גם את ההקרנה וגם את הפרומפט המלא (system + user).
   ══════════════════════════════════════════════════════════════════════════ */
const ids = demoIdentifiers()
const SENTINEL = 'ZQXNAME'

/* מחליף כל הופעה של שם מלא בציון ייחודי, כדי שדליפה (גם בתוך משפט) תיתפס בלי תלות בשמות שהם גם מילים בעברית */
function scrub<T>(value: T, names: string[]): T {
  let json = JSON.stringify(value)
  names.forEach((n, i) => { json = json.split(n).join(`${SENTINEL}${i}`) })
  return JSON.parse(json) as T
}

describe('הקרנות: אין שמות/מזהים/מורים ב-LLM (canary על עולם ההדגמה)', () => {
  it('כל ההיקפים והעדשות: ההקרנה והפרומפט נקיים', async () => {
    const sources = await demoSources()
    expect(sources.length).toBeGreaterThan(300)
    expect(new Set(sources.map((s) => s.source.scope))).toEqual(new Set(['student', 'class', 'class_subject', 'submission']))
    const leaks: string[] = []
    let factsChecked = 0
    for (const { label, source } of sources) {
      const input = projectSource(source)
      const { system, user } = buildSummaryPrompt(input)
      const all = JSON.stringify(input) + system + user
      factsChecked += input.facts.length
      for (const n of ids.names) if (all.includes(n)) leaks.push(`${label}: שם «${n}»`)
      for (const id of ids.ids) if (all.includes(id)) leaks.push(`${label}: מזהה «${id}»`)
      for (const c of ids.classNames) if (all.includes(c)) leaks.push(`${label}: כיתה «${c}»`)
      for (const t of ids.teachers) if (all.includes(t)) leaks.push(`${label}: מורה «${t}»`)
      /* תאריכים: שמות חודשים בלבד, אף פעם לא תאריך מדויק */
      if (/\d{4}-\d{2}-\d{2}/.test(all) || /\d{1,2}[./]\d{1,2}[./]\d{2,4}/.test(all)) leaks.push(`${label}: תאריך מדויק`)
    }
    expect(factsChecked).toBeGreaterThan(2000)
    expect(leaks.slice(0, 10)).toEqual([])
  })

  it('ציוני-שם: גם כשהשם משובץ בתוך משפט בנתוני המקור (alertTexts, summary, studentFindings...) — הוא לא מגיע להקרנה', async () => {
    const sources = await demoSources()
    let embedded = 0
    for (const { label, source } of sources) {
      const json = JSON.stringify(source)
      if (ids.names.some((n) => json.includes(n))) embedded++
      const scrubbed = scrub(source, ids.names) as SummarySource
      const input = projectSource(scrubbed)
      const { system, user } = buildSummaryPrompt(input)
      expect(JSON.stringify(input) + system + user, label).not.toContain(SENTINEL)
    }
    /* אישור שהבדיקה אכן תופסת משהו: ברוב המקורות השם נמצא בנתוני המקור עצמם */
    expect(embedded).toBeGreaterThan(200)
  })

  it('בדיקה עצמית: ציון-שם שמוצב בשדה מותר אכן נתפס (הקנרי לא עובר סתם)', async () => {
    const A = getAnalysis(NOW)
    const sid = A.classById.get('c-v2')!.studentIds[0]
    const overview = (await demoProvider.student(homeroomOf('c-v2'), sid)).data
    const planted = JSON.parse(JSON.stringify(overview)) as typeof overview
    const panel = planted.panels.find((p) => p.access === 'visible')
    if (!panel || panel.access !== 'visible') throw new Error('no visible panel')
    panel.commonErrors = [{ id: 'x', title: `${SENTINEL}0`, hits: 1, exposures: 2 }]
    expect(JSON.stringify(projectStudent(planted, { gender: null }))).toContain(SENTINEL)
  })

  it('collectKnownNames אוסף את שמות המקור (לשומר בלבד); בסקירת כיתה אין שמות', async () => {
    const sources = await demoSources()
    const st = sources.find((s) => s.source.scope === 'student')!.source as Extract<SummarySource, { scope: 'student' }>
    expect(collectKnownNames(st)).toEqual([st.overview.student.displayName])
    const sub = sources.find((s) => s.source.scope === 'submission')!.source
    expect(collectKnownNames(sub).length).toBeGreaterThan(3)
    expect(collectKnownNames(sources.find((s) => s.source.scope === 'class')!.source)).toEqual([])
  })
})

describe('הרשאות בהקרנה: מקצוע אחר לא נכנס, התרעה חוצת-מקצועות למחנך בלבד', () => {
  it('מורה מקצועי: audience=subject, ושמות המקצועות האחרים לא מופיעים בעובדות', async () => {
    const A = getAnalysis(NOW)
    for (const sub of DEMO_SUBJECT_PERSONAS) {
      const t = subjectTeacher(sub)
      const cid = t.teachingClassIds[0]
      const sid = A.classById.get(cid)!.studentIds.find((s) => A.studentById.get(s)!.subjects.includes(sub))!
      const overview = (await demoProvider.student(t, sid)).data
      const input = projectStudent(overview, { gender: null })
      expect(input.audience).toBe('subject')
      expect(input.facts.length).toBeGreaterThan(0)
      const text = input.facts.map((f) => f.text).join('\n')
      expect(text, sub).toContain(subjectName(sub))
      for (const other of otherSubjectNames(sub)) expect(text, `${sub} → ${other}`).not.toContain(other)
      expect(input.facts.some((f) => /בכמה מקצועות בו-זמנית/.test(f.text))).toBe(false)
    }
  })

  it('מחנך: audience=full ומקבל התרעה חוצת-מקצועות כשיש', async () => {
    const A = getAnalysis(NOW)
    const tamar = A.world.students.find((s) => s.cast === 'tamar')!
    const hr = homeroomOf(A.world.classes.find((c) => c.studentIds.includes(tamar.id))!.id)
    const input = projectStudent((await demoProvider.student(hr, tamar.id)).data, { gender: 'female' })
    expect(input.audience).toBe('full')
    expect(input.gender).toBe('female')
    expect(input.facts.some((f) => f.kind === 'finding' && /בכמה מקצועות בו-זמנית/.test(f.text))).toBe(true)
  })

  it('פאנל אפור (מקצוע שהצופה לא רשאי לראות) לא תורם ספירת סשנים', async () => {
    const A = getAnalysis(NOW)
    const t = subjectTeacher('math')
    const sid = A.classById.get(t.teachingClassIds[0])!.studentIds.find((s) => A.studentById.get(s)!.subjects.includes('math'))!
    const overview = (await demoProvider.student(t, sid)).data
    const visible = overview.panels.filter((p) => p.access === 'visible')
    expect(visible.length).toBe(1)
    const expected = visible[0].access === 'visible' ? visible[0].sessionsCount : 0
    expect(projectStudent(overview, { gender: null }).counts.sessions).toBe(expected)
  })
})

describe('מבנה ההקרנות', () => {
  it('עובדות: מזהים f1.., המספרים נגזרים מהטקסט, כל עובדה מסתיימת בנקודה, אין כפילות מזהים', async () => {
    const sources = await demoSources()
    for (const { source } of sources.slice(0, 120)) {
      const input = projectSource(source)
      const ids2 = input.facts.map((f) => f.id)
      expect(new Set(ids2).size).toBe(ids2.length)
      expect(ids2).toEqual(ids2.map((_, i) => `f${i + 1}`))
      expect(input.facts.length).toBeLessThanOrEqual(30)
      for (const f of input.facts) {
        expect(f.numbers).toEqual(numbersIn(f.text))
        expect(f.text.endsWith('.'), f.text).toBe(true)
      }
    }
  })

  it('שכבה בלבד, בלי מספר כיתה: "ו׳" ולא "ו׳2"', async () => {
    const A = getAnalysis(NOW)
    const cid = A.world.classes.find((c) => c.grade === 6)!.id
    const hr = homeroomOf(cid)
    const klass = projectClass((await demoProvider.classOverview(hr, cid)).data)
    expect(klass.gradeLabel).toBe('ו׳')
    expect(klass.sampleUnit).toBe('students')
    expect(klass.counts.students).toBe(A.classById.get(cid)!.studentIds.length)
    expect(layerOf('ז׳3')).toBe('ז׳')
    expect(layerOf('  ')).toBeNull()
    expect(layerOf(undefined)).toBeNull()
  })

  it('סקירת כיתה: alertTexts (שמות) לא נכנסים; מספר התלמידים לתשומת לב כן, כ-"X מתוך Y"', async () => {
    const A = getAnalysis(NOW)
    let overview = (await demoProvider.classOverview(homeroomOf(A.world.classes[0].id), A.world.classes[0].id)).data
    for (const c of A.world.classes) {
      const o = (await demoProvider.classOverview(homeroomOf(c.id), c.id)).data
      if (o.rows.some((r) => r.alerts > 0)) { overview = o; break }
    }
    expect(overview.rows.filter((r) => r.alerts > 0).length).toBeGreaterThan(0)
    expect(overview.rows.some((r) => r.alertTexts.length > 0)).toBe(true)
    const input = projectClass(overview)
    const text = input.facts.map((f) => f.text).join('\n')
    for (const r of overview.rows) for (const t of r.alertTexts) expect(text).not.toContain(t)
    expect(text).toMatch(/\d+ מתוך \d+ תלמידים לתשומת לב/)
  })

  it('מקצוע בכיתה: ספירות מיקום ומגמה, בלי studentFindings ובלי summary.recent', async () => {
    const A = getAnalysis(NOW)
    const cid = A.world.classes[2].id
    const view = (await demoProvider.classSubject(homeroomOf(cid), cid, 'math')).data
    const input = projectClassSubject(view)
    expect(input.scope).toBe('class_subject')
    expect(input.facts.some((f) => f.kind === 'distribution')).toBe(true)
    const text = input.facts.map((f) => f.text).join('\n')
    for (const sf of view.studentFindings) expect(text).not.toContain(sf.finding.text)
    for (const r of view.summary.recent) expect(text).not.toContain(r)
    expect(input.counts.students).toBe(view.students.filter((s) => s.level !== null).length)
  })

  it('הגשה: ספירות סטטוס, אתגרים כ-"X מתוך Y", ללא רשימות שמות', () => {
    const subs = getDemoResults(NOW).submissions
    const s = subs.find((x) => x.input.answers.length > 0) ?? subs[0]
    const view = buildClassView(s.input)
    const input = projectSubmission(view)
    expect(input.scope).toBe('submission')
    expect(input.sampleSize).toBe(view.head.counts.completed)
    expect(input.counts.completed).toBe(view.head.counts.completed)
    expect(input.facts.some((f) => f.kind === 'count' && /מתוך \d+ תלמידים/.test(f.text))).toBe(true)
    const challengeFacts = input.facts.filter((f) => f.kind === 'challenge')
    expect(challengeFacts.length).toBe(view.challenges.filter((c) => c.attempted > 0).length)
    for (const f of challengeFacts) expect(f.text).toMatch(/\d+ מתוך \d+ הצליחו/)
    const sb = (view as { successBands?: { enough: boolean; basis: number } }).successBands
    if (sb?.enough && sb.basis > 0) expect(input.facts.some((f) => f.kind === 'distribution')).toBe(true)
  })

  it('numbersIn ו-inputHash', () => {
    expect(numbersIn('ב-5 מתוך 24 (21%) ורמה 8.5')).toEqual([5, 24, 21, 8.5])
    expect(numbersIn('אין מספרים')).toEqual([])
    const base = projectStudent({ student: { id: 'x', displayName: 'ד', classId: 'c', className: 'c', grade: 4, gradeLabel: 'ד׳' }, summary: 's', access: 'full', panels: [], crossSubject: [], caveats: { ageNorm: 'a', crossSubject: 'b', trend: 'c' } }, { gender: null })
    expect(inputHash(base, 'v1')).toBe(inputHash(base, 'v1'))
    expect(inputHash(base, 'v1')).not.toBe(inputHash(base, 'v2'))
    expect(inputHash({ ...base, facts: [{ id: 'f1', kind: 'level', tone: 'neutral', text: 'x', numbers: [] }] }, 'v1')).not.toBe(inputHash(base, 'v1'))
  })
})

describe('הקוד: הקרנות טהורות מעל החוזה', () => {
  const src = readFileSync(fileURLToPath(new URL('./inputs.ts', import.meta.url)), 'utf8')
  const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

  it('אין גישה ל-DB / ספק; אין הפניה לשדות שמות מחוץ ל-collectKnownNames', () => {
    const code = strip(src)
    expect(code).not.toMatch(/supabase|authz|demoProvider|liveProvider|resolveV2Context/)
    const projections = code.slice(0, code.indexOf('export function collectKnownNames'))
    for (const field of ['displayName', 'gaveUpStudents', 'weakStudents', 'alertTexts', 'senderName', 'studentFindings', 'firstName', 'className']) {
      expect(projections, field).not.toContain(field)
    }
    /* studentName מופיע רק כ-null (narrateFinding בלי שם) */
    expect(projections.match(/studentName(?!:\s*null)/g)).toBeNull()
  })
})
