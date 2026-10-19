/* ──────────────────────────────────────────────────────────────────────────
   analyticsV2 — החוזה של האנליטיקה החדשה (שלב D). **חוזה אחד, שני ספקים**:
   · ספק הדגמה (server/src/lib/analyticsV2/demoProvider.ts) מממש אותו כעת.
   · ספק אמיתי (realProvider.ts) ימומש בשלבים 5–7; בינתיים מחזיר "אין עדיין מספיק נתונים".
   המסכים (src/features/analyticsV2) צורכים רק את הצורות האלה ואינם יודעים מי הספק.

   כללים שהחוזה אוכף במבנה (לא רק בקוד המסכים):
   · כל טקסט בשפה טבעית (`text`, caveats, המלצות, תדריך) מגיע ממודול התבניות findingsNarrative.ts.
   · ממצא מדווח (`reported`) חייב p מתוקן BH, גודל אפקט ו-N מעל ספי analyticsConfig;
     אחרת הוא `insufficient` ואין בו ראיות — רק הסיבה ו-N.
   · בעדשת מנהל: שום שדה עם שם/מזהה תלמיד (AdminOverview לא כולל students בכלל).
   ────────────────────────────────────────────────────────────────────────── */
import { z } from 'zod'
import { FINDING_KINDS, CONTENT_VECTOR_KINDS, BEHAVIOR_VECTOR_KINDS } from '../lib/analyticsConfig'
import { isSubjectCode } from '../lib/subjects'

/* ── בסיס ── */
export const LENSES = ['homeroom', 'subject_teacher', 'admin'] as const
export const LensSchema = z.enum(LENSES)
export type Lens = z.infer<typeof LensSchema>

const Iso = z.string().min(10)
const SubjectCodeSchema = z.string().refine(isSubjectCode, 'קוד מקצוע לא מוכר')
const Unit = z.number().min(0).max(1)

export const SubjectRefSchema = z.object({ code: SubjectCodeSchema, nameHe: z.string().min(1) })
export type SubjectRef = z.infer<typeof SubjectRefSchema>

/* מעטפת אחידה: dataState='insufficient' כשהספק אינו מחזיק נתונים (הספק האמיתי בשלב זה) */
export const DataStateSchema = z.enum(['ok', 'insufficient'])
const envelope = <T extends z.ZodTypeAny>(data: T) => z.object({ dataState: DataStateSchema, data })

/* ── ממצאים ── */
export const FindingKindSchema = z.enum(FINDING_KINDS)
const FindingScopeSchema = z.enum(['student', 'class', 'grade', 'school'])
const ToneSchema = z.enum(['positive', 'attention', 'neutral'])
const InsufficientReasonSchema = z.enum(['n_below_min', 'not_significant', 'effect_below_min'])
export type InsufficientReason = z.infer<typeof InsufficientReasonSchema>

export const EvidenceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('level_trend'),
    direction: z.enum(['up', 'down']),
    fromLevel: z.number(), toLevel: z.number(), deltaLevels: z.number(),
    changeDate: Iso,
    sessionsBefore: z.number().int(), sessionsAfter: z.number().int(),
    successBefore: Unit, successAfter: Unit,
  }),
  z.object({
    kind: z.literal('class_concept_improvement'),
    conceptKey: z.string(), conceptTitle: z.string(),
    sinceDate: Iso, term: z.enum(['half_a', 'half_b']),
    meanDelta: z.number(), studentsCount: z.number().int(), improvedCount: z.number().int(),
  }),
  z.object({
    kind: z.literal('memory_random_pattern'),
    games: z.number().int(), turns: z.number().int(),
    observedRate: Unit, attentiveRate: Unit, randomRate: Unit,
    /* סבירות פוסטריורית ל"אקראי" מול "קשוב" (שתי השערות, פריור שווה) — לא אבחנה */
    randomLikelihood: Unit,
  }),
  z.object({
    kind: z.literal('position_bias'),
    items: z.number().int(), firstChoices: z.number().int(),
    observedShare: Unit, expectedShare: Unit,
  }),
  z.object({
    kind: z.literal('reading_skip'),
    scenes: z.number().int(), msPerWord: z.number(), classMedianMsPerWord: z.number(), ratio: z.number(),
  }),
  z.object({
    kind: z.literal('cross_subject_dip'),
    startDate: Iso,
    subjects: z.array(z.object({ code: SubjectCodeSchema, deltaLevels: z.number() })).min(2),
  }),
])
export type Evidence = z.infer<typeof EvidenceSchema>

