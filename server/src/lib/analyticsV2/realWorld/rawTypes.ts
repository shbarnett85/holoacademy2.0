/* ──────────────────────────────────────────────────────────────────────────
   rawTypes — צורת השורות הגולמיות של כיתה אחת (פלט ה-I/O של fetchRaw, קלט הטהור של assemble).
   · אין כאן תלות ב-DB: הטיפוסים נבנים גם בטסטים (מהעולם הדמוי) וגם ע"י fetchRaw מהטבלאות האמיתיות.
   · רק מה שנגזר באמת מהנתונים: אין שדה לתגית מושג / טעות נפוצה (הטבלאות ריקות; חוק 2 — לא מנחשים).
   ────────────────────────────────────────────────────────────────────────── */
import type { SubjectCode } from '../../../../../src/shared/lib/subjects.js'

/* אופק הנתונים: ימי לימוד אחורה (המינימום הבטוח ~200: חלון אחרון 60 + קודם 120 + מחצית 25) */
export const LIVE_HORIZON_SCHOOL_DAYS = 260

export type AnswerOutcome = 'correct' | 'wrong' | 'timeout' | 'gave_up' | 'closed'

export interface RawClassRow {
  id: string
  /* classes.name — שם הכיתה כפי שהוזן (למשל "ז׳3") */
  name: string | null
  /* classes.grade_label — תווית שכבה+מספר כיתה נוכחית (למשל "ז׳3") */
  gradeLabel: string | null
  /* classes.grade_level — שכבה כמספר 1–12 (null עד שהמיגרציה/ה-backfill מילאו) */
  gradeLevel: number | null
  schoolId: string | null
}

export interface RawMember {
  id: string
  name: string
  /* כל הכיתות שהתלמיד חבר בהן (כולל הכיתה הזאת) — לקביעת הכיתה העיקרית של תלמיד בכמה כיתות */
  classIds: string[]
}

export interface RawSession {
  id: string
  studentId: string
  questId: string
  completedAt: string
}

/* מקצוע ההדמיה כפי שהוא ב-quests.subject_id (null = לא סווג; לא מנחשים) */
export interface RawQuest {
  id: string
  subject: SubjectCode | null
}

/* progress_snapshots של סשן שנספר: הרמה אחרי הכיול (text_level) וההצלחה הכוללת (overall_success) */
export interface RawSnapshot {
  sessionId: string
  studentId: string
  classId: string | null
  subject: SubjectCode | null
  level: number | null
  success: number | null
}

/* events.type='scene_enter' עם word_count (1B). מי שחסר word_count לא נטען בכלל */
export interface RawSceneEnter {
  sessionId: string
  sceneId: string | null
  wordCount: number | null
  closedMs: number | null
}

/* סצנה שיש בה אתגר (puzzle_solved/puzzle_failed) — זמן השהייה בה כולל את זמן פתרון האתגר ולכן אינו קריאה */
export interface RawPuzzleScene {
  sessionId: string
  sceneId: string
}

export interface RawAnswer {
  sessionId: string
  sceneId: string
  itemIndex: number
  puzzleType: string
  selectedPosition: number | null
  correctPosition: number | null
  /* אורך displayed_order (מספר האפשרויות שהוצגו) */
  displayedCount: number | null
  outcome: AnswerOutcome
  /* מוכנים לתיוג עתידי (option_tags.concept_id → concepts.key) ולקושי שהוצג; ריקים עד שיהיה צינור תיוג */
  conceptKey?: string | null
  difficulty?: number | null
}

export interface RawMemoryFlip { card: number; pair: number; t: number }
export interface RawMemoryGame {
  sessionId: string
  sceneId: string
  itemIndex: number
  flips: RawMemoryFlip[]
  /* מספר הקלפים בלוח (2 × זוגות) מ-game_data; null = גרסה אישית / לא נמצא → אומדן מההיפוכים */
  totalCards: number | null
}

export interface RawClassData {
  /* null = הכיתה לא נמצאה (או מוסתרת: פיקטיבית לצופה שאינו בארגון הדגמה) */
  cls: RawClassRow | null
  school: { id: string; name: string } | null
  members: RawMember[]
  /* מקצועות הכיתה מ-class_teachers.subject_id (גם בלי נתונים) */
  classSubjects: SubjectCode[]
  /* סשנים שהושלמו בחלון (כל הסשנים של חברי הכיתה, בלי קשר לכיתה שבה שוחקו) */
  sessions: RawSession[]
  quests: RawQuest[]
  snapshots: RawSnapshot[]
  sceneEnters: RawSceneEnter[]
  puzzleScenes: RawPuzzleScene[]
  answers: RawAnswer[]
  memory: RawMemoryGame[]
  /* התאריך הראשון שבו נלכדו תשובות בפלטפורמה (פירוט התשובות זמין ממנו); null = עדיין לא */
  detailAvailableFrom: string | null
  includeSynthetic: boolean
}

export function emptyRaw(includeSynthetic = false): RawClassData {
  return {
    cls: null, school: null, members: [], classSubjects: [], sessions: [], quests: [], snapshots: [],
    sceneEnters: [], puzzleScenes: [], answers: [], memory: [], detailAvailableFrom: null, includeSynthetic,
  }
}
