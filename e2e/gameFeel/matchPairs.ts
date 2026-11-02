/* ───────────────────────────────────────────────────────────
   אתגר התאמת זוגות, ופאזל ההחלפות על תמונה עם שמיים שחורים.
   הנגן האמיתי עם /api מדומה (בלי כתיבה ל-DB).
   הרצה:  npx tsx e2e/gameFeel/matchPairs.ts --moon <url> [--out <dir>]     יוצא עם קוד 1 אם משהו נכשל.
   ─────────────────────────────────────────────────────────── */
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium, type Browser, type Page } from 'playwright-core'
import { DEFAULT_BASE, findChrome } from '../lib/config.ts'

const args = process.argv.slice(2)
const opt = (name: string, dflt: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt }
const OUT = opt('out', 'e2e/out/match-pairs')
const MOON = opt('moon', '')
mkdirSync(OUT, { recursive: true })
const QID = '00000000-0000-4000-8000-0000000000ef'
const failures: string[] = []
const check = (ok: boolean, msg: string) => { console.log(ok ? '  ✓' : '  ✗', msg); if (!ok) failures.push(msg) }
/* שמיים שחורים אחידים עם עיגול קטן במרכז: בפינות יש אריחים זהים לגמרי */
const SKY = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#000"/><circle cx="640" cy="360" r="130" fill="#ddd"/><circle cx="600" cy="330" r="30" fill="#777"/><circle cx="680" cy="400" r="44" fill="#999"/></svg>')}`
const IMG = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#2a6f97"/></svg>')}`

const PAIRS_ALL = [
  { a: 'התאדות', b: 'מים נוזליים הופכים לאדים בגלל חום השמש' },
  { a: 'עיבוי', b: 'אדים מתקררים באוויר ונהיים טיפות קטנות' },
  { a: 'משקעים', b: 'טיפות כבדות נופלות אל הקרקע כגשם או שלג' },
  { a: 'חלחול', b: 'מי הגשם יורדים דרך האדמה אל מי התהום' },
  { a: 'נגר עילי', b: 'מים זורמים על פני הקרקע אל הנחלים והים' },
  { a: 'אקוויפר', b: 'שכבת סלע תת-קרקעית שאוגרת כמויות גדולות של מים' },
  { a: 'דיות', b: 'צמחים משחררים אדי מים דרך העלים שלהם' },
  { a: 'מליחות', b: 'כמות המלחים המומסים בתוך מי הים והאגמים' },
]

const PAIRS = PAIRS_ALL.slice(0, 6)

async function open(browser: Browser, puzzle: Record<string, unknown>, imageUrl: string, viewport = { width: 1366, height: 768 }): Promise<Page> {
  const ctx = await browser.newContext({ viewport, screen: viewport, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
  await ctx.addInitScript(`(() => { if (!window.__name) window.__name = (f) => f; try { sessionStorage.setItem('holo_splash_seen','1'); sessionStorage.setItem('holo_token','e2e-fake-token') } catch (e) {} })()`)
  const page = await ctx.newPage()
  const quest = { id: QID, title: 'זוגות', game_data: { entrySceneId: 's1', readingScale: 10, scenes: [
    { id: 's1', title: 'ראשונה', narrative: 'הנהר זורם.', imageUrl, imagePrompt: 'x', puzzle, nextSceneId: 's2' },
    { id: 's2', title: 'שנייה', narrative: 'הסצנה הבאה.', imageUrl: IMG, imagePrompt: 'x', nextSceneId: null },
  ] } }
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.route(`**/api/quests/${QID}`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quest }) }))
  await page.route('**/api/sessions/start', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionId: 'sess-1', resumed: false, currentSceneId: null, inventory: [], visitedScenes: [], crystals: 0, effectsLevel: 'medium', isReplay: false }) }))
  await page.goto(`${DEFAULT_BASE}/play/${QID}`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /פתרו את האתגר/ }).click({ timeout: 40000 })
  await page.waitForSelector('.holo-stage', { timeout: 10000 })
  await page.waitForTimeout(950)
  return page
}

