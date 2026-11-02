/* ───────────────────────────────────────────────────────────
   holoMoodLibrary — בחירת מצבי הרוח של ד"ר הולו לשיעורים הקיימים (game_data.holoMoods: פתיחה, סיפור נסגר, סיפור פתוח),
   לפי הטקסט הקיים של אותם מסכים. שיעור בלי השדה מקבל בנגן ברירות מחדל (רגיל, שמח, עצוב), ולכן אין חובה להריץ.
   אותו מנגנון כמו ההמרות הקודמות:
     1) dry-run (ברירת מחדל): בלי כתיבה ל-DB, כותב דוח JSON.
        npx tsx src/scripts/holoMoodLibrary.ts --out <file> [--only <questId>] [--limit N]
     2) apply: כותב מתוך הדוח בלבד (בלי קריאות מודל), ורק אם השורה לא השתנתה מאז (hash). וריאציות אישיות מקבלות את מצבי הרוח של השיעור.
        npx tsx src/scripts/holoMoodLibrary.ts --apply-from <file>
   שחזור: --restore <questId> | --restore-all (מוחק את השדה, והנגן חוזר לברירות המחדל).   ספירה: --scan
   ערך שלא ברשימה הסגורה הופך ל"רגיל" (normalizeHoloMood) ומסומן בדוח. למודל נשלח מפתח מספרי וטקסט השיעור בלבד.
   ─────────────────────────────────────────────────────────── */
import '../env.js'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { supabaseAdmin } from '../lib/supabase.js'
import { callHaiku } from '../lib/claudeCalls.js'
import { extractJson } from '../lib/questSchemas.js'
import { DEFAULT_LAB_MOODS, HOLO_MOODS, HOLO_MOOD_LABELS, normalizeHoloMood, type LabMoods } from '../../../src/shared/lib/holoMoods.js'

const args = process.argv.slice(2)
const flag = (n: string) => args.includes(`--${n}`)
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined }
const hash = (v: unknown) => createHash('sha1').update(JSON.stringify(v)).digest('hex')

interface TextBlock { title?: string; narrative?: string; drHoloDialog?: string }
interface Gd { scenes?: (TextBlock & { id: string })[]; entrySceneId?: string; endingGood?: TextBlock; endingBad?: TextBlock; holoMoods?: unknown }
interface Row { questId: string; title: string; gd: Gd }
interface Entry { questId: string; title: string; status: 'has' | 'ok' | 'review'; reasons: string[]; sourceHash: string; moods?: LabMoods; raw?: unknown }

const LIST = HOLO_MOODS.map((m) => `${m} (${HOLO_MOOD_LABELS[m]})`).join(', ')
const INSTRUCTION = `אתה עורך תוכן של משחק לימודי לילדים. ד"ר הולו, מדען הולוגרפי, מופיע בשלושה מסכים: פתיחה (opening), סיפור שנסגר (closed), וסיפור שנשאר פתוח כי חסרות עוד תובנות (open).
בחר לכל מסך מצב רוח אחד של ד"ר הולו לפי הטון של הטקסט. רק מהרשימה הסגורה: ${LIST}.
כללים: בלי דרמה מיותרת. בפתיחה דחופה scared או surprised, ובפתיחה רגועה neutral או amused. ב-closed בדרך כלל happy, celebrating אם יש ניצחון גדול. ב-open תמיד sad (הנגן מציג sad בכל מקרה).
החזר JSON בלבד: { "items": [ { "key": "...", "opening": "...", "closed": "...", "open": "..." } ] } באותו סדר.`

const textOf = (t?: TextBlock) => [t?.title, t?.narrative, t?.drHoloDialog].filter(Boolean).join(' · ').slice(0, 400)

async function choose(rows: Row[]): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>()
  for (let i = 0; i < rows.length; i += 15) {
    const part = rows.slice(i, i + 15)
    const body = part.map((r, j) => {
      const entry = r.gd.scenes?.find((s) => s.id === r.gd.entrySceneId)
      return JSON.stringify({ key: `m${i + j}`, opening: textOf(entry), closed: textOf(r.gd.endingGood), open: textOf(r.gd.endingBad) })
    }).join('\n')
    const text = await callHaiku([{ role: 'user', content: `${INSTRUCTION}\n\n${body}` }], 2000)
    const parsed = extractJson(text) as { items?: ({ key?: string } & Record<string, unknown>)[] }
    for (const it of parsed.items ?? []) if (it.key) out.set(it.key, it)
    process.stdout.write('.')
  }
  return out
}

async function loadRows(): Promise<Row[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += 50) {
    const { data, error } = await supabaseAdmin.from('quests').select('id, title, game_data').order('created_at').range(from, from + 49)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    for (const q of data as unknown as { id: string; title: string; game_data: Gd | null }[]) {
      if (q.game_data?.scenes?.length) rows.push({ questId: q.id, title: q.title, gd: q.game_data })
    }
  }
  const only = opt('only')
  const filtered = only ? rows.filter((r) => r.questId === only) : rows
  const limit = Number(opt('limit') ?? 0)
  return limit > 0 ? filtered.slice(0, limit) : filtered
}

