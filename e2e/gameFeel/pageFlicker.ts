/* הבאג: כשכפתור הסצנה נשבר לשתי שורות, גובה תיבת הטקסט תלוי בעמוד, והחלוקה לעמודים נכנסת ללולאה (8/8 ↔ 8/9) והכפתור לא לחיץ.
   מדלג ישירות לסצנה עם אתגר (תגובת /api מדומה), עובר על העמודים בכמה גדלי חלון, סופר החלפות בלי לחיצה, ובודק שהאתגר נפתח.
   הרצה: npx tsx e2e/gameFeel/pageFlicker.ts [--quest <id>] */
import { chromium, type Page } from 'playwright-core'
import { findChrome } from '../lib/config.js'

const args = process.argv.slice(2)
const QUEST = args.includes('--quest') ? args[args.indexOf('--quest') + 1] : '95664eeb-c752-4cdc-8b18-6fbac455361a'
const SIZES: [number, number][] = [[1366, 768], [1200, 800], [1100, 800], [1000, 800], [900, 800], [800, 800], [760, 700], [1000, 620], [740, 360]]

/* כמה פעמים אזור הפעולות השתנה ב-800ms בלי שנגענו */
const flips = (page: Page) => page.evaluate(() => new Promise<number>((res) => {
  const el = document.querySelector('.holo-panel-actions')
  if (!el) { res(0); return }
  let n = 0
  const mo = new MutationObserver(() => { n++ })
  mo.observe(el, { childList: true, subtree: true, characterData: true })
  setTimeout(() => { mo.disconnect(); res(n) }, 800)
}))

const browser = await chromium.launch({ executablePath: findChrome(), headless: true })
let bad = 0
for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  await page.route('**/api/funnel', (r) => r.fulfill({ status: 200, body: '{}' }))
  await page.route(`**/api/quests/${QUEST}`, async (r) => {
    const res = await r.fetch()
    const body = await res.json() as Record<string, any>
    const q = body.game_data ? body : body.quest
    const gd = q.game_data
    const armor = gd.scenes.find((s: { id: string }) => s.id === 'scene_armor') ?? gd.scenes[2]
    const lab = gd.scenes.find((s: { id: string }) => s.id === gd.entrySceneId)
    lab.narrative = 'א'; delete lab.drHoloDialog; lab.nextSceneId = armor.id
    gd.scenes = [lab, armor]
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.addInitScript(() => { try { sessionStorage.setItem('holo_splash_seen', '1') } catch { /* */ } })
  await page.goto(`http://localhost:5173/play/${QUEST}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.holo-panel-actions button', { timeout: 30000 })
  await page.waitForTimeout(800)
  await page.locator('.holo-panel-actions button').locator('visible=true').first().click()
  await page.waitForTimeout(1200)
  let result = 'לא הגיע לאתגר'
  let maxFlips = 0
  let pagesSeen = ''
  for (let step = 0; step < 40; step++) {
    const f = await flips(page)
    maxFlips = Math.max(maxFlips, f)
    pagesSeen = (await page.locator('[data-page-indicator]').textContent().catch(() => '')) ?? ''
    if (f >= 6) { result = `לולאה: ${f} החלפות ב-800ms בעמוד ${pagesSeen}`; break }
    const btn = page.locator('.holo-panel-actions button').locator('visible=true').first()
    if (!await btn.count()) continue
    const label = (await btn.innerText()).trim()
    if (/פתרו/.test(label)) {
      await btn.click({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(600)
      result = await page.locator('.holo-stage').count() ? 'האתגר נפתח' : 'הכפתור לא פתח את האתגר'
      break
    }
    await btn.click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(250)
  }
  const ok = result === 'האתגר נפתח'
  if (!ok) { bad++; await page.screenshot({ path: `reports/stage-j/flicker-${w}x${h}.png` }) }
  console.log(`${ok ? '✓' : '✗'} ${w}x${h}: ${result} (עמוד ${pagesSeen}, מקסימום ${maxFlips} החלפות)`)
  await ctx.close()
}
await browser.close()
process.exit(bad ? 1 : 0)
