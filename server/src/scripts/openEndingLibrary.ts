/* ───────────────────────────────────────────────────────────
   openEndingLibrary — המרת סצנות הסיום הקיימות: אין "סיום טוב" ואין "סיום רע", יש סיפור שנסגר וסיפור שנשאר פתוח
   (CLAUDE.md "תחושת משחק: כללים", כלל 5). עובר על השיעורים (quests.game_data) ועל הווריאציות האישיות (quest_variants.game_data).
   משוכתב: endingBad (כותרת, נרטיב, דברי ד"ר הולו) — "חסרות עוד תובנות כדי…" והזמנה לשחק שוב, בלי כישלון ובלי טון קודר.
   endingGood לא משתנה (--scan מדווח אם הופיע בו ביטוי אסור). אותו מנגנון כמו ההמרות הקודמות:
     1) dry-run (ברירת מחדל): בלי כתיבה ל-DB, כותב דוח JSON עם לפני/אחרי.
        npx tsx src/scripts/openEndingLibrary.ts --out <file> [--only <questId>] [--limit N]
     2) apply: כותב מתוך הדוח בלבד (בלי קריאות מודל), ורק אם השורה לא השתנתה מאז (hash). הגרסה הקודמת נשמרת ב-quest_ending_conversion.
        npx tsx src/scripts/openEndingLibrary.ts --apply-from <file>
   שחזור: --restore <questId> [--student <id>]  |  --restore-all     ספירה: --scan
   כל שינוי עובר בדיקות: פנייה בלשון רבים, לינט לשוני, בטיחות ועובדות. טקסט שנכשל נשאר כמו שהוא ומסומן "review".
   ─────────────────────────────────────────────────────────── */
import '../env.js'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { supabaseAdmin } from '../lib/supabase.js'
import { extractJson, lintDetachedClitics, lintHighRegister, lintKnownErrors, type GameData } from '../lib/questSchemas.js'
import { findAddressViolations } from '../lib/studentAddress.js'
import { runOutputSafetyCheck } from '../lib/contentSafety.js'
import { runFactCheck } from '../lib/factCheck.js'
import { callClaude } from '../lib/claudeCalls.js'
import { endingProblem, FORBIDDEN_ENDING_RE, needsEndingRewrite, type EndingText } from '../lib/openEnding.js'

const args = process.argv.slice(2)
const flag = (n: string) => args.includes(`--${n}`)
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined }
const hash = (v: unknown) => createHash('sha1').update(JSON.stringify(v)).digest('hex')

type Target = 'quest' | 'variant'
interface Row { target: Target; questId: string; studentId: string | null; title: string; gd: GameData }
interface Entry {
  target: Target; questId: string; studentId: string | null; title: string
  status: 'clean' | 'ok' | 'review'
  reasons: string[]
  sourceHash: string
  before?: { good?: EndingText; bad?: EndingText }
  after?: { good?: EndingText; bad?: EndingText }
}
type Gd = GameData & { endingGood?: EndingText; endingBad?: EndingText }

const INSTRUCTION = `אתה עורך תוכן בעברית למשחק לימודי לילדים. בסוף כל שיעור יש שני מצבים בלבד: "הסיפור נסגר" ו"הסיפור נשאר פתוח".
אין "סיום טוב" ואין "סיום רע". כתוב מחדש את הטקסט של המצב "הסיפור נשאר פתוח":
- מה כבר הושג בסיפור, ומה עוד לא נפתר. ה-narrative חייב לכלול את המשפט "חסרות עוד תובנות כדי…" (המשך המשפט לפי הסיפור עצמו).
- הזמנה לשחק שוב, בדברי ד"ר הולו (drHoloDialog): "בואו נחזור…", "בואו נצא שוב…", "נסו שוב…". לא "בואו תחזרו".
- בלי "נכשלתם", "הפסדתם", "לא הצלחתם", "לצערי", "כמעט", ובלי טון קודר או מאשים.
- לשון רבים אל התלמידים ("חזרתם", "בואו"). שמור על אותן דמויות, אותם שמות ואותן עובדות. אל תמציא עובדה חדשה.
- אל תזכיר גבישים, קריסטלים, רסיסים או נקודות. אפשר לדבר על "תובנות".
- קצר: title עד 5 מילים, narrative עד 25 מילים, drHoloDialog עד 15 מילים. עברית טבעית ופשוטה, כמו לילדים.
החזר JSON בלבד: { "items": [ { "key": "...", "title": "...", "narrative": "...", "drHoloDialog": "..." } ] } באותו סדר.`

