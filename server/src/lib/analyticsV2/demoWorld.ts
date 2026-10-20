/* ──────────────────────────────────────────────────────────────────────────
   demoWorld — עולם ההדגמה של האנליטיקה החדשה (שלב D): נתוני **גלם** סינתטיים בזיכרון.
   · אפס שורות DB; הכול is_synthetic מעצם הגדרתו (לא קיים בשום טבלה אמיתית).
   · דטרמיניסטי: PRNG עם seed קבוע (analyticsConfig.DEMO_WORLD.seed), תת-זרם נפרד לכל ישות.
   · זמן: "ימי לימוד" אחורה מאתמול (ראשון–חמישי, ללא יולי–אוגוסט). המיקום באינדקס קבוע, והתאריכים
     (ושמות החודשים/המחצית) מחושבים מהתאריך — כך המספרים זהים בכל יום והתוויות נעות עם היום.
   · זה גלם בלבד: אחוזים, ממצאים, BH והטקסטים נגזרים ב-engine.ts וב-findingsNarrative.ts.
   ────────────────────────────────────────────────────────────────────────── */
import { CLASS_IMPROVEMENT_WINDOW_DAYS, DEMO_WORLD } from '../../../../src/shared/lib/analyticsConfig.js'
import { latestTermStart, type Term } from '../../../../src/shared/lib/findingsNarrative.js'
import type { ContentVectorKey } from '../../../../src/shared/lib/analyticsConfig.js'
import type { SubjectCode } from '../../../../src/shared/lib/subjects.js'
import {
  DEMO_GRADES, ELECTIVE_SUBJECT, FIRST_FEMALE, FIRST_MALE, LAST_NAMES, MISCONCEPTIONS,
  MORPHOLOGY_KEY, SUBJECTS_BY_GRADE, conceptsOfSubject,
} from './catalog.js'

/* ── PRNG ── */
function hash32(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
export function rngFor(label: string): () => number {
  let a = hash32(`${DEMO_WORLD.seed}:${label}`)
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const gauss = (r: () => number): number => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r())
const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v))
const r1 = (v: number): number => Math.round(v * 10) / 10
const smooth = (x: number): number => x * x * (3 - 2 * x)

/* ── טיפוסים ── */
export interface WorldClass { id: string; name: string; gradeLabel: string; grade: number; studentIds: string[] }
export interface WorldStudent {
  id: string; firstName: string; displayName: string; gender: 'male' | 'female'
  classId: string; grade: number; subjects: SubjectCode[]; cast: string | null
}
export interface SessionRec {
  day: number /* אינדקס יום-לימוד אחורה (0 = אחרון) */; date: string
  success: number; level: number
  concepts: Record<string, number>
  scenes: number; words: number; closedMs: number
  retries: { afterFail: number; giveUps: number }
}
export interface McItem {
  day: number; date: string; k: number; correctPos: number; selectedPos: number; correct: boolean
  conceptKey: string; exposure: string | null /* תפיסה שהמסיח המתויג שלה הוצג */; tag: string | null /* תפיסה שנבחר המסיח שלה */
}
export interface MemTurn { avail: boolean; hit: boolean; pRandom: number }
export interface MemGame { day: number; date: string; turns: MemTurn[] }
export interface StudentSubjectData { sessions: SessionRec[]; mc: McItem[]; memory: MemGame[] }

export interface World {
  now: Date
  days: string[] /* ISO לכל יום-לימוד, אינדקס 0 = אחרון */
  /* המחצית שלפיה נמדד "שיפור מאז תחילת המחצית": ב׳ כשחלפו בה מספיק ימי לימוד, אחרת א׳ */
  term: { kind: Term; startIso: string; idx: number }
  school: { id: string; name: string }
  classes: WorldClass[]
  students: WorldStudent[]
  data: Map<string, StudentSubjectData>
}
export const skey = (studentId: string, subject: SubjectCode): string => `${studentId}|${subject}`

/* ── ימי לימוד ── */
function buildSchoolDays(now: Date, count: number): string[] {
  const out: string[] = []
  let t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 12)
  while (out.length < count) {
    const d = new Date(t)
    const dow = d.getUTCDay()
    const month = d.getUTCMonth()
    if (dow <= 4 && month !== 6 && month !== 7) out.push(d.toISOString())
    t -= 86400000
  }
  return out
}

