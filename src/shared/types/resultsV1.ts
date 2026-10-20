/* ──────────────────────────────────────────────────────────────────────────
   resultsV1 — החוזה של טאב "תוצאות" (שלב UX). **שני ספקים, אותו חוזה**:
   · ספק אמיתי (server/src/lib/results/realResults.ts) — נתוני אמת מה-DB, פעיל לכל המורים (לא מאחורי ANALYTICS_V2).
   · ספק הדגמה (server/src/lib/results/demoResults.ts) — למורה אורח, מעולם הדמו שבזיכרון (6–10 שליחות).
   המסכים (src/features/results) צורכים רק את הצורות האלה.

   "שליחה" = הדמיה × כיתה × תאריך שליחה (שורת assignments).
   כל טקסט בשפה טבעית (summary, אזהרות, "זמין מתאריך") נבנה ב-findingsNarrative.ts — לא מוקלד כאן/ב-fixtures.
   עובדות בלבד: אין כאן פרשנות על תלמיד ("לא קרא") — דפוסי התנהגות שייכים לאנליטיקה ומעל ספי הדיווח.
   ────────────────────────────────────────────────────────────────────────── */
import { z } from 'zod'
import { isSubjectCode } from '../lib/subjects'

const Iso = z.string().min(10)
const Id = z.string().min(1)
const NonNeg = z.number().int().nonnegative()

export const ResultsSubjectSchema = z.object({
  code: z.string().refine(isSubjectCode, 'קוד מקצוע לא מוכר'),
  nameHe: z.string().min(1),
})
export type ResultsSubject = z.infer<typeof ResultsSubjectSchema>

export const StudentStatusSchema = z.enum(['completed', 'in_progress', 'not_started'])
export type StudentStatus = z.infer<typeof StudentStatusSchema>

/* סיבות "תשומת לב" — כלל עובדתי בלבד (analyticsConfig.ATTENTION_RULE) */
export const AttentionReasonSchema = z.enum(['not_started', 'gave_up_often', 'low_success'])
export type AttentionReason = z.infer<typeof AttentionReasonSchema>

export const CountsSchema = z.object({ total: NonNeg, completed: NonNeg, inProgress: NonNeg, notStarted: NonNeg })
export type Counts = z.infer<typeof CountsSchema>

export const StudentChipSchema = z.object({
  id: Id,
  name: z.string().min(1),
  status: StudentStatusSchema,
  attention: z.boolean(),
  attentionReasons: z.array(AttentionReasonSchema),
})
export type StudentChip = z.infer<typeof StudentChipSchema>

/* ── 2.1 רשימת השליחות ── */
export const SubmissionRowSchema = z.object({
  id: Id,
  questId: Id,
  title: z.string(),
  thumbUrl: z.string().nullable(),
  /* null = "לא סווג" */
  subject: ResultsSubjectSchema.nullable(),
  classId: Id,
  className: z.string(),
  sentAt: Iso,
  counts: CountsSchema,
  /* משפט סיכום אחד על הכיתה — מ-findingsNarrative */
  summary: z.string().min(1),
  attentionCount: NonNeg,
  /* מי שלח: 'mine' = אני; 'homeroom' = מורה אחר שלח לכיתת-החינוך שלי; 'subject' = מורה מקצוע בכיתה שלי */
  source: z.enum(['mine', 'homeroom', 'subject']),
  senderName: z.string().nullable(),
})
export type SubmissionRow = z.infer<typeof SubmissionRowSchema>

export const SubmissionListSchema = z.object({
  submissions: z.array(SubmissionRowSchema),
  /* אפשרויות לסינון בכפתורים; המקצוע מוצג רק אם יש יותר מאחד */
  filters: z.object({
    classes: z.array(z.object({ id: Id, name: z.string() })),
    subjects: z.array(ResultsSubjectSchema),
  }),
})
export type SubmissionList = z.infer<typeof SubmissionListSchema>

/* ── ראש מסך ההדמיה (משותף לשני המצבים) ── */
export const SubmissionHeadSchema = z.object({
  id: Id, questId: Id, title: z.string(), thumbUrl: z.string().nullable(),
  subject: ResultsSubjectSchema.nullable(),
  classId: Id, className: z.string(), sentAt: Iso,
  counts: CountsSchema,
})
export type SubmissionHead = z.infer<typeof SubmissionHeadSchema>

