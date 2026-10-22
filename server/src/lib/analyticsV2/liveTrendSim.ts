/* ──────────────────────────────────────────────────────────────────────────
   liveTrendSim — סימולציית משטרי-אפס למגמה האישית בעולם חי (FX1a). כלי בדיקות בלבד: לא נטען בייצור, ואינו קובץ בדיקה.
   · בונה World חי של כיתה אחת עם לוח הדמיות משותף (המורה מקצה הדמיה לכל הכיתה, התלמידים משלימים אותה בתוך כמה ימי לימוד),
     מריץ את analyze() האמיתי, וסופר כמה ממצאי מגמה ותוויות "משתפר/ת" ו"בירידה" נוצרו.
   · בכל משטר-אפס אין שום שינוי אמיתי ביכולת של אף תלמיד/ה — כל ממצא הוא ממצא שווא.
   · דטרמיניסטי: PRNG עם seed, אין Math.random.
   משטרים (mode):
     fixed    — תוכן בקושי קבוע: ההסתברות להצליח קבועה לתלמיד/ה (ועוד היסט לכל הדמיה), הרמה ממשיכה להיות מכוילת 60/80 ולנדוד
     adaptive — כיול אדפטיבי מלא: התוכן מותאם לרמה, ולכן ההצלחה חוזרת ל~70% והרמה עוקבת אחרי היכולת
   הסטות: classShift = היסט קושי כיתתי בהדמיות של החלון האחרון בלבד (לפי יום ההקצאה, או לפי יום ההשלמה: shiftBy).
   changers = תלמידים שהיכולת שלהם באמת משתנה בחלון האחרון (לבדיקת עוצמה).
   ────────────────────────────────────────────────────────────────────────── */
import { TREND_WINDOWS } from '../../../../src/shared/lib/analyticsConfig.js'
import { analyze, type Analysis, type LiveSessionRec } from './engine.js'
import { skey, type StudentSubjectData, type World } from './demoWorld.js'
import { buildSchoolDays } from './schoolCalendar.js'
import { studentTrend } from './derive.js'
import { emptyRaw, type RawClassData } from './realWorld/rawTypes.js'

export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const gauss = (r: () => number): number => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r())
const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v))
const binom = (r: () => number, n: number, p: number): number => { let k = 0; for (let i = 0; i < n; i++) if (r() < p) k++; return k }

export interface SimOpts {
  seed: number
  mode: 'fixed' | 'adaptive'
  students?: number
  /* ימי לימוד בין הקצאות של הדמיה לכיתה */
  every?: number
  /* אתגרים בהדמיה (רזולוציית ההצלחה) */
  items?: number
  /* ההסתברות שתלמיד/ה משלים/ה הדמיה שהוקצתה */
  participation?: number
  /* עד כמה ימי לימוד אחרי ההקצאה התלמיד/ה משלים/ה */
  delayMax?: number
  /* סטיית תקן של היסט הקושי לכל הדמיה (משותף לכל הכיתה) */
  questSd?: number
  /* סטיית תקן של אינטראקציה תלמיד×הדמיה (חוזקות ידע ספציפיות) */
  interactionSd?: number
  /* היסט קושי כיתתי בהדמיות של החלון האחרון בלבד (הסתברות הצלחה) */
  classShift?: number
  shiftBy?: 'quest' | 'session'
  /* תלמידים (אינדקסים) שהיכולת שלהם משתנה בחלון האחרון: delta בהסתברות הצלחה (fixed) או ברמות יכולת (adaptive) */
  changers?: { index: number; delta: number }[]
  /* כל תלמיד/ה משחק/ת הדמיות משלו/ה (אין הדמיות משותפות) — בדיקת "אין עמיתים" */
  solo?: boolean
  /* טווח ההצלחה הבסיסית של התלמידים (ברירת מחדל 0.5–0.9); טווח רחב כולל תלמידי תקרה ורצפה */
  baseRange?: [number, number]
  /* הסתברות שמשחק נזנח באמצע (הצלחה נמוכה אקראית 0–0.3) — זנבות כבדים */
  abandon?: number
  /* שונות הנסחפת של היכולת (הליכה אקראית לאורך ההדמיות) — שינוי "אמיתי" קטן ואיטי */
  driftSd?: number
}