/* בחירת המחצית: ב׳ אם חלפו בה לפחות 2·חלון+10 ימי לימוד; אחרת א׳ (שמתחילה בספטמבר) */
function pickTerm(now: Date, days: string[]): { kind: Term; startIso: string; idx: number } {
  const need = 2 * CLASS_IMPROVEMENT_WINDOW_DAYS + 10
  for (const kind of ['half_b', 'half_a'] as const) {
    const start = latestTermStart(kind, now)
    const elapsed = days.filter((d) => new Date(d).getTime() >= start.getTime()).length
    if (elapsed >= need && elapsed - 1 <= days.length - 1) return { kind, startIso: start.toISOString(), idx: elapsed - 1 }
  }
  const start = latestTermStart('half_a', now)
  return { kind: 'half_a', startIso: start.toISOString(), idx: days.length - 1 }
}

/* ── סגל הדמו (תרחישים) ── */
interface CastDef { key: string; classId: string; first: string; last: string; gender: 'male' | 'female' }
const CAST: CastDef[] = [
  { key: 'alon', classId: 'c-v2', first: 'אלון', last: 'גולן', gender: 'male' },
  { key: 'noa', classId: 'c-v2', first: 'נועה', last: 'שמש', gender: 'female' },
  { key: 'tamar', classId: 'c-v2', first: 'תמר', last: 'בראון', gender: 'female' },
  { key: 'yuval', classId: 'c-v2', first: 'יובל', last: 'טובי', gender: 'male' },
  { key: 'daniel', classId: 'c-v2', first: 'דניאל', last: 'עמר', gender: 'male' },
  { key: 'itay', classId: 'c-v2', first: 'איתי', last: 'נחום', gender: 'male' },
  { key: 'maya', classId: 'c-v2', first: 'מאיה', last: 'רוזן', gender: 'female' },
  { key: 'roi', classId: 'c-v2', first: 'רועי', last: 'זכאי', gender: 'male' },
  { key: 'lior', classId: 'c-v2', first: 'ליאור', last: 'סגל', gender: 'female' },
  { key: 'dana', classId: 'c-d2', first: 'דנה', last: 'לביא', gender: 'female' },
  { key: 'yahav', classId: 'c-d1', first: 'יהב', last: 'וקנין', gender: 'male' },
]
const CLASS_DEFS = [
  { id: 'c-d1', name: 'ד׳1', grade: 4, size: 22 },
  { id: 'c-d2', name: 'ד׳2', grade: 4, size: 24 },
  { id: 'c-v1', name: 'ו׳1', grade: 6, size: 25 },
  { id: 'c-v2', name: 'ו׳2', grade: 6, size: 25 },
] as const

interface LevelMod { startIdx: number; delta: number; ramp: number }
interface SubjProfile {
  L0: number; slope: number; mods: LevelMod[]; sessions: number; succBase: number
  mcItems: number; bias: number; msPerWord: number; maxDay: number
  memGames: number; memAttention: number
  /* מגמה כיתתית ברמות בלבד (לא נוגעת באחוזי ההצלחה, ולכן אינה משפיעה על ממצאי "שינוי ברמה") */
  classTrend: number
}

const H = DEMO_WORLD.schoolDays
const NORM_OF_GRADE = (g: number): number => g + 4

/* ── אפקטים כיתתיים לתצוגת הדמו (רק לתלמידים שאינם בסגל התרחישים): הזזת רמת הכיתה במקצוע (level, ברמות)
   ומגמה כיתתית בחודשים האחרונים (trend). נותנים לכיתות פרצופים שונים מול הטווח המיועד, בלי לגעת בהצלחה. ── */
const CLASS_EFFECTS: Record<string, Partial<Record<SubjectCode, { level?: number; trend?: number }>>> = {
  'c-v2': { math: { level: 1.8, trend: 0.8 }, history: { level: -1.9, trend: -1.6 }, science: { level: 0.5 }, english: { level: 0.4, trend: 0.8 } },
  'c-v1': { math: { level: -0.6 }, history: { level: -2.7, trend: 0.8 }, hebrew: { level: 0.5 } },
  'c-d1': { math: { level: -1.8, trend: -1.0 }, english: { level: 1.9 }, science: { level: 0.4 } },
  'c-d2': { science: { level: 1.7, trend: 0.8 }, hebrew: { level: -0.5 }, bible: { level: 0.4 } },
}

