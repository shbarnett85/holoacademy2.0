/* ──────────────────────────────────────────────────────────────────────────
   lessonTermLibrary — המרת המינוח "הדמיה" → "שיעור" בתוכן קיים במסד (CLAUDE.md "מינוח").
   אותו מנגנון כמו pluralizeLibrary: dry-run → דוח → apply מתוך הדוח → שחזור. עובר על כל השיעורים (quests.game_data + quests.title)
   והווריאציות האישיות (quest_variants.game_data). כל מחרוזת שמכילה "הדמי…" (חוץ מ"הדמיונית") נכתבת מחדש כמשפט שלם — התאמת מין ומספר,
   לא החלפת מחרוזת — ואז:
     · אפס "הדמי…" נותר · ספרות, ‏{...} ו-___ זהים · לא התרחק מהמקור (חפיפת מילים) · אין הפרת פנייה חדשה (לשון רבים)
     · אין לינט חדש (דקדוק/משלב/שגיאות-ידועות/חזרתיות/עקביות-תשובות) · בדיקת בטיחות על הסצנות ששונו · בדיקת עובדות/לשון בלי ממצאים חדשים מול המקור
   מי שלא עבר נשאר **כמו שהוא** ומסומן "לבדיקה" — לא נשמרת גרסה כושלת. הגרסה הקודמת נשמרת ב-quest_term_conversion (migrations/quest_term_conversion.sql).
     1) dry-run (ברירת מחדל): בלי כתיבה ל-DB, כותב דוח JSON עם לפני/אחרי לכל מחרוזת.
        npx tsx src/scripts/lessonTermLibrary.ts --out <file> [--only <questId>] [--limit N] [--retry-review]
     2) apply: כותב מתוך הדוח בלבד (בלי קריאות מודל), בתנאי שהשורה לא השתנתה מאז (hash). idempotent.
        npx tsx src/scripts/lessonTermLibrary.ts --apply-from <file>
   שחזור: --restore <questId> [--student <studentId>]   |   --restore-all        ספירה בלבד: --scan
   ────────────────────────────────────────────────────────────────────────── */
import '../env.js'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { supabaseAdmin } from '../lib/supabase.js'
import { checkAnswerConsistency, extractJson, lintDetachedClitics, lintHighRegister, lintKnownErrors, lintRepetition, type GameData } from '../lib/questSchemas.js'
import { findAddressViolations } from '../lib/studentAddress.js'
import { runOutputSafetyCheck } from '../lib/contentSafety.js'
import { runFactCheck } from '../lib/factCheck.js'
import { callClaude } from '../lib/claudeCalls.js'
import { TERM_RE as TERM, slotProblem, termCount, termSlots, type Slot } from '../lib/lessonTermRewrite.js'

const args = process.argv.slice(2)
const flag = (n: string) => args.includes(`--${n}`)
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined }

type Target = 'quest' | 'variant'
interface Row { target: Target; questId: string; studentId: string | null; title: string; gd: GameData }
interface SlotChange { key: string; sceneId: string | null; before: string; after: string }
export interface Entry {
  target: Target; questId: string; studentId: string | null; title: string
  status: 'clean' | 'ok' | 'review'
  reasons: string[]
  sourceHash: string
  changes: SlotChange[]
  converted?: GameData
  convertedTitle?: string
  /* מחרוזות שהמודל החזיר אך נדחו באימות (לבדיקה אנושית בדוח) */
  rejected?: { key: string; before: string; after: string; why: string }[]
}

const hash = (v: unknown) => createHash('sha1').update(JSON.stringify(v)).digest('hex')