export const SIM_NOW = new Date('2026-03-18T10:00:00Z') /* יום רביעי באמצע מחצית ב׳ */

export function simulateClass(o: SimOpts): World {
  const n = o.students ?? 25
  const every = o.every ?? 5
  const items = o.items ?? 8
  const participation = o.participation ?? 0.9
  const delayMax = o.delayMax ?? 3
  const questSd = o.questSd ?? 0.08
  const interactionSd = o.interactionSd ?? 0
  const shift = o.classShift ?? 0
  const shiftBy = o.shiftBy ?? 'quest'
  const days = buildSchoolDays(SIM_NOW, 260, 0)
  const r = rng(o.seed)
  /* לוח הדמיות משותף: אינדקס יום ההקצאה, מהישן לחדש */
  const quests: { id: string; day: number; offset: number }[] = []
  for (let day = 255, q = 0; day >= 0; day -= every, q++) quests.push({ id: `q${q}`, day, offset: gauss(r) * questSd })
  const data = new Map<string, StudentSubjectData>()
  const students: World['students'] = []
  const { recentDays: R } = TREND_WINDOWS
  for (let s = 0; s < n; s++) {
    const id = `s${s}`
    const ability = 10 + (r() - 0.5) * 6
    const [bLo, bHi] = o.baseRange ?? [0.5, 0.9]
    const base = bLo + r() * (bHi - bLo)
    let drift = 0
    const change = o.changers?.find((c) => c.index === s)?.delta ?? 0
    let level = 10
    const sessions: LiveSessionRec[] = []
    for (const q of quests) {
      if (r() >= participation) continue
      const day = Math.max(0, q.day - Math.floor(r() * (delayMax + 1)))
      const recentByQuest = q.day < R
      const recentBySession = day < R
      const classShiftNow = shift !== 0 && (shiftBy === 'quest' ? recentByQuest : recentBySession) ? shift : 0
      const own = change !== 0 && recentBySession ? change : 0
      const inter = interactionSd > 0 ? gauss(r) * interactionSd : 0
      if (o.driftSd) drift += gauss(r) * o.driftSd
      let p: number
      if (o.mode === 'fixed') p = clamp(base + drift + q.offset + inter + classShiftNow + own, 0.05, 0.97)
      else p = clamp(1 / (1 + Math.exp(-(ability + drift * 10 + own - level + 0.8) / 1.5)) + q.offset * 0.5 + inter + classShiftNow, 0.05, 0.97)
      const rate = o.abandon && r() < o.abandon ? r() * 0.3 : binom(r, items, p) / items
      level = clamp(level + (rate > 0.8 ? 1 : rate < 0.6 ? -1 : 0), 1, 20)
      sessions.push({
        day, date: days[day], success: rate, level, concepts: {}, scenes: 0, words: 0, closedMs: 0, retries: { afterFail: 0, giveUps: 0 },
        questId: o.solo ? `${id}-${q.id}` : q.id,
      })
    }
    /* סדר הצבירה: מהחדש לישן (day עולה) כמו בעולם האמיתי */
    sessions.sort((a, b) => a.day - b.day)
    data.set(skey(id, 'math'), { sessions, mc: [], memory: [] })
    students.push({ id, firstName: id, displayName: id, gender: 'male', classId: 'c', grade: 6, subjects: ['math'], cast: null })
  }
  return {
    now: SIM_NOW, days, term: null, school: { id: 's', name: 's' },
    classes: [{ id: 'c', name: 'ו׳1', gradeLabel: 'ו׳', grade: 6, studentIds: students.map((s) => s.id), subjects: ['math'] }],
    students, data, live: true,
  }
}

