/* ──────────────────────────────────────────────────────────────────────────
   lab — מעבדת מדידה לאורך טקסט בסצנה (כלל "אורך טקסט לתלמיד").
   פותחת את הנגן האמיתי (/play/:id) מול ה-Vite הרץ, עם תשובת API מדומה (page.route) שמחזירה
   הדמיה בת סצנה אחת עם הטקסט הנתון — כך מודדים את ה-CSS והגופנים האמיתיים בלי DB ובלי כתיבה.
   reducedMotion=reduce → הטקסט מוצג מיד (בלי הקלדה/מעבר), והמדידה דטרמיניסטית.
   ────────────────────────────────────────────────────────────────────────── */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { findChrome, DEFAULT_BASE } from '../lib/config.ts'

export interface RefScreen { key: string; label: string; width: number; height: number }

/* מסכי הייחוס. הראשי: מחשב נייד בית ספרי 1366×768 כולל שורת הדפדפן ← viewport ≈ 1366×620. */
export const REF_SCREENS: RefScreen[] = [
  { key: 'laptop-620', label: 'נייד בית ספרי (viewport 1366×620)', width: 1366, height: 620 },
  { key: 'laptop-768', label: 'נייד, מסך מלא 1366×768', width: 1366, height: 768 },
  { key: 'tablet', label: 'טאבלט 1024×768', width: 1024, height: 768 },
  { key: 'phone-landscape', label: 'טלפון לרוחב 740×360', width: 740, height: 360 },
]

export async function launch(): Promise<Browser> {
  return chromium.launch({ executablePath: findChrome(), headless: true, args: ['--no-first-run', '--no-default-browser-check'] })
}

export async function newCtx(browser: Browser, s: RefScreen, opts: { reducedMotion?: boolean } = {}): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: { width: s.width, height: s.height }, screen: { width: s.width, height: s.height },
    deviceScaleFactor: 1, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', reducedMotion: opts.reducedMotion === false ? 'no-preference' : 'reduce', ignoreHTTPSErrors: true,
  })
  await ctx.addInitScript(`(() => { if (!window.__name) window.__name = (f) => f; try { sessionStorage.setItem('holo_splash_seen','1') } catch (e) {} })()`)
  return ctx
}

export interface LabScene {
  narrative?: string
  drHoloDialog?: string
  title?: string
  textLevel?: number
  puzzle?: unknown
  choices?: { id: string; text: string; nextSceneId: string }[]
}

let seq = 0
/* פותח את הנגן עם סצנה אחת (ועוד סצנת-המשך) ומחזיר את הדף מוכן למדידה */
export async function openLabScene(ctx: BrowserContext, scene: LabScene, settleMs = 2500): Promise<Page> {
  const page = await ctx.newPage()
  const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
  const scenes = [
    { id: 's1', title: scene.title ?? 'סצנת בדיקה', narrative: scene.narrative, drHoloDialog: scene.drHoloDialog, imagePrompt: 'lab', puzzle: scene.puzzle, choices: scene.choices, nextSceneId: scene.choices ? undefined : 's2' },
    { id: 's2', title: 'סצנה שנייה', narrative: 'סצנת סיום קצרה.', imagePrompt: 'lab' },
  ]
  const quest = { id, title: 'מעבדת מדידה', game_data: { scenes, entrySceneId: 's1', readingScale: scene.textLevel ?? 6 } }
  await page.route(`**/api/quests/${id}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quest }) }))
  await page.route('**/api/sessions/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"x"}' }))
  await page.route('**/api/funnel/**', (route) => route.fulfill({ status: 204, body: '' }))
  await page.goto(`${DEFAULT_BASE}/play/${id}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.holo-side-panel', { timeout: 20000 })
  await page.waitForTimeout(settleMs)
  return page
}

/* מדידת הגיאומטריה של תיבת הטקסט כפי שהיא כרגע */
export async function measureBox(page: Page) {
  return page.evaluate(() => {
    const q = (s: string) => document.querySelector<HTMLElement>(s)
    const r = (el: Element | null) => {
      if (!el) return null
      const b = el.getBoundingClientRect()
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 }
    }
    const panel = q('.holo-side-panel')
    const area = q('.holo-text-area')
    const p = document.querySelector<HTMLElement>('.holo-text-area p.text-lg:not([aria-hidden])')
    const ghost = document.querySelector<HTMLElement>('.holo-text-area p.text-lg[aria-hidden]')
    const actions = q('.holo-panel-actions')
    const cs = p ? getComputedStyle(p) : null
    const acs = area ? getComputedStyle(area) : null
    const html = getComputedStyle(document.documentElement)
    const line = cs ? parseFloat(cs.lineHeight) : null
    const indicator = q('[data-page-indicator]')?.textContent ?? null
    return {
      rootFontPx: parseFloat(html.fontSize),
      panel: r(panel), area: r(area), actions: r(actions), band: r(q('.holo-scene-band')), image: r(q('.holo-image-page')),
      areaClient: area ? { clientH: area.clientHeight, scrollH: area.scrollHeight, clientW: area.clientWidth } : null,
      areaPad: acs ? { x: parseFloat(acs.paddingLeft) + parseFloat(acs.paddingRight), y: parseFloat(acs.paddingTop) + parseFloat(acs.paddingBottom) } : null,
      textBox: r(p), ghostBox: r(ghost),
      textLines: p && line ? Math.round(p.getBoundingClientRect().height / line) : null,
      fontPx: cs ? parseFloat(cs.fontSize) : null,
      linePx: line,
      fontFamily: cs?.fontFamily ?? null,
      pageIndicator: indicator,
      hasNextPage: !!q('[data-next-page]'),
      text: p?.textContent ?? '',
      viewport: { w: window.innerWidth, h: window.innerHeight },
    }
  })
}
