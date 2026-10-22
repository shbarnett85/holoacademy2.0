/* ──────────────────────────────────────────────────────────────────────────
   assemble — מרכיב World (הקלט של המנוע) משורות גולמיות של כיתה אחת. **טהור**: אין DB, אין שעון (now מוזרק).
   · אותם טיפוסים כמו עולם ההדגמה (demoWorld), עם live:true — כך המנוע, הנגזרות והספק זהים לשניהם.
   · רק מה שנגזר באמת מהנתונים. אין תגיות (concepts / option_tags ריקות) ← concepts ו-exposure/tag ריקים; בלי word_count ← בלי קריאה.
   · הדמיה בלי מקצוע (quests.subject_id) לא נכנסת: נספרת ב-coverage.unclassifiedSessions (חוק 2: לא מנחשים).
   · ריפליי של אותה הדמיה: רק ההשלמה הראשונה לכל (תלמיד, הדמיה) נכנסת לעולם — לסדרת הרמה וההצלחה ולראיות ברמת פריט (תשובות, זיכרון,
     קריאה, ויתורים). שינון מנפח N ומזיז את הרמה בלי שינוי ביכולת (FX1a); החוזרות נספרות ב-coverage.repeatSessions.
   · טוהר סדרת הרמה: השלמה נכנסת לסדרת מקצוע רק אם ל-progress_snapshot יש subject_id השווה למקצוע ההדמיה — ההוכחה שהרמה נגזרה מפרופיל המקצוע
     (הכיול כותב subject_id רק לצד עדכון student_subject_levels). בלי זה הרמה היא של הפרופיל הגלובלי, ושיוך מקצוע בדיעבד להדמיה היה יוצר קפיצה
     מלאכותית בסדרה. כאלה נספרות ב-coverage.sessionsWithoutSubjectLevel.
     מגבלה ידועה: עקיפת מורה על הרמה (student_subject_levels.teacher_locked / level_history trigger='teacher') אינה חלק מהשורות הגולמיות;
     מגמת הרמה האישית נמדדת על ההצלחה ביחס לכיתה (ראו engine.peerRelativePoints) ולכן אינה מושפעת ממדרגה כזו, והרמה משמשת רק לאישור.
   · תלמיד בכמה כיתות: מופיע בכל כיתה שהוא חבר בה (לא נעלם ממורה), והכיתה העיקרית שלו (primaryClassOf) נקבעת בכלל דטרמיניסטי:
     הכיתה שבה נספרו הכי הרבה סשנים (progress_snapshots.class_id); שוויון / אין סשנים ← מזהה הכיתה הקטן. המיזוג (analysisMerge) משתמש בו.
   ────────────────────────────────────────────────────────────────────────── */
import { GRADE_LEVELS } from '../../../../../src/shared/lib/difficultyCalibration.js'
import { SUBJECTS, type SubjectCode } from '../../../../../src/shared/lib/subjects.js'
import type { McItem, MemGame, MemTurn, StudentSubjectData, World, WorldClass, WorldStudent } from '../demoWorld.js'
import { skey } from '../demoWorld.js'
import type { LiveSessionRec } from '../engine.js'
import { buildSchoolDays, dayIndexOf, liveTerm } from '../schoolCalendar.js'
import { emptyCoverage, type LiveCoverage } from './coverage.js'
import {
  LIVE_HORIZON_SCHOOL_DAYS, type RawAnswer, type RawClassData, type RawMemoryFlip, type RawMemoryGame, type RawSceneEnter, type RawSession,
} from './rawTypes.js'

/* סוגי אתגר ברירת-בחירה (הטיית מיקום): trueFalse מחוץ לסדרה — הסדר שלו קבוע ו"בחירת הראשון" אינה הטיית מיקום */
export const POSITION_BIAS_TYPES: readonly string[] = ['multipleChoice', 'finalQuiz']
/* סוגי אתגר רב-ניסיוניים / עם כפתור ויתור (התמדה). multipleChoice / trueFalse / finalQuiz — ניסיון יחיד ולכן לא נספרים */
export const PERSISTENCE_TYPES: readonly string[] = ['memory', 'tileSwap', 'wordSearch', 'wordCompletion', 'sequenceOrder', 'hangman']
/* ספי הכיול 60/80 (CALIBRATION) לרמת מושג נגזרת */
const CONCEPT_STEP_UP = 0.8
const CONCEPT_STEP_DOWN = 0.6
const CONCEPT_MIN_ITEMS = 2

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v))

