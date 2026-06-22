/* ──────────────────────────────────────────────────────────────────────────
   מודל כיול הקושי של HoloAcademy — ערך אחד פשוט.

   פר-סוג-אתגר: כלל 60/80 על נתוני הסשן שהסתיים.
   - הצלחה <60% → הורד רמה ב-1.
   - הצלחה >80% → העלה רמה ב-1.
   - 60-80% → ללא שינוי.
   - אין נתונים לסוג → ללא שינוי.

   המורה והאוטומט כותבים לאותו ערך. אין דגלים, אין גייטינג, אין חלון מתגלגל.
   ────────────────────────────────────────────────────────────────────────── */

export const PROFILE_PUZZLE_TYPES = [
  'multipleChoice', 'trueFalse', 'finalQuiz', 'wordCompletion',
  'sequenceOrder', 'hangman', 'tileSwap', 'wordSearch', 'memory',
] as const
export type ProfilePuzzleType = (typeof PROFILE_PUZZLE_TYPES)[number]

export const CALIBRATION = {
  LOW: 0.6,
  HIGH: 0.8,
  TEXT_MIN: 1, TEXT_MAX: 16,
  PUZZLE_MIN: 1, PUZZLE_MAX: 10,
  SKIP_MS_PER_SCENE: 3000,
  SLOW_MS_PER_SCENE: 45000,
} as const

export interface DifficultyProfile {
  textLevel: number
  perPuzzleLevel: Record<ProfilePuzzleType, number>
}

export interface PuzzleStat { solved: number; total: number }

export interface CalibrationInput {
  perType: Partial<Record<ProfilePuzzleType, PuzzleStat>>
  avgSceneMs: number
}

export interface CalibrationResult {
  profile: DifficultyProfile
  skipping: boolean
  readingAdjust: 'slow' | 'skip' | 'none'
}

/* ── עזרים ── */

function clampPuzzle(n: number): number {
  return Math.max(CALIBRATION.PUZZLE_MIN, Math.min(CALIBRATION.PUZZLE_MAX, Math.round(n)))
}
function clampText(n: number): number {
  return Math.max(CALIBRATION.TEXT_MIN, Math.min(CALIBRATION.TEXT_MAX, Math.round(n)))
}

function step(level: number, rate: number): number {
  if (rate < CALIBRATION.LOW) return level - 1
  if (rate > CALIBRATION.HIGH) return level + 1
  return level
}

function normalizeType(type: string): ProfilePuzzleType | null {
  const t = type === 'slidingPuzzle' ? 'tileSwap' : type
  return (PROFILE_PUZZLE_TYPES as readonly string[]).includes(t) ? (t as ProfilePuzzleType) : null
}

/* ── API ציבורי ── */

/* מיזוג פרופיל קודם חלקי עם ברירת מחדל */
export function normalizeProfile(
  prev: Partial<DifficultyProfile> | null,
  fallback: DifficultyProfile,
): DifficultyProfile {
  const perPuzzleLevel = { ...fallback.perPuzzleLevel }
  if (prev?.perPuzzleLevel) {
    for (const t of PROFILE_PUZZLE_TYPES) {
      const v = prev.perPuzzleLevel[t]
      if (typeof v === 'number' && Number.isFinite(v)) perPuzzleLevel[t] = clampPuzzle(v)
    }
  }
  const textLevel =
    typeof prev?.textLevel === 'number' && Number.isFinite(prev.textLevel)
      ? clampText(prev.textLevel)
      : fallback.textLevel
  return { textLevel, perPuzzleLevel }
}

/* הכיול — כלל 60/80 על נתוני הסשן הנוכחי בלבד */
export function calibrate(
  prev: DifficultyProfile,
  input: CalibrationInput,
): CalibrationResult {
  const perPuzzleLevel = { ...prev.perPuzzleLevel }

  /* כלל 60/80 פר-סוג לפי הסשן הנוכחי */
  for (const type of PROFILE_PUZZLE_TYPES) {
    const s = input.perType[type]
    if (!s || s.total === 0) continue
    perPuzzleLevel[type] = clampPuzzle(step(perPuzzleLevel[type], s.solved / s.total))
  }

  /* text_level — MC + finalQuiz של הסשן */
  let textLevel = prev.textLevel
  let skipping = false
  let readingAdjust: CalibrationResult['readingAdjust'] = 'none'

  const mc = input.perType.multipleChoice
  const fq = input.perType.finalQuiz
  const contentSolved = (mc?.solved ?? 0) + (fq?.solved ?? 0)
  const contentTotal = (mc?.total ?? 0) + (fq?.total ?? 0)
  if (contentTotal > 0) {
    textLevel = step(textLevel, contentSolved / contentTotal)
  }

  if (input.avgSceneMs > 0) {
    if (input.avgSceneMs > CALIBRATION.SLOW_MS_PER_SCENE) {
      textLevel -= 1
      readingAdjust = 'slow'
    } else if (input.avgSceneMs < CALIBRATION.SKIP_MS_PER_SCENE) {
      skipping = true
      readingAdjust = 'skip'
    }
  }

  return { profile: { textLevel: clampText(textLevel), perPuzzleLevel }, skipping, readingAdjust }
}

/* ── ברירת מחדל לתלמיד בלי פרופיל ── */

export function gradeNumberFromLabel(label?: string | null): number | null {
  if (!label) return null
  const cleaned = label.replace(/['"`׳״]/g, '').replace(/כיתה/g, '').trim()
  const m = cleaned.match(/[א-ת]{1,2}/)
  if (!m) return null
  const tok = m[0]
  if (tok.startsWith('יא')) return 11
  if (tok.startsWith('יב')) return 12
  const map: Record<string, number> = { א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9, י: 10 }
  return map[tok[0]] ?? null
}

export function defaultProfileForGrade(label?: string | null): DifficultyProfile {
  const grade = gradeNumberFromLabel(label) ?? 5
  const textLevel = clampText(grade)
  const puzzleBase = clampPuzzle(2 + grade * 0.5)
  const perPuzzleLevel = Object.fromEntries(
    PROFILE_PUZZLE_TYPES.map((t) => [t, puzzleBase]),
  ) as Record<ProfilePuzzleType, number>
  return { textLevel, perPuzzleLevel }
}

/* עזר לשרת: בונה perType מרשומות האתגרים של ה-session */
export function perTypeFromChallenges(
  challenges: { puzzleType: string; correct: boolean }[],
): Partial<Record<ProfilePuzzleType, PuzzleStat>> {
  const out: Partial<Record<ProfilePuzzleType, PuzzleStat>> = {}
  for (const c of challenges) {
    const t = normalizeType(c.puzzleType)
    if (!t) continue
    const s = out[t] ?? { solved: 0, total: 0 }
    s.total += 1
    if (c.correct) s.solved += 1
    out[t] = s
  }
  return out
}
