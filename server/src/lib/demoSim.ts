/* ── סימולציית תוצאות לתלמיד פיקטיבי — טהורה ודטרמיניסטית ─────────────────────
   מקבלת תלמיד + הדמיה ומחזירה בדיוק את הצורה ש-POST /sessions/:id/complete
   מקבל מהקליינט האמיתי (challenges / sceneTimes / summary). שדות-הבחירה ב-`extra`
   (התשובה שנבחרה) אינם נכתבים ל-events — הזרימה האמיתית לא כותבת אותם; הם יחזרו בשלב 1B
   לטבלת answers עם is_synthetic=true, באותה סכמה כמו נתונים אמיתיים.
   אין כאן DB ואין Date.now: הזמן והכתיבה
   בשכבת השירות. ה-seed נגזר ממזהה התלמיד + ההדמיה, כך שהתוצאה זהה בכל הרצה. */

import {
  createPuzzleTelemetry, buildPresentation, presentChoices, presentQuizQuestion, quizOptionId, slideWordCount,
  type AnswerRecord, type MoralChoiceRecord, type PuzzleTelemetry,
} from '../../../src/shared/lib/answerTelemetry.js'

export type Tier = 'strong' | 'good' | 'medium' | 'struggling' | 'inconsistent' | 'partial'

/* דפוסי התנהגות לבדיקת מנוע הדפוסים (שלב 5). לא נשמרים בשום מקום — רק מעצבים את הנתונים:
   · position_bias — בוחר שוב ושוב את המיקום הראשון בבחירה מרובה (בלי קשר לתוכן)
   · random_memory — משחק זיכרון באקראי: היפוכים מהירים, בלי למידה מהפיכות קודמות
   · skipper       — מדלג על קריאה: זמן שהייה זעיר מול מספר מילים גבוה, תשובות מהירות
   · improver      — משתפר לאורך זמן (ההצלחה עולה עם התקדמות ההדמיות בציר הזמן) */
export type Behavior = 'position_bias' | 'random_memory' | 'skipper' | 'improver'

/* חלוקה לכיתה של 12: 2 חזקים, 3 טובים, 3 בינוניים, 2 מתקשים, 1 לא-עקבי, 1 חלקי */
export const CLASS_TIERS: Tier[] = [
  'strong', 'strong', 'good', 'good', 'good', 'medium', 'medium', 'medium',
  'struggling', 'struggling', 'inconsistent', 'partial',
]
export const tierForIndex = (i: number): Tier => CLASS_TIERS[((i % 12) + 12) % 12]

/* אינדקס-בכיתה → דפוס התנהגות. 5=בינוני משתפר, 6=בינוני עם הטיית מיקום, 7=בינוני משחק זיכרון באקראי, 9=מתקשה שמדלג */
export const CLASS_BEHAVIORS: Record<number, Behavior> = { 5: 'improver', 6: 'position_bias', 7: 'random_memory', 9: 'skipper' }
export const behaviorForIndex = (i: number): Behavior | undefined => CLASS_BEHAVIORS[((i % 12) + 12) % 12]

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
  /* מטא לייצור אינטראקציה בסכמה האמיתית */
  pairs?: { a: string; b: string }[]
  items?: { id: string; text: string }[]
  correctOrder?: string[]
  wordBank?: string[]
  words?: string[]
  answers?: string[]
  answer?: string
  gridSize?: number
  moralCount?: number
}
interface SceneLike {
  id: string
  narrative?: string
  drHoloDialog?: string
  puzzle?: {
    type?: string; difficulty?: number; choices?: Choice[]; questions?: QuizQ[]
    pairs?: { a: string; b: string }[]; items?: { id: string; text: string }[]; correctOrder?: string[]
    wordBank?: string[]; words?: string[]; answers?: string[]; answer?: string; gridSize?: number; moralChoices?: unknown[]
  }
}

