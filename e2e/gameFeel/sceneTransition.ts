/* ───────────────────────────────────────────────────────────
   מעבר בין תמונות סצנה: צילום פריים-פריים (CDP screencast) על הנגן האמיתי, עם /api מדומה ותמונות אמיתיות מהספרייה.
   מפיק לוח פריימים + דוח: שחור באמצע, קפיצת תמונה בתחילה/בסוף, משך, FPS בהאטה פי 4.
   הרצה:  npx tsx e2e/gameFeel/sceneTransition.ts --out <dir> [--tag before] [--level medium] [--source <questId>]
   ─────────────────────────────────────────────────────────── */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium, type Page } from 'playwright-core'
import { DEFAULT_BASE, findChrome } from '../lib/config.ts'

const args = process.argv.slice(2)
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d }
const OUT = opt('out', 'e2e/out/scene-transition')
const TAG = opt('tag', 'run')
const LEVEL = opt('level', 'medium')
const SOURCE = opt('source', '8c4f9c3c-0573-4136-86f3-e485efb8cbe0')
const WIDTH = Number(opt('w', '1366'))
const HEIGHT = Number(opt('h', '768'))
const QID = '00000000-0000-4000-8000-0000000000cc'
mkdirSync(OUT, { recursive: true })

interface Frame { t: number; data: string }

async function imageUrls(): Promise<string[]> {
  const res = await fetch(`${DEFAULT_BASE}/api/quests/${SOURCE}`)
  const body = await res.json() as { quest: { game_data: { scenes: { imageUrl?: string }[] } } }
  return body.quest.game_data.scenes.map((s) => s.imageUrl).filter((u): u is string => !!u)
}

const buildQuest = (urls: string[]) => ({
  id: QID, title: 'מעבר בין תמונות',
  game_data: {
    entrySceneId: 's1', readingScale: 10,
    scenes: urls.slice(0, 4).map((imageUrl, i, all) => ({
      id: `s${i + 1}`, title: `סצנה ${i + 1}`, narrative: `זו סצנה מספר ${i + 1}. הנהר זורם בשקט בין השדות.`, imageUrl, imagePrompt: 'x',
      nextSceneId: i < all.length - 1 ? `s${i + 2}` : null,
    })),
  },
})

/* גוזרים מכל פריים תקציר קטן בדפדפן: בהירות ממוצעת של אזור התמונה */
async function brightness(page: Page, frames: Frame[], box: { x: number; y: number; width: number; height: number }): Promise<number[]> {
  return page.evaluate(async ({ frames, box }) => {
    const out: number[] = []
    const cv = document.createElement('canvas')
    cv.width = 64; cv.height = 40
    const c = cv.getContext('2d', { willReadFrequently: true })!
    for (const f of frames) {
      const img = new Image()
      img.src = `data:image/jpeg;base64,${f.data}`
      await img.decode()
      const k = img.naturalWidth / innerWidth
      c.drawImage(img, box.x * k, box.y * k, box.width * k, box.height * k, 0, 0, 64, 40)
      const d = c.getImageData(0, 0, 64, 40).data
      let sum = 0
      for (let i = 0; i < d.length; i += 4) sum += d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722
      out.push(Math.round(sum / (d.length / 4)))
    }
    return out
  }, { frames: frames.map((f) => ({ data: f.data })), box })
}

