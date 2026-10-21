/* ──────────────────────────────────────────────────────────────────────────
   pluralizeLibrary — המרת תוכן קיים ללשון רבים אחידה (CLAUDE.md "פנייה לתלמיד").
   עובר על כל ההדמיות (quests.game_data) והווריאציות האישיות (quest_variants.game_data): סצנות, דיאלוגים, הוראות,
   אפשרויות, סיומים. רק מקטעים שהבדיקה הדטרמיניסטית סימנה משוכתבים (בקשת תיקון אחת), ואז:
     · מבנה זהה (מזהים/תשובות/קישורים לא נגעו) · אפס הפרות נותרו · אין לינט חדש (דקדוק/משלב/שגיאות/חזרתיות/עקביות-תשובות)
     · בדיקת בטיחות על הסצנות ששונו · בדיקת עובדות (הסצנות ששונו) בלי ממצאים חדשים מול המקור
   מי שלא עבר נשאר **כמו שהוא** ומסומן "לבדיקה" — לא נשמרת גרסה כושלת.
   שני שלבים (כדי שמה שנבדק הוא מה שנכתב):
     1) dry-run (ברירת מחדל): מריץ הכול בלי לכתוב ל-DB, וכותב דוח (JSON) עם לפני/אחרי לכל מקטע.
        npx tsx src/scripts/pluralizeLibrary.ts --out <file> [--only <questId>] [--limit N] [--retry-review]
     2) apply: כותב מתוך קובץ ה-dry-run בלבד (ללא קריאות מודל), בתנאי שהשורה לא השתנתה מאז (hash). לכל שינוי נשמרת
        הגרסה הקודמת ב-quest_address_conversion. idempotent: שורה שכבר הומרה/סומנה מדולגת.
        npx tsx src/scripts/pluralizeLibrary.ts --apply-from <file>
   שחזור: --restore <questId> [--student <studentId>]   |   --restore-all
   ────────────────────────────────────────────────────────────────────────── */
import '../env.js'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { supabaseAdmin } from '../lib/supabase.js'
import { checkAnswerConsistency, lintDetachedClitics, lintHighRegister, lintKnownErrors, lintRepetition, type GameData } from '../lib/questSchemas.js'
import { findAddressViolations, fixStudentAddress, listTextSlots } from '../lib/studentAddress.js'
import { runOutputSafetyCheck } from '../lib/contentSafety.js'
import { runFactCheck } from '../lib/factCheck.js'
import { callClaude } from '../lib/claudeCalls.js'

const args = process.argv.slice(2)
const flag = (n: string) => args.includes(`--${n}`)
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined }

type Target = 'quest' | 'variant'
interface Row { target: Target; questId: string; studentId: string | null; title: string; gd: GameData }
interface SlotChange { key: string; sceneId: string; field: string; before: string; after: string }
export interface Entry {
  target: Target; questId: string; studentId: string | null; title: string
  status: 'clean' | 'ok' | 'review'
  reasons: string[]
  sourceHash: string
  changes: SlotChange[]
  /* מקטעים שהמודל קבע שנשארה בהם רק פנייה של דמות לדמות (מותר) — לבדיקה אנושית בדוח */
  keptCharacterSpeech?: { key: string; text: string }[]
  converted?: GameData
}

const hash = (gd: unknown) => createHash('sha1').update(JSON.stringify(gd)).digest('hex')
const wc = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

/* מבנה בלי הטקסטים — חייב להיות זהה לפני/אחרי */
function structureOf(gd: GameData): string {
  const c = JSON.parse(JSON.stringify(gd)) as GameData
  for (const s of listTextSlots(c)) s.set('')
  return JSON.stringify(c)
}

function lintKeys(gd: GameData): Set<string> {
  const all = [...lintDetachedClitics(gd), ...lintHighRegister(gd, 10), ...lintKnownErrors(gd), ...lintRepetition(gd)].map((x) => `${x.sceneId}|${x.problem.slice(0, 12)}`)
  const cons = checkAnswerConsistency(gd)
  for (const b of [...cons.blocking, ...cons.warnings]) all.push(`cons|${b.slice(0, 60)}`)
  return new Set(all)
}

