/* ──────────────────────────────────────────────────────────────────────────
   צילומי חלק ב' (הנרטיב: "הספרייה ההולוגרפית"). כלי בדיקה בלבד: הנגן האמיתי עם /api מדומה, בלי כתיבה ל-DB.
   · shelf: מדף הספרים בשלושת המצבים (חדש, בקריאה עם סימנייה, הושלם עם קריסטלים), גם בטלפון לרוחב.
   · pages: עמוד משחק ברמה 5 (הגופן הנקי) וברמה 12 (גופן הסיפור), במחשב נייד ובטלפון לרוחב, ובדיקה שאין גלישה.
   · turn: המעבר בין עמודים, פריים אחרי פריים (האנימציות מושהות ומקודמות ידנית).
   · end: מסך "סוף הפרק" עם 2, 3 ו-5 קריסטלים.
   הרצה:  npx tsx e2e/redesign/narrativeShots.ts --out reports/redesign/narrative [--only shelf,pages,turn,end]
   ────────────────────────────────────────────────────────────────────────── */
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { DEFAULT_BASE, findChrome } from '../lib/config.ts'

const args = process.argv.slice(2)
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d }
const OUT = opt('out', 'reports/redesign/narrative')
const ONLY = opt('only', 'shelf,pages,turn,end').split(',')
mkdirSync(OUT, { recursive: true })
let failed = 0
const shot = async (page: Page, name: string) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); console.log('  shot', name) }
const check = (ok: boolean, label: string) => { console.log(`  ${ok ? '✓' : '✗'} ${label}`); if (!ok) failed++ }
const safe = async (name: string, fn: () => Promise<void>) => { try { await fn() } catch (e) { failed++; console.log('  FAIL', name, String((e as Error).message).split('\n')[0].slice(0, 200)) } }

const svg = (a: string, b: string, c: string) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768"><rect width="1024" height="768" fill="${a}"/><circle cx="300" cy="240" r="120" fill="${b}"/><path d="M0 560 Q260 470 520 560 T1024 540 V768 H0Z" fill="${c}"/><rect x="620" y="330" width="240" height="190" fill="${b}"/></svg>`)}`
const IMGS = [svg('#7fb7d9', '#ffd166', '#3a86c8'), svg('#e9d8a6', '#bc6c25', '#606c38'), svg('#cdb4db', '#ffafcc', '#457b9d'), svg('#94d2bd', '#ee9b00', '#005f73')]
const IMG = IMGS[0]
const QID = '00000000-0000-4000-8000-0000000000bc'
const TF = { type: 'trueFalse', question: 'הנילוס עובר במצרים.', difficulty: 5, choices: [{ id: 't', text: 'נכון', isCorrect: true }, { id: 'f', text: 'לא נכון', isCorrect: false }], explanationCorrect: 'נכון, הנילוס עובר במצרים.', explanationIncorrect: 'התשובה הנכונה היא נכון.' }
/* טקסטים באורך התקציב של כל שכבה (כ-25 מילים) */
const NARR = [
  'הנהר זורם בשקט בין השדות. על הגדה עומדת סירה קטנה, ובתוכה מפה ישנה. מי שיקרא אותה נכון ימצא את הדרך אל המעיין.',
  'השביל מתפתל בין עצי הזית אל ראש הגבעה. שם, מאחורי חומת אבן נמוכה, מסתתר שער עץ כבד. על השער חרוטים שלושה סימנים מוזרים.',
  'בתוך החצר עומדת באר עמוקה, ולידה דלי חלוד. הסוחרים מספרים שפעם עלו ממנה מים מתוקים, אבל כבר שנים רבות איש לא שאב ממנה.',
]
const scene = (i: number, n: number, puzzle: unknown) => ({ id: `s${i}`, title: ['הנהר', 'השער', 'הבאר', 'המעיין', 'הגשר'][(i - 1) % 5], narrative: NARR[(i - 1) % NARR.length], drHoloDialog: 'מה רואים על המפה?', imageUrl: IMGS[i % IMGS.length], imagePrompt: 'x', puzzle, nextSceneId: i < n ? `s${i + 1}` : null })
const lesson = (puzzles: unknown[], level: number) => ({
  id: QID, title: 'מסע אל המעיין', subject: 'history', subject_code: 'history',
  game_data: {
    scenes: [{ id: 's0', title: 'היציאה לדרך', narrative: 'ברוכים הבאים. היום יוצאים למסע אל המעיין.', drHoloDialog: 'מוכנים לצאת לדרך?', imageUrl: IMG, imagePrompt: 'x', nextSceneId: 's1' }, ...puzzles.map((p, i) => scene(i + 1, puzzles.length, p))], entrySceneId: 's0', readingScale: level, holoMoods: { opening: 'רגיל', closed: 'שמח', open: 'עצוב' },
    endingGood: { title: 'המעיין נמצא', narrative: 'בזכותכם המים חזרו אל השדות.', drHoloDialog: 'פתרתם את התעלומה.', imageUrl: IMG },
    endingBad: { title: 'הסיפור עוד פתוח', narrative: 'חסרות עוד תובנות כדי למצוא את המעיין.', drHoloDialog: 'בואו נחזור ונגלה מה עוד מסתתר שם.', imageUrl: IMG },
  },
})

