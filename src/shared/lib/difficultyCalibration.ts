/* ──────────────────────────────────────────────────────────────────────────
   מודל כיול והתאמת הקושי של HoloAcademy — נקי ומבוסס שיעור הצלחה פר-סוג-אתגר.

   מחליף את הלוגיקה הישנה ב-update_difficulty_profile. הכלל פשוט:
   - לכל סוג אתגר בנפרד: שיעור הצלחה ב-session → 60/80 (פחות מ-60% הורד רמה,
     יותר מ-80% העלה רמה, באמצע השאר).
   - text_level (רמת הטקסט, 1-16) נגזר ממדד התוכן הטהור (רב-ברירה + מבחן סיכום)
     עם אותו כלל 60/80, ועם תיקון לפי זמני הקריאה (קריאה איטית מורידה רמה;
     קריאה מהירה מדי = דגל "דילוג", בלי לשנות רמה).
   - משחק הזיכרון חריג: הפרמטר המכני (כמות זוגות + פסילות) מתכוונן לפי
     per_puzzle_level.memory, אך מורכבות התוכן של הזוגות כפופה ל-text_level.

   הקובץ pure (ללא DOM/Node) ומשמש את השרת (כיול אחרי כל session) ואת התצוגה.
   ────────────────────────────────────────────────────────────────────────── */

/* סוגי האתגרים שמחזיקים רמת קושי עצמאית בפרופיל */
export const PROFILE_PUZZLE_TYPES = [
  'multipleChoice', 'trueFalse', 'finalQuiz', 'wordCompletion',
  'sequenceOrder', 'hangman', 'tileSwap', 'wordSearch', 'memory',
] as const
export type ProfilePuzzleType = (typeof PROFILE_PUZZLE_TYPES)[number]

/* קבועי הכיול — מרוכזים במקום אחד לכוונון עתידי קל */
export const CALIBRATION = {
  /* ספי שיעור הצלחה (פר סוג ולטקסט) */
  LOW: 0.6, /* < 60% → הורד רמה */
  HIGH: 0.8, /* > 80% → העלה רמה */
  /* תחומי הרמות */
  TEXT_MIN: 1, TEXT_MAX: 16,
  PUZZLE_MIN: 1, PUZZLE_MAX: 10,
  /* ספי זמן קריאה לסצנה (מ-scene_enter עוקבים) */
  SKIP_MS_PER_SCENE: 3000, /* < 3ש׳ לסצנה = דילוג/לא קורא */
  SLOW_MS_PER_SCENE: 45000, /* > 45ש׳ לסצנה = קריאה איטית */
} as const

export interface DifficultyProfile {
  textLevel: number
  perPuzzleLevel: Record<ProfilePuzzleType, number>
}

/* מדדי session פר סוג אתגר — פתורים מתוך סך האתגרים מאותו סוג */
export interface PuzzleStat { solved: number; total: number }
export interface CalibrationInput {
  perType: Partial<Record<ProfilePuzzleType, PuzzleStat>>
  /* זמן ממוצע לסצנה במילישניות (מהפרשי scene_enter) */
  avgSceneMs: number
}

export interface CalibrationResult {
  profile: DifficultyProfile
  /* תלמיד שכנראה מדלג על הטקסט (קריאה מהירה חריגה) — דגל לאנליטיקה */
  skipping: boolean
  /* תיקון זמן הקריאה שהוחל על text_level */
  readingAdjust: 'slow' | 'skip' | 'none'
}

function clampPuzzle(n: number): number {
  return Math.max(CALIBRATION.PUZZLE_MIN, Math.min(CALIBRATION.PUZZLE_MAX, Math.round(n)))
}
function clampText(n: number): number {
  return Math.max(CALIBRATION.TEXT_MIN, Math.min(CALIBRATION.TEXT_MAX, Math.round(n)))
}

/* כלל 60/80: רמה זזה ב-±1 לפי שיעור ההצלחה, או נשארת באמצע */
function step(level: number, rate: number): number {
  if (rate < CALIBRATION.LOW) return level - 1
  if (rate > CALIBRATION.HIGH) return level + 1
  return level
}

/* alias היסטורי */
function normalizeType(type: string): ProfilePuzzleType | null {
  const t = type === 'slidingPuzzle' ? 'tileSwap' : type
  return (PROFILE_PUZZLE_TYPES as readonly string[]).includes(t) ? (t as ProfilePuzzleType) : null
}

/* מיזוג פרופיל קודם חלקי עם ברירת מחדל — מבטיח שכל הסוגים קיימים */
export function normalizeProfile(prev: Partial<DifficultyProfile> | null, fallback: DifficultyProfile): DifficultyProfile {
  const perPuzzleLevel = { ...fallback.perPuzzleLevel }
  if (prev?.perPuzzleLevel) {
    for (const t of PROFILE_PUZZLE_TYPES) {
      const v = prev.perPuzzleLevel[t]
      if (typeof v === 'number' && Number.isFinite(v)) perPuzzleLevel[t] = clampPuzzle(v)
    }
  }
  const textLevel = typeof prev?.textLevel === 'number' && Number.isFinite(prev.textLevel)
    ? clampText(prev.textLevel)
    : fallback.textLevel
  return { textLevel, perPuzzleLevel }
}

/* הכיול עצמו — רץ אחרי כל session שהושלם (לא replay) */
export function calibrate(prev: DifficultyProfile, input: CalibrationInput): CalibrationResult {
  const perPuzzleLevel = { ...prev.perPuzzleLevel }

  /* 1) כלל 60/80 לכל סוג אתגר שהופיע ב-session */
  for (const type of PROFILE_PUZZLE_TYPES) {
    const stat = input.perType[type]
    if (!stat || stat.total === 0) continue
    perPuzzleLevel[type] = clampPuzzle(step(perPuzzleLevel[type], stat.solved / stat.total))
  }

  /* 2) text_level — בסיס: שיעור ההצלחה המשולב ברב-ברירה + מבחן סיכום */
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
      textLevel -= 1 /* קריאה איטית חריגה → הורד רמת טקסט (גם אם החידות בסדר) */
      readingAdjust = 'slow'
    } else if (input.avgSceneMs < CALIBRATION.SKIP_MS_PER_SCENE) {
      skipping = true /* דילוג → אל תשנה רמה, רק סמן דגל למורה */
      readingAdjust = 'skip'
    }
  }

  return {
    profile: { textLevel: clampText(textLevel), perPuzzleLevel },
    skipping,
    readingAdjust,
  }
}

/* ── ברירת מחדל לתלמיד בלי פרופיל — נגזרת מ-grade_label של הכיתה ── */

/* grade_label בפורמטים: "ז2", "ז׳2", "ג3", "כיתה ח" → מספר השכבה 1-12 */
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

/* מיפוי שכבה → רמת בסיס: טקסט ≈ מספר השכבה (1-16), אתגרים בינוני-נמוך מדורג */
export function defaultProfileForGrade(label?: string | null): DifficultyProfile {
  const grade = gradeNumberFromLabel(label) ?? 5 /* ברירת מחדל אמצע אם לא ידוע */
  const textLevel = clampText(grade)
  const puzzleBase = clampPuzzle(2 + grade * 0.5) /* ג(3)→4 · ו(6)→5 · ט(9)→7 · יב(12)→8 */
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
