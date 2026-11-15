/* דפדוף בין עמודים: הכפתור של העמוד החדש מופיע פעם אחת ולא מהבהב, והטקסט החדש מוצג תוך כ-250ms.
   הנגן האמיתי עם /api מדומה. הרצה:  npx tsx e2e/gameFeel/pageTurnFlicker.ts */
import { chromium } from 'playwright-core'
import { DEFAULT_BASE, findChrome } from '../lib/config.ts'

const QID = '00000000-0000-4000-8000-0000000000bd'
const svg = (a: string) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768"><rect width="1024" height="768" fill="${a}"/></svg>`)}`
const TEXT = ['הנהר זורם בשקט בין השדות. על הגדה עומדת סירה קטנה, ובתוכה מפה ישנה.', 'השביל מתפתל בין עצי הזית אל ראש הגבעה. שם מסתתר שער עץ כבד.', 'בתוך החצר עומדת באר עמוקה, ולידה דלי חלוד.', 'מעבר לבאר נפתח שדה רחב, ובקצהו המעיין.']
const scenes = [0, 1, 2, 3, 4].map((i) => ({ id: `s${i}`, title: `עמוד ${i + 1}`, narrative: TEXT[i % TEXT.length], drHoloDialog: 'מה רואים כאן?', imageUrl: svg(['#7fb7d9', '#e9d8a6', '#cdb4db', '#94d2bd', '#ffd6a5'][i]), imagePrompt: 'x', nextSceneId: i < 4 ? `s${i + 1}` : null }))
const quest = { id: QID, title: 'בדיקת דפדוף', game_data: { scenes, entrySceneId: 's0', readingScale: 10 } }

let failed = 0
const check = (ok: boolean, label: string) => { console.log(`  ${ok ? '✓' : '✗'} ${label}`); if (!ok) failed++ }

const browser = await chromium.launch({ executablePath: findChrome(), headless: true })
for (const level of ['medium', 'gentle'] as const) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, locale: 'he-IL' })
  await ctx.addInitScript(`(() => { if (!window.__name) window.__name = (f) => f; try { sessionStorage.setItem('holo_splash_seen','1') } catch (e) {} })()`)
  const page = await ctx.newPage()
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.route(`**/api/quests/${QID}`, (r) => r.fulfill({ json: { quest } }))
  await page.goto(`${DEFAULT_BASE}/play/${QID}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.holo-text-area', { timeout: 30000 })
  await page.waitForTimeout(2500)
  await page.evaluate((l) => (window as unknown as { __holoFx?: { setLevel?: (x: string) => void } }).__holoFx?.setLevel?.(l), level)
  const cont = () => page.locator('.holo-panel-actions button:visible', { hasText: /המשך/ }).last()
  await cont().click({ timeout: 15000 })
  await page.waitForTimeout(3500)
  for (let turn = 0; turn < 2; turn++) {
    await cont().waitFor({ timeout: 15000 })
    /* רושמים כל הופעה והיעלמות של כפתור באזור הפעולות, וכל שינוי של הטקסט, מרגע הלחיצה */
    await page.evaluate(() => {
      const w = window as unknown as { __log: string[]; __t0: number; __obs?: MutationObserver }
      w.__log = []
      w.__t0 = performance.now()
      w.__obs?.disconnect()
      let had = false
      let text = ''
      const tick = () => {
        const btn = [...document.querySelectorAll('.holo-panel-actions button')].some((b) => (b as HTMLElement).offsetParent !== null)
        const p = document.querySelector('.holo-text-area [data-page-in] p') as HTMLElement | null
        const now = Math.round(performance.now() - w.__t0)
        if (btn !== had) { had = btn; w.__log.push(`${now} button ${btn ? 'in' : 'out'}`) }
        const tx = p?.innerText ?? ''
        if (tx !== text) { text = tx; w.__log.push(`${now} text ${tx ? 'in' : 'out'}`) }
      }
      tick()
      w.__obs = new MutationObserver(tick)
      w.__obs.observe(document.body, { childList: true, subtree: true, characterData: true })
    })
    await cont().click()
    await page.waitForTimeout(2200)
    const log = await page.evaluate(() => (window as unknown as { __log: string[] }).__log)
    console.log(`  [${level}, דפדוף ${turn + 1}] ${log.join(' · ')}`)
    const buttonIns = log.filter((l) => l.endsWith('button in')).length
    const textIn = log.filter((l) => l.endsWith('text in')).map((l) => Number(l.split(' ')[0])).pop() ?? 9999
    check(buttonIns === 2, `${level}, דפדוף ${turn + 1}: הכפתור של העמוד החדש מופיע פעם אחת (${buttonIns - 1})`)
    check(textIn <= 320, `${level}, דפדוף ${turn + 1}: הטקסט החדש נכנס אחרי ${textIn}ms`)
  }
  await ctx.close()
}
await browser.close()
console.log(failed ? `\n✗ ${failed} כשלים` : '\n✓ הכול עבר')
process.exit(failed ? 1 : 0)