/* הסצנות/סיומים ששונו, כמשחק מצומצם (לבדיקות LLM יקרות) */
function reduced(gd: GameData, ids: Set<string>): GameData {
  const r: Record<string, unknown> = { ...(gd as unknown as Record<string, unknown>) }
  r.scenes = gd.scenes.filter((s) => ids.has(s.id))
  if (!ids.has('__endingGood__')) delete r.endingGood
  if (!ids.has('__endingBad__')) delete r.endingBad
  return r as unknown as GameData
}

async function process1(row: Row): Promise<Entry> {
  const base = { target: row.target, questId: row.questId, studentId: row.studentId, title: row.title, sourceHash: hash(row.gd) }
  if (findAddressViolations(row.gd).length === 0) return { ...base, status: 'clean', reasons: [], changes: [] }

  const clone = JSON.parse(JSON.stringify(row.gd)) as GameData
  const before = new Map(listTextSlots(row.gd).map((s) => [s.key, s.get()]))
  /* ספרייה קיימת: ההמרה נעשית ב-Sonnet (ולא haiku) — איכות עברית גבוהה יותר (נצפה "במו עיניים" בהרצת haiku) */
  const fix = await fixStudentAddress(clone, { call: (instruction) => callClaude([{ role: 'user', content: instruction }]) })
  const changes: SlotChange[] = listTextSlots(clone)
    .filter((s) => (before.get(s.key) ?? '').replace(/\s+/g, ' ').trim() !== s.get().replace(/\s+/g, ' ').trim())
    .map((s) => ({ key: s.key, sceneId: s.sceneId, field: s.field, before: before.get(s.key) ?? '', after: s.get() }))
  const keptCharacterSpeech = fix.kept.map((k) => ({ key: k, text: listTextSlots(clone).find((s) => s.key === k)?.get() ?? '' }))
  const review = (reasons: string[]): Entry => ({ ...base, status: 'review', reasons, changes, keptCharacterSpeech })

  if (fix.remaining.length > 0) return review([`נותרו ${fix.remaining.length} הפרות אחרי תיקון אחד: ` + fix.remaining.slice(0, 4).map((r) => `${r.sceneId}/${r.field} "${r.context}"`).join(' · ')])
  if (changes.length === 0) return fix.kept.length > 0 ? { ...base, status: 'clean', reasons: ['נשארו רק פניות של דמות לדמות'], changes: [], keptCharacterSpeech } : review(['לא בוצע שינוי (התיקון נכשל)'])
  if (structureOf(row.gd) !== structureOf(clone)) return review(['המבנה השתנה (חוץ מהטקסטים)'])
  for (const c of changes) if (wc(c.after) > wc(c.before) * 1.3 + 2) return review([`מקטע התארך משמעותית: ${c.sceneId}/${c.field}`])

  const lintBefore = lintKeys(row.gd)
  const newLint = [...lintKeys(clone)].filter((k) => !lintBefore.has(k))
  if (newLint.length) return review(['לינט חדש: ' + newLint.slice(0, 3).join(' · ')])

  const ids = new Set(changes.map((c) => c.sceneId))
  const safety = await runOutputSafetyCheck(reduced(clone, ids)).catch(() => ({ blocked: true, technical: true }) as { blocked: boolean; technical?: boolean })
  if (safety.blocked) return review([safety.technical ? 'בדיקת הבטיחות לא זמינה' : 'בדיקת הבטיחות חסמה'])

  /* בדיקת העובדות לעיתים נכשלת טכנית (JSON שבור) — ניסיון חוזר אחד */
  const noAddress = <T extends { problem: string }>(errs: T[]) => errs.filter((e) => !/פנייה לתלמיד|סוג 9|הלינט של סוג/.test(e.problem))
  const factOf = async (g: GameData) => { let r = await runFactCheck(g); if (!r.ok) r = await runFactCheck(g); return { ...r, errors: noAddress(r.errors) } }
  const [b, a] = await Promise.all([factOf(reduced(row.gd, ids)), factOf(reduced(clone, ids))])
  if (!a.ok) return review(['בדיקת העובדות לא זמינה'])
  type FE = { sceneId?: string; problem: string }
  const perScene = (errs: { sceneId?: string }[]) => errs.reduce<Record<string, number>>((m, e) => { const k = e.sceneId ?? '?'; m[k] = (m[k] ?? 0) + 1; return m }, {})
  const bc = perScene(b.ok ? b.errors : []), ac = perScene(a.errors)
  let worse = Object.keys(ac).filter((k) => ac[k] > (bc[k] ?? 0))
  if (worse.length) {
    /* הבודק-AI לא דטרמיניסטי — מאשרים את הפער בהרצה שנייה על אותן סצנות (מקור מול מומר) לפני שחוסמים */
    const ws = new Set(worse)
    const [b2, a2] = await Promise.all([factOf(reduced(row.gd, ws)), factOf(reduced(clone, ws))])
    const bc2 = perScene(b2.ok ? b2.errors : []), ac2 = perScene(a2.ok ? a2.errors : [])
    worse = worse.filter((k) => (ac2[k] ?? 0) > (bc2[k] ?? 0) && (ac[k] ?? 0) > (bc[k] ?? 0))
    if (worse.length) {
      const sample = (a2.ok ? a2.errors : a.errors).filter((e: FE) => worse.includes(e.sceneId ?? '?')).slice(0, 2).map((e: FE) => `${e.sceneId}: ${e.problem.slice(0, 140)}`)
      return review(['ממצאי עובדות/לשון חדשים בסצנות: ' + worse.join(', ') + ' — ' + sample.join(' · ')])
    }
  }

  return { ...base, status: 'ok', reasons: [], changes, keptCharacterSpeech, converted: clone }
}

