/* ──────────────────────────────────────────────────────────────────────────
   מכונת המצבים של פאנל הסיכום המילולי — טהורה (בלי DOM ובלי רשת), כדי שכל מצב ייבדק בלי לרנדר:
     loading → (loadError | ineligible | none | ready) · writing · editing · saving
   · reducer: המצב כולו + המפתח של היעד (key). תשובה שמגיעה למפתח אחר (עברנו תלמיד/כיתה באמצע) לא נכנסת.
   · derive: מה להציג — מצב, הפסקאות בפועל (עריכה מקומית קודמת לעריכת השרת), ומה מותר לעשות (עריכה / כתיבה מחדש / "נסו שוב עם ד״ר הולו").
   · run*: הזרימות האסינכרוניות (טעינה / כתיבה / שמירה) כפונקציות עצמאיות שמקבלות api ו-dispatch, ולכן נבדקות עם api מזויף.
   · הטקסטים באים מ-findingsNarrative (AI_SUMMARY_TEXT / AI_SUMMARY_PANEL_TEXT / ERR_*) — כאן אין משפט.
   ────────────────────────────────────────────────────────────────────────── */
import {
  ERR_SUMMARY_BAD_REQUEST, ERR_SUMMARY_EDIT_EXISTS, ERR_SUMMARY_EMPTY_EDIT, ERR_SUMMARY_LOAD, ERR_SUMMARY_SAVE, ERR_SUMMARY_WRITE,
  ERR_V2_FORBIDDEN, ERR_V2_NOT_FOUND, ERR_V2_RATE_LIMIT, ERR_V2_UNAUTHORIZED, ERR_V2_UNAVAILABLE,
} from '../../shared/lib/findingsNarrative'
import type { AiSummary, SummaryEligibility, SummaryScope, SummaryState, SummaryTarget } from '../../shared/types/aiSummaryV1'
import { toSummaryError } from './api'
import type { SummaryApi, SummaryError, SummaryParams } from './api'

export type SummaryAction = 'load' | 'write' | 'save'

/** עריכת מורה: אורך מרבי (כמו בחוזה EditSummaryRequest) */
export const MAX_EDIT_CHARS = 6000

export interface ErrorInfo { action: SummaryAction; status: number; message: string }

export interface SummaryUiState {
  /** המפתח של היעד+ניסיון שהמצב שייך לו. מצב שמפתחו שונה מהנוכחי נחשב "טוען" */
  key: string | null
  load: 'loading' | 'ready' | 'failed'
  data: SummaryState | null
  busy: 'idle' | 'writing' | 'saving'
  error: ErrorInfo | null
  editing: boolean
  draft: string
  /** נכתב בסשן הנוכחי (הכרטיס המוטמע נפתח מעצמו אחרי כתיבה) */
  wrote: boolean
  /** עריכה שלא נשמרת בשרת (סיכום בלי מזהה, לפני המיגרציה): עד סגירת המסך */
  localEdit: string | null
  /** המורה ביקשה לכתוב מחדש סיכום שהיא ערכה: מוצג חלון אישור (כתיבה מחדש מוחקת את העריכה) */
  confirmRegen: boolean
}

export const initialState: SummaryUiState = {
  key: null, load: 'loading', data: null, busy: 'idle', error: null, editing: false, draft: '', wrote: false, localEdit: null, confirmRegen: false,
}

export type SummaryDispatch =
  | { type: 'loaded'; key: string; data: SummaryState }
  | { type: 'loadFailed'; key: string; error: ErrorInfo }
  | { type: 'writeStarted'; key: string }
  | { type: 'written'; key: string; data: SummaryState }
  | { type: 'writeFailed'; key: string; error: ErrorInfo }
  | { type: 'regenAsked'; key: string }
  | { type: 'regenCancelled'; key: string }
  | { type: 'editStarted'; key: string }
  | { type: 'draftChanged'; key: string; text: string }
  | { type: 'editCancelled'; key: string }
  | { type: 'saveStarted'; key: string }
  | { type: 'saved'; key: string; data: SummaryState }
  | { type: 'savedLocal'; key: string; text: string | null }
  | { type: 'saveFailed'; key: string; error: ErrorInfo }

