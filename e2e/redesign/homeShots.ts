/* ──────────────────────────────────────────────────────────────────────────
   צילומי עמוד הפתיחה והספלאש. כלי בדיקה בלבד: קריאה בלבד (שיעורי ההתנסות מהשרת המקומי), בלי כתיבה ל-DB.
   · splash: פריימים של הספלאש לאורך הזמן (האנימציות מושהות ומקודמות ידנית), כולל הפתיחה אל העמוד.
   · home: המסך הראשון בכמה גדלי מסך, אחרי גלילה, במסך צר ובתנועה מופחתת; ובדיקות: הכניסות והכפתור "שחקו עכשיו"
     בתוך המסך הראשון, החלון לא מכסה את הפורטל, והווידאו של הרקע ושל ד"ר הולו מתנגנים.
   הרצה:  npx tsx e2e/redesign/homeShots.ts --out reports/redesign/stages/home [--only splash,home]
   ────────────────────────────────────────────────────────────────────────── */
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium, type Browser, type Page } from 'playwright-core'
import { DEFAULT_BASE, findChrome } from '../lib/config.ts'

const args = process.argv.slice(2)
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d }
const OUT = opt('out', 'reports/redesign/stages/home')
const ONLY = opt('only', 'splash,home').split(',')
mkdirSync(OUT, { recursive: true })
let failed = 0
const check = (ok: boolean, label: string) => { console.log(`  ${ok ? '✓' : '✗'} ${label}`); if (!ok) failed++ }
const shot = async (page: Page, name: string) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); console.log('  shot', name) }

async function open(browser: Browser, w: number, h: number, opts: { splash?: boolean; reduced?: boolean } = {}): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: 'he-IL', reducedMotion: opts.reduced ? 'reduce' : 'no-preference' })
  await ctx.addInitScript(`(() => { if (!window.__name) window.__name = (f) => f; try { ${opts.splash ? '' : "sessionStorage.setItem('holo_splash_seen','1');"} } catch (e) {} })()`)
  const page = await ctx.newPage()
  await page.goto(DEFAULT_BASE + '/', { waitUntil: 'domcontentloaded' })
  return page
}

async function splash(browser: Browser): Promise<void> {
  console.log('== splash ==')
  const page = await open(browser, 1366, 768, { splash: true })
  await page.waitForSelector('[data-splash]', { timeout: 30000 })
  /* מקדמים את האנימציות ידנית, כדי שכל פריים יהיה אותו דבר בכל הרצה */
  const at = async (ms: number, name: string) => {
    await page.evaluate((t) => { for (const a of document.querySelector('[data-splash]')!.getAnimations({ subtree: true })) { a.pause(); a.currentTime = t } }, ms)
    await shot(page, name)
  }
  await at(350, 'splash-1-gem-falls')
  await at(800, 'splash-2-sparks')
  await at(1100, 'splash-3-letters')
  await at(2200, 'splash-4-complete')
  /* הפתיחה: מחכים לשלב open, ואז מקדמים את הפתח */
  await page.waitForSelector('[data-splash][data-phase=open]', { timeout: 6000 }).catch(() => undefined)
  const open2 = async (ms: number, name: string) => {
    const ok = await page.evaluate((t) => { const el = document.querySelector('[data-splash]'); if (!el) return false; for (const a of el.getAnimations({ subtree: true })) { a.pause(); a.currentTime = t } return true }, ms)
    if (ok) await shot(page, name)
    return ok
  }
  const a = await open2(260, 'splash-5-opening')
  const b = await open2(520, 'splash-6-opening')
  check(a && b, 'הספלאש נפתח אל העמוד (שלב open)')
  await page.waitForSelector('[data-splash]', { state: 'detached', timeout: 8000 }).catch(() => undefined)
  check(await page.locator('[data-splash]').count() === 0, 'הספלאש נסגר בסוף')
  await page.context().close()

  const skip = await open(browser, 1366, 768, { splash: true })
  await skip.waitForSelector('[data-splash]', { timeout: 30000 })
  await skip.mouse.click(400, 300)
  await skip.waitForTimeout(200)
  check(await skip.locator('[data-splash]').count() === 0, 'לחיצה מדלגת על הספלאש')
  await skip.context().close()
}