interface Req { key: string; lessonTitle: string; ending: EndingText; goodSummary: string }
async function rewrite(reqs: Req[]): Promise<Map<string, EndingText>> {
  const out = new Map<string, EndingText>()
  for (let i = 0; i < reqs.length; i += 15) {
    const part = reqs.slice(i, i + 15)
    const body = part.map((r) => JSON.stringify({ key: r.key, lesson: r.lessonTitle, whatHappensWhenClosed: r.goodSummary, current: r.ending })).join('\n')
    const text = await callClaude([{ role: 'user', content: `${INSTRUCTION}\n\n${body}` }])
    const parsed = extractJson(text) as { items?: { key?: string; title?: string; narrative?: string; drHoloDialog?: string }[] }
    for (const it of parsed.items ?? []) {
      if (it.key && it.title && it.narrative) out.set(it.key, { title: it.title.trim(), narrative: it.narrative.trim(), drHoloDialog: it.drHoloDialog?.trim() })
    }
  }
  return out
}

/* שכתוב, ועוד סבב אחד למי שלא עבר את בדיקת הצורה: לא יצא טקסט, או שהוא לא עומד בכללים */
async function rewriteWithRetry(reqs: Req[]): Promise<Map<string, EndingText>> {
  const out = await rewrite(reqs)
  const again = reqs.filter((r) => { const t = out.get(r.key); return !t || endingProblem(t) })
  if (again.length) for (const [k, v] of await rewrite(again)) out.set(k, v)
  return out
}

async function loadRows(): Promise<Row[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += 50) {
    const { data, error } = await supabaseAdmin.from('quests').select('id, title, game_data').order('created_at').range(from, from + 49)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    for (const q of data as unknown as { id: string; title: string; game_data: GameData | null }[]) {
      if (q.game_data && (q.game_data as Gd).endingBad) rows.push({ target: 'quest', questId: q.id, studentId: null, title: q.title, gd: q.game_data })
    }
  }
  const { data: vars } = await supabaseAdmin.from('quest_variants').select('quest_id, student_id, game_data')
  for (const v of (vars ?? []) as unknown as { quest_id: string; student_id: string; game_data: GameData | null }[]) {
    if (v.game_data && (v.game_data as Gd).endingBad) rows.push({ target: 'variant', questId: v.quest_id, studentId: v.student_id, title: `(וריאציה) ${v.quest_id}`, gd: v.game_data })
  }
  const only = opt('only')
  const filtered = only ? rows.filter((r) => r.questId === only) : rows
  const limit = Number(opt('limit') ?? 0)
  return limit > 0 ? filtered.slice(0, limit) : filtered
}

