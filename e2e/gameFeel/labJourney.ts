/* ─────────────────────────────────────────────────
   המסע במעבדה: פתיחה עם צלילה לפורטל, סיכום שנסגר, סיכום פתוח ו-5 גבישים, בשיעור חדש (בלי תמונות פתיחה וסיום, עם holoMoods) ובשיעור ישן.
   עוצמה עדינה (דהייה בלי צלילה), תנועה מופחתת (בלי מצלמה), מחשב איטי (FPS בצלילה), ולידציית מצב רוח.
   הנגן האמיתי עם /api מדומה (בלי כתיבה ל-DB). תמונות: אמיתיות מהאחסון.
   הרצה:  npx tsx e2e/gameFeel/labJourney.ts --out <dir> [--no-record]
   יוצא עם קוד 1 אם משהו נכשל.
   ───────────────────────────────────────────────── */
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { DEFAULT_BASE, findChrome } from '../lib/config.ts'

const args = process.argv.slice(2)
const opt = (name: string, def: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def }
const OUT = opt('out', 'reports/stage-j/journey')
const RECORD = !args.includes('--no-record')
mkdirSync(OUT, { recursive: true })

const failures: string[] = []
const results: Record<string, unknown> = {}
const check = (ok: boolean, msg: string) => { console.log(ok ? '  ✓' : '  ✗', msg); if (!ok) failures.push(msg) }

const QID = '00000000-0000-4000-8000-0000000000ae'
const STORE = 'https://icgwmjjgnlozuyanqipw.supabase.co/storage/v1/object/public/quest-images/holoacademy/cea7f0c1-5828-4525-b5c4-453bdd2b934e'
const IMG = { first: `${STORE}/ending_bad.png`, last: `${STORE}/ending_good.png`, oldEntry: `${STORE}/scene_scene_lab.png` }
const MC = (id: string) => ({ type: 'multipleChoice', question: `שאלה ${id}: איזה נהר עובר במצרים?`, difficulty: 1, choices: [{ id: 'r', text: 'הנילוס', isCorrect: true }, { id: 'w', text: 'הירדן', isCorrect: false }, { id: 'x', text: 'הפרת', isCorrect: false }], explanationCorrect: 'נכון', explanationIncorrect: 'לא' })

function lesson(kind: 'new' | 'old', holoMoods?: unknown) {
  const old = kind === 'old'
  return {
    id: QID, title: 'מסע אל הנילוס', art_style: 'digital-painting',
    game_data: {
      entrySceneId: 'lab', readingScale: 10, ...(holoMoods ? { holoMoods } : {}),
      scenes: [
        { id: 'lab', title: 'המעבדה', narrative: 'ד״ר הולו פותח את הפורטל. הנהר מחכה לכם.', nextSceneId: 's1', ...(old ? { imageUrl: IMG.oldEntry, imagePrompt: 'x {DR_HOLO}' } : {}) },
        { id: 's1', title: 'שפת הנהר', narrative: 'הנהר זורם בשקט בין השדות.', imageUrl: IMG.first, imagePrompt: 'x', puzzle: MC('א'), nextSceneId: 's2' },
        { id: 's2', title: 'האתגר האחרון', narrative: 'המים עולים.', imageUrl: IMG.last, imagePrompt: 'x', puzzle: MC('ב'), nextSceneId: null },
      ],
      endingGood: { title: 'הנילוס חזר לזרום', narrative: 'בזכותכם המים חזרו אל השדות.', ...(old ? { imageUrl: `${STORE}/ending_good.png?old` } : {}) },
      endingBad: { title: 'הסיפור עוד פתוח', narrative: 'מצאתם את המקור, אבל חסרות עוד תובנות כדי להחזיר את המים.', ...(old ? { imageUrl: `${STORE}/ending_bad.png?old` } : {}) },
    },
  }
}

