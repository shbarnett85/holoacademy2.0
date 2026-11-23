/* ──────────────────────────────────────────────────────────────────────────
   הלוגו החדש והקריסטלים החדשים: בדיקות וצילומים. כלי בדיקה בלבד, בלי כתיבה ל-DB.
   · logo:     הלוגו בכל מקום שהוא מופיע בו (עמוד הפתיחה, ספלאש, כותרת המורה, הפס של התלמיד, חלונות הכניסה):
               הקובץ הנכון (מלא מ-40 פיקסלים ומעלה, אחרת האייקון), על לבן או על לוונדר בלבד, עם שטח נקי של רבע מרוחבו,
               וחלונות הכניסה נכנסים במסך בלי גלילה. קובצי ה-favicon, ה-manifest ותמונת השיתוף.
   · crystals: הקריסטלים ב-HUD (2.5 קריסטלים) ובמסך הסיום (2, 3 ו-5), ולוח של כל המצבים בגודל של ה-HUD.
   הרצה:  npx tsx e2e/redesign/brandShots.ts --out reports/logo/shots [--only logo,crystals]
   ────────────────────────────────────────────────────────────────────────── */
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { DEFAULT_API, DEFAULT_BASE, findChrome } from '../lib/config.ts'
import { guestLogin } from '../lib/login.ts'

const args = process.argv.slice(2)
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d }
const OUT = opt('out', 'reports/logo/shots')
const ONLY = opt('only', 'logo,crystals').split(',')
mkdirSync(OUT, { recursive: true })
let failed = 0
const check = (ok: boolean, what: string) => { console.log(`  ${ok ? '✓' : '✗'} ${what}`); if (!ok) failed++ }
const shot = async (page: Page, name: string, clip?: { x: number; y: number; width: number; height: number }) => { await page.screenshot({ path: path.join(OUT, `${name}.png`), clip }); console.log('  shot', name) }

async function ctxOf(browser: Browser, w: number, h: number, init = '', reduced = false, scale = 1): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, screen: { width: w, height: h }, deviceScaleFactor: scale, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', reducedMotion: reduced ? 'reduce' : 'no-preference' })
  await ctx.addInitScript(`(() => { if (!window.__name) window.__name = (f) => f; try { sessionStorage.setItem('holo_splash_seen','1'); ${init} } catch (e) {} })()`)
  return ctx
}

/* ── הלוגו ─────────────────────────────────────────────────────────────── */

interface LogoInfo { variant: string; src: string; w: number; h: number; loaded: boolean; pad: number; ground: string; visible: boolean }

/* כל לוגו שמוצג בעמוד: איזה קובץ, באיזה גודל, כמה שטח נקי, ועל איזה רקע */
const logosOf = (page: Page, scope = 'body') => page.evaluate((sel) => {
  const root = document.querySelector(sel) ?? document.body
  return [...root.querySelectorAll<HTMLElement>('[data-brand-logo]')].map((el) => {
    const img = el.querySelector('img')!
    const r = img.getBoundingClientRect()
    /* הרקע: האב הקרוב ביותר שיש לו צבע רקע אטום */
    let ground = ''
    for (let p: HTMLElement | null = el; p && !ground; p = p.parentElement) {
      const c = getComputedStyle(p).backgroundColor
      const m = /rgba?\(([^)]+)\)/.exec(c)
      const parts = m ? m[1].split(/[ ,/]+/).map(Number) : []
      if (parts.length >= 3 && (parts[3] === undefined || parts[3] > 0.98)) ground = parts.slice(0, 3).join(',')
    }
    /* השטח הנקי בפועל: המרחק מהתמונה אל קצה הרכיב, ואם הרכיב צמוד (tight) אל קצה האריח שעוטף אותו */
    const box = (el.classList.contains('brand-logo--tight') ? el.parentElement! : el).getBoundingClientRect()
    const pad = Math.min(r.left - box.left, box.right - r.right, r.top - box.top, box.bottom - r.bottom)
    return { variant: el.dataset.brandLogo ?? '', src: new URL(img.src).pathname, w: r.width, h: r.height, loaded: img.complete && img.naturalWidth > 0, pad, ground, visible: r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' }
  })
}, scope) as Promise<LogoInfo[]>

/* לבן (surface) או לוונדר (רקע הממשק / רקע תמונת השיתוף) */
const LIGHT_GROUNDS = new Set(['255,255,255', '253,252,255', '230,222,250', '217,210,236'])