async function loadRows(): Promise<Row[]> {
  const rows: Row[] = []
  const only = opt('only')
  for (let from = 0; ; from += 100) {
    let q = supabaseAdmin.from('quests').select('id, title, game_data').not('game_data', 'is', null).order('id').range(from, from + 99)
    if (only) q = q.eq('id', only)
    const { data, error } = await q
    if (error) throw new Error('quests: ' + error.message)
    for (const r of data ?? []) if ((r.game_data as GameData)?.scenes?.length) rows.push({ target: 'quest', questId: r.id as string, studentId: null, title: (r.title as string) ?? '', gd: r.game_data as GameData })
    if (!data || data.length < 100) break
  }
  const titles = new Map(rows.map((r) => [r.questId, r.title]))
  for (let from = 0; ; from += 100) {
    let q = supabaseAdmin.from('quest_variants').select('quest_id, student_id, game_data').order('quest_id').range(from, from + 99)
    if (only) q = q.eq('quest_id', only)
    const { data, error } = await q
    if (error) { console.log('quest_variants לא נקראו:', error.message); break }
    for (const r of data ?? []) if ((r.game_data as GameData)?.scenes?.length) rows.push({ target: 'variant', questId: r.quest_id as string, studentId: r.student_id as string, title: titles.get(r.quest_id as string) ?? '', gd: r.game_data as GameData })
    if (!data || data.length < 100) break
  }
  return rows
}

/* שמירת רשומה (select ואז insert/update): אינדקסי ה-unique חלקיים, ולכן upsert של PostgREST לא מתאים */
async function saveRecord(rec: { target: Target; quest_id: string; student_id: string | null; status: string; previous_game_data: unknown; issues: unknown }): Promise<string | null> {
  let q = supabaseAdmin.from('quest_address_conversion').select('id').eq('target', rec.target).eq('quest_id', rec.quest_id)
  q = rec.student_id ? q.eq('student_id', rec.student_id) : q.is('student_id', null)
  const { data: ex, error: se } = await q.maybeSingle()
  if (se) return se.message
  const body = { ...rec, updated_at: new Date().toISOString() }
  const { error } = ex
    ? await supabaseAdmin.from('quest_address_conversion').update(body).eq('id', (ex as { id: string }).id)
    : await supabaseAdmin.from('quest_address_conversion').insert(body)
  return error?.message ?? null
}

async function loadRecords(): Promise<Map<string, string>> {
  const m = new Map<string, string>()
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabaseAdmin.from('quest_address_conversion').select('target, quest_id, student_id, status').range(from, from + 499)
    if (error) throw new Error('quest_address_conversion: ' + error.message + ' (הרץ את migrations/quest_address_conversion.sql)')
    for (const r of data ?? []) m.set(`${r.target}:${r.quest_id}:${r.student_id ?? ''}`, r.status as string)
    if (!data || data.length < 500) break
  }
  return m
}
const keyOf = (t: Target, q: string, s: string | null) => `${t}:${q}:${s ?? ''}`

