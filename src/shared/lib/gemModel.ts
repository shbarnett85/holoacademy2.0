/* ── מודל הגבישים (CLAUDE.md "תחושת משחק: כללים" + "מודל הגבישים") — pure, משותף ללקוח, לשרת ולבדיקות ──
   חמשת הגבישים הם פס התקדמות: כל אתגר שווה נקודה אחת לכל היותר, והגבישים = נקודות ÷ נקודות אפשריות × 5.
   הגבישים הם שכבת המשחק בלבד: הכיול והאנליטיקה נשענים על הניסיון הראשון (`correct` ב-events), לא על הנקודות. */

export const GEM_TOTAL = 5
/* כמה גבישים שלמים סוגרים את הסיפור */
export const STORY_CLOSE_GEMS = 3
const EPS = 1e-9

export const POINTS = { clean: 1, afterMistake: 0.5, none: 0 } as const

/* איך נקבעת "הצלחה נקייה" לכל סוג אתגר:
   · secondTry — נכון בניסיון הראשון = 1, נכון בניסיון השני = 0.5
   · single — ניסיון אחד (עם שתי אפשרויות ניסיון שני חסר משמעות)
   · firstSubmit — נכון בהגשה הראשונה = 1, בהגשה מאוחרת יותר = 0.5
   · halfBudget — הצלחה עם עד מחצית מהטעויות המותרות = 1, עם יותר = 0.5
   · inTime — הצלחה בתוך הזמן = 1
   · always — דילמה מוסרית: אין תשובה נכונה, תמיד 1 */
export type CleanRule = 'secondTry' | 'single' | 'firstSubmit' | 'halfBudget' | 'inTime' | 'always'

export const CLEAN_SUCCESS: Readonly<Record<string, CleanRule>> = {
  multipleChoice: 'secondTry',
  finalQuiz: 'secondTry',
  trueFalse: 'single',
  memory: 'halfBudget',
  matchPairs: 'halfBudget',
  sequenceOrder: 'firstSubmit',
  hangman: 'halfBudget',
  wordCompletion: 'halfBudget',
  tileSwap: 'halfBudget',
  slidingPuzzle: 'halfBudget',
  wordSearch: 'inTime',
  moralDilemma: 'always',
}

export const cleanRuleOf = (type: string | null | undefined): CleanRule => CLEAN_SUCCESS[type ?? 'multipleChoice'] ?? 'single'

/* בחירה מרובה ומבחן סיכום מקבלים ניסיון שני. נכון/לא נכון — לא, גם אם הגיע בלי type מפורש */
export function hasSecondTry(type: string | null | undefined, isTrueFalseChoice = false): boolean {
  return !isTrueFalseChoice && cleanRuleOf(type) === 'secondTry'
}

export interface ChallengeOutcome {
  type: string | null | undefined
  /* האם האתגר הוצלח בסופו של דבר (גם אם בניסיון מאוחר) */
  solved: boolean
  /* secondTry: באיזה ניסיון הצליח (1/2) */
  solvedOnAttempt?: number
  /* firstSubmit: כמה הגשות שגויות היו לפני ההצלחה. halfBudget: כמה טעויות היו */
  mistakes?: number
  /* halfBudget: כמה טעויות מותרות */
  allowed?: number
  /* finalQuiz: לכל שאלה — באיזה ניסיון הצליח (1/2), או 0 אם לא הצליח */
  quizAttempts?: number[]
}

/* הנקודות של אתגר אחד: 0, 0.5 או 1 (במבחן סיכום — ממוצע השאלות) */
export function challengePoints(o: ChallengeOutcome): number {
  const rule = cleanRuleOf(o.type)
  if (rule === 'always') return POINTS.clean
  if (o.type === 'finalQuiz' && o.quizAttempts) {
    if (o.quizAttempts.length === 0) return POINTS.none
    const sum = o.quizAttempts.reduce((a, n) => a + (n === 1 ? POINTS.clean : n === 2 ? POINTS.afterMistake : POINTS.none), 0)
    return sum / o.quizAttempts.length
  }
  if (!o.solved) return POINTS.none
  switch (rule) {
    case 'secondTry': return (o.solvedOnAttempt ?? 1) <= 1 ? POINTS.clean : POINTS.afterMistake
    case 'firstSubmit': return (o.mistakes ?? 0) === 0 ? POINTS.clean : POINTS.afterMistake
    case 'halfBudget': {
      const allowed = Math.max(0, o.allowed ?? 0)
      return (o.mistakes ?? 0) <= allowed / 2 ? POINTS.clean : POINTS.afterMistake
    }
    default: return POINTS.clean
  }
}

