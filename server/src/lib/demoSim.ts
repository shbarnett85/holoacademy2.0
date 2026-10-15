/* ── סימולציית תוצאות לתלמיד פיקטיבי — טהורה ודטרמיניסטית ─────────────────────
   מקבלת תלמיד + הדמיה ומחזירה בדיוק את הצורה ש-POST /sessions/:id/complete
   מקבל מהקליינט האמיתי (challenges / sceneTimes / summary). שדות-הבחירה ב-`extra`
   (התשובה שנבחרה) אינם נכתבים ל-events — הזרימה האמיתית לא כותבת אותם; הם יחזרו בשלב 1B
   לטבלת answers עם is_synthetic=true, באותה סכמה כמו נתונים אמיתיים.
   אין כאן DB ואין Date.now: הזמן והכתיבה
   בשכבת השירות. ה-seed נגזר ממזהה התלמיד + ההדמיה, כך שהתוצאה זהה בכל הרצה. */

export type Tier = 'strong' | 'good' | 'medium' | 'struggling' | 'inconsistent' | 'partial'

/* חלוקה לכיתה של 12: 2 חזקים, 3 טובים, 3 בינוניים, 2 מתקשים, 1 לא-עקבי, 1 חלקי */
export const CLASS_TIERS: Tier[] = [
  'strong', 'strong', 'good', 'good', 'good', 'medium', 'medium', 'medium',
  'struggling', 'struggling', 'inconsistent', 'partial',
]
export const tierForIndex = (i: number): Tier => CLASS_TIERS[((i % 12) + 12) % 12]

/* טווח אחוז-הצלחה כולל לכל פרופיל (partial — על ההדמיות שסיים) */
export const TIER_BAND: Record<Tier, [number, number]> = {
  strong: [0.85, 1.0],
  good: [0.7, 0.85],
  medium: [0.55, 0.7],
  struggling: [0.3, 0.55],
  inconsistent: [0.45, 0.65],
  partial: [0.6, 0.85],
}

/* שמות בדויים בעליל — שם פרטי + "דמו" */
const FIRST_NAMES = [
  'נועה', 'איתי', 'מאיה', 'יואב', 'תמר', 'אורי', 'שירה', 'עידו', 'לילך', 'רועי', 'מיכל', 'גיא',
  'הילה', 'ניר', 'ענת', 'אלון', 'רותם', 'דור', 'ליאור', 'עומר', 'שקד', 'אדם', 'יעל', 'טל',
]
export function fakeStudentName(n: number): string {
  const i = ((n % FIRST_NAMES.length) + FIRST_NAMES.length) % FIRST_NAMES.length
  const round = Math.floor(n / FIRST_NAMES.length)
  return `${FIRST_NAMES[i]} דמו${round > 0 ? ' ' + (round + 1) : ''}`
}

