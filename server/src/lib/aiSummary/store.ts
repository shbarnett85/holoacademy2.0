/* ──────────────────────────────────────────────────────────────────────────
   store — שמירת הסיכומים (טבלת ai_summaries, migrations/ai_summaries.sql). **אישי לצופה**: כל קריאה/כתיבה מסוננת ב-viewer_id,
   כך שצופה ב׳ לעולם לא רואה סיכום או עריכה של צופה א׳ (תיקון דליפת ה-cache של הנתיב הישן).
   · עמיד לפני המיגרציה: כשהטבלה חסרה (hasAiSummaries=false) — find → null, upsert → null (= "לא נשמר"), ספירה → null. אף פעם לא זורק על חסר-טבלה.
   · createMemoryStore: מימוש בזיכרון לבדיקות (ושימוש מקומי); אותו חוזה.
   ────────────────────────────────────────────────────────────────────────── */
import { randomUUID } from 'node:crypto'
import type { SummaryScope } from '../../../../src/shared/types/aiSummaryV1.js'
import { hasAiSummaries } from '../activeColumn.js'
import { supabaseAdmin } from '../supabase.js'
import type { Fact } from './inputs.js'

export interface StoreKey { viewerId: string; scope: SummaryScope; entityId: string; subjectCode: string; audienceKey: string }

export interface StoredSummary extends StoreKey {
  id: string
  writtenBy: 'ai' | 'template'
  paragraphs: string[]
  editedText: string | null
  model: string | null
  promptVersion: string
  inputHash: string
  inputFacts: Fact[]
  sampleSize: number
  sampleUnit: 'sessions' | 'students'
  createdAt: string
  updatedAt: string
}

export type NewStoredSummary = Omit<StoredSummary, 'id' | 'editedText'>

export interface SummaryStore {
  find(key: StoreKey): Promise<StoredSummary | null>
  /* לפי מזהה — רק אם הסיכום שייך לצופה */
  findById(id: string, viewerId: string): Promise<StoredSummary | null>
  /* יצירה/החלפה (כתיבה מחדש): מאפס edited_text. null = לא נשמר (אין טבלה) */
  upsert(row: NewStoredSummary): Promise<StoredSummary | null>
  setEdited(id: string, viewerId: string, editedText: string | null, nowIso: string): Promise<StoredSummary | null>
  /* כמה סיכומים נוצרו לצופה מאז sinceIso; null = לא ידוע (אין טבלה) */
  countGeneratedSince(viewerId: string, sinceIso: string): Promise<number | null>
}

/* ── Supabase ── */
interface Row {
  id: string; viewer_id: string; scope: SummaryScope; entity_id: string; subject_code: string; audience_key: string
  written_by: 'ai' | 'template'; paragraphs: string[]; edited_text: string | null; model: string | null; prompt_version: string
  input_hash: string; input_facts: Fact[]; sample_size: number; sample_unit: 'sessions' | 'students'; created_at: string; updated_at: string
}

/* שורה בלי פסקאות (נתון פגום) = אין סיכום: אי אפשר להציג אותה */
const fromRow = (r: Row): StoredSummary | null => {
  if (!Array.isArray(r.paragraphs) || r.paragraphs.length === 0) return null
  return {
    id: r.id, viewerId: r.viewer_id, scope: r.scope, entityId: r.entity_id, subjectCode: r.subject_code, audienceKey: r.audience_key,
    writtenBy: r.written_by, paragraphs: r.paragraphs, editedText: r.edited_text, model: r.model,
    promptVersion: r.prompt_version, inputHash: r.input_hash, inputFacts: Array.isArray(r.input_facts) ? r.input_facts : [],
    sampleSize: r.sample_size, sampleUnit: r.sample_unit, createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

const CONFLICT = 'viewer_id,scope,entity_id,subject_code,audience_key'

export function createSupabaseStore(): SummaryStore {
  return {
    async find(k) {
      if (!(await hasAiSummaries())) return null
      const { data, error } = await supabaseAdmin.from('ai_summaries').select('*')
        .eq('viewer_id', k.viewerId).eq('scope', k.scope).eq('entity_id', k.entityId).eq('subject_code', k.subjectCode).eq('audience_key', k.audienceKey)
        .maybeSingle()
      if (error || !data) return null
      return fromRow(data as Row)
    },
    async findById(id, viewerId) {
      if (!(await hasAiSummaries())) return null
      const { data, error } = await supabaseAdmin.from('ai_summaries').select('*').eq('id', id).eq('viewer_id', viewerId).maybeSingle()
      if (error || !data) return null
      return fromRow(data as Row)
    },
    async upsert(r) {
      if (!(await hasAiSummaries())) return null
      const { data, error } = await supabaseAdmin.from('ai_summaries').upsert({
        viewer_id: r.viewerId, scope: r.scope, entity_id: r.entityId, subject_code: r.subjectCode, audience_key: r.audienceKey,
        written_by: r.writtenBy, paragraphs: r.paragraphs, edited_text: null, model: r.model, prompt_version: r.promptVersion,
        input_hash: r.inputHash, input_facts: r.inputFacts, sample_size: r.sampleSize, sample_unit: r.sampleUnit,
        created_at: r.createdAt, updated_at: r.updatedAt,
      }, { onConflict: CONFLICT }).select('*').single()
      if (error || !data) return null
      return fromRow(data as Row)
    },
    async setEdited(id, viewerId, editedText, nowIso) {
      if (!(await hasAiSummaries())) return null
      const { data, error } = await supabaseAdmin.from('ai_summaries').update({ edited_text: editedText, updated_at: nowIso })
        .eq('id', id).eq('viewer_id', viewerId).select('*').maybeSingle()
      if (error || !data) return null
      return fromRow(data as Row)
    },
    async countGeneratedSince(viewerId, sinceIso) {
      if (!(await hasAiSummaries())) return null
      const { count, error } = await supabaseAdmin.from('ai_summaries').select('id', { count: 'exact', head: true }).eq('viewer_id', viewerId).gte('created_at', sinceIso)
      return error ? null : (count ?? 0)
    },
  }
}

/* ── זיכרון (בדיקות) ── */
const keyString = (k: StoreKey): string => [k.viewerId, k.scope, k.entityId, k.subjectCode, k.audienceKey].join('|')

export function createMemoryStore(opts: { available?: boolean } = {}): SummaryStore & { rows: Map<string, StoredSummary> } {
  const rows = new Map<string, StoredSummary>()
  const available = opts.available !== false
  const byId = (id: string, viewerId: string): StoredSummary | null => [...rows.values()].find((r) => r.id === id && r.viewerId === viewerId) ?? null
  return {
    rows,
    async find(k) { return available ? (rows.get(keyString(k)) ?? null) : null },
    async findById(id, viewerId) { return available ? byId(id, viewerId) : null },
    async upsert(r) {
      if (!available) return null
      const existing = rows.get(keyString(r))
      const saved: StoredSummary = { ...r, id: existing?.id ?? randomUUID(), editedText: null }
      rows.set(keyString(r), saved)
      return saved
    },
    async setEdited(id, viewerId, editedText, nowIso) {
      if (!available) return null
      const cur = byId(id, viewerId)
      if (!cur) return null
      const next = { ...cur, editedText, updatedAt: nowIso }
      rows.set(keyString(cur), next)
      return next
    },
    async countGeneratedSince(viewerId, sinceIso) {
      if (!available) return null
      return [...rows.values()].filter((r) => r.viewerId === viewerId && r.createdAt >= sinceIso).length
    },
  }
}