/* ── שכבת הכיתה: grade_level (1–12) ?? שכבה מהתווית. אין / מחוץ ל-1–12 (גן, י"ג) ← null ── */
/* הסקת שכבה מטקסט חופשי (תווית / שם כיתה): רק ביטוי קפדני של תווית שכבה — אות שכבה (א–יב) ואולי מספר כיתה: "ז׳3", "ו'2", "י״א1", "יב", "כיתה ח׳".
   שם אחר ("בדיקה", "אלפא", "מקהלה", "תגבור מתמטיקה") אינו תווית שכבה: ההסקה הישנה לקחה את האות הראשונה ("בדיקה" ← ב׳) וקבעה לכיתה שכבה אקראית ונורמת גיל שגויה. */
const GRADE_TEXT_LETTERS: Record<string, number> = { א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9, י: 10, יא: 11, יב: 12 }
const GRADE_TEXT = /^(?:כיתה|כיתת)?\s*(י״[אב]|י"[אב]|י''[אב]|י[אב]|[א-י])[׳'״"]?[\s\-_/.]*\d{0,2}$/
export function gradeFromText(text: string | null | undefined): number | null {
  if (typeof text !== 'string') return null
  const m = GRADE_TEXT.exec(text.trim())
  if (!m) return null
  const letters = m[1].replace(/[׳'״"]/g, '')
  return GRADE_TEXT_LETTERS[letters] ?? null
}
export function gradeOfClass(cls: { gradeLevel: number | null; gradeLabel: string | null; name: string | null }): number | null {
  const ok = (g: number | null): g is number => g !== null && Number.isInteger(g) && g >= 1 && g <= 12
  if (ok(cls.gradeLevel)) return cls.gradeLevel
  /* התווית (grade_label) קודמת לשם — ואם יש תווית שאינה שכבה תקפה (למשל י"ג) לא מסיקים שכבה מהשם; ורק ביטוי קפדני של שכבה נחשב */
  return gradeFromText(cls.gradeLabel && cls.gradeLabel.trim() ? cls.gradeLabel : cls.name)
}

/* תווית שכבה בלבד ("ז׳") — לפי סולם השכבות (רמה = שכבה + 4) */
export const gradeLabelOf = (grade: number): string => GRADE_LEVELS.find((g) => g.level === grade + 4)?.label ?? ''

const SUBJECT_ORDER = new Map<string, number>(SUBJECTS.map((s, i) => [s.code, i]))
export function orderSubjects(codes: Iterable<SubjectCode>): SubjectCode[] {
  return [...new Set(codes)].sort((a, b) => (SUBJECT_ORDER.get(a) ?? 99) - (SUBJECT_ORDER.get(b) ?? 99))
}

/* ── ההשלמה הראשונה לכל (תלמיד, הדמיה): מקור הראיות ברמת פריט. מיון: רגע ההשלמה, ובשוויון — מזהה ── */
export function firstCompletionIds(sessions: readonly { id: string; studentId: string; questId: string; completedAt: string }[]): Set<string> {
  const best = new Map<string, { id: string; at: number }>()
  for (const s of sessions) {
    const at = Date.parse(s.completedAt)
    const key = `${s.studentId}|${s.questId}`
    const cur = best.get(key)
    if (!cur || at < cur.at || (at === cur.at && s.id < cur.id)) best.set(key, { id: s.id, at: Number.isFinite(at) ? at : Infinity })
  }
  return new Set([...best.values()].map((b) => b.id))
}

/* ══════════════════════════════════════════════════════════════════════════
   נגזרות טהורות
   ══════════════════════════════════════════════════════════════════════════ */

/* ריפליי של משחק זיכרון מההיפוכים הגולמיים (answers.interaction.flips) לתורות — אותה מודל כמו simulateMemory:
   · תור = שני היפוכים רצופים (לפי t); היפוך יתום בסוף נזרק.
   · avail: בן-הזוג של הקלף הראשון כבר נחשף ועדיין לא הותאם (אז הפנייה אליו "הייתה אפשרית בקשב").
   · hit: שני הקלפים מאותו זוג.
   · pRandom: הסיכוי לפגוע באקראי = 1 / (קלפים שלא הותאמו − 1).
   totalCards (מ-game_data) חסר ← אומדן 2 × (הזוג הגבוה שנחשף + 1); משחק מלא מנוצל במדויק. */
export function replayMemory(flipsIn: readonly RawMemoryFlip[], totalCardsIn: number | null): MemTurn[] {
  const flips = flipsIn
    .filter((f) => isFiniteNum(f.card) && isFiniteNum(f.pair) && isFiniteNum(f.t))
    .map((f, i) => ({ f, i }))
    .sort((a, b) => a.f.t - b.f.t || a.i - b.i)
    .map((x) => x.f)
  if (flips.length < 2) return []
  const estimated = 2 * (Math.max(...flips.map((f) => f.pair)) + 1)
  const total = totalCardsIn !== null && isFiniteNum(totalCardsIn) && totalCardsIn >= estimated ? totalCardsIn : estimated
  const seenByPair = new Map<number, Set<number>>() /* pair → קלפים שנחשפו ולא הותאמו */
  let matched = 0
  const turns: MemTurn[] = []
  for (let i = 0; i + 1 < flips.length; i += 2) {
    const a = flips[i], b = flips[i + 1]
    const known = seenByPair.get(a.pair)
    const avail = !!known && [...known].some((c) => c !== a.card)
    const hit = a.pair === b.pair && a.card !== b.card
    const unmatched = total - matched
    turns.push({ avail, hit, pRandom: unmatched > 1 ? 1 / (unmatched - 1) : 1 })
    if (hit) { matched += 2; seenByPair.delete(a.pair) } else {
      for (const f of [a, b]) {
        const set = seenByPair.get(f.pair) ?? new Set<number>()
        set.add(f.card)
        seenByPair.set(f.pair, set)
      }
    }
  }
  return turns
}

/* קריאה בסשן: רק סצנות בלי אתגר (זמן שהייה בסצנה עם אתגר כולל את זמן הפתרון), עם ספירת מילים וזמן סגור. */
export function readingOfSession(sceneEnters: readonly RawSceneEnter[], puzzleSceneIds: ReadonlySet<string>): { scenes: number; words: number; closedMs: number } {
  let scenes = 0, words = 0, closedMs = 0
  for (const e of sceneEnters) {
    if (e.sceneId === null || puzzleSceneIds.has(e.sceneId)) continue
    if (!isFiniteNum(e.wordCount) || e.wordCount <= 0 || !isFiniteNum(e.closedMs) || e.closedMs < 0) continue
    scenes++
    words += e.wordCount
    closedMs += e.closedMs
  }
  return { scenes, words, closedMs }
}

/* התמדה בסשן: כישלון = wrong / timeout / gave_up באתגר רב-ניסיוני; ויתור = gave_up; afterFail = שיחק עד סוף התקציב. 'closed' לא נספר. */
export function retriesOfAnswers(answers: readonly RawAnswer[]): { afterFail: number; giveUps: number } {
  let fails = 0, giveUps = 0
  for (const a of answers) {
    if (!PERSISTENCE_TYPES.includes(a.puzzleType)) continue
    if (a.outcome === 'wrong' || a.outcome === 'timeout') fails++
    else if (a.outcome === 'gave_up') { fails++; giveUps++ }
  }
  return { afterFail: fails - giveUps, giveUps }
}

/* רמת מושג נגזרת לסשן (חוק 5: אותם ספי 60/80). רק לפריטים שיש להם תגית מושג (מרשימה סגורה) — בלי תגיות מחזיר {}.
   רמה = ממוצע הקושי שהוצג ± צעד (שיעור הצלחה >80% ← +1, <60% ← −1), 1–20; נכלל רק עם ≥ CONCEPT_MIN_ITEMS פריטים. */
export function conceptLevelsOfSession(items: readonly { conceptKey: string | null | undefined; correct: boolean; difficulty: number | null | undefined }[]): Record<string, number> {
  const byKey = new Map<string, { n: number; ok: number; diffs: number[] }>()
  for (const it of items) {
    if (!it.conceptKey) continue
    const cur = byKey.get(it.conceptKey) ?? { n: 0, ok: 0, diffs: [] }
    cur.n++
    if (it.correct) cur.ok++
    if (isFiniteNum(it.difficulty)) cur.diffs.push(it.difficulty)
    byKey.set(it.conceptKey, cur)
  }
  const out: Record<string, number> = {}
  for (const [key, c] of byKey) {
    if (c.n < CONCEPT_MIN_ITEMS || c.diffs.length === 0) continue
    const rate = c.ok / c.n
    const step = rate > CONCEPT_STEP_UP ? 1 : rate < CONCEPT_STEP_DOWN ? -1 : 0
    out[key] = Math.round(clamp(c.diffs.reduce((s, x) => s + x, 0) / c.diffs.length + step, 1, 20) * 10) / 10
  }
  return out
}

/* ══════════════════════════════════════════════════════════════════════════
   הרכבת העולם
   ══════════════════════════════════════════════════════════════════════════ */
export interface AssembledWorld {
  world: World
  coverage: LiveCoverage
  /* תלמיד החבר ביותר מכיתה אחת → הכיתה העיקרית שלו */
  primaryClassOf: Map<string, string>
}

const firstToken = (name: string): string => name.trim().split(/\s+/)[0] ?? ''

export function assembleWorldDetailed(raw: RawClassData, now: Date): AssembledWorld {
  const days = buildSchoolDays(now, LIVE_HORIZON_SCHOOL_DAYS, 0)
  const coverage = emptyCoverage()
  coverage.detailAvailableFrom = raw.detailAvailableFrom
  const world: World = {
    now, days, term: liveTerm(now, days),
    school: { id: raw.school?.id ?? raw.cls?.schoolId ?? '', name: raw.school?.name ?? '' },
    classes: [], students: [], data: new Map(), live: true,
  }
  const primaryClassOf = new Map<string, string>()
  const cls = raw.cls
  if (!cls) return { world, coverage, primaryClassOf }
  const grade = gradeOfClass(cls)
  if (grade === null) { coverage.classesWithoutGrade = 1; coverage.classesWithoutGradeNames = [cls.gradeLabel || cls.name || '']; return { world, coverage, primaryClassOf } }

  /* ── תלמידים ── */
  const members = [...new Map(raw.members.map((m) => [m.id, m])).values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const memberIds = new Set(members.map((m) => m.id))

  /* ── מיפויי עזר ── */
  const questSubject = new Map(raw.quests.map((q) => [q.id, q.subject]))
  const snapBySession = new Map<string, RawClassData['snapshots'][number]>()
  for (const s of raw.snapshots) if (!snapBySession.has(s.sessionId)) snapBySession.set(s.sessionId, s)
  const enters = new Map<string, RawSceneEnter[]>()
  for (const e of raw.sceneEnters) enters.set(e.sessionId, [...(enters.get(e.sessionId) ?? []), e])
  const puzzleScenes = new Map<string, Set<string>>()
  const addPuzzleScene = (sessionId: string, sceneId: string): void => {
    const set = puzzleScenes.get(sessionId) ?? new Set<string>()
    set.add(sceneId)
    puzzleScenes.set(sessionId, set)
  }
  for (const p of raw.puzzleScenes) addPuzzleScene(p.sessionId, p.sceneId)
  for (const a of raw.answers) addPuzzleScene(a.sessionId, a.sceneId)
  const answersBySession = new Map<string, RawAnswer[]>()
  for (const a of raw.answers) answersBySession.set(a.sessionId, [...(answersBySession.get(a.sessionId) ?? []), a])
  const memoryBySession = new Map<string, RawMemoryGame[]>()
  for (const g of raw.memory) memoryBySession.set(g.sessionId, [...(memoryBySession.get(g.sessionId) ?? []), g])

  /* ── סשנים: חברי הכיתה בלבד, בלי כפילויות, מהישן לחדש ── */
  const byId = new Map<string, RawSession>()
  for (const s of raw.sessions) if (memberIds.has(s.studentId) && !byId.has(s.id)) byId.set(s.id, s)
  const sessions = [...byId.values()]
    .sort((a, b) => (Date.parse(a.completedAt) - Date.parse(b.completedAt)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const firstIds = firstCompletionIds(sessions.filter((s) => dayIndexOf(days, s.completedAt) !== null))

  const dataOf = new Map<string, StudentSubjectData>()
  const subjectsOf = new Map<string, Set<SubjectCode>>()
  for (const m of members) subjectsOf.set(m.id, new Set(raw.classSubjects))
  const slot = (studentId: string, subject: SubjectCode): StudentSubjectData => {
    const key = skey(studentId, subject)
    let d = dataOf.get(key)
    if (!d) { d = { sessions: [], mc: [], memory: [] }; dataOf.set(key, d) }
    subjectsOf.get(studentId)!.add(subject)
    return d
  }
  const where = new Map<string, { studentId: string; subject: SubjectCode; day: number }>() /* sessionId → היכן הסשן נספר */

  const unclassifiedIds: string[] = []
  const withoutSubjectLevelIds: string[] = []
  /* G1: אותם משחקים שהוחרגו, לפי תלמיד/ה — לפער ממוקד בכיתה ובמסך התלמיד/ה */
  const unclassifiedBy = new Map<string, number>()
  const unleveledBy = new Map<string, number>()
  const bump = (m: Map<string, number>, studentId: string): void => { m.set(studentId, (m.get(studentId) ?? 0) + 1) }
  for (const s of sessions) {
    const day = dayIndexOf(days, s.completedAt)
    if (day === null) continue
    coverage.sessionsTotal++
    const snap = snapBySession.get(s.id)
    const subject = questSubject.get(s.questId) ?? null
    if (subject === null) { coverage.unclassifiedSessions++; unclassifiedIds.push(s.id); bump(unclassifiedBy, s.studentId); continue }
    /* חוזרת על אותה הדמיה: שינון, לא שינוי ביכולת — לא נכנסת לסדרות ולא לראיות */
    if (!firstIds.has(s.id)) { coverage.repeatSessions++; continue }
    /* הרמה נגזרה מפרופיל המקצוע רק אם ה-snapshot נושא את מקצוע ההדמיה (subject_id); אחרת היא של הפרופיל הגלובלי ואסור לערבב אותה בסדרת המקצוע */
    if (!snap || snap.subject !== subject) { coverage.sessionsWithoutSubjectLevel++; withoutSubjectLevelIds.push(s.id); bump(unleveledBy, s.studentId); continue }
    const d = slot(s.studentId, subject)
    where.set(s.id, { studentId: s.studentId, subject, day })
    const level = snap.level, success = snap.success
    if (!isFiniteNum(level) || level < 0 || level > 20 || !isFiniteNum(success) || success < 0 || success > 1) { coverage.sessionsWithoutLevel++; bump(unleveledBy, s.studentId); continue }

    const myAnswers = answersBySession.get(s.id) ?? []
    const reading = readingOfSession(enters.get(s.id) ?? [], puzzleScenes.get(s.id) ?? new Set())
    const rec: LiveSessionRec = {
      day, date: days[day], success, level,
      concepts: conceptLevelsOfSession(myAnswers.map((a) => ({ conceptKey: a.conceptKey, correct: a.outcome === 'correct', difficulty: a.difficulty }))),
      scenes: reading.scenes, words: reading.words, closedMs: reading.closedMs,
      retries: retriesOfAnswers(myAnswers),
      questId: s.questId,
    }
    d.sessions.push(rec)
    coverage.sessionsUsed++
  }
  coverage.unclassifiedSessionIds = unclassifiedIds
  coverage.sessionsWithoutSubjectLevelIds = withoutSubjectLevelIds
  if (unclassifiedBy.size > 0) coverage.unclassifiedByStudent = Object.fromEntries(unclassifiedBy)
  if (unleveledBy.size > 0) coverage.unleveledByStudent = Object.fromEntries(unleveledBy)

  /* ── ראיות ברמת פריט: רק מההשלמה הראשונה (firstIds) ── */
  for (const a of raw.answers) {
    const at = where.get(a.sessionId)
    if (!at || !firstIds.has(a.sessionId) || !POSITION_BIAS_TYPES.includes(a.puzzleType)) continue
    if (a.outcome !== 'correct' && a.outcome !== 'wrong') continue
    if (!isFiniteNum(a.selectedPosition) || !isFiniteNum(a.correctPosition) || !isFiniteNum(a.displayedCount) || a.displayedCount < 2) continue
    if (a.selectedPosition < 0 || a.correctPosition < 0 || a.selectedPosition >= a.displayedCount || a.correctPosition >= a.displayedCount) continue
    const item: McItem = {
      day: at.day, date: days[at.day], k: a.displayedCount, correctPos: a.correctPosition, selectedPos: a.selectedPosition,
      correct: a.outcome === 'correct', conceptKey: a.conceptKey ?? `${at.subject}.general`, exposure: null, tag: null,
    }
    slot(at.studentId, at.subject).mc.push(item)
  }
  for (const g of raw.memory) {
    const at = where.get(g.sessionId)
    if (!at || !firstIds.has(g.sessionId)) continue
    const turns = replayMemory(g.flips, g.totalCards)
    if (!turns.length) continue
    const game: MemGame = { day: at.day, date: days[at.day], turns }
    slot(at.studentId, at.subject).memory.push(game)
  }

  /* ── הכיתה העיקרית של תלמיד בכמה כיתות ── */
  const multi = members.filter((m) => m.classIds.length > 1)
  coverage.studentsInMultipleClasses = multi.length
  for (const m of multi) {
    const classIds = [...new Set([...m.classIds, cls.id])].sort()
    const counts = new Map<string, number>()
    for (const snap of raw.snapshots) {
      if (snap.studentId !== m.id || !snap.classId || !classIds.includes(snap.classId) || !where.has(snap.sessionId)) continue
      counts.set(snap.classId, (counts.get(snap.classId) ?? 0) + 1)
    }
    let best = classIds[0], bestN = -1
    for (const id of classIds) { const n = counts.get(id) ?? 0; if (n > bestN) { best = id; bestN = n } }
    primaryClassOf.set(m.id, best)
  }

  /* ── הרכבה ── */
  const students: WorldStudent[] = members.map((m) => {
    const subjects = orderSubjects(subjectsOf.get(m.id)!)
    for (const sub of subjects) if (!dataOf.has(skey(m.id, sub))) dataOf.set(skey(m.id, sub), { sessions: [], mc: [], memory: [] })
    return {
      id: m.id, firstName: firstToken(m.name), displayName: m.name,
      /* אין עמודת מגדר ב-prod, והמנוע/הספק אינם משתמשים בו — null (הטיפוס של עולם ההדגמה צר: ראו notes) */
      gender: null as unknown as WorldStudent['gender'],
      classId: cls.id, grade, subjects, cast: null,
    }
  })
  /* סדר הסשנים בתוך תלמיד×מקצוע: מהישן לחדש (אינדקס יום יורד), כמו בעולם ההדגמה */
  for (const d of dataOf.values()) {
    d.sessions.sort((a, b) => b.day - a.day)
    d.mc.sort((a, b) => b.day - a.day)
    d.memory.sort((a, b) => b.day - a.day)
  }
  const wc: WorldClass = {
    id: cls.id, name: cls.gradeLabel || cls.name || '', gradeLabel: gradeLabelOf(grade), grade,
    studentIds: students.map((s) => s.id),
    subjects: orderSubjects([...raw.classSubjects, ...students.flatMap((s) => s.subjects)]),
  }
  world.classes = [wc]
  world.students = students
  world.data = dataOf
  coverage.classesTotal = 1
  coverage.studentsTotal = students.length
  coverage.answersTotal = raw.answers.length + raw.memory.length
  return { world, coverage, primaryClassOf }
}

export function assembleWorld(raw: RawClassData, now: Date): World {
  return assembleWorldDetailed(raw, now).world
}
