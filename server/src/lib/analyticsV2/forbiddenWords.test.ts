import { describe, expect, it } from 'vitest'
import * as narrative from '../../../../src/shared/lib/findingsNarrative.js'
import { HOW_WE_CALC } from '../../../../src/shared/lib/findingsNarrative.js'
import { AppError } from '../../middleware/errors.js'
import { DEMO_HOMEROOM_CLASS, DEMO_SUBJECT_PERSONAS, type V2Viewer } from './access.js'
import { demoProvider, demoViewerClasses, getAnalysis } from './demoProvider.js'
import { realProvider, type AnalyticsV2Provider } from './provider.js'

/* ──────────────────────────────────────────────────────────────────────────
   עברית פשוטה למורה עם ניסיון מוגבל במחשב: בשום מחרוזת שהספק מחזיר אין מונחים טכניים/סטטיסטיים,
   פרט לקבוצה HOW_WE_CALC (ולסעיף how_we_calculated בתדריך, שמציג רק אותה).
   הבדיקה עוברת על **כל** ערך מחרוזת בכל תגובה של כל ספק, בכל עדשה, לכל תלמיד וכיתה.
   ────────────────────────────────────────────────────────────────────────── */
const FORBIDDEN: { name: string; re: RegExp }[] = [
  { name: 'וקטור', re: /וקטור/ },
  { name: 'p (עצמאית)', re: /(?<![A-Za-z])p(?![A-Za-z])/i },
  { name: 'מובהק', re: /מובהק/ },
  { name: 'BH', re: /BH/ },
  { name: 'Benjamini', re: /Benjamini/i },
  { name: 'אינדקס', re: /אינדקס/ },
  { name: 'קורלציה', re: /קורלציה/ },
  { name: 'הסתברות', re: /הסתברות/ },
  { name: 'גודל אפקט', re: /גודל אפקט/ },
  { name: 'אפקט', re: /אפקט/ },
  /* מונחים טכניים נוספים שאין להציג */
  { name: 'סטטיסטי', re: /סטטיסט/ },
  { name: 'פוסטריורי', re: /פוסטרי/ },
  { name: 'השערה', re: /השערות/ },
  { name: 'מתוקן', re: /מתוקן/ },
  { name: 'N =', re: /\bN\s*=/ },
  { name: 'מסיח', re: /מסיח/ },
  /* מילים מעולם הסטטיסטיקה שמורה לא אמור/ה להיתקל בהן */
  { name: 'נורמה', re: /נורמה|נורמת|נורמות/ },
  { name: 'ריבוע', re: /ריבוע/ },
  { name: 'סטיית תקן', re: /סטיית\s*תקן/ },
  { name: 'רגרסיה', re: /רגרסי/ },
  { name: 'אחוזון', re: /אחוזון/ },
  { name: 'חציון', re: /חציון/ },
]

const hits = (s: string): string[] => FORBIDDEN.filter((f) => f.re.test(s)).map((f) => f.name)

/* מעבר על כל ערכי המחרוזת (לא מפתחות) */
function* strings(value: unknown, path = '$'): Generator<{ path: string; text: string }> {
  if (typeof value === 'string') yield { path, text: value }
  else if (Array.isArray(value)) for (let i = 0; i < value.length; i++) yield* strings(value[i], `${path}[${i}]`)
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) yield* strings(v, `${path}.${k}`)
}

/* בתדריך: סעיף "איך חישבנו?" הוא המקום היחיד שבו מותר פירוט חישובי */
function withoutHowWeCalculated(data: unknown): unknown {
  const d = data as { sections?: { id: string }[] }
  return Array.isArray(d?.sections) ? { ...d, sections: d.sections.filter((s) => s.id !== 'how_we_calculated') } : data
}

const A = getAnalysis(new Date('2026-10-19T09:00:00Z'))
const homeroomOf = (cid: string): V2Viewer => ({ lens: 'homeroom', guest: true, homeroomClassId: cid, teachingClassIds: [], subjectCodes: [] })
const admin: V2Viewer = { lens: 'admin', guest: true, homeroomClassId: null, teachingClassIds: [], subjectCodes: [] }
const teacher = (s: (typeof DEMO_SUBJECT_PERSONAS)[number]): V2Viewer => ({ lens: 'subject_teacher', guest: true, homeroomClassId: null, teachingClassIds: demoViewerClasses([s]), subjectCodes: [s] })

interface Collected { label: string; data: unknown }

