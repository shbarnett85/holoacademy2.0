/* ───────────────────────────────────────────────────────────
   מסכי הפתיחה והסיכום במעבדה הקבועה: פורטל במרכז המסך, חלון הטקסט מימינו, ד"ר הולו משמאלו בחצי גוף.
   מיזוג screen בלי מלבן שחור, צבעי normal map, גיבוי לתמונה, טעינה רק בפתיחה ובסיכום,
   ומעבר לגוונים אנושיים ב-5 גבישים שעובר רק בין שני מצבים (כל פריים הוא שילוב לינארי של הכחול והטבעי).
   הנגן האמיתי עם /api מדומה (בלי כתיבה ל-DB). תמונות הרקע: אמיתיות, משלושה סגנונות אמנות.
   הרצה:  npx tsx e2e/gameFeel/holoVideo.ts --out <dir> [--clip <mp4>] [--browser chrome|webkit] [--section screens,crossfade,fallback,slow,blend]
   יוצא עם קוד 1 אם משהו נכשל.
   ─────────────────────────────────────────────────────────── */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium, webkit, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { DEFAULT_BASE, findChrome } from '../lib/config.ts'

const args = process.argv.slice(2)
const opt = (name: string, def: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def }
const OUT = opt('out', 'reports/stage-j/holo')
const BROWSER = opt('browser', 'chrome')
const SECTIONS = opt('section', 'screens,crossfade,fallback,slow,blend').split(',')
mkdirSync(OUT, { recursive: true })

const failures: string[] = []
const results: Record<string, unknown> = {}
const check = (ok: boolean, msg: string) => { console.log(ok ? '  ✓' : '  ✗', msg); if (!ok) failures.push(`${BROWSER}: ${msg}`) }

const QID = '00000000-0000-4000-8000-0000000000ad'
const STORE = 'https://icgwmjjgnlozuyanqipw.supabase.co/storage/v1/object/public/quest-images/holoacademy'
const STYLES: Record<string, string> = {
  'digital-painting': 'cea7f0c1-5828-4525-b5c4-453bdd2b934e',
  comic: '616f9315-fddc-4d65-bb60-45c943402307',
  anime: 'afd854fd-6854-4b54-8d91-69aea7a27741',
}
const urls = (id: string) => ({ entry: `${STORE}/${id}/scene_scene_lab.png`, good: `${STORE}/${id}/ending_good.png`, bad: `${STORE}/${id}/ending_bad.png` })
const MC = { type: 'multipleChoice', question: 'איזה נהר עובר במצרים?', difficulty: 1, choices: [{ id: 'r', text: 'הנילוס', isCorrect: true }, { id: 'w', text: 'הירדן', isCorrect: false }, { id: 'x', text: 'הפרת', isCorrect: false }], explanationCorrect: 'נכון, זה הנילוס.', explanationIncorrect: 'התשובה הנכונה היא הנילוס.', retryHint: 'הנהר שעובר במצרים.' }

function quest(style: string) {
  const u = urls(STYLES[style])
  return {
    id: QID, title: 'מסע אל הנילוס', art_style: style,
    game_data: {
      entrySceneId: 's1', readingScale: 10,
      scenes: [
        { id: 's1', title: 'המעבדה', narrative: 'ד״ר הולו פותח את הפורטל. הנהר מחכה לכם.', imageUrl: u.entry, imagePrompt: 'x', nextSceneId: 's2' },
        { id: 's2', title: 'האתגר האחרון', narrative: 'הנהר זורם בשקט בין השדות.', imageUrl: u.bad, imagePrompt: 'x', puzzle: MC, nextSceneId: null },
      ],
      endingGood: { title: 'הנילוס חזר לזרום', narrative: 'בזכותכם המים חזרו אל השדות.', drHoloDialog: 'כל הכבוד, פתרתם את התעלומה!', imageUrl: u.good },
      endingBad: { title: 'הסיפור עוד פתוח', narrative: 'מצאתם את המקור, אבל חסרות עוד תובנות כדי להחזיר את המים.', drHoloDialog: 'בואו נחזור ונגלה מה עוד מסתתר שם.', imageUrl: u.bad },
    },
  }
}

