/* ──────────────────────────────────────────────────────────────────────────
   ביקורת UX/נגישות — CLI.   npx tsx e2e/run.ts [אפשרויות]     (או: npm run e2e:ux -- [אפשרויות])
   ראו docs/ux-audit.md. יציאה 1 אם יש הפרת axe חמורה/קריטית, מילה אסורה, או שגיאת הרצה (ועם --strict גם פריסה וכו').
   ────────────────────────────────────────────────────────────────────────── */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { launchBrowser, newContext } from './lib/browser.ts'
import { DEFAULT_API, DEFAULT_BASE, DEFAULT_OUT, DEFAULT_VIEWPORTS, parseViewport } from './lib/config.ts'
import { discover, type ApiCtx } from './lib/discover.ts'
import {
  cleanupOnly, fixtureOf, freshSession, guestLogin, lensParams, seedFixture,
  type FixtureId, type FixtureRun, type StaffSession,
} from './lib/login.ts'
import { readReport, writeChecklist } from './lib/checklist.ts'
import { writeReports, type RunMeta } from './lib/report.ts'
import { runScreen, screenId, type ScreenJob } from './lib/runner.ts'
import type { Scenario, ScreenResult, Vars, Who } from './lib/types.ts'
import { isGuestWho, isRealWho } from './lib/types.ts'
import { SCENARIOS } from './scenarios.ts'

const HELP = `ביקורת UX/נגישות (Playwright + axe)

  npx tsx e2e/run.ts [אפשרויות]        |   npm run e2e:ux -- [אפשרויות]

  --only <a,b,…>      סינון: תת-מחרוזת של "<name>.<who>", או group:<קבוצה>, או who:<צופה>
  --viewport <WxH>    (חוזר/מופרד בפסיקים) ברירת מחדל: ${DEFAULT_VIEWPORTS.join(', ')}
  --dark              ערכה כהה (ברירת מחדל: בהירה)
  --no-real           בלי מורים אמיתיים (לא מזריע fixture; מסכי real-* ידולגו)
  --strict            כשל גם על פריסה/יעדים קטנים/גופן/hover/breadcrumb/לחיצות/h1
  --out <dir>         תיקיית פלט (ברירת מחדל: e2e/out)
  --base <url>        כתובת הקליינט (E2E_BASE_URL; ברירת מחדל ${DEFAULT_BASE})
  --api <url>         כתובת השרת (E2E_API_URL; ברירת מחדל ${DEFAULT_API})
  --jobs <n>          הקשרי דפדפן במקביל למורים אמיתיים (ברירת מחדל 3; אף פעם לא שני הקשרים של אותו משתמש בו-זמנית)
  --guest-jobs <n>    הקשרי דפדפן במקביל לאורח (ברירת מחדל 1: חשבון האורח משותף ומוגבל ל-120 בקשות בדקה ל-IP)
  --guest-pause <ms>  הפסקה בין מסכי אורח (ברירת מחדל 1500): מכסת הבקשות של האורח ~60 בדקה (ראו docs/ux-audit.md → "מכסות בקשות")
  --parallel          להריץ במקביל את קבוצת האורח וקבוצת המורים האמיתיים (ברירת מחדל: קודם האמיתיים ואז האורח).
                      לא מומלץ: מכסת ה-IP של האנליטיקה משותפת (תנועה של מורים אמיתיים צורכת את מכסת האורח → 429)
  --headed            דפדפן גלוי
  --no-screenshots    בלי PNG
  --timeout <ms>      timeout לפעולה (ברירת מחדל 15000)
  --checklist         בנוסף ל-report.*: צ'קליסט פר-מסך מובחן ב-e2e/out/checklist.md (npm run e2e:checklist)
  --checklist-only    בונה את checklist.md מ-report.json קיים, בלי להריץ דפדפן
  --list              הדפסת המסכים שנבחרו ויציאה
  --keep-fixture      לא לנקות את שורות ה-fixture (zz-ux-) בסוף
  --cleanup-only      רק לנקות שורות fixture שנשארו מריצה שקרסה
  --selftest          בדיקה עצמית של התשתית (דף סינתטי)
`

