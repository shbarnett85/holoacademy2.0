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
  REAL_ROLES, REAL_WHO, cleanupOnly, guestLogin, lensParams, seedRealFixture,
  type RealFixture, type StaffSession,
} from './lib/login.ts'
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
  --jobs <n>          הקשרי דפדפן במקביל (ברירת מחדל 3)
  --headed            דפדפן גלוי
  --no-screenshots    בלי PNG
  --timeout <ms>      timeout לפעולה (ברירת מחדל 15000)
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

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  const queue = [...items]
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    for (let x = queue.shift(); x !== undefined; x = queue.shift()) await fn(x)
  }))
}

async function main(): Promise<number> {
  const { values: v } = parseArgs({
    options: {
      only: { type: 'string', multiple: true },
      viewport: { type: 'string', multiple: true },
      dark: { type: 'boolean' }, 'no-real': { type: 'boolean' }, strict: { type: 'boolean' },
      out: { type: 'string' }, base: { type: 'string' }, api: { type: 'string' },
      jobs: { type: 'string' }, headed: { type: 'boolean' }, 'no-screenshots': { type: 'boolean' },
      timeout: { type: 'string' }, list: { type: 'boolean' }, 'keep-fixture': { type: 'boolean' },
      'cleanup-only': { type: 'boolean' }, selftest: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: false,
  })
  if (v.help) { console.log(HELP); return 0 }
  if (v.selftest) { const { runSelftest } = await import('./selftest.ts'); return runSelftest() }
  if (v['cleanup-only']) { await cleanupOnly(); console.log('fixture נוקה.'); return 0 }

  const base = (v.base ?? DEFAULT_BASE).replace(/\/$/, '')
  const api = (v.api ?? DEFAULT_API).replace(/\/$/, '')
  const outDir = path.resolve(v.out ?? DEFAULT_OUT)
  const theme: 'light' | 'dark' = v.dark ? 'dark' : 'light'
  const viewports = (v.viewport?.length ? v.viewport.flatMap((x) => x.split(',')) : [...DEFAULT_VIEWPORTS]).map((x) => x.trim()).filter(Boolean)
  for (const vp of viewports) parseViewport(vp)
  const only = (v.only ?? []).flatMap((x) => x.split(',')).map((x) => x.trim()).filter(Boolean)
  const noReal = !!v['no-real']
  const timeoutMs = Number(v.timeout ?? 15_000)

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
  const needReal = !noReal && items.some((i) => isRealWho(i.who))
  const sessions = new Map<Who, StaffSession>()
  const skipReason = new Map<Who, string>()
  if (needGuest) {
    const guest = await guestLogin(api)
    for (const w of new Set(items.map((i) => i.who))) if (isGuestWho(w)) sessions.set(w, guest)
  }
  let fixture: RealFixture | null = null
  let fixtureUsed = false
  let fixtureNote: string | null = noReal ? 'כבוי ב---no-real' : null
  const cleanup = async (): Promise<void> => {
    if (!fixture) return
    if (v['keep-fixture']) { console.warn('⚠ --keep-fixture: שורות zz-ux- נשארו ב-DB. לניקוי: npx tsx e2e/run.ts --cleanup-only'); return }
    try { await fixture.cleanup(); console.log('fixture נוקה.') } catch (e) { console.error('ניקוי ה-fixture נכשל — הריצו --cleanup-only:', e instanceof Error ? e.message : e) }
    fixture = null
  }
  process.once('SIGINT', () => { void cleanup().finally(() => process.exit(130)) })

  if (needReal) {
    try {
      console.log('מזריע fixture של מורים אמיתיים…')
      fixture = await seedRealFixture(api, outDir)
      fixtureUsed = true
      for (const role of REAL_ROLES) {
        const s = fixture.sessions[role]
        if (s) sessions.set(REAL_WHO[role], s)
        else skipReason.set(REAL_WHO[role], `ה-fixture לא החזיר טוקן ל-${role} (ראו docs/ux-audit.md → צורת ה-fixture)`)
      }
    } catch (e) {
      fixtureNote = e instanceof Error ? e.message.split('\n')[0] : String(e)
      console.warn(`⚠ מסכי real-* ידולגו: ${fixtureNote}`)
      for (const w of new Set(items.map((i) => i.who))) if (isRealWho(w)) skipReason.set(w, fixtureNote)
    }
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
      varsByWho.set(w, await discover(w, ctx, isRealWho(w) ? fixture?.ids ?? {} : {}))
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
      await pool(groups, Number(v.jobs ?? 3), async (g) => {
        const session = sessions.get(g.who) ?? null
        const skip = skipReason.get(g.who) ?? null
        const needsSession = isGuestWho(g.who) || isRealWho(g.who)
        const ctx = await newContext(browser, { viewport: parseViewport(g.viewport), theme, session })
        try {
          for (const { idx: i, item } of g.jobs) {
            let res: ScreenResult
            if (skip || (needsSession && !session)) {
              res = {
                id: screenId(item.scenario.name, g.who), name: item.scenario.name, who: g.who, group: item.scenario.group, viewport: g.viewport, theme,
                requestedUrl: item.scenario.url, finalUrl: null, status: 'skipped', statusDetail: skip ?? 'אין session לצופה', inner: item.scenario.inner ?? false,
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
            const flag = res.hardFailures.length ? 'FAIL' : res.strictFailures.length && v.strict ? 'FAIL(strict)' : res.status.toUpperCase()
            console.log(`[${String(done).padStart(String(total).length)}/${total}] ${res.id} @ ${res.viewport}  ${flag}${res.statusDetail ? `  — ${res.statusDetail.slice(0, 110)}` : ''}${res.hardFailures.length ? `  — ${res.hardFailures.join(' | ').slice(0, 140)}` : ''}`)
          }
        } finally {
          await ctx.close().catch(() => {})
        }
      })
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
  console.log(`מסכים ${summary.screens}: ok ${summary.ok} · missing ${summary.missing} · skipped ${summary.skipped} · error ${summary.error} | כשלים קשיחים ${summary.failing} (axe חמור/קריטי ${summary.axeSeriousCritical}, מילים אסורות ${summary.forbiddenHits}) | strict ${summary.strictFailing}`)
  const fail = summary.failing > 0 || summary.error > 0 || (!!v.strict && summary.strictFailing > 0)
  return fail ? 1 : 0
}

main().then(
  (code) => { process.exitCode = code },
  (e: unknown) => { console.error(e instanceof Error ? e.stack ?? e.message : e); process.exitCode = 1 },
)