/* כל הבדיקות של טקסט חדש: ביטוי אסור, אורך, פנייה, לינט, בטיחות ועובדות (רק ממצאים חדשים מול המקור) */
async function verify(row: Row, next: EndingText): Promise<string[]> {
  const prev = (row.gd as Gd).endingBad!
  const problems: string[] = []
  const shape = endingProblem(next)
  if (shape) problems.push(shape)
  const gd = { ...row.gd, scenes: [], endingBad: next, endingGood: undefined } as unknown as GameData
  const prevGd = { ...row.gd, scenes: [], endingBad: prev, endingGood: undefined } as unknown as GameData
  const before = new Set(findAddressViolations(prevGd).map((v) => v.match))
  for (const v of findAddressViolations(gd)) if (!before.has(v.match)) problems.push(`פנייה: ${v.match}`)
  const lints = (g: GameData) => [...lintDetachedClitics(g), ...lintHighRegister(g, 10), ...lintKnownErrors(g)].map((w) => w.problem)
  const lintBefore = new Set(lints(prevGd))
  for (const l of lints(gd)) if (!lintBefore.has(l)) problems.push(`לשון: ${l}`)
  /* תקלה טכנית בבדיקה (פלט לא תקין, עומס) היא לא ממצא: ניסיון נוסף אחד. נשארה תקלה — לא מאשרים, ומסומן לבדיקה */
  try {
    let safety = await runOutputSafetyCheck(gd)
    if (safety.technical) safety = await runOutputSafetyCheck(gd)
    if (safety.technical) problems.push('בטיחות: הבדיקה לא הושלמה')
    else if (safety.blocked) problems.push(`בטיחות: ${safety.category ?? ''}`)
  } catch { problems.push('בטיחות: הבדיקה לא הושלמה') }
  const factOf = async (g: GameData) => { let r = await runFactCheck(g); if (!r.ok) r = await runFactCheck(g); return r }
  try {
    const fc = await factOf(gd)
    if (!fc.ok) problems.push('עובדות: הבדיקה לא הושלמה')
    else if (fc.errors.length) {
      const base = await factOf(prevGd)
      if (!base.ok) problems.push('עובדות: הבדיקה לא הושלמה')
      else if (fc.errors.length > base.errors.length) for (const w of fc.errors) problems.push(`עובדות/לשון: ${w.problem}`)
    }
  } catch { problems.push('עובדות: הבדיקה לא הושלמה') }
  return problems
}

async function dryRun(): Promise<void> {
  const rows = await loadRows()
  const todo = rows.filter((r) => needsEndingRewrite((r.gd as Gd).endingBad))
  console.log(`שורות: ${rows.length}. לשכתוב: ${todo.length}`)
  /* חוק 12: למודל נשלח מפתח מספרי בלבד. לא מזהה תלמיד ולא מזהה שיעור; בווריאציה גם לא כותרת (שם רק מזהה) */
  const reqs = todo.map((r, i) => ({ key: `e${i}`, lessonTitle: r.target === 'quest' ? r.title : '', ending: (r.gd as Gd).endingBad!, goodSummary: (r.gd as Gd).endingGood?.narrative ?? '' }))
  const rewritten = await rewriteWithRetry(reqs)
  const keyOf = new Map(todo.map((r, i) => [r, `e${i}`]))
  const entries: Entry[] = []
  const one = async (r: Row): Promise<void> => {
    const base = { target: r.target, questId: r.questId, studentId: r.studentId, title: r.title, sourceHash: hash(r.gd) }
    const bad = (r.gd as Gd).endingBad!
    if (!needsEndingRewrite(bad)) { entries.push({ ...base, status: 'clean', reasons: [] }); return }
    const next = rewritten.get(keyOf.get(r) as string)
    if (!next) { entries.push({ ...base, status: 'review', reasons: ['המודל לא החזיר טקסט'], before: { bad } }); return }
    const problems = await verify(r, next)
    entries.push(problems.length === 0
      ? { ...base, status: 'ok', reasons: [], before: { bad }, after: { bad: next } }
      : { ...base, status: 'review', reasons: problems, before: { bad }, after: { bad: next } })
    process.stdout.write(problems.length === 0 ? '.' : 'x')
  }
  for (let i = 0; i < rows.length; i += 6) await Promise.all(rows.slice(i, i + 6).map(one))
  const out = opt('out') ?? 'open-ending-report.json'
  writeFileSync(out, JSON.stringify(entries, null, 2))
  const c = (s: Entry['status']) => entries.filter((e) => e.status === s).length
  console.log(`\nדוח: ${out}. נקי: ${c('clean')}, תקין לשמירה: ${c('ok')}, לבדיקה: ${c('review')}`)
}