/* ── 2.2 מצב "כל הכיתה" ── */
export const TagRefSchema = z.object({ id: Id, title: z.string().min(1) })

export const OptionCountSchema = z.object({
  optionId: Id,
  text: z.string(),
  isCorrect: z.boolean(),
  count: NonNeg,
  /* תגית טעות נפוצה (misconception) של המסיח, אם יש */
  errorTag: TagRefSchema.nullable(),
  /* מי בחר — שמות (המורה ממילא רואה את תלמידי כיתתה) */
  students: z.array(z.object({ id: Id, name: z.string() })),
})
export type OptionCount = z.infer<typeof OptionCountSchema>

export const ItemResultSchema = z.object({
  itemIndex: NonNeg,
  prompt: z.string(),
  attempted: NonNeg,
  solved: NonNeg,
  /* התפלגות התשובות — לשאלות בחירה/נכון-לא נכון/מבחן סיכום; null לשאר הסוגים או כשאין פירוט */
  options: z.array(OptionCountSchema).nullable(),
  commonError: z.object({ title: z.string(), count: NonNeg, optionText: z.string() }).nullable(),
})
export type ItemResult = z.infer<typeof ItemResultSchema>

export const ChallengeResultSchema = z.object({
  sceneId: Id,
  order: z.number().int().min(1),
  title: z.string(),
  type: z.string(),
  typeLabel: z.string(),
  /* "X מתוך Y הצליחו": Y = מי שניסה את האתגר */
  attempted: NonNeg,
  solved: NonNeg,
  gaveUp: NonNeg,
  gaveUpStudents: z.array(z.object({ id: Id, name: z.string() })),
  items: z.array(ItemResultSchema),
  commonError: z.object({ title: z.string(), count: NonNeg, optionText: z.string() }).nullable(),
})
export type ChallengeResult = z.infer<typeof ChallengeResultSchema>

export const CommonErrorRowSchema = z.object({
  id: Id,
  title: z.string(),
  description: z.string(),
  /* "X מתוך Y": X בחרו בטעות הזו, Y ניסו פריט שבו היא אפשרית */
  studentsCount: NonNeg,
  studentsExposed: NonNeg,
  linkedQuest: z.object({ questId: Id, title: z.string() }).nullable(),
})
export type CommonErrorRow = z.infer<typeof CommonErrorRowSchema>

/* ── יעדי למידה (שליטה ביעד) — רק להדמיות שנוצרו עם יעדים (game_data.objectives + objectiveId על האתגרים/שאלות המבחן).
   רמה: strong = "למדו", partial = "למדו חלקית", weak = "עדיין קשה", null = עוד אין נתונים. הספים ב-analyticsConfig.OBJECTIVE_BANDS. ── */
export const ObjectiveLevelSchema = z.enum(['strong', 'partial', 'weak'])
export type ObjectiveLevel = z.infer<typeof ObjectiveLevelSchema>

export const ObjectiveResultSchema = z.object({
  id: Id,
  text: z.string().min(1),
  /* "X מתוך Y הצליחו" בתלמידים: Y = מי שניסה לפחות אתגר או שאלה אחד/ת ביעד; X = מי שהצליח/ה בלפחות OBJECTIVE_BANDS.partial מהם */
  attempted: NonNeg,
  solved: NonNeg,
  level: ObjectiveLevelSchema.nullable(),
  /* המילה לתצוגה ("למדו" / "למדו חלקית" / "עדיין קשה" / "אין עדיין נתונים") — מ-findingsNarrative */
  levelText: z.string().min(1),
  /* מי שהצליח בפחות מ-OBJECTIVE_BANDS.partial מהאתגרים והשאלות של היעד (לפי א-ב) */
  weakStudents: z.array(z.object({ id: Id, name: z.string() })),
})
export type ObjectiveResult = z.infer<typeof ObjectiveResultSchema>

