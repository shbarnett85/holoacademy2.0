/* ── נתוני הדגמה לאנליטיקה של מצב "מורה אורח" ─────────────────────────────
   כיתה וירטואלית + תלמידים וירטואליים, מחושבים בזמן הבקשה — אפס שורות DB:
   · הפרדה מוחלטת מנתונים אמיתיים (הנתונים לא קיימים בכלל ב-DB — אין דליפה
     לשום כיוון, מורה אמיתי לעולם לא רואה אותם, RLS לא נדרש).
   · קריאה-בלבד מבנייה (אין מה לכתוב אליו).
   · **זמן פיקטיבי קבוע**: אין תאריכים מוחלטים — רק היסטים יחסיים (ימים
     אחורה מ"אתמול"). הטווח תמיד "משנה בדיוק אחורה ועד אתמול" ומתגלגל
     קדימה; חישובי השנה בחשבון-תאריכים אמיתי (setFullYear) — עמיד לשנים
     מעוברות. **הערכים עצמם דטרמיניסטיים לחלוטין** (PRNG עם seed קבוע,
     נדגם בזמן בניית המודול-נתונים — לא Math.random בזמן ריצה).
   · אותו קוד קליינט: הפונקציות מחזירות בדיוק את צורות התגובה של נקודות
     הקצה האמיתיות ב-analytics.ts/staff.ts.
   הסולם תואם למודל האמיתי: text_level ‏1-20, רמות אתגר 1-10, כלל 60/80
   (רמה יורדת מתחת ל-60% הצלחה, עולה מעל 80%), ספי דגלים 60/85. */

/* ── PRNG דטרמיניסטי (mulberry32, seed קבוע) ── */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const round2 = (v: number) => Math.round(v * 100) / 100

/* תאריך לפי היסט ימים אחורה מהיום (00:00 מקומי + שעת-פעילות קבועה) */
function daysAgo(now: Date, days: number, hour = 10, minute = 0): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, hour, minute, 0, 0)
  return d
}
/* אורך חלון השנה בימים — חשבון תאריכים אמיתי (עמיד לשנה מעוברת) */
function yearSpanDays(now: Date): number {
  const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
  return Math.round((now.getTime() - yearAgo.getTime()) / 86400000)
}

/* ── פרופילי התלמידים הווירטואליים ──
   שמות עבריים גנריים (שמות-משפחה מהטבע — לא אנשים אמיתיים). הגיוון הוא
   הפואנטה: כל פרופיל מספר סיפור אחר באנליטיקה.
   curve(t) = אחוז הצלחה בסיסי בזמן t∈[0..1] (0=לפני שנה, 1=אתמול). */
interface DemoProfile {
  id: string
  name: string
  gender: 'male' | 'female'
  story: string
  sessions: number /* דו-ספרתי (10-99) */
  startLevel: number /* text_level התחלתי (1-20) */
  jitter: number /* תנודתיות סביב העקומה */
  curve: (t: number) => number
  avgSceneMs: number /* קצב קריאה אופייני (לדגלי skip/slow) */
}

export const DEMO_CLASS = { id: 'demo-class-1', gradeLabel: 'ו׳2', name: 'ו׳2', urlCode: 'demo-vav2' }