export function extractPuzzles(gameData: unknown): { puzzles: PuzzleInfo[]; sceneIds: string[]; sceneWords: Record<string, number> } {
  const scenes = ((gameData as { scenes?: SceneLike[] } | null)?.scenes ?? []) as SceneLike[]
  const puzzles: PuzzleInfo[] = []
  const sceneWords: Record<string, number> = {}
  for (const s of scenes) {
    sceneWords[s.id] = slideWordCount(s)
    if (!s.puzzle) continue
    puzzles.push({
      sceneId: s.id,
      type: s.puzzle.type ?? 'multipleChoice',
      difficulty: typeof s.puzzle.difficulty === 'number' ? s.puzzle.difficulty : 5,
      choices: s.puzzle.choices,
      questions: s.puzzle.questions,
      pairs: s.puzzle.pairs, items: s.puzzle.items, correctOrder: s.puzzle.correctOrder,
      wordBank: s.puzzle.wordBank, words: s.puzzle.words, answers: s.puzzle.answers, answer: s.puzzle.answer,
      gridSize: s.puzzle.gridSize, moralCount: s.puzzle.moralChoices?.length,
    })
  }
  return { puzzles, sceneIds: scenes.map((s) => s.id), sceneWords }
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
  /* wordCount / closedDwellMs — כמו בזרימה האמיתית (שלב 1B) */
  sceneTimes: { sceneId: string; dwellMs: number; wordCount: number; closedDwellMs: number }[]
  /* שורות answers (אותה סכמה כמו אמיתיות; ייכתבו עם is_synthetic=true) ובחירות מוסר */
  answers: AnswerRecord[]
  moral: MoralChoiceRecord[]
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
  behavior?: Behavior
  /* 0..1 — מיקום ההדמיה בציר הזמן של התלמיד (לדפוס "משתפר") */
  progress?: number
}): SimSession {
  const { studentId, questId, tier, gameData, questIndex, behavior, progress } = opts
  const { puzzles, sceneIds, sceneWords } = extractPuzzles(gameData)
  const r = rng(`sim:${studentId}:${questId}`)
  const dayOffset = Math.floor(r() * 10)

  /* "חלקי": מסיים הדמיות באינדקס זוגי; אחת מהאחרות באמצע; השאר לא התחיל */
  if (tier === 'partial') {
    if (questIndex % 2 === 1) {
      const inProgress = questIndex % 4 === 1
      return { status: inProgress ? 'in_progress' : 'not_started', challenges: [], sceneTimes: [], answers: [], moral: [], summary: null, dayOffset }
    }
  }
  if (puzzles.length === 0) return { status: 'not_started', challenges: [], sceneTimes: [], answers: [], moral: [], summary: null, dayOffset }

  /* "משתפר": הטווח עולה לאורך ציר הזמן (0.35→0.95). שאר ההתנהגויות לא משנות את רמת ההצלחה. */
  const [lo, hi]: [number, number] = behavior === 'improver' && progress !== undefined
    ? [clamp(0.35 + 0.6 * progress - 0.05, 0, 1), clamp(0.35 + 0.6 * progress + 0.05, 0, 1)]
    : TIER_BAND[tier]
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

  const avgSceneMs0 = Math.round((11000 + r() * 6000) * tierMs)
  /* "מדלג": שהייה זעירה בכל סצנה → דגל skipping אמיתי (avgSceneMs < 3000) */
  const avgSceneMs = behavior === 'skipper' ? Math.round(1500 + (avgSceneMs0 % 900)) : avgSceneMs0
  const ar = rng(`ans:${studentId}:${questId}`) /* זרם נפרד — לא מזיז את התוצאות ההיסטוריות */
  const sceneTimes = sceneIds.map((sceneId) => {
    const dwellMs = Math.round(avgSceneMs * (0.7 + r() * 0.6))
    const words = sceneWords[sceneId] ?? 0
    /* שהייה סגורה: קרוב לשהייה ההיסטורית; מדלג — קצר בהרבה ממה שנדרש לקריאת הטקסט */
    const closedDwellMs = behavior === 'skipper'
      ? Math.min(dwellMs, Math.round(words * (40 + ar() * 40)) + 300)
      : Math.round(dwellMs * (0.92 + ar() * 0.06))
    return { sceneId, dwellMs, wordCount: words, closedDwellMs }
  })
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
    ...buildAnswers({ studentId, questId, puzzles, challenges, behavior }),
  }
}

/* ── ייצור שורות answers מדומות באותה סכמה בדיוק ──────────────────────────────────
   משתמש ב-createPuzzleTelemetry/buildPresentation של הקליינט עם שעון וירטואלי דטרמיניסטי —
   כך אין "סכמת דמו" נפרדת: מה שנכתב כאן זהה לשורה שתלמיד אמיתי היה מייצר. */
