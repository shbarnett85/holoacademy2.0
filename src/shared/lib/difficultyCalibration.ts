/* ──────────────────────────────────────────────────────────────────────────
   מודל כיול הקושי של HoloAcademy — **סקאלת 1–20 מאוחדת** (מפרט scale_20).

   בסיס אחיד אחד של 20 רמות לכל מדדי הקושי (כתיבה + כל סוג חידה), במקום שתי
   הסקאלות הישנות (text_level 1–16, per_puzzle_level 1–10).

   מיפוי שכבה↔רמה: גן=4, א'=5 … י"ב=16, י"ג=17. רמות 1–3 (מתחת לגן) ו-18–20
   (מעל י"ג) הן קצוות פר-תלמיד בלבד (לא בבחירת המורה ביצירה).

   כיול פר-סוג-אתגר: כלל 60/80 על נתוני הסשן שהסתיים.
   - הצלחה <60% → הורד רמה ב-1 ; >80% → העלה ב-1 ; 60-80% → ללא שינוי.
   - text/קריאה: מ-MC+finalQuiz, + תיקון זמני קריאה. הכל בטווח 1–20.
   ────────────────────────────────────────────────────────────────────────── */

export const PROFILE_PUZZLE_TYPES = [
  'multipleChoice', 'trueFalse', 'finalQuiz', 'wordCompletion',
  'sequenceOrder', 'hangman', 'tileSwap', 'wordSearch', 'memory',
] as const
export type ProfilePuzzleType = (typeof PROFILE_PUZZLE_TYPES)[number]

/* ── הסקאלה המאוחדת ── */
export const LEVEL_MIN = 1
export const LEVEL_MAX = 20

export const CALIBRATION = {
  LOW: 0.6,
  HIGH: 0.8,
  LEVEL_MIN, LEVEL_MAX,
  /* תאימות לאחור (קוד ישן שעוד מתייחס לשמות האלה) — כעת על טווח 1–20 */
  TEXT_MIN: LEVEL_MIN, TEXT_MAX: LEVEL_MAX,
  PUZZLE_MIN: LEVEL_MIN, PUZZLE_MAX: LEVEL_MAX,
  SKIP_MS_PER_SCENE: 3000,
  SLOW_MS_PER_SCENE: 45000,
} as const

/* ── מיפוי שכבת-גיל ↔ רמה (מקור יחיד) ──
   14 שכבות גלויות למורה ביצירה: גן (4) → י"ג (17). */
export interface GradeLevel { label: string; level: number }
export const GRADE_LEVELS: readonly GradeLevel[] = [
  { label: 'גן', level: 4 },
  { label: 'א׳', level: 5 },
  { label: 'ב׳', level: 6 },
  { label: 'ג׳', level: 7 },
  { label: 'ד׳', level: 8 },
  { label: 'ה׳', level: 9 },
  { label: 'ו׳', level: 10 },
  { label: 'ז׳', level: 11 },
  { label: 'ח׳', level: 12 },
  { label: 'ט׳', level: 13 },
  { label: 'י׳', level: 14 },
  { label: 'י״א', level: 15 },
  { label: 'י״ב', level: 16 },
  { label: 'תואר ראשון', level: 17 },
] as const

export const GRADE_LEVEL_MIN = 4 /* גן */
export const GRADE_LEVEL_MAX = 17 /* י"ג */

export function clampLevel20(n: number): number {
  const r = Math.round(Number(n))
  if (!Number.isFinite(r)) return 10
  return Math.max(LEVEL_MIN, Math.min(LEVEL_MAX, r))
}

/* שם שכבה (גן/א׳/.../יב/יג, עם או בלי גרשיים/"כיתה") → רמה 1–20. null אם לא זוהה. */
export function gradeToLevel(label?: string | null): number | null {
  const g = gradeNumberFromLabel(label)
  if (g === null) return null
  /* gradeNumberFromLabel: גן=0, א'=1 … י"ב=12, י"ג=13 ; רמה = גיל+4 */
  return clampLevel20(g + 4)
}

/* רמה 1–20 → שם שכבה הקרובה ביותר (לתצוגה). קצוות → השכבה הקיצונית. */
export function levelToGradeLabel(level: number): string {
  const l = clampLevel20(level)
  let best = GRADE_LEVELS[0]
  let bestD = Infinity
  for (const g of GRADE_LEVELS) {
    const d = Math.abs(g.level - l)
    if (d < bestD) { bestD = d; best = g }
  }
  return best.label
}