interface Opts { width?: number; height?: number; reduced?: boolean; level?: string; style?: string; clip?: 'ok' | 'fail'; dsf?: number }
async function open(browser: Browser, o: Opts = {}): Promise<{ ctx: BrowserContext; page: Page; clipRequests: { n: number } }> {
  const width = o.width ?? 1366
  const height = o.height ?? 768
  const ctx = await browser.newContext({ viewport: { width, height }, screen: { width, height }, deviceScaleFactor: o.dsf ?? 1, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', reducedMotion: o.reduced ? 'reduce' : 'no-preference' })
  await ctx.addInitScript(`(() => { if (!window.__name) window.__name = (f) => f; try { sessionStorage.setItem('holo_splash_seen','1'); sessionStorage.setItem('holo_token','e2e-fake-token') } catch (e) {} })()`)
  const page = await ctx.newPage()
  const clipRequests = { n: 0 }
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.route(`**/api/quests/${QID}`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quest: quest(o.style ?? 'digital-painting') }) }))
  await page.route('**/api/sessions/start', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionId: 's', resumed: false, currentSceneId: null, inventory: [], visitedScenes: [], crystals: 0, effectsLevel: o.level ?? 'medium' }) }))
  await page.route('**/dr-holo/*.mp4', (r) => {
    clipRequests.n++
    return o.clip === 'fail' ? r.abort() : r.fallback()
  })
  await page.goto(`${DEFAULT_BASE}/play/${QID}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForSelector('[data-dr-holo]', { timeout: 30000 })
  return { ctx, page, clipRequests }
}

/* כפתור ההמשך מופיע מיד (אין אפקט הקלדה) */
async function next(page: Page): Promise<void> {
  await page.waitForTimeout(500)
  const btn = page.locator('.holo-panel-actions button').first()
  await btn.waitFor({ timeout: 15000 })
  await btn.click()
}
/* עד מסך הסיום. right = פתרון נכון → 5 גבישים (האתגר היחיד); אחרת שתי תשובות שגויות → הסיפור נשאר פתוח */
async function toEnd(page: Page, right: boolean): Promise<void> {
  await next(page)
  await page.waitForTimeout(1400)
  await next(page)
  await page.waitForSelector('.holo-answers button, .holo-stage button', { timeout: 15000 })
  if (right) {
    await page.locator('.holo-stage button', { hasText: 'הנילוס' }).first().click()
  } else {
    await page.locator('.holo-stage button', { hasText: 'הירדן' }).first().click()
    await page.waitForTimeout(900)
    await page.locator('.holo-stage button', { hasText: 'הפרת' }).first().click()
  }
  await page.waitForTimeout(700)
  for (let i = 0; i < 12; i++) {
    if (await page.locator('[data-end-screen]').count()) break
    const cont = page.locator('button', { hasText: /המשך|סיום/ }).locator('visible=true').first()
    if (await cont.count()) await cont.click({ timeout: 2000 }).catch(() => {})
    await page.waitForTimeout(700)
  }
  await page.waitForSelector('[data-end-screen]', { timeout: 20000 })
}

const videoState = (page: Page) => page.evaluate(async () => {
  const v = document.querySelector<HTMLVideoElement>('[data-dr-holo] video')
  if (!v) return { present: false, advancing: false, media: document.querySelector('[data-dr-holo]')?.getAttribute('data-holo-media') }
  const t0 = v.currentTime
  await new Promise((r) => setTimeout(r, 500))
  return { present: true, advancing: v.currentTime !== t0, muted: v.muted, media: document.querySelector('[data-dr-holo]')?.getAttribute('data-holo-media') }
})

/* אין מלבן שחור: בפינות הדמות (שחור בווידאו) התמונה עם ההולוגרמה זהה לתמונה בלעדיה */
async function blackRect(page: Page): Promise<{ blend: string; maxDrop: number }> {
  const box = await page.locator('[data-dr-holo] .dr-holo__figure').first().boundingBox()
  if (!box) throw new Error('אין דמות')
  const blend = await page.evaluate(() => getComputedStyle(document.querySelector('[data-dr-holo] .dr-holo__figure')!).mixBlendMode)
  /* שני צידי הראש, בחלק העליון של הנכס: שם הקטע שחור. הדמות חורגת מהמסך, ולכן לא הפינות */
  const view = page.viewportSize()!
  const patches = [0.2, 0.8].flatMap((fx) => [0.005, 0.1].map((fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy })))
    .filter((p) => p.x >= 0 && p.y >= 0 && p.x + 20 <= view.width && p.y + 20 <= view.height)
  if (!patches.length) throw new Error('כל נקודות הבדיקה מחוץ למסך')
  const grab = async () => {
    const out: number[] = []
    for (const p of patches) {
      const buf = await page.screenshot({ clip: { x: p.x, y: p.y, width: 20, height: 20 } })
      out.push(await page.evaluate(async (b64) => {
        const i = new Image(); i.src = `data:image/png;base64,${b64}`; await i.decode()
        const c = document.createElement('canvas'); c.width = i.width; c.height = i.height
        const g = c.getContext('2d')!; g.drawImage(i, 0, 0)
        const d = g.getImageData(0, 0, c.width, c.height).data
        let s = 0; for (let k = 0; k < d.length; k += 4) s += (d[k] + d[k + 1] + d[k + 2]) / 3
        return s / (d.length / 4)
      }, buf.toString('base64')))
    }
    return out
  }
  const withHolo = await grab()
  await page.evaluate(() => { document.querySelector<HTMLElement>('[data-dr-holo] .dr-holo__figure')!.style.visibility = 'hidden' })
  const without = await grab()
  await page.evaluate(() => { document.querySelector<HTMLElement>('[data-dr-holo] .dr-holo__figure')!.style.visibility = '' })
  return { blend, maxDrop: Math.max(...without.map((w, i) => w - withHolo[i])) }
}

const figureLook = (page: Page) => page.evaluate(() => {
  const root = document.querySelector('[data-dr-holo]')!
  const human = root.querySelector('.dr-holo__layer--human')
  return {
    human: root.classList.contains('dr-holo--human'),
    humanOpacity: human ? getComputedStyle(human).opacity : null,
    holoLayer: !!root.querySelector('.dr-holo__layer--holo'),
    tintBlend: root.querySelector('.dr-holo__tint') ? getComputedStyle(root.querySelector('.dr-holo__tint')!).mixBlendMode : null,
  }
})

/* הפריסה: פורטל במרכז המסך, חלון הטקסט מימינו, ד"ר הולו משמאלו, והחלונות מעל הכול */
const layout = (page: Page) => page.evaluate(() => {
  const W = innerWidth
  const H = innerHeight
  const holo = document.querySelector('[data-dr-holo]')!.getBoundingClientRect()
  const portal = document.querySelector('.lab-portal')!.getBoundingClientRect()
  /* הטבעת בולטת כ-40 פיקסלים של התמונה מעבר לפנים */
  const scale = portal.width / 902
  const ringRight = portal.right + 40 * scale
  const panelEl = document.querySelector('.holo-side-panel') ?? document.querySelector('[data-end-screen] .holo-panel')!
  const panel = panelEl.getBoundingClientRect()
  const hit = document.elementFromPoint(panel.left + panel.width / 2, panel.top + panel.height / 2)
  /* בנכס: הראש מ-3% עד 19% מגובה הדמות, והגוף 16%–84% מהרוחב */
  const headTop = holo.top + holo.height * 0.03
  const headBottom = holo.top + holo.height * 0.19
  return {
    portalOffset: Math.abs(portal.left + portal.width / 2 - W / 2) / W,
    portalInView: portal.top >= 0 && portal.bottom <= H,
    panelClear: panel.left - ringRight,
    panelInView: panel.right <= W + 1 && panel.top >= 0 && panel.bottom <= H + 1,
    panelOnTop: !!hit && panelEl.contains(hit),
    holoLeftOfPortal: holo.left + holo.width * 0.5 < portal.left,
    holoGapToPortal: portal.left - (holo.left + holo.width * 0.84),
    headTop,
    faceH: headBottom - headTop,
    headInView: headTop >= 0 && headBottom <= H,
    /* חצי גוף: המותן (כ-50% מהנכס) בערך בקצה התחתון */
    waistAt: (holo.top + holo.height * 0.5) / H,
    disc: document.querySelectorAll('.dr-holo__beam, .dr-holo__base').length,
  }
})

function checkLayout(l: Awaited<ReturnType<typeof layout>>, label: string): void {
  check(l.portalOffset < 0.012 && l.portalInView, `${label}: הפורטל במרכז המסך (סטייה ${(l.portalOffset * 100).toFixed(1)}%)`)
  check(l.panelClear >= 0 && l.panelInView && l.panelOnTop, `${label}: חלון הטקסט מימין לטבעת ומעליה בשכבות (רווח ${l.panelClear.toFixed(0)}px)`)
  check(l.holoLeftOfPortal, `${label}: ד"ר הולו משמאל לפורטל (רווח ${l.holoGapToPortal.toFixed(0)}px)`)
  check(l.headInView && l.faceH >= 40, `${label}: הפנים בתוך המסך וקריאים (${l.faceH.toFixed(0)}px)`)
  check(l.waistAt >= 0.8 && l.waistAt <= 1.15 && l.disc === 0, `${label}: חצי גוף, בלי דיסקית (המותן ב-${(l.waistAt * 100).toFixed(0)}% מגובה המסך)`)
}