async function dryRun(): Promise<void> {
  const rows = await loadRows()
  const todo = rows.filter((r) => !r.gd.holoMoods)
  console.log(`שיעורים: ${rows.length}. בלי מצבי רוח: ${todo.length}`)
  const chosen = await choose(todo)
  const entries: Entry[] = rows.filter((r) => r.gd.holoMoods).map((r) => ({ questId: r.questId, title: r.title, status: 'has', reasons: [], sourceHash: hash(r.gd) }))
  todo.forEach((r, i) => {
    const base = { questId: r.questId, title: r.title, sourceHash: hash(r.gd) }
    const raw = chosen.get(`m${i}`)
    if (!raw) { entries.push({ ...base, status: 'review', reasons: ['המודל לא החזיר תשובה'] }); return }
    /* שיעור ישן בלי סצנות סיום: למודל אין טקסט, ולכן נשארת ברירת המחדל של אותו מסך */
    const pick = (k: keyof LabMoods) => (raw[k] ? normalizeHoloMood(raw[k]) : DEFAULT_LAB_MOODS[k])
    const moods: LabMoods = { opening: pick('opening'), closed: pick('closed'), open: pick('open') }
    const reasons = (['opening', 'closed', 'open'] as const).filter((k) => raw[k] && !(HOLO_MOODS as readonly unknown[]).includes(raw[k])).map((k) => `${k}: ערך לא ברשימה (${String(raw[k])}) הפך לרגיל`)
    entries.push({ ...base, status: 'ok', reasons, moods, raw })
  })
  const out = opt('out') ?? 'holo-mood-report.json'
  writeFileSync(out, JSON.stringify(entries, null, 2))
  const dist: Record<string, Record<string, number>> = { opening: {}, closed: {}, open: {} }
  for (const e of entries) for (const k of ['opening', 'closed', 'open'] as const) if (e.moods) dist[k][e.moods[k]] = (dist[k][e.moods[k]] ?? 0) + 1
  console.log(`\nדוח: ${out}. תקין: ${entries.filter((e) => e.status === 'ok').length}, לבדיקה: ${entries.filter((e) => e.status === 'review').length}, כבר עם מצבי רוח: ${entries.filter((e) => e.status === 'has').length}, ערכים שתוקנו: ${entries.filter((e) => e.reasons.length && e.status === 'ok').length}`)
  console.log(JSON.stringify(dist))
}

async function apply(file: string): Promise<void> {
  const entries = JSON.parse(readFileSync(file, 'utf8')) as Entry[]
  let done = 0
  let skipped = 0
  for (const e of entries.filter((x) => x.status === 'ok' && x.moods)) {
    const { data } = await supabaseAdmin.from('quests').select('game_data').eq('id', e.questId).maybeSingle()
    const gd = (data as { game_data?: Gd } | null)?.game_data
    if (!gd || hash(gd) !== e.sourceHash) { skipped++; console.log(`דילוג (השורה השתנתה): ${e.questId}`); continue }
    const { error } = await supabaseAdmin.from('quests').update({ game_data: { ...gd, holoMoods: e.moods } }).eq('id', e.questId)
    if (error) throw new Error(error.message)
    const { data: vars } = await supabaseAdmin.from('quest_variants').select('student_id, game_data').eq('quest_id', e.questId)
    for (const v of (vars ?? []) as unknown as { student_id: string; game_data: Gd | null }[]) {
      if (v.game_data) await supabaseAdmin.from('quest_variants').update({ game_data: { ...v.game_data, holoMoods: e.moods } }).eq('quest_id', e.questId).eq('student_id', v.student_id)
    }
    done++
  }
  console.log(`עודכנו ${done}, דולגו ${skipped}`)
}

async function restore(): Promise<void> {
  const all = flag('restore-all')
  const questId = opt('restore')
  if (!all && !questId) throw new Error('--restore <questId> נדרש')
  const rows = (await loadRows()).filter((r) => r.gd.holoMoods && (all || r.questId === questId))
  for (const r of rows) {
    const { holoMoods: _drop, ...rest } = r.gd
    await supabaseAdmin.from('quests').update({ game_data: rest }).eq('id', r.questId)
    const { data: vars } = await supabaseAdmin.from('quest_variants').select('student_id, game_data').eq('quest_id', r.questId)
    for (const v of (vars ?? []) as unknown as { student_id: string; game_data: Gd | null }[]) {
      if (!v.game_data) continue
      const { holoMoods: _v, ...vrest } = v.game_data
      await supabaseAdmin.from('quest_variants').update({ game_data: vrest }).eq('quest_id', r.questId).eq('student_id', v.student_id)
    }
    console.log(`שוחזר: ${r.questId}`)
  }
}

const main = async () => {
  if (flag('scan')) { const rows = await loadRows(); console.log(`שיעורים: ${rows.length}. עם מצבי רוח: ${rows.filter((r) => r.gd.holoMoods).length}`); return }
  if (opt('apply-from')) return apply(opt('apply-from') as string)
  if (flag('restore-all') || opt('restore')) return restore()
  return dryRun()
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