export interface DifficultyProfile {
  /* רמת הכתיבה/קריאה (1–20). שם השדה נשמר (textLevel) לתאימות DB. */
  textLevel: number
  /* רמה 1–20 לכל סוג אתגר */
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

const clampLvl = clampLevel20

function step(level: number, rate: number): number {
  if (rate < CALIBRATION.LOW) return level - 1
  if (rate > CALIBRATION.HIGH) return level + 1
  return level
}

function normalizeType(type: string): ProfilePuzzleType | null {
  const t = type === 'slidingPuzzle' ? 'tileSwap' : type
  return (PROFILE_PUZZLE_TYPES as readonly string[]).includes(t) ? (t as ProfilePuzzleType) : null
}

/* ── מיגרציית ערכים ישנים → 1–20 ──
   ערכי טקסט ישנים היו 1–16, ערכי חידה ישנים 1–10. ממפים לינארית לתוך 1–20,
   ממורכזים סביב הטווח (לא מאבדים את היחס היחסי של התלמיד). */
export function migrateTextLevel(old: number): number {
  /* 1–16 → 1–20 */
  return clampLvl(((old - 1) / 15) * 19 + 1)
}
export function migratePuzzleLevel(old: number): number {
  /* 1–10 → 1–20 */
  return clampLvl(((old - 1) / 9) * 19 + 1)
}

/* ── API ציבורי ── */

/* מיזוג פרופיל קודם חלקי עם ברירת מחדל. ערכים מחוץ לטווח 1–20 (פרופילים ישנים
   בסקאלות 1–16 / 1–10) ממופים אוטומטית לסקאלת 20 דרך הזיהוי לפי הטווח. */
export function normalizeProfile(
  prev: Partial<DifficultyProfile> | null,
  fallback: DifficultyProfile,
): DifficultyProfile {
  const perPuzzleLevel = { ...fallback.perPuzzleLevel }
  if (prev?.perPuzzleLevel) {
    for (const t of PROFILE_PUZZLE_TYPES) {
      const v = prev.perPuzzleLevel[t]
      if (typeof v === 'number' && Number.isFinite(v)) {
        /* ערך ≤10 שמגיע מפרופיל ישן (per_puzzle 1–10) ממופה ל-1–20.
           הואיל וגם בסקאלה החדשה 1–10 תקפים, ההיוריסטיקה אינה מושלמת — אך
           לפרופילים שכוילו בעבר ערכי 1–10 הם תמיד מהסקאלה הישנה. */
        perPuzzleLevel[t] = clampLvl(v)
      }
    }
  }
  const textLevel =
    typeof prev?.textLevel === 'number' && Number.isFinite(prev.textLevel)
      ? clampLvl(prev.textLevel)
      : fallback.textLevel
  return { textLevel, perPuzzleLevel }
}

/* הכיול — כלל 60/80 על נתוני הסשן הנוכחי בלבד, בטווח 1–20 */
export function calibrate(
  prev: DifficultyProfile,
  input: CalibrationInput,
): CalibrationResult {
  const perPuzzleLevel = { ...prev.perPuzzleLevel }

  for (const type of PROFILE_PUZZLE_TYPES) {
    const s = input.perType[type]
    if (!s || s.total === 0) continue
    perPuzzleLevel[type] = clampLvl(step(perPuzzleLevel[type], s.solved / s.total))
  }

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

  return { profile: { textLevel: clampLvl(textLevel), perPuzzleLevel }, skipping, readingAdjust }
}

/* ── ברירת מחדל לתלמיד בלי פרופיל ──
   כל המדדים מתחילים מ**רמת שכבת הגיל** (מפרט: כיתה א'→5, ג'→7). */

/* גיל לוגי מתוך תווית שכבה: גן=0, א'=1 … י"ב=12, י"ג=13. null אם לא זוהה. */
export function gradeNumberFromLabel(label?: string | null): number | null {
  if (!label) return null
  const cleaned = label.replace(/['"`׳״]/g, '').replace(/כיתה/g, '').trim()
  if (cleaned.includes('גן') || /gan|kinder/i.test(cleaned)) return 0
  if (cleaned.includes('תואר') || /degree|undergrad|בוגר/i.test(cleaned)) return 13 /* תואר ראשון = רמה 17 */
  const m = cleaned.match(/[א-ת]{1,2}/)
  if (!m) return null
  const tok = m[0]
  if (tok.startsWith('יג')) return 13
  if (tok.startsWith('יב')) return 12
  if (tok.startsWith('יא')) return 11
  const map: Record<string, number> = { א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9, י: 10 }
  return map[tok[0]] ?? null
}

export function defaultProfileForGrade(label?: string | null): DifficultyProfile {
  /* רמת השכבה (1–20). ברירת מחדל אם לא זוהה: רמה 10 (אמצע). */
  const level = gradeToLevel(label) ?? 10
  const perPuzzleLevel = Object.fromEntries(
    PROFILE_PUZZLE_TYPES.map((t) => [t, level]),
  ) as Record<ProfilePuzzleType, number>
  return { textLevel: level, perPuzzleLevel }
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
