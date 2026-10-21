/* ──────────────────────────────────────────────────────────────────────────
   קריאות לחוזה aiSummaryV1 (/api/ai-summary). הפאנל לא יודע מי הספק מאחורי הנתונים — רק את הצורה (src/shared/types/aiSummaryV1.ts).
   · apiFetch מצרף את הטוקן; קוד הסטטוס נשמר (SummaryError) כדי שההודעה למורה תהיה עברית פשוטה ולא טקסט טכני.
   · מורה אורח: lens ו-subject (בורר העדשה) עוברים ב-query גם ב-POST/PATCH — השרת גוזר את הצופה מהם. מורה אמיתי לא שולח כלום.
   · בפיתוח כל תגובה מאומתת מול סכמת ה-zod (נטענת דינמית, כך שהיא לא נכנסת ל-bundle של הפרודקשן).
   ────────────────────────────────────────────────────────────────────────── */
import { apiFetch } from '../../shared/lib/api'
import type { AiEnvelopeOf, SummaryState, SummaryTarget } from '../../shared/types/aiSummaryV1'

export type SummaryParams = Record<string, string | undefined>
export type SummaryEnvelope = AiEnvelopeOf<SummaryState>

export class SummaryError extends Error {
  /** קוד HTTP; 0 = אין חיבור לשרת */
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'SummaryError'
    this.status = status
  }
}

export const toSummaryError = (e: unknown): SummaryError => (e instanceof SummaryError ? e : new SummaryError(0, ''))

/** הפונקציות שהפאנל קורא להן. בבדיקות מחליפים אותן בתשובות קבועות (בלי רשת) */
export interface SummaryApi {
  get(target: SummaryTarget, params: SummaryParams): Promise<SummaryEnvelope>
  create(target: SummaryTarget, params: SummaryParams, regenerate: boolean): Promise<SummaryEnvelope>
  edit(summaryId: string, editedText: string | null, params: SummaryParams): Promise<SummaryEnvelope>
}

function qs(entries: Record<string, string | undefined>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(entries)) if (v) p.set(k, v)
  const s = p.toString()
  return s ? `?${s}` : ''
}

async function request(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<SummaryEnvelope> {
  let res: Response
  try { res = await apiFetch(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) } catch { throw new SummaryError(0, '') }
  const json = (await res.json().catch(() => null)) as (SummaryEnvelope & { error?: string }) | null
  if (!res.ok) throw new SummaryError(res.status, json?.error ?? '')
  if (!json || json.data === undefined) throw new SummaryError(500, '')
  if (import.meta.env.DEV) {
    const { AI_SUMMARY_EP } = await import('../../shared/types/aiSummaryV1')
    const r = (method === 'GET' ? AI_SUMMARY_EP.get : method === 'POST' ? AI_SUMMARY_EP.create : AI_SUMMARY_EP.edit).response.safeParse(json)
    if (!r.success) console.error('[aiSummary] תגובה אינה עומדת בחוזה', method, r.error.issues.slice(0, 3))
  }
  return json
}

/* ביעד class_subject השדה subject הוא המקצוע המסוכם (ולא המקצוע של בורר העדשה); בשאר ההיקפים הוא נשאר כמו שהוא (בורר האורח) */
const targetQuery = (t: SummaryTarget, params: SummaryParams): Record<string, string | undefined> =>
  ({ ...params, scope: t.scope, id: t.id, ...(t.scope === 'class_subject' && t.subject ? { subject: t.subject } : {}) })

export const summaryApi: SummaryApi = {
  get: (target, params) => request('GET', `/api/ai-summary${qs(targetQuery(target, params))}`),
  create: (target, params, regenerate) =>
    request('POST', `/api/ai-summary${qs(params)}`, { scope: target.scope, id: target.id, ...(target.subject ? { subject: target.subject } : {}), ...(regenerate ? { regenerate: true } : {}) }),
  edit: (summaryId, editedText, params) => request('PATCH', `/api/ai-summary/${encodeURIComponent(summaryId)}${qs(params)}`, { editedText }),
}