const PROFILES: DemoProfile[] = [
  { id: 'demo-s1', name: 'אביגיל ברק', gender: 'female', story: 'מצטיינת יציבה', sessions: 26, startLevel: 9, jitter: 0.04, curve: () => 0.9, avgSceneMs: 38000 },
  { id: 'demo-s2', name: 'יונתן שדה', gender: 'male', story: 'התקשה — והשתפר משמעותית', sessions: 31, startLevel: 4, jitter: 0.06, curve: (t) => 0.42 + 0.36 * t, avgSceneMs: 52000 },
  { id: 'demo-s3', name: 'תמר גולן', gender: 'female', story: 'תנודתית', sessions: 24, startLevel: 7, jitter: 0.05, curve: (t) => 0.68 + 0.16 * Math.sin(t * Math.PI * 5), avgSceneMs: 41000 },
  { id: 'demo-s4', name: 'עידו נחל', gender: 'male', story: 'פתח חזק — ונחלש', sessions: 22, startLevel: 9, jitter: 0.05, curve: (t) => 0.86 - 0.3 * t, avgSceneMs: 4200 /* מהיר מאוד — חשד לדילוג בהמשך */ },
  { id: 'demo-s5', name: 'נועם הרר', gender: 'male', story: 'אמצע יציב', sessions: 19, startLevel: 6, jitter: 0.05, curve: () => 0.72, avgSceneMs: 47000 },
  { id: 'demo-s6', name: 'שירה כרמל', gender: 'female', story: 'מתקדמת לאט ובעקביות', sessions: 28, startLevel: 5, jitter: 0.04, curve: (t) => 0.6 + 0.22 * t, avgSceneMs: 58000 },
  { id: 'demo-s7', name: 'אלון דגן', gender: 'male', story: 'מתקשה כרונית, שיפור קל', sessions: 17, startLevel: 3, jitter: 0.06, curve: (t) => 0.38 + 0.14 * t, avgSceneMs: 97000 /* איטי */ },
  { id: 'demo-s8', name: 'מיכל אשד', gender: 'female', story: 'הצטרפה באמצע השנה — חזקה', sessions: 15, startLevel: 8, jitter: 0.04, curve: () => 0.84, avgSceneMs: 36000 },
]

/* ── מטלות הדמו — היסטי ימים קבועים מ"היום"; החדשה ביותר לפני 3 ימים,
   הוותיקה ~שנה. הכותרות גנריות ותואמות-מוצר. ── */
interface DemoAssignmentDef {
  id: string
  title: string
  subject: string
  daysAgo: number
  challenges: { title: string; type: string }[]
  objectives?: string[]
}