/* ── טקסט הפסקאות ── */
/** פסקאות מעריכה חופשית: שורה ריקה = פסקה חדשה */
export function splitParagraphs(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 0)
}
export const joinParagraphs = (paragraphs: readonly string[]): string => paragraphs.join('\n\n')

/* ── ה-reducer ── */
export function summaryReducer(state: SummaryUiState, a: SummaryDispatch): SummaryUiState {
  /* תשובה/פעולה של יעד אחר: מתעלמים. loaded/loadFailed מתחילים מצב חדש לגמרי */
  if (a.type === 'loaded') return { ...initialState, key: a.key, load: 'ready', data: a.data }
  if (a.type === 'loadFailed') return { ...initialState, key: a.key, load: 'failed', error: a.error }
  if (state.key !== a.key) return state
  switch (a.type) {
    case 'writeStarted': return { ...state, busy: 'writing', error: null, editing: false, confirmRegen: false }
    case 'written': return { ...state, data: a.data, busy: 'idle', error: null, editing: false, draft: '', wrote: true, localEdit: null, confirmRegen: false }
    case 'writeFailed': return { ...state, busy: 'idle', error: a.error }
    case 'regenAsked': return { ...state, confirmRegen: true, error: null, editing: false }
    case 'regenCancelled': return { ...state, confirmRegen: false }
    case 'editStarted': return { ...state, editing: true, error: null, draft: joinParagraphs(shownParagraphs(state)) }
    case 'draftChanged': return { ...state, draft: a.text, error: state.error?.action === 'save' ? null : state.error }
    case 'editCancelled': return { ...state, editing: false, draft: '', error: null }
    case 'saveStarted': return { ...state, busy: 'saving', error: null }
    case 'saved': return { ...state, data: a.data, busy: 'idle', error: null, editing: false, draft: '', localEdit: null }
    case 'savedLocal': return { ...state, busy: 'idle', error: null, editing: false, draft: '', localEdit: a.text }
    case 'saveFailed': return { ...state, busy: 'idle', error: a.error }
  }
}

/* הפסקאות שמוצגות עכשיו: עריכה מקומית, אחרת מה שהשרת מחזיר (עריכת המורה אם יש, אחרת הטקסט שנכתב) */
function shownParagraphs(s: SummaryUiState): string[] {
  if (s.localEdit !== null) return splitParagraphs(s.localEdit)
  return s.data?.summary?.paragraphs ?? []
}

/* ── הודעות שגיאה בעברית פשוטה, לפי הסטטוס ──
   · 403/429/503: ההודעה של השרת מוצגת כפי שהיא כשהיא בעברית (קירור בכתיבה מחדש, תקרה יומית, "מרכזים את התוצאות…");
   · כל השאר: הודעה קבועה — לא טקסט טכני מהשרת. */
const HEBREW = /[א-ת]/

export function summaryErrorMessage(action: SummaryAction, status: number, serverMessage = ''): string {
  const serverText = HEBREW.test(serverMessage) ? serverMessage : ''
  if (status === 400) return ERR_SUMMARY_BAD_REQUEST
  if (status === 401) return ERR_V2_UNAUTHORIZED
  if (status === 403) return serverText || ERR_V2_FORBIDDEN
  if (status === 404) return ERR_V2_NOT_FOUND
  /* 409: יש עריכה של המורה והכתיבה מחדש לא אושרה (למשל עריכה מלשונית אחרת) */
  if (status === 409) return serverText || ERR_SUMMARY_EDIT_EXISTS
  if (status === 429) return serverText || ERR_V2_RATE_LIMIT
  if (status === 503) return serverText || ERR_V2_UNAVAILABLE
  return action === 'load' ? ERR_SUMMARY_LOAD : action === 'write' ? ERR_SUMMARY_WRITE : ERR_SUMMARY_SAVE
}

