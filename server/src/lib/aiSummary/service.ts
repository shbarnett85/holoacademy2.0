/* ──────────────────────────────────────────────────────────────────────────
   service — סיכום מילולי: get / generate / edit. **שירות אחד שאינו תלוי בספק ובהרשאות**:
   · ההרשאה כבר הוכרעה בחוץ (routes/aiSummary.ts דרך deps.authorize) ונכנסת כאן כ-audienceKey + demo; הנתונים נטענים בהזרקה (req.load) רק כשצריך.
   · תלויות מוזרקות: llm (מזויף בבדיקות), store, now, log. אין כאן DB ישיר, אין ייבוא של ספקי v2/תוצאות.
   · זרימת יצירה: cache אישי לצופה → (כתיבה מחדש על סיכום ערוך דורשת אישור מפורש) → טעינה → הקרנה לעובדות → זכאות (N מינימלי) → תקרה יומית → LLM → שומר →
     ניסיון חוזר אחד → תבנית → שמירה.
   · GET זול: קריאת מטמון (סבב DB אחד); זכאות והתיישנות מחושבות רק כשהטעינה זולה (req.cheapLoad — חוזה v2 כבר בזיכרון). סיכום הגשה (טעינה כבדה) — הזכאות נדחית ל-POST.
   · שגיאות אחסון: רק "סכמה חסרה" הופכת ל-persisted:false. כל כשל אחר מ-store מתפשט כ-503 (לא נבלע): אחרת find שנכשל נראה "אין סיכום", נקראת שוב ל-LLM והעריכה נדרסת.
   · חוק 12: ל-LLM נשלחות עובדות אנונימיות בלבד. הלוג מכיל קודי הפרה בלבד, אף פעם לא טקסט או שמות.
   ────────────────────────────────────────────────────────────────────────── */
import {
  AI_SUMMARY_TEXT, CAVEAT_TREND, ERR_SUMMARY_COOLDOWN, ERR_SUMMARY_DEMO_EDIT, ERR_SUMMARY_EDIT_EXISTS, ERR_SUMMARY_EMPTY_EDIT, ERR_SUMMARY_LIMIT_DAILY, ERR_SUMMARY_NOT_FOUND,
  ERR_SUMMARY_SAVE, aiSummaryBasis, aiSummaryHowWritten, aiSummaryPrivacyNote,
} from '../../../../src/shared/lib/findingsNarrative.js'
import { summaryEligibility } from '../../../../src/shared/lib/aiSummaryRule.js'
import { isSubjectCode } from '../../../../src/shared/lib/subjects.js'
import type { AiEnvelopeOf, AiSummary, SummaryScope, SummaryState, SummaryTarget } from '../../../../src/shared/types/aiSummaryV1.js'
import { AppError } from '../../middleware/errors.js'
import { templateParagraphs } from './fallback.js'
import { parseAndGuard, type Violation } from './guard.js'
import { collectKnownNames, inputHash, projectSource, type SummaryInput, type SummarySource } from './inputs.js'
import { LLM_TIMEOUT_MS, type SummaryLlm, type SummaryLlmResult } from './llm.js'
import { SUMMARY_MAX_TOKENS, SUMMARY_PROMPT_VERSION, buildRetryNote, buildSummaryPrompt } from './prompt.js'
import type { NewStoredSummary, StoreKey, StoredSummary, SummaryStore } from './store.js'

export interface SummaryViewer { userId: string; /* אורח/ארגון הדגמה: תבנית בלבד, בלי LLM ובלי שמירה */ demo: boolean }