/* ═════════ כתיבה מחדש (Sonnet) ═════════ */
const INSTRUCTION = `אתה עורך לשון בעברית. במערכת חינוכית שינו את המינוח: היחידה שהמורה בונה ושהתלמידים משחקים בה כבר לא נקראת "הדמיה" אלא **"שיעור"**.
"הדמיה" (נקבה) ← "שיעור" (זכר); "הדמיות" ← "שיעורים". זה **תיקון של המשפט כולו**, לא החלפת מילה: כל מילה שמתייחסת לשיעור צריכה להתאים בזכר
(פעלים: "נשלחה"→"נשלח", "הושלמה"→"הושלם"; תארים ומספרים: "חדשה"→"חדש", "הראשונה"→"הראשון", "שתי הדמיות"→"שני שיעורים", "אחת"→"אחד";
כינויים: "היא"→"הוא", "שלה"→"שלו", "מהן"→"מהם", "בכולן"→"בכולם", "הזו/הזאת"→"הזה"). בצורות סמיכות ובתחיליות: "הדמיית חזרה"→"שיעור חזרה", "בהדמיה"→"בשיעור", "להדמיות"→"לשיעורים".
**אבל המילה "הדמיה" בטקסטים האלה לא תמיד מתכוונת לשיעור.** הבן את המשמעות לפי ההקשר, ובחר:
1. הפעילות החינוכית עצמה ("ההדמיה נשלחה", "בהדמיה הזאת", "ד״ר הולו מפסיק את ההדמיה לרגע" כשהוא פונה לתלמידים) — **"שיעור"**.
2. עולם מדומה בתוך הסיפור ("בעולם ההדמיה", "חלל הדמיה", "זו רק ההדמיה", "קצינה ממשית (בהדמיה)", "ההדמיה מחזירה אתכם לרגע") — **"סימולציה"** ("בעולם הסימולציה", "חלל הסימולציה", "זו רק סימולציה", "בסימולציה", "הסימולציה מחזירה אתכם"). זו מילה נקבה: התאמת המשפט נשארת בנקבה.
3. כותרת מעבר בין שלבים בסיפור ("הדמיה חדשה:", "הדמיה אחרונה לפני ההכרעה") — **"שלב"** ("שלב חדש:", "שלב אחרון לפני ההכרעה"). "מבנה הדמיה מתחלף" → "מבנה הסימולציה מתחלף".
4. המחשה חזותית שד״ר הולו מציג ("מציג הדמיה תלת-ממדית של גוף") — **"המחשה"**.
5. דימות/הדמיה במובן טכני־רפואי או אופטי ("טכנולוגיית הדמיית אור", "הדמיה רפואית") — **"דימות"** ("טכנולוגיית דימות אור תלת-ממדי").
אם הכוונה לא ברורה — העדף את הניסוח שנשמע טבעי למתבגר וקרוב ביותר לכוונת המשפט המקורי.
כללים נוספים:
א. אל תשנה שום דבר אחר: לא עובדות, שמות, מספרים, שנים, סימני פיסוק, ביטויים בסוגריים מסולסלים כמו {DR_HOLO}, קווים תחתונים "___", ולא פנייה לתלמיד (לשון רבים נשארת רבים).
ב. אל תקצר ואל תאריך, ואל תוסיף הסברים. שמור על אותו משלב ואותו טון.
ג. החזר לכל מחרוזת את הטקסט המלא המתוקן (גם אם המונח היה רק חלק ממנו). אל תשאיר בו את המילה "הדמיה".
החזר JSON בלבד: {"items":[{"id":"...","text":"..."}]}.`

interface Req { id: string; text: string }
async function rewrite(reqs: Req[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const ask = async (batch: Req[]): Promise<boolean> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await callClaude([{ role: 'user', content: `${INSTRUCTION}\n\n${JSON.stringify(batch)}` }])
        const r = extractJson(raw) as { items?: { id: string; text: string }[] }
        for (const i of r.items ?? []) if (typeof i.text === 'string') out.set(i.id, i.text)
        return true
      } catch { /* ניסיון נוסף */ }
    }
    return false
  }
  for (let i = 0; i < reqs.length; i += 12) {
    const batch = reqs.slice(i, i + 12)
    if (!(await ask(batch)) && batch.length > 1) for (const one of batch) await ask([one])
  }
  return out
}

/* ═════════ אימותים ═════════ */
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

const TITLE_KEY = '__title__'