const FindingBase = {
  id: z.string().min(1),
  kind: FindingKindSchema,
  scope: FindingScopeSchema,
  entityId: z.string().min(1),
  subjectCode: SubjectCodeSchema.nullable(), /* null = רב-מקצועי */
  tone: ToneSchema,
  n: z.number().int().nonnegative(),
  minN: z.number().int().positive(),
  window: z.object({ start: Iso, end: Iso }),
  text: z.string().min(1),
}

export const FindingSchema = z.discriminatedUnion('status', [
  z.object({
    ...FindingBase,
    status: z.literal('reported'),
    pAdjusted: z.number().min(0).max(1),
    effectSize: z.number(),
    evidence: EvidenceSchema,
  }).refine((f) => f.evidence.kind === f.kind, 'evidence.kind חייב להתאים ל-kind'),
  z.object({
    ...FindingBase,
    status: z.literal('insufficient'),
    reason: InsufficientReasonSchema,
    pAdjusted: z.number().min(0).max(1).nullable(),
    effectSize: z.number().nullable(),
    evidence: z.null(),
  }),
])
export type Finding = z.infer<typeof FindingSchema>

/* ── לוח מקצוע של תלמיד ── */
export const LevelPointSchema = z.object({ date: Iso, level: z.number(), n: z.number().int().positive() })
export const AgeNormSchema = z.object({
  gradeLabel: z.string(), center: z.number(), low: z.number(), high: z.number(),
})
export const ContentVectorSchema = z.object({
  key: z.enum(CONTENT_VECTOR_KINDS.map((v) => v.key) as [string, ...string[]]),
  level: z.number().nullable(), deltaLevels: z.number().nullable(),
  n: z.number().int().nonnegative(),
  status: z.enum(['reported', 'insufficient']),
})
export const BehaviorVectorSchema = z.object({
  key: z.enum(BEHAVIOR_VECTOR_KINDS.map((v) => v.key) as [string, ...string[]]),
  value: Unit.nullable(), classMedian: Unit.nullable(),
  n: z.number().int().nonnegative(),
  status: z.enum(['reported', 'insufficient']),
})

export const SubjectPanelSchema = z.discriminatedUnion('access', [
  z.object({
    access: z.literal('visible'),
    subject: SubjectRefSchema,
    currentLevel: z.number().nullable(),
    levelSeries: z.array(LevelPointSchema),
    ageNorm: AgeNormSchema,
    positionVsNorm: z.enum(['above', 'within', 'below']).nullable(),
    sessionsCount: z.number().int().nonnegative(),
    contentVectors: z.array(ContentVectorSchema),
    behaviorVectors: z.array(BehaviorVectorSchema),
    findings: z.array(FindingSchema),
  }),
  /* מקצוע שהצופה אינו רשאי לראות — שם בלבד, בלי נתונים */
  z.object({ access: z.literal('greyed'), subject: SubjectRefSchema }),
])
export type SubjectPanel = z.infer<typeof SubjectPanelSchema>

export const StudentRefSchema = z.object({
  id: z.string().min(1), displayName: z.string().min(1),
  classId: z.string(), className: z.string(), grade: z.number().int(), gradeLabel: z.string(),
})

export const CaveatsSchema = z.object({
  ageNorm: z.string().min(1),
  crossSubject: z.string().min(1),
  trend: z.string().min(1),
})

export const StudentOverviewSchema = z.object({
  student: StudentRefSchema,
  access: z.enum(['full', 'subject_only']),
  panels: z.array(SubjectPanelSchema),
  /* התרעות מוקדמות חוצות-מקצועות — למחנך בלבד */
  crossSubject: z.array(FindingSchema),
  caveats: CaveatsSchema,
})
export type StudentOverview = z.infer<typeof StudentOverviewSchema>

/* ── רשימות ── */
export const RosterClassSchema = z.object({
  id: z.string(), name: z.string(), gradeLabel: z.string(), grade: z.number().int(),
  studentCount: z.number().int(),
  subjects: z.array(SubjectRefSchema),
})
export const RosterStudentSchema = z.object({
  id: z.string(), displayName: z.string(), classId: z.string(),
  /* ספירת ממצאים מדווחים בהיקף שהצופה רשאי לראות */
  attention: z.number().int(), positive: z.number().int(), earlyWarning: z.boolean(),
})
export const RosterSchema = z.object({
  classes: z.array(RosterClassSchema),
  /* בעדשת מנהל: תמיד מערך ריק */
  students: z.array(RosterStudentSchema),
})
export type Roster = z.infer<typeof RosterSchema>