/* פיקסלים של תמונה בתוך הדף (בלי תלות בספריית תמונות) */
const pixels = (page: Page, png: Buffer) => page.evaluate(async (b64) => {
  const i = new Image(); i.src = `data:image/png;base64,${b64}`; await i.decode()
  const c = document.createElement('canvas'); c.width = i.width; c.height = i.height
  const g = c.getContext('2d')!; g.drawImage(i, 0, 0)
  return { w: c.width, h: c.height, d: Array.from(g.getImageData(0, 0, c.width, c.height).data) }
}, png.toString('base64'))

/* הגוון השולט בפיקסלים הבהירים והרוויים של הדמות */
async function dominantHue(page: Page): Promise<number> {
  const box = (await page.locator('[data-dr-holo] .dr-holo__figure').first().boundingBox())!
  const x = Math.max(0, box.x + box.width * 0.2)
  const y = Math.max(0, box.y)
  const shot = await page.screenshot({ clip: { x, y, width: box.width * 0.6, height: page.viewportSize()!.height - y } })
  const { d } = await pixels(page, shot)
  const hues: number[] = []
  for (let k = 0; k < d.length; k += 4) {
    const [r, g, b] = [d[k], d[k + 1], d[k + 2]]
    const max = Math.max(r, g, b); const min = Math.min(r, g, b)
    if (max < 110 || (max - min) / max < 0.25) continue
    const h = max === r ? ((g - b) / (max - min) + 6) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4
    hues.push(h * 60)
  }
  hues.sort((a, b) => a - b)
  return hues[Math.floor(hues.length / 2)] ?? -1
}

