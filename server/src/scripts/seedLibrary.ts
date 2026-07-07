import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { supabaseAdmin } from '../lib/supabase.js'

/* ── ייצור ספריית הפתיחה — אצוות הדמיות מתוך seed/libraryTopics.json ──
   רץ מול השרת החי (צינור היצירה המלא: בטיחות/ולידציה/fact-check/יעדים), ואז מייצר
   תמונות, כותב מטא שכבות (grade_min/max) + is_official, ואופציונלית משתף לספרייה.
   idempotent — נושא שכבר קיים (לפי כותרת) מדולג.

   שימוש:  npm run seed:library -- [--limit N] [--share]
   env:    SERVER_URL (ברירת מחדל http://localhost:3001),
           SEED_STAFF_EMAIL / SEED_STAFF_PASSWORD (ברירת מחדל admin@demo.com / demo1234)

   ⚠ עלות אמיתית פר-הדמיה (Sonnet + ~8 תמונות Together) — התחילו ב---limit 1 ועברו
   על התוצר (QA אנושי) לפני אצווה מלאה. */

interface Topic {
  title: string
  subject: string
  gradeMin: number
  gradeMax: number
  writingLevel: number
  questLength: number
  artStyle?: string
  curriculum: string
  objectives: string[]
  /* סוגי חידות לנושא; ברירת המחדל מעדיפה tileSwap על wordSearch (העדפת מוצר —
     הפאזל מנצל את תמונת הסצנה). נושא שהתפזורת היא הפדגוגיה שלו מגדיר override. */
  puzzleTypes?: string[]
}

const DEFAULT_PUZZLE_TYPES = ['multipleChoice', 'trueFalse', 'memory', 'tileSwap']

const SERVER = process.env.SERVER_URL ?? 'http://localhost:3001'
const EMAIL = process.env.SEED_STAFF_EMAIL ?? 'admin@demo.com'
const PASSWORD = process.env.SEED_STAFF_PASSWORD ?? 'demo1234'

const args = process.argv.slice(2)
const limitIdx = args.indexOf('--limit')
const LIMIT = limitIdx !== -1 ? Number(args[limitIdx + 1]) || Infinity : Infinity
const SHARE = args.includes('--share')

const secs = (from: number) => ((Date.now() - from) / 1000).toFixed(0)

