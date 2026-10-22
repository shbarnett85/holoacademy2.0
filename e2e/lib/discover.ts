/* ──────────────────────────────────────────────────────────────────────────
   גילוי מזהים בזמן ריצה (אין מזהים קשיחים): קריאות API עם ה-bearer של הצופה.
   · תוצאות:  GET /api/results/submissions  →  שליחה; GET /api/results/submission/:id → תלמיד
   · אנליטיקה: GET /api/analytics-v2/config|roster  → כיתה, תלמיד, מקצוע
   כל נתיב נסלח: 404/403/צורה לא צפויה → המשתנה פשוט נשאר ריק והמסכים שתלויים בו מדולגים
   ("לא ניתן לגלות …"), בלי קריסה — כך זה עובד גם לפני שהשרת/המסכים נבנו.
   ────────────────────────────────────────────────────────────────────────── */
import type { Vars, Who } from './types.ts'
import { isAnalyticsFixtureWho } from './types.ts'
import { fetchRetry, lensParams } from './login.ts'
import { subjectName } from '../../src/shared/lib/subjects.ts'

type Json = unknown
const asRec = (v: Json): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const asArr = (v: Json): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: Json): string | undefined => (typeof v === 'string' && v ? v : undefined)

/* מעטפת { data } (תוצאות) או { dataState, data } (אנליטיקה v2) → data */
function unwrap(b: Json): Json {
  const r = asRec(b)
  return r && 'data' in r && Object.keys(r).every((k) => k === 'data' || k === 'dataState') ? r.data : b
}

export interface ApiCtx { api: string; token: string; query: Record<string, string> }

async function get(ctx: ApiCtx, p: string): Promise<{ status: number; body: Json }> {
  const url = new URL(p, ctx.api)
  for (const [k, v] of Object.entries(ctx.query)) url.searchParams.set(k, v)
  try {
    const res = await fetchRetry(url, { headers: { authorization: `Bearer ${ctx.token}` } })
    let body: Json = null
    try { body = await res.json() } catch { /* לא JSON */ }
    return { status: res.status, body }
  } catch (e) {
    return { status: 0, body: String(e) }
  }
}

export interface Discovery { vars: Vars; notes: string[] }

/* ── תוצאות ── */
async function discoverResults(ctx: ApiCtx, vars: Vars, notes: string[]): Promise<void> {
  let subs: unknown[] | null = null
  const tried: string[] = []
  for (const p of ['/api/results/submissions', '/api/results']) {
    const r = await get(ctx, p)
    tried.push(`${p}→${r.status}`)
    if (r.status === 200) {
      const list = asArr(asRec(unwrap(r.body))?.submissions)
      if (list.length || asRec(unwrap(r.body))?.submissions) { subs = list; break }
    }
  }
  if (!subs) { notes.push(`API התוצאות לא זמין (${tried.join(', ')})`); return }
  if (!subs.length) { notes.push('אין שליחות לצופה הזה'); return }
  const rows = subs.map(asRec).filter((r): r is Record<string, unknown> => !!r)
  const withDone = rows.find((r) => Number(asRec(r.counts)?.completed ?? 0) > 0) ?? rows[0]
  const id = str(withDone.id)
  if (!id) return
  vars.submissionId = id
  vars.submissionClassId = str(withDone.classId)

  for (const p of [`/api/results/submission/${id}`, `/api/results/submissions/${id}`, `/api/results/${id}`]) {
    const r = await get(ctx, p)
    if (r.status !== 200) continue
    const view = asRec(unwrap(r.body))
    const roster = asRec(view?.roster)
    const done = asArr(roster?.completed).map(asRec).filter((x): x is Record<string, unknown> => !!x)
    const any = [...done, ...asArr(roster?.inProgress).map(asRec), ...asArr(roster?.notStarted).map(asRec)].filter((x): x is Record<string, unknown> => !!x)
    vars.resultsStudentId = str(done[0]?.id) ?? str(any[0]?.id)
    vars.resultsAttentionStudentId = str(any.find((x) => x.attention === true)?.id)
    return
  }
  notes.push('תצוגת כיתה של שליחה לא זמינה — {resultsStudentId} לא נפתר')
}