/* הקלטה קצרה: סדרת צילומים שנארזת ל-mp4 (בלי תלות במקליט של Playwright) */
async function record(page: Page, name: string, seconds: number): Promise<void> {
  if (BROWSER !== 'chrome') return
  const dir = path.join(OUT, `_frames-${name}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const t0 = Date.now()
  let n = 0
  while (Date.now() - t0 < seconds * 1000) {
    await page.screenshot({ path: path.join(dir, `f${String(n).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 82 })
    n++
  }
  const fps = (n / ((Date.now() - t0) / 1000)).toFixed(2)
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', fps, '-i', path.join(dir, 'f%04d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-movflags', '+faststart', path.join(OUT, `${name}.mp4`)])
  rmSync(dir, { recursive: true, force: true })
  console.log(`  הקלטה: ${name}.mp4 (${fps} פריימים לשנייה)`)
}

async function screens(browser: Browser): Promise<void> {
  const styles = BROWSER === 'webkit' ? ['digital-painting'] : Object.keys(STYLES)
  const sizes = BROWSER === 'webkit' ? [{ width: 1024, height: 768 }] : [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }, { width: 740, height: 360 }]
  for (const style of styles) for (const size of sizes) {
    const tag = `${BROWSER}-${style}-${size.width}`
    console.log(`\n== ${style} ${size.width}×${size.height} ==`)
    const entryImage = urls(STYLES[style]).entry
    const { ctx, page, clipRequests } = await open(browser, { style, ...size })
    let oldImageRequested = false
    page.on('request', (r) => { if (r.url() === entryImage) oldImageRequested = true })
    await page.waitForTimeout(3000)
    check(!oldImageRequested, 'פתיחה: תמונת הפתיחה הישנה לא נטענת')
    const v = await videoState(page)
    results[`${tag}-opening`] = v
    check(v.present && v.advancing && v.media === 'video', `פתיחה: הווידאו מנגן (${JSON.stringify(v)})`)
    check(clipRequests.n > 0, 'פתיחה: הקטע נטען')
    const l = await layout(page)
    results[`${tag}-opening-layout`] = l
    checkLayout(l, 'פתיחה')
    const rect = await blackRect(page)
    results[`${tag}-opening-rect`] = rect
    check(rect.blend === 'screen' && rect.maxDrop < 4, `פתיחה: אין מלבן שחור סביב הדמות (ירידת בהירות ${rect.maxDrop.toFixed(1)})`)
    await page.screenshot({ path: path.join(OUT, `${tag}-opening.png`) })
    if (size.width === 1366) await record(page, `${style}-opening`, 4)
    await next(page)
    await page.waitForTimeout(2600)
    await page.screenshot({ path: path.join(OUT, `${tag}-scene.png`) })
    check(await page.locator('[data-lab-stage]').count() === 0 && await page.locator('[data-dr-holo]').count() === 0, 'סצנה רגילה: בלי מעבדה ובלי ד"ר הולו')
    await page.close()
    await ctx.close()

    for (const right of [true, false]) {
      const a = await open(browser, { style, ...size })
      await toEnd(a.page, right)
      const stateName = await a.page.locator('[data-end-screen]').getAttribute('data-end-screen')
      check(stateName === (right ? 'radiant' : 'open'), `סיכום: מצב ${stateName}`)
      const portalState = await a.page.locator('[data-lab-stage]').getAttribute('data-portal')
      check(portalState === (right ? 'closed' : 'open'), `סיכום: הפורטל במצב ${portalState}`)
      await a.page.waitForTimeout(3600)
      const look = await figureLook(a.page)
      if (right) {
        check(look.human && look.humanOpacity === '1' && !look.holoLayer, '5 גבישים: בסוף המעבר רק השכבה הטבעית')
        await a.page.screenshot({ path: path.join(OUT, `${tag}-summary-5gems.png`) })
      } else {
        check(!look.human && look.holoLayer && look.tintBlend === 'color', 'סיכום רגיל: נשארת בגוון ההולוגרמה')
        const hue = await dominantHue(a.page)
        results[`${tag}-hue`] = hue
        check(hue >= 180 && hue <= 300, `סיכום רגיל: הגוון השולט בתחום צבעי המותג (${hue.toFixed(0)}°, בין ציאן למג'נטה)`)
        await a.page.screenshot({ path: path.join(OUT, `${tag}-summary-open.png`) })
      }
      const s2 = await videoState(a.page)
      check(s2.present && s2.advancing, 'סיכום: הווידאו מנגן')
      const l2 = await layout(a.page)
      results[`${tag}-summary-layout-${right}`] = l2
      checkLayout(l2, 'סיכום')
      const r = await blackRect(a.page)
      check(r.blend === 'screen' && r.maxDrop < 4, `סיכום: אין מלבן שחור (ירידת בהירות ${r.maxDrop.toFixed(1)})`)
      const fit = await a.page.evaluate(() => { const e = document.querySelector('[data-end-screen] .holo-panel')!; return { sh: e.scrollHeight, ch: e.clientHeight } })
      results[`${tag}-summary-fit-${right}`] = fit
      if (fit.sh > fit.ch + 1) console.log(`  ! סיכום: חלון הטקסט נגלל (${fit.sh}/${fit.ch})`)
      await a.page.close()
      await a.ctx.close()
    }
    if (style === 'digital-painting' && size.width === 1366 && BROWSER === 'chrome') {
      for (const [right, name] of [[true, 'summary-5gems'], [false, 'summary-open']] as const) {
        const b = await open(browser, { style })
        await toEnd(b.page, right)
        await record(b.page, `${style}-${name}`, 5)
        await b.page.close()
        await b.ctx.close()
      }
    }
  }
}