interface Opts { width?: number; height?: number; reduced?: boolean; level?: string; kind?: 'new' | 'old'; holoMoods?: unknown; who?: 'student' | 'teacher' | 'visitor' }
async function open(browser: Browser, o: Opts = {}): Promise<{ ctx: BrowserContext; page: Page; requested: string[] }> {
  const width = o.width ?? 1366
  const height = o.height ?? 768
  const ctx = await browser.newContext({ viewport: { width, height }, screen: { width, height }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', reducedMotion: o.reduced ? 'reduce' : 'no-preference' })
  await ctx.addInitScript(`(() => { if (!window.__name) window.__name = (f) => f; try { sessionStorage.setItem('holo_splash_seen','1'); ${(o.who ?? 'student') === 'student' ? `sessionStorage.setItem('holo_token','e2e-fake-token');` : ''} ${o.who === 'teacher' ? `localStorage.setItem('holo_staff_session', JSON.stringify({ access_token: 'x', staff: { id: 't', role: 'teacher', name: 'מורה' } }));` : ''} } catch (e) {} })()`)
  const page = await ctx.newPage()
  const requested: string[] = []
  page.on('request', (r) => requested.push(r.url()))
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.route(`**/api/quests/${QID}`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quest: lesson(o.kind ?? 'new', o.holoMoods) }) }))
  await page.route('**/api/sessions/start', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionId: 's', resumed: false, currentSceneId: null, inventory: [], visitedScenes: [], crystals: 0, effectsLevel: o.level ?? 'medium' }) }))
  await page.goto(`${DEFAULT_BASE}/play/${QID}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForSelector('[data-dr-holo]', { timeout: 30000 })
  return { ctx, page, requested }
}

async function next(page: Page): Promise<void> {
  await page.waitForTimeout(500)
  const btn = page.locator('.holo-panel-actions button').locator('visible=true').first()
  await btn.waitFor({ timeout: 20000 })
  await btn.click()
}
const clipOf = (page: Page) => page.evaluate(() => document.querySelector<HTMLVideoElement>('[data-dr-holo] video')?.getAttribute('src') ?? null)
const cameraScale = (page: Page) => page.evaluate(() => {
  const el = document.querySelector('.lab-camera')
  if (!el) return null
  return new DOMMatrix(getComputedStyle(el).transform).a
})

/* answers: אתגר אחר אתגר. right = נכון בניסיון ראשון, retry = נכון בשני, wrong = שתי טעויות */
async function play(page: Page, answers: ('right' | 'retry' | 'wrong')[]): Promise<void> {
  await next(page)
  await page.waitForTimeout(1800)
  for (const a of answers) {
    await next(page)
    await page.waitForSelector('.holo-stage button', { timeout: 15000 })
    await page.waitForTimeout(500)
    const stage = page.locator('.holo-stage button')
    if (a === 'right') await stage.filter({ hasText: 'הנילוס' }).first().click()
    else {
      await stage.filter({ hasText: 'הירדן' }).first().click()
      await page.waitForTimeout(900)
      await stage.filter({ hasText: a === 'retry' ? 'הנילוס' : 'הפרת' }).first().click()
    }
    await page.waitForTimeout(800)
    await page.locator('button', { hasText: /המשך|סיום/ }).locator('visible=true').first().click({ timeout: 8000 })
    await page.waitForTimeout(1200)
  }
  for (let i = 0; i < 12; i++) {
    if (await page.locator('[data-end-screen]').count()) return
    const cont = page.locator('button', { hasText: /המשך|סיום/ }).locator('visible=true').first()
    if (await cont.count()) await cont.click({ timeout: 2000 }).catch(() => {})
    await page.waitForTimeout(500)
  }
  await page.waitForSelector('[data-end-screen]', { timeout: 20000 })
}

async function record(page: Page, name: string, seconds: number, during?: () => Promise<void>): Promise<void> {
  if (!RECORD) { await during?.(); return }
  const dir = path.join(OUT, `_frames-${name}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const t0 = Date.now()
  let n = 0
  let fired = false
  while (Date.now() - t0 < seconds * 1000) {
    await page.screenshot({ path: path.join(dir, `f${String(n).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 80 })
    n++
    if (!fired && during && Date.now() - t0 > 700) { fired = true; void during() }
  }
  const fps = (n / ((Date.now() - t0) / 1000)).toFixed(2)
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', fps, '-i', path.join(dir, 'f%04d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-movflags', '+faststart', path.join(OUT, `${name}.mp4`)])
  rmSync(dir, { recursive: true, force: true })
  console.log(`  הקלטה: ${name}.mp4 (${fps} פריימים לשנייה)`)
}

/* התלמיד לא נתקע: גם כשהעוצמה יורדת באמצע הצלילה (מדידת FPS) וגם כשהאנימציה מתבטלת */
async function noStall(browser: Browser): Promise<void> {
  console.log('\n== הצלילה לא תוקעת ==')
  const CASES: [string, (page: Page) => Promise<unknown>][] = [
    ['ירידת עוצמה באמצע', (page) => page.evaluate(() => (window as unknown as { __holoFx: { setLevel(l: string): void } }).__holoFx.setLevel('gentle'))],
    ['ביטול האנימציה', (page) => page.evaluate(() => { for (const a of document.querySelector('.lab-camera')!.getAnimations()) a.cancel() })],
  ]
  for (const [name, act] of CASES) {
    const { ctx, page } = await open(browser, {})
    await page.waitForTimeout(1500)
    await page.locator('.holo-panel-actions button').locator('visible=true').first().click()
    await page.waitForFunction(() => document.querySelector('[data-lab-stage]')?.getAttribute('data-leaving') === 'dive', undefined, { timeout: 3000 })
    await act(page)
    const freed = await page.waitForFunction(() => !document.querySelector('[data-lab-stage]'), undefined, { timeout: 5000 }).then(() => true, () => false)
    check(freed && await page.locator('.holo-side-panel').first().isVisible(), `${name}: המעבדה נעלמת וחלון הטקסט חוזר`)
    await page.close(); await ctx.close()
  }
}

/* לחיצה על הפורטל: במרכז הפתח, כמו משתמש אמיתי (בלי לעקוף שכבות שמכסות אותו) */
async function clickPortal(page: Page): Promise<void> {
  const box = await page.locator('[data-lab-portal-hit]').boundingBox()
  if (!box) throw new Error('אין אזור לחיצה בפורטל')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

async function portalClicks(browser: Browser): Promise<void> {
  console.log('\n== לחיצה על הפורטל ==')
  /* פתיחה: כמו "המשך" */
  let o = await open(browser, {})
  await page_ready(o.page)
  await clickPortal(o.page)
  await o.page.waitForFunction(() => document.querySelector('[data-lab-stage]')?.getAttribute('data-leaving') === 'dive', undefined, { timeout: 3000 })
  check(true, 'פתיחה: לחיצה על הפורטל מתחילה את הצלילה')
  await o.page.close(); await o.ctx.close()

  /* מחוץ לפתח הלחיצה לא עושה כלום */
  o = await open(browser, {})
  await page_ready(o.page)
  const box = (await o.page.locator('[data-lab-portal-hit]').boundingBox())!
  await o.page.mouse.click(box.x + 4, box.y + 4)
  await o.page.waitForTimeout(400)
  check(await o.page.locator('[data-lab-stage]').getAttribute('data-leaving') === null, 'פתיחה: לחיצה בפינה, מחוץ לעיגול, לא עושה כלום')
  await o.page.close(); await o.ctx.close()

  /* סיפור פתוח: ניסיון נוסף */
  o = await open(browser, {})
  await play(o.page, ['wrong', 'wrong'])
  check(await o.page.locator('[data-lab-portal-hit]').count() === 0, 'סיכום: בזמן הנסיגה הפורטל עוד לא לחיץ')
  await o.page.waitForSelector('[data-lab-portal-hit]', { timeout: 4000 })
  await clickPortal(o.page)
  await o.page.waitForSelector('[data-end-screen]', { state: 'detached', timeout: 6000 })
  await o.page.waitForSelector('[data-lab-stage]', { timeout: 6000 })
  check(await o.page.locator('[data-lab-stage]').getAttribute('data-portal') === 'opening', 'סיפור פתוח: הלחיצה מתחילה משחק נוסף מהפתיחה')
  await o.page.close(); await o.ctx.close()

  /* סיפור שנסגר: המסך הראשי של מי שמשחק */
  for (const [who, path_] of [['student', '/student'], ['teacher', '/creator'], ['visitor', '/']] as const) {
    o = await open(browser, { who })
    await play(o.page, ['right', 'right'])
    await o.page.waitForSelector('[data-lab-portal-hit]', { timeout: 4000 })
    await clickPortal(o.page)
    const ok = await o.page.waitForFunction(() => !location.pathname.startsWith('/play/'), undefined, { timeout: 6000 }).then(() => true, () => false)
    const at = new URL(o.page.url()).pathname
    check(ok && at === path_, `סיפור שנסגר, ${who}: הגיע ל-${at}`)
    await o.page.close(); await o.ctx.close()
  }
}
const page_ready = async (page: Page) => { await page.waitForTimeout(500); await page.locator('.holo-panel-actions button').locator('visible=true').first().waitFor({ timeout: 20000 }); await page.waitForTimeout(300) }

async function dive(browser: Browser, kind: 'new' | 'old'): Promise<void> {
  console.log(`\n== צלילה, שיעור ${kind === 'new' ? 'חדש' : 'ישן'} ==`)
  const { ctx, page, requested } = await open(browser, { kind, holoMoods: kind === 'new' ? { opening: 'scared', closed: 'celebrating', open: 'thinking' } : undefined })
  await page.waitForSelector('[data-dr-holo] video', { timeout: 20000 })
  await page.waitForTimeout(2500)
  check((await clipOf(page)) === (kind === 'new' ? '/dr-holo/scared.mp4' : '/dr-holo/neutral.mp4'), `פתיחה: הקטע ${await clipOf(page)}`)
  const s1 = (await cameraScale(page))!
  await page.waitForTimeout(1500)
  const s2 = (await cameraScale(page))!
  check(s2 > s1 && s2 < 1.04, `פתיחה: המצלמה מתקרבת לאט (${s1.toFixed(4)} → ${s2.toFixed(4)})`)
  check(!requested.some((u) => u.includes('scene_scene_lab') || u.includes('?old')), 'תמונות הפתיחה והסיום הישנות לא נטענות')
  await page.screenshot({ path: path.join(OUT, `${kind}-opening.png`) })
  const go = async () => {
    await page.locator('.holo-panel-actions button').locator('visible=true').first().click()
  }
  /* דגימת הצלילה בלי צילום, ואז הקלטה נפרדת */
  await go()
  await page.waitForFunction(() => document.querySelector('[data-lab-stage]')?.getAttribute('data-leaving') === 'dive', undefined, { timeout: 3000 })
  check(await page.locator('.holo-side-panel').first().evaluate((e) => getComputedStyle(e).visibility) === 'hidden', 'צלילה: חלון הטקסט מוסתר')
  const samples: number[] = []
  for (let i = 0; i < 8; i++) { const s = await cameraScale(page); if (s) samples.push(s); await page.waitForTimeout(120) }
  check(samples.every((v, i) => i === 0 || v >= samples[i - 1] - 0.001) && samples[samples.length - 1] > 1.5, `צלילה: המצלמה נכנסת לפורטל (${samples.map((v) => v.toFixed(2)).join(' ')})`)
  await page.waitForFunction(() => document.querySelector('[data-lab-stage]')?.getAttribute('data-leaving') === 'reveal', undefined, { timeout: 4000 })
  const finalScale = (await cameraScale(page))!
  await page.waitForFunction(() => !document.querySelector('[data-lab-stage]'), undefined, { timeout: 4000 })
  check(finalScale > 2.5, `סוף הצלילה: הפורטל ממלא את המסך (קנה מידה ${finalScale.toFixed(2)})`)
  await page.waitForTimeout(600)
  check(await page.locator('.holo-scene-band--lab').count() === 0 && await page.locator('[data-dr-holo]').count() === 0, 'הסצנה הראשונה: פריסה רגילה, בלי מעבדה ובלי ד"ר הולו')
  check(await page.locator('.holo-image-fill img, .holo-image-page img').evaluateAll((els, want) => els.some((e) => (e as HTMLImageElement).src === want), IMG.first), 'הסצנה הראשונה: התמונה שהייתה בפורטל')
  check(await page.locator('.holo-side-panel').first().isVisible(), 'הסצנה הראשונה: חלון הטקסט חזר')
  await page.screenshot({ path: path.join(OUT, `${kind}-first-scene.png`) })
  await page.close(); await ctx.close()

  if (RECORD) {
    const a = await open(browser, { kind, holoMoods: kind === 'new' ? { opening: 'scared', closed: 'celebrating', open: 'thinking' } : undefined })
    await a.page.waitForSelector('[data-dr-holo] video', { timeout: 20000 })
    await a.page.waitForTimeout(2200)
    await record(a.page, `${kind}-opening-dive`, 4.5, async () => { await a.page.locator('.holo-panel-actions button').locator('visible=true').first().click() })
    await a.page.close(); await a.ctx.close()
  }
}

async function summaries(browser: Browser, kind: 'new' | 'old'): Promise<void> {
  console.log(`\n== סיכום, שיעור ${kind === 'new' ? 'חדש' : 'ישן'} ==`)
  const moods = kind === 'new' ? { opening: 'scared', closed: 'celebrating', open: 'thinking' } : undefined
  const CASES = [
    { name: 'closed', answers: ['right', 'retry'] as ('right' | 'retry' | 'wrong')[], state: 'closed', portal: 'closed', clip: kind === 'new' ? 'celebrating' : 'happy' },
    { name: 'open', answers: ['wrong', 'wrong'] as ('right' | 'retry' | 'wrong')[], state: 'open', portal: 'open', clip: 'sad' },
    { name: '5gems', answers: ['right', 'right'] as ('right' | 'retry' | 'wrong')[], state: 'radiant', portal: 'closed', clip: kind === 'new' ? 'celebrating' : 'happy' },
  ]
  for (const c of CASES) {
    const { ctx, page, requested } = await open(browser, { kind, holoMoods: moods })
    await play(page, c.answers)
    const state = await page.locator('[data-end-screen]').getAttribute('data-end-screen')
    check(state === c.state, `${c.name}: מצב ${state}`)
    check(await page.locator('[data-lab-stage]').getAttribute('data-portal') === c.portal, `${c.name}: מצב הפורטל ${c.portal}`)
    const early = await cameraScale(page)
    check(!!early && early > 1.1, `${c.name}: מתחילים בתוך הפורטל (${early?.toFixed(2)})`)
    if (RECORD) await record(page, `${kind}-summary-${c.name}`, 5)
    else await page.waitForTimeout(5000)
    const later = (await cameraScale(page))!
    check(later >= 0.999 && later < 1.03, `${c.name}: נסיגה, ואז קירוב איטי (${later.toFixed(4)})`)
    check((await clipOf(page)) === `/dr-holo/${c.clip}.mp4`, `${c.name}: הקטע ${await clipOf(page)}`)
    const hit = await page.evaluate(() => {
      const panel = document.querySelector('[data-end-screen] .holo-panel')!
      const r = panel.getBoundingClientRect()
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return !!el && panel.contains(el)
    })
    check(hit, `${c.name}: חלון הטקסט מעל הכול`)
    const portal = await page.locator('.lab-portal img').first().getAttribute('src')
    check(portal === (c.state === 'open' ? IMG.first : '/lab/classroom.webp'), `${c.name}: בפורטל ${portal}`)
    /* החלקיקים ממשיכים כל עוד המסך פתוח: אחרי שגל הפתיחה כבר נגמר (חיי קונפטי: עד 4.6 שניות) */
    await page.waitForTimeout(c.state === 'open' ? 0 : 4000)
    const lit = await page.evaluate(() => [...document.querySelectorAll('canvas')].reduce((sum, cv) => {
      if (getComputedStyle(cv).position !== 'fixed') return sum
      const d = cv.getContext('2d')?.getImageData(0, 0, cv.width, cv.height).data
      let n = 0
      if (d) for (let i = 3; i < d.length; i += 4) if (d[i]) n++
      return sum + n
    }, 0))
    check(c.state === 'open' ? lit === 0 : lit > 200, `${c.name}: חלקיקים ${c.state === 'open' ? 'אין' : 'ממשיכים'} (${lit} פיקסלים)`)
    const count = await page.locator('[data-end-count]').innerText().catch(() => '')
    check(!count.includes('שלם') && (count === '' || count.includes('הבנה') ), `${c.name}: הטקסט "${count}"`)
    check(!requested.some((u) => u.includes('?old')), `${c.name}: תמונת הסיום הישנה לא נטענת`)
    await page.screenshot({ path: path.join(OUT, `${kind}-summary-${c.name}.png`) })
    await page.close(); await ctx.close()
  }
}

async function modes(browser: Browser): Promise<void> {
  console.log('\n== עוצמה עדינה ==')
  {
    const { ctx, page } = await open(browser, { level: 'gentle' })
    await page.waitForTimeout(2500)
    check((await cameraScale(page)) === 1, 'עדינה: המצלמה לא זזה')
    await next(page)
    const seen = await page.waitForFunction(() => document.querySelector('[data-lab-stage]')?.getAttribute('data-leaving') ?? 'gone', undefined, { timeout: 3000 }).then((h) => h.jsonValue())
    check(seen === 'reveal' || seen === 'gone', `עדינה: דהייה בלי צלילה (${seen})`)
    await page.waitForFunction(() => !document.querySelector('[data-lab-stage]'), undefined, { timeout: 4000 })
    await page.close(); await ctx.close()
  }
  {
    const { ctx, page } = await open(browser, { level: 'gentle' })
    await play(page, ['wrong', 'wrong'])
    await page.waitForTimeout(400)
    check((await cameraScale(page)) === 1, 'עדינה, סיכום: בלי נסיגה')
    await page.close(); await ctx.close()
  }
  console.log('\n== תנועה מופחתת ==')
  {
    const { ctx, page } = await open(browser, { reduced: true })
    await page.waitForTimeout(2000)
    check((await cameraScale(page)) === 1, 'מופחתת: המצלמה לא זזה')
    await next(page)
    await page.waitForTimeout(120)
    check(await page.locator('[data-lab-stage]').count() === 0, 'מופחתת: מעבר מיידי, בלי צלילה ובלי דהייה')
    await page.close(); await ctx.close()
  }
  {
    const { ctx, page } = await open(browser, { reduced: true })
    await play(page, ['wrong', 'wrong'])
    await page.waitForTimeout(300)
    check((await cameraScale(page)) === 1, 'מופחתת, סיכום: בלי נסיגה')
    await page.close(); await ctx.close()
  }
  console.log('\n== ולידציית מצב רוח ==')
  {
    const { ctx, page } = await open(browser, { holoMoods: { opening: 'furious', closed: 'happy', open: 'sad' } })
    await page.waitForSelector('[data-dr-holo] video', { timeout: 20000 })
    check((await clipOf(page)) === '/dr-holo/neutral.mp4', 'ערך שלא ברשימה מוצג כ"רגיל"')
    await page.close(); await ctx.close()
  }
  console.log('\n== כל הקטעים נטענים ==')
  {
    const { ctx, page } = await open(browser)
    const r = await page.evaluate(async (moods) => Promise.all(moods.map(async (m) => {
      const [v, i] = await Promise.all([fetch(`/dr-holo/${m}.mp4`, { method: 'HEAD' }), fetch(`/dr-holo/${m}.webp`, { method: 'HEAD' })])
      return { m, ok: v.ok && (v.headers.get('content-type') ?? '').includes('video') && i.ok && (i.headers.get('content-type') ?? '').includes('image') }
    })), ['neutral', 'happy', 'celebrating', 'amused', 'surprised', 'thinking', 'sad', 'angry', 'scared'])
    for (const x of r) check(x.ok, `קטע ותמונה: ${x.m}`)
    await page.close(); await ctx.close()
  }
}

/* FPS בזמן הצלילה: בלי האטה ועם האטת מעבד פי 4 */
async function perf(browser: Browser): Promise<void> {
  console.log('\n== ביצועים בצלילה ==')
  for (const rate of [1, 4]) {
    const { ctx, page } = await open(browser)
    await page.waitForSelector('[data-dr-holo] video', { timeout: 20000 })
    const cdp = await ctx.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate })
    await page.waitForTimeout(1500)
    await page.evaluate(() => {
      const w = window as unknown as { __f: number[]; __stop?: boolean }
      w.__f = []
      const tick = (t: number) => { w.__f.push(t); if (!w.__stop) requestAnimationFrame(tick) }
      requestAnimationFrame(tick)
    })
    await next(page)
    await page.waitForFunction(() => document.querySelector('[data-lab-stage]')?.getAttribute('data-leaving') === 'reveal', undefined, { timeout: 8000 })
    const fps = await page.evaluate(() => {
      const w = window as unknown as { __f: number[]; __stop?: boolean }
      w.__stop = true
      const f = w.__f
      const gaps = f.slice(1).map((t, i) => t - f[i])
      return { fps: (f.length - 1) / ((f[f.length - 1] - f[0]) / 1000), worst: Math.max(...gaps) }
    })
    results[`dive-fps-x${rate}`] = fps
    console.log(`  האטה פי ${rate}: ${fps.fps.toFixed(1)} FPS, הפריים האיטי ביותר ${fps.worst.toFixed(0)}ms`)
    check(fps.fps >= (rate === 1 ? 30 : 15), `צלילה בהאטה פי ${rate}: ${fps.fps.toFixed(1)} FPS`)
    await page.close(); await ctx.close()
  }
}

const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
try {
  await portalClicks(browser)
  await noStall(browser)
  await dive(browser, 'new')
  await dive(browser, 'old')
  await summaries(browser, 'new')
  await summaries(browser, 'old')
  await modes(browser)
  await perf(browser)
} finally {
  await browser.close()
}
writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ results, failures }, null, 2))
console.log(failures.length ? `✗ ${failures.length} כשלים` : '✓ הכול עבר')
for (const f of failures) console.log('  -', f)
process.exit(failures.length ? 1 : 0)