/* ── אנליטיקה v2 ── */
async function discoverAnalytics(ctx: ApiCtx, who: Who, vars: Vars, notes: string[]): Promise<void> {
  const cfg = await get(ctx, '/api/analytics-v2/config')
  const cfgData = asRec(unwrap(cfg.body))
  if (cfg.status !== 200 || cfgData?.enabled === false) {
    notes.push(`אנליטיקה v2 לא פעילה לצופה (${cfg.status}${cfgData?.enabled === false ? ', enabled=false' : ''})`)
  }
  const lens = who === 'guest-admin' ? 'admin' : undefined
  const subjects = asArr(cfgData?.subjects).map(asRec).filter((s): s is Record<string, unknown> => !!s)
  if (lensParams(who).subject) vars.subject = lensParams(who).subject
  else if (subjects[0] && lens !== 'admin') vars.subject = str(subjects[0].code)

  const ros = await get(ctx, '/api/analytics-v2/roster')
  if (ros.status !== 200) { notes.push(`roster לא זמין (${ros.status})`); return }
  const roster = asRec(unwrap(ros.body))
  const classes = asArr(roster?.classes).map(asRec).filter((c): c is Record<string, unknown> => !!c)
  const students = asArr(roster?.students).map(asRec).filter((s): s is Record<string, unknown> => !!s)
  /* מעדיפים כיתה שבה קיים המקצוע של הצופה */
  const cls = classes.find((c) => asArr(c.subjects).some((s) => str(asRec(s)?.code) === vars.subject)) ?? classes[0]
  vars.classId = str(cls?.id)
  vars.className = str(cls?.name)
  if (!vars.subject) vars.subject = str(asRec(asArr(cls?.subjects)[0])?.code)
  const inClass = students.filter((s) => str(s.classId) === vars.classId)
  const pick = inClass.find((s) => Number(s.attention ?? 0) > 0) ?? inClass[0] ?? students[0]
  vars.studentId = str(pick?.id)
  if (!vars.classId) notes.push('אין כיתות ב-roster')
  if (!vars.studentId && who !== 'guest-admin') notes.push('אין תלמידים ב-roster')
}

/* ── ציבורי ── */
/* forced = משתנים קבועים מה-fixture (מזהי כיתות/תלמידים ידועים מראש) — דורסים את הגילוי. צופי fixture האנליטיקה אינם משתמשים בתוצאות, ולכן לא מגלים אותן */
export async function discover(who: Who, ctx: ApiCtx, fallbackIds: Record<string, string | undefined> = {}, forced: Vars = {}): Promise<Discovery> {
  const vars: Vars = {}
  const notes: string[] = []
  if (!isAnalyticsFixtureWho(who)) await discoverResults(ctx, vars, notes)
  await discoverAnalytics(ctx, who, vars, notes)
  for (const [k, v] of Object.entries(forced)) if (v !== undefined) vars[k] = v
  /* גיבוי מה-fixture (רק כשה-API לא מצא) */
  for (const k of ['classId', 'submissionId', 'studentId', 'subject', 'resultsStudentId', 'resultsAttentionStudentId'] as const) {
    if (!vars[k] && fallbackIds[k]) { vars[k] = fallbackIds[k]; notes.push(`{${k}} נלקח מה-fixture`) }
  }
  if (vars.subject) vars.subjectName = subjectName(vars.subject)
  return { vars, notes }
}

/* מחליף {name} במשתני הגילוי; חסר → מחזיר את השמות החסרים. encode=true ל-URL, false לטקסט של לחיצה/מילוי */
export function substitute(template: string, vars: Vars, encode = true): { value: string; missing: string[] } {
  const missing: string[] = []
  const value = template.replace(/\{(\w+)\}/g,(m, name: string) => {
    const v = vars[name]
    if (v === undefined) { missing.push(name); return m }
    return encode ? encodeURIComponent(v) : v
  })
  return { value, missing }
}