/* הכול נכנס במסך: אין גלילה בפאנל, וכל התאים בתוך החלון */
async function fits(page: Page, name: string, selector: string): Promise<void> {
  const st = await page.evaluate((sel) => {
    const out = [...document.querySelectorAll<HTMLElement>(sel)].filter((el) => { const r = el.getBoundingClientRect(); return r.top < 0 || r.bottom > innerHeight })
    const scroller = [...document.querySelectorAll<HTMLElement>('.holo-stage, .holo-stage *')].find((el) => { const o = getComputedStyle(el).overflowY; return (o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight + 1 })
    return { out: out.length, scroll: scroller ? scroller.scrollHeight - scroller.clientHeight : 0, small: [...document.querySelectorAll<HTMLElement>(sel)].filter((el) => el.getBoundingClientRect().height < 40).length }
  }, selector)
  check(st.out === 0, `${name}: כל התאים בתוך המסך (${st.out} בחוץ)`)
  check(st.scroll === 0, `${name}: בלי גלילה (${st.scroll}px)`)
  check(st.small === 0, `${name}: אזורי לחיצה של 40px לפחות`)
}

const cellA = (page: Page, i: number) => page.locator(`[data-pair-a="${i}"]`)
const cellB = (page: Page, i: number) => page.locator(`[data-pair-b="${i}"]`)

async function matching(browser: Browser): Promise<void> {
  console.log('== התאמת זוגות ==')
  const puzzle = { type: 'matchPairs', question: 'התאימו כל מושג להסבר שלו', difficulty: 20, pairs: PAIRS }
  let page = await open(browser, puzzle, IMG)
  await page.screenshot({ path: path.join(OUT, 'pairs-start.png') })
  await fits(page, '6 זוגות ב-1366×768', '[data-pair-a],[data-pair-b]')
  const start = await page.evaluate(() => { const rows = (s: string) => [...document.querySelectorAll<HTMLElement>(s)].map((e) => Number(e.dataset.pairA ?? e.dataset.pairB)); return { a: rows('[data-pair-a]'), b: rows('[data-pair-b]') } })
  check(start.b.every((p, r) => p !== start.a[r]), 'אף הסבר לא מתחיל מול המושג שלו')

  await cellA(page, 0).click()
  check(await cellA(page, 0).getAttribute('aria-pressed') === 'true', 'בחירה מסומנת')
  await cellB(page, 1).click()
  await page.waitForTimeout(100)
  check(await cellA(page, 0).getAttribute('data-pair-state') === 'open', 'טעות: הבחירה מתאפסת והזוג לא ננעל')

  /* אפשר להתחיל גם מההסבר */
  await cellB(page, 0).click()
  await cellA(page, 0).click()
  await page.waitForTimeout(450)
  const aligned = await page.evaluate(() => {
    const top = (s: string) => document.querySelector(s)!.getBoundingClientRect().top
    return Math.abs(top('[data-pair-a="0"]') - top('[data-pair-b="0"]'))
  })
  check(aligned < 2, 'זוג נכון מתיישר לאותה שורה')
  check(await cellA(page, 0).getAttribute('data-pair-state') === 'matched', 'זוג נכון ננעל')
  for (let i = 1; i < PAIRS.length; i++) { await cellA(page, i).click(); await cellB(page, i).click() }
  await page.waitForSelector('[data-puzzle-result="bar"]', { timeout: 6000 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(OUT, 'pairs-win.png') })
  await page.waitForTimeout(3000)
  check(await cellA(page, 0).isVisible(), 'הפתרון נשאר על המסך עד הלחיצה')
  await page.locator('[data-puzzle-result] button').click()
  await page.waitForFunction(() => document.querySelector('[data-scene-image]')?.getAttribute('data-scene-image') === 's2', null, { timeout: 6000 })
  check(true, 'ההמשך עובד בלחיצה')
  await page.context().close()

  /* נגמרו הטעויות */
  page = await open(browser, puzzle, IMG)
  for (let t = 0; t < 4; t++) { await cellA(page, 0).click(); await cellB(page, 1 + t).click(); await page.waitForTimeout(80) }
  await page.waitForSelector('[data-puzzle-result="bar"]', { timeout: 6000 })
  await page.waitForTimeout(500)
  const revealed = await page.evaluate((count) => { const top = (s: string) => document.querySelector(s)!.getBoundingClientRect().top; return Array.from({ length: count }, (_, i) => Math.abs(top(`[data-pair-a="${i}"]`) - top(`[data-pair-b="${i}"]`))).every((d) => d < 2) }, PAIRS.length)
  check(revealed, '4 טעויות: כל הזוגות נחשפים ומיושרים')
  await page.screenshot({ path: path.join(OUT, 'pairs-lose.png') })
  const hidden = await page.evaluate(() => { const b = document.querySelector('[data-puzzle-result] button')!.getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight })
  check(hidden, 'כפתור ההמשך בתוך המסך')
  await page.context().close()

  /* ויתור */
  page = await open(browser, puzzle, IMG)
  await page.getByRole('button', { name: /ויתור על האתגר/ }).click()
  await page.waitForSelector('[data-puzzle-result="bar"]', { timeout: 6000 })
  check(await cellA(page, 0).getAttribute('data-pair-state') === 'matched', 'ויתור: הפתרון נחשף')
  await page.context().close()

  /* מעט זוגות במסך טלפון לרוחב */
  page = await open(browser, { ...puzzle, difficulty: 1, pairs: PAIRS.slice(0, 3) }, IMG, { width: 740, height: 360 })
  await page.screenshot({ path: path.join(OUT, 'pairs-phone.png') })
  await page.context().close()
}

/* מצב הלוח לפי הרקע של כל אריח: מיקום הרקע של האריח הפתור בכל מקום */
const tilePositions = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.tileswap-grid button')].map((b) => b.style.backgroundPosition))

async function moon(browser: Browser): Promise<void> {
  if (!MOON) { console.log('דילוג על הירח: אין --moon'); return }
  console.log('== פאזל על תמונה עם שמיים שחורים ==')
  const page = await open(browser, { type: 'tileSwap', question: 'השלימו את התמונה', difficulty: 10 }, MOON)
  await page.waitForTimeout(1200)
  await page.screenshot({ path: path.join(OUT, 'moon-start.png') })
  await fits(page, 'פאזל ב-1366×768', '.tileswap-grid')
  const shape = await page.evaluate(async (src) => {
    const img = new Image(); img.src = src; await img.decode()
    const b = document.querySelector<HTMLElement>('.tileswap-grid button')!
    const grid = document.querySelector<HTMLElement>('.tileswap-grid')!.getBoundingClientRect()
    return { natural: img.naturalWidth / img.naturalHeight, size: b.style.backgroundSize, grid: grid.width / grid.height }
  }, MOON)
  const [w, h] = shape.size.split(' ').map(parseFloat)
  check(Math.abs(w / h - shape.natural) < 0.01, `התמונה לא מעוכה: יחס הרקע ${(w / h).toFixed(2)}, יחס התמונה ${shape.natural.toFixed(2)}`)

  await page.context().close()
}

async function sky(browser: Browser): Promise<void> {
  console.log('== אריחים זהים ==')
  const page = await open(browser, { type: 'tileSwap', question: 'השלימו את התמונה', difficulty: 10 }, SKY)
  await page.waitForTimeout(600)
  /* הסדר הנכון נמדד מהאריחים עצמם: ויתור מראה את הפתרון. פותחים מחדש ופותרים לפי מיקומי הרקע */
  const solvedPage = await open(browser, { type: 'tileSwap', question: 'השלימו את התמונה', difficulty: 10 }, SKY)
  await solvedPage.getByRole('button', { name: /ויתור על האתגר/ }).click()
  await solvedPage.waitForTimeout(400)
  const solved = await tilePositions(solvedPage)
  await solvedPage.context().close()

  const n = Math.round(Math.sqrt(solved.length))
  /* היעד: הכול במקום, חוץ משתי פינות עליונות של שמיים שמתחלפות ביניהן */
  const target = [...solved]
  ;[target[0], target[n - 1]] = [target[n - 1], target[0]]
  for (let pos = 0; pos < target.length; pos++) {
    const now = await tilePositions(page)
    if (now[pos] === target[pos]) continue
    if (await page.locator('.tileswap-grid.solved').count()) break
    const from = now.indexOf(target[pos], pos)
    await page.locator('.tileswap-grid button').nth(pos).click()
    await page.locator('.tileswap-grid button').nth(from).click()
    await page.waitForTimeout(60)
  }
  await page.waitForTimeout(300)
  check(await page.locator('.tileswap-grid.solved').count() === 1, 'שתי פינות שחורות במקום אחת של השנייה: הפאזל נחשב פתור')
  check((await tilePositions(page)).every((p, i) => p === solved[i]), 'בסיום כל האריחים חוזרים למקום המדויק')
  await page.context().close()
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ executablePath: findChrome(), headless: true })
  await matching(browser)
  await moon(browser)
  await sky(browser)
  await browser.close()
  if (failures.length) { console.log(`✗ ${failures.length} כשלים`); process.exit(1) }
  console.log('✓ הכול עבר')
}
main().catch((e) => { console.error(e); process.exit(1) })