const ASSIGNMENTS: DemoAssignmentDef[] = [
  { id: 'demo-a1', title: 'מסע טיפת המים — מחזור המים בטבע', subject: 'מדעים', daysAgo: 3, objectives: ['התלמיד יתאר את שלבי מחזור המים', 'התלמיד יסביר את תפקיד השמש בתהליך', 'התלמיד יזהה התאדות ועיבוי בדוגמאות יומיומיות'], challenges: [
    { title: 'ענן ראשון באופק', type: 'multipleChoice' }, { title: 'תחנת ההתאדות', type: 'trueFalse' }, { title: 'פאזל מפל המים', type: 'tileSwap' }, { title: 'זיכרון: מושגי המחזור', type: 'memory' }, { title: 'מבחן המסע', type: 'finalQuiz' }] },
  { id: 'demo-a2', title: 'עוגה בחלקים — שברים פשוטים', subject: 'מתמטיקה', daysAgo: 12, challenges: [
    { title: 'חצי או רבע?', type: 'multipleChoice' }, { title: 'השלם את השבר', type: 'wordCompletion' }, { title: 'סידור שברים בגודל', type: 'sequenceOrder' }, { title: 'נכון או לא: שברים שקולים', type: 'trueFalse' }] },
  { id: 'demo-a3', title: 'בלשי השורש — משפחות מילים', subject: 'עברית', daysAgo: 24, challenges: [
    { title: 'מצא את השורש', type: 'multipleChoice' }, { title: 'תפזורת משפחות', type: 'wordSearch' }, { title: 'פיצוח קוד השורש', type: 'hangman' }, { title: 'נכון/לא נכון: בניינים', type: 'trueFalse' }] },
  { id: 'demo-a4', title: 'יום הבחירות — כך עובדת דמוקרטיה', subject: 'אזרחות', daysAgo: 38, challenges: [
    { title: 'מי בוחר את הכנסת?', type: 'multipleChoice' }, { title: 'סדר את שלבי הבחירות', type: 'sequenceOrder' }, { title: 'דילמת הקול האחד', type: 'moralDilemma' }, { title: 'מבחן הדמוקרטיה', type: 'finalQuiz' }] },
  { id: 'demo-a5', title: 'מסע בין כוכבים — מערכת השמש', subject: 'מדעים', daysAgo: 55, challenges: [
    { title: 'סדר את כוכבי הלכת', type: 'sequenceOrder' }, { title: 'פאזל צדק', type: 'tileSwap' }, { title: 'נכון/לא: כוכב או כוכב לכת', type: 'trueFalse' }, { title: 'זיכרון שמימי', type: 'memory' }] },
  { id: 'demo-a6', title: 'דוד וגליית — אומץ מול כוח', subject: 'תנ״ך', daysAgo: 76, challenges: [
    { title: 'עמק האלה', type: 'multipleChoice' }, { title: 'השלם את הפסוק', type: 'wordCompletion' }, { title: 'דילמת המלך', type: 'moralDilemma' }, { title: 'מבחן הסיפור', type: 'finalQuiz' }] },
  { id: 'demo-a7', title: 'ציידי ההנחות — אחוזים ביומיום', subject: 'מתמטיקה', daysAgo: 103, challenges: [
    { title: 'כמה זה 25%?', type: 'multipleChoice' }, { title: 'חשב את ההנחה', type: 'wordCompletion' }, { title: 'נכון/לא: מבצעים', type: 'trueFalse' }] },
  { id: 'demo-a8', title: 'המהפכה השקטה — המצאת הדפוס', subject: 'היסטוריה', daysAgo: 140, challenges: [
    { title: 'לפני גוטנברג', type: 'multipleChoice' }, { title: 'סדר את שלבי ההדפסה', type: 'sequenceOrder' }, { title: 'תפזורת בית הדפוס', type: 'wordSearch' }, { title: 'מבחן המהפכה', type: 'finalQuiz' }] },
  { id: 'demo-a9', title: 'הנקודה הנמוכה בעולם — ים המלח', subject: 'גאוגרפיה', daysAgo: 187, challenges: [
    { title: 'למה צפים?', type: 'multipleChoice' }, { title: 'פאזל הנוף', type: 'tileSwap' }, { title: 'נכון/לא: מליחות', type: 'trueFalse' }] },
  { id: 'demo-a10', title: 'תיבת נח — הסיפור והלקח', subject: 'תנ״ך', daysAgo: 231, challenges: [
    { title: 'ארבעים יום', type: 'multipleChoice' }, { title: 'זיכרון: זוגות בתיבה', type: 'memory' }, { title: 'השלם את הסיפור', type: 'wordCompletion' }] },
  { id: 'demo-a11', title: 'גוף האדם — מערכת העיכול', subject: 'מדעים', daysAgo: 278, challenges: [
    { title: 'מסע הכריך', type: 'sequenceOrder' }, { title: 'נכון/לא: אנזימים', type: 'trueFalse' }, { title: 'פיצוח קוד האיבר', type: 'hangman' }, { title: 'מבחן המערכת', type: 'finalQuiz' }] },
  { id: 'demo-a12', title: 'ירושלים בימי בית שני', subject: 'היסטוריה', daysAgo: 322, challenges: [
    { title: 'עולי הרגל', type: 'multipleChoice' }, { title: 'פאזל הר הבית', type: 'tileSwap' }, { title: 'נכון/לא: הורדוס', type: 'trueFalse' }] },
]

/* ── בניית "עולם" הדמו — כל הערכים נקבעים כאן פעם אחת, דטרמיניסטית ──
   לכל (תלמיד, מטלה): האם השתתף, מתי (היסט יחסי מהמטלה), ואחוז הצלחה —
   מהעקומה של הפרופיל בזמן המטלה + jitter מה-PRNG הקבוע. בנוסף sessions
   "חופשיים" (משחק עצמאי בספרייה) עד יעד ה-sessions הדו-ספרתי של הפרופיל. */
interface DemoSession {
  studentId: string
  assignmentId: string | null /* null = משחק חופשי */
  title: string
  daysAgo: number /* היסט מ"היום"; 1 = אתמול */
  completed: boolean
  successRate: number | null
  crystals: number | null
  durationMs: number | null
  avgSceneMs: number | null
  textLevelAfter: number /* רמת הטקסט אחרי הכיול (כלל 60/80) */
}

const FREE_TITLES = ['לאונרדו דה וינצ׳י — איש הרנסאנס', 'הרי געש ורעידות אדמה', 'ממלכת הדבורים', 'המסע ללב המוח', 'יוון העתיקה — אתונה', 'מסע אל מצרים העתיקה']