/* ── תפיסות שגויות והמלצות (מורה מקצועי / מנהל) ── */
export const CurriculumGoalSchema = z.object({
  title: z.string(), gradeFrom: z.number().int(), gradeTo: z.number().int(),
  /* 'sample' = "מיפוי לדוגמה": בלי מספרי תקנים וציטוטים רשמיים */
  mappingStatus: z.enum(['sample', 'official']),
})
const LinkedQuestSchema = z.object({ questId: z.string(), title: z.string() })

export const MisconceptionRowSchema = z.object({
  id: z.string(), code: z.string(), titleHe: z.string(), descriptionHe: z.string(),
  conceptKey: z.string(), conceptTitle: z.string(),
  subjectCode: SubjectCodeSchema,
  curriculumGoal: CurriculumGoalSchema.nullable(),
  status: z.enum(['reported', 'insufficient']),
  studentsShowing: z.number().int().nonnegative(),
  studentsExposed: z.number().int().nonnegative(),
  sharePct: z.number().int().min(0).max(100).nullable(),
  /* בעדשת מנהל: מערך ריק תמיד */
  students: z.array(z.object({ id: z.string(), displayName: z.string(), hits: z.number().int(), exposures: z.number().int() })),
  linkedQuest: LinkedQuestSchema.nullable(),
})
export type MisconceptionRow = z.infer<typeof MisconceptionRowSchema>

export const RecommendationSchema = z.object({
  rank: z.number().int().min(1).max(3),
  misconceptionId: z.string(),
  text: z.string().min(1),
  linkedQuest: LinkedQuestSchema.nullable(),
})

export const ClassSubjectViewSchema = z.object({
  class: z.object({ id: z.string(), name: z.string(), gradeLabel: z.string(), studentCount: z.number().int() }),
  subject: SubjectRefSchema,
  classLevel: z.object({ mean: z.number().nullable(), ageNorm: AgeNormSchema }),
  misconceptions: z.array(MisconceptionRowSchema),
  recommendations: z.array(RecommendationSchema).max(3),
  classFindings: z.array(FindingSchema),
  studentFindings: z.array(z.object({ studentId: z.string(), studentName: z.string(), finding: FindingSchema })),
  students: z.array(z.object({ id: z.string(), displayName: z.string(), level: z.number().nullable(), positionVsNorm: z.enum(['above', 'within', 'below']).nullable() })),
  /* מקצועות אחרים של תלמידי הכיתה — אפור, לא לחיץ */
  otherSubjects: z.array(SubjectRefSchema),
  caveats: CaveatsSchema,
})
export type ClassSubjectView = z.infer<typeof ClassSubjectViewSchema>

/* ── מנהל ── */
export const AdminCellSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('shown'),
    grade: z.number().int(), subject: SubjectRefSchema,
    studentCount: z.number().int().min(5),
    avgLevel: z.number(), normCenter: z.number(), deltaVsNorm: z.number(),
    /* שינוי ברמה הממוצעת לאורך חלון הצפייה */
    trendDelta: z.number(),
  }),
  /* פחות מ-5 תלמידים: לא מציגים אפילו את הכמות */
  z.object({ status: z.literal('hidden'), grade: z.number().int(), subject: SubjectRefSchema, reason: z.literal('small_cell') }),
])
export type AdminCell = z.infer<typeof AdminCellSchema>

export const AdminMisconceptionSchema = z.object({
  id: z.string(), titleHe: z.string(), text: z.string().min(1), subject: SubjectRefSchema, grade: z.number().int(),
  gradeLabel: z.string(),
  sharePct: z.number().int().min(0).max(100),
  studentsExposed: z.number().int().min(5), /* מכנה — לעולם ≥ סף התא */
  curriculumGoal: CurriculumGoalSchema.nullable(),
})