async function login(): Promise<string> {
  const res = await fetch(`${SERVER}/api/auth/staff-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error('התחברות נכשלה: ' + (body?.error ?? res.status))
  return body.session.access_token
}

/* המתנה לסיום היצירה ברקע (polling כמו הקליינט) */
async function waitForQuest(id: string, timeoutMs = 480_000): Promise<{ scenes: number } | { error: string }> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000))
    const res = await fetch(`${SERVER}/api/quests/${id}`)
    if (!res.ok) continue
    const { quest } = await res.json()
    const gd = quest?.game_data
    if (gd?.genError) return { error: gd.genError }
    if (Array.isArray(gd?.scenes) && gd.scenes.length > 0) return { scenes: gd.scenes.length }
  }
  return { error: 'timeout' }
}

/* צריכת ה-SSE של יצירת התמונות עד סיום */
async function generateImages(id: string, token: string): Promise<{ completed: number; total: number; warnings: string[] }> {
  const res = await fetch(`${SERVER}/api/quests/${id}/generate-images`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: '{}',
  })
  if (!res.ok || !res.body) return { completed: 0, total: 0, warnings: ['בקשת התמונות נכשלה'] }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let last = { completed: 0, total: 0, warnings: [] as string[] }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''
    for (const block of events) {
      const line = block.split('\n').find((l) => l.startsWith('data: '))
      if (!line) continue
      const ev = JSON.parse(line.slice(6))
      if (typeof ev.completed === 'number') last = { ...last, completed: ev.completed, total: ev.total }
      if (ev.done && Array.isArray(ev.warnings)) last.warnings = ev.warnings
    }
  }
  return last
}

async function main() {
  const file = resolve(process.cwd(), 'seed/libraryTopics.json')
  const { topics } = JSON.parse(readFileSync(file, 'utf8')) as { topics: Topic[] }
  console.log(`▶ ${topics.length} נושאים בקובץ · limit=${LIMIT === Infinity ? 'הכל' : LIMIT} · share=${SHARE}`)

  const token = await login()
  const results: { title: string; status: string; secs: string }[] = []
  let produced = 0

  for (const t of topics) {
    if (produced >= LIMIT) break

    /* idempotent — דילוג על נושא שכבר נוצר */
    const { data: existing } = await supabaseAdmin.from('quests').select('id').eq('title', t.title).limit(1)
    if (existing && existing.length > 0) {
      console.log(`↷ קיים, מדלג: ${t.title}`)
      results.push({ title: t.title, status: 'קיים (דולג)', secs: '-' })
      continue
    }

    const t0 = Date.now()
    console.log(`\n▶ יוצר: ${t.title} (${t.subject} · כיתות ${t.gradeMin}-${t.gradeMax})`)

    const gen = await fetch(`${SERVER}/api/quests/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: t.title,
        curriculum: t.curriculum,
        objectives: t.objectives,
        subject: t.subject,
        questLength: t.questLength,
        puzzlePreferences: { types: Object.fromEntries((t.puzzleTypes ?? DEFAULT_PUZZLE_TYPES).map((p) => [p, true])) },
        difficultySettings: { writingLevel: t.writingLevel, puzzleDifficulty: t.writingLevel },
        includeDrHolo: true,
        artStyle: t.artStyle ?? 'digital-painting',
      }),
    })
    const genBody = await gen.json()
    if (gen.status !== 201) {
      console.log(`✗ יצירה נדחתה: ${genBody?.error ?? gen.status}`)
      results.push({ title: t.title, status: 'נכשל (generate)', secs: secs(t0) })
      continue
    }
    const questId = genBody.quest.id

    const done = await waitForQuest(questId)
    if ('error' in done) {
      console.log(`✗ יצירה נכשלה: ${done.error}`)
      results.push({ title: t.title, status: 'נכשל: ' + done.error.slice(0, 60), secs: secs(t0) })
      continue
    }
    console.log(`  ✓ תוכן: ${done.scenes} סצנות (${secs(t0)}ש׳) — מייצר תמונות…`)

    const img = await generateImages(questId, token)
    console.log(`  ✓ תמונות: ${img.completed}/${img.total}${img.warnings.length ? ` · אזהרות: ${img.warnings.length}` : ''}`)

    /* מטא שכבות + סימון רשמי (דיפנסיבי — אם המיגרציה טרם רצה, מדלגים בשקט) */
    const { error: metaErr } = await supabaseAdmin
      .from('quests')
      .update({ grade_min: t.gradeMin, grade_max: t.gradeMax, is_official: true })
      .eq('id', questId)
    if (metaErr) console.log(`  ⚠ מטא שכבות לא נכתב (${metaErr.message}) — הריצו npm run migrate -- migrations/library_meta.sql`)

    if (SHARE) {
      /* acknowledgeWarnings — התוכן הרשמי עובר QA אנושי לפני אצווה; סתירת תשובה/הסבר
         חוסמת (422) עדיין מפילה את השיתוף בקול — וזה הרצוי */
      const sh = await fetch(`${SERVER}/api/quests/${questId}/share`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledgeWarnings: true }),
      })
      if (sh.ok) console.log('  ✓ שותף לספרייה הציבורית')
      else console.log(`  ⚠ שיתוף נכשל (${sh.status}): ${((await sh.json().catch(() => null)) as { error?: string } | null)?.error ?? ''}`)
    }

    produced++
    results.push({ title: t.title, status: SHARE ? 'נוצר ושותף ✓' : 'נוצר ✓ (טיוטה)', secs: secs(t0) })
  }

  console.log('\n── סיכום ──')
  for (const r of results) console.log(`${r.status.padEnd(22)} ${r.secs.padStart(4)}ש׳  ${r.title}`)
  console.log(`\nסה"כ נוצרו: ${produced}. זכרו: QA אנושי לכל הדמיה לפני שיתוף/שימוש בכיתה.`)
}

main().then(() => process.exit(0)).catch((e) => { console.error('✗', e); process.exit(1) })