/* מעבד שורה אחת. rewritten: התוצאות של המודל לכל ה-ids של השורה (נאספו מראש באצוות) */
async function verify(row: Row, slots: Slot[], titleBefore: string | null, rewritten: Map<string, string>, idOf: (key: string) => string): Promise<Entry> {
  const base = { target: row.target, questId: row.questId, studentId: row.studentId, title: row.title, sourceHash: hash({ gd: row.gd, title: row.title }) }
  const clone = JSON.parse(JSON.stringify(row.gd)) as GameData
  const cloneSlots = termSlots(clone)
  const changes: SlotChange[] = []
  const reasons: string[] = []
  const rejected: NonNullable<Entry['rejected']> = []
  for (const s of cloneSlots) {
    const before = s.get()
    const after = rewritten.get(idOf(s.key))
    const p = slotProblem(before, after)
    if (p) { reasons.push(`${s.key}: ${p}`); rejected.push({ key: s.key, before, after: after ?? '', why: p }); continue }
    s.set(after as string)
    changes.push({ key: s.key, sceneId: s.sceneId, before, after: after as string })
  }
  let convertedTitle: string | undefined
  if (titleBefore !== null) {
    const after = rewritten.get(idOf(TITLE_KEY))
    const p = slotProblem(titleBefore, after)
    if (p) reasons.push(`title: ${p}`)
    else { convertedTitle = after as string; changes.push({ key: TITLE_KEY, sceneId: null, before: titleBefore, after: convertedTitle }) }
  }
  const review = (rs: string[]): Entry => ({ ...base, status: 'review', reasons: rs, changes, ...(rejected.length ? { rejected } : {}) })
  if (reasons.length > 0) return review(reasons.slice(0, 6))
  if (changes.length === 0) return { ...base, status: 'clean', reasons: [], changes: [] }
  void slots

  /* אותה מחרוזת שלא עברה החלפה (אותו טקסט) — לא אמור לקרות כי TERM נבדק לפני; בכל זאת */
  if (termSlots(clone).length > 0) return review(['נותרו מחרוזות עם "הדמי"'])

  /* פנייה לתלמיד (לשון רבים) — אסור להוסיף הפרות */
  if (findAddressViolations(clone).length > findAddressViolations(row.gd).length) return review(['נוספה הפרת פנייה לתלמיד'])

  const lintBefore = lintKeys(row.gd)
  const newLint = [...lintKeys(clone)].filter((k) => !lintBefore.has(k))
  if (newLint.length) return review(['לינט חדש: ' + newLint.slice(0, 3).join(' · ')])

  const sceneIds = new Set(changes.map((c) => c.sceneId).filter((x): x is string => !!x))
  if (sceneIds.size > 0) {
    const safety = await runOutputSafetyCheck(reduced(clone, sceneIds)).catch(() => ({ blocked: true, technical: true }) as { blocked: boolean; technical?: boolean })
    if (safety.blocked) return review([safety.technical ? 'בדיקת הבטיחות לא זמינה' : 'בדיקת הבטיחות חסמה'])

    /* בדיקת העובדות/הלשון לעיתים נכשלת טכנית (JSON שבור) — ניסיון חוזר אחד; ממצא חדש נבדק בהרצה שנייה לפני שחוסמים (הבודק לא דטרמיניסטי) */
    const factOf = async (g: GameData) => { let r = await runFactCheck(g); if (!r.ok) r = await runFactCheck(g); return r }
    const [b, a] = await Promise.all([factOf(reduced(row.gd, sceneIds)), factOf(reduced(clone, sceneIds))])
    if (!a.ok) return review(['בדיקת העובדות לא זמינה'])
    const perScene = (errs: { sceneId?: string }[]) => errs.reduce<Record<string, number>>((m, e) => { const k = e.sceneId ?? '?'; m[k] = (m[k] ?? 0) + 1; return m }, {})
    const bc = perScene(b.ok ? b.errors : []), ac = perScene(a.errors)
    let worse = Object.keys(ac).filter((k) => ac[k] > (bc[k] ?? 0))
    if (worse.length) {
      const ws = new Set(worse)
      const [b2, a2] = await Promise.all([factOf(reduced(row.gd, ws)), factOf(reduced(clone, ws))])
      const bc2 = perScene(b2.ok ? b2.errors : []), ac2 = perScene(a2.ok ? a2.errors : [])
      worse = worse.filter((k) => (ac2[k] ?? 0) > (bc2[k] ?? 0) && (ac[k] ?? 0) > (bc[k] ?? 0))
      if (worse.length) {
        const sample = (a2.ok ? a2.errors : a.errors).filter((e: { sceneId?: string; problem: string }) => worse.includes(e.sceneId ?? '?')).slice(0, 2).map((e: { sceneId?: string; problem: string }) => `${e.sceneId}: ${e.problem.slice(0, 140)}`)
        return review(['ממצאי עובדות/לשון חדשים בסצנות: ' + worse.join(', ') + ' — ' + sample.join(' · ')])
      }
    }
  }
  return { ...base, status: 'ok', reasons: [], changes, converted: clone, ...(convertedTitle !== undefined ? { convertedTitle } : {}) }
}