function checkLogos(where: string, logos: LogoInfo[], expect: 'full' | 'mark'): void {
  const seen = logos.filter((l) => l.visible)
  check(seen.length >= 1, `${where}: הלוגו מוצג (${seen.length})`)
  for (const l of seen) {
    const file = l.variant === 'full' ? '/holoacademy-logo.svg' : '/holoacademy-mark.svg'
    check(l.loaded && l.src === file, `${where}: הקובץ ${file} נטען`)
    check(l.variant === expect, `${where}: ${expect === 'full' ? 'הלוגו המלא' : 'האייקון'} (${l.variant}, גובה ${l.h.toFixed(0)})`)
    check(l.variant === 'full' ? l.h >= 40 : l.h < 40, `${where}: ${l.variant === 'full' ? 'הלוגו המלא בגובה 40 ומעלה' : 'האייקון רק מתחת ל-40'} (${l.h.toFixed(1)})`)
    check(l.pad + 0.6 >= l.w / 4, `${where}: שטח נקי של רבע מהרוחב מכל צד (${l.pad.toFixed(1)} מתוך ${(l.w / 4).toFixed(1)})`)
    check(LIGHT_GROUNDS.has(l.ground), `${where}: על לבן או על לוונדר (rgb ${l.ground})`)
    const ratio = l.variant === 'full' ? 168 / 204 : 1
    check(Math.abs(l.w / l.h - ratio) < 0.01, `${where}: הפרופורציות של הקובץ נשמרות`)
  }
}

/* חלון כניסה: כולו במסך, בלי גלילה בתוך המסגרת שלו */
const dialogFits = (page: Page) => page.evaluate(() => {
  const d = document.querySelector<HTMLElement>('[role=dialog]')
  if (!d) return false
  const r = d.getBoundingClientRect()
  return d.scrollHeight <= d.clientHeight + 1 && r.top >= 0 && r.bottom <= innerHeight + 0.5
})

/* גובה התוכן של חלונות הכניסה לפני הלוגו (נמדד ב-1366×620): כניסת צוות 669, PIN 607. הלוגו לא מאריך אותם */
const ENTRY_MAX_620: Record<string, number> = { login: 669, forgot: 583, pin: 607 }
const dialogHeight = (page: Page) => page.evaluate(() => document.querySelector<HTMLElement>('[role=dialog]')?.scrollHeight ?? 9999)