/* המעבר לגוונים אנושיים: עוצרים אותו בחמש נקודות. בכל פריים כל פיקסל הוא (1−t)·כחול + t·טבעי, ולכן אין צבעי ביניים */
async function crossfade(browser: Browser): Promise<void> {
  console.log('\n== מעבר הגוונים ==')
  const { ctx, page } = await open(browser, { level: 'gentle', clip: 'fail' })
  await page.addStyleTag({ content: 'canvas{display:none!important}' })
  await toEnd(page, true)
  const box = (await page.locator('[data-dr-holo]').first().boundingBox())!
  const vp = page.viewportSize()!
  /* גוף הדמות בלבד (עד 80% מרוחב הנכס): הפורטל לידה ממשיך לזוז */
  const left = Math.max(0, box.x + box.width * 0.1)
  const clip = { x: left, y: Math.max(0, box.y), width: box.x + box.width * 0.8 - left, height: vp.height - Math.max(0, box.y) }
  const grabbed = await page.evaluate(() => {
    const el = document.querySelector('.dr-holo__layer--human')
    const a = el?.getAnimations().find((x) => (x as CSSTransition).transitionProperty === 'opacity')
    if (!a) return false
    const all = document.querySelector('[data-dr-holo]')!.getAnimations({ subtree: true })
    /* הריחוף של מצב הגיבוי לא שייך למעבר: מבטלים אותו, כדי שרק המעבר ישפיע על הפיקסלים */
    all.filter((x) => (x as CSSAnimation).animationName).forEach((x) => x.cancel())
    const fades = all.filter((x) => (x as CSSTransition).transitionProperty)
    fades.forEach((x) => x.pause())
    ;(window as any).__seek = (t: number) => fades.forEach((x) => { x.currentTime = t })
    return true
  })
  check(grabbed, 'המעבר נתפס בזמן ריצה')
  if (grabbed) {
    const frames: Awaited<ReturnType<typeof pixels>>[] = []
    const stops = [0, 500, 1000, 1500, 1999]
    for (const t of stops) {
      await page.evaluate((x) => (window as any).__seek(x), t)
      await page.waitForTimeout(120)
      const shot = await page.screenshot({ clip, path: path.join(OUT, `_x${t}.png`) })
      frames.push(await pixels(page, shot))
    }
    const A = frames[0].d
    const B = frames[frames.length - 1].d
    const figureOnly = (k: number) => Math.max(A[k], A[k + 1], A[k + 2], B[k], B[k + 1], B[k + 2]) > 60
    const errors: number[] = []
    stops.slice(1, -1).forEach((t, n) => {
      const f = frames[n + 1].d
      const m = t / 1999
      let sum = 0; let cnt = 0
      for (let k = 0; k < A.length; k += 16) {
        if (!figureOnly(k)) continue
        for (let c = 0; c < 3; c++) { const e = f[k + c] - (A[k + c] * (1 - m) + B[k + c] * m); sum += e * e; cnt++ }
      }
      errors.push(Math.sqrt(sum / Math.max(1, cnt)))
    })
    results.crossfadeRms = errors
    check(errors.every((e) => e < 9), `כל פריים ביניים הוא שילוב של שני המצבים בלבד (סטייה ${errors.map((e) => e.toFixed(1)).join(', ')} מתוך 255)`)
    execFileSync('ffmpeg', ['-y', '-v', 'error', ...stops.flatMap((t) => ['-i', path.join(OUT, `_x${t}.png`)]), '-filter_complex', `hstack=inputs=${stops.length}`, path.join(OUT, 'transition-strip.png')])
    stops.forEach((t) => rmSync(path.join(OUT, `_x${t}.png`), { force: true }))
  }
  await page.close(); await ctx.close()
}