/* ═════════ טעינה ═════════ */
async function loadRows(): Promise<Row[]> {
  const rows: Row[] = []
  const only = opt('only')
  for (let from = 0; ; from += 100) {
    let q = supabaseAdmin.from('quests').select('id, title, game_data').order('id').range(from, from + 99)
    if (only) q = q.eq('id', only)
    const { data, error } = await q
    if (error) throw new Error('quests: ' + error.message)
    for (const r of data ?? []) rows.push({ target: 'quest', questId: r.id as string, studentId: null, title: (r.title as string) ?? '', gd: ((r.game_data as GameData) ?? { scenes: [] }) })
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

const keyOf = (t: Target, q: string, s: string | null) => `${t}:${q}:${s ?? ''}`
const needsWork = (r: Row): boolean => termSlots(r.gd).length > 0 || (r.target === 'quest' && TERM.test(r.title))

async function saveRecord(rec: { target: Target; quest_id: string; student_id: string | null; status: string; previous_game_data: unknown; previous_title: string | null; issues: unknown }): Promise<string | null> {
  let q = supabaseAdmin.from('quest_term_conversion').select('id').eq('target', rec.target).eq('quest_id', rec.quest_id)
  q = rec.student_id ? q.eq('student_id', rec.student_id) : q.is('student_id', null)
  const { data: ex, error: se } = await q.maybeSingle()
  if (se) return se.message
  const body = { ...rec, updated_at: new Date().toISOString() }
  const { error } = ex
    ? await supabaseAdmin.from('quest_term_conversion').update(body).eq('id', (ex as { id: string }).id)
    : await supabaseAdmin.from('quest_term_conversion').insert(body)
  return error?.message ?? null
}

async function loadRecords(): Promise<Map<string, string>> {
  const m = new Map<string, string>()
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabaseAdmin.from('quest_term_conversion').select('target, quest_id, student_id, status').range(from, from + 499)
    if (error) throw new Error('quest_term_conversion: ' + error.message + ' (הרץ את migrations/quest_term_conversion.sql)')
    for (const r of data ?? []) m.set(keyOf(r.target as Target, r.quest_id as string, (r.student_id as string | null) ?? null), r.status as string)
    if (!data || data.length < 500) break
  }
  return m
}

/* ═════════ dry-run ═════════ */
async function dryRun(): Promise<void> {
  const out = opt('out')
  if (!out) throw new Error('--out <file> נדרש')
  const records = await loadRecords()
  const retry = flag('retry-review')
  let rows = (await loadRows()).filter(needsWork).filter((r) => { const st = records.get(keyOf(r.target, r.questId, r.studentId)); return !st || st === 'restored' || (st === 'review' && retry) })
  const limit = Number(opt('limit') ?? 0)
  if (limit) rows = rows.slice(0, limit)
  console.log(`שורות עם "הדמי": ${rows.length} (שיעורים ${rows.filter((r) => r.target === 'quest').length}, וריאציות ${rows.filter((r) => r.target === 'variant').length})`)

  const entries: Entry[] = []
  let idx = 0
  async function worker(): Promise<void> {
    while (idx < rows.length) {
      const row = rows[idx++]
      try {
        const slots = termSlots(row.gd)
        const idOf = (key: string) => `${row.target}:${row.questId}:${row.studentId ?? ''}:${key}`
        const reqs: Req[] = slots.map((s) => ({ id: idOf(s.key), text: s.get() }))
        const titleBefore = row.target === 'quest' && TERM.test(row.title) ? row.title : null
        if (titleBefore !== null) reqs.push({ id: idOf(TITLE_KEY), text: titleBefore })
        const rewritten = await rewrite(reqs)
        const e = await verify(row, slots, titleBefore, rewritten, idOf)
        entries.push(e)
        console.log(`${e.status === 'ok' ? '✓' : '✗'} ${e.target} ${e.questId.slice(0, 8)} "${e.title.slice(0, 30)}" — ${e.changes.length} מחרוזות${e.reasons.length ? ' — ' + e.reasons[0].slice(0, 120) : ''}`)
      } catch (err) {
        entries.push({ target: row.target, questId: row.questId, studentId: row.studentId, title: row.title, status: 'review', reasons: ['חריגה: ' + (err instanceof Error ? err.message : String(err))], sourceHash: hash({ gd: row.gd, title: row.title }), changes: [] })
      }
    }
  }
  await Promise.all([worker(), worker(), worker()])
  writeFileSync(out, JSON.stringify({ createdAt: new Date().toISOString(), entries }, null, 1))
  summary(entries)
  process.exit(0)
}

function summary(entries: Entry[]): void {
  const by = (s: Entry['status'], t?: Target) => entries.filter((e) => e.status === s && (!t || e.target === t))
  console.log(JSON.stringify({
    checked: entries.length,
    converted: { quests: by('ok', 'quest').length, variants: by('ok', 'variant').length, strings: by('ok').reduce((n, e) => n + e.changes.length, 0) },
    review: { quests: by('review', 'quest').length, variants: by('review', 'variant').length },
  }))
}

/* ═════════ apply ═════════ */
async function apply(file: string): Promise<void> {
  const { entries } = JSON.parse(readFileSync(file, 'utf8')) as { entries: Entry[] }
  const records = await loadRecords()
  let done = 0, skippedChanged = 0, skippedDone = 0, reviews = 0, failed = 0
  for (const e of entries) {
    if (e.status === 'clean') continue
    const had = records.get(keyOf(e.target, e.questId, e.studentId))
    if (had === 'converted' || (had === 'review' && e.status === 'review')) { skippedDone++; continue }
    if (e.status === 'review') {
      const error = await saveRecord({ target: e.target, quest_id: e.questId, student_id: e.studentId, status: 'review', previous_game_data: null, previous_title: null, issues: { reasons: e.reasons, strings: e.changes.length } })
      if (error) { failed++; console.log('review לא נשמר:', e.questId, error) } else reviews++
      continue
    }
    const table = e.target === 'quest' ? 'quests' : 'quest_variants'
    let q = supabaseAdmin.from(table).select(e.target === 'quest' ? 'title, game_data' : 'game_data').eq(e.target === 'quest' ? 'id' : 'quest_id', e.questId)
    if (e.target === 'variant') q = q.eq('student_id', e.studentId as string)
    const { data: cur, error: ce } = await q.maybeSingle()
    if (ce || !cur) { failed++; console.log('שורה לא נמצאה:', e.questId, ce?.message ?? ''); continue }
    const curRow = cur as unknown as { title?: string; game_data: unknown }
    const curTitle = e.target === 'quest' ? (curRow.title ?? '') : (e.title ?? '')
    if (hash({ gd: curRow.game_data, title: curTitle }) !== e.sourceHash) { skippedChanged++; console.log('דולג — השתנה מאז ה-dry-run:', e.questId.slice(0, 8)); continue }
    const ie = await saveRecord({ target: e.target, quest_id: e.questId, student_id: e.studentId, status: 'converted', previous_game_data: curRow.game_data, previous_title: e.target === 'quest' ? curTitle : null, issues: { strings: e.changes.length } })
    if (ie) { failed++; console.log('גרסה קודמת לא נשמרה — לא כותבים:', e.questId, ie); continue }
    const patch: Record<string, unknown> = { game_data: e.converted }
    if (e.target === 'quest' && e.convertedTitle !== undefined) patch.title = e.convertedTitle
    let u = supabaseAdmin.from(table).update(patch).eq(e.target === 'quest' ? 'id' : 'quest_id', e.questId)
    if (e.target === 'variant') u = u.eq('student_id', e.studentId as string)
    const { error: ue } = await u
    if (ue) { failed++; console.log('עדכון נכשל:', e.questId, ue.message); continue }
    done++
  }
  console.log(JSON.stringify({ applied: done, review_recorded: reviews, skipped_already_done: skippedDone, skipped_changed_since_dry_run: skippedChanged, failed }))
  process.exit(0)
}

/* ═════════ שחזור ═════════ */
async function restore(): Promise<void> {
  const questId = opt('restore')
  const student = opt('student') ?? null
  let q = supabaseAdmin.from('quest_term_conversion').select('*').eq('status', 'converted')
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
    const patch: Record<string, unknown> = { game_data: r.previous_game_data }
    if (r.target === 'quest' && r.previous_title !== null) patch.title = r.previous_title
    let u = supabaseAdmin.from(table).update(patch).eq(r.target === 'quest' ? 'id' : 'quest_id', r.quest_id)
    if (r.target === 'variant') u = u.eq('student_id', r.student_id)
    const { error: ue } = await u
    if (ue) { console.log('שחזור נכשל:', r.quest_id, ue.message); continue }
    await supabaseAdmin.from('quest_term_conversion').update({ status: 'restored', updated_at: new Date().toISOString() }).eq('id', r.id)
    n++
  }
  console.log(`שוחזרו ${n}`)
  process.exit(0)
}

