/* ─────────────────────────────────────────────────
   ביצועי המעבר למסך הסיום ("סוף הפרק", סיפור שנסגר): מהלחיצה האחרונה ועד שהמסך נרגע.
   משחקים שיעור קצר עד האתגר האחרון, מאטים את המעבד (פי 1 / 4 / 6), ואז לוחצים על הכפתור שמסיים.
   נמדדים: כל פריים (requestAnimationFrame), משימות ארוכות (longtask), ומעקב ביצועים של Chrome (trace), שממנו מסוכם
   על מה הלך הזמן של ה-main thread בכל חלון של 250ms.
   הנגן האמיתי עם /api מדומה (בלי כתיבה ל-DB); אותו שיעור כמו labJourney.
   הרצה:  npx tsx e2e/gameFeel/endPerf.ts [--rates 1,4,6] [--state closed|radiant] [--level medium|full] [--out <dir>]
   ───────────────────────────────────────────────── */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium, type Browser, type Page } from 'playwright-core'
import { DEFAULT_BASE, findChrome } from '../lib/config.ts'

const args = process.argv.slice(2)
const opt = (name: string, def: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def }
const OUT = opt('out', 'reports/end-perf')
const RATES = opt('rates', '1,4,6').split(',').map(Number)
const STATE = opt('state', 'closed') as 'closed' | 'radiant'
const LEVEL = opt('level', 'medium')
const WINDOW_MS = 5000
mkdirSync(OUT, { recursive: true })

const QID = '00000000-0000-4000-8000-0000000000ae'
const STORE = 'https://icgwmjjgnlozuyanqipw.supabase.co/storage/v1/object/public/quest-images/holoacademy/cea7f0c1-5828-4525-b5c4-453bdd2b934e'
const MC = (id: string) => ({ type: 'multipleChoice', question: `שאלה ${id}: איזה נהר עובר במצרים?`, difficulty: 1, choices: [{ id: 'r', text: 'הנילוס', isCorrect: true }, { id: 'w', text: 'הירדן', isCorrect: false }, { id: 'x', text: 'הפרת', isCorrect: false }], explanationCorrect: 'נכון.', explanationIncorrect: 'התשובה הנכונה היא הנילוס.' })
const LESSON = {
  id: QID, title: 'מסע אל הנילוס', art_style: 'digital-painting',
  game_data: {
    entrySceneId: 'lab', readingScale: 10, holoMoods: { opening: 'neutral', closed: 'celebrating', open: 'sad' },
    scenes: [
      { id: 'lab', title: 'המעבדה', narrative: 'ד״ר הולו פותח את הפורטל. הנהר מחכה לכם.', nextSceneId: 's1' },
      { id: 's1', title: 'שפת הנהר', narrative: 'הנהר זורם בשקט בין השדות.', imageUrl: `${STORE}/ending_bad.png`, imagePrompt: 'x', puzzle: MC('א'), nextSceneId: 's2' },
      { id: 's2', title: 'האתגר האחרון', narrative: 'המים עולים.', imageUrl: `${STORE}/ending_good.png`, imagePrompt: 'x', puzzle: MC('ב'), nextSceneId: null },
    ],
    endingGood: { title: 'הנילוס חזר לזרום', narrative: 'בזכותכם המים חזרו אל השדות.' },
    endingBad: { title: 'הסיפור עוד פתוח', narrative: 'חסרות עוד תובנות.' },
  },
}

