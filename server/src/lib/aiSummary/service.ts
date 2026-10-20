/* ──────────────────────────────────────────────────────────────────────────
   service — סיכום מילולי: get / generate / edit. **שירות אחד שאינו תלוי בספק ובהרשאות**:
   · ההרשאה כבר הוכרעה בחוץ (routes/aiSummary.ts דרך deps.authorize) ונכנסת כאן כ-audienceKey + demo; הנתונים נטענים בהזרקה (req.load) רק כשצריך.
   · תלויות מוזרקות: llm (מזויף בבדיקות), store, now, log. אין כאן DB ישיר, אין ייבוא של ספקי v2/תוצאות.
   · זרימת יצירה: cache אישי לצופה → טעינה → הקרנה לעובדות → זכאות (N מינימלי) → תקרה יומית → LLM → שומר → ניסיון חוזר אחד → תבנית → שמירה.
   · חוק 12: ל-LLM נשלחות עובדות אנונימיות בלבד. הלוג מכיל קודי הפרה בלבד, אף פעם לא טקסט או שמות.
   ────────────────────────────────────────────────────────────────────────── */
import {
  AI_SUMMARY_TEXT, CAVEAT_TREND, ERR_SUMMARY_COOLDOWN, ERR_SUMMARY_DEMO_EDIT, ERR_SUMMARY_EMPTY_EDIT, ERR_SUMMARY_LIMIT_DAILY, ERR_SUMMARY_NOT_FOUND,
  aiSummaryBasis, aiSummaryHowWritten, aiSummaryPrivacyNote,
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
  /* טוען את מקור הנתונים (חוזה v2/תוצאות). נקרא רק אחרי ההרשאה ורק כשצריך */
  load: () => Promise<SummarySource>
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
  generate(req: SummaryRequest, opts?: { regenerate?: boolean }): Promise<SummaryResponse>
  /* מי הסיכום ועל איזו ישות — רק אם הוא של הצופה (לאכיפת הרשאה לפני עריכה) */
  describe(summaryId: string, viewerId: string): Promise<{ target: SummaryTarget; audienceKey: string } | null>
  edit(args: { viewer: SummaryViewer; summaryId: string; audienceKey: string; editedText: string | null }): Promise<SummaryResponse>
}

/* מפתחות הקהל (audienceKey) — חלק ממפתח השמירה האישי. 'full' = מחנך/מנהל-על (כל המקצועות); מורה מקצועי = המקצועות שלו, ממוינים */
export const FULL_AUDIENCE = 'full'
export const subjectAudience = (codes: readonly string[]): string => `subj:${[...new Set(codes)].sort().join(',')}`

export const DEFAULT_DAILY_CAP = 30
export const DEFAULT_REGENERATE_COOLDOWN_MS = 20_000
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
    caveat: CAVEAT_TREND,
    howWritten: aiSummaryHowWritten({ scope, writtenBy: f.writtenBy, demo: f.demo, model: f.model, promptVersion: f.promptVersion }),
  }
}

