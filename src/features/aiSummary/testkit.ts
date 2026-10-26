/* עזרי בדיקה לפאנל הסיכום המילולי: תשובות קבועות לפי החוזה (aiSummaryV1), בלי רשת. */
import { AI_SUMMARY_TEXT, CAVEAT_TREND, aiSummaryHowWritten, aiSummaryPrivacyNote } from '../../shared/lib/findingsNarrative'
import type { AiSummary, SummaryScope, SummaryState } from '../../shared/types/aiSummaryV1'

export const PARAS = [
  'נראה שבמתמטיקה הרמה הנוכחית יציבה, על סמך 14 שיעורים.',
  'הנתונים מראים שבעברית המגמה האחרונה בירידה קלה. אפשר לבדוק שוב בעוד כמה שבועות.',
]

export function aiSummary(over: Partial<AiSummary> = {}, scope: SummaryScope = 'student'): AiSummary {
  const writtenBy = over.writtenBy ?? 'ai'
  return {
    id: 'sum-1',
    target: { scope, id: 'st-1' },
    writtenBy,
    label: writtenBy === 'ai' ? AI_SUMMARY_TEXT.label.ai : AI_SUMMARY_TEXT.label.template,
    notice: writtenBy === 'ai' ? null : AI_SUMMARY_TEXT.notice.template,
    paragraphs: PARAS,
    generatedParagraphs: PARAS,
    edited: false,
    basisText: 'מבוסס על 14 שיעורים',
    generatedAt: '2026-10-20T08:00:00.000Z',
    updatedAt: '2026-10-20T08:00:00.000Z',
    caveat: CAVEAT_TREND,
    howWritten: aiSummaryHowWritten({ scope, writtenBy, demo: false, model: writtenBy === 'ai' ? 'claude-sonnet-4-6' : null, promptVersion: writtenBy === 'ai' ? 'ai-sum-v2' : null }),
    ...over,
  }
}

export function summaryState(over: Partial<SummaryState> = {}, scope: SummaryScope = 'student'): SummaryState {
  return {
    eligibility: { ok: true }, summary: aiSummary({}, scope), demo: false, persisted: true, persistenceNote: null, privacyNote: aiSummaryPrivacyNote(scope), ...over,
  }
}

export const NOT_ENOUGH = { ok: false as const, text: 'עוד אין מספיק נתונים לסיכום על התלמיד/ה.', whatNext: 'הסיכום יהיה זמין אחרי 4 שיעורים לפחות.' }