async function open(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
  await ctx.addInitScript(`(() => { if (!window.__name) window.__name = (f) => f; try { sessionStorage.setItem('holo_splash_seen','1'); sessionStorage.setItem('holo_token','e2e-fake-token') } catch (e) {} })()`)
  const page = await ctx.newPage()
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.route(`**/api/quests/${QID}`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quest: LESSON }) }))
  await page.route('**/api/sessions/start', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionId: 's', resumed: false, currentSceneId: null, inventory: [], visitedScenes: [], crystals: 0, effectsLevel: LEVEL }) }))
  await page.goto(`${DEFAULT_BASE}/play/${QID}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForSelector('[data-dr-holo]', { timeout: 30000 })
  return page
}

const visibleButton = (page: Page, re: RegExp) => page.locator('button', { hasText: re }).locator('visible=true').first()
async function next(page: Page): Promise<void> {
  await page.waitForTimeout(500)
  const btn = page.locator('.holo-panel-actions button').locator('visible=true').first()
  await btn.waitFor({ timeout: 20000 })
  await btn.click()
}

/* עד הרגע שלפני הלחיצה שמסיימת את השיעור. closed: נכון ואז ניסיון שני (3–4 גבישים), radiant: נכון ונכון (5) */
async function playToLastClick(page: Page): Promise<void> {
  await next(page)
  await page.waitForTimeout(1800)
  const answers = STATE === 'radiant' ? ['right', 'right'] : ['right', 'retry']
  for (let i = 0; i < answers.length; i++) {
    await next(page)
    await page.waitForSelector('.holo-stage button', { timeout: 15000 })
    await page.waitForTimeout(500)
    const stage = page.locator('.holo-stage button')
    if (answers[i] === 'right') await stage.filter({ hasText: 'הנילוס' }).first().click()
    else {
      await stage.filter({ hasText: 'הירדן' }).first().click()
      await page.waitForTimeout(900)
      await stage.filter({ hasText: 'הנילוס' }).first().click()
    }
    await page.waitForTimeout(800)
    if (i < answers.length - 1) {
      await visibleButton(page, /המשך|סיום/).click({ timeout: 8000 })
      await page.waitForTimeout(1200)
    }
  }
  /* הקונפטי של התשובה הנכונה נגמר, והמסך שקט לפני הלחיצה */
  await page.waitForTimeout(2500)
}

interface Profile { nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[] }[]; startTime: number; samples: number[]; timeDeltas: number[] }
interface TraceEvent { name: string; ph: string; ts: number; dur?: number; tid: number; pid: number; args?: { name?: string; data?: { url?: string; functionName?: string } } }

async function measure(browser: Browser, rate: number): Promise<unknown> {
  const page = await open(browser)
  await playToLastClick(page)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate })
  await page.waitForTimeout(800)
  await page.evaluate(() => {
    const w = window as unknown as { __f: number[]; __long: { start: number; dur: number }[]; __stop?: boolean; __t0: number }
    w.__f = []
    w.__long = []
    w.__t0 = 0
    const ww = w as unknown as { __end?: number }
    const wg = w as unknown as { __go?: number }
    new MutationObserver(() => {
      const el = document.querySelector('[data-end-screen]')
      if (ww.__end === undefined && el) ww.__end = performance.now()
      if (wg.__go === undefined && el?.hasAttribute('data-end-go')) wg.__go = performance.now()
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-end-go'] })
    new PerformanceObserver((list) => { for (const e of list.getEntries()) w.__long.push({ start: e.startTime, dur: e.duration }) }).observe({ type: 'longtask', buffered: false })
    const tick = (t: number) => { w.__f.push(t); if (!w.__stop) requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  })
  const events: TraceEvent[] = []
  cdp.on('Tracing.dataCollected', (d: { value: TraceEvent[] }) => { events.push(...d.value) })
  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: 250 })
  await cdp.send('Profiler.start')
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,v8.execute,blink.user_timing', transferMode: 'ReportEvents' })
  await page.evaluate(() => { (window as unknown as { __t0: number }).__t0 = performance.now(); performance.mark('end-click') })
  await visibleButton(page, /המשך|סיום/).click({ timeout: 8000 })
  await page.waitForSelector('[data-end-screen]', { timeout: 20000 })
  const { endAt, goAt } = await page.evaluate(() => { const w = window as unknown as { __t0: number; __end: number; __go?: number }; return { endAt: w.__end - w.__t0, goAt: (w.__go ?? w.__end) - w.__t0 } })
  await page.waitForTimeout(WINDOW_MS)
  const { profile } = await cdp.send('Profiler.stop') as unknown as { profile: Profile }
  const done = new Promise<void>((resolve) => cdp.once('Tracing.tracingComplete', () => resolve()))
  await cdp.send('Tracing.end')
  await done
  const raw = await page.evaluate(() => {
    const w = window as unknown as { __f: number[]; __long: { start: number; dur: number }[]; __stop?: boolean; __t0: number }
    w.__stop = true
    return { frames: w.__f.map((t) => t - w.__t0).filter((t) => t >= 0), long: w.__long.map((l) => ({ start: l.start - w.__t0, dur: l.dur })).filter((l) => l.start >= -50) }
  })
  await page.context().close()

  /* פריימים: קצב בכל חלון של 250ms, והפערים הגדולים */
  const f = raw.frames
  const gaps = f.slice(1).map((t, i) => ({ at: f[i], gap: t - f[i] }))
  const windows: { from: number; fps: number; worst: number }[] = []
  for (let from = 0; from < endAt + WINDOW_MS; from += 250) {
    const inW = gaps.filter((g) => g.at >= from && g.at < from + 250)
    windows.push({ from, fps: inW.length ? Math.round(1000 / (inW.reduce((s, g) => s + g.gap, 0) / inW.length)) : 0, worst: Math.round(Math.max(0, ...inW.map((g) => g.gap))) })
  }
  const jank = gaps.filter((g) => g.gap > 50).map((g) => ({ at: Math.round(g.at), gap: Math.round(g.gap) }))
  /* חלון התנועה: מהרגע שהתנועה מתחילה (הכיסוי יורד והמצלמה נסוגה; בלי שער: הרגע שהמסך הופיע) ועד 1.5 שניות אחריו,
     שהם משך הנסיגה. זה מה שהעין רואה כ"מעבר" */
  const motion = gaps.filter((g) => g.at >= goAt && g.at < goAt + 1500)
  const motionFps = motion.length ? Math.round(1000 / (motion.reduce((a, g) => a + g.gap, 0) / motion.length)) : 0
  const motionWorst = Math.round(Math.max(0, ...motion.map((g) => g.gap)))
  const motionJank = motion.filter((g) => g.gap > 50).length

  /* trace: ה-main thread של הדף (CrRendererMain), זמן לפי שם האירוע, בחלונות של 250ms */
  const mainTid = events.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain')?.tid
  const markTs = events.find((e) => e.name === 'end-click')?.ts
  const byWindow: Record<number, Record<string, number>> = {}
  const total: Record<string, number> = {}
  const scripts: Record<string, number> = {}
  const INTEREST = new Set(['FunctionCall', 'EvaluateScript', 'TimerFire', 'FireAnimationFrame', 'EventDispatch', 'Layout', 'UpdateLayoutTree', 'Paint', 'PrePaint', 'Layerize', 'CompositeLayers', 'Decode Image', 'Decode LazyPixelRef', 'ParseHTML', 'MinorGC', 'MajorGC', 'V8.GC_SCAVENGER', 'GCEvent', 'Commit', 'UpdateLayer', 'RasterTask', 'HitTest', 'ScheduleStyleRecalculation', 'v8.compile', 'v8.compileModule', 'CompileScript', 'Animation', 'IntersectionObserverController::computeIntersections', 'RunMicrotasks', 'v8.callFunction', 'PaintImage', 'Image Decode', 'WebGL'])
  if (mainTid !== undefined && markTs !== undefined) {
    for (const e of events) {
      if (e.tid !== mainTid || e.ph !== 'X' || !e.dur) continue
      const at = (e.ts - markTs) / 1000
      if (at < 0 || at > endAt + WINDOW_MS) continue
      const name = INTEREST.has(e.name) ? e.name : e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask' ? '·task' : null
      if (!name) continue
      const w = Math.floor(at / 250) * 250
      byWindow[w] ??= {}
      byWindow[w][name] = (byWindow[w][name] ?? 0) + e.dur / 1000
      total[name] = (total[name] ?? 0) + e.dur / 1000
      if (e.name === 'FunctionCall' && e.args?.data) {
        const key = `${(e.args.data.url ?? '').split('/').slice(-2).join('/').split('?')[0]} ${e.args.data.functionName ?? ''}`
        scripts[key] = (scripts[key] ?? 0) + e.dur / 1000
      }
    }
  }
  /* פרופיל המעבד: זמן עצמי לפי פונקציה, וזמן כולל (הפונקציה וכל מה שהיא קוראת) לפי קובץ המקור שלנו,
     בחלון שסביב ההחלפה למסך הסיום: מ-450ms לפני ההופעה (ההחלפה עצמה היא משימה אחת ארוכה, וההופעה נרשמת בסופה) ועד 900ms אחריה */
  const selfFn: Record<string, number> = {}
  const inclFile: Record<string, number> = {}
  if (markTs !== undefined) {
    const parent = new Map<number, number>()
    for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
    const node = new Map(profile.nodes.map((n) => [n.id, n]))
    const label = (id: number) => { const c = node.get(id)!.callFrame; const file = c.url.split('/').slice(-2).join('/').split('?')[0]; return `${c.functionName || '(anon)'} ${file}${file ? `:${c.lineNumber + 1}` : ''}` }
    let t = profile.startTime
    const from = Number(process.env.PROFILE_FROM ?? -450) + (process.env.PROFILE_AT === "go" ? goAt : endAt), to = from + Number(process.env.PROFILE_LEN ?? 1350)
    for (let i = 0; i < profile.samples.length; i++) {
      t += profile.timeDeltas[i]
      const at = (t - markTs) / 1000
      const dt = (profile.timeDeltas[i + 1] ?? 250) / 1000
      if (at < from || at > to) continue
      const id = profile.samples[i]
      const name = node.get(id)!.callFrame.functionName
      if (name === '(idle)' || name === '(program)') continue
      selfFn[label(id)] = (selfFn[label(id)] ?? 0) + dt
      const seen = new Set<string>()
      for (let cur: number | undefined = id; cur !== undefined; cur = parent.get(cur)) {
        const url = node.get(cur)!.callFrame.url
        const m = /\/src\/(.+?)(\?|$)/.exec(url)
        if (m && !seen.has(m[1])) { seen.add(m[1]); inclFile[m[1]] = (inclFile[m[1]] ?? 0) + dt }
      }
    }
  }
  const round = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v)]))
  const res = {
    rate, endAt: Math.round(endAt), goAt: Math.round(goAt), motionFps, motionWorst, motionJank, frames: f.length, fpsAll: Math.round((f.length - 1) / ((f[f.length - 1] - f[0]) / 1000)),
    worstGap: Math.round(Math.max(...gaps.map((g) => g.gap))), jank, longTasks: raw.long.map((l) => ({ at: Math.round(l.start), dur: Math.round(l.dur) })),
    windows, mainTotal: round(total), swapSelf: Object.entries(round(selfFn)).slice(0, 30), swapFiles: round(inclFile), topScripts: Object.entries(round(scripts)).slice(0, 25), byWindow: Object.fromEntries(Object.entries(byWindow).map(([k, v]) => [k, round(v)])),
  }
  console.log(`\n== האטה פי ${rate} (${STATE}, ${LEVEL}) ==`)
  console.log(`  התנועה התחילה אחרי ${res.goAt}ms | בזמן הנסיגה (1.5 שניות): ${motionFps} FPS, הפריים האיטי ביותר ${motionWorst}ms, פריימים מעל 50ms: ${motionJank}`)
  console.log(`  מסך הסיום הופיע אחרי ${res.endAt}ms | ${res.fpsAll} FPS בממוצע | הפריים האיטי ביותר ${res.worstGap}ms | פריימים מעל 50ms: ${jank.length}`)
  console.log('  קצב לפי חלון (ms → fps/worst):', windows.slice(0, 26).map((w) => `${w.from}:${w.fps}/${w.worst}`).join(' '))
  console.log('  משימות ארוכות:', res.longTasks.slice(0, 20).map((l) => `${l.at}+${l.dur}`).join(' '))
  console.log('  זמן ה-main thread לפי סוג (ms):', JSON.stringify(res.mainTotal))
  console.log('  סביב ההחלפה, זמן עצמי (ms):', res.swapSelf.slice(0, 18).map(([k, v]) => `${v} ${k}`).join(' | '))
  console.log('  סביב ההחלפה, זמן כולל לפי קובץ (ms):', JSON.stringify(res.swapFiles))
  console.log('  סקריפטים:', res.topScripts.slice(0, 14).map(([k, v]) => `${v}ms ${k}`).join(' | '))
  return res
}

const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
const all: unknown[] = []
try {
  for (const rate of RATES) all.push(await measure(browser, rate))
} finally {
  await browser.close()
}
writeFileSync(path.join(OUT, `end-perf-${STATE}-${LEVEL}.json`), JSON.stringify(all, null, 1))
console.log(`\nנשמר: ${path.join(OUT, `end-perf-${STATE}-${LEVEL}.json`)}`)