export const ClassSubmissionViewSchema = z.object({
  head: SubmissionHeadSchema,
  /* משפט הסיכום (א) */
  summary: z.string().min(1),
  /* אם הפירוט לא קיים (נשלח לפני לכידת התשובות): התאריך שממנו הוא זמין, אחרת null */
  detailAvailableFrom: Iso.nullable(),
  hasAnswerDetail: z.boolean(),
  /* ב. סיימו / באמצע / לא התחילו */
  roster: z.object({ completed: z.array(StudentChipSchema), inProgress: z.array(StudentChipSchema), notStarted: z.array(StudentChipSchema) }),
  /* ג. האתגרים לפי סדר ההדמיה */
  challenges: z.array(ChallengeResultSchema),
  /* ד. טעויות נפוצות — מוצג רק אם יש תגיות */
  commonErrors: z.array(CommonErrorRowSchema),
  /* ה. יעדי הלמידה — מערך ריק כשלהדמיה אין יעדים שאפשר למדוד (אין טאב) */
  objectives: z.array(ObjectiveResultSchema),
  /* הדמיית חזרה (קיימת): כמה תחומים חלשים; 0 = לא מציגים את ההצעה */
  review: z.object({ weakCount: NonNeg }),
  /* "איך חישבנו?" — שורות הסבר (הכלל לתשומת לב, מה נחשב הצלחה) */
  howWeCalculated: z.array(z.string()),
})
export type ClassSubmissionView = z.infer<typeof ClassSubmissionViewSchema>

/* ── 2.2 מצב "לפי תלמיד" ── */
export const OutcomeSchema = z.enum(['correct', 'wrong', 'gave_up', 'timeout', 'closed', 'not_reached'])
export type Outcome = z.infer<typeof OutcomeSchema>

export const StudentItemSchema = z.object({
  itemIndex: NonNeg,
  prompt: z.string(),
  /* מה ענה / מה התשובה הנכונה — null כשאין פירוט (הדמיה ישנה) או לסוגים שאין להם "תשובה" בודדת */
  answerText: z.string().nullable(),
  correctText: z.string().nullable(),
  isCorrect: z.boolean().nullable(),
  errorTag: TagRefSchema.nullable(),
  attempts: NonNeg,
  seconds: NonNeg.nullable(),
})
export type StudentItem = z.infer<typeof StudentItemSchema>

export const StudentChallengeSchema = z.object({
  sceneId: Id, order: z.number().int().min(1), title: z.string(), type: z.string(), typeLabel: z.string(),
  outcome: OutcomeSchema,
  attempts: NonNeg,
  seconds: NonNeg.nullable(),
  items: z.array(StudentItemSchema),
})
export type StudentChallenge = z.infer<typeof StudentChallengeSchema>

/* עובדת קריאה לשקף: "בשקף 3 (110 מילים) עבר אחרי 4 שניות" — עובדה, לא פרשנות */
export const SlideFactSchema = z.object({ order: z.number().int().min(1), title: z.string(), words: NonNeg.nullable(), seconds: NonNeg.nullable() })
export type SlideFact = z.infer<typeof SlideFactSchema>

export const StudentSubmissionViewSchema = z.object({
  head: SubmissionHeadSchema,
  student: StudentChipSchema,
  /* רשימת השמות בצד, לפי א-ב */
  roster: z.array(StudentChipSchema),
  prevId: Id.nullable(),
  nextId: Id.nullable(),
  summary: z.string().min(1),
  detailAvailableFrom: Iso.nullable(),
  hasAnswerDetail: z.boolean(),
  challenges: z.array(StudentChallengeSchema),
  slides: z.array(SlideFactSchema),
  howWeCalculated: z.array(z.string()),
})
export type StudentSubmissionView = z.infer<typeof StudentSubmissionViewSchema>

/* ── מעטפת + רישום נקודות הקצה ── */
export const ResultsEnvelope = <T extends z.ZodTypeAny>(data: T) => z.object({ data })

export const RESULTS_EP = {
  list: { path: '/api/results/submissions', response: ResultsEnvelope(SubmissionListSchema) },
  classView: { path: '/api/results/submission/:id', response: ResultsEnvelope(ClassSubmissionViewSchema) },
  studentView: { path: '/api/results/submission/:id/student/:studentId', response: ResultsEnvelope(StudentSubmissionViewSchema) },
} as const
export type ResultsEndpointName = keyof typeof RESULTS_EP
