/* ─────────────────────────────────────────────────
   ריחוף מעל כפתור מתבטא ויזואלית (הכפתור מתרומם והצל הקשיח גדל), ובלי צליל.
   בודק בעמוד הבית: כפתור רגיל, קישור בדיו, ולחיצה שגוברת על הריחוף.
   הרצה:  npx tsx e2e/redesign/hoverLift.ts [--out <dir>]
   ───────────────────────────────────────────────── */
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { DEFAULT_BASE, findChrome } from '../lib/config.ts'

const outIdx = process.argv.indexOf('--out')
const out = outIdx > 0 ? process.argv[outIdx + 1] : null
if (out) mkdirSync(out, { recursive: true })

let failed = 0
const check = (ok: boolean, label: string) => { console.log(`  ${ok ? '✓' : '✗'} ${label}`); if (!ok) failed++ }

const browser = await chromium.launch({ executablePath: findChrome(), headless: true })
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'he-IL' })
await ctx.addInitScript(`(() => {
  if (!window.__name) window.__name = (f) => f
  try { sessionStorage.setItem('holo_splash_seen', '1') } catch (e) {}
  /* סופרים כל מקור צליל שנוצר: ריחוף לא אמור ליצור אף אחד */
  window.__sounds = 0
  const AC = window.AudioContext || window.webkitAudioContext
  if (AC) for (const k of ['createOscillator', 'createBufferSource']) { const o = AC.prototype[k]; AC.prototype[k] = function (...a) { window.__sounds++; return o.apply(this, a) } }
})()`)
const page = await ctx.newPage()
await page.goto(`${DEFAULT_BASE}/staff/login`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.holo-button', { timeout: 30000 })
await page.waitForTimeout(800)

const btn = page.locator('.holo-button:not(:disabled):not(.holo-button--sm)').first()
const style = () => btn.evaluate((e) => { const c = getComputedStyle(e); return { transform: c.transform, shadow: c.boxShadow } })
await page.mouse.move(5, 5)
await page.waitForTimeout(200)
const rest = await style()
/* לחיצה אחת בצד, כדי שהקונטקסט של השמע ייפתח (אחרת שום צליל לא היה מתנגן בכל מקרה) */
await page.mouse.click(5, 5)
await page.waitForTimeout(500) /* הפתיחה מנגנת buffer שקט אחד, אחרי שהקונטקסט מתעורר */
const before = await page.evaluate(() => (window as unknown as { __sounds: number }).__sounds)
await btn.hover()
await page.waitForTimeout(300)
const hover = await style()
const after = await page.evaluate(() => (window as unknown as { __sounds: number }).__sounds)
console.log('כפתור')
check(rest.transform === 'none', `במנוחה: בלי הזזה (${rest.transform})`)
check(/matrix\(1, 0, 0, 1, -2, -2\)/.test(hover.transform), `בריחוף: מתרומם 2px (${hover.transform})`)
check(/5px 5px 0px/.test(hover.shadow) && !/5px 5px 0px/.test(rest.shadow), `בריחוף: הצל גדל (${rest.shadow} → ${hover.shadow})`)
check(after === before, `בריחוף: בלי צליל (${after - before} מקורות צליל)`)
if (out) await page.screenshot({ path: `${out}/hover.png`, clip: await btn.boundingBox().then((b) => ({ x: b!.x - 24, y: b!.y - 24, width: b!.width + 48, height: b!.height + 48 })) })

await page.mouse.down()
await page.waitForTimeout(200)
const pressed = await style()
const afterPress = await page.evaluate(() => (window as unknown as { __sounds: number }).__sounds)
await page.mouse.move(5, 5)
await page.mouse.up()
check(/matrix\(1, 0, 0, 1, 3, 3\)/.test(pressed.transform), `בלחיצה: נלחץ פנימה, הריחוף לא גובר (${pressed.transform})`)
check(afterPress > after, `בלחיצה: צליל לחיצה (${afterPress - after} מקורות צליל)`)

await browser.close()
console.log(failed ? `\n${failed} נכשלו` : '\nהכול עבר')
process.exit(failed ? 1 : 0)
