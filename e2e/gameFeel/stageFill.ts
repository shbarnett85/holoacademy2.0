/* ─────────────────────────────────────────────────
   פאזל ומשחק הזיכרון ממלאים כמעט את כל חלון התמונה: כמה מהשטח תופס הלוח, והאם האתגר כולו נכנס בלי גלילה.
   עמוד שיעור רגיל (לא מסך הפתיחה), בנגן האמיתי עם /api מדומה.
   הרצה:  npx tsx e2e/gameFeel/stageFill.ts [--out <dir>]
   ───────────────────────────────────────────────── */
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { DEFAULT_BASE, findChrome } from '../lib/config.ts'

const args = process.argv.slice(2)
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'e2e/out/stage-fill'
mkdirSync(OUT, { recursive: true })
const QID = '00000000-0000-4000-8000-0000000000c1'
const IMG = '/lab/library-closed.webp'
const PUZZLES: Record<string, Record<string, unknown>> = {
  tileSwap: { type: 'tileSwap', question: 'השלימו את התמונה', difficulty: 3, gridSize: 3 },
  memory4: { type: 'memory', question: 'התאימו', difficulty: 3, pairs: [{ a: 'מצרים', b: 'נילוס' }, { a: 'עיראק', b: 'פרת' }] },
  memory12: { type: 'memory', question: 'התאימו', difficulty: 10, pairs: [{ a: 'מצרים', b: 'נילוס' }, { a: 'עיראק', b: 'פרת וחידקל' }, { a: 'צרפת', b: 'סן' }, { a: 'אנגלייה', b: 'תמזה' }, { a: 'ברזיל', b: 'אמזונס' }, { a: 'הודו', b: 'גנגס' }] },
}
let failed = 0
const check = (ok: boolean, label: string) => { console.log(`  ${ok ? '✓' : '✗'} ${label}`); if (!ok) failed++ }

const browser = await chromium.launch({ executablePath: findChrome(), headless: true })
for (const [w, h] of [[1366, 768], [1366, 620], [1920, 1080], [740, 360]]) {
  console.log(`מסך ${w}×${h}`)
  for (const [name, puzzle] of Object.entries(PUZZLES)) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'he-IL' })
    await ctx.addInitScript(`(() => { if (!window.__name) window.__name = (f) => f; try { sessionStorage.setItem('holo_splash_seen','1'); sessionStorage.setItem('holo_token','e2e-fake-token') } catch (e) {} })()`)
    const page = await ctx.newPage()
    const quest = { id: QID, title: 'מילוי', game_data: { entrySceneId: 's0', readingScale: 10, scenes: [
      { id: 's0', title: 'פתיחה', narrative: 'יוצאים לדרך.', nextSceneId: 's1' },
      { id: 's1', title: 'ראשונה', narrative: 'הנהר זורם.', imageUrl: IMG, imagePrompt: 'x', puzzle, nextSceneId: 's2' },
      { id: 's2', title: 'שנייה', narrative: 'הסוף.', imageUrl: IMG, imagePrompt: 'x', nextSceneId: null },
    ] } }
    await page.route('**/api/**', (r) => r.fulfill({ json: {} }))
    await page.route(`**/api/quests/${QID}`, (r) => r.fulfill({ json: { quest } }))
    await page.route('**/api/sessions/start', (r) => r.fulfill({ json: { sessionId: 's', resumed: false, currentSceneId: null, inventory: [], visitedScenes: [], crystals: 0, effectsLevel: 'gentle' } }))
    await page.goto(`${DEFAULT_BASE}/play/${QID}`, { waitUntil: 'domcontentloaded' })
    await page.locator('.holo-panel-actions button').first().click({ timeout: 40000 })
    await page.getByRole('button', { name: /פתרו את האתגר/ }).click({ timeout: 20000 })
    await page.waitForSelector('.holo-stage', { timeout: 10000 })
    await page.waitForTimeout(1600)
    const m = await page.evaluate(() => {
      const area = document.querySelector('.holo-image-page')!.getBoundingClientRect()
      const panel = document.querySelector<HTMLElement>('[data-puzzle-panel]')!
      const board = (document.querySelector('.tileswap-grid') ?? document.querySelector('.mem-card')?.parentElement)!.getBoundingClientRect()
      const p = panel.getBoundingClientRect()
      return { area: [Math.round(area.width), Math.round(area.height)], board: [Math.round(board.width), Math.round(board.height)], hFill: board.height / area.height, wFill: board.width / area.width,
        scroll: panel.scrollHeight - panel.clientHeight, inside: p.top >= area.top - 1 && p.bottom <= area.bottom + 1 && p.left >= area.left - 1 && p.right <= area.right + 1 }
    })
    console.log(`  · ${name}: חלון ${m.area.join('×')}, לוח ${m.board.join('×')} (גובה ${(m.hFill * 100).toFixed(0)}%, רוחב ${(m.wFill * 100).toFixed(0)}%)`)
    check(m.scroll <= 1 && m.inside, `${name}: האתגר כולו בתוך חלון התמונה, בלי גלילה (גלילה ${m.scroll})`)
    /* הלוח בכל הגובה (לפחות 70%), ולצידו עמודת הבקרה */
    check(m.hFill >= 0.7 && m.wFill >= 0.4, `${name}: הלוח ממלא את רוב חלון התמונה`)
    await page.screenshot({ path: path.join(OUT, `${name}-${w}x${h}.png`) })
    await ctx.close()
  }
}
await browser.close()
console.log(failed ? `\n✗ ${failed} נכשלו` : '\n✓ הכול עבר')
process.exitCode = failed ? 1 : 0