function expand(): { scenario: Scenario; who: Who }[] {
  const out: { scenario: Scenario; who: Who }[] = []
  for (const sc of SCENARIOS) for (const who of Array.isArray(sc.who) ? sc.who : [sc.who]) out.push({ scenario: sc, who })
  return out
}

function matchesOnly(item: { scenario: Scenario; who: Who }, only: string[]): boolean {
  if (!only.length) return true
  const id = screenId(item.scenario.name, item.who)
  return only.some((o) => {
    if (o.startsWith('group:')) return item.scenario.group === o.slice(6)
    if (o.startsWith('who:')) return item.who === o.slice(4)
    return id.includes(o)
  })
}

const usesPlaceholders = (sc: Scenario): boolean => /\{\w+\}/.test(JSON.stringify([sc.url, sc.steps ?? []]))

/* מריץ קבוצות עם עד n במקביל, אבל אף פעם לא שתי קבוצות של אותו צופה בו-זמנית (מכסת הבקשות היא פר-משתמש) */
async function schedule<G extends { who: Who }>(groups: G[], n: number, fn: (g: G) => Promise<void>): Promise<void> {
  const queue = [...groups]
  const running = new Set<Who>()
  let active = 0
  await new Promise<void>((resolve, reject) => {
    const pump = (): void => {
      while (active < Math.max(1, n)) {
        const idx = queue.findIndex((g) => !running.has(g.who))
        if (idx < 0) break
        const [g] = queue.splice(idx, 1)
        running.add(g.who)
        active++
        fn(g).then(() => undefined, reject).finally(() => { running.delete(g.who); active--; pump() })
      }
      if (!queue.length && active === 0) resolve()
    }
    pump()
  })
}