async function main(): Promise<void> {
  const urls = await imageUrls()
  const browser = await chromium.launch({ executablePath: findChrome(), headless: true })
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, screen: { width: WIDTH, height: HEIGHT }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
  await ctx.addInitScript(`(() => { if (!window.__name) window.__name = (f) => f; try { sessionStorage.setItem('holo_splash_seen','1'); sessionStorage.setItem('holo_token','e2e-fake-token') } catch (e) {} })()`)
  const page = await ctx.newPage()
  const quest = buildQuest(urls)
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.route(`**/api/quests/${QID}`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quest }) }))
  await page.route('**/api/sessions/start', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionId: 'sess-1', resumed: false, currentSceneId: null, inventory: [], visitedScenes: [], crystals: 0, effectsLevel: LEVEL, isReplay: false }) }))
  await page.goto(`${DEFAULT_BASE}/play/${QID}`, { waitUntil: 'domcontentloaded' })
  const advance = page.locator('button.holo-button:visible', { hasText: /המשך|סיום/ }).first()
  await advance.waitFor({ timeout: 40000 })
  /* נותנים לזום האיטי לזוז, כדי שקפיצה בתחילת המעבר תיראה אם היא קיימת */
  await page.waitForTimeout(6000)
  const box = (await page.locator('.holo-image-page').boundingBox())!

  const cdp = await ctx.newCDPSession(page)
  const frames: Frame[] = []
  cdp.on('Page.screencastFrame', (f: { data: string; sessionId: number; metadata: { timestamp: number } }) => {
    frames.push({ t: f.metadata.timestamp * 1000, data: f.data })
    void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1 })
  await page.waitForTimeout(250)
  const clickAt = Date.now()
  await advance.click()
  await page.locator('.holo-text-area .holo-panel').first().waitFor({ timeout: 8000 })
  const panelMs = Date.now() - clickAt
  await page.waitForTimeout(700)
  await cdp.send('Page.stopScreencast')

  const lum = await brightness(page, frames, box)
  const t0 = frames[0]?.t ?? 0
  const rows = frames.map((f, i) => ({ i, ms: Math.round(f.t - t0), lum: lum[i] }))
  const before = lum[0]
  const after = lum[lum.length - 1]
  const darkest = Math.min(...lum)
  const dipFrames = rows.filter((r) => r.lum < Math.min(before, after) * 0.55)

  /* FPS בהאטה פי 4 בזמן המעבר הבא */
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  const next = page.locator('button.holo-button:visible', { hasText: /המשך|סיום/ }).first()
  await next.waitFor({ timeout: 20000 })
  await page.evaluate(() => {
    const w = window as unknown as { __ft: number[] }
    w.__ft = []
    const step = (n: number) => { w.__ft.push(n); if (w.__ft.length < 240) requestAnimationFrame(step) }
    requestAnimationFrame(step)
  })
  await next.click()
  await page.waitForTimeout(1600)
  const ft = await page.evaluate(() => (window as unknown as { __ft: number[] }).__ft)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  const gaps = ft.slice(1).map((t, i) => t - ft[i])
  const fps = gaps.length ? Math.round((gaps.length * 1000) / gaps.reduce((a, b) => a + b, 0)) : 0
  const worst = gaps.length ? Math.round(Math.max(...gaps)) : 0

  /* לוח פריימים: דוגמים עד 24 פריימים לאורך המעבר */
  const startIdx = Math.max(0, rows.findIndex((r) => Math.abs(r.lum - before) > 2) - 1)
  const span = frames.slice(startIdx)
  const stepN = Math.max(1, Math.floor(span.length / 24))
  const sampled = span.filter((_, i) => i % stepN === 0).slice(0, 24)
  const sheet = await ctx.newPage()
  await sheet.setViewportSize({ width: 1500, height: 900 })
  await sheet.setContent(`<body style="margin:0;background:#111;color:#fff;font:13px sans-serif;display:grid;grid-template-columns:repeat(6,1fr);gap:4px;padding:4px">${sampled.map((f) => `<figure style="margin:0;position:relative"><img style="width:100%;display:block" src="data:image/jpeg;base64,${f.data}"><figcaption style="position:absolute;top:2px;left:4px;background:#000a;padding:0 4px">${Math.round(f.t - sampled[0].t)}ms</figcaption></figure>`).join('')}</body>`)
  await sheet.waitForTimeout(300)
  await sheet.screenshot({ path: path.join(OUT, `${TAG}-frames.png`), fullPage: true })

  /* פריים אחד בגודל מלא מאמצע המעבר, לבדיקת הקו והחשיפה */
  const mid = span[Math.min(span.length - 1, Math.round(250 / Math.max(1, (span[1]?.t ?? 0) - (span[0]?.t ?? 0))))]
  if (mid) writeFileSync(path.join(OUT, `${TAG}-mid.jpg`), Buffer.from(mid.data, 'base64'))

  const report = { tag: TAG, level: LEVEL, frames: frames.length, panelMs, luminance: { before, after, darkest }, blackoutFrames: dipFrames.length, throttled4x: { fps, worstFrameMs: worst }, rows }
  writeFileSync(path.join(OUT, `${TAG}.json`), JSON.stringify(report, null, 1))
  console.log(JSON.stringify({ ...report, rows: undefined }))
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