function buildWorld() {
  const rand = mulberry32(20260911) /* seed קבוע — אותם ערכים תמיד */
  const sessions: DemoSession[] = []
  const trajectories = new Map<string, { daysAgo: number; level: number; success: number }[]>()

  for (const p of PROFILES) {
    let level = p.startLevel
    const traj: { daysAgo: number; level: number; success: number }[] = []
    /* מסגרת הזמן של התלמיד: מיכל (s8) הצטרפה לפני ~110 יום; השאר שנה מלאה */
    const oldest = p.id === 'demo-s8' ? 110 : 363
    /* רשימת ימי-משחק: המטלות שבטווח + מפגשים חופשיים במרווחים שווים */
    const days: { daysAgo: number; assignment: DemoAssignmentDef | null }[] = []
    for (const a of ASSIGNMENTS) {
      if (a.daysAgo > oldest) continue
      /* לא כולם משתתפים בכל מטלה — מגוון סטטוסים (הוותיקות כמעט מלאות) */
      const participate = rand() < (a.daysAgo > 30 ? 0.95 : 0.8)
      if (participate) days.push({ daysAgo: a.daysAgo - 1 - Math.floor(rand() * 2), assignment: a })
    }
    const freeCount = Math.max(0, p.sessions - days.length)
    for (let j = 0; j < freeCount; j++) {
      const frac = freeCount === 1 ? 0.5 : j / (freeCount - 1)
      const d = clamp(Math.round(1 + frac * (oldest - 2)) + Math.floor(rand() * 5) - 2, 1, oldest)
      days.push({ daysAgo: d, assignment: null })
    }
    days.sort((a, b) => b.daysAgo - a.daysAgo) /* מהישן לחדש */

    for (const day of days) {
      const t = 1 - day.daysAgo / 363 /* 0=לפני שנה, 1=אתמול */
      const success = clamp(p.curve(t) + (rand() * 2 - 1) * p.jitter, 0.05, 1)
      /* כלל 60/80 האמיתי: <60% ירידה, >80% עלייה — הרמות זזות כמו במודל הכיול */
      if (success < 0.6) level = clamp(level - 1, 1, 20)
      else if (success > 0.8) level = clamp(level + 1, 1, 20)
      const completed = rand() > 0.06 /* מעט "באמצע" */
      const sceneMs = Math.round(p.avgSceneMs * (0.85 + rand() * 0.3))
      sessions.push({
        studentId: p.id,
        assignmentId: day.assignment?.id ?? null,
        title: day.assignment?.title ?? FREE_TITLES[Math.floor(rand() * FREE_TITLES.length)],
        daysAgo: day.daysAgo,
        completed,
        successRate: completed ? round2(success) : null,
        crystals: completed ? clamp(Math.round(success * 5), 0, 5) : null,
        durationMs: completed ? sceneMs * (6 + Math.floor(rand() * 3)) : null,
        avgSceneMs: completed ? sceneMs : null,
        textLevelAfter: level,
      })
      traj.push({ daysAgo: day.daysAgo, level, success: round2(success) })
    }
    trajectories.set(p.id, traj)
  }
  return { sessions, trajectories }
}

/* העולם נבנה פעם אחת בטעינת המודול — הערכים זהים לכל בקשה ולכל ריצה */
const WORLD = buildWorld()

const STRUGGLE = 0.6
const EXCEL = 0.85
const SKIP_MS = 5000
const SLOW_MS = 90000

function flagsFor(success: number | null, avgSceneMs: number | null): string[] {
  const flags: string[] = []
  if (success === null) return flags
  if (success >= EXCEL && (avgSceneMs === null || avgSceneMs >= SKIP_MS)) flags.push('excelled')
  if (success < STRUGGLE) flags.push('struggling')
  if (avgSceneMs !== null && avgSceneMs < SKIP_MS && success < EXCEL) flags.push('skip_suspect')
  if (avgSceneMs !== null && avgSceneMs > SLOW_MS) flags.push('slow')
  return flags
}

/* session האחרון של תלמיד למטלה */
function sessionOf(studentId: string, assignmentId: string): DemoSession | undefined {
  return WORLD.sessions.find((s) => s.studentId === studentId && s.assignmentId === assignmentId)
}

