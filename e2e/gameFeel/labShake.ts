/* ─────────────────────────────────────────────────
   האם הרקע של מסך הפתיחה זז בשניות הראשונות: מיקום וגודל תמונת הרקע על המסך בכל פריים, מרגע הטעינה.
   הרקע עומד במקום: אין קירוב איטי (קירוב של 1–2 פיקסלים בשנייה נראה כרעד) ואין קפיצות (שינוי גודל, מצלמה שמתחילה מחדש).
   הרצה:  npx tsx e2e/gameFeel/labShake.ts [--ms 9000] [--real <questId>] [--headed]
   ───────────────────────────────────────────────── */
import { chromium } from 'playwright-core'
import { DEFAULT_BASE, findChrome } from '../lib/config.ts'

const args = process.argv.slice(2)
const MS = Number(args[args.indexOf('--ms') + 1] || 9000) || 9000
const QID = '00000000-0000-4000-8000-0000000000af'
const MC = { type: 'multipleChoice', question: 'איזה נהר עובר במצרים?', difficulty: 1, choices: [{ id: 'r', text: 'הנילוס', isCorrect: true }, { id: 'w', text: 'הירדן', isCorrect: false }], explanationCorrect: 'נכון', explanationIncorrect: 'לא' }
const quest = {
  id: QID, title: 'מסע אל הנילוס', art_style: 'digital-painting',
  game_data: {
    entrySceneId: 'lab', readingScale: 10,
    scenes: [
      { id: 'lab', title: 'המעבדה', narrative: 'ד״ר הולו פותח את הפורטל. הנהר מחכה לכם.', nextSceneId: 's1' },
      { id: 's1', title: 'שפת הנהר', narrative: 'הנהר זורם.', imageUrl: '/lab/library-closed.webp', imagePrompt: 'x', puzzle: MC, nextSceneId: null },
    ],
    endingGood: { title: 'סוף', narrative: 'סוף.' }, endingBad: { title: 'פתוח', narrative: 'פתוח.' },
  },
}

const browser = await chromium.launch({ executablePath: findChrome(), headless: !args.includes('--headed') })
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'he-IL' })
await ctx.addInitScript(`(() => {
  if (!window.__name) window.__name = (f) => f
  try { sessionStorage.setItem('holo_splash_seen','1'); sessionStorage.setItem('holo_token','e2e-fake-token') } catch (e) {}
  window.__shake = []
  const t0 = performance.now()
  const step = (now) => {
    const img = document.querySelector('.lab-camera > img')
    const stage = document.querySelector('[data-lab-stage]')
    if (img && stage) {
      const r = img.getBoundingClientRect(), s = stage.getBoundingClientRect()
      const world = document.querySelector('.lab-world')
      window.__shake.push({ t: Math.round(now - t0), x: +r.left.toFixed(2), y: +r.top.toFixed(2), w: +r.width.toFixed(2), sw: Math.round(s.width), sh: Math.round(s.height), world: world && world.style.transform, cam: getComputedStyle(document.querySelector('.lab-camera')).transform, video: !!document.querySelector('[data-lab-video][data-playing]'), level: window.__holoFx && window.__holoFx.level() })
    }
    requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
})()`)
const page = await ctx.newPage()
/* --real <id>: שיעור אמיתי מהשרת המקומי (כמבקר, בלי כתיבה), עם הטעינה האמיתית של התמונות והגופנים */
const real = args.includes('--real') ? args[args.indexOf('--real') + 1] : null
if (!real) {
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.route(`**/api/quests/${QID}`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quest }) }))
  await page.route('**/api/sessions/start', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionId: 's', resumed: false, currentSceneId: null, inventory: [], visitedScenes: [], crystals: 0, effectsLevel: 'medium' }) }))
}
await page.goto(`${DEFAULT_BASE}/play/${real ?? QID}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.waitForTimeout(MS)
const rows = await page.evaluate(() => (window as unknown as { __shake: Record<string, unknown>[] }).__shake)
let prev: Record<string, unknown> | null = null
for (const r of rows) {
  const changed = !prev || r.sw !== prev.sw || r.sh !== prev.sh || r.world !== prev.world || r.video !== prev.video || r.level !== prev.level
  const jump = prev ? Math.hypot((r.x as number) - (prev.x as number), (r.y as number) - (prev.y as number)) + Math.abs((r.w as number) - (prev.w as number)) : 0
  if (changed || jump > 0.6) console.log(JSON.stringify(r), jump ? `קפיצה ${jump.toFixed(2)}` : '')
  prev = r
}
console.log('פריימים', rows.length, 'אחרון', JSON.stringify(rows[rows.length - 1]))
const first = rows[0]
const drift = Math.max(...rows.map((r) => Math.hypot((r.x as number) - (first.x as number), (r.y as number) - (first.y as number)) + Math.abs((r.w as number) - (first.w as number))))
const ok = rows.length > 100 && drift < 0.05
console.log(`${ok ? '✓' : '✗'} הרקע עומד במקום לאורך ${Math.round(MS / 1000)} שניות (תזוזה מרבית ${drift.toFixed(2)} פיקסלים)`)
process.exitCode = ok ? 0 : 1
await browser.close()
