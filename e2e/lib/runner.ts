/* ──────────────────────────────────────────────────────────────────────────
   runScreen — מריץ מסך אחד (תרחיש × מי × viewport) ומחזיר ScreenResult.
   סובלני: מסך/אלמנט שלא נבנה → status 'missing' (לא קריסה); משתנה גילוי חסר → 'skipped'.
   ────────────────────────────────────────────────────────────────────────── */
import path from 'node:path'
import type { BrowserContext, Locator, Page } from 'playwright-core'
import { auditPage, judge } from './audit.ts'
import { substitute } from './discover.ts'
import { lensParams } from './login.ts'
import { MissingError, SkipError, isGuestWho } from './types.ts'
import type { Scenario, ScreenResult, Step, Target, Vars, Who } from './types.ts'

export interface ScreenJob {
  scenario: Scenario
  who: Who
  viewport: string
  theme: 'light' | 'dark'
  vars: Vars
  base: string
  outDir: string
  /* 'screenshots' = false → בלי PNG */
  screenshots: boolean
  timeoutMs: number
  /* ברירת מחדל לכישלון-פתרון משתנה: הסבר מדוע לא ניתן לגלות (מ-discover) */
  discoveryNotes: string[]
}

const slug = (s: string): string => s.replace(/[^a-zA-Z0-9._-]+/g, '-')
export const screenId = (name: string, who: Who): string => `${name}.${who}`

function locate(page: Page, t: Target, vars: Vars): Locator {
  if (typeof t === 'string') return page.locator(substitute(t, vars, false).value).first()
  if ('text' in t) return page.getByText(substitute(t.text, vars, false).value, { exact: t.exact }).first()
  return page.getByRole(t.role as Parameters<Page['getByRole']>[0], { name: t.name ? substitute(t.name, vars, false).value : undefined, exact: t.exact }).first()
}
const targetLabel = (t: Target): string => (typeof t === 'string' ? t : 'text' in t ? `text="${t.text}"` : `role=${t.role}${t.name ? `[name="${t.name}"]` : ''}`)

/* ממתין שהדף "יתייצב": DOM, רשת, מחוון "טוען…" נעלם, גופנים, מעט זמן לאנימציות */
export async function settle(page: Page, extraMs = 450): Promise<void> {
  await page.waitForLoadState('domcontentloaded').catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
  await page.waitForFunction(() => !/טוען…|טוען\.\.\./.test(document.body?.innerText ?? ''), null, { timeout: 8000 }).catch(() => {})
  await page.evaluate(() => document.fonts?.ready.then(() => true)).catch(() => {})
  await page.waitForTimeout(extraMs)
}

async function runStep(page: Page, step: Step, vars: Vars, timeoutMs: number): Promise<void> {
  if ('click' in step) {
    const loc = locate(page, step.click, vars)
    try { await loc.click({ timeout: Math.min(timeoutMs, 8000) }) } catch {
      if (step.optional) return
      throw new MissingError(`לחיצה: לא נמצא ${targetLabel(step.click)}`)
    }
    await settle(page, 300)
  } else if ('fill' in step) {
    try { await locate(page, step.fill, vars).fill(substitute(step.value, vars, false).value, { timeout: 8000 }) } catch {
      throw new MissingError(`מילוי: לא נמצא ${targetLabel(step.fill)}`)
    }
  } else if ('waitFor' in step) {
    try { await locate(page, step.waitFor, vars).waitFor({ state: 'visible', timeout: step.timeoutMs ?? 8000 }) } catch {
      if (step.optional) return
      throw new MissingError(`המתנה: לא הופיע ${targetLabel(step.waitFor)}`)
    }
  } else if ('wait' in step) {
    await page.waitForTimeout(step.wait)
  } else if ('press' in step) {
    await page.keyboard.press(step.press)
    await settle(page, 200)
  }
}