/* ── GET /api/analytics/assignments ── */
export function demoAssignmentsList(now: Date) {
  const assignments = ASSIGNMENTS.map((a) => {
    const per = PROFILES.map((p) => sessionOf(p.id, a.id)).filter((s): s is DemoSession => !!s)
    const completed = per.filter((s) => s.completed)
    const rates = completed.map((s) => s.successRate!).filter((r) => r !== null)
    return {
      id: a.id, questId: `demo-q-${a.id}`, classId: DEMO_CLASS.id, classGradeLabel: DEMO_CLASS.gradeLabel,
      title: a.title, subject: a.subject, dueDate: null, createdAt: daysAgo(now, a.daysAgo, 8).toISOString(),
      students: PROFILES.length, completed: completed.length,
      completionRate: completed.length / PROFILES.length,
      avgSuccessRate: rates.length ? round2(rates.reduce((x, y) => x + y, 0) / rates.length) : null,
      own: true, homeroom: false, teacherName: null,
    }
  })
  return { assignments }
}

/* ── GET /api/analytics/assignment/:id ── */
export function demoAssignmentDashboard(assignmentId: string, now: Date) {
  const a = ASSIGNMENTS.find((x) => x.id === assignmentId)
  if (!a) return null
  const perStudent = PROFILES.map((p) => {
    const s = sessionOf(p.id, a.id)
    if (!s) return { studentId: p.id, name: p.name, status: 'not_started' as const, successRate: null, crystals: null, durationMs: null, avgSceneMs: null, flags: [] as string[] }
    if (!s.completed) return { studentId: p.id, name: p.name, status: 'in_progress' as const, successRate: null, crystals: null, durationMs: null, avgSceneMs: null, flags: [] as string[] }
    return { studentId: p.id, name: p.name, status: 'completed' as const, successRate: s.successRate, crystals: s.crystals, durationMs: s.durationMs, avgSceneMs: s.avgSceneMs, flags: flagsFor(s.successRate, s.avgSceneMs) }
  })
  const completed = perStudent.filter((s) => s.status === 'completed')
  const inProgress = perStudent.filter((s) => s.status === 'in_progress')
  const notStarted = perStudent.filter((s) => s.status === 'not_started')
  const rates = completed.map((s) => s.successRate!).filter((r) => r !== null)
  const avgSuccessRate = rates.length ? round2(rates.reduce((x, y) => x + y, 0) / rates.length) : null
  const durations = completed.map((s) => s.durationMs!).filter(Boolean)

  /* פר-אתגר: הצלחה נגזרת דטרמיניסטית מהצלחות התלמידים + מקדם קושי קבוע פר-אתגר */
  const rnd = mulberry32(hashStr(a.id))
  const perChallenge = a.challenges.map((c, ci) => {
    const hard = 0.75 + 0.45 * rnd() /* מקדם קושי קבוע (נגזר מה-seed של המטלה) */
    let solved = 0, failed = 0
    for (const s of completed) {
      const pass = (s.successRate ?? 0) * (2 - hard) > 0.5
      if (c.type === 'moralDilemma' || pass) solved++
      else failed++
    }
    const attempts = solved + failed
    return { sceneId: `demo-sc-${a.id}-${ci}`, title: c.title, type: c.type, attempts, solved, failed, successRate: attempts ? round2(solved / attempts) : null }
  }).sort((x, y) => (x.successRate ?? 2) - (y.successRate ?? 2))

  const nameOf = new Map(PROFILES.map((p) => [p.id, p.name]))
  const perObjective = (a.objectives ?? []).map((text, oi) => {
    const ornd = mulberry32(hashStr(a.id + oi))
    let solved = 0, failed = 0
    const weakStudents: { studentId: string; name: string }[] = []
    for (const s of completed) {
      const personal = clamp((s.successRate ?? 0) + (ornd() * 0.3 - 0.15), 0, 1)
      const tries = 2
      const ok = Math.round(personal * tries)
      solved += ok; failed += tries - ok
      if (personal < 0.6) weakStudents.push({ studentId: s.studentId, name: nameOf.get(s.studentId) ?? '' })
    }
    const attempts = solved + failed
    const successRate = attempts ? round2(solved / attempts) : null
    const masteryLevel = successRate === null ? null : successRate >= 0.8 ? 'strong' : successRate >= 0.6 ? 'partial' : 'weak'
    return { id: `obj_${oi + 1}`, text, attempts, successRate, masteryLevel, weakStudents }
  })

  const insights: string[] = []
  const weakObj = perObjective.filter((o) => o.masteryLevel === 'weak').sort((x, y) => (x.successRate ?? 0) - (y.successRate ?? 0))[0]
  if (weakObj) insights.push(`היעד "${weakObj.text}" טעון חיזוק (${Math.round((weakObj.successRate ?? 0) * 100)}% הצלחה) — מומלץ לחזור עליו בכיתה.`)
  const hardest = perChallenge.find((c) => c.successRate !== null && c.successRate < STRUGGLE && c.attempts >= 2)
  if (hardest) insights.push(`${hardest.failed} תלמידים התקשו באתגר "${hardest.title}" (${Math.round((hardest.successRate ?? 0) * 100)}% הצלחה) — שווה לחזור עליו בכיתה.`)
  const struggling = perStudent.filter((s) => s.flags.includes('struggling')).length
  if (struggling > 0) insights.push(`${struggling} תלמידים מתקשים בהדמיה — כדאי לבדוק איתם אישית.`)
  const skips = perStudent.filter((s) => s.flags.includes('skip_suspect')).length
  if (skips > 0) insights.push(`${skips} תלמידים סיימו מהר מאוד עם הצלחה נמוכה — ייתכן שדילגו על התוכן.`)
  if (notStarted.length > 0) insights.push(`${notStarted.length} תלמידים עוד לא התחילו את ההדמיה.`)
  if (avgSuccessRate !== null && avgSuccessRate >= EXCEL) insights.push('הכיתה שלטה בחומר — אחוז הצלחה ממוצע מצוין! 🎉')

  return {
    assignment: { id: a.id, dueDate: null },
    quest: { id: `demo-q-${a.id}`, title: a.title },
    class: { id: DEMO_CLASS.id, name: DEMO_CLASS.gradeLabel },
    totals: {
      students: PROFILES.length, completed: completed.length, inProgress: inProgress.length, notStarted: notStarted.length,
      completionRate: completed.length / PROFILES.length, avgSuccessRate,
      avgCompletionMs: durations.length ? Math.round(durations.reduce((x, y) => x + y, 0) / durations.length) : null,
      flaggedCount: perStudent.filter((s) => s.flags.some((f) => f !== 'excelled')).length,
    },
    distribution: {
      low: rates.filter((r) => r < STRUGGLE).length,
      mid: rates.filter((r) => r >= STRUGGLE && r < EXCEL).length,
      high: rates.filter((r) => r >= EXCEL).length,
    },
    perChallenge, perObjective, students: perStudent, insights,
  }
}

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