async function apply(file: string): Promise<void> {
  const entries = JSON.parse(readFileSync(file, 'utf8')) as Entry[]
  let done = 0
  let skipped = 0
  for (const e of entries.filter((x) => x.status === 'ok' && x.after?.bad)) {
    const table = e.target === 'quest' ? 'quests' : 'quest_variants'
    let q = supabaseAdmin.from(table).select('game_data')
    q = e.target === 'quest' ? q.eq('id', e.questId) : q.eq('quest_id', e.questId).eq('student_id', e.studentId as string)
    const { data } = await q.maybeSingle()
    const gd = (data as { game_data?: Gd } | null)?.game_data
    if (!gd || hash(gd) !== e.sourceHash) { skipped++; console.log(`דילוג (השורה השתנתה): ${e.questId}`); continue }
    /* שורה אחת לכל שיעור/וריאציה: האינדקס הייחודי הוא על ביטוי (COALESCE), ולכן מוחקים ומוסיפים ולא upsert */
    let old = supabaseAdmin.from('quest_ending_conversion').delete().eq('quest_id', e.questId)
    old = e.studentId ? old.eq('student_id', e.studentId) : old.is('student_id', null)
    await old
    const { error: recErr } = await supabaseAdmin.from('quest_ending_conversion').insert({ quest_id: e.questId, student_id: e.studentId, previous_ending_good: gd.endingGood ?? null, previous_ending_bad: gd.endingBad ?? null, status: 'converted', detail: { reasons: e.reasons } })
    if (recErr) throw new Error(recErr.message)
    const merged = { ...gd, endingBad: { ...gd.endingBad, ...e.after!.bad } }
    let up = supabaseAdmin.from(table).update({ game_data: merged })
    up = e.target === 'quest' ? up.eq('id', e.questId) : up.eq('quest_id', e.questId).eq('student_id', e.studentId as string)
    const { error } = await up
    if (error) throw new Error(error.message)
    done++
  }
  console.log(`הומרו ${done}, דולגו ${skipped}. לבדיקה (לא נגענו): ${entries.filter((x) => x.status === 'review').length}`)
}

async function restore(): Promise<void> {
  const all = flag('restore-all')
  const questId = opt('restore')
  if (!all && !questId) throw new Error('--restore <questId> נדרש')
  let q = supabaseAdmin.from('quest_ending_conversion').select('quest_id, student_id, previous_ending_good, previous_ending_bad')
  if (!all) q = q.eq('quest_id', questId as string)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  for (const r of (data ?? []) as { quest_id: string; student_id: string | null; previous_ending_good: unknown; previous_ending_bad: unknown }[]) {
    const table = r.student_id ? 'quest_variants' : 'quests'
    let s = supabaseAdmin.from(table).select('game_data')
    s = r.student_id ? s.eq('quest_id', r.quest_id).eq('student_id', r.student_id) : s.eq('id', r.quest_id)
    const { data: cur } = await s.maybeSingle()
    const gd = (cur as { game_data?: Gd } | null)?.game_data
    if (!gd) continue
    const merged = { ...gd, endingGood: r.previous_ending_good ?? gd.endingGood, endingBad: r.previous_ending_bad ?? gd.endingBad }
    let up = supabaseAdmin.from(table).update({ game_data: merged })
    up = r.student_id ? up.eq('quest_id', r.quest_id).eq('student_id', r.student_id) : up.eq('id', r.quest_id)
    await up
    console.log(`שוחזר: ${r.quest_id}`)
  }
}

async function scan(): Promise<void> {
  const rows = await loadRows()
  const need = rows.filter((r) => needsEndingRewrite((r.gd as Gd).endingBad))
  const forbidden = rows.filter((r) => FORBIDDEN_ENDING_RE.test(JSON.stringify([(r.gd as Gd).endingBad, (r.gd as Gd).endingGood])))
  console.log(`שורות עם סצנת סיום: ${rows.length}. לשכתוב: ${need.length}. עם ביטוי אסור: ${forbidden.length}`)
  for (const r of need.slice(0, 8)) console.log(`  ${r.title}: ${(r.gd as Gd).endingBad?.title} — ${((r.gd as Gd).endingBad?.narrative ?? '').slice(0, 80)}`)
}

const main = async () => {
  if (flag('scan')) return scan()
  if (opt('apply-from')) return apply(opt('apply-from') as string)
  if (flag('restore-all') || opt('restore')) return restore()
  return dryRun()
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