/* כל תגובות הספק (כל נקודות הקצה) לצופה אחד */
async function collect(p: AnalyticsV2Provider, v: V2Viewer, label: string): Promise<Collected[]> {
  const out: Collected[] = []
  const add = async (what: string, fn: () => Promise<{ data: unknown }>): Promise<void> => {
    try { out.push({ label: `${label} ${what}`, data: withoutHowWeCalculated((await fn()).data) }) } catch (e) { if (!(e instanceof AppError)) throw e /* 403/404 צפויים — אין תגובה */ }
  }
  await add('config', () => p.config(v))
  await add('roster', () => p.roster(v))
  await add('entry', () => p.entry(v))
  await add('admin', () => p.admin(v))
  const classIds = v.lens === 'homeroom' ? [v.homeroomClassId as string] : v.lens === 'subject_teacher' ? v.teachingClassIds : A.world.classes.map((c) => c.id)
  for (const cid of classIds) {
    await add(`overview:${cid}`, () => p.classOverview(v, cid))
    await add(`briefing-class:${cid}`, () => p.briefing(v, 'class', cid))
    const cls = A.classById.get(cid)
    const subjects = [...new Set((cls?.studentIds ?? []).flatMap((sid) => A.studentById.get(sid)!.subjects))]
    for (const sub of subjects) await add(`class:${cid}:${sub}`, () => p.classSubject(v, cid, sub))
    for (const sid of cls?.studentIds ?? []) {
      await add(`student:${sid}`, () => p.student(v, sid))
      await add(`feedback:${sid}`, () => p.feedback(v, sid))
      await add(`briefing-student:${sid}`, () => p.briefing(v, 'student', sid))
    }
  }
  return out
}