export interface SummaryRequest {
  viewer: SummaryViewer
  target: SummaryTarget
  /* 'full' | 'subj:<קודים>' — נקבע בהרשאה; חלק ממפתח השמירה */
  audienceKey: string
  /* טוען את מקור הנתונים (חוזה v2/תוצאות). נקרא רק אחרי ההרשאה ורק כשצריך. lite: בלי קריאות DB נוספות (למשל מגדר) — לחישוב חותמת הנתונים בלבד */
  load: (opts?: { lite?: boolean }) => Promise<SummarySource>
  /* true כשהטעינה כבר בזיכרון הבקשה (תלמיד/כיתה/מקצוע ב-v2, אחרי ההרשאה) או בלי DB (הדגמה): מותר לחשב ב-GET זכאות והתיישנות. הגשה אמיתית: false */
  cheapLoad?: boolean
}

export type SummaryResponse = AiEnvelopeOf<SummaryState>

export interface SummaryServiceDeps {
  llm: SummaryLlm
  store: SummaryStore
  now?: () => Date
  log?: (msg: string) => void
  /* תקרת סיכומים ליום לצופה */
  dailyCap?: number
  /* המתנה מינימלית בין כתיבות מחדש של אותה ישות */
  regenerateCooldownMs?: number
  /* AI_SUMMARY_DEMO_LLM=1: קריאת LLM אמיתית גם בהדגמה (עדיין בלי שמירה). ברירת מחדל: תבנית בלבד */
  demoLlm?: boolean
}

export interface SummaryService {
  get(req: SummaryRequest): Promise<SummaryResponse>
  /* regenerate: כתיבה מחדש. על סיכום שהמורה ערך — discardEdit=true חובה (אישור מפורש), אחרת 409 */
  generate(req: SummaryRequest, opts?: { regenerate?: boolean; discardEdit?: boolean }): Promise<SummaryResponse>
  /* מי הסיכום ועל איזו ישות — רק אם הוא של הצופה (לאכיפת הרשאה לפני עריכה) */
  describe(summaryId: string, viewerId: string): Promise<{ target: SummaryTarget; audienceKey: string } | null>
  /* req (אופציונלי): הבקשה המלאה, לחישוב "ייתכן שהנתונים השתנו" בתגובה — בלעדיו ההתיישנות נקבעת לפי הגיל בלבד */
  edit(args: { viewer: SummaryViewer; summaryId: string; audienceKey: string; editedText: string | null; req?: SummaryRequest }): Promise<SummaryResponse>
}

/* מפתחות הקהל (audienceKey) — חלק ממפתח השמירה האישי. 'full' = מחנך/מנהל-על (כל המקצועות); מורה מקצועי = המקצועות שלו, ממוינים */
export const FULL_AUDIENCE = 'full'
export const subjectAudience = (codes: readonly string[]): string => `subj:${[...new Set(codes)].sort().join(',')}`

export const DEFAULT_DAILY_CAP = 30
export const DEFAULT_REGENERATE_COOLDOWN_MS = 20_000
/* סיכום ישן מזה מסומן "ייתכן שהנתונים השתנו", גם אם חותמת הנתונים לא חושבה (חוק 7: נתונים ישנים דועכים) */
export const SUMMARY_STALE_AFTER_DAYS = 14
/* יצירה שנכשלה בשמירה (503) נשמרת בזיכרון לזמן קצר, כדי שניסיון חוזר ישמור אותה ולא יקרא שוב ל-LLM */
const UNSAVED_TTL_MS = 5 * 60_000
const MAX_DISPLAY_PARAGRAPHS = 12
const notFound = (): never => { throw new AppError(404, ERR_SUMMARY_NOT_FOUND) }

/* עריכת מורה: שורות חדשות אחידות, בלי רווחים בקצוות, מקסימום שורה ריקה אחת ברצף */
export function normalizeEdit(text: string): string {
  return text.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/[ \t]+$/u, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/* פסקאות להצגה מעריכה חופשית */
export function splitParagraphs(text: string): string[] {
  const parts = text.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 0)
  if (parts.length <= MAX_DISPLAY_PARAGRAPHS) return parts
  return [...parts.slice(0, MAX_DISPLAY_PARAGRAPHS - 1), parts.slice(MAX_DISPLAY_PARAGRAPHS - 1).join('\n\n')]
}

