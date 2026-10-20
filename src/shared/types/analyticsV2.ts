/* ──────────────────────────────────────────────────────────────────────────
   analyticsV2 — החוזה של האנליטיקה החדשה (שלב D). **חוזה אחד, שני ספקים**:
   · ספק הדגמה (server/src/lib/analyticsV2/demoProvider.ts) מממש אותו כעת.
   · ספק אמיתי (realProvider.ts) ימומש בשלבים 5–7; בינתיים מחזיר "אין עדיין מספיק נתונים".
   המסכים (src/features/analyticsV2) צורכים רק את הצורות האלה ואינם יודעים מי הספק.

   כללים שהחוזה אוכף במבנה (לא רק בקוד המסכים):
   · כל טקסט בשפה טבעית (`text`, caveats, המלצות, תדריך) מגיע ממודול התבניות findingsNarrative.ts.
   · ממצא מדווח (`reported`) חייב p מתוקן BH, גודל אפקט ו-N מעל ספי analyticsConfig;
     אחרת הוא `insufficient` ואין בו ראיות — רק הסיבה ו-N.
   · בעדשת מנהל: שום שדה עם שם/מזהה תלמיד (AdminOverview לא כולל students בכלל; גם /entry ריק).
   · (שלב UX) כל משפט שמוצג למשתמש הוא מחרוזת מוכנה מ-findingsNarrative בעברית פשוטה: הנתונים
     הסטטיסטיים (pAdjusted / effectSize / evidence) נשארים בחוזה רק ל"איך חישבנו?" ולא מוצגים כטקסט.
   · כל מספר שמוצג כספירה ניתן להצגה כ"X מתוך Y" (studentsShowing/studentsExposed, hits/exposures, countText).
   ────────────────────────────────────────────────────────────────────────── */
import { z } from 'zod'
import { FINDING_KINDS, CONTENT_VECTOR_KINDS, BEHAVIOR_VECTOR_KINDS, ENTRY_MAX_ALERTS, POSITIONS, SUMMARY_RECENT_MAX, TRENDS } from '../lib/analyticsConfig'
import { isSubjectCode } from '../lib/subjects'

/* ── בסיס ── */
export const LENSES = ['homeroom', 'subject_teacher', 'admin'] as const
export const LensSchema = z.enum(LENSES)
export type Lens = z.infer<typeof LensSchema>

const Iso = z.string().min(10)
const SubjectCodeSchema = z.string().refine(isSubjectCode, 'קוד מקצוע לא מוכר')
const Unit = z.number().min(0).max(1)

/* מגמה (improving/steady/declining/insufficient) ומיקום מול הטווח המיועד לשכבה (above/within/below).
   בממשק תמיד מילים (trendText / positionText) — לא צבע בלבד. */
export const TrendSchema = z.enum(TRENDS)
export const PositionSchema = z.enum(POSITIONS)

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

/* תחומים (סוגי תוכן) חזקים / מאתגרים של תלמיד/ה במקצוע — שמות "תחום" בעברית פשוטה.
   חזק/מאתגר = הרמה בתחום רחוקה לפחות ברמה אחת מהרמה הכללית של המקצוע, והתחום מדווח (נאספו מספיק תשובות).
   הרמה הכללית = ממוצע 60 ימי הלימוד האחרונים (אותו חלון שבו נמדדים התחומים; בלי נתון — הרמה הנוכחית). */
export const AreasSchema = z.object({ strong: z.array(z.string()), challenging: z.array(z.string()) })
/* טעות נפוצה של התלמיד/ה עצמו/ה: hits מתוך exposures שאלות ("3 מתוך 4") */
export const StudentCommonErrorSchema = z.object({ id: z.string(), title: z.string(), hits: z.number().int(), exposures: z.number().int() })

