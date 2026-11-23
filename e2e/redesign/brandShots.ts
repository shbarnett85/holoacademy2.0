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

/* ── הקריסטלים ─────────────────────────────────────────────────────────── */

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768"><rect width="1024" height="768" fill="#9ccbe6"/><circle cx="300" cy="240" r="120" fill="#ffd166"/><path d="M0 560 Q260 470 520 560 T1024 540 V768 H0Z" fill="#3a86c8"/></svg>'
const IMG = `data:image/svg+xml;utf8,${encodeURIComponent(SVG)}`
const QID = '00000000-0000-4000-8000-0000000000bc'
const TF = { type: 'trueFalse', question: 'הנילוס עובר במצרים.', difficulty: 5, choices: [{ id: 't', text: 'נכון', isCorrect: true }, { id: 'f', text: 'לא נכון', isCorrect: false }], explanationCorrect: 'נכון, הנילוס עובר במצרים.', explanationIncorrect: 'התשובה הנכונה היא נכון.' }
const lesson = (n: number) => ({
  id: QID, title: 'מסע אל המעיין', subject: 'history', subject_code: 'history',
  game_data: {
    scenes: [
      { id: 's0', title: 'המעבדה', narrative: 'ברוכים הבאים. היום יוצאים למסע אל המעיין.', imageUrl: IMG, imagePrompt: 'x', nextSceneId: 's1' },
      ...Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, title: `הגשר ${i + 1}`, narrative: 'הנהר זורם בשקט בין השדות. על הגדה עומדת סירה קטנה.', imageUrl: IMG, imagePrompt: 'x', puzzle: TF, nextSceneId: i + 1 < n ? `s${i + 2}` : null })),
    ],
    entrySceneId: 's0', readingScale: 10, holoMoods: { opening: 'רגיל', closed: 'שמח', open: 'עצוב' },
    endingGood: { title: 'המעיין נמצא', narrative: 'בזכותכם המים חזרו אל השדות.', imageUrl: IMG },
    endingBad: { title: 'הסיפור עוד פתוח', narrative: 'חסרות עוד תובנות כדי למצוא את המעיין.', imageUrl: IMG },
  },
})
const STUDENT_JWT = `x.${Buffer.from(JSON.stringify({ userId: 'stu-demo', role: 'student', classId: 'c1', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64')}.y`
const STUDENT = `sessionStorage.setItem('holo_token','${STUDENT_JWT}'); sessionStorage.setItem('holo_student_name','נועה לוי');`