function buildAnswers(args: {
  studentId: string; questId: string; puzzles: PuzzleInfo[]; challenges: SimChallenge[]; behavior?: Behavior
}): { answers: AnswerRecord[]; moral: MoralChoiceRecord[] } {
  const { studentId, questId, puzzles, challenges, behavior } = args
  const r = rng(`ansrows:${studentId}:${questId}`)
  const ri = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1))
  const answers: AnswerRecord[] = []
  const moral: MoralChoiceRecord[] = []

  puzzles.forEach((p, idx) => {
    const c = challenges[idx]
    if (!c) return
    let clock = 0
    const tel: PuzzleTelemetry = createPuzzleTelemetry(() => clock)
    tel.markReady()
    const step = (ms: number) => { clock += ms }
    const fast = behavior === 'skipper'
    const baseThink = fast ? ri(500, 1400) : Math.max(1200, c.solveTimeMs - 1400)
    let seq = 1

    /* הצגה שנסגרה בלי תשובה (פתח וסגר) — ~7% מהאתגרים, לא-מדלגים */
    if (!fast && r() < 0.07) {
      const closedTel = createPuzzleTelemetry(() => clock)
      closedTel.markReady()
      step(ri(1500, 6000))
      closedTel.act('closed')
      const rec = buildPresentation(closedTel, { sceneId: p.sceneId, puzzleType: p.type, seq, result: null, puzzle: {} })
      answers.push(...rec.answers)
      seq++
      clock = 0
      tel.state.readyAt = 0
    }

    const type = p.type
    const choices = p.choices
    let puzzleMeta: Parameters<typeof buildPresentation>[1]['puzzle'] = {}

    if ((type === 'multipleChoice' || type === 'trueFalse') && choices && choices.length >= 2) {
      const presented = presentChoices(choices, { fixed: type === 'trueFalse', rand: r })
      tel.setDisplay(presented.displayedOrder, presented.correctPosition)
      step(baseThink)
      let selectedId = String(c.extra.selectedChoiceId ?? presented.choices[0].id)
      /* הטיית מיקום: בטעות — תמיד המיקום הראשון (או השני אם הראשון הוא התשובה הנכונה) */
      if (behavior === 'position_bias' && !c.correct && type === 'multipleChoice') {
        const first = presented.choices[0]
        selectedId = first.isCorrect ? presented.choices[1].id : first.id
      }
      tel.act('select', { optionId: selectedId, position: presented.choices.findIndex((x) => x.id === selectedId) })
      puzzleMeta = { choices }
    } else if (type === 'finalQuiz' && p.questions) {
      const items = (c.extra.answers as { q: number; selectedIndex: number }[] | undefined) ?? []
      p.questions.forEach((q, qi) => {
        const pq = presentQuizQuestion(q, r)
        const origSel = items[qi]?.selectedIndex ?? q.correctIndex
        const pos = Math.max(0, pq.order.indexOf(origSel))
        const think = fast ? ri(400, 1100) : ri(4000, 14000)
        const shownAt = clock
        clock += think
        tel.quizItem({
          itemIndex: qi, selectedOptionId: quizOptionId(origSel), selectedPosition: pos, correctPosition: pq.correctIndex,
          displayedOrder: pq.order.map(quizOptionId), isCorrect: pos === pq.correctIndex, shownAt, answeredAt: clock,
        })
      })
      puzzleMeta = { questions: p.questions }
    } else if (type === 'sequenceOrder' && p.items && p.items.length >= 2) {
      const ids = p.items.map((i) => i.id)
      const correctOrder = p.correctOrder ?? ids
      const shuffle = () => { const a = [...ids]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }
      tel.setDisplay(shuffle(), -1)
      const attempts = Math.max(1, c.attempts)
      for (let a = 1; a <= attempts; a++) {
        step(fast ? ri(600, 1500) : ri(7000, 16000))
        const last = a === attempts
        const ok = last && c.correct
        tel.act('submit', { order: ok ? [...correctOrder] : shuffle(), correct: ok })
      }
      puzzleMeta = { items: p.items, correctOrder }
    } else if (type === 'tileSwap' || type === 'slidingPuzzle') {
      const n = Math.max(2, Math.min(5, p.gridSize ?? 3))
      const bad = Number(c.extra.mistakes ?? 0)
      const good = c.correct ? Math.max(2, Math.floor(n * n * 0.7)) : Math.max(1, Math.floor(n * n * 0.3))
      const seqSw: boolean[] = [...Array(good).fill(false), ...Array(bad).fill(true)]
      for (let i = seqSw.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [seqSw[i], seqSw[j]] = [seqSw[j], seqSw[i]] }
      for (const isBad of seqSw) {
        step(fast ? ri(300, 700) : ri(1500, 3500))
        const from = ri(0, n * n - 1)
        let to = ri(0, n * n - 1)
        if (to === from) to = (to + 1) % (n * n)
        tel.act('swap', { from, to, tiles: [from, to], bad: isBad })
      }
      if (!c.correct && r() < 0.5) { step(ri(800, 2500)); tel.act('gave_up') }
    } else if (type === 'memory' && p.pairs && p.pairs.length >= 2) {
      const n = p.pairs.length
      const randomPlayer = behavior === 'random_memory'
      const mistakes = randomPlayer ? Math.max(n * 3, Number(c.extra.mistakes ?? 0)) : Number(c.extra.mistakes ?? 0)
      const dt = () => (randomPlayer ? ri(220, 520) : ri(900, 1900))
      const flipPair = (a: number, b: number, match: boolean) => {
        step(dt()); tel.act('flip', { card: a, pair: Math.floor(a / 2) })
        step(dt()); tel.act('flip', { card: b, pair: Math.floor(b / 2) })
        tel.act('pair', { a, b, match })
      }
      const solvedPairs = c.correct ? n : Math.max(1, Math.floor(n / 2))
      let doneMistakes = 0
      for (let k = 0; k < solvedPairs; k++) {
        const stepsBad = randomPlayer ? Math.ceil(mistakes / solvedPairs) : (k % 2 === 0 && doneMistakes < mistakes ? 1 : 0)
        for (let m = 0; m < stepsBad && doneMistakes < mistakes; m++) {
          const a = ri(0, 2 * n - 1)
          let b = ri(0, 2 * n - 1)
          if (Math.floor(a / 2) === Math.floor(b / 2)) b = (b + 2) % (2 * n)
          flipPair(a, b, false)
          doneMistakes++
        }
        flipPair(2 * k, 2 * k + 1, true)
      }
      while (doneMistakes < mistakes) {
        const a = ri(0, 2 * n - 1)
        let b = ri(0, 2 * n - 1)
        if (Math.floor(a / 2) === Math.floor(b / 2)) b = (b + 2) % (2 * n)
        flipPair(a, b, false)
        doneMistakes++
      }
      if (!c.correct && r() < 0.5) { step(ri(600, 2000)); tel.act('gave_up') }
    } else if (type === 'wordCompletion') {
      const answersList = p.answers && p.answers.length ? p.answers : p.answer ? [p.answer] : ['']
      const bank = p.wordBank ?? []
      const attempts = Math.max(1, c.attempts)
      for (let a = 1; a <= attempts; a++) {
        step(fast ? ri(500, 1200) : ri(3000, 9000))
        const ok = a === attempts && c.correct
        const wrongWord = bank.find((w) => !answersList.includes(w)) ?? 'לא'
        tel.act('attempt', { value: ok ? answersList[0] : wrongWord, blank: 0, correct: ok })
      }
    } else if (type === 'wordSearch') {
      const words = (p.words ?? []).slice(0, 12)
      const foundN = c.correct ? words.length : Math.floor(words.length / 2)
      for (let i = 0; i < foundN; i++) { step(fast ? ri(800, 2000) : ri(6000, 18000)); tel.act('word_found', { word: words[i] }) }
      if (!c.correct) { step(ri(5000, 20000)); tel.act(r() < 0.5 ? 'timeout' : 'gave_up') }
    } else if (type === 'hangman') {
      const letters = [...new Set((p.answer ?? 'מילה').replace(/[^א-ת]/g, '').split(''))]
      const wrongLetters = ['ש', 'ק', 'ז', 'ץ', 'ס', 'ט', 'ע', 'פ'].filter((l) => !letters.includes(l))
      const wrongN = Math.min(wrongLetters.length, Number(c.extra.mistakes ?? 0))
      const seqL: { letter: string; correct: boolean }[] = [
        ...letters.slice(0, c.correct ? letters.length : Math.max(1, letters.length - 2)).map((l) => ({ letter: l, correct: true })),
        ...wrongLetters.slice(0, wrongN).map((l) => ({ letter: l, correct: false })),
      ]
      for (let i = seqL.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [seqL[i], seqL[j]] = [seqL[j], seqL[i]] }
      for (const l of seqL) { step(fast ? ri(300, 800) : ri(1500, 4500)); tel.act('letter', l) }
    } else if (type === 'moralDilemma') {
      step(fast ? ri(500, 1500) : ri(5000, 15000))
      tel.act('moral_choice', { index: ri(0, Math.max(1, (p.moralCount ?? 2)) - 1) })
    } else {
      step(baseThink)
    }

    const rec = buildPresentation(tel, {
      sceneId: p.sceneId, puzzleType: type, seq, result: { correct: c.correct, score: c.shards }, puzzle: puzzleMeta,
    })
    answers.push(...rec.answers)
    if (rec.moral) moral.push(rec.moral)
  })
  return { answers, moral }
}