async function fallback(browser: Browser): Promise<void> {
  console.log('\n== גיבוי ==')
  /* טעינה: האתגר האחרון מתחיל → הקטעים של הסיכום מתחילים להיטען, ולפני כן לא */
  {
    const { ctx, page } = await open(browser)
    await page.waitForTimeout(800)
    check(await page.locator('video[data-holo-preload]').count() === 0, 'לפני האתגר האחרון: הקטעים של הסיכום לא נטענים')
    await next(page)
    await page.waitForTimeout(1300)
    await next(page)
    await page.waitForSelector('.holo-stage button', { timeout: 15000 })
    await page.waitForTimeout(300)
    check(await page.locator('video[data-holo-preload]').count() === 2, 'האתגר האחרון התחיל: הקטעים של הסיכום נטענים')
    await page.close(); await ctx.close()
  }
  /* וידאו שלא נטען */
  {
    const { ctx, page } = await open(browser, { clip: 'fail' })
    await page.waitForTimeout(1800)
    const s = await page.evaluate(() => ({ media: document.querySelector('[data-dr-holo]')!.getAttribute('data-holo-media'), video: document.querySelectorAll('[data-dr-holo] video').length, img: (document.querySelector('[data-dr-holo] img') as HTMLImageElement)?.naturalWidth, float: document.querySelector('[data-dr-holo]')!.classList.contains('dr-holo--float') }))
    results.clipFailed = s
    check(s.media === 'image' && s.video === 0 && s.img > 0 && s.float, `וידאו שלא נטען: תמונה עם ריחוף (${JSON.stringify(s)})`)
    await page.close(); await ctx.close()
  }
  /* עוצמה עדינה */
  {
    const { ctx, page, clipRequests } = await open(browser, { level: 'gentle' })
    await page.waitForTimeout(1500)
    const s = await page.evaluate(() => ({ video: document.querySelectorAll('[data-dr-holo] video').length, float: document.querySelector('[data-dr-holo]')!.classList.contains('dr-holo--float') }))
    check(s.video === 0 && s.float && clipRequests.n === 0, `עוצמה עדינה: תמונה עם ריחוף, הקטע לא נטען (${JSON.stringify(s)}, בקשות ${clipRequests.n})`)
    await page.close(); await ctx.close()
  }
  /* תנועה מופחתת */
  {
    const { ctx, page, clipRequests } = await open(browser, { reduced: true })
    await page.waitForTimeout(1200)
    const s = await page.evaluate(() => ({ video: document.querySelectorAll('[data-dr-holo] video').length, running: document.getAnimations().filter((a) => a.playState === 'running' && String((a as CSSAnimation).animationName ?? '').startsWith('dr-holo')).length }))
    check(s.video === 0 && s.running === 0 && clipRequests.n === 0, `תנועה מופחתת: תמונה בלי תנועה (${JSON.stringify(s)}, בקשות ${clipRequests.n})`)
    await toEnd(page, true)
    await page.waitForTimeout(300)
    const look = await figureLook(page)
    results.reducedHuman = look
    check(look.human && look.humanOpacity === '1' && !look.holoLayer, 'תנועה מופחתת: 5 גבישים מופיעה ישר בגוונים האנושיים')
    await page.screenshot({ path: path.join(OUT, `${BROWSER}-reduced-summary-5gems.png`) })
    await page.close(); await ctx.close()
  }
}

