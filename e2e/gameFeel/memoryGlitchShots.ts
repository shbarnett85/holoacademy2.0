/* בדיקת לוח הזיכרון (ריבוע או המלבן הקרוב אליו) וגליץ' ההולוגרמה, בנגן האמיתי עם תגובת /api מדומה.
   הרצה: npx tsx e2e/gameFeel/memoryGlitchShots.ts --out <dir> */
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { findChrome } from '../lib/config.js'

const args = process.argv.slice(2)
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'reports/stage-j/memory-glitch'
mkdirSync(OUT, { recursive: true })
let failed = 0
const check = (ok: boolean, msg: string) => { if (!ok) failed++; console.log(`${ok ? '✓' : '✗'} ${msg}`) }

const IMG = 'https://res.cloudinary.com/dhkxhiv6l/image/upload/v1793038656/holo-thumbs/95664eeb-c752-4cdc-8b18-6fbac455361a-f59f052c.jpg'
const quest = (pairs: number) => ({
  id: 'memo', title: 'בדיקה', art_style: 'digital-painting',
  game_data: {
    entrySceneId: 'lab',
    scenes: [
      { id: 'lab', title: 'מעבדה', narrative: 'פתיחה', nextSceneId: 'm' },
      { id: 'm', title: 'זיכרון', narrative: 'זוגות', imageUrl: IMG, puzzle: { type: 'memory', question: 'מצאו זוגות', difficulty: 5, pairs: Array.from({ length: pairs }, (_, i) => ({ a: `מושג ${i + 1}`, b: `הגדרה ${i + 1}` })) } },
    ],
    endingGood: { title: 'א', narrative: 'ב' }, endingBad: { title: 'א', narrative: 'ב' },
  },
})

const browser = await chromium.launch({ executablePath: findChrome(), headless: true })
const WANT: Record<number, [number, number]> = { 2: [2, 2], 3: [3, 2], 6: [4, 3], 8: [4, 4], 10: [5, 4], 14: [7, 4], 18: [6, 6] }
for (const [pairsStr, [cols, rows]] of Object.entries(WANT)) {
  const pairs = Number(pairsStr)
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  await page.route('**/api/funnel', (r) => r.fulfill({ status: 200, body: '{}' }))
  await page.route('**/api/quests/memo', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quest: quest(pairs) }) }))
  await page.addInitScript(() => { try { sessionStorage.setItem('holo_splash_seen', '1') } catch { /* */ } })
  await page.goto('http://localhost:5173/play/memo', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.holo-panel-actions button', { timeout: 30000 })
  await page.waitForTimeout(600)
  await page.locator('.holo-panel-actions button').locator('visible=true').first().click()
  await page.waitForSelector('text=פתרו את האתגר', { timeout: 8000 })
  await page.locator('text=פתרו את האתגר').first().click()
  await page.waitForTimeout(900)
  const got = await page.evaluate(() => {
    const grid = [...document.querySelectorAll<HTMLElement>('.holo-stage *')].find((e) => getComputedStyle(e).display === 'grid' && e.children.length >= 4)
    if (!grid) return null
    const t = getComputedStyle(grid).gridTemplateColumns.split(' ').length
    return { cols: t, rows: Math.ceil(grid.children.length / t), bottom: grid.getBoundingClientRect().bottom }
  })
  check(got?.cols === cols && got?.rows === rows, `${pairs * 2} קלפים: ${got?.cols}×${got?.rows} (נדרש ${cols}×${rows})`)
  await page.screenshot({ path: path.join(OUT, `memory-${pairs * 2}.png`) })
  await ctx.close()
}

/* הגליץ': רץ במעבדה, ועוצר את הזמן ברגע ההתפרצות כדי לצלם */
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } })
const page = await ctx.newPage()
await page.route('**/api/funnel', (r) => r.fulfill({ status: 200, body: '{}' }))
await page.route('**/api/quests/memo', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quest: quest(2) }) }))
await page.addInitScript(() => { try { sessionStorage.setItem('holo_splash_seen', '1') } catch { /* */ } })
await page.goto('http://localhost:5173/play/memo', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-dr-holo] video', { timeout: 30000 })
await page.waitForTimeout(2500)
const g = await page.evaluate(() => {
  const anims = document.getAnimations().filter((a) => String((a as CSSAnimation).animationName ?? '').startsWith('dr-holo-glitch'))
  for (const a of anims) { a.pause(); a.currentTime = 4400 * 0.905 }
  return { n: anims.length, opacity: [...document.querySelectorAll('.dr-holo__glitch')].map((e) => getComputedStyle(e).opacity) }
})
check(g.n === 2, `גליץ': שתי שכבות רצות במעבדה (${g.n})`)
check(g.opacity.every((o) => Number(o) > 0.5), `גליץ': השכבות גלויות ברגע ההתפרצות (${g.opacity.join(', ')})`)
await page.waitForTimeout(150)
await page.screenshot({ path: path.join(OUT, 'glitch.png'), clip: { x: 0, y: 100, width: 460, height: 668 } })
await page.screenshot({ path: path.join(OUT, 'glitch-full.png') })
await ctx.close()
await browser.close()
console.log(failed ? `✗ ${failed} כשלים` : '✓ הכול עבר')
process.exit(failed ? 1 : 0)
