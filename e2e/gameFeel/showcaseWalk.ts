/* מעבר מלא, בלחיצות עכבר אמיתיות, על כל שיעורי ההתנסות מהשרת המקומי (כמו מבקר): מהמעבדה עד מסך הסיכום.
   אם אין התקדמות — נשמר צילום והשלב מדווח. בלי כתיבה ל-DB (/api/funnel נחסם).
   הרצה: npx tsx e2e/gameFeel/showcaseWalk.ts --out <dir> [--width 1366 --height 768] [--only <questId>] */
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium, type Page } from 'playwright-core'
import { findChrome } from '../lib/config.js'

const args = process.argv.slice(2)
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d }
const OUT = opt('out', 'reports/stage-j/showcase-walk')
const W = Number(opt('width', '1366'))
const H = Number(opt('height', '768'))
const ONLY = opt('only', '')
mkdirSync(OUT, { recursive: true })

const SKIP = /^(סגירה|יציאה|🔊|🔇|שתפו|עוד|חזרה|שחקו שוב)/

/* הכפתורים שהעכבר באמת מגיע אליהם */
const targets = (page: Page) => page.evaluate(() => [...document.querySelectorAll('button')].flatMap((b) => {
  if (!b.offsetParent || b.disabled) return []
  /* כפתור שמחוץ למסך (לוח פאזל בטלפון): התלמיד גולל אליו */
  if (b.closest('.holo-stage')) b.scrollIntoView({ block: 'nearest' })
  const r = b.getBoundingClientRect()
  const x = r.x + r.width / 2
  const y = r.y + r.height / 2
  const hit = document.elementFromPoint(x, y)
  if (!hit || !(b === hit || b.contains(hit))) return []
  return [{ text: (b.innerText || b.getAttribute('aria-label') || '').trim().slice(0, 30), x, y, panel: !!b.closest('.holo-side-panel') }]
}))

const stateOf = (page: Page) => page.evaluate(() => JSON.stringify({
  title: document.querySelector('h1,h2')?.textContent?.slice(0, 40),
  text: document.querySelector('.holo-text-area')?.textContent?.slice(0, 60),
  modal: document.querySelector('[role=dialog]')?.textContent?.slice(0, 80) ?? document.querySelector('.holo-puzzle, [data-puzzle]')?.textContent?.slice(0, 80),
  disabled: document.querySelectorAll('button:disabled').length,
}))

const browser = await chromium.launch({ executablePath: findChrome(), headless: true })
const ctx = await browser.newContext({ viewport: { width: W, height: H } })
/* --ids a,b: טיוטות שעוד לא במדף (למשל שיעורי הדגמה לפני השיתוף) */
const IDS = opt('ids', '')
const list = IDS ? { quests: IDS.split(',').map((id) => ({ id, title: id })) } : await (await ctx.request.get('http://localhost:3001/api/quests/showcase')).json() as { quests: { id: string; title: string }[] }
const quests = list.quests.filter((q) => !ONLY || q.id === ONLY)
console.log(`${quests.length} שיעורים, ${W}x${H}`)
const report: { title: string; result: string; steps: number; trail: string[] }[] = []

for (const q of quests) {
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)))
  await page.route('**/api/funnel', (r) => r.fulfill({ status: 200, body: '{}' }))
  await page.addInitScript(() => { try { sessionStorage.setItem('holo_splash_seen', '1') } catch { /* */ } })
  await page.goto(`http://localhost:5173/play/${q.id}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  const trail: string[] = []
  let result = 'לא הסתיים'
  let stuck = 0
  let last = ''
  let step = 0
  for (; step < 160; step++) {
    if (await page.locator('[data-end-screen]').count()) { result = 'הגיע לסיכום'; break }
    const t = (await targets(page)).filter((b) => b.text && !SKIP.test(b.text))
    const state = await stateOf(page) + t.map((b) => b.text).join('|')
    stuck = state === last ? stuck + 1 : 0
    last = state
    if (stuck >= 6 || (!t.length && stuck >= 3)) {
      result = `נתקע: ${state}`
      await page.screenshot({ path: path.join(OUT, `stuck-${q.id}.png`) })
      break
    }
    if (!t.length) { await page.waitForTimeout(1200); continue }
    /* עדיפות: מעבר קדימה, ויתור, ואז האפשרות הראשונה (תשובה) */
    const stage = t.filter((b) => !b.panel)
    const pool = stage.length ? stage : t
    const pick = pool.find((b) => /המשך|פתרו את האתגר|איסוף|קחו/.test(b.text)) ?? pool.find((b) => /ויתור/.test(b.text)) ?? pool[stuck % pool.length]
    trail.push(pick.text)
    await page.mouse.click(pick.x, pick.y)
    await page.waitForTimeout(1300)
  }
  if (errors.length) result += ` · שגיאות: ${errors.join(' ; ')}`
  console.log(`${result.startsWith('הגיע') ? '✓' : '✗'} ${q.title}: ${result} (${step} צעדים)`)
  report.push({ title: q.title, result, steps: step, trail: trail.slice(-12) })
  if (!result.startsWith('הגיע')) console.log('   אחרונים:', trail.slice(-8).join(' → '))
  await page.close()
}
await browser.close()
const bad = report.filter((r) => !r.result.startsWith('הגיע')).length
console.log(bad ? `✗ ${bad} מתוך ${report.length} לא הגיעו לסיכום` : `✓ כל ${report.length} השיעורים הגיעו לסיכום`)
process.exit(bad ? 1 : 0)