async function main(): Promise<number> {
  const { values: v } = parseArgs({
    options: {
      only: { type: 'string', multiple: true },
      viewport: { type: 'string', multiple: true },
      dark: { type: 'boolean' }, 'no-real': { type: 'boolean' }, strict: { type: 'boolean' },
      out: { type: 'string' }, base: { type: 'string' }, api: { type: 'string' },
      jobs: { type: 'string' }, 'guest-jobs': { type: 'string' }, 'guest-pause': { type: 'string' }, parallel: { type: 'boolean' }, headed: { type: 'boolean' }, 'no-screenshots': { type: 'boolean' },
      timeout: { type: 'string' }, list: { type: 'boolean' }, 'keep-fixture': { type: 'boolean' },
      'cleanup-only': { type: 'boolean' }, selftest: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
      checklist: { type: 'boolean' }, 'checklist-only': { type: 'boolean' },
    },
    allowPositionals: false,
  })
  if (v.help) { console.log(HELP); return 0 }
  if (v.selftest) { const { runSelftest } = await import('./selftest.ts'); return runSelftest() }
  if (v['cleanup-only']) { await cleanupOnly(); console.log('fixture נוקה.'); return 0 }
  if (v['checklist-only']) {
    const dir = path.resolve(v.out ?? DEFAULT_OUT)
    const { meta, results } = await readReport(dir)
    const c = await writeChecklist(dir, meta, results)
    console.log(`צ'קליסט: ${c.md}\n${c.totals.screens} מסכים מובחנים (${c.totals.measured} נמדדו) · נכנסים במסך אחד: ${c.totals.fit} מתוך ${c.totals.measured}`)
    return 0
  }

  const base = (v.base ?? DEFAULT_BASE).replace(/\/$/, '')
  const api = (v.api ?? DEFAULT_API).replace(/\/$/, '')
  const outDir = path.resolve(v.out ?? DEFAULT_OUT)
  const theme: 'light' | 'dark' = v.dark ? 'dark' : 'light'
  const viewports = (v.viewport?.length ? v.viewport.flatMap((x) => x.split(',')) : [...DEFAULT_VIEWPORTS]).map((x) => x.trim()).filter(Boolean)
  for (const vp of viewports) parseViewport(vp)
  const only = (v.only ?? []).flatMap((x) => x.split(',')).map((x) => x.trim()).filter(Boolean)
  const noReal = !!v['no-real']
  const timeoutMs = Number(v.timeout ?? 15_000)
  const guestPauseMs = Number(v['guest-pause'] ?? 1500)

  const items = expand().filter((i) => matchesOnly(i, only) && !(noReal && isRealWho(i.who)))
  if (v.list) {
    for (const i of items) console.log(`${screenId(i.scenario.name, i.who).padEnd(48)} ${i.scenario.group.padEnd(10)} ${i.scenario.url}`)
    console.log(`\n${items.length} מסכים × ${viewports.length} viewports`)
    return 0
  }
  if (!items.length) { console.error(`אין מסכים שמתאימים ל---only ${only.join(',')}. (--list להצגה)`); return 1 }

  await mkdir(outDir, { recursive: true })
  await writeFile(path.join(outDir, '.gitignore'), '*\n!.gitignore\n').catch(() => {})
  if (!only.length) for (const f of await readdir(outDir)) if (f.endsWith('.png')) await rm(path.join(outDir, f), { force: true })

  /* ── כניסה ── */
  const needGuest = items.some((i) => isGuestWho(i.who))
  const sessions = new Map<Who, StaffSession>()
  const skipReason = new Map<Who, string>()
  if (needGuest) {
    const guest = await guestLogin(api)
    for (const w of new Set(items.map((i) => i.who))) if (isGuestWho(w)) sessions.set(w, guest)
  }
  const runs = new Map<FixtureId, FixtureRun>()
  let fixtureUsed = false
  let fixtureNote: string | null = noReal ? 'כבוי ב---no-real' : null
  const cleanup = async (): Promise<void> => {
    if (!runs.size) return
    if (v['keep-fixture']) { console.warn('⚠ --keep-fixture: שורות zz-ux- נשארו ב-DB. לניקוי: npx tsx e2e/run.ts --cleanup-only'); return }
    for (const [id, run] of [...runs]) {
      try { await run.cleanup(); console.log(`fixture ${id} נוקה.`) } catch (e) { console.error(`ניקוי ה-fixture ${id} נכשל — הריצו --cleanup-only:`, e instanceof Error ? e.message : e) }
      runs.delete(id)
    }
  }
  process.once('SIGINT', () => { void cleanup().finally(() => process.exit(130)) })

  /* כל fixture מוזרע רק אם נבחר מסך שצופה שלו משתתף בו; כשל בהזרעה של אחד מדלג רק על הצופים שלו */
  const needed = new Set<FixtureId>()
  if (!noReal) for (const i of items) { const f = fixtureOf(i.who); if (f) needed.add(f) }
  if (needed.size) {
    const notes: string[] = []
    for (const id of [...needed].sort()) {
      try {
        console.log(`מזריע fixture ${id} (מורים אמיתיים)…`)
        const run = await seedFixture(id, api, outDir)
        runs.set(id, run)
        fixtureUsed = true
        for (const w of new Set(items.map((i) => i.who))) {
          if (fixtureOf(w) !== id) continue
          const s = run.sessions[w]
          if (s) sessions.set(w, s)
          else skipReason.set(w, `ה-fixture ${id} לא החזיר טוקן ל-${w} (ראו docs/ux-audit.md → צורת ה-fixture)`)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message.split(String.fromCharCode(10))[0] : String(e)
        notes.push(`${id}: ${msg}`)
        console.warn(`⚠ מסכי ${id === 'results' ? 'real-*' : 'real-v2-*'} ידולגו: ${msg}`)
        for (const w of new Set(items.map((i) => i.who))) if (fixtureOf(w) === id) skipReason.set(w, msg)
      }
    }
    fixtureNote = notes.length ? notes.join(' | ') : `הוזרעו: ${[...runs.keys()].join(', ')}`
  }

  const results: ScreenResult[] = []
  try {
    /* ── גילוי מזהים פר-צופה (רק אם יש תרחיש עם placeholders) ── */
    const varsByWho = new Map<Who, { vars: Vars; notes: string[] }>()
    for (const w of new Set(items.map((i) => i.who))) {
      const s = sessions.get(w)
      if (!s || !items.some((i) => i.who === w && usesPlaceholders(i.scenario))) { varsByWho.set(w, { vars: {}, notes: [] }); continue }
      const ctx: ApiCtx = { api, token: s.access_token, query: lensParams(w) }
      /* מזהי ה-fixture הם של הארגון האמיתי הזמני — רלוונטיים רק לצופי real-*, לא לאורח */
      const fxRun = isRealWho(w) ? runs.get(fixtureOf(w)!) : undefined
      varsByWho.set(w, await discover(w, ctx, fxRun?.ids ?? {}, fxRun?.vars[w] ?? {}))
      const d = varsByWho.get(w)!
      console.log(`גילוי ${w}: ${Object.entries(d.vars).filter(([, x]) => x).map(([k]) => k).join(', ') || '— (כלום)'}${d.notes.length ? `  [${d.notes.join('; ')}]` : ''}`)
    }

    /* ── הרצה ── */
    const browser = await launchBrowser(!!v.headed)
    const groups: { who: Who; viewport: string; jobs: { idx: number; item: { scenario: Scenario; who: Who } }[] }[] = []
    /* סדר קבוע בדוח: לפי סדר התרחישים ב-scenarios.ts, ואז viewport */
    for (const [vpi, vp] of viewports.entries()) {
      for (const w of new Set(items.map((i) => i.who))) {
        groups.push({ who: w, viewport: vp, jobs: items.flatMap((item, ii) => (item.who === w ? [{ idx: ii * viewports.length + vpi, item }] : [])) })
      }
    }
    const total = items.length * viewports.length
    const slots: (ScreenResult | undefined)[] = new Array(total)
    let done = 0
    try {
      const runGroup = async (g: (typeof groups)[number]): Promise<void> => {
        /* בריצה ארוכה: טוקן ישן מ-35 דקות מוחלף בטרי לפני יצירת ההקשר (רק כשיש סיסמה ב-fixture; אחרת הקיים) */
        const fxId = fixtureOf(g.who)
        const fxRun = fxId ? runs.get(fxId) : undefined
        const session = fxRun ? await freshSession(fxRun, g.who, api) : sessions.get(g.who) ?? null
        const skip = skipReason.get(g.who) ?? null
        const needsSession = isGuestWho(g.who) || isRealWho(g.who)
        const ctx = await newContext(browser, { viewport: parseViewport(g.viewport), theme, session })
        try {
          for (const { idx: i, item } of g.jobs) {
            let res: ScreenResult
            if (skip || (needsSession && !session)) {
              res = {
                id: screenId(item.scenario.name, g.who), name: item.scenario.name, who: g.who, group: item.scenario.group, viewport: g.viewport, theme,
                urlPattern: item.scenario.url, requestedUrl: item.scenario.url, finalUrl: null, status: 'skipped', statusDetail: skip ?? 'אין session לצופה', inner: item.scenario.inner ?? false,
                clicksFromMainTab: item.scenario.clicksFromMainTab ?? null, screenshot: null, axe: null, forbidden: [], layout: null,
                consoleErrors: { count: 0, samples: [] }, failedRequests: { count: 0, samples: [] }, loadMs: null, hardFailures: [], strictFailures: [], note: item.scenario.note ?? null, attempts: 0,
              }
            } else {
              const job: ScreenJob = {
                scenario: item.scenario, who: g.who, viewport: g.viewport, theme, vars: varsByWho.get(g.who)?.vars ?? {}, base, outDir,
                screenshots: !v['no-screenshots'], timeoutMs, discoveryNotes: varsByWho.get(g.who)?.notes ?? [],
              }
              res = await runScreen(ctx, job)
            }
            slots[i] = res
            done++
            if (isGuestWho(g.who)) await new Promise((r) => setTimeout(r, guestPauseMs))
            const flag = res.hardFailures.length ? 'FAIL' : res.strictFailures.length && v.strict ? 'FAIL(strict)' : res.status.toUpperCase()
            console.log(`[${String(done).padStart(String(total).length)}/${total}] ${res.id} @ ${res.viewport}  ${flag}${res.statusDetail ? `  — ${res.statusDetail.slice(0, 110)}` : ''}${res.hardFailures.length ? `  — ${res.hardFailures.join(' | ').slice(0, 140)}` : ''}`)
          }
        } finally {
          await ctx.close().catch(() => {})
        }
      }
      /* חשבון האורח משותף (מכסת בקשות פר-IP) ולכן רץ בהקשר אחד בכל פעם; מורים אמיתיים (מכסה פר-משתמש) עד --jobs במקביל */
      const guestGroups = groups.filter((g) => isGuestWho(g.who))
      const otherGroups = groups.filter((g) => !isGuestWho(g.who))
      const guestN = Number(v['guest-jobs'] ?? 1)
      const realN = Number(v.jobs ?? 3)
      if (v.parallel) {
        await Promise.all([schedule(guestGroups, guestN, runGroup), schedule(otherGroups, realN, runGroup)])
      } else {
        /* קודם המורים האמיתיים (הטוקנים טריים), ואז האורח — בלי תנועה מקבילה שצורכת את מכסת ה-IP המשותפת של האורח */
        await schedule(otherGroups, realN, runGroup)
        await schedule(guestGroups, guestN, runGroup)
      }
    } finally {
      await browser.close().catch(() => {})
    }
    for (const r of slots) if (r) results.push(r)
  } finally {
    await cleanup()
  }

  const meta: RunMeta = {
    generatedAt: new Date().toISOString(), base, api, theme, viewports, strict: !!v.strict, args: process.argv.slice(2),
    fixture: { used: fixtureUsed, note: fixtureNote },
  }
  const { md, json, summary } = await writeReports(outDir, meta, results)
  console.log(`\nדוח: ${md}\nJSON: ${json}`)
  if (v.checklist) {
    try {
      const c = await writeChecklist(outDir, meta, results)
      console.log(`צ'קליסט: ${c.md}\n${c.totals.screens} מסכים מובחנים (${c.totals.measured} נמדדו) · נכנסים במסך אחד: ${c.totals.fit} מתוך ${c.totals.measured}`)
    } catch (e) { console.error('כתיבת הצ\'קליסט נכשלה:', e instanceof Error ? e.message : e) }
  }
  console.log(`מסכים ${summary.screens}: ok ${summary.ok} · missing ${summary.missing} · skipped ${summary.skipped} · error ${summary.error} | כשלים קשיחים ${summary.failing} (axe חמור/קריטי ${summary.axeSeriousCritical}, מילים אסורות ${summary.forbiddenHits}, תנאי תרחיש ${summary.assertFailing}) | strict ${summary.strictFailing} | בעיות ידועות (באגי מוצר מתועדים) ${summary.knownIssues}`)
  const fail = summary.failing > 0 || summary.error > 0 || (!!v.strict && summary.strictFailing > 0)
  return fail ? 1 : 0
}

main().then(
  (code) => { process.exitCode = code },
  (e: unknown) => { console.error(e instanceof Error ? e.stack ?? e.message : e); process.exitCode = 1 },
)