const storeKeyOf = (req: SummaryRequest): StoreKey => ({
  viewerId: req.viewer.userId, scope: req.target.scope, entityId: req.target.id, subjectCode: req.target.subject ?? '', audienceKey: req.audienceKey,
})
const keyString = (k: StoreKey): string => [k.viewerId, k.scope, k.entityId, k.subjectCode, k.audienceKey].join('|')
const targetOf = (s: Pick<StoredSummary, 'scope' | 'entityId' | 'subjectCode'>): SummaryTarget =>
  isSubjectCode(s.subjectCode) ? { scope: s.scope, id: s.entityId, subject: s.subjectCode } : { scope: s.scope, id: s.entityId }
const hasEdit = (s: StoredSummary | null): s is StoredSummary => !!s && s.editedText !== null && s.editedText.trim().length > 0

interface SummaryFields {
  id: string | null
  target: SummaryTarget
  writtenBy: 'ai' | 'template'
  demo: boolean
  model: string | null
  promptVersion: string | null
  generated: string[]
  edited: string | null
  sampleSize: number
  sampleUnit: 'sessions' | 'students'
  generatedAt: string
  updatedAt: string
  stale: boolean
}

function buildSummary(f: SummaryFields): AiSummary {
  const T = AI_SUMMARY_TEXT
  const scope: SummaryScope = f.target.scope
  const edited = f.edited !== null && f.edited.trim().length > 0
  return {
    id: f.id, target: f.target, writtenBy: f.writtenBy,
    label: f.writtenBy === 'ai' ? T.label.ai : f.demo ? T.label.demo : T.label.template,
    notice: f.writtenBy === 'ai' ? null : f.demo ? T.notice.demo : T.notice.template,
    paragraphs: edited ? splitParagraphs(f.edited as string) : f.generated,
    generatedParagraphs: f.generated,
    edited,
    basisText: aiSummaryBasis(scope, f.sampleUnit, f.sampleSize),
    generatedAt: f.generatedAt, updatedAt: f.updatedAt,
    stale: f.stale,
    caveat: CAVEAT_TREND,
    howWritten: aiSummaryHowWritten({ scope, writtenBy: f.writtenBy, demo: f.demo, model: f.model, promptVersion: f.promptVersion }),
  }
}

const fieldsOfStored = (s: StoredSummary, stale: boolean): SummaryFields => ({
  id: s.id, target: targetOf(s), writtenBy: s.writtenBy, demo: false, model: s.model, promptVersion: s.promptVersion,
  generated: s.paragraphs, edited: s.editedText, sampleSize: s.sampleSize, sampleUnit: s.sampleUnit, generatedAt: s.createdAt, updatedAt: s.updatedAt, stale,
})

function stateOf(scope: SummaryScope, p: Partial<SummaryState> & Pick<SummaryState, 'eligibility' | 'summary' | 'demo'>): SummaryResponse {
  const state: SummaryState = { persisted: p.summary !== null && p.summary.id !== null, persistenceNote: null, privacyNote: aiSummaryPrivacyNote(scope), ...p }
  return { dataState: state.eligibility.ok ? 'ok' : 'insufficient', data: state }
}