/* ── GET /api/analytics/students ── */
export function demoStudentsLens(now: Date) {
  const students = PROFILES.map((p) => {
    const mine = WORLD.sessions.filter((s) => s.studentId === p.id)
    const completed = mine.filter((s) => s.completed)
    const rates = completed.map((s) => s.successRate!).filter((r) => r !== null)
    const last = mine.reduce((a, b) => (a.daysAgo < b.daysAgo ? a : b))
    const lastLevel = WORLD.trajectories.get(p.id)!.at(-1)!.level
    const avg = rates.length ? round2(rates.reduce((x, y) => x + y, 0) / rates.length) : null
    const flags: string[] = []
    if (avg !== null) { if (avg >= EXCEL) flags.push('excelled'); else if (avg < STRUGGLE) flags.push('struggling') }
    return {
      studentId: p.id, name: p.name, className: DEMO_CLASS.gradeLabel, crossSubject: true,
      textLevel: lastLevel, sessionsCount: completed.length, avgSuccessRate: avg,
      lastActive: daysAgo(now, last.daysAgo, 11).toISOString(), flags,
    }
  }).sort((a, b) => a.name.localeCompare(b.name, 'he'))
  return { students, canCompare: true }
}

/* ── GET /api/analytics/student/:id — drill-down ── */
export function demoStudentDetail(studentId: string, now: Date) {
  const p = PROFILES.find((x) => x.id === studentId)
  if (!p) return null
  const mine = WORLD.sessions.filter((s) => s.studentId === p.id).sort((a, b) => a.daysAgo - b.daysAgo)
  const traj = WORLD.trajectories.get(p.id)!
  const lastLevel = traj.at(-1)!.level
  const completed = mine.filter((s) => s.completed)
  const recent = completed.slice(0, 12)
  const lastRates: Record<string, number> = {}
  const perType: Record<string, number> = {}
  /* רמות פר-סוג (1-10) — נגזרות דטרמיניסטית מרמת הטקסט + גיוון קבוע פר-סוג */
  const types = ['multipleChoice', 'trueFalse', 'finalQuiz', 'wordCompletion', 'sequenceOrder', 'hangman', 'tileSwap', 'wordSearch', 'memory']
  const trnd = mulberry32(hashStr(p.id))
  for (const t of types) {
    perType[t] = clamp(Math.round(lastLevel / 2 + (trnd() * 2 - 1)), 1, 10)
    lastRates[t] = round2(clamp(p.curve(1) + (trnd() * 0.2 - 0.1), 0.1, 1))
  }
  const history = mine.slice(0, 50).map((s, i) => ({
    sessionId: `demo-sess-${p.id}-${i}`, questId: s.assignmentId ? `demo-q-${s.assignmentId}` : 'demo-q-free',
    questTitle: s.title,
    startedAt: daysAgo(now, s.daysAgo, 9).toISOString(),
    completedAt: s.completed ? daysAgo(now, s.daysAgo, 9, 40).toISOString() : null,
    status: s.completed ? 'completed' : 'in_progress', successRate: s.successRate,
  }))
  const trend = [...mine].filter((s) => s.completed && s.successRate !== null).sort((a, b) => b.daysAgo - a.daysAgo)
    .map((s) => ({ date: daysAgo(now, s.daysAgo, 9, 40).toISOString(), successRate: s.successRate }))
  return {
    student: { id: p.id, name: p.name },
    profile: {
      text_level: lastLevel,
      per_puzzle_level: perType,
      last_success_rates: lastRates,
      last_avg_scene_ms: recent.length ? Math.round(recent.reduce((a, s) => a + (s.avgSceneMs ?? 0), 0) / recent.length) : null,
      sessions_count: completed.length,
      last_updated: daysAgo(now, mine[0]?.daysAgo ?? 1, 11).toISOString(),
    },
    profileVersion: 2,
    skipping: p.id === 'demo-s4' /* עידו — החשד-לדילוג הקבוע */,
    history, trend,
  }
}