/* ── תחומים (סוגי תוכן) חזקים/מאתגרים: הסטת רמות המושגים של תחום שלם. רכיב כיתתי (תחום חזק + תחום מאתגר לכל
   כיתה×מקצוע) ורכיב אישי (לחלק מהתלמידים). קבוע בזמן, ולכן מתבטל בהפרש בין חלונות השיפור הכיתתי. ── */
const AREA_STEP = 1.7
const AREA_STEP_STUDENT = 1.3
function areaOffsets(classId: string, studentId: string, subject: SubjectCode): Partial<Record<ContentVectorKey, number>> {
  /* בעברית "הבנת מושגים" = מושג המורפולוגיה, שמודד תרחיש נפרד — לא מזיזים אותו */
  const vectors = [...new Set(conceptsOfSubject(subject).map((c) => c.vector))].filter((v) => !(subject === 'hebrew' && v === 'concept_understanding'))
  const out: Partial<Record<ContentVectorKey, number>> = {}
  if (vectors.length < 2) return out
  const shuffle = (label: string): ContentVectorKey[] => {
    const r = rngFor(label)
    return vectors.map((v) => ({ v, k: r() })).sort((x, y) => x.k - y.k).map((x) => x.v)
  }
  const cls = shuffle(`area-class:${classId}:${subject}`)
  out[cls[0]] = (out[cls[0]] ?? 0) + AREA_STEP
  out[cls[1]] = (out[cls[1]] ?? 0) - AREA_STEP
  const r = rngFor(`area-student:${studentId}:${subject}`)
  if (r() < 0.45) {
    const v = vectors[Math.floor(r() * vectors.length)]
    out[v] = (out[v] ?? 0) + (r() < 0.5 ? AREA_STEP_STUDENT : -AREA_STEP_STUDENT)
  }
  return out
}

/* מגמה אישית ברמות בלבד (חלק מהתלמידים עולים, חלק יורדים) — כדי שבדמו תהיה מגוון מגמות בלי ממצאי שינוי */
function studentTrendOf(studentId: string, subject: SubjectCode): number {
  const r = rngFor(`trend-student:${studentId}:${subject}`)
  const x = r()
  return x < 0.18 ? 0.9 + r() * 0.5 : x < 0.3 ? -(0.9 + r() * 0.5) : 0
}

function levelAt(p: SubjProfile, i: number): number {
  const u = 1 - i / (H - 1)
  let v = p.L0 + p.slope * u
  for (const m of p.mods) v += m.delta * smooth(clamp((m.startIdx - i) / m.ramp, 0, 1))
  v += classTrendAt(p, i)
  return v
}
/* המגמה הכיתתית נכנסת לרמת המפגש בלבד — לא לרמות המושגים (אחרת היא יוצרת ממצאי שיפור כיתתי במושגים) */
function classTrendAt(p: SubjProfile, i: number): number {
  return p.classTrend * smooth(clamp((90 - i) / 60, 0, 1))
}
function modOffset(p: SubjProfile, i: number): number {
  let v = 0
  for (const m of p.mods) v += m.delta * smooth(clamp((m.startIdx - i) / m.ramp, 0, 1))
  return v
}

/* ── משחק זיכרון: 8 זוגות; a = הסתברות לפנות לזוג מוכר כשהוא ידוע ── */
function simulateMemory(a: number, rng: () => number): MemTurn[] {
  const partner = (c: number): number => c ^ 1
  const matched = new Set<number>()
  const known = new Set<number>()
  const turns: MemTurn[] = []
  let guard = 0
  while (matched.size < 16 && guard++ < 200) {
    const unmatched = [...Array(16).keys()].filter((c) => !matched.has(c))
    const first = unmatched[Math.floor(rng() * unmatched.length)]
    const rest = unmatched.filter((c) => c !== first)
    const partnerKnown = known.has(partner(first))
    if (partnerKnown) {
      const hit = rng() < a
      turns.push({ avail: true, hit, pRandom: 1 / rest.length })
      if (hit) { matched.add(first); matched.add(partner(first)); known.delete(partner(first)) } else {
        const others = rest.filter((c) => c !== partner(first))
        const second = others[Math.floor(rng() * others.length)]
        known.add(first); known.add(second)
      }
    } else {
      const second = rest[Math.floor(rng() * rest.length)]
      turns.push({ avail: false, hit: second === partner(first), pRandom: 1 / rest.length })
      if (second === partner(first)) { matched.add(first); matched.add(second) } else { known.add(first); known.add(second) }
    }
  }
  return turns
}