async function openGame(ctx: BrowserContext, n: number): Promise<Page> {
  const page = await ctx.newPage()
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.route(`**/api/quests/${QID}`, (r) => r.fulfill({ json: { quest: lesson(n) } }))
  await page.route('**/api/sessions/start', (r) => r.fulfill({ json: { sessionId: 'sess-1', resumed: false, currentSceneId: null, inventory: [], visitedScenes: [], crystals: 0, effectsLevel: 'medium', isReplay: false } }))
  await page.route('**/api/sessions/*/complete', (r) => r.fulfill({ json: { ok: true, profileUpdated: true } }))
  await page.route('**/api/sessions/class-gems/**', (r) => r.fulfill({ json: { available: false } }))
  await page.route('**/api/sessions/assigned', (r) => r.fulfill({ json: { quests: [] } }))
  await page.goto(`${DEFAULT_BASE}/play/${QID}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.holo-text-area', { timeout: 30000 })
  return page
}
const startBtn = (page: Page) => page.getByRole('button', { name: /פתרו את האתגר/ })
async function next(page: Page): Promise<void> {
  for (let i = 0; i < 24; i++) {
    if (await page.locator('[data-end-screen]').count()) return
    if (await startBtn(page).isVisible().catch(() => false)) return
    const b = page.locator('button:visible:not([disabled])', { hasText: /המשך|סיום|לסיכום/ }).last()
    if (await b.isVisible().catch(() => false)) await b.click({ timeout: 2000 }).catch(() => undefined)
    await page.waitForTimeout(450)
  }
}
async function answer(page: Page, right: boolean): Promise<void> {
  await startBtn(page).click({ timeout: 12000 })
  await page.waitForSelector('.holo-stage', { timeout: 10000 }); await page.waitForTimeout(950)
  await page.locator('.holo-stage button', { hasText: right ? /^\s*נכון\s*$/ : /לא נכון/ }).first().click()
  await page.waitForTimeout(1500)
}

/* מצב הקריסטלים בשורה: החלק המלא והמצב של כל אחד, והאם הצורה והקו הם של הקובץ */
const gemsOf = (page: Page, scope: string) => page.evaluate((sel) => [...document.querySelectorAll<SVGSVGElement>(`${sel} svg.gem`)].map((g) => {
  const outline = [...g.querySelectorAll('path')].pop()!
  const cs = getComputedStyle(outline)
  return {
    fill: Number(g.dataset.gemFill), tier: g.dataset.gemTier ?? '', viewBox: g.getAttribute('viewBox'), d: outline.getAttribute('d'),
    stroke: cs.stroke, strokeWidth: cs.strokeWidth, join: cs.strokeLinejoin, paths: g.querySelectorAll('path').length, w: g.getBoundingClientRect().width,
    glowAnim: (() => { const e = g.querySelector('.gem__glow'); return e ? getComputedStyle(e).animationDuration + '|' + getComputedStyle(e).animationName + '|' + getComputedStyle(e).opacity : '' })(),
    flashAnim: (() => { const e = g.querySelector('.gem__flash'); return e ? getComputedStyle(e).animationDuration + '|' + getComputedStyle(e).animationName + '|' + getComputedStyle(e).opacity : '' })(),
    pulseAnim: (() => { const e = g.querySelector('.gem__pulse'); return e ? getComputedStyle(e).animationDuration + '|' + getComputedStyle(e).animationName : '' })(),
  }
}), scope)

/* הצבע הממוצע של גוף הקריסטל בצילום (החלק המרכזי שלו), כדי למדוד כמה שני מצבים שונים זה מזה */
async function meanColor(page: Page, png: Buffer): Promise<[number, number, number]> {
  return page.evaluate(async (b64) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const g = c.getContext('2d')!; g.drawImage(img, 0, 0)
    const x0 = Math.round(img.width * 0.3), y0 = Math.round(img.height * 0.2), w = Math.round(img.width * 0.4), h = Math.round(img.height * 0.4)
    const d = g.getImageData(x0, y0, w, h).data
    let r = 0, gg = 0, b = 0
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2] }
    const n = d.length / 4
    return [Math.round(r / n), Math.round(gg / n), Math.round(b / n)] as [number, number, number]
  }, png.toString('base64'))
}

const SHAPE = { viewBox: '0 0 48 44', d: 'M13.4 1.5 H34.6 L46.5 17.6 L24 41 L1.5 17.6 Z', stroke: 'rgb(5, 42, 85)' }

async function crystals(browser: Browser): Promise<void> {
  console.log('== crystals ==')
  const hudClip = async (page: Page) => { const b = (await page.locator('[data-gem-bar]').boundingBox())!; return { x: Math.max(0, b.x - 26), y: Math.max(0, b.y - 22), width: b.width + 52, height: b.height + 44 } }
  const firstGem: Record<string, Buffer> = {}

  /* ה-HUD עם 2.5 קריסטלים: שני אתגרים, אחד הצליח */
  {
    const ctx = await ctxOf(browser, 1366, 768, STUDENT, false, 2)
    const page = await openGame(ctx, 2)
    await next(page)
    const empty = await gemsOf(page, '[data-gem-bar]')
    check(empty.length === 5 && empty.every((g) => g.fill === 0 && g.tier === 'base'), 'HUD בתחילת שיעור: חמישה מקומות ריקים')
    await answer(page, true); await page.waitForTimeout(1600)
    const g = await gemsOf(page, '[data-gem-bar]')
    check(g.map((x) => x.fill).join(',') === '100,100,50,0,0', `HUD עם 2.5 קריסטלים: שניים מלאים, אחד חצי ושניים ריקים (${g.map((x) => x.fill).join(',')})`)
    check(g.every((x) => x.tier === 'base' && !x.glowAnim && !x.flashAnim), 'פחות מ-3 שלמים: בלי זוהר ובלי הבזקים')
    check(g.every((x) => x.viewBox === SHAPE.viewBox && x.d === SHAPE.d), 'הצורה היא הצללית של holoacademy-crystal.svg')
    check(g.every((x) => x.stroke === SHAPE.stroke && Math.abs(parseFloat(x.strokeWidth) - 2.5) < 0.01 && x.join === 'round'), `קו המתאר: holo-deep, עובי 2.5, פינות מעוגלות, בכל המצבים (${g[0].stroke}, ${g[0].strokeWidth})`)
    check(g.every((x) => x.paths <= 3), 'בלי קווים פנימיים: רק מילוי וקו מתאר')
    await shot(page, 'crystals-hud-2.5-page')
    await shot(page, 'crystals-hud-2.5', await hudClip(page))
    firstGem.cyan = await page.locator('[data-gem-bar] svg.gem').first().screenshot()
    await ctx.close()
  }

  /* מסך הסיום עם 2, 3 ו-5 קריסטלים, וה-HUD באותם מצבים */
  for (const gems of [2, 3, 5] as const) {
    const ctx = await ctxOf(browser, 1366, 768, STUDENT, false, 2)
    const page = await openGame(ctx, 5)
    await next(page)
    for (let i = 0; i < 5; i++) {
      await answer(page, i < gems)
      if (i === 4) {
        const hud = await gemsOf(page, '[data-gem-bar]')
        const tier = gems === 5 ? 'full' : gems >= 3 ? 'warm' : 'base'
        check(hud.filter((x) => x.fill === 100).length === gems && hud.filter((x) => x.fill === 100).every((x) => x.tier === tier), `HUD עם ${gems} קריסטלים: המצב ${tier}`)
        check(hud.every((x) => !x.glowAnim.includes('gem-beat') && !x.flashAnim.includes('gem-beat') && !x.pulseAnim.includes('gem-beat')), `HUD עם ${gems}: בלי פעימות (בזמן קריאה שום דבר לא זז)`)
        await page.waitForTimeout(900)
        await shot(page, `crystals-hud-${gems}`, await hudClip(page))
        firstGem[tier] = await page.locator('[data-gem-bar] svg.gem').first().screenshot()
      }
      await next(page)
    }
    await page.waitForSelector('[data-end-screen]', { timeout: 25000 }); await page.waitForTimeout(3400)
    const end = await gemsOf(page, '[data-end-gems]')
    check(end.filter((x) => x.fill === 100).length === gems && end.filter((x) => x.fill === 0).length === 5 - gems, `מסך הסיום: ${gems} קריסטלים מלאים`)
    const lit = end.filter((x) => x.fill === 100)
    if (gems === 2) check(lit.every((x) => x.tier === 'base' && !x.glowAnim), 'מסך הסיום עם 2: בלי זוהר ובלי הבזקים')
    if (gems === 3) check(lit.every((x) => x.tier === 'warm' && x.glowAnim.startsWith('1.6s|gem-beat') && x.pulseAnim.startsWith('1.6s|gem-beat')), `מסך הסיום עם 3: פעימה כל 1.6 שניות, בזוהר ובקריסטל (${lit[0]?.glowAnim})`)
    if (gems === 5) check(lit.every((x) => x.tier === 'full' && x.flashAnim.startsWith('1.2s|gem-beat') && !x.glowAnim.includes('gem-beat') && Number(x.glowAnim.split('|')[2]) > 0.9), `מסך הסיום עם 5: זוהר קבוע והבזק כל 1.2 שניות (${lit[0]?.flashAnim})`)
    check(end.every((x) => x.stroke === SHAPE.stroke && x.d === SHAPE.d), `מסך הסיום עם ${gems}: אותה צורה ואותו קו בכל הקריסטלים`)
    await shot(page, `crystals-end-${gems}`)
    const eb = (await page.locator('[data-end-gems]').boundingBox())!
    /* מנוחה: בין פעימה לפעימה */
    await page.evaluate(() => { for (const a of document.getAnimations()) { if ((a as CSSAnimation).animationName === 'gem-beat') { a.pause(); a.currentTime = 0 } } })
    await page.waitForTimeout(120)
    await shot(page, `crystals-end-${gems}-row`, { x: eb.x - 40, y: eb.y - 34, width: eb.width + 80, height: eb.height + 68 })
    /* רגע ההבזק (כשליש מהמחזור), כדי לראות את הפעימה בצילום */
    if (gems >= 3) {
      /* שיא הפעימה: האנימציות נעצרות ב-30% מהמחזור, הרגע שבו הזוהר וההבהרה מלאים */
      await page.evaluate(() => { for (const a of document.getAnimations()) { if ((a as CSSAnimation).animationName !== 'gem-beat') continue; a.pause(); a.currentTime = 0.3 * Number(a.effect!.getComputedTiming().duration) } })
      await page.waitForTimeout(120)
      await shot(page, `crystals-end-${gems}-row-peak`, { x: eb.x - 40, y: eb.y - 34, width: eb.width + 80, height: eb.height + 68 })
    }
    await ctx.close()
  }

  /* קריסטל תכול מול 5 מלאים, בגודל של ה-HUD */
  {
    const ctx = await ctxOf(browser, 400, 300)
    const page = await ctx.newPage()
    await page.goto('about:blank')
    const cyan = await meanColor(page, firstGem.cyan), warm = await meanColor(page, firstGem.warm), full = await meanColor(page, firstGem.full)
    const dist = (a: number[], b: number[]) => Math.round(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]))
    check(dist(cyan, full) >= 60, `בגודל של ה-HUD: קריסטל תכול (rgb ${cyan}) וקריסטל של 5 מלאים (rgb ${full}) שונים בבירור (מרחק ${dist(cyan, full)})`)
    check(dist(cyan, warm) <= 25, `בגודל של ה-HUD: 3 ומעלה באותו מילוי תכול (מרחק ${dist(cyan, warm)}); ההבדל הוא בזוהר`)
    /* לוח השוואה מוגדל */
    const cell = (label: string, png: Buffer) => `<figure style="margin:0;text-align:center"><div style="background:#B9A2E8;padding:26px;border-radius:12px"><img src="data:image/png;base64,${png.toString('base64')}" style="height:120px;image-rendering:auto;display:block"></div><figcaption style="margin-top:8px">${label}</figcaption></figure>`
    await page.setViewportSize({ width: 760, height: 260 })
    await page.setContent(`<body dir="rtl" style="margin:0;padding:20px;font:15px Arial,sans-serif;background:#fff"><div style="display:flex;gap:22px;justify-content:center" dir="ltr">${cell('פחות מ-3: תכול', firstGem.cyan)}${cell('3 ומעלה: תכול עם זוהר כתום', firstGem.warm)}${cell('5 מלאים: אפרסק עם זוהר', firstGem.full)}</div></body>`)
    await shot(page, 'crystals-hud-compare')
    await ctx.close()
  }

  /* תנועה מופחתת: בלי פעימות, עם זוהר קבוע שמבדיל בין המצבים */
  for (const gems of [3, 5] as const) {
    const ctx = await ctxOf(browser, 1366, 768, STUDENT, true)
    const page = await openGame(ctx, gems === 5 ? 2 : 5)
    await next(page)
    const total = gems === 5 ? 2 : 5
    for (let i = 0; i < total; i++) { await answer(page, gems === 5 || i < 3); await next(page) }
    await page.waitForSelector('[data-end-screen]', { timeout: 25000 }); await page.waitForTimeout(1500)
    const lit = (await gemsOf(page, '[data-end-gems]')).filter((x) => x.fill === 100)
    check(lit.length === gems && lit.every((x) => !x.glowAnim.includes('gem-beat') && !x.flashAnim.includes('gem-beat') && !x.pulseAnim.includes('gem-beat')), `תנועה מופחתת, ${gems} קריסטלים: בלי פעימות`)
    check(lit.every((x) => Number(x.glowAnim.split('|')[2]) > 0.3), `תנועה מופחתת, ${gems} קריסטלים: זוהר קבוע (${lit[0]?.glowAnim.split('|')[2]})`)
    await shot(page, `crystals-end-${gems}-reduced-motion`)
    await ctx.close()
  }
}

const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
if (ONLY.includes('logo')) await logo(browser)
if (ONLY.includes('crystals')) await crystals(browser)
await browser.close()
console.log(failed ? `\n${failed} בדיקות נכשלו` : '\nהכול עבר')
process.exit(failed ? 1 : 0)