/* מחשב חלש. מודדים האטה פי 4 כמו שהיא, ובנוסף מחשב שבאמת לא עומד בקצב: האטה פי 4 + עבודה בכל פריים.
   המדידה בתחילת השיעור צריכה להוריד לעוצמה עדינה, והווידאו מתחלף בתמונה */
async function slow(browser: Browser): Promise<void> {
  console.log('\n== מחשב חלש ==')
  if (BROWSER !== 'chrome') { console.log('  דילוג: האטת מעבד זמינה רק ב-Chrome'); return }
  for (const heavy of [false, true]) {
    const { ctx, page } = await open(browser)
    const cdp = await ctx.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    if (heavy) await ctx.addInitScript(`(() => { const f = () => { const t = performance.now(); while (performance.now() - t < 30) {} requestAnimationFrame(f) }; requestAnimationFrame(f) })()`)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-dr-holo]', { timeout: 60000 })
    const fps = await page.evaluate(() => new Promise<number>((res) => { let n = 0; const t0 = performance.now(); const f = (t: number) => { n++; if (t - t0 < 2000) requestAnimationFrame(f); else res(n / ((t - t0) / 1000)) }; requestAnimationFrame(f) }))
    await page.waitForTimeout(3500)
    const s = await page.evaluate(() => {
      const v = document.querySelector<HTMLVideoElement>('[data-dr-holo] video')
      const q = v?.getVideoPlaybackQuality?.()
      return { level: (window as any).__holoFx?.level?.(), media: document.querySelector('[data-dr-holo]')!.getAttribute('data-holo-media'), video: !!v, float: document.querySelector('[data-dr-holo]')!.classList.contains('dr-holo--float'), dropped: q?.droppedVideoFrames, total: q?.totalVideoFrames }
    })
    results[heavy ? 'slowHeavy' : 'slow4x'] = { fps, ...s }
    console.log(`  ${heavy ? 'פי 4 + עומס' : 'פי 4 בלבד'}: ${fps.toFixed(1)} FPS, ${JSON.stringify(s)}`)
    if (heavy) {
      check(fps < 40 && s.level === 'gentle' && !s.video && s.float, 'מחשב שלא עומד בקצב: הגיבוי לתמונה נכנס לפעולה')
      await page.screenshot({ path: path.join(OUT, `${BROWSER}-slow-fallback.png`) })
    } else {
      /* מחשב שעומד בקצב גם בהאטה: הווידאו נשאר, כי הגיבוי נקבע לפי FPS בפועל */
      check(fps >= 40 ? s.video : !s.video, `פי 4 בלבד: ההחלטה תואמת ל-FPS בפועל (${fps.toFixed(1)})`)
    }
    await page.close(); await ctx.close()
  }
}