/* מספר הגבישים כמספר רציף (0..5) — הגבישים מתמלאים ברצף, מלמטה למעלה */
export function gemsValue(points: number, possible: number): number {
  if (!(possible > 0) || !(points > 0)) return 0
  return Math.min(GEM_TOTAL, (points / possible) * GEM_TOTAL)
}

/* גבישים שלמים — זה מה שהמונה מציג. שום שבר לא מוצג לתלמיד */
export const wholeGems = (points: number, possible: number): number => Math.floor(gemsValue(points, possible) + EPS)

/* כמה ממולא הגביש ה-i (0-based), 0..1 */
export function gemFill(value: number, i: number): number {
  return Math.max(0, Math.min(1, value - i))
}

export type StoryState = 'closed' | 'radiant' | 'open'

/* סוף השיעור: הסיפור נסגר (3 גבישים שלמים ומעלה), נסגר עם זוהר מיוחד (5), או נשאר פתוח.
   שיעור בלי אתגרים (אין מה לאסוף) — הסיפור נסגר. */
export function storyState(gems: number, possible = 1): StoryState {
  if (possible <= 0) return 'closed'
  if (gems >= GEM_TOTAL) return 'radiant'
  return gems >= STORY_CLOSE_GEMS ? 'closed' : 'open'
}
export const storyClosed = (gems: number, possible = 1): boolean => storyState(gems, possible) !== 'open'

/* הטוב מבין המשחקים של תלמיד/ה (מקור גבישי הכיתה והמסע). null = לא נשמרו גבישים */
export function bestGems(rows: readonly { gems?: number | null }[]): number | null {
  let best: number | null = null
  for (const r of rows) {
    if (typeof r.gems === 'number' && Number.isFinite(r.gems) && (best === null || r.gems > best)) best = r.gems
  }
  return best
}

/* ── גבישי הכיתה: שני מספרים בלבד ── */
export function classGemTarget(studentCount: number): number {
  return Math.max(0, studentCount) * STORY_CLOSE_GEMS
}

/* ── עוצמת האפקטים של הכיתה ── */
export const EFFECT_LEVELS = ['gentle', 'medium', 'full'] as const
export type EffectLevel = (typeof EFFECT_LEVELS)[number]
export const DEFAULT_EFFECT_LEVEL: EffectLevel = 'medium'
export const EFFECT_LEVEL_LABEL: Readonly<Record<EffectLevel, string>> = { gentle: 'עדין', medium: 'בינוני', full: 'מלא' }
export const isEffectLevel = (v: unknown): v is EffectLevel => typeof v === 'string' && (EFFECT_LEVELS as readonly string[]).includes(v)
export const effectLevelOf = (v: unknown): EffectLevel => (isEffectLevel(v) ? v : DEFAULT_EFFECT_LEVEL)

/* ── המסע: התחנות של מקצוע אחד, לפי סדר הקבלה ── */
export type StationState = 'done' | 'now' | 'open'
export interface JourneyLesson {
  id: string
  title: string
  subjectCode: string | null
  assignedAt?: string | null
  /* הגבישים של המשחק הטוב ביותר; null = עוד לא הושלם */
  gems?: number | null
  /* כל מי שקיבל את השיעור סגר את הסיפור */
  classClosed?: boolean
  /* התלמיד/ה באמצע השיעור הזה */
  inProgress?: boolean
}
export interface JourneyStation { id: string; title: string; state: StationState; gems: number | null; classClosed: boolean }
export interface JourneySubject { subjectCode: string | null; stations: JourneyStation[] }

export function buildJourney(lessons: readonly JourneyLesson[], currentId?: string | null): JourneySubject[] {
  const bySubject = new Map<string, JourneyLesson[]>()
  for (const l of lessons) {
    const k = l.subjectCode ?? ''
    const arr = bySubject.get(k)
    if (arr) arr.push(l)
    else bySubject.set(k, [l])
  }
  return [...bySubject.entries()].map(([k, list]) => ({
    subjectCode: k || null,
    stations: [...list]
      .sort((a, b) => String(a.assignedAt ?? '').localeCompare(String(b.assignedAt ?? '')))
      .map((l) => ({
        id: l.id, title: l.title,
        state: (l.id === currentId || (l.inProgress && typeof l.gems !== 'number') ? 'now' : typeof l.gems === 'number' ? 'done' : 'open') as StationState,
        gems: typeof l.gems === 'number' ? l.gems : null,
        classClosed: l.classClosed === true,
      })),
  }))
}