/* ── GET /api/analytics/trends — סדרות לגרף ההתקדמות ──
   בדמו הדליים **מתגלגלים** (10/6 חודשים אחרונים עד החודש הנוכחי) ולא דליי
   שנת-הלימודים של הנתיב האמיתי — אחרת בספטמבר הגרף היה כמעט ריק והדרישה
   "נראה זהה בכל כניסה, לנצח" הייתה נשברת. הקליינט מרנדר את התוויות מהתגובה
   (אותו קוד), כך שהצורה זהה תמיד ורק שמות החודשים מתגלגלים. */
const HE_MONTHS = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳']

export function demoTrends(range: string, metric: string, entities: string[], now: Date) {
  const count = range === 'term' ? 6 : 10
  const buckets: { key: string; label: string }[] = []
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    buckets.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: HE_MONTHS[d.getMonth()] })
  }
  const monthsAgoOf = (key: string) => {
    const [y, m] = key.split('-').map(Number)
    return (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m)
  }
  /* ערך התלמיד "לפני k חודשים" — מהמסלול (הנקודה האחרונה שישנה מ-k חודשים) */
  const valueAt = (p: DemoProfile, k: number, m: string): number | null => {
    const traj = WORLD.trajectories.get(p.id)!
    const minDays = k * 30 /* קירוב חודשי עקבי — צורת הגרף זהה תמיד */
    const pts = traj.filter((t) => t.daysAgo >= minDays)
    const pt = pts.at(-1) ?? (k <= 0 ? traj.at(-1) : undefined)
    if (!pt) return null
    if (traj[0].daysAgo < minDays && p.id === 'demo-s8') return null /* לפני שהצטרפה */
    return m === 'text_level' ? pt.level : pt.success
  }
  type Ent = { id: string; name: string; kind: 'student' | 'class'; profiles: DemoProfile[] }
  const ents: Ent[] = []
  for (const id of entities) {
    if (id === DEMO_CLASS.id) ents.push({ id, name: 'כיתה ' + DEMO_CLASS.gradeLabel, kind: 'class', profiles: PROFILES })
    else { const p = PROFILES.find((x) => x.id === id); if (p) ents.push({ id, name: p.name, kind: 'student', profiles: [p] }) }
  }
  if (ents.length === 0) {
    /* ברירת מחדל שמדגימה סיפור: המשתפר מול המצטיינת */
    for (const p of [PROFILES[1], PROFILES[0]]) ents.push({ id: p.id, name: p.name, kind: 'student', profiles: [p] })
  }
  const series = ents.map((e) => ({
    id: e.id, name: e.name, kind: e.kind,
    points: buckets.map((b) => {
      const k = monthsAgoOf(b.key)
      if (k < 0) return null /* חודשים עתידיים בשנת הלימודים — אין נתונים עדיין */
      const vals = e.profiles.map((p) => valueAt(p, k, metric)).filter((v): v is number => v != null)
      if (!vals.length) return null
      return round2(vals.reduce((a, c) => a + c, 0) / vals.length)
    }),
  }))
  return { labels: buckets.map((b) => b.label), series }
}