/* ═════════ ספירה בלבד ═════════ */
async function scan(): Promise<void> {
  const rows = await loadRows()
  const hit = rows.filter(needsWork)
  const fields: Record<string, number> = {}
  let strings = 0, occurrences = 0
  for (const r of hit) {
    for (const s of termSlots(r.gd)) {
      strings++
      occurrences += termCount(s.get())
      const f = s.key.replace(/\d+/g, '#')
      fields[f] = (fields[f] ?? 0) + 1
    }
    if (r.target === 'quest' && TERM.test(r.title)) { fields['quests.title'] = (fields['quests.title'] ?? 0) + 1; strings++; occurrences += termCount(r.title) }
  }
  console.log(JSON.stringify({
    rows: rows.length, quests: rows.filter((r) => r.target === 'quest').length, variants: rows.filter((r) => r.target === 'variant').length,
    withTerm: { quests: hit.filter((r) => r.target === 'quest').length, variants: hit.filter((r) => r.target === 'variant').length }, strings, occurrences,
  }))
  console.log(Object.entries(fields).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${String(v).padStart(5)}  ${k}`).join('\n'))
  /* טבלאות טקסט נוספות — רק ספירה (אין המרה: תוכן שנוצר/נשמר ע"י המערכת, נבדק ידנית) */
  for (const [table, col] of [['misconceptions', 'title_he'], ['misconceptions', 'description_he'], ['pedagogical_summaries', 'content'], ['pedagogical_summaries', 'edited_content'], ['ai_summaries', 'edited_text']] as const) {
    const { count, error } = await supabaseAdmin.from(table).select('id', { count: 'exact', head: true }).ilike(col, '%הדמי%')
    console.log(`${table}.${col}:`, error ? 'לא נקרא (' + error.message.slice(0, 60) + ')' : count)
  }
  process.exit(0)
}

const main = async () => {
  if (flag('scan')) return scan()
  if (opt('apply-from')) return apply(opt('apply-from') as string)
  if (opt('restore') || flag('restore-all')) return restore()
  return dryRun()
}
main().catch((e) => { console.error(e); process.exit(1) })