export const SubjectPanelSchema = z.discriminatedUnion('access', [
  z.object({
    access: z.literal('visible'),
    subject: SubjectRefSchema,
    currentLevel: z.number().nullable(),
    levelSeries: z.array(LevelPointSchema),
    ageNorm: AgeNormSchema,
    positionVsNorm: PositionSchema.nullable(),
    /* "מעל / בתוך / מתחת לטווח המיועד לשכבה" או null כשאין רמה */
    positionText: z.string().nullable(),
    /* מגמה: ממוצע הרמה ב-60 ימי הלימוד האחרונים מול 90–150 לפני כן (סף חצי רמה) */
    trend: TrendSchema,
    trendText: z.string().min(1), /* משתפר/ת · יציב/ה · בירידה · אין עדיין מספיק נתונים */
    areas: AreasSchema,
    commonErrors: z.array(StudentCommonErrorSchema), /* ממוינות: הכי הרבה פגיעות קודם */
    sessionsCount: z.number().int().nonnegative(),
    contentVectors: z.array(ContentVectorSchema),
    behaviorVectors: z.array(BehaviorVectorSchema),
    /* כל הממצאים (מדווחים ו"אין עדיין מספיק נתונים"). המסך מציג רק את status='reported';
       כשאין אף אחד — שורה אחת פשוטה (EMPTY_TEXT.noFindings). */
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
  /* משפט סיכום אחד על התלמיד/ה — לפני הפירוט */
  summary: z.string().min(1),
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

/* ── מסך הכניסה "בחרו כיתה" (GET /entry) ──
   · attentionCount = מספר **התלמידים** (לא ממצאים) בכיתה שיש להם לפחות ממצא מדווח אחד בטון "תשומת לב"
     בהיקף שהצופה רשאי לראות: למחנך — כל המקצועות (כולל התרעה חוצת-מקצועות); למורה מקצועי — רק מקצועו.
   · alerts = עד ENTRY_MAX_ALERTS התרעות מוקדמות "דורש תשומת לב" (התלמיד/ה עם הממצא החשוב ביותר, אחד לתלמיד).
   · בעדשת מנהל: שני המערכים ריקים תמיד (אין כאן שם/מזהה תלמיד, וגם לא רשימת כיתות). */
export const EntryClassSchema = z.object({
  id: z.string(), name: z.string(), gradeLabel: z.string(),
  studentCount: z.number().int().nonnegative(),
  attentionCount: z.number().int().nonnegative(),
})
export const EntryAlertSchema = z.object({
  studentId: z.string().min(1), studentName: z.string().min(1),
  classId: z.string().min(1), className: z.string().min(1),
  /* משפט קצר אחד בעברית פשוטה (narrateShort) */
  text: z.string().min(1),
})
export const EntrySchema = z.object({
  classes: z.array(EntryClassSchema),
  alerts: z.array(EntryAlertSchema).max(ENTRY_MAX_ALERTS),
})
export type Entry = z.infer<typeof EntrySchema>

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
  /* "21 מתוך 50 תלמידים (42%)" — או, כשאין מספיק נתונים, משפט שאומר זאת */
  countText: z.string().min(1),
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

/* ── מקצוע בכיתה: ארבעה טאבים — סיכום | טעויות נפוצות | התקדמות | תלמידים ── */
/* טאב "סיכום": משפט אחד, מה קרה לאחרונה (עד 3 משפטים פשוטים), ו"מה ללמד" (= recommendations, אותו מערך).
   מורים רשאים לראות שמות תלמידים בשורות האלה (הצופה כאן הוא תמיד מורה; מנהל מקבל 403). */
export const ClassSubjectSummarySchema = z.object({
  headline: z.string().min(1),
  recent: z.array(z.string().min(1)).max(SUMMARY_RECENT_MAX),
  whatToTeach: z.array(RecommendationSchema).max(3),
})
/* טאב "התקדמות": ממוצע הרמה של הכיתה לכל חודש (n = כמה תלמידים תרמו נתון בחודש), רצועת הטווח המיועד,
   ואירועים מדווחים שמסומנים על ציר הזמן. */
export const ProgressEventSchema = z.object({ date: Iso, text: z.string().min(1), tone: ToneSchema })
export const ClassProgressSchema = z.object({
  series: z.array(LevelPointSchema),
  ageNorm: AgeNormSchema,
  events: z.array(ProgressEventSchema),
})
/* טאב "תלמידים": שורה לתלמיד/ה — רמה, מיקום, מגמה (במילים) */
export const ClassSubjectStudentSchema = z.object({
  id: z.string(), displayName: z.string(), level: z.number().nullable(),
  positionVsNorm: PositionSchema.nullable(),
  positionText: z.string().nullable(),
  trend: TrendSchema,
  trendText: z.string().min(1),
})

export const ClassSubjectViewSchema = z.object({
  class: z.object({ id: z.string(), name: z.string(), gradeLabel: z.string(), studentCount: z.number().int() }),
  subject: SubjectRefSchema,
  classLevel: z.object({ mean: z.number().nullable(), ageNorm: AgeNormSchema }),
  /* טאב "סיכום" */
  summary: ClassSubjectSummarySchema,
  /* טאב "טעויות נפוצות" — כל מספר ניתן להצגה כ"X מתוך Y" */
  misconceptions: z.array(MisconceptionRowSchema),
  /* "מה ללמד" — אותו מערך כמו summary.whatToTeach */
  recommendations: z.array(RecommendationSchema).max(3),
  /* טאב "התקדמות" */
  progress: ClassProgressSchema,
  classFindings: z.array(FindingSchema),
  studentFindings: z.array(z.object({ studentId: z.string(), studentName: z.string(), finding: FindingSchema })),
  /* טאב "תלמידים" */
  students: z.array(ClassSubjectStudentSchema),
  /* מגמת הכיתה כולה במקצוע (במילים) */
  trend: TrendSchema,
  trendText: z.string().min(1),
  /* מקצועות אחרים של תלמידי הכיתה — אפור, לא לחיץ */
  otherSubjects: z.array(SubjectRefSchema),
  caveats: CaveatsSchema,
})
export type ClassSubjectView = z.infer<typeof ClassSubjectViewSchema>

/* ── "סקירה" (טאב מחנך בלבד): GET /class/:classId/overview — שורה לכל מקצוע, נכנס במסך אחד.
   מורה מקצועי ומנהל מקבלים 403. */
export const ClassOverviewRowSchema = z.object({
  subject: SubjectRefSchema,
  /* ממוצע הרמה הנוכחית של תלמידי הכיתה במקצוע (או null) */
  level: z.number().nullable(),
  ageNorm: AgeNormSchema,
  positionVsNorm: PositionSchema.nullable(),
  positionText: z.string().nullable(),
  trend: TrendSchema,
  trendText: z.string().min(1),
  /* תחומים (תוויות בעברית פשוטה): הרמה בתחום מעל/מתחת לרמת המקצוע ברמה אחת לפחות, ומדווח בכיתה */
  strongAreas: z.array(z.string()),
  challengingAreas: z.array(z.string()),
  /* alerts = מספר התלמידים עם ממצא מדווח בטון "תשומת לב" במקצוע; alertTexts = עד 3 משפטים קצרים */
  alerts: z.number().int().nonnegative(),
  alertTexts: z.array(z.string().min(1)),
})
export const ClassOverviewSchema = z.object({
  class: z.object({ id: z.string(), name: z.string(), gradeLabel: z.string(), studentCount: z.number().int() }),
  /* משפט סיכום אחד על הכיתה */
  summary: z.string().min(1),
  rows: z.array(ClassOverviewRowSchema),
  caveats: CaveatsSchema,
})
export type ClassOverview = z.infer<typeof ClassOverviewSchema>

/* ── מנהל ── */
export const AdminCellSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('shown'),
    grade: z.number().int(), gradeLabel: z.string(), subject: SubjectRefSchema,
    studentCount: z.number().int().min(5),
    avgLevel: z.number(), normCenter: z.number(), deltaVsNorm: z.number(),
    /* שינוי ברמה הממוצעת לאורך חלון הצפייה */
    trendDelta: z.number(),
    /* במילים: מיקום מול הטווח המיועד לשכבה, ומגמה */
    position: PositionSchema,
    positionText: z.string().min(1),
    trend: TrendSchema,
    trendText: z.string().min(1),
  }),
  /* פחות מ-5 תלמידים: לא מציגים אפילו את הכמות */
  z.object({
    status: z.literal('hidden'), grade: z.number().int(), gradeLabel: z.string(), subject: SubjectRefSchema,
    reason: z.literal('small_cell'), text: z.string().min(1),
  }),
])
export type AdminCell = z.infer<typeof AdminCellSchema>