async function dryRun(): Promise<void> {
  const out = opt('out')
  if (!out) throw new Error('--out <file> נדרש')
  const prev: Entry[] = opt('redo-review') ? (JSON.parse(readFileSync(opt('redo-review') as string, 'utf8')) as { entries: Entry[] }).entries : []
  const records = await loadRecords()
  let rows = await loadRows()
  const retry = flag('retry-review')
  if (prev.length) {
    const redo = new Set(prev.filter((e) => e.status === 'review').map((e) => keyOf(e.target, e.questId, e.studentId)))
    rows = rows.filter((r) => redo.has(keyOf(r.target, r.questId, r.studentId)))
  } else rows = rows.filter((r) => { const st = records.get(keyOf(r.target, r.questId, r.studentId)); return !st || st === 'restored' || (st === 'review' && retry) })
  const limit = Number(opt('limit') ?? 0)
  console.log(`שורות לבדיקה: ${rows.length} (הדמיות ${rows.filter((r) => r.target === 'quest').length}, וריאציות ${rows.filter((r) => r.target === 'variant').length})`)
  const entries: Entry[] = []
  let idx = 0
  let processed = 0
  async function worker(): Promise<void> {
    while (idx < rows.length) {
      if (limit && processed >= limit) return
      const row = rows[idx++]
      processed++
      try {
        const e = await process1(row)
        entries.push(e)
        if (e.status !== 'clean') console.log(`${e.status === 'ok' ? '✓' : '✗'} ${e.target} ${e.questId.slice(0, 8)} "${e.title.slice(0, 30)}" — ${e.changes.length} מקטעים${e.reasons.length ? ' — ' + e.reasons[0].slice(0, 120) : ''}`)
      } catch (err) {
        entries.push({ target: row.target, questId: row.questId, studentId: row.studentId, title: row.title, status: 'review', reasons: ['חריגה: ' + (err instanceof Error ? err.message : String(err))], sourceHash: hash(row.gd), changes: [] })
      }
    }
  }
  await Promise.all([worker(), worker(), worker()])
  const merged = prev.length ? [...prev.filter((e) => !entries.some((n) => keyOf(n.target, n.questId, n.studentId) === keyOf(e.target, e.questId, e.studentId))), ...entries] : entries
  writeFileSync(out, JSON.stringify({ createdAt: new Date().toISOString(), entries: merged }, null, 1))
  summary(merged)
  process.exit(0)
}

function summary(entries: Entry[]): void {
  const by = (s: Entry['status'], t?: Target) => entries.filter((e) => e.status === s && (!t || e.target === t))
  const scenes = (es: Entry[]) => es.reduce((n, e) => n + new Set(e.changes.map((c) => c.sceneId)).size, 0)
  console.log(JSON.stringify({
    checked: entries.length, clean: by('clean').length,
    converted: { quests: by('ok', 'quest').length, variants: by('ok', 'variant').length, scenes: scenes(by('ok')), slots: by('ok').reduce((n, e) => n + e.changes.length, 0) },
    review: { quests: by('review', 'quest').length, variants: by('review', 'variant').length },
  }))
}