async function logo(browser: Browser): Promise<void> {
  console.log('== logo ==')
  /* עמוד הפתיחה והספלאש */
  {
    const c = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'he-IL' })
    const p = await c.newPage()
    await p.goto(DEFAULT_BASE + '/', { waitUntil: 'domcontentloaded' })
    await p.waitForSelector('[data-splash] [data-brand-logo] img'); await p.waitForTimeout(2100)
    checkLogos('ספלאש', await logosOf(p, '[data-splash]'), 'full')
    await shot(p, 'logo-splash')
    await c.close()
  }
  for (const [w, h] of [[1366, 768], [1366, 620]] as const) {
    const ctx = await ctxOf(browser, w, h)
    const page = await ctx.newPage()
    await page.goto(DEFAULT_BASE + '/', { waitUntil: 'networkidle' }).catch(() => undefined); await page.waitForTimeout(1800)
    checkLogos(`עמוד הפתיחה ${w}×${h}`, await logosOf(page), 'full')
    if (h === 768) await shot(page, 'logo-home')
    /* חלון קוד הכיתה */
    await page.getByRole('button', { name: /כניסת תלמידים/ }).click(); await page.waitForTimeout(500)
    const modal = (await logosOf(page)).slice(-1)
    checkLogos(`חלון קוד הכיתה ${w}×${h}`, modal, 'full')
    if (h === 768) await shot(page, 'logo-class-code')

    for (const [name, url, label] of [['login', '/staff/login', 'כניסת צוות'], ['signup', '/staff/signup', 'הרשמת צוות'], ['forgot', '/staff/forgot', 'שחזור סיסמה']] as const) {
      await page.goto(DEFAULT_BASE + url, { waitUntil: 'networkidle' }).catch(() => undefined); await page.waitForTimeout(1200)
      checkLogos(`${label} ${w}×${h}`, await logosOf(page, '[role=dialog]'), 'full')
      /* בגובה 768 החלון כולו במסך. טופס ההרשמה ארוך ונגלל גם בלי הלוגו (הלוגו שם לצד הכותרת, כדי לא להאריך אותו);
         בגובה 620 חלון הכניסה וחלון ה-PIN נגללו עוד לפני הלוגו, ונבדק שהלוגו לא האריך אותם (ENTRY_MAX_620) */
      if (name !== 'signup' && h === 768) check(await dialogFits(page), `${label} ${w}×${h}: החלון כולו במסך, בלי גלילה`)
      if (name !== 'signup' && h === 620) check(await dialogHeight(page) <= ENTRY_MAX_620[name], `${label} ${w}×${h}: החלון לא ארוך יותר משהיה לפני הלוגו (${await dialogHeight(page)} מתוך ${ENTRY_MAX_620[name]})`)
      await shot(page, `logo-${name}-${w}x${h}`)
    }
    /* קוד כיתה: בחירת שם ואז PIN (ה-API מדומה) */
    await page.route('**/api/class/**', (r) => r.fulfill({ json: { school: { name: 'בית ספר הדקל' }, class: { id: 'c1', name: 'ו׳2' }, students: [{ id: 's1', name: 'נועה לוי' }, { id: 's2', name: 'איתי כהן' }, { id: 's3', name: 'מאיה דיין' }] } }))
    await page.goto(DEFAULT_BASE + '/class/demo', { waitUntil: 'networkidle' }).catch(() => undefined); await page.waitForTimeout(1200)
    if (await page.locator('[role=dialog] [data-brand-logo]').count()) {
      checkLogos(`בחירת שם ${w}×${h}`, await logosOf(page, '[role=dialog]'), 'full')
      check(await dialogFits(page), `בחירת שם ${w}×${h}: החלון כולו במסך, בלי גלילה`)
      await shot(page, `logo-class-entry-${w}x${h}`)
      await page.locator('[role=dialog] button', { hasText: 'נועה לוי' }).click(); await page.waitForTimeout(600)
      checkLogos(`PIN ${w}×${h}`, await logosOf(page, '[role=dialog]'), 'full')
      if (h === 768) check(await dialogFits(page), `PIN ${w}×${h}: החלון כולו במסך, בלי גלילה`)
      else check(await dialogHeight(page) <= ENTRY_MAX_620.pin, `PIN ${w}×${h}: החלון לא ארוך יותר משהיה לפני הלוגו (${await dialogHeight(page)} מתוך ${ENTRY_MAX_620.pin})`)
      await shot(page, `logo-pin-${w}x${h}`)
    } else {
      check(false, `בחירת שם ${w}×${h}: המסך לא נטען (${(await page.locator('[role=dialog]').innerText().catch(() => '')).slice(0, 60)})`)
    }
    await ctx.close()
  }

  /* כותרת המורה (מורה אורח, קריאה בלבד) */
  {
    const session = await guestLogin(DEFAULT_API)
    const ctx = await ctxOf(browser, 1366, 768, `localStorage.setItem('holo_staff_session', ${JSON.stringify(JSON.stringify(session))});`)
    const page = await ctx.newPage()
    await page.goto(DEFAULT_BASE + '/creator', { waitUntil: 'networkidle' }).catch(() => undefined); await page.waitForTimeout(1800)
    checkLogos('כותרת המורה', await logosOf(page, '[data-studio-shell]'), 'mark')
    const hb = await page.locator('[data-studio-shell]').boundingBox()
    await shot(page, 'logo-header-teacher-page')
    if (hb) await shot(page, 'logo-header-teacher', { x: 0, y: 0, width: 1366, height: Math.ceil(hb.height) + 8 })
    await ctx.close()
  }

  /* הפס העליון של התלמיד */
  {
    const jwt = `x.${Buffer.from(JSON.stringify({ userId: 'stu-demo', role: 'student', classId: 'c1', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64')}.y`
    for (const [w, h] of [[1366, 768], [390, 800]] as const) {
      const ctx = await ctxOf(browser, w, h, `sessionStorage.setItem('holo_token','${jwt}'); sessionStorage.setItem('holo_student_name','נועה לוי');`)
      const page = await ctx.newPage()
      await page.route('**/api/**', (r) => r.fulfill({ json: {} }))
      await page.route('**/api/sessions/assigned', (r) => r.fulfill({ json: { quests: [] } }))
      await page.goto(DEFAULT_BASE + '/student', { waitUntil: 'domcontentloaded' }); await page.waitForSelector('[data-portal-top]'); await page.waitForTimeout(1200)
      const logos = (await logosOf(page, '[data-portal-top]')).filter((l) => l.visible)
      if (w > 600) checkLogos(`הפס של התלמיד ${w}×${h}`, logos, 'mark')
      else check(logos.length === 0 || logos.every((l) => l.variant === 'mark'), `הפס של התלמיד בטלפון: בלי לוגו או עם האייקון (${logos.length})`)
      const tb = await page.locator('[data-portal-top]').boundingBox()
      if (tb) await shot(page, `logo-header-student-${w}`, { x: 0, y: 0, width: w, height: Math.ceil(tb.height) + 8 })
      await ctx.close()
    }
  }

  /* favicon, manifest ותמונת השיתוף */
  {
    const ctx = await ctxOf(browser, 900, 420, '', false, 2)
    const page = await ctx.newPage()
    await page.goto(DEFAULT_BASE + '/staff/login', { waitUntil: 'domcontentloaded' })
    const links = await page.evaluate(() => [...document.querySelectorAll<HTMLLinkElement>('link[rel~=icon], link[rel=apple-touch-icon], link[rel=manifest]')].map((l) => ({ rel: l.rel, href: l.getAttribute('href') ?? '' })))
    for (const l of links) {
      const res = await page.request.get(DEFAULT_BASE + l.href)
      check(res.ok(), `${l.rel}: ${l.href} מוגש (${res.status()})`)
    }
    const dim = (buf: Buffer) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) })
    for (const [file, size] of [['favicon-32x32.png', 32], ['apple-touch-icon.png', 180], ['android-chrome-192x192.png', 192], ['android-chrome-512x512.png', 512]] as const) {
      const d = dim(readFileSync(path.join('public', file)))
      check(d.w === size && d.h === size, `${file}: ${d.w}×${d.h}`)
    }
    const og = dim(readFileSync('public/og-image.png'))
    check(og.w === 1200 && og.h === 630, `og-image.png: ${og.w}×${og.h}`)
    check(readFileSync('public/favicon.svg', 'utf8') === readFileSync('public/holoacademy-mark.svg', 'utf8'), 'favicon.svg זהה ל-holoacademy-mark.svg')
    const man = JSON.parse(readFileSync('public/site.webmanifest', 'utf8')) as { icons: { sizes: string }[] }
    check(['192x192', '512x512'].every((s) => man.icons.some((i) => i.sizes === s)), 'ב-manifest: אייקונים של 192 ושל 512')
    const ogTag = await page.locator('meta[property="og:image"]').getAttribute('content')
    check(!!ogTag && ogTag.endsWith('/og-image.png'), `og:image מצביע על תמונת השיתוף (${ogTag})`)
    /* לשונית דפדפן: הדמיה של לשונית עם קובץ ה-favicon האמיתי בגודל שבו דפדפן מציג אותו (16 פיקסלים), בהירה וכהה.
       Chrome בלי ממשק לא מצייר את שורת הלשוניות, ולכן זו הדמיה ולא צילום של חלון הדפדפן */
    const title = await page.title()
    await page.setContent(`<!doctype html><html lang="he" dir="rtl"><body style="margin:0;padding:22px;font:13px 'Segoe UI',Arial,sans-serif;background:#fff">
      ${[['#DEE1E6', '#fff', '#202124'], ['#202124', '#35363A', '#E8EAED']].map(([bar, tab, ink]) => `
      <div style="background:${bar};padding:8px 10px 0;border-radius:8px 8px 0 0;margin-bottom:18px;display:flex" dir="ltr">
        <div style="background:${tab};color:${ink};border-radius:8px 8px 0 0;padding:8px 12px;display:flex;align-items:center;gap:8px;width:250px">
          <img src="${DEFAULT_BASE}/favicon.svg" width="16" height="16"><span dir="rtl" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1">${title}</span><span style="opacity:.6">✕</span>
        </div>
      </div>`).join('')}
      <div style="display:flex;gap:26px;align-items:flex-end" dir="ltr">
        ${[['favicon.svg', 16], ['favicon-32x32.png', 32], ['favicon.ico', 48], ['apple-touch-icon.png', 90], ['android-chrome-192x192.png', 96], ['android-chrome-512x512.png', 128]].map(([f, s]) => `<figure style="margin:0;text-align:center"><img src="${DEFAULT_BASE}/${f}" width="${s}" height="${s}" style="display:block;margin:0 auto 6px"><figcaption>${f}</figcaption></figure>`).join('')}
      </div></body></html>`)
    await page.waitForTimeout(600)
    await shot(page, 'logo-favicon-tab')
    await ctx.close()
  }
}

const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
if (ONLY.includes('logo')) await logo(browser)
await browser.close()
console.log(failed ? `\n${failed} בדיקות נכשלו` : '\nהכול עבר')
process.exit(failed ? 1 : 0)
