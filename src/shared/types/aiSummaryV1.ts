/* ──────────────────────────────────────────────────────────────────────────
   aiSummaryV1 — החוזה של "סיכום מילולי" של ד״ר הולו (שירות server/src/lib/aiSummary, נתיב /api/ai-summary).
   · השירות אינו תלוי בספק: הוא צורך חוזים קיימים (analyticsV2: StudentOverview/ClassOverview/ClassSubjectView, resultsV1: ClassSubmissionView).
   · ה-AI מנסח עובדות סגורות שחושבו מראש (חוק 1) ואינו מקבל שם תלמיד/מזהה/שם מורה (חוק 12).
   · כל טקסט בשפה טבעית (label, basisText, caveat, howWritten, privacyNote, הודעות מצב) נבנה ב-findingsNarrative.ts (AI_SUMMARY_TEXT).
   ────────────────────────────────────────────────────────────────────────── */
import { z } from 'zod'
import { isSubjectCode } from '../lib/subjects'

const Iso = z.string().min(10)

export const SUMMARY_SCOPES = ['student', 'class', 'class_subject', 'submission'] as const
export type SummaryScope = (typeof SUMMARY_SCOPES)[number]
export const SummaryScopeSchema = z.enum(SUMMARY_SCOPES)

/* מה מסכמים: student=מזהה תלמיד · class=מזהה כיתה (מחנך בלבד) · class_subject=כיתה+מקצוע · submission=מזהה שליחה (assignmentId) */
export const SummaryTargetSchema = z
  .object({
    scope: SummaryScopeSchema,
    id: z.string().min(1).max(64),
    subject: z.string().refine(isSubjectCode, 'קוד מקצוע לא מוכר').optional(),
  })
  .refine((t) => (t.scope === 'class_subject') === (t.subject !== undefined), 'subject נדרש רק ב-class_subject')
export type SummaryTarget = z.infer<typeof SummaryTargetSchema>

/* סיכום שנכתב. id=null: לא נשמר (הדגמה / טרם הורצה המיגרציה). */
export const AiSummarySchema = z.object({
  id: z.string().nullable(),
  target: SummaryTargetSchema,
  /* 'ai' = נכתב ע"י ד״ר הולו ועבר את שומר הפלט · 'template' = תבנית דטרמיניסטית מהעובדות (הדגמה, או כשל/הפרה בבדיקה) */
  writtenBy: z.enum(['ai', 'template']),
  /* "נכתב על ידי ד״ר הולו (בינה מלאכותית)" / "סיכום אוטומטי מהנתונים" / "סיכום הדגמה" */
  label: z.string().min(1),
  /* באנר מעל הטקסט כשלא נכתב ב-AI ("זה סיכום אוטומטי מהנתונים, לא נכתב בבינה מלאכותית") או null */
  notice: z.string().nullable(),
  /* הטקסט המוצג = עריכת המורה אם יש, אחרת הטקסט שנכתב. פסקאות העריכה חופשיות — לכן מקסימום רחב יותר מ-generatedParagraphs */
  paragraphs: z.array(z.string().min(1)).min(1).max(12),
  generatedParagraphs: z.array(z.string().min(1)).min(1).max(4),
  edited: z.boolean(),
  /* "מבוסס על 14 הדמיות" / "מבוסס על 22 תלמידים" — היחידה לפי היקף */
  basisText: z.string().min(1),
  generatedAt: Iso,
  updatedAt: Iso,
  /* CAVEAT_TREND — קבוע, לא מה-AI */
  caveat: z.string().min(1),
  /* שורות מאחורי "איך נכתב הסיכום?" */
  howWritten: z.array(z.string()),
})
export type AiSummary = z.infer<typeof AiSummarySchema>

export const SummaryEligibilitySchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), text: z.string().min(1), whatNext: z.string().min(1) }),
])
export type SummaryEligibility = z.infer<typeof SummaryEligibilitySchema>

export const SummaryStateSchema = z.object({
  eligibility: SummaryEligibilitySchema,
  summary: AiSummarySchema.nullable(),
  /* true = תבנית דטרמיניסטית של חשבון הדגמה, לא נשמרת */
  demo: z.boolean(),
  /* false = הסיכום מוצג אך לא נשמר (הדגמה / לפני המיגרציה); persistenceNote מסביר במילים */
  persisted: z.boolean(),
  persistenceNote: z.string().nullable(),
  /* "שם התלמיד/ה לא נשלח לבינה המלאכותית" */
  privacyNote: z.string().min(1),
})
export type SummaryState = z.infer<typeof SummaryStateSchema>

export const GenerateSummaryRequestSchema = SummaryTargetSchema.and(z.object({ regenerate: z.boolean().optional() }))
export type GenerateSummaryRequest = z.infer<typeof GenerateSummaryRequestSchema>

/* editedText=null: חזרה לטקסט שנכתב במקור */
export const EditSummaryRequestSchema = z.object({ editedText: z.string().max(6000).nullable() })
export type EditSummaryRequest = z.infer<typeof EditSummaryRequestSchema>

export const AiEnvelope = <T extends z.ZodTypeAny>(data: T) => z.object({ dataState: z.enum(['ok', 'insufficient']), data })
export type AiEnvelopeOf<T> = { dataState: 'ok' | 'insufficient'; data: T }

export const AI_SUMMARY_EP = {
  get: { method: 'GET', path: '/api/ai-summary', response: AiEnvelope(SummaryStateSchema) },
  create: { method: 'POST', path: '/api/ai-summary', request: GenerateSummaryRequestSchema, response: AiEnvelope(SummaryStateSchema) },
  edit: { method: 'PATCH', path: '/api/ai-summary/:summaryId', request: EditSummaryRequestSchema, response: AiEnvelope(SummaryStateSchema) },
} as const
export type AiSummaryEndpointName = keyof typeof AI_SUMMARY_EP