async function apply(file: string): Promise<void> {
  const { entries } = JSON.parse(readFileSync(file, 'utf8')) as { entries: Entry[] }
  const records = await loadRecords()
  let done = 0, skippedChanged = 0, skippedDone = 0, reviews = 0, failed = 0
  for (const e of entries) {
    if (e.status === 'clean') continue
    const key = keyOf(e.target, e.questId, e.studentId)
    const had = records.get(key)
    if (had === 'converted' || (had === 'review' && e.status === 'review')) { skippedDone++; continue }
    if (e.status === 'review') {
      const error = await saveRecord({ target: e.target, quest_id: e.questId, student_id: e.studentId, status: 'review', previous_game_data: null, issues: { reasons: e.reasons, slots: e.changes.length } })
      if (error) { failed++; console.log('review לא נשמר:', e.questId, error) } else reviews++
      continue
    }
    /* status ok: ודא שהשורה לא השתנתה מאז ה-dry-run */
    const table = e.target === 'quest' ? 'quests' : 'quest_variants'
    let q = supabaseAdmin.from(table).select('game_data').eq(e.target === 'quest' ? 'id' : 'quest_id', e.questId)
    if (e.target === 'variant') q = q.eq('student_id', e.studentId as string)
    const { data: cur, error: ce } = await q.maybeSingle()
    if (ce || !cur) { failed++; console.log('שורה לא נמצאה:', e.questId, ce?.message ?? ''); continue }
    if (hash(cur.game_data) !== e.sourceHash) { skippedChanged++; console.log('דולג — השתנה מאז ה-dry-run:', e.questId.slice(0, 8)); continue }
    const ie = await saveRecord({ target: e.target, quest_id: e.questId, student_id: e.studentId, status: 'converted', previous_game_data: cur.game_data, issues: { slots: e.changes.length, scenes: new Set(e.changes.map((c) => c.sceneId)).size } })
    if (ie) { failed++; console.log('גרסה קודמת לא נשמרה — לא כותבים:', e.questId, ie); continue }
    let u = supabaseAdmin.from(table).update({ game_data: e.converted }).eq(e.target === 'quest' ? 'id' : 'quest_id', e.questId)
    if (e.target === 'variant') u = u.eq('student_id', e.studentId as string)
    const { error: ue } = await u
    if (ue) { failed++; console.log('עדכון נכשל:', e.questId, ue.message); continue }
    done++
  }
  console.log(JSON.stringify({ applied: done, review_recorded: reviews, skipped_already_done: skippedDone, skipped_changed_since_dry_run: skippedChanged, failed }))
  process.exit(0)
}

async function restore(): Promise<void> {
  const questId = opt('restore')
  const student = opt('student') ?? null
  let q = supabaseAdmin.from('quest_address_conversion').select('*').eq('status', 'converted')
  if (!flag('restore-all')) {
    if (!questId) throw new Error('--restore <questId> נדרש')
    q = q.eq('quest_id', questId)
    q = student ? q.eq('target', 'variant').eq('student_id', student) : q.eq('target', 'quest')
  }
  const { data, error } = await q
  if (error) throw new Error(error.message)
  let n = 0
  for (const r of data ?? []) {
    const table = r.target === 'quest' ? 'quests' : 'quest_variants'
    let u = supabaseAdmin.from(table).update({ game_data: r.previous_game_data }).eq(r.target === 'quest' ? 'id' : 'quest_id', r.quest_id)
    if (r.target === 'variant') u = u.eq('student_id', r.student_id)
    const { error: ue } = await u
    if (ue) { console.log('שחזור נכשל:', r.quest_id, ue.message); continue }
    await supabaseAdmin.from('quest_address_conversion').update({ status: 'restored', updated_at: new Date().toISOString() }).eq('id', r.id)
    n++
  }
  console.log(`שוחזרו ${n}`)
  process.exit(0)
}

/* --scan: ספירה בלבד (בלי מודל ובלי כתיבה) — כמה הדמיות/מקטעים מוסרים הפרות, לפי סוג + דוגמאות להערכת false-positive */
async function scan(): Promise<void> {
  const rows = await loadRows()
  const kinds: Record<string, number> = {}
  const dirty: Record<Target, number> = { quest: 0, variant: 0 }
  const samples: Record<string, string[]> = {}
  let slots = 0
  for (const r of rows) {
    const v = findAddressViolations(r.gd)
    if (v.length) dirty[r.target]++
    slots += new Set(v.map((x) => x.key)).size
    for (const x of v) {
      kinds[x.kind] = (kinds[x.kind] ?? 0) + 1
      ;(samples[x.kind] ??= []).length < 12 && samples[x.kind].push(`[${x.match}] …${x.context}…`)
    }
  }
  console.log(JSON.stringify({ rows: rows.length, quests: rows.filter((r) => r.target === 'quest').length, variants: rows.filter((r) => r.target === 'variant').length, dirty, slotsWithViolations: slots, kinds }))
  for (const k of Object.keys(samples)) { console.log('== ' + k); for (const s of samples[k]) console.log('  ' + s) }
  process.exit(0)
}

const main = async () => {
  if (flag('scan')) return scan()
  if (opt('apply-from')) return apply(opt('apply-from') as string)
  if (opt('restore') || flag('restore-all')) return restore()
  return dryRun()
}
main().catch((e) => { console.error(e); process.exit(1) })