/* ── רוסטר (GET /api/staff/students) + כיתות (GET /api/staff/classes) ── */
export function demoRoster(now: Date) {
  const students = PROFILES.map((p, i) => {
    const last = WORLD.sessions.filter((s) => s.studentId === p.id).reduce((a, b) => (a.daysAgo < b.daysAgo ? a : b))
    return {
      id: p.id, name: p.name, classId: DEMO_CLASS.id, class: DEMO_CLASS.gradeLabel,
      classCode: DEMO_CLASS.urlCode, secret: String(1111 * ((i % 9) + 1)).padStart(4, '0'),
      gender: p.gender, isActive: true,
      lastActive: daysAgo(now, last.daysAgo, 11).toISOString(),
    }
  }).sort((a, b) => a.name.localeCompare(b.name, 'he'))
  return { students }
}

export function demoClasses() {
  return {
    classes: [{
      id: DEMO_CLASS.id, name: DEMO_CLASS.name, slug: 'demo', urlCode: DEMO_CLASS.urlCode,
      gradeLabel: DEMO_CLASS.gradeLabel, isActive: true, studentCount: PROFILES.length,
      teachers: [{ teacherId: 'demo-t1', name: 'המורה רון', subject: null }],
    }],
  }
}

/* ── סיכום פדגוגי — טקסט קבוע (דטרמיניסטי, בלי קריאת AI) ── */
export function demoSummary(scope: string, id: string, now: Date) {
  const p = PROFILES.find((x) => x.id === id)
  const content =
    scope === 'student' && p
      ? `${p.name} — ${p.story}. בתצפית על ${p.sessions} הדמיות מהשנה האחרונה נראית מגמה עקבית עם הסיפור הזה: רמת הטקסט הנוכחית היא ${WORLD.trajectories.get(p.id)!.at(-1)!.level}/20, והכיול האוטומטי (כלל 60/80) התאים את הרמות בהדרגה. מומלץ להמשיך לעקוב אחרי הגרף בעמוד ההתקדמות ולשוחח עם התלמיד/ה על התחומים שבהם נצפתה תנודתיות. (טקסט הדגמה — בחשבון אמיתי הסיכום נכתב על ידי ד״ר הולו מהנתונים בפועל.)`
      : `כיתה ${DEMO_CLASS.gradeLabel} — תמונה כיתתית מגוונת: מצטיינים יציבים לצד תלמידים במגמת שיפור ותלמידים הזקוקים לליווי. אחוזי ההצלחה הממוצעים סביב 70% עם התקדמות עקבית ברמות הטקסט לאורך השנה. (טקסט הדגמה — בחשבון אמיתי הסיכום נכתב על ידי ד״ר הולו מהנתונים בפועל.)`
  return {
    summary: {
      id: null, scope, entity_id: id, content, edited_content: null,
      sample_size: scope === 'student' && p ? p.sessions : PROFILES.length,
      created_at: daysAgo(now, 1, 12).toISOString(), updated_at: daysAgo(now, 1, 12).toISOString(),
    },
    cached: false, notPersisted: true,
  }
}

export const DEMO_STUDENT_IDS = new Set(PROFILES.map((p) => p.id))
export const DEMO_ASSIGNMENT_IDS = new Set(ASSIGNMENTS.map((a) => a.id))