const fakeJwt = `x.${Buffer.from(JSON.stringify({ userId: 'stu-demo', role: 'student', classId: 'c1', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64')}.y`
const STUDENT = `sessionStorage.setItem('holo_token','${fakeJwt}'); sessionStorage.setItem('holo_student_name','נועה לוי');`
async function ctxOf(browser: Browser, w: number, h: number, reduced = false): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, screen: { width: w, height: h }, deviceScaleFactor: 1, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', reducedMotion: reduced ? 'reduce' : 'no-preference' })
  await ctx.addInitScript(`(() => { if (!window.__name) window.__name = (f) => f; try { sessionStorage.setItem('holo_splash_seen','1'); ${STUDENT} } catch (e) {} })()`)
  return ctx
}
async function openGame(ctx: BrowserContext, quest: unknown): Promise<Page> {
  const page = await ctx.newPage()
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.route(`**/api/quests/${QID}`, (r) => r.fulfill({ json: { quest } }))
  await page.route('**/api/sessions/start', (r) => r.fulfill({ json: { sessionId: 'sess-1', resumed: false, currentSceneId: null, inventory: [], visitedScenes: [], crystals: 0, effectsLevel: 'medium', isReplay: false } }))
  await page.route('**/api/sessions/*/complete', (r) => r.fulfill({ json: { ok: true, profileUpdated: true } }))
  await page.route('**/api/sessions/class-gems/**', (r) => r.fulfill({ json: { available: true, classGems: 41, mine: 3, target: 72, allClosed: false } }))
  await page.route('**/api/sessions/assigned', (r) => r.fulfill({ json: { quests: [] } }))
  await page.goto(`${DEFAULT_BASE}/play/${QID}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.holo-text-area', { timeout: 30000 })
  return page
}
const startBtn = (page: Page) => page.getByRole('button', { name: /פתרו את האתגר|התחילו את מבחן הסיכום/ })
const choice = (page: Page, text: RegExp) => page.locator('.holo-stage button', { hasText: text }).first()
async function openChallenge(page: Page): Promise<void> { await startBtn(page).click({ timeout: 12000 }); await page.waitForSelector('.holo-stage', { timeout: 10000 }); await page.waitForTimeout(950) }
async function next(page: Page): Promise<void> {
  for (let i = 0; i < 24; i++) {
    if (await page.locator('[data-end-screen]').count()) return
    if (await startBtn(page).isVisible().catch(() => false)) return
    const b = page.locator('button:visible:not([disabled])', { hasText: /המשך|סיום/ }).last()
    if (await b.isVisible().catch(() => false)) await b.click({ timeout: 2000 }).catch(() => undefined)
    await page.waitForTimeout(450)
  }
}
/* מה שהתלמיד רואה על המסך (בלי תגי קוד) */
const visibleText = (page: Page) => page.evaluate(() => document.body.innerText)

async function shelf(browser: Browser): Promise<void> {
  console.log('== shelf ==')
  const day = 86_400_000
  const now = Date.now()
  const subj = ['math', 'history', 'science', 'hebrew', 'english', null, 'geography']
  const titles = ['קרב השברים', 'מסע אל המעיין', 'טיפת המים', 'בלשי השורש', 'The Lost Key', 'שיעור בלי מקצוע', 'מפת האוצר של הנגב']
  const quests = subj.map((s, i) => ({
    id: `q${i}`, title: titles[i], sceneCount: 6, artStyle: 'digital-painting', subject: s, subjectCode: s, teacherName: 'המורה רון',
    assignedAt: new Date(now - (i + 1) * day).toISOString(), entryImageUrl: i === 4 ? null : IMGS[i % IMGS.length], thumbUrl: i === 4 ? null : IMGS[i % IMGS.length], gradeMin: 5, gradeMax: 6,
    dueAt: i === 6 ? null : new Date(now + (i === 2 ? -2 : 3 + i) * day).toISOString(), state: i === 2 ? 'ended' : 'open', late: i === 4,
    sessionStatus: i === 3 || i === 4 ? 'completed' : i === 1 || i === 6 ? 'in_progress' : null, crystals: i === 3 ? 4 : i === 4 ? 2 : null, gems: i === 3 ? 5 : i === 4 ? 2 : null, maxScore: 5, isReview: false,
    bookmarkPage: i === 1 ? 3 : null,
  }))
  for (const [name, w, h] of [['shelf-desktop', 1366, 768], ['shelf-phone-landscape', 740, 360]] as const) {
    await safe(name, async () => {
      const ctx = await ctxOf(browser, w, h)
      const page = await ctx.newPage()
      await page.route('**/api/**', (r) => r.fulfill({ json: {} }))
      await page.route('**/api/sessions/assigned', (r) => r.fulfill({ json: { quests } }))
      await page.goto(`${DEFAULT_BASE}/student`, { waitUntil: 'networkidle' }).catch(() => undefined)
      await page.waitForTimeout(1500); await shot(page, name)
      const text = await visibleText(page)
      check(text.includes('הספרייה ההולוגרפית'), `${name}: הכותרת "הספרייה ההולוגרפית"`)
      check((text.match(/הספרן הראשי/g) ?? []).length === 1, `${name}: "הספרן הראשי" מופיע פעם אחת`)
      check(!/סצנ/.test(text), `${name}: אין "סצנה"`)
      check(text.includes('עמוד 3'), `${name}: סימנייה "עמוד 3"`)
      check(await page.locator('[data-book-cover] .holo-button, [data-book-cover] button').count() === 0, `${name}: בכריכה אין כפתור`)
      await page.evaluate(() => document.querySelector('[data-book-shelf]')?.scrollIntoView({ block: 'start' }))
      await page.waitForTimeout(400); await shot(page, `${name}-covers`)
      await ctx.close()
    })
  }
}

async function pages(browser: Browser): Promise<void> {
  console.log('== pages ==')
  for (const level of [5, 12]) {
    for (const [dev, w, h] of [['laptop', 1366, 620], ['phone-landscape', 740, 360]] as const) {
      await safe(`page-level-${level}-${dev}`, async () => {
        const ctx = await ctxOf(browser, w, h)
        const page = await openGame(ctx, lesson([TF, TF, TF], level))
        await page.waitForTimeout(2500)
        if (dev === 'laptop') await shot(page, `opening-level-${level}`)
        await next(page); await page.waitForTimeout(1600)
        await page.evaluate(() => document.fonts.ready)
        await shot(page, `page-level-${level}-${dev}`)
        const m = await page.evaluate(() => {
          const area = document.querySelector('.holo-text-area') as HTMLElement
          const p = area.querySelector('p') as HTMLElement
          const cs = getComputedStyle(p)
          return { font: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(), size: cs.fontSize, lh: cs.lineHeight, over: area.scrollHeight - area.clientHeight, hud: document.querySelector('[data-hud-page]')?.textContent ?? '', parts: document.querySelector('[data-page-indicator]')?.textContent ?? '1/1' }
        })
        console.log(`   רמה ${level}, ${dev}: גופן ${m.font} ${m.size}/${m.lh}, חלקים ${m.parts}, HUD "${m.hud}"`)
        check(m.over <= 0, `רמה ${level}, ${dev}: הטקסט לא גולש מהתיבה`)
        check(level >= 8 ? /Frank Ruhl/.test(m.font) : !/Frank Ruhl/.test(m.font), `רמה ${level}, ${dev}: הגופן לפי הסף`)
        check(/^עמוד \d+ מתוך \d+$/.test(m.hud), `רמה ${level}, ${dev}: ב-HUD "עמוד N מתוך M"`)
        check(!/סצנ/.test(await visibleText(page)), `רמה ${level}, ${dev}: אין "סצנה"`)
        await ctx.close()
      })
    }
  }
}

async function turn(browser: Browser): Promise<void> {
  console.log('== turn ==')
  await safe('page-turn', async () => {
    const ctx = await ctxOf(browser, 1366, 768)
    const page = await openGame(ctx, lesson([null, null, TF], 12))
    await next(page); await page.waitForTimeout(1800)
    /* מהעמוד השני לשלישי: שניהם עמודי טקסט בלי אתגר. מאטים את האנימציות פי 8 כדי לצלם את אמצע המעבר */
    const cdp = await ctx.newCDPSession(page)
    await cdp.send('Animation.enable'); await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.125 })
    await page.locator('button:visible', { hasText: /המשך/ }).last().click()
    for (let i = 0; i < 6; i++) { await page.waitForTimeout(i === 0 ? 300 : 620); await shot(page, `turn-${i + 1}`) }
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 })
    await page.waitForTimeout(1500); await shot(page, 'turn-7-settled')
    await ctx.close()
  })
  await safe('page-turn-reduced', async () => {
    const ctx = await ctxOf(browser, 1366, 768, true)
    const page = await openGame(ctx, lesson([null, null, TF], 12))
    await next(page); await page.waitForTimeout(800)
    const before = await page.locator('.holo-text-area p').first().innerText()
    await page.locator('button:visible', { hasText: /המשך/ }).last().click()
    await page.waitForTimeout(120)
    const after = await page.locator('.holo-text-area p').first().innerText().catch(() => '')
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)
    check(after !== before && after.length > 0, 'תנועה מופחתת: העמוד מתחלף מיד')
    check(running === 0, `תנועה מופחתת: אין אנימציה רצה (${running})`)
    await ctx.close()
  })
}

async function end(browser: Browser): Promise<void> {
  console.log('== end ==')
  for (const [gems, rights] of [[2, 2], [3, 3], [5, 5]] as const) {
    await safe(`end-${gems}`, async () => {
      const ctx = await ctxOf(browser, 1366, 768)
      const page = await openGame(ctx, lesson([TF, TF, TF, TF, TF], 10))
      await next(page)
      for (let i = 0; i < 5; i++) {
        await openChallenge(page)
        await choice(page, i < rights ? /^\s*נכון\s*$/ : /לא נכון/).click(); await page.waitForTimeout(900)
        await next(page)
      }
      await page.waitForSelector('[data-end-screen]', { timeout: 25000 })
      await page.waitForTimeout(3400); await shot(page, `chapter-end-${gems}-gems`)
      const text = await visibleText(page)
      check(text.includes('סוף הפרק'), `${gems} קריסטלים: הכותרת "סוף הפרק"`)
      check(await page.locator('[data-end-screen] .holo-panel .holo-button:visible').count() === 1, `${gems} קריסטלים: כפתור אחד`)
      check((await page.locator('[data-end-screen] .holo-panel .holo-button:visible').first().innerText()).includes('חזרה לספרייה'), `${gems} קריסטלים: "חזרה לספרייה"`)
      check(text.includes('דוקטור הולו') && text.includes('המדריך שלכם'), `${gems} קריסטלים: "דוקטור הולו" ו"המדריך שלכם"`)
      check(!/סצנ/.test(text), `${gems} קריסטלים: אין "סצנה"`)
      await ctx.close()
    })
  }
  await safe('end-phone', async () => {
    const ctx = await ctxOf(browser, 740, 360)
    const page = await openGame(ctx, lesson([TF, TF], 10))
    await next(page)
    for (let i = 0; i < 2; i++) { await openChallenge(page); await choice(page, /^\s*נכון\s*$/).click(); await page.waitForTimeout(900); await next(page) }
    await page.waitForSelector('[data-end-screen]', { timeout: 25000 })
    await page.waitForTimeout(3400); await shot(page, 'chapter-end-phone-landscape')
    const over = await page.evaluate(() => { const p = document.querySelector('[data-end-screen] .holo-panel') as HTMLElement; return p.scrollHeight - p.clientHeight })
    check(over <= 1, `טלפון לרוחב: מסך הסיום נכנס בלי גלילה (${over})`)
    await ctx.close()
  })
}

const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
try {
  if (ONLY.includes('shelf')) await shelf(browser)
  if (ONLY.includes('pages')) await pages(browser)
  if (ONLY.includes('turn')) await turn(browser)
  if (ONLY.includes('end')) await end(browser)
} finally { await browser.close() }
console.log(failed ? `\n✗ ${failed} כשלים` : '\n✓ הכול עבר')
process.exit(failed ? 1 : 0)