function buildUrl(job: ScreenJob): { url: string; missing: string[] } {
  const { value, missing } = substitute(job.scenario.url, job.vars, true)
  if (missing.length) return { url: job.scenario.url, missing }
  const u = new URL(value, job.base)
  /* אורח: בורר העדשה (?lens=&subject=) נוסף אם לא נכתב במפורש בתרחיש */
  if (isGuestWho(job.who)) {
    for (const [k, v] of Object.entries(lensParams(job.who))) if (!u.searchParams.has(k)) u.searchParams.set(k, v)
  }
  return { url: u.pathname + u.search, missing }
}

function clicksOf(s: Scenario): number | null {
  if (typeof s.clicksFromMainTab === 'number') return s.clicksFromMainTab
  const n = (s.steps ?? []).filter((st) => 'click' in st).length
  return s.steps ? n : null
}

/* Vite HMR (כשמישהו שומר קובץ) טוען את הדף מחדש באמצע המדידה → "Execution context was destroyed"; ודף ריק רגעי בזמן בנייה מחדש.
   לכן ניסיון חוזר: עד 2 על שגיאת ניווט, ו-1 על "דף ריק/הופנה" (כדי לא להכפיל זמן על מסלול שבאמת לא קיים). */
const NAV_ERR = /Execution context was destroyed|Target (page|closed)|net::ERR|frame was detached/i
export async function runScreen(ctx: BrowserContext, job: ScreenJob): Promise<ScreenResult> {
  let res = await runScreenOnce(ctx, job)
  let attempts = 1
  for (let i = 0; i < 2; i++) {
    const nav = res.status === 'error' && NAV_ERR.test(res.statusDetail ?? '')
    const blank = res.status === 'missing' && /דף ריק|הופנה/.test(res.statusDetail ?? '') && attempts < 2
    if (!nav && !blank) break
    await new Promise((r) => setTimeout(r, 2000))
    res = await runScreenOnce(ctx, job)
    attempts++
  }
  res.attempts = attempts
  return res
}