describe('עברית פשוטה: אין מונחים טכניים בשום תגובת ספק', () => {
  it('הגלאי עצמו תופס מונחים אסורים ולא מתריע על ניסוח תקין', () => {
    for (const bad of ['גודל אפקט = 2.4', 'p מתוקן (BH) = 0.01', 'וקטור "הבנת מושגים"', 'מובהק סטטיסטית', 'אינדקס', 'קורלציה', 'הסתברות 90%', 'Benjamini-Hochberg', 'מסיח שגוי', 'מעל הנורמה', 'מבחן חי בריבוע', 'סטיית תקן', 'רגרסיה לינארית', 'האחוזון ה-90', 'החציון הכיתתי']) {
      expect(hits(bad).length, bad).toBeGreaterThan(0)
    }
    for (const good of ['נראה שהלחיצות היו מהירות', 'ב-5 מתוך 24 פעמים (21%)', 'מבוסס על 10 הדמיות, מדצמבר 2025 עד אוקטובר 2026', 'פעם ראשונה', 'טעות נפוצה', 'תחום חזק', 'הטווח המיועד לשכבה: מ-8.5 עד 11.5', 'הרמות של מקצועות שונים אינן ניתנות להשוואה ישירה.']) {
      expect(hits(good), good).toEqual([])
    }
  })

  it('הקבוצה HOW_WE_CALC היא המקום שבו הפירוט הטכני כן חי', () => {
    const joined = [HOW_WE_CALC.methodNote, ...HOW_WE_CALC.evidenceLines(12, 0.012, 2.4, '2025-12-01T12:00:00Z', '2026-10-01T12:00:00Z')].join(' ')
    expect(hits(joined)).toEqual(expect.arrayContaining(['Benjamini', 'BH', 'גודל אפקט', 'N =']))
    expect(HOW_WE_CALC.title).toBe('איך חישבנו?')
    expect(HOW_WE_CALC.lines.length).toBeGreaterThanOrEqual(5)
  })

  it('כל מחרוזת קבועה במודול התבניות (מחוץ ל-HOW_WE_CALC) נקייה', () => {
    const skip = new Set(['HOW_WE_CALC'])
    const bad: string[] = []
    let checked = 0
    for (const [name, value] of Object.entries(narrative)) {
      if (skip.has(name) || typeof value === 'function') continue
      for (const s of strings(value, name)) { checked++; if (hits(s.text).length) bad.push(`${s.path}: ${s.text}`) }
    }
    expect(checked).toBeGreaterThan(40)
    expect(bad).toEqual([])
  })

  it('כל מחרוזת בכל תגובה של הספק (כל העדשות, כל התלמידים והכיתות, תדריכים ומשוב)', async () => {
    const viewers: { v: V2Viewer; label: string }[] = [
      ...A.world.classes.map((c) => ({ v: homeroomOf(c.id), label: `מחנך ${c.id}` })),
      ...DEMO_SUBJECT_PERSONAS.map((s) => ({ v: teacher(s), label: `מורה ${s}` })),
      { v: admin, label: 'מנהל' },
    ]
    let walked = 0
    const bad: string[] = []
    for (const { v, label } of viewers) {
      for (const r of await collect(demoProvider, v, label)) {
        for (const s of strings(r.data)) { walked++; const h = hits(s.text); if (h.length) bad.push(`${r.label} ${s.path} [${h.join(',')}]: ${s.text}`) }
      }
    }
    expect(walked, 'הבדיקה סרקה מספיק מחרוזות').toBeGreaterThan(5000)
    expect(bad.slice(0, 10)).toEqual([])
  })

  it('גם הספק האמיתי ("אין עדיין מספיק נתונים") נקי, בכל נקודות הקצה', async () => {
    const bad: string[] = []
    let walked = 0
    for (const v of [homeroomOf(DEMO_HOMEROOM_CLASS), teacher('math'), admin]) {
      const sid = A.classById.get(DEMO_HOMEROOM_CLASS)!.studentIds[0]
      const rs = [
        await realProvider.config(v), await realProvider.roster(v), await realProvider.entry(v), await realProvider.student(v, sid), await realProvider.feedback(v, sid),
        await realProvider.classOverview(v, DEMO_HOMEROOM_CLASS), await realProvider.classSubject(v, DEMO_HOMEROOM_CLASS, 'math'), await realProvider.admin(v),
        await realProvider.briefing(v, 'class', DEMO_HOMEROOM_CLASS), await realProvider.briefing(v, 'student', sid),
      ]
      for (const r of rs) for (const s of strings(withoutHowWeCalculated(r.data))) { walked++; if (hits(s.text).length) bad.push(`${s.path}: ${s.text}`) }
    }
    expect(walked).toBeGreaterThan(20)
    expect(bad).toEqual([])
  })

  it('תדריך: הפירוט הטכני מופיע רק בסעיף how_we_calculated, והסעיפים האחרים משתמשים בשורות ראיה פשוטות', async () => {
    const sid = A.world.students.find((s) => s.cast === 'alon')!.id
    const b = (await demoProvider.briefing(homeroomOf(DEMO_HOMEROOM_CLASS), 'student', sid)).data
    const how = b.sections.find((s) => s.id === 'how_we_calculated')!
    expect(how).toBeDefined()
    expect(b.sections[b.sections.length - 1].id).toBe('how_we_calculated')
    expect(how.title).toBe(HOW_WE_CALC.title)
    const howText = JSON.stringify(how)
    expect(howText).toContain('Benjamini')
    expect(howText).toContain('N = ')
    const others = b.sections.filter((s) => s.id !== 'how_we_calculated')
    expect([...strings(others)].filter((s) => hits(s.text).length)).toEqual([])
    /* שורת הראיה הפשוטה: "מבוסס על 10 הדמיות, מדצמבר 2025 עד אוקטובר 2026" */
    const basis = b.sections.find((s) => s.id === 'evidence_basis')!
    expect(basis.items.length).toBeGreaterThan(0)
    for (const it of basis.items) expect(it.text).toMatch(/מבוסס על \d+ הדמיות, מ[א-ת]+ \d{4} עד [א-ת]+ \d{4}/)
    /* כל ממצא מדווח בתדריך מקבל פריט בסעיף "איך חישבנו?" עם השורות הטכניות */
    const trend = b.sections.find((s) => s.id === 'trend')!
    expect(trend.items.length).toBeGreaterThan(0)
    expect(how.items.some((i) => i.evidence.some((l) => /BH/.test(l)))).toBe(true)
  })

  it('כל ממצא בדמו קרוא גם בתבנית הקצרה וגם בתבנית המלאה, ללא מונחים טכניים', () => {
    const all = [...A.ss.values()].flatMap((sa) => sa.findings)
    let reported = 0
    for (const f of all) {
      if (f.status !== 'reported') continue
      reported++
      expect(hits(f.text), f.text).toEqual([])
      expect(hits(narrative.narrateShort(f.evidence, { studentName: 'דוגמה', subjectName: 'מתמטיקה' })), f.id).toEqual([])
      expect(hits(narrative.narrateRecommendationFromFinding(f.evidence, { studentName: 'דוגמה', subjectName: 'מתמטיקה' })), f.id).toEqual([])
    }
    expect(reported).toBeGreaterThan(5)
    /* ממצאים מסוג זיכרון: אין אחוז "סבירות" והשוואת השערות */
    const mem = all.find((f) => f.status === 'reported' && f.kind === 'memory_random_pattern')!
    expect(mem.text).not.toMatch(/\d+% לפי/)
    expect(mem.text).toMatch(/מתוך/)
  })

  it('ספירות מוצגות כ"X מתוך Y" (תפיסות, התקדמות כיתתית)', async () => {
    const view = (await demoProvider.classSubject(homeroomOf('c-v1'), 'c-v1', 'math')).data
    for (const m of view.misconceptions) {
      if (m.status === 'reported') expect(m.countText).toContain(`${m.studentsShowing} מתוך ${m.studentsExposed}`)
      else expect(m.countText).toContain(narrative.NO_DATA_YET)
    }
    const hardest = view.recommendations[0]
    expect(hardest.text).toMatch(/\d+ מתוך \d+ תלמידים/)
  })
})