/** האם "נסו שוב" הגיוני: תקלה זמנית / עומס / אין חיבור. הרשאה, "לא נמצא" ובקשה לא תקינה — לא יתקנו את עצמן */
export const isRetryable = (status: number): boolean => !(status === 400 || status === 401 || status === 403 || status === 404)

export function errorInfo(action: SummaryAction, e: unknown): ErrorInfo {
  const err: SummaryError = toSummaryError(e)
  return { action, status: err.status, message: summaryErrorMessage(action, err.status, err.message) }
}

/* ── מה להציג ── */
export type PanelPhase = 'loading' | 'loadError' | 'ineligible' | 'none' | 'ready'

export interface ShownSummary {
  id: string | null
  paragraphs: string[]
  writtenBy: AiSummary['writtenBy']
  label: string
  notice: string | null
  /** נערך על ידי המורה (בשרת או מקומית) */
  edited: boolean
  basisText: string
  /** מועד כתיבת הטקסט (ISO) */
  generatedAt: string
  /** ייתכן שהנתונים השתנו מאז שהסיכום נכתב */
  stale: boolean
  caveat: string
  howWritten: string[]
}

export interface PanelModel {
  phase: PanelPhase
  scope: SummaryScope
  writing: boolean
  saving: boolean
  editing: boolean
  draft: string
  /** פתיחה אוטומטית של הכרטיס המוטמע: נכתב בסשן הזה */
  wrote: boolean
  summary: ShownSummary | null
  eligibility: SummaryEligibility | null
  demo: boolean
  persisted: boolean
  persistenceNote: string | null
  privacyNote: string | null
  error: ErrorInfo | null
  /** עריכה: לא בהדמיה (אין שמירה). בלי מזהה (לפני המיגרציה) — עריכה מקומית לסשן */
  canEdit: boolean
  /** "כתיבה מחדש" — רק כשנכתב ב-AI, ולא בהדמיה (שם התבנית זהה בכל פעם) */
  canRegenerate: boolean
  /** "נסו שוב עם ד״ר הולו" — כשבמקומו הוצגה תבנית (בדיקת הפלט נכשלה), לא בהדמיה */
  canRetryAi: boolean
  /** חלון האישור "הכתיבה מחדש תמחק את העריכה שלכם" מוצג (רק כשיש עריכה, ולא בהדמיה) */
  confirmRegen: boolean
  /** יש מה להחזיר: עריכת המורה (בשרת או מקומית) */
  canRevert: boolean
}

export function derive(state: SummaryUiState, currentKey: string, scope: SummaryScope): PanelModel {
  const fresh = state.key === currentKey
  const base = { scope, writing: false, saving: false, editing: false, draft: '', wrote: false, summary: null, eligibility: null, demo: false, persisted: false, persistenceNote: null, privacyNote: null, error: null, canEdit: false, canRegenerate: false, canRetryAi: false, canRevert: false, confirmRegen: false }
  if (!fresh || state.load === 'loading') return { ...base, phase: 'loading' }
  if (state.load === 'failed' || !state.data) return { ...base, phase: 'loadError', error: state.error }
  const d = state.data
  const s = d.summary
  const common = {
    ...base, writing: state.busy === 'writing', saving: state.busy === 'saving', editing: state.editing, draft: state.draft, wrote: state.wrote,
    eligibility: d.eligibility, demo: d.demo, persisted: d.persisted, persistenceNote: d.persistenceNote, privacyNote: d.privacyNote, error: state.error,
  }
  if (!s) return { ...common, phase: d.eligibility.ok ? 'none' : 'ineligible' }
  const localEdited = state.localEdit !== null
  const shown: ShownSummary = {
    id: s.id, paragraphs: localEdited ? splitParagraphs(state.localEdit as string) : s.paragraphs, writtenBy: s.writtenBy, label: s.label, notice: s.notice,
    edited: s.edited || localEdited, basisText: s.basisText, generatedAt: s.generatedAt, stale: s.stale === true && !d.demo, caveat: s.caveat, howWritten: s.howWritten,
  }
  const canRegenerate = !d.demo && s.writtenBy === 'ai'
  const canRetryAi = !d.demo && s.writtenBy === 'template'
  return {
    ...common, phase: 'ready', summary: shown,
    canEdit: !d.demo,
    canRegenerate,
    canRetryAi,
    canRevert: !d.demo && shown.edited,
    confirmRegen: state.confirmRegen && (canRegenerate || canRetryAi) && shown.edited,
  }
}