/* ── בניית העולם ── */
export function buildWorld(now: Date): World {
  const days = buildSchoolDays(now, H)
  const pickedTerm = pickTerm(now, days)
  const halfBIdx = pickedTerm.idx

  /* כיתות ותלמידים */
  const classes: WorldClass[] = CLASS_DEFS.map((c) => ({ id: c.id, name: c.name, gradeLabel: DEMO_GRADES.find((g) => g.grade === c.grade)!.label, grade: c.grade, studentIds: [] }))
  const students: WorldStudent[] = []
  const used = new Set<string>(CAST.map((c) => `${c.first} ${c.last}`))
  const namesRng = rngFor('names')
  const malePool = FIRST_MALE.filter((n) => !CAST.some((c) => c.first === n))
  const femalePool = FIRST_FEMALE.filter((n) => !CAST.some((c) => c.first === n))
  for (const cd of CLASS_DEFS) {
    const cls = classes.find((c) => c.id === cd.id)!
    const cast = CAST.filter((c) => c.classId === cd.id)
    const subjects = SUBJECTS_BY_GRADE[cd.grade]
    for (let i = 0; i < cd.size; i++) {
      const id = `s-${cd.id.slice(2)}-${String(i + 1).padStart(2, '0')}`
      const c = cast[i]
      let first: string, last: string, gender: 'male' | 'female'
      if (c) { first = c.first; last = c.last; gender = c.gender } else {
        gender = namesRng() < 0.5 ? 'male' : 'female'
        const pool = gender === 'male' ? malePool : femalePool
        do { first = pool[Math.floor(namesRng() * pool.length)]; last = LAST_NAMES[Math.floor(namesRng() * LAST_NAMES.length)] } while (used.has(`${first} ${last}`))
        used.add(`${first} ${last}`)
      }
      students.push({ id, firstName: first, displayName: `${first} ${last}`, gender, classId: cd.id, grade: cd.grade, subjects: [...subjects], cast: c?.key ?? null })
      cls.studentIds.push(id)
    }
  }
  /* ערבית (בחירה): 4 תלמידים בלבד מ-ו׳1 → תא קטן מדי (מוסתר למנהל) */
  for (const id of classes.find((c) => c.id === 'c-v1')!.studentIds.slice(5, 9)) students.find((s) => s.id === id)!.subjects.push(ELECTIVE_SUBJECT)

  const roiIdEarly = students.find((s) => s.cast === 'roi')!.id
  /* שיעורי תפיסה: מי "מציג" כל תפיסה — קבוע מראש, חלוקה מדויקת */
  const prone = new Map<string, Set<string>>() /* misconceptionId → studentIds */
  for (const m of MISCONCEPTIONS) {
    const set = new Set<string>()
    for (const cd of CLASS_DEFS) {
      const share = m.prevalence[cd.grade as 4 | 6]
      if (share === undefined) continue
      const ids = classes.find((c) => c.id === cd.id)!.studentIds.filter((x) => x !== roiIdEarly)
      let count = Math.round(share * ids.length)
      if (m.id === 'mc-frac-add-straight') count = cd.id === 'c-v1' ? 11 : cd.id === 'c-v2' ? 10 : 0 /* 21 מתוך 50 = 42% */
      const rr = rngFor(`prone:${m.id}:${cd.id}`)
      const order = ids.map((x) => ({ x, k: rr() })).sort((a, b) => a.k - b.k).map((o) => o.x)
      for (const sid of order.slice(0, count)) set.add(sid)
    }
    prone.set(m.id, set)
  }

  /* גמלי תרחיש "בנימין": רווח מורפולוגי ב-ו׳2 — T_i בעשיריות, ממוצע מדויק 2.4 */
  const v2Students = classes.find((c) => c.id === 'c-v2')!.studentIds
  const roiId = roiIdEarly
  const morphIds = v2Students.filter((id) => id !== roiId)
  const gr = rngFor('morph-gains')
  const raw = morphIds.map(() => clamp(2.4 + 0.8 * gauss(gr), 0.8, 4.2))
  const tenths = raw.map((x) => Math.round(x * 10))
  let diff = morphIds.length * 24 - tenths.reduce((s, x) => s + x, 0)
  for (let k = 0; diff !== 0; k = (k + 1) % tenths.length) { const step = diff > 0 ? 1 : -1; tenths[k] += step; diff -= step }
  const targetDelta = new Map(morphIds.map((id, k) => [id, tenths[k] / 10]))

  const data = new Map<string, StudentSubjectData>()
  const W = CLASS_IMPROVEMENT_WINDOW_DAYS
  const startWin = [halfBIdx - W, halfBIdx] as const /* חלון התחלה: בתחילת מחצית ב׳ */
  const endWin = [0, W] as const

  for (const st of students) {
    const rS = rngFor(`student:${st.id}`)
    const ability = gauss(rS) * 0.9
    const persistenceQ = clamp(0.62 + gauss(rS) * 0.14, 0.25, 0.95)
    const baseMsPerWord = clamp(330 * Math.exp(gauss(rS) * 0.16), 200, 520)
    const memHeavy = rS() < 0.14
    for (const subject of st.subjects) {
      const rP = rngFor(`prof:${st.id}:${subject}`)
      const centre = NORM_OF_GRADE(st.grade)
      const prof: SubjProfile = {
        L0: r1(centre + ability + gauss(rP) * 0.5 - 0.3 + (CLASS_EFFECTS[st.classId]?.[subject]?.level ?? 0)), slope: 0.5 + gauss(rP) * 0.25, mods: [],
        sessions: 34 + Math.floor(rP() * 13), succBase: clamp(0.7 + ability * 0.03, 0.55, 0.85),
        mcItems: 14 + Math.floor(rP() * 15), bias: 0, msPerWord: baseMsPerWord, maxDay: H - 1,
        memGames: memHeavy && rP() < 0.5 ? 8 + Math.floor(rP() * 3) : Math.floor(rP() * 3), memAttention: clamp(0.76 + gauss(rP) * 0.07, 0.55, 0.9),
        classTrend: st.cast ? 0 : (CLASS_EFFECTS[st.classId]?.[subject]?.trend ?? 0) + studentTrendOf(st.id, subject),
      }
      if (subject === ELECTIVE_SUBJECT) { prof.sessions = 26; prof.mcItems = 12 }
      const cast = st.cast
      const areaOff = areaOffsets(st.classId, st.id, subject)
      const areaOf = (c: { vector: ContentVectorKey }): number => areaOff[c.vector] ?? 0
      /* ── תרחישים ── */
      if (cast === 'alon' && subject === 'history') { prof.L0 = centre - 0.2; prof.slope = 1.9; prof.mods = [{ startIdx: 50, delta: -2.4, ramp: 12 }]; prof.sessions = 46 }
      if (cast === 'noa') {
        if (subject === 'english') { prof.L0 = centre + 2.9; prof.slope = 0.5 }
        if (subject === 'math') { prof.L0 = centre - 2.6; prof.slope = 0.1 }
      }
      if (cast === 'tamar' && (subject === 'history' || subject === 'science' || subject === 'hebrew')) {
        prof.slope = 0.5
        prof.mods = [{ startIdx: subject === 'history' ? 52 : subject === 'science' ? 49 : 55, delta: -2.6, ramp: 12 }]
        prof.sessions = 60
      }
      if (cast === 'maya' && subject === 'math') { prof.L0 = centre - 0.6; prof.slope = 0.3; prof.mods = [{ startIdx: 105, delta: 2.8, ramp: 60 }]; prof.sessions = 44 }
      if (cast === 'dana' && subject === 'english') { prof.L0 = centre - 0.3; prof.slope = 0.3; prof.mods = [{ startIdx: 100, delta: 3.0, ramp: 55 }]; prof.sessions = 44 }
      if (cast === 'daniel' && subject === 'math') { prof.bias = 0.55; prof.mcItems = 44 }
      if (cast === 'lior' && subject === 'math') { prof.bias = 0.2; prof.mcItems = 40 }
      if (cast === 'itay' && (subject === 'history' || subject === 'science')) prof.msPerWord = 95
      if (cast === 'yuval' && subject === 'science') { prof.memGames = 9; prof.memAttention = 0.04 }
      if (cast === 'yuval' && subject === 'english') { prof.memGames = 3; prof.memAttention = 0.78 }
      if (cast === 'yahav' && subject === 'science') { prof.memGames = 3; prof.memAttention = 0.05 }
      if (cast === 'roi') { prof.sessions = 7; prof.mcItems = subject === 'math' ? 9 : 5; prof.maxDay = 13; prof.memGames = subject === 'science' ? 2 : 0; prof.memAttention = 0.05; if (subject === 'math') prof.bias = 0.7 }
      /* דמויות התרחיש (מלבד יובל/יהב/רועי) ללא משחקי זיכרון כבדים — שומר על סט הבדיקות נקי */
      if (cast && cast !== 'yuval' && cast !== 'yahav' && cast !== 'roi') prof.memGames = Math.min(prof.memGames, 2)

      /* ── מפגשים ── */
      const sessions: SessionRec[] = []
      const rSes = rngFor(`ses:${st.id}:${subject}`)
      const concepts = conceptsOfSubject(subject)
      const horizon = prof.maxDay + 1
      const positions: number[] = []
      for (let j = 0; j < prof.sessions; j++) positions.push(clamp(Math.floor(((j + rSes()) / prof.sessions) * horizon), 0, prof.maxDay))
      /* הרחבה: ו׳2 עברית — לפחות 3 מפגשי מורפולוגיה בכל אחד משני חלונות המחצית */
      const morphForced = new Set<number>()
      const isMorphClass = st.classId === 'c-v2' && subject === 'hebrew' && targetDelta.has(st.id)
      if (isMorphClass) {
        for (let q = 0; q < 3; q++) {
          const ps = clamp(startWin[0] + Math.floor(rSes() * (startWin[1] - startWin[0] + 1)), 0, H - 1)
          const pe = clamp(Math.floor(rSes() * (endWin[1] - endWin[0] + 1)), 0, H - 1)
          positions.push(ps, pe)
          morphForced.add(ps); morphForced.add(pe)
        }
      }
      positions.sort((a, b) => b - a)
      /* ו׳2 מורפולוגיה: הרווח נקבע כך שהשינוי הנמדד (ממוצע חלון הסוף פחות חלון ההתחלה) = היעד בדיוק */
      let morphGain = 0
      let morphBase = 0
      if (isMorphClass) {
        const pOf = (d: number): number => clamp((halfBIdx - d) / halfBIdx, 0, 1)
        const inStart = positions.filter((d) => d >= startWin[0] && d <= startWin[1])
        const inEnd = positions.filter((d) => d >= endWin[0] && d <= endWin[1])
        const ps = inStart.reduce((s, d) => s + pOf(d), 0) / inStart.length
        const pe = inEnd.reduce((s, d) => s + pOf(d), 0) / inEnd.length
        morphGain = targetDelta.get(st.id)! / (pe - ps)
        morphBase = centre - 0.4 + ability * 0.5
      }
      /* מורפולוגיה כבקרה (שאר המחלקות): רווח זניח */
      const controlGain = st.classId === 'c-v1' ? 0.1 + gauss(rSes) * 0.3 : 0.1 + gauss(rSes) * 0.2
      for (const i of positions) {
        const lvl = clamp(levelAt(prof, i) + gauss(rSes) * 0.2, 1, 20)
        const succ = clamp(prof.succBase + 0.1 * modOffset(prof, i) + gauss(rSes) * 0.06, 0.15, 0.98)
        const conceptLevels: Record<string, number> = {}
        const pick = concepts.length ? [concepts[Math.floor(rSes() * concepts.length)], concepts[Math.floor(rSes() * concepts.length)]] : []
        for (const c of pick) conceptLevels[c.key] = r1(clamp(lvl - classTrendAt(prof, i) + gauss(rSes) * 0.25 + areaOf(c), 1, 20))
        if (subject === 'hebrew') {
          if (isMorphClass) {
            const p = clamp((halfBIdx - i) / halfBIdx, 0, 1)
            conceptLevels[MORPHOLOGY_KEY] = r1000(morphBase + morphGain * p)
          } else if (rSes() < 0.35) {
            const p = clamp((halfBIdx - i) / halfBIdx, 0, 1)
            conceptLevels[MORPHOLOGY_KEY] = r1(centre - 0.3 + ability * 0.5 + controlGain * p + gauss(rSes) * 0.25)
          }
        }
        const scenes = 5 + Math.floor(rSes() * 4)
        const words = Math.round(scenes * (30 + rSes() * 25))
        const msw = prof.msPerWord * Math.exp(gauss(rSes) * 0.12)
        const fails = Math.max(0, Math.round((1 - succ) * 4 + rSes() * 0.8 - 0.2))
        let afterFail = 0
        for (let f = 0; f < fails; f++) if (rSes() < persistenceQ) afterFail++
        sessions.push({
          day: i, date: days[i], success: Math.round(succ * 1000) / 1000, level: r1(lvl), concepts: conceptLevels,
          scenes, words, closedMs: Math.round(words * msw), retries: { afterFail, giveUps: fails - afterFail },
        })
      }

      /* ── פריטי בחירה מרובה ── */
      const mc: McItem[] = []
      const rMc = rngFor(`mc:${st.id}:${subject}`)
      const pCorrect = (i: number): number => clamp(prof.succBase + 0.1 * modOffset(prof, i) + gauss(rMc) * 0.05, 0.1, 0.97)
      const dayPick = (): number => clamp(Math.floor(rMc() * (prof.maxDay + 1)), 0, prof.maxDay)
      const layout = (): { k: number; correctPos: number } => { const k = rMc() < 0.5 ? 3 : 4; return { k, correctPos: Math.floor(rMc() * k) } }
      for (let j = 0; j < prof.mcItems; j++) {
        const { k, correctPos } = layout()
        const day = dayPick()
        const concept = concepts.length ? concepts[Math.floor(rMc() * concepts.length)].key : `${subject}.general`
        let selectedPos: number
        if (rMc() < prof.bias) selectedPos = 0
        else if (rMc() < pCorrect(day)) selectedPos = correctPos
        else { const wrongs = [...Array(k).keys()].filter((p) => p !== correctPos); selectedPos = wrongs[Math.floor(rMc() * wrongs.length)] }
        mc.push({ day, date: days[day], k, correctPos, selectedPos, correct: selectedPos === correctPos, conceptKey: concept, exposure: null, tag: null })
      }
      /* חשיפות לתפיסות שגויות (4–7 פריטים; ההכרעה פר-תלמיד קבועה מראש) */
      for (const m of MISCONCEPTIONS) {
        if (m.subject !== subject || m.prevalence[st.grade as 4 | 6] === undefined) continue
        const e = cast === 'roi' ? 3 : 4 + Math.floor(rMc() * 4)
        const isProne = prone.get(m.id)!.has(st.id)
        const hits = isProne ? clamp(Math.ceil(0.7 * e), 2, e) : (rMc() < 0.25 ? 1 : 0) /* חדש/ה: לא prone → לכל היותר 1 */
        const hitIdx = new Set<number>()
        while (hitIdx.size < hits) hitIdx.add(Math.floor(rMc() * e))
        for (let j = 0; j < e; j++) {
          const { k, correctPos } = layout()
          const day = dayPick()
          const k2 = k /* k ≥ 3: נכון + מסיח מתויג + לפחות מסיח נוסף */
          const tagPos = (correctPos + 1 + Math.floor(rMc() * (k2 - 1))) % k2
          let selectedPos: number
          if (hitIdx.has(j)) selectedPos = tagPos
          else if (rMc() < pCorrect(day)) selectedPos = correctPos
          else { const others = [...Array(k2).keys()].filter((p) => p !== correctPos && p !== tagPos); selectedPos = others[Math.floor(rMc() * others.length)] }
          mc.push({ day, date: days[day], k: k2, correctPos, selectedPos, correct: selectedPos === correctPos, conceptKey: m.conceptKey, exposure: m.id, tag: hitIdx.has(j) ? m.id : null })
        }
      }

      /* ── משחקי זיכרון ── */
      const memory: MemGame[] = []
      const rMem = rngFor(`mem:${st.id}:${subject}`)
      for (let g = 0; g < prof.memGames; g++) {
        const day = clamp(Math.floor(rMem() * (prof.maxDay + 1)), 0, prof.maxDay)
        memory.push({ day, date: days[day], turns: simulateMemory(clamp(prof.memAttention + gauss(rMem) * 0.05, 0, 1), rMem) })
      }

      data.set(skey(st.id, subject), { sessions, mc, memory })
    }
  }

  return {
    now, days, term: pickedTerm,
    school: { id: 'demo-school', name: 'בית הספר "אופק" (הדגמה)' },
    classes, students, data,
  }
}
function r1000(v: number): number { return Math.round(v * 1000) / 1000 }

/* מטמון לפי יום (הנתונים זהים בכל יום; רק התאריכים זזים) */
const CACHE = new Map<string, World>()
export function getWorld(now: Date = new Date()): World {
  const key = now.toISOString().slice(0, 10)
  let w = CACHE.get(key)
  if (!w) {
    w = buildWorld(now)
    CACHE.clear()
    CACHE.set(key, w)
  }
  return w
}