export function createSummaryService(deps: SummaryServiceDeps): SummaryService {
  const { llm, store } = deps
  const now = deps.now ?? ((): Date => new Date())
  const log = deps.log ?? ((): void => {})
  const dailyCap = deps.dailyCap ?? DEFAULT_DAILY_CAP
  const cooldownMs = deps.regenerateCooldownMs ?? DEFAULT_REGENERATE_COOLDOWN_MS
  const demoLlm = deps.demoLlm ?? process.env.AI_SUMMARY_DEMO_LLM === '1'

  /* מוני גיבוי בזיכרון: כשאין טבלת שימוש (לפני המיגרציה) — התקרה היומית והקירור נספרים כאן */
  const usage = new Map<string, number>()
  const lastGenerated = new Map<string, number>()
  const inflight = new Map<string, Promise<SummaryResponse>>()
  const unsaved = new Map<string, { row: NewStoredSummary; resetEdit: boolean; at: number }>()

  const dayStartIso = (): string => { const d = now(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString() }
  const usageKey = (viewerId: string): string => `${viewerId}|${dayStartIso().slice(0, 10)}`

  /* תקרה יומית: הגבוה מבין הספירה מיומן השימוש (כשהטבלה קיימת; כולל כתיבות מחדש) לבין המונה בזיכרון. כשל DB שאינו "סכמה חסרה" → 503 (נכשל סגור: בלי ספירה אין LLM) */
  async function enforceDailyCap(viewerId: string): Promise<void> {
    const persisted = (await store.countGeneratedSince(viewerId, dayStartIso())) ?? 0
    if (Math.max(persisted, usage.get(usageKey(viewerId)) ?? 0) >= dailyCap) throw new AppError(429, ERR_SUMMARY_LIMIT_DAILY)
  }
  /* נקרא אחרי כל כתיבה (גם אם נפלה לתבנית): העלות כבר נגרמה. רישום ביומן הוא best-effort — הכשל נרשם ללוג בלבד */
  async function recordUsage(viewerId: string): Promise<void> {
    if (usage.size > 5000) usage.clear()
    const k = usageKey(viewerId)
    usage.set(k, (usage.get(k) ?? 0) + 1)
    try { await store.recordGeneration(viewerId, now().toISOString()) } catch (e) { log(`[ai-summary] usage record failed: ${e instanceof Error ? e.name : 'error'}`) }
  }
  function markGenerated(fkey: string): void {
    if (lastGenerated.size > 5000) lastGenerated.clear()
    lastGenerated.set(fkey, now().getTime())
  }

  /* התיישנות: ישן מ-SUMMARY_STALE_AFTER_DAYS, או (כשהטעינה זולה) חותמת הנתונים הנוכחית שונה מזו ששמורה. כשל בטעינה → לפי הגיל בלבד */
  async function staleOf(req: SummaryRequest, stored: StoredSummary): Promise<boolean> {
    if (now().getTime() - (Date.parse(stored.createdAt) || 0) > SUMMARY_STALE_AFTER_DAYS * 86_400_000) return true
    if (!req.cheapLoad) return false
    try { return inputHash(projectSource(await req.load({ lite: true }))) !== stored.inputHash } catch { return false }
  }

  /* כתיבה: LLM → שומר → ניסיון חוזר אחד → תבנית. כשל טכני של המודל (timeout, שגיאת רשת) → תבנית ישר, בלי ניסיון נוסף */
  async function write(input: SummaryInput, names: string[]): Promise<{ writtenBy: 'ai' | 'template'; paragraphs: string[]; model: string | null }> {
    const { system, user } = buildSummaryPrompt(input)
    let violations: Violation[] = []
    for (let attempt = 0; attempt < 2; attempt++) {
      let res: SummaryLlmResult
      try {
        res = await llm.generate({ system, user: attempt === 0 ? user : user + buildRetryNote(violations), maxTokens: SUMMARY_MAX_TOKENS, signal: AbortSignal.timeout(LLM_TIMEOUT_MS) })
      } catch (e) {
        log(`[ai-summary] ${input.scope} llm failed (attempt ${attempt + 1}): ${e instanceof Error ? e.name : 'error'} — template`)
        return { writtenBy: 'template', paragraphs: templateParagraphs(input), model: null }
      }
      const g = parseAndGuard(res.text, input, { knownNames: names })
      if (g.ok) { log(`[ai-summary] ${input.scope} ai ok (attempt ${attempt + 1}, model ${res.model})`); return { writtenBy: 'ai', paragraphs: g.paragraphs, model: res.model } }
      violations = g.violations
      log(`[ai-summary] ${input.scope} guard rejected (attempt ${attempt + 1}): ${[...new Set(violations.map((v) => v.code))].join(',')}`)
    }
    return { writtenBy: 'template', paragraphs: templateParagraphs(input), model: null }
  }

  async function generateDemo(req: SummaryRequest): Promise<SummaryResponse> {
    const scope = req.target.scope
    const source = await req.load()
    const input = projectSource(source)
    const eligibility = summaryEligibility(scope, input.counts)
    if (!eligibility.ok) return stateOf(scope, { eligibility, summary: null, demo: true })
    let out: { writtenBy: 'ai' | 'template'; paragraphs: string[]; model: string | null } = { writtenBy: 'template', paragraphs: templateParagraphs(input), model: null }
    if (demoLlm) {
      await enforceDailyCap(req.viewer.userId)
      out = await write(input, collectKnownNames(source))
      await recordUsage(req.viewer.userId)
    }
    const iso = now().toISOString()
    const summary = buildSummary({
      id: null, target: req.target, writtenBy: out.writtenBy, demo: true, model: out.model, promptVersion: out.writtenBy === 'ai' ? SUMMARY_PROMPT_VERSION : null,
      generated: out.paragraphs, edited: null, sampleSize: input.sampleSize, sampleUnit: input.sampleUnit, generatedAt: iso, updatedAt: iso, stale: false,
    })
    return stateOf(scope, { eligibility, summary, demo: true })
  }

  /* שמירה + בניית התגובה. הטבלה חסרה → מוצג בלי שמירה, עם הסבר במילים. כשל אחר → 503 (והיצירה נשמרת בזיכרון לניסיון חוזר) */
  async function persist(req: SummaryRequest, fkey: string, row: NewStoredSummary, resetEdit: boolean): Promise<SummaryResponse> {
    const scope = req.target.scope
    let saved: StoredSummary | null
    try {
      saved = await store.upsert(row, { resetEdit })
    } catch (e) {
      unsaved.set(fkey, { row, resetEdit, at: now().getTime() })
      throw e
    }
    unsaved.delete(fkey)
    if (saved) return stateOf(scope, { eligibility: { ok: true }, summary: buildSummary(fieldsOfStored(saved, false)), demo: false })
    const summary = buildSummary({
      id: null, target: req.target, writtenBy: row.writtenBy, demo: false, model: row.model, promptVersion: row.promptVersion,
      generated: row.paragraphs, edited: null, sampleSize: row.sampleSize, sampleUnit: row.sampleUnit, generatedAt: row.createdAt, updatedAt: row.updatedAt, stale: false,
    })
    return stateOf(scope, { eligibility: { ok: true }, summary, demo: false, persisted: false, persistenceNote: AI_SUMMARY_TEXT.persistenceNote })
  }

  async function generateReal(req: SummaryRequest, existing: StoredSummary | null, resetEdit: boolean): Promise<SummaryResponse> {
    const scope = req.target.scope
    const viewerId = req.viewer.userId
    const key = storeKeyOf(req)
    const fkey = keyString(key)

    /* יצירה קודמת שנכשלה בשמירה: שומרים אותה (בלי LLM נוסף) */
    const pending = unsaved.get(fkey)
    if (pending && now().getTime() - pending.at < UNSAVED_TTL_MS) return persist(req, fkey, pending.row, pending.resetEdit || resetEdit)

    const source = await req.load()
    const input = projectSource(source)
    const eligibility = summaryEligibility(scope, input.counts)
    if (!eligibility.ok) return stateOf(scope, { eligibility, summary: existing ? buildSummary(fieldsOfStored(existing, false)) : null, demo: false })

    await enforceDailyCap(viewerId)
    const out = await write(input, collectKnownNames(source))
    await recordUsage(viewerId)

    const iso = now().toISOString()
    markGenerated(fkey)
    const row: NewStoredSummary = {
      ...key, writtenBy: out.writtenBy, paragraphs: out.paragraphs, model: out.model, promptVersion: SUMMARY_PROMPT_VERSION,
      inputHash: inputHash(input), inputFacts: input.facts, sampleSize: input.sampleSize, sampleUnit: input.sampleUnit, createdAt: iso, updatedAt: iso,
    }
    return persist(req, fkey, row, resetEdit)
  }

  return {
    async get(req) {
      const scope = req.target.scope
      if (!req.viewer.demo) {
        const stored = await store.find(storeKeyOf(req))
        if (stored) return stateOf(scope, { eligibility: { ok: true }, summary: buildSummary(fieldsOfStored(stored, await staleOf(req, stored))), demo: false })
      }
      /* אין סיכום עדיין: הפאנל צריך לדעת אם אפשר לכתוב (או להסביר מה חסר). טעינה כבדה (הגשה אמיתית) נדחית ל-POST, שמחזיר "אין מספיק נתונים" אם צריך */
      if (!req.cheapLoad) return stateOf(scope, { eligibility: { ok: true }, summary: null, demo: req.viewer.demo })
      const input = projectSource(await req.load({ lite: true }))
      return stateOf(scope, { eligibility: summaryEligibility(scope, input.counts), summary: null, demo: req.viewer.demo })
    },

    async generate(req, opts = {}) {
      if (req.viewer.demo) return generateDemo(req)
      const key = storeKeyOf(req)
      const fkey = keyString(key)
      const existing = await store.find(key)
      if (existing && !opts.regenerate) return stateOf(req.target.scope, { eligibility: { ok: true }, summary: buildSummary(fieldsOfStored(existing, await staleOf(req, existing))), demo: false })
      if (opts.regenerate) {
        /* כתיבה מחדש מוחקת את עריכת המורה: דורשת אישור מפורש (הלקוח שולח discardEdit אחרי חלון אישור; עריכה מלשונית אחרת נתפסת כאן) */
        if (hasEdit(existing) && !opts.discardEdit) throw new AppError(409, ERR_SUMMARY_EDIT_EXISTS)
        const last = Math.max(existing ? Date.parse(existing.createdAt) || 0 : 0, lastGenerated.get(fkey) ?? 0)
        if (last > 0 && now().getTime() - last < cooldownMs) throw new AppError(429, ERR_SUMMARY_COOLDOWN)
      }
      const running = inflight.get(fkey)
      if (running) return running
      const p = generateReal(req, existing, opts.regenerate === true && opts.discardEdit === true)
      inflight.set(fkey, p)
      try { return await p } finally { inflight.delete(fkey) }
    },

    async describe(summaryId, viewerId) {
      const s = await store.findById(summaryId, viewerId)
      return s ? { target: targetOf(s), audienceKey: s.audienceKey } : null
    },

    async edit({ viewer, summaryId, audienceKey, editedText, req }) {
      if (viewer.demo) throw new AppError(403, ERR_SUMMARY_DEMO_EDIT)
      const stored = await store.findById(summaryId, viewer.userId)
      if (!stored || stored.audienceKey !== audienceKey) return notFound()
      const text = editedText === null ? null : normalizeEdit(editedText)
      if (text !== null && text.length === 0) throw new AppError(400, ERR_SUMMARY_EMPTY_EDIT)
      let updated: StoredSummary | null
      try {
        updated = await store.setEdited(stored.id, viewer.userId, text, now().toISOString())
      } catch (e) {
        /* כשל טכני בשמירה אינו "לא נמצא": ההודעה אומרת שהעריכה לא נשמרה ואפשר לנסות שוב */
        if (e instanceof AppError && e.status === 503) throw new AppError(503, ERR_SUMMARY_SAVE)
        throw e
      }
      if (!updated) return notFound()
      const stale = req ? await staleOf(req, updated) : now().getTime() - (Date.parse(updated.createdAt) || 0) > SUMMARY_STALE_AFTER_DAYS * 86_400_000
      return stateOf(updated.scope, { eligibility: { ok: true }, summary: buildSummary(fieldsOfStored(updated, stale)), demo: false })
    },
  }
}