const fieldsOfStored = (s: StoredSummary): SummaryFields => ({
  id: s.id, target: targetOf(s), writtenBy: s.writtenBy, demo: false, model: s.model, promptVersion: s.promptVersion,
  generated: s.paragraphs, edited: s.editedText, sampleSize: s.sampleSize, sampleUnit: s.sampleUnit, generatedAt: s.createdAt, updatedAt: s.updatedAt,
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

  /* מוני גיבוי בזיכרון: כשאין טבלה (לפני המיגרציה) או כשכתיבות חוזרות דורסות שורה אחת */
  const usage = new Map<string, number>()
  const lastGenerated = new Map<string, number>()
  const inflight = new Map<string, Promise<SummaryResponse>>()

  const dayStartIso = (): string => { const d = now(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString() }
  const usageKey = (viewerId: string): string => `${viewerId}|${dayStartIso().slice(0, 10)}`

  async function safe<T>(label: string, fn: () => Promise<T | null>): Promise<T | null> {
    try { return await fn() } catch (e) { log(`[ai-summary] store ${label} failed: ${e instanceof Error ? e.message : 'error'}`); return null }
  }

  async function enforceDailyCap(viewerId: string): Promise<void> {
    const persisted = (await safe('count', () => store.countGeneratedSince(viewerId, dayStartIso()))) ?? 0
    if (Math.max(persisted, usage.get(usageKey(viewerId)) ?? 0) >= dailyCap) throw new AppError(429, ERR_SUMMARY_LIMIT_DAILY)
  }
  function bumpUsage(viewerId: string): void {
    if (usage.size > 5000) usage.clear()
    const k = usageKey(viewerId)
    usage.set(k, (usage.get(k) ?? 0) + 1)
  }
  function markGenerated(fkey: string): void {
    if (lastGenerated.size > 5000) lastGenerated.clear()
    lastGenerated.set(fkey, now().getTime())
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
      bumpUsage(req.viewer.userId)
    }
    const iso = now().toISOString()
    const summary = buildSummary({
      id: null, target: req.target, writtenBy: out.writtenBy, demo: true, model: out.model, promptVersion: out.writtenBy === 'ai' ? SUMMARY_PROMPT_VERSION : null,
      generated: out.paragraphs, edited: null, sampleSize: input.sampleSize, sampleUnit: input.sampleUnit, generatedAt: iso, updatedAt: iso,
    })
    return stateOf(scope, { eligibility, summary, demo: true })
  }

  async function generateReal(req: SummaryRequest, existing: StoredSummary | null): Promise<SummaryResponse> {
    const scope = req.target.scope
    const viewerId = req.viewer.userId
    const source = await req.load()
    const input = projectSource(source)
    const eligibility = summaryEligibility(scope, input.counts)
    if (!eligibility.ok) return stateOf(scope, { eligibility, summary: existing ? buildSummary(fieldsOfStored(existing)) : null, demo: false })

    await enforceDailyCap(viewerId)
    const out = await write(input, collectKnownNames(source))
    bumpUsage(viewerId)

    const iso = now().toISOString()
    const key = storeKeyOf(req)
    markGenerated(keyString(key))
    const row: NewStoredSummary = {
      ...key, writtenBy: out.writtenBy, paragraphs: out.paragraphs, model: out.model, promptVersion: SUMMARY_PROMPT_VERSION,
      inputHash: inputHash(input, SUMMARY_PROMPT_VERSION), inputFacts: input.facts, sampleSize: input.sampleSize, sampleUnit: input.sampleUnit, createdAt: iso, updatedAt: iso,
    }
    const saved = await safe('upsert', () => store.upsert(row))
    if (saved) return stateOf(scope, { eligibility, summary: buildSummary(fieldsOfStored(saved)), demo: false })
    /* לא נשמר (אין טבלה / כשל כתיבה): מוצג בכל זאת, עם הסבר במילים */
    const summary = buildSummary({
      id: null, target: req.target, writtenBy: out.writtenBy, demo: false, model: out.model, promptVersion: SUMMARY_PROMPT_VERSION,
      generated: out.paragraphs, edited: null, sampleSize: input.sampleSize, sampleUnit: input.sampleUnit, generatedAt: iso, updatedAt: iso,
    })
    return stateOf(scope, { eligibility, summary, demo: false, persisted: false, persistenceNote: AI_SUMMARY_TEXT.persistenceNote })
  }

  return {
    async get(req) {
      const scope = req.target.scope
      if (!req.viewer.demo) {
        const stored = await safe('find', () => store.find(storeKeyOf(req)))
        if (stored) return stateOf(scope, { eligibility: { ok: true }, summary: buildSummary(fieldsOfStored(stored)), demo: false })
      }
      /* אין סיכום עדיין: הפאנל צריך לדעת אם אפשר לכתוב (או להסביר מה חסר) */
      const input = projectSource(await req.load())
      return stateOf(scope, { eligibility: summaryEligibility(scope, input.counts), summary: null, demo: req.viewer.demo })
    },

    async generate(req, opts = {}) {
      if (req.viewer.demo) return generateDemo(req)
      const key = storeKeyOf(req)
      const fkey = keyString(key)
      const existing = await safe('find', () => store.find(key))
      if (existing && !opts.regenerate) return stateOf(req.target.scope, { eligibility: { ok: true }, summary: buildSummary(fieldsOfStored(existing)), demo: false })
      if (opts.regenerate) {
        const last = Math.max(existing ? Date.parse(existing.createdAt) || 0 : 0, lastGenerated.get(fkey) ?? 0)
        if (last > 0 && now().getTime() - last < cooldownMs) throw new AppError(429, ERR_SUMMARY_COOLDOWN)
      }
      const running = inflight.get(fkey)
      if (running) return running
      const p = generateReal(req, existing)
      inflight.set(fkey, p)
      try { return await p } finally { inflight.delete(fkey) }
    },

    async describe(summaryId, viewerId) {
      const s = await safe('findById', () => store.findById(summaryId, viewerId))
      return s ? { target: targetOf(s), audienceKey: s.audienceKey } : null
    },

    async edit({ viewer, summaryId, audienceKey, editedText }) {
      if (viewer.demo) throw new AppError(403, ERR_SUMMARY_DEMO_EDIT)
      const stored = await safe('findById', () => store.findById(summaryId, viewer.userId))
      if (!stored || stored.audienceKey !== audienceKey) return notFound()
      const text = editedText === null ? null : normalizeEdit(editedText)
      if (text !== null && text.length === 0) throw new AppError(400, ERR_SUMMARY_EMPTY_EDIT)
      const updated = await safe('setEdited', () => store.setEdited(stored.id, viewer.userId, text, now().toISOString()))
      if (!updated) return notFound()
      return stateOf(updated.scope, { eligibility: { ok: true }, summary: buildSummary(fieldsOfStored(updated)), demo: false })
    },
  }
}