/* ── הזרימות האסינכרוניות ── */
export interface FlowCtx {
  api: SummaryApi
  target: SummaryTarget
  params: SummaryParams
  key: string
  dispatch: (a: SummaryDispatch) => void
  /** נקרא אחרי כל await: true = המסך נסגר/עבר יעד, ולא מעדכנים */
  cancelled: () => boolean
}

export async function runLoad(c: FlowCtx): Promise<void> {
  try {
    const env = await c.api.get(c.target, c.params)
    if (!c.cancelled()) c.dispatch({ type: 'loaded', key: c.key, data: env.data })
  } catch (e) {
    if (!c.cancelled()) c.dispatch({ type: 'loadFailed', key: c.key, error: errorInfo('load', e) })
  }
}

/** כתיבה / כתיבה מחדש. discardEdit: המורה אישרה במפורש למחוק את עריכתה (בלי זה השרת מסרב ב-409 כשיש עריכה) */
export async function runWrite(c: FlowCtx, regenerate: boolean, discardEdit = false): Promise<void> {
  c.dispatch({ type: 'writeStarted', key: c.key })
  try {
    const env = await c.api.create(c.target, c.params, regenerate, discardEdit)
    if (!c.cancelled()) c.dispatch({ type: 'written', key: c.key, data: env.data })
  } catch (e) {
    if (c.cancelled()) return
    const error = errorInfo('write', e)
    /* 409: מישהו (למשל לשונית אחרת) ערך את הסיכום. טוענים אותו מחדש כדי שהעריכה תוצג, ואז ההודעה — והכתיבה מחדש מבקשת אישור */
    if (error.status === 409) {
      try { const env = await c.api.get(c.target, c.params); if (!c.cancelled()) c.dispatch({ type: 'loaded', key: c.key, data: env.data }) } catch { /* ההודעה מספיקה */ }
      if (c.cancelled()) return
    }
    c.dispatch({ type: 'writeFailed', key: c.key, error })
  }
}

/** שמירת עריכה. text=null: חזרה לטקסט של ד״ר הולו. בלי מזהה (עוד לא נשמר בשרת): עריכה מקומית בלבד */
export async function runSave(c: FlowCtx, current: SummaryUiState, text: string | null): Promise<void> {
  const summary = current.data?.summary ?? null
  if (!summary) return
  const next = text === null ? null : text.replace(/\r\n?/g, '\n').trim()
  if (next !== null && next.length === 0) {
    c.dispatch({ type: 'saveFailed', key: c.key, error: { action: 'save', status: 400, message: ERR_SUMMARY_EMPTY_EDIT } })
    return
  }
  if (next !== null && next === joinParagraphs(shownParagraphs(current))) {
    c.dispatch({ type: 'editCancelled', key: c.key })
    return
  }
  if (summary.id === null) {
    c.dispatch({ type: 'savedLocal', key: c.key, text: next })
    return
  }
  c.dispatch({ type: 'saveStarted', key: c.key })
  try {
    const env = await c.api.edit(summary.id, next, c.params)
    if (!c.cancelled()) c.dispatch({ type: 'saved', key: c.key, data: env.data })
  } catch (e) {
    if (!c.cancelled()) c.dispatch({ type: 'saveFailed', key: c.key, error: errorInfo('save', e) })
  }
}

/** מפתח היעד: היקף + מזהה + מקצוע + העדשה של האורח. ניסיון חוזר (tick) יוצר מפתח חדש */
export const targetKey = (t: SummaryTarget, params: SummaryParams, tick = 0): string =>
  [t.scope, t.id, t.subject ?? '', params.lens ?? '', params.subject ?? '', tick].join('|')