async function runScreenOnce(ctx: BrowserContext, job: ScreenJob): Promise<ScreenResult> {
  const { scenario: sc, who } = job
  const id = screenId(sc.name, who)
  const result: ScreenResult = {
    id, name: sc.name, who, group: sc.group, viewport: job.viewport, theme: job.theme,
    requestedUrl: '', finalUrl: null, status: 'ok', statusDetail: null, inner: sc.inner ?? false,
    clicksFromMainTab: clicksOf(sc), screenshot: null, axe: null, forbidden: [], layout: null,
    consoleErrors: { count: 0, samples: [] }, failedRequests: { count: 0, samples: [] },
    loadMs: null, hardFailures: [], strictFailures: [], note: sc.note ?? null, attempts: 1,
  }

  const { url, missing } = buildUrl(job)
  result.requestedUrl = url
  if (missing.length) {
    result.status = 'skipped'
    const why = job.discoveryNotes.length ? ` (${job.discoveryNotes.join('; ')})` : ''
    result.statusDetail = `לא ניתן לגלות ${missing.map((m) => `{${m}}`).join(', ')}${why}`
    return result
  }

  const page = await ctx.newPage()
  page.setDefaultTimeout(job.timeoutMs)
  const push = (bucket: { count: number; samples: string[] }, msg: string): void => {
    bucket.count++
    if (bucket.samples.length < 5) bucket.samples.push(msg.slice(0, 220))
  }
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const t = m.text()
    if (/^Failed to load resource/.test(t)) return /* מכוסה ב-failedRequests */
    push(result.consoleErrors, t)
  })
  page.on('pageerror', (e) => push(result.consoleErrors, `pageerror: ${e.message}`))
  page.on('response', (r) => { if (r.status() >= 400) push(result.failedRequests, `${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`) })
  page.on('requestfailed', (r) => { const f = r.failure()?.errorText ?? ''; if (!/ERR_ABORTED/.test(f)) push(result.failedRequests, `${f} ${new URL(r.url()).pathname}`) })

  const t0 = Date.now()
  let auditing = false
  try {
    await page.goto(new URL(url, job.base).toString(), { waitUntil: 'domcontentloaded', timeout: Math.max(job.timeoutMs, 45_000) })
    await settle(page)

    const wantPath = new URL(url, job.base).pathname
    const gotPath = new URL(page.url()).pathname
    if (gotPath.startsWith('/staff/login') && !wantPath.startsWith('/staff')) {
      throw new Error('הופנה ל-/staff/login — ה-session נדחה (טוקן פג, או שמשתמשי ה-fixture נמחקו ע"י ניקוי zz-ux- מקביל של ריצה/סוכן אחר — אל תריצו שני fixture במקביל)')
    }
    if (gotPath !== wantPath && !(sc.steps && sc.steps.length)) {
      throw new MissingError(`הופנה ל-${gotPath} (המסלול ${wantPath} כנראה עוד לא קיים)`)
    }
    const bodyLen = await page.evaluate(() => (document.body?.innerText ?? '').trim().length)
    if (bodyLen < 15) throw new MissingError('דף ריק — המסלול עוד לא קיים או לא רונדר')

    for (const step of sc.steps ?? []) await runStep(page, step, job.vars, job.timeoutMs)

    if (sc.ready) {
      try { await locate(page, sc.ready, job.vars).waitFor({ state: 'visible', timeout: 10_000 }) } catch {
        throw new MissingError(`אלמנט המוכנות לא הופיע: ${targetLabel(sc.ready)}`)
      }
      await settle(page, 250)
    }
    result.loadMs = Date.now() - t0
    result.finalUrl = page.url().replace(job.base, '')

    const shot = job.screenshots ? path.join(job.outDir, `${slug(id)}-${job.viewport}${job.theme === 'dark' ? '-dark' : ''}.png`) : null
    auditing = true
    const audit = await auditPage(page, shot)
    result.screenshot = shot ? path.relative(job.outDir, shot).replace(/\\/g, '/') : null
    result.axe = audit.axe
    result.forbidden = audit.forbidden
    result.layout = audit.layout
  } catch (e) {
    result.loadMs = Date.now() - t0
    result.finalUrl = (() => { try { return page.url().replace(job.base, '') } catch { return null } })()
    if (e instanceof MissingError) {
      result.status = 'missing'
      result.statusDetail = `route/element missing: ${e.message}`
    } else if (e instanceof SkipError) {
      result.status = 'skipped'
      result.statusDetail = e.message
    } else {
      const msg = e instanceof Error ? e.message.split('\n')[0] : String(e)
      /* timeout בניווט/המתנה לרכיב = כנראה לא נבנה; כל השאר שגיאת הרצה אמיתית */
      if (!auditing && /Timeout .* exceeded/i.test(msg)) {
        result.status = 'missing'
        result.statusDetail = `route/element missing: ${msg}`
      } else {
        result.status = 'error'
        result.statusDetail = msg
      }
    }
    /* צילום לצורך דיבוג גם למסך חסר/שגוי */
    if (job.screenshots) {
      const shot = path.join(job.outDir, `${slug(id)}-${job.viewport}${job.theme === 'dark' ? '-dark' : ''}.png`)
      try { await page.screenshot({ path: shot, fullPage: false, timeout: 8000 }); result.screenshot = path.relative(job.outDir, shot).replace(/\\/g, '/') } catch { /* לא קריטי */ }
    }
  } finally {
    await page.close().catch(() => {})
  }

  if (result.status === 'ok') {
    const v = judge(result)
    result.hardFailures = v.hard
    result.strictFailures = v.strict
  } else if (result.status === 'error') {
    result.hardFailures = [`שגיאת הרצה: ${result.statusDetail}`]
  }
  return result
}