async function home(browser: Browser): Promise<void> {
  console.log('== home ==')
  for (const [w, h] of [[1366, 768], [1366, 620], [1920, 1080], [1280, 800]] as const) {
    const page = await open(browser, w, h)
    await page.waitForSelector('[data-home-panel]', { timeout: 30000 })
    await page.waitForTimeout(4500)
    await shot(page, `home-${w}x${h}`)
    const g = await page.evaluate(() => {
      const r = (s: string) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom } }
      const hit = document.querySelector('[data-lab-portal-hit]')?.getBoundingClientRect()
      const vids = [...document.querySelectorAll('video')].map((v) => ({ playing: !v.paused && v.readyState >= 2, src: v.currentSrc.split('/').pop() }))
      return { panel: r('[data-home-panel]'), play: r('[data-home-play]'), now: r('[data-home-now]'), bubble: r('[data-home-bubble]'), portal: hit ? { l: hit.left, t: hit.top, r: hit.right, b: hit.bottom } : null, vids, vh: innerHeight, vw: innerWidth, holo: !!document.querySelector('[data-lab-holo]'), canvas: document.querySelectorAll('.lab-hologram').length }
    })
    const inside = (b: { l: number; t: number; r: number; b: number } | null) => !!b && b.t >= 0 && b.b <= g.vh + 0.5 && b.l >= 0 && b.r <= g.vw + 0.5
    check(inside(g.panel), `${w}×${h}: חלון הכניסות כולו במסך הראשון`)
    check(inside(g.play), `${w}×${h}: "שחקו עכשיו" במסך הראשון`)
    check(!!g.panel && !!g.portal && g.panel.l >= g.portal.r - 1, `${w}×${h}: החלון לא מכסה את הפורטל`)
    check(!!g.now && !!g.panel && g.now.r <= g.panel.l + 1, `${w}×${h}: שורת השיעור לא נכנסת מתחת לחלון`)
    check(g.vids.length >= 2 && g.vids.every((v) => v.playing), `${w}×${h}: הרקע וד"ר הולו מתנגנים (${g.vids.map((v) => v.src).join(', ')})`)
    check(g.canvas === 1, `${w}×${h}: הפורטל מציג הולוגרמה חיה`)
    await page.context().close()
  }

  /* גלילה למטה: המדף והשלבים */
  const sc = await open(browser, 1366, 768)
  await sc.waitForSelector('[data-home-panel]')
  await sc.waitForTimeout(2500)
  await sc.locator('#home-how').scrollIntoViewIfNeeded()
  await sc.waitForTimeout(600)
  await shot(sc, 'home-more')
  await sc.context().close()

  /* מסך צר (טלפון לאורך) ומסך 4:3: הבמה למעלה והחלון מתחתיה */
  for (const [name, w, h] of [['phone', 390, 800], ['tablet-4x3', 1024, 768]] as const) {
    const p = await open(browser, w, h)
    await p.waitForSelector('[data-home-panel]')
    await p.waitForTimeout(3500)
    await p.screenshot({ path: path.join(OUT, `home-${name}.png`), fullPage: false }); console.log('  shot', `home-${name}`)
    const ok = await p.evaluate(() => { const a = document.querySelector('[data-home-panel]')!.getBoundingClientRect(); const s = document.querySelector('.home4-stage')!.getBoundingClientRect(); return a.top >= s.bottom - 40 && document.documentElement.scrollWidth <= innerWidth + 1 })
    check(ok, `${name}: החלון מתחת לבמה, בלי גלילה לרוחב`)
    await p.context().close()
  }

  /* תנועה מופחתת: תמונות קבועות, בלי וידאו */
  const rm = await open(browser, 1366, 768, { reduced: true })
  await rm.waitForSelector('[data-home-panel]')
  await rm.waitForTimeout(2500)
  await shot(rm, 'home-reduced-motion')
  check(await rm.evaluate(() => [...document.querySelectorAll('video')].every((v) => v.paused)), 'תנועה מופחתת: שום וידאו לא מתנגן')
  await rm.context().close()

  /* הצלילה לפורטל פותחת את השיעור */
  const dv = await open(browser, 1366, 768)
  await dv.waitForSelector('[data-home-play]')
  await dv.waitForTimeout(2500)
  await dv.locator('[data-home-play]').click()
  await dv.waitForTimeout(600)
  await shot(dv, 'home-dive')
  await dv.waitForURL(/\/play\//, { timeout: 6000 }).catch(() => undefined)
  check(/\/play\//.test(dv.url()), `"שחקו עכשיו": צלילה לפורטל ואז השיעור נפתח (${new URL(dv.url()).pathname})`)
  await dv.context().close()
}

const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
if (ONLY.includes('splash')) await splash(browser)
if (ONLY.includes('home')) await home(browser)
await browser.close()
console.log(failed ? `\n${failed} נכשלו` : '\nהכול עבר')
process.exit(failed ? 1 : 0)