/* מיזוג בלי תלות בקודק: ה-WebKit של Playwright ב-Windows לא מנגן H.264, ולכן בודקים את מבנה ה-CSS עם תמונה אטומה על שחור.
   זה מוכיח שהשחור נעלם במנוע של Safari. את ניגון הווידאו עצמו זה לא מוכיח: לזה צריך iPad אמיתי */
async function blend(browser: Browser): Promise<void> {
  console.log('\n== מיזוג עם שחור אטום ==')
  const opaque = readFileSync('reports/stage-j/clips/neutral-full-black.jpg')
  const { ctx, page } = await open(browser, { width: 1024, height: 768 })
  await page.route('**/dr-holo/*.webp', (r) => r.fulfill({ status: 200, contentType: 'image/jpeg', body: opaque }))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-dr-holo]', { timeout: 30000 })
  await page.waitForTimeout(2500)
  const canPlay = await page.evaluate(() => document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E"'))
  results.canPlayH264 = canPlay
  console.log(`  H.264 בדפדפן הזה: "${canPlay}"`)
  const opaqueLoaded = await page.evaluate(() => { const i = document.querySelector<HTMLImageElement>('[data-dr-holo] img'); return i?.naturalWidth })
  check(opaqueLoaded === 720, 'התמונה האטומה נטענה')
  const r = await blackRect(page)
  results.blendOpening = r
  check(r.blend === 'screen' && r.maxDrop < 4, `פתיחה: אין מלבן שחור (${r.blend}, ירידת בהירות ${r.maxDrop.toFixed(1)})`)
  await page.screenshot({ path: path.join(OUT, `${BROWSER}-blend-opening.png`) })
  await toEnd(page, true)
  await page.waitForTimeout(3500)
  const e = await blackRect(page)
  results.blendSummary = e
  check(e.blend === 'screen' && e.maxDrop < 4, `סיכום: אין מלבן שחור (${e.blend}, ירידת בהירות ${e.maxDrop.toFixed(1)})`)
  await page.screenshot({ path: path.join(OUT, `${BROWSER}-blend-summary-5gems.png`) })
  await page.close(); await ctx.close()
}

const browser = BROWSER === 'webkit'
  ? await webkit.launch({ headless: true })
  : await chromium.launch({ executablePath: findChrome(), headless: true, args: ['--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required'] })
console.log(`דפדפן: ${BROWSER} ${browser.version()}`)
if (SECTIONS.includes('screens')) await screens(browser)
if (SECTIONS.includes('crossfade')) await crossfade(browser)
if (SECTIONS.includes('fallback')) await fallback(browser)
if (SECTIONS.includes('slow')) await slow(browser)
if (SECTIONS.includes('blend')) await blend(browser)
await browser.close()
writeFileSync(path.join(OUT, `results-${BROWSER}.json`), JSON.stringify({ results, failures }, null, 2))
if (failures.length) { console.log(`\n✗ ${failures.length} כשלים`); for (const f of failures) console.log('  -', f); process.exit(1) }
console.log('\n✓ הכול עבר')