export const AdminMisconceptionSchema = z.object({
  id: z.string(), titleHe: z.string(), text: z.string().min(1), subject: SubjectRefSchema, grade: z.number().int(),
  gradeLabel: z.string(),
  sharePct: z.number().int().min(0).max(100),
  /* "21 מתוך 50": showing מתוך exposed */
  studentsShowing: z.number().int().nonnegative(),
  studentsExposed: z.number().int().min(5), /* מכנה — לעולם ≥ סף התא */
  countText: z.string().min(1),
  curriculumGoal: CurriculumGoalSchema.nullable(),
})

/* חיתוכי המנהל לטאבים: סקירה (highlights) | שכבות (gradeRows) | מקצועות (subjectRows) | טעויות נפוצות (misconceptions).
   אין כאן שם/מזהה תלמיד ואין מידע על מורים; תא קטן מ-5 מוסתר בכל החיתוכים. */
export const AdminGradeRowSchema = z.object({
  grade: z.number().int(), gradeLabel: z.string(), classCount: z.number().int(), studentCount: z.number().int(),
  summary: z.string().min(1),
  cells: z.array(AdminCellSchema), /* שורה לכל מקצוע בשכבה */
})
export const AdminSubjectRowSchema = z.object({
  subject: SubjectRefSchema,
  summary: z.string().min(1),
  cells: z.array(AdminCellSchema), /* שורה לכל שכבה */
})

export const AdminOverviewSchema = z.object({
  school: z.object({ id: z.string(), name: z.string() }),
  /* עד 3 משפטים פשוטים לטאב "סקירה" */
  highlights: z.array(z.string().min(1)).max(3),
  grades: z.array(z.object({ grade: z.number().int(), gradeLabel: z.string(), classCount: z.number().int(), studentCount: z.number().int() })),
  gradeRows: z.array(AdminGradeRowSchema),
  subjectRows: z.array(AdminSubjectRowSchema),
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
    /* how_we_calculated = "איך חישבנו?": המקום היחיד בתדריך שבו מופיעים מונחים/מספרים טכניים */
    id: z.enum(['strengths', 'difficulties', 'trend', 'recommendations', 'unknowns', 'evidence_basis', 'how_we_calculated']),
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
  entry: { path: '/api/analytics-v2/entry', response: envelope(EntrySchema) },
  student: { path: '/api/analytics-v2/student/:id', response: envelope(StudentOverviewSchema) },
  feedback: { path: '/api/analytics-v2/student/:id/feedback', response: envelope(StudentFeedbackSchema) },
  classOverview: { path: '/api/analytics-v2/class/:classId/overview', response: envelope(ClassOverviewSchema) },
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
