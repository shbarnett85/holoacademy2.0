/* ──────────────────────────────────────────────────────────────────────────
   מודל כיול והתאמת הקושי של HoloAcademy — עמיד למדגם קטן.

   פר-סוג-אתגר: אקומולטור מתגלגל (rolling window K) חוצה-סשנים.
   - מתחת ל-MIN_SAMPLE אינסטנסים → אין שינוי (גייטינג).
   - [MIN_SAMPLE, FULL_SAMPLE) → סף הפעלה מחמיר (0.5/0.9) — נדרשת עדות חזקה.
   - ≥ FULL_SAMPLE → סף רגיל (60/80).
   - החלון המתגלגל מבטיח שהמודל עוקב אחרי ביצועים *אחרונים*, לא לכל החיים.

   text_level: עדיין נשען על MC+finalQuiz פר-session (תדירות גבוהה, יציב).
   ────────────────────────────────────────────────────────────────────────── */

export const PROFILE_PUZZLE_TYPES = [
  'multipleChoice', 'trueFalse', 'finalQuiz', 'wordCompletion',
  'sequenceOrder', 'hangman', 'tileSwap', 'wordSearch', 'memory',
] as const
export type ProfilePuzzleType = (typeof PROFILE_PUZZLE_TYPES)[number]

export const CALIBRATION = {
  /* ספי שיעור הצלחה — ריבוי נתונים */
  LOW: 0.6,
  HIGH: 0.8,
  /* ספי שיעור הצלחה — ביטחון נמוך (מדגם קטן): נדרשת עדות קיצונית */
  TIGHT_LOW: 0.5,
  TIGHT_HIGH: 0.9,
  /* תחומי הרמות */
  TEXT_MIN: 1, TEXT_MAX: 16,
  PUZZLE_MIN: 1, PUZZLE_MAX: 10,
  /* ספי זמן קריאה לסצנה */
  SKIP_MS_PER_SCENE: 3000,
  SLOW_MS_PER_SCENE: 45000,
  /* חלון מתגלגל: K = קיבולת מקסימלית פר סוג */
  ROLLING_K: 10,
  /* שער מינימום — מתחתיו לא מזיזים רמה */
  MIN_SAMPLE: 4,
  /* מדגם מלא — מעליו הסף הרגיל (60/80) */
  FULL_SAMPLE: 8,
} as const

export interface DifficultyProfile {
  textLevel: number
  perPuzzleLevel: Record<ProfilePuzzleType, number>
}

/* אקומולטור מתגלגל פר-סוג, נשמר ב-DB ומתמזג חוצה-סשנים */
export type RollingTallies = Partial<Record<ProfilePuzzleType, { solved: number; total: number }>>

export interface PuzzleStat { solved: number; total: number }
export interface CalibrationInput {
  /* נתוני ה-session הנוכחי (לטקסט ולמיזוג לתוך הצוברים) */
  perType: Partial<Record<ProfilePuzzleType, PuzzleStat>>
  /* צוברים מוזגים (prev rolling + session הנוכחי) */
  rollingTallies: RollingTallies
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

/* כלל 60/80 פשוט — לטקסט (תכיף, יציב) */
function step(level: number, rate: number): number {
  if (rate < CALIBRATION.LOW) return level - 1
  if (rate > CALIBRATION.HIGH) return level + 1
  return level
}

/* צעד לפי ביטחון — לחידות (ממדגם מצטבר).
   n < MIN_SAMPLE: ללא שינוי.
   MIN_SAMPLE..FULL_SAMPLE: ספי הפעלה מחמירים (אינטרפולציה לינארית → 0.5/0.9).
   ≥ FULL_SAMPLE: ספים רגילים 60/80. */
function confidenceStep(level: number, rate: number, n: number): number {
  if (n < CALIBRATION.MIN_SAMPLE) return level
  const conf = Math.min(1, (n - CALIBRATION.MIN_SAMPLE) / (CALIBRATION.FULL_SAMPLE - CALIBRATION.MIN_SAMPLE))
  const low = CALIBRATION.TIGHT_LOW + conf * (CALIBRATION.LOW - CALIBRATION.TIGHT_LOW)
  const high = CALIBRATION.TIGHT_HIGH + conf * (CALIBRATION.HIGH - CALIBRATION.TIGHT_HIGH)
  if (rate < low) return level - 1
  if (rate > high) return level + 1
  return level
}

/* alias היסטורי */
function normalizeType(type: string): ProfilePuzzleType | null {
  const t = type === 'slidingPuzzle' ? 'tileSwap' : type
  return (PROFILE_PUZZLE_TYPES as readonly string[]).includes(t) ? (t as ProfilePuzzleType) : null
}

/* ── API ציבורי ── */

/* מיזוג session נוכחי לתוך הצוברים המתגלגלים (cap ב-K) */
export function mergeRolling(
  prev: RollingTallies,
  session: Partial<Record<ProfilePuzzleType, PuzzleStat>>,
): RollingTallies {
  const out: RollingTallies = { ...prev }
  for (const type of PROFILE_PUZZLE_TYPES) {
    const s = session[type]
    if (!s || s.total === 0) continue
    const p = out[type] ?? { solved: 0, total: 0 }
    let solved = p.solved + s.solved
    let total = p.total + s.total
    if (total > CALIBRATION.ROLLING_K) {
      const scale = CALIBRATION.ROLLING_K / total
      solved = Math.round(solved * scale)
      total = CALIBRATION.ROLLING_K
    }
    out[type] = { solved, total }
  }
  return out
}

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

/* הכיול עצמו */
export function calibrate(prev: DifficultyProfile, input: CalibrationInput): CalibrationResult {
  const perPuzzleLevel = { ...prev.perPuzzleLevel }

  /* 1) כלל עם גייטינג ביטחון — לכל סוג אתגר לפי הצובר המצטבר */
  for (const type of PROFILE_PUZZLE_TYPES) {
    const tally = input.rollingTallies[type]
    if (!tally || tally.total === 0) continue
    perPuzzleLevel[type] = clampPuzzle(
      confidenceStep(perPuzzleLevel[type], tally.solved / tally.total, tally.total),
    )
  }

  /* 2) text_level — שיעור הצלחה ב-MC + finalQuiz של ה-session הנוכחי */
  let textLevel = prev.textLevel
  const mc = input.perType.multipleChoice
  const fq = input.perType.finalQuiz
  const contentSolved = (mc?.solved ?? 0) + (fq?.solved ?? 0)
  const contentTotal = (mc?.total ?? 0) + (fq?.total ?? 0)
  if (contentTotal > 0) textLevel = step(textLevel, contentSolved / contentTotal)

  /* תיקון זמני קריאה */
  let skipping = false
  let readingAdjust: CalibrationResult['readingAdjust'] = 'none'
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