/* ── PRNG דטרמיניסטי ── */
export function hashStr(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
  return h >>> 0
}
export function rng(seed: string): () => number {
  let a = hashStr(seed) || 1
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ── חילוץ אתגרים מ-game_data ── */
interface Choice { id: string; text: string; isCorrect: boolean }
interface QuizQ { question: string; options: string[]; correctIndex: number }
export interface PuzzleInfo {
  sceneId: string
  type: string
  difficulty: number
  choices?: Choice[]
  questions?: QuizQ[]
}
interface SceneLike { id: string; puzzle?: { type?: string; difficulty?: number; choices?: Choice[]; questions?: QuizQ[] } }

export function extractPuzzles(gameData: unknown): { puzzles: PuzzleInfo[]; sceneIds: string[] } {
  const scenes = ((gameData as { scenes?: SceneLike[] } | null)?.scenes ?? []) as SceneLike[]
  const puzzles: PuzzleInfo[] = []
  for (const s of scenes) {
    if (!s.puzzle) continue
    puzzles.push({
      sceneId: s.id,
      type: s.puzzle.type ?? 'multipleChoice',
      difficulty: typeof s.puzzle.difficulty === 'number' ? s.puzzle.difficulty : 5,
      choices: s.puzzle.choices,
      questions: s.puzzle.questions,
    })
  }
  return { puzzles, sceneIds: scenes.map((s) => s.id) }
}

/* ── תוצאה של סשן אחד ── */
export interface SimChallenge {
  sceneId: string
  puzzleType: string
  difficulty: number
  correct: boolean
  attempts: number
  solveTimeMs: number
  shards: number
  /* שדות נוספים (additive ב-payload): מה נבחר בפועל — בסיס לאבחון סוג-טעות */
  extra: Record<string, unknown>
}
export interface SimSession {
  status: 'completed' | 'in_progress' | 'not_started'
  challenges: SimChallenge[]
  sceneTimes: { sceneId: string; dwellMs: number }[]
  summary: {
    totalChallenges: number; correctChallenges: number; successRate: number; avgSceneMs: number
    scenesVisited: number; crystalsEarned: number; completed: boolean; durationMs: number
  } | null
  dayOffset: number /* כמה ימים אחורה (0 = היום) — פיזור על פני ~10 ימים */
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/* כמה חלש הסוג עבור התלמיד (0..1) — מקור ל"נושאים חלשים" ול"לא עקבי" */
function typeWeakness(studentId: string, type: string, tier: Tier): number {
  const r = rng(`weak:${studentId}:${type}`)()
  if (tier === 'inconsistent') return r < 0.5 ? 0.05 : 0.95 /* חזק מאוד בחלק, חלש מאוד באחרים */
  if (tier === 'medium') return r < 0.35 ? 0.9 : 0.15 /* כמה נושאים חלשים */
  if (tier === 'struggling') return 0.5 + r * 0.4
  return r * 0.3
}

export function simulateSession(opts: {
  studentId: string
  questId: string
  tier: Tier
  gameData: unknown
  questIndex: number /* מיקום ההדמיה ברשימת המורה — לקביעת חלקי/לא-התחיל */
}): SimSession {
  const { studentId, questId, tier, gameData, questIndex } = opts
  const { puzzles, sceneIds } = extractPuzzles(gameData)
  const r = rng(`sim:${studentId}:${questId}`)
  const dayOffset = Math.floor(r() * 10)

  /* "חלקי": מסיים הדמיות באינדקס זוגי; אחת מהאחרות באמצע; השאר לא התחיל */
  if (tier === 'partial') {
    if (questIndex % 2 === 1) {
      const inProgress = questIndex % 4 === 1
      return { status: inProgress ? 'in_progress' : 'not_started', challenges: [], sceneTimes: [], summary: null, dayOffset }
    }
  }
  if (puzzles.length === 0) return { status: 'not_started', challenges: [], sceneTimes: [], summary: null, dayOffset }

  const [lo, hi] = TIER_BAND[tier]
  const target = lo + (hi - lo) * r()
  const n = puzzles.length

  /* אילו אתגרים נכשלים: דירוג לפי "נטייה לכישלון" (חולשת סוג + רעש דטרמיניסטי) */
  const propensity = puzzles.map((p, i) => ({ i, v: typeWeakness(studentId, p.type, tier) + r() * 0.35 }))
  let correctCount: number
  if (tier === 'inconsistent') {
    /* הכמות נגזרת מחולשת-הסוגים עצמה — חזק בסוגים אחדים וחלש באחרים */
    correctCount = propensity.filter((x) => typeWeakness(studentId, puzzles[x.i].type, tier) < 0.5).length
    correctCount = clamp(correctCount, Math.max(1, Math.round(n * 0.3)), Math.max(1, Math.round(n * 0.8)))
  } else {
    /* ספירה שנופלת בתוך הטווח של הפרופיל (עיגול נאיבי בהדמיות קצרות הוציא "חזק" מתחת ל-85%) */
    const inBand: number[] = []
    for (let k = 0; k <= n; k++) if (k / n >= lo - 1e-9 && k / n <= hi + 1e-9) inBand.push(k)
    const want = target * n
    correctCount = inBand.length
      ? inBand.reduce((best, k) => (Math.abs(k - want) < Math.abs(best - want) ? k : best), inBand[0])
      : clamp(Math.ceil(lo * n), 0, n)
  }
  const failSet = new Set(propensity.sort((a, b) => b.v - a.v).slice(0, n - correctCount).map((x) => x.i))

  const tierMs = { strong: 0.7, good: 0.9, medium: 1.1, struggling: 1.7, inconsistent: 1.2, partial: 1.0 }[tier]
  /* התאמה אישית: חזק — מתקדם (+2), מתקשה — קל (−2) */
  const diffShift = { strong: 2, good: 1, medium: 0, struggling: -2, inconsistent: 0, partial: 0 }[tier]

  const challenges: SimChallenge[] = puzzles.map((p, i) => {
    const correct = !failSet.has(i)
    const difficulty = clamp(Math.round(p.difficulty + diffShift), 1, 10)
    const attempts = correct
      ? (tier === 'struggling' ? 1 + Math.floor(r() * 2) : tier === 'medium' && r() < 0.3 ? 2 : 1)
      : (tier === 'struggling' ? 2 + Math.floor(r() * 2) : 1 + Math.floor(r() * 2))
    const solveTimeMs = Math.round((9000 + r() * 16000) * tierMs * (correct ? 1 : 1.25))
    const extra: Record<string, unknown> = {}

    if ((p.type === 'multipleChoice' || p.type === 'trueFalse') && p.choices && p.choices.length >= 2) {
      const right = p.choices.find((c) => c.isCorrect) ?? p.choices[0]
      const wrongs = p.choices.filter((c) => c.id !== right.id)
      if (correct || wrongs.length === 0) {
        extra.selectedChoiceId = right.id
        extra.selectedText = right.text
      } else {
        /* מסיח פופולרי אחד לכל שאלה (נגזר מההדמיה+סצנה) — מתקשים נוטים אליו בעקביות */
        const popular = wrongs[hashStr(`${questId}:${p.sceneId}`) % wrongs.length]
        const stickiness = tier === 'struggling' ? 0.8 : tier === 'inconsistent' ? 0.6 : 0.5
        const pick = r() < stickiness ? popular : wrongs[Math.floor(r() * wrongs.length)]
        extra.selectedChoiceId = pick.id
        extra.selectedText = pick.text
        extra.isPopularDistractor = pick.id === popular.id
      }
      extra.correctChoiceId = right.id
    } else if (p.type === 'finalQuiz' && p.questions && p.questions.length > 0) {
      const answers = p.questions.map((q, qi) => {
        const qCorrect = correct ? r() < 0.9 : r() < 0.3
        if (qCorrect || q.options.length < 2) return { q: qi, selectedIndex: q.correctIndex, correct: true }
        const wrongs = q.options.map((_, idx) => idx).filter((idx) => idx !== q.correctIndex)
        const popular = wrongs[hashStr(`${questId}:${p.sceneId}:${qi}`) % wrongs.length]
        const idx = r() < (tier === 'struggling' ? 0.75 : 0.5) ? popular : wrongs[Math.floor(r() * wrongs.length)]
        return { q: qi, selectedIndex: idx, correct: false }
      })
      extra.answers = answers
      extra.quizScore = answers.filter((a) => a.correct).length / answers.length
    } else {
      /* סוגי משחק (זיכרון/תפזורת/…): מספר טעויות במקום בחירה */
      extra.mistakes = correct ? Math.floor(r() * (tier === 'struggling' ? 3 : 2)) : 2 + Math.floor(r() * 4)
    }
    return { sceneId: p.sceneId, puzzleType: p.type, difficulty, correct, attempts, solveTimeMs, shards: correct ? 1 : 0, extra }
  })

  const avgSceneMs = Math.round((11000 + r() * 6000) * tierMs)
  const sceneTimes = sceneIds.map((sceneId) => ({ sceneId, dwellMs: Math.round(avgSceneMs * (0.7 + r() * 0.6)) }))
  const correctN = challenges.filter((c) => c.correct).length
  const successRate = Math.round((correctN / challenges.length) * 100) / 100
  const durationMs = sceneTimes.reduce((a, s) => a + s.dwellMs, 0) + challenges.reduce((a, c) => a + c.solveTimeMs, 0)

  return {
    status: 'completed',
    challenges,
    sceneTimes,
    summary: {
      totalChallenges: challenges.length,
      correctChallenges: correctN,
      successRate,
      avgSceneMs,
      scenesVisited: sceneIds.length,
      crystalsEarned: Math.round(successRate * 5),
      completed: true,
      durationMs,
    },
    dayOffset,
  }
}