export const AdminOverviewSchema = z.object({
  school: z.object({ id: z.string(), name: z.string() }),
  grades: z.array(z.object({ grade: z.number().int(), gradeLabel: z.string(), classCount: z.number().int(), studentCount: z.number().int() })),
  cells: z.array(AdminCellSchema),
  progress: z.array(z.object({
    grade: z.number().int(), subject: SubjectRefSchema,
    series: z.array(z.object({ date: Iso, avgLevel: z.number(), n: z.number().int().min(5) })),
  })),
  /* השוואת שכבות לאותו מקצוע + מקצועות באותה שכבה — תמיד עם הסתייגות */
  comparisons: z.array(z.object({
    subject: SubjectRefSchema,
    rows: z.array(z.object({ grade: z.number().int(), gradeLabel: z.string(), deltaVsNorm: z.number() })),
  })),
  misconceptions: z.array(AdminMisconceptionSchema),
  hiddenCells: z.number().int().nonnegative(),
  caveats: CaveatsSchema,
})
export type AdminOverview = z.infer<typeof AdminOverviewSchema>

/* ── תדריך (מסמך להדפסה) ── */
export const BriefingItemSchema = z.object({
  text: z.string().min(1),
  subjectCode: SubjectCodeSchema.nullable(),
  /* שורות ראיה קצרות (ספירות / חלונות זמן) */
  evidence: z.array(z.string()),
})
export const BriefingSchema = z.object({
  scope: z.enum(['student', 'class']),
  entityId: z.string(),
  title: z.string(), subtitle: z.string(),
  generatedAt: Iso,
  sections: z.array(z.object({
    id: z.enum(['strengths', 'difficulties', 'trend', 'recommendations', 'unknowns', 'evidence_basis']),
    title: z.string(),
    items: z.array(BriefingItemSchema),
  })),
  caveats: CaveatsSchema,
})
export type Briefing = z.infer<typeof BriefingSchema>

/* ── משוב לתלמיד/ה ── */
export const StudentFeedbackSchema = z.object({
  firstName: z.string().min(1),
  headline: z.string().min(1),
  items: z.array(z.object({
    subject: SubjectRefSchema,
    kind: z.enum(['growth', 'streak', 'next_step']),
    text: z.string().min(1),
  })),
})
export type StudentFeedback = z.infer<typeof StudentFeedbackSchema>

/* ── תצורה (איזו עדשה, אילו עדשות נבחרות) ── */
export const ConfigSchema = z.object({
  enabled: z.boolean(),
  lens: LensSchema.nullable(),
  /* מורה אורח בלבד: אילו עדשות ניתן להחליף */
  availableLenses: z.array(LensSchema),
  /* מורה מקצועי: מקצועות שאפשר לבחור כ"דמות" (בדמו) או המקצועות שלו */
  subjects: z.array(SubjectRefSchema),
  classes: z.array(z.object({ id: z.string(), name: z.string() })),
  /* סימון נתונים לא-אמיתיים לתצוגה ("נתוני הדגמה") — טקסט מוכן, או null */
  dataNotice: z.string().nullable(),
  curriculumNotice: z.string().nullable(), /* "מיפוי לדוגמה" */
  caveats: CaveatsSchema,
})
export type AnalyticsConfig = z.infer<typeof ConfigSchema>

/* ── מעטפות + רישום נקודות הקצה ── */
export const EP = {
  config: { path: '/api/analytics-v2/config', response: envelope(ConfigSchema) },
  roster: { path: '/api/analytics-v2/roster', response: envelope(RosterSchema) },
  student: { path: '/api/analytics-v2/student/:id', response: envelope(StudentOverviewSchema) },
  feedback: { path: '/api/analytics-v2/student/:id/feedback', response: envelope(StudentFeedbackSchema) },
  classSubject: { path: '/api/analytics-v2/class/:classId/subject/:subject', response: envelope(ClassSubjectViewSchema) },
  admin: { path: '/api/analytics-v2/admin/overview', response: envelope(AdminOverviewSchema) },
  briefing: { path: '/api/analytics-v2/briefing/:scope/:id', response: envelope(BriefingSchema) },
} as const
export type EndpointName = keyof typeof EP

export type Envelope<T> = { dataState: z.infer<typeof DataStateSchema>; data: T }

/* פרמטרי שאילתה משותפים: lens/subject/classId — נתמכים רק למורה אורח (בורר העדשה) */
export const QuerySchema = z.object({
  lens: LensSchema.optional(),
  subject: SubjectCodeSchema.optional(),
  classId: z.string().optional(),
})
export type V2Query = z.infer<typeof QuerySchema>
