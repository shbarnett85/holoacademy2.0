/* אחרי ויתור בחלון נמוך: כפתור ההמשך חייב להיות בהישג יד, והאתגר לא נפתח מחדש. הרצה: npx tsx e2e/gameFeel/giveUpLow.ts --out <dir> */
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { findChrome } from '../lib/config.js'

const args = process.argv.slice(2)
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'reports/stage-j/giveup'
mkdirSync(OUT, { recursive: true })
const IMG = 'https://res.cloudinary.com/dhkxhiv6l/image/upload/v1793038656/holo-thumbs/95664eeb-c752-4cdc-8b18-6fbac455361a-f59f052c.jpg'
const PUZZLES: Record<string, unknown> = {
  memory: { type: 'memory', question: 'מצאו זוגות', difficulty: 5, pairs: Array.from({ length: 8 }, (_, i) => ({ a: `מושג ${i + 1}`, b: `הגדרה ${i + 1}` })) },
  tileSwap: { type: 'tileSwap', question: 'סדרו את התמונה', difficulty: 8 },
  wordSearch: { type: 'wordSearch', question: 'מצאו מילים', difficulty: 8, words: ['שמש', 'ירח', 'כוכב', 'חלל'] },
}
const quest = (p: unknown) => ({
  id: 'memo', title: 'בדיקה', art_style: 'digital-painting',
  game_data: {
    entrySceneId: 'lab',
    scenes: [
      { id: 'lab', title: 'מעבדה', narrative: 'פתיחה', nextSceneId: 'm' },
      { id: 'm', title: 'אתגר', narrative: 'טקסט', imageUrl: IMG, puzzle: p, nextSceneId: 'z' },
      { id: 'z', title: 'הבאה', narrative: 'הסצנה הבאה', imageUrl: IMG },
    ],
    endingGood: { title: 'א', narrative: 'ב' }, endingBad: { title: 'א', narrative: 'ב' },
  },
})
const browser = await chromium.launch({ executablePath: findChrome(), headless: true })
let bad = 0
for (const [w, h] of [[1000, 620], [740, 360], [1366, 768]] as const) {
  for (const [name, p] of Object.entries(PUZZLES)) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    await page.route('**/api/funnel', (r) => r.fulfill({ status: 200, body: '{}' }))
    await page.route('**/api/quests/memo', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quest: quest(p) }) }))
    await page.addInitScript(() => { try { sessionStorage.setItem('holo_splash_seen', '1') } catch { /* */ } })
    await page.goto('http://localhost:5173/play/memo', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.holo-panel-actions button', { timeout: 30000 })
    await page.waitForTimeout(500)
    await page.locator('.holo-panel-actions button:visible').first().click({ timeout: 5000 })
    const solve = page.locator('.holo-panel-actions button', { hasText: 'פתרו' })
    await solve.waitFor({ timeout: 8000 })
    await solve.click({ timeout: 5000 })
    await page.waitForTimeout(800)
    const give = page.locator('.holo-stage button', { hasText: 'ויתור' })
    await give.scrollIntoViewIfNeeded({ timeout: 5000 })
    await give.click({ timeout: 5000 })
    await page.waitForTimeout(2600)
    const state = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.offsetParent && b.innerText.trim()).map((b) => {
      const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return `${b.innerText.trim().slice(0, 14)}|${b.closest('.holo-stage') ? 'במה' : 'פאנל'}|${hit && (hit === b || b.contains(hit)) ? 'לחיץ' : 'חסום'}|y${Math.round(r.y)}`
    }))
    const cont = page.locator('.holo-stage button', { hasText: 'המשך' })
    let ok = await cont.count() > 0
    if (ok) {
      await cont.first().scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {})
      await cont.first().click({ timeout: 3000 }).catch(() => { ok = false })
      await page.waitForTimeout(1500)
      ok = ok && (await page.locator('.holo-stage button', { hasText: 'ויתור' }).count()) === 0 && (await page.locator('.holo-text-area').innerText().catch(() => '')).includes('הסצנה הבאה')
    }
    if (!ok) { bad++; await page.screenshot({ path: path.join(OUT, `${name}-${w}x${h}.png`) }) }
    console.log(`${ok ? '✓' : '✗'} ${name} ${w}x${h}${ok ? '' : ': ' + state.join(' ; ')}`)
    await ctx.close()
  }
}
await browser.close()
console.log(bad ? `✗ ${bad} כשלים` : '✓ הכול עבר')
process.exit(bad ? 1 : 0)