export interface ClassOutcome {
  students: number
  tested: number
  flagged: number
  flaggedUp: number
  flaggedDown: number
  labelUp: number
  labelDown: number
  flaggedIds: string[]
}
export function outcomeOf(a: Analysis): ClassOutcome {
  const out: ClassOutcome = { students: 0, tested: 0, flagged: 0, flaggedUp: 0, flaggedDown: 0, labelUp: 0, labelDown: 0, flaggedIds: [] }
  for (const sa of a.ss.values()) {
    out.students++
    if (sa.liveTrend?.tested) out.tested++
    const f = sa.findings.find((x) => x.kind === 'level_trend' && x.status === 'reported')
    if (f && f.status === 'reported' && f.evidence.kind === 'level_trend') {
      out.flagged++
      out.flaggedIds.push(sa.studentId)
      if (f.evidence.direction === 'up') out.flaggedUp++
      else out.flaggedDown++
    }
    const t = studentTrend(sa)
    if (t === 'improving') out.labelUp++
    else if (t === 'declining') out.labelDown++
  }
  return out
}

export interface RegimeSummary {
  classes: number
  students: number
  tested: number
  flagged: number
  flaggedPct: number
  classesWithAnyFlag: number
  classesWithAnyFlagPct: number
  labelNonSteadyPct: number
  flaggedUp: number
  flaggedDown: number
}
export function runRegime(base: Omit<SimOpts, 'seed'>, classes: number, seed0: number): RegimeSummary {
  let students = 0, tested = 0, flagged = 0, any = 0, labels = 0, up = 0, down = 0
  for (let i = 0; i < classes; i++) {
    const o = outcomeOf(analyze(simulateClass({ ...base, seed: seed0 + i })))
    students += o.students; tested += o.tested; flagged += o.flagged; labels += o.labelUp + o.labelDown; up += o.flaggedUp; down += o.flaggedDown
    if (o.flagged > 0) any++
  }
  return {
    classes, students, tested, flagged, flaggedPct: round1(100 * flagged / students), classesWithAnyFlag: any,
    classesWithAnyFlagPct: round1(100 * any / classes), labelNonSteadyPct: round1(100 * labels / students), flaggedUp: up, flaggedDown: down,
  }
}
const round1 = (v: number): number => Math.round(v * 10) / 10

/* ── אותו עולם כשורות גולמיות בצורת ה-DB (מקצוע ההדמיה ב-snapshot, כמו שהכיול כותב אותו) — לבדיקת צינור ההרכבה המלא ──
   repeats = כמה השלמות חוזרות לכל השלמה (לבדיקת "רק הראשונה"): ההשלמה החוזרת מאוחרת מהמקורית ונושאת רמה מוטה כלפי מעלה (שינון). */
export function rawFromWorld(world: World, opts: { repeats?: number } = {}): RawClassData {
  const cls = world.classes[0]
  const raw: RawClassData = {
    ...emptyRaw(), cls: { id: cls.id, name: cls.name, gradeLabel: cls.name, gradeLevel: cls.grade, schoolId: 'school-1' },
    school: { id: 'school-1', name: 'School One' }, classSubjects: ['math'],
  }
  const quests = new Set<string>()
  for (const st of world.students) {
    raw.members.push({ id: st.id, name: st.displayName, classIds: [cls.id] })
    for (const rec of world.data.get(skey(st.id, 'math'))?.sessions ?? []) {
      const questId = (rec as LiveSessionRec).questId ?? `${st.id}-${rec.day}`
      quests.add(questId)
      const push = (suffix: string, completedAt: string, level: number, success: number): void => {
        const id = `${st.id}-${questId}${suffix}`
        raw.sessions.push({ id, studentId: st.id, questId, completedAt })
        raw.snapshots.push({ sessionId: id, studentId: st.id, classId: cls.id, subject: 'math', level, success })
      }
      push('', rec.date, rec.level, rec.success)
      for (let k = 1; k <= (opts.repeats ?? 0); k++) {
        const later = new Date(Date.parse(rec.date) + k * 3600_000).toISOString()
        push(`-r${k}`, later, Math.min(20, rec.level + k), Math.min(1, rec.success + 0.1))
      }
    }
  }
  raw.quests = [...quests].map((id) => ({ id, subject: 'math' as const }))
  return raw
}
