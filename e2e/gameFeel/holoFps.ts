/* ─────────────────────────────────────────────────
   קצב הפריימים במסך הפתיחה של המעבדה, עם האנימציה של ד"ר הולו מעל רקע הווידאו, ובלי כל שכבה בנפרד (כדי לדעת מה עולה).
   ממצא: כשמתנגנים שני סרטונים, Chrome מוריד את קצב הציור של כל העמוד לקצב של הסרטון האיטי יותר (24 או 30 → 30 פריימים בשנייה),
   גם בלי שום אפקט ועם כרטיס מסך חזק. לכן האנימציה של ד"ר הולו מקודדת ב-60 פריימים בשנייה (פריימים כפולים, אותה תנועה).
   הנגן האמיתי עם /api מדומה (בלי כתיבה ל-DB).
   הרצה:  npx tsx e2e/gameFeel/holoFps.ts [--rate 1] [--gpu] [--headed] [--quick] [--names a,b] [--swap <mp4>] [--shot <dir>]
   ───────────────────────────────────────────────── */
import { readFileSync } from 'node:fs'
import { chromium, type Browser } from 'playwright-core'
import { DEFAULT_BASE, findChrome } from '../lib/config.ts'

const args = process.argv.slice(2)
const rate = Number(args[args.indexOf('--rate') + 1] || 1) || 1
const QID = '00000000-0000-4000-8000-0000000000af'
const STORE = 'https://icgwmjjgnlozuyanqipw.supabase.co/storage/v1/object/public/quest-images/holoacademy/cea7f0c1-5828-4525-b5c4-453bdd2b934e'
const MC = { type: 'multipleChoice', question: 'איזה נהר עובר במצרים?', difficulty: 1, choices: [{ id: 'r', text: 'הנילוס', isCorrect: true }, { id: 'w', text: 'הירדן', isCorrect: false }], explanationCorrect: 'נכון', explanationIncorrect: 'לא' }
const quest = {
  id: QID, title: 'מסע אל הנילוס', art_style: 'digital-painting',
  game_data: {
    entrySceneId: 'lab', readingScale: 10,
    scenes: [
      { id: 'lab', title: 'המעבדה', narrative: 'ד״ר הולו פותח את הפורטל. הנהר מחכה לכם.', nextSceneId: 's1' },
      { id: 's1', title: 'שפת הנהר', narrative: 'הנהר זורם.', imageUrl: `${STORE}/ending_bad.png`, imagePrompt: 'x', puzzle: MC, nextSceneId: null },
    ],
    endingGood: { title: 'סוף', narrative: 'סוף.' }, endingBad: { title: 'פתוח', narrative: 'פתוח.' },
  },
}

/* CSS שמכבה שכבה אחת; '' = הכול פועל */
const VARIANTS: [string, string][] = [
  ['הכול', ''],
  ['בלי פס האור', '.dr-holo__band{display:none!important}'],
  ['בלי גליץ\'', '.dr-holo__glitch{display:none!important}'],
  ['בלי קווי סריקה', '.dr-holo__scan{display:none!important}'],
  ['בלי מסכה ומיזוג', '.dr-holo__figure{-webkit-mask-image:none!important;mask-image:none!important;mix-blend-mode:normal!important}'],
  ['בלי פילטר על הווידאו', '.dr-holo__media{filter:none!important}'],
  ['בלי גוון חם', '.dr-holo__warm{display:none!important}'],
  ['בלי שום מיזוג', '.dr-holo,.dr-holo *{mix-blend-mode:normal!important;isolation:auto!important}'],
  ['בלי מיזוג ובלי פילטר', '.dr-holo,.dr-holo *{mix-blend-mode:normal!important;isolation:auto!important}.dr-holo__media{filter:none!important}'],
  ['רק הווידאו', '.dr-holo > :not(.dr-holo__figure),.dr-holo__figure > :not(.dr-holo__layers),.dr-holo__layer > :not(video){display:none!important}.dr-holo,.dr-holo *{mix-blend-mode:normal!important;isolation:auto!important;filter:none!important;-webkit-mask-image:none!important;mask-image:none!important;animation:none!important}'],
  ['בלי וידאו ברקע', '[data-lab-video]{display:none!important}'],
  ['בלי מצלמה', '.lab-camera{animation:none!important;transform:none!important}'],
  ['בלי פורטל WebGL', '.lab-hologram{display:none!important}'],
  ['בלי ד"ר הולו', '[data-lab-holo]{display:none!important}'],
  ['ד"ר הולו בתמונה קבועה', '[data-dr-holo] video{display:none!important}'],
]

async function measure(browser: Browser, css: string) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'he-IL' })
  await ctx.addInitScript(`(() => { if (!window.__name) window.__name = (f) => f; try { sessionStorage.setItem('holo_splash_seen','1'); sessionStorage.setItem('holo_token','e2e-fake-token') } catch (e) {} })()`)
  const page = await ctx.newPage()
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.route(`**/api/quests/${QID}`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quest }) }))
  /* עוצמה מלאה: בלי ירידה אוטומטית לעדין, כדי שכל הגרסאות יימדדו באותו מצב */
  await page.route('**/api/sessions/start', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionId: 's', resumed: false, currentSceneId: null, inventory: [], visitedScenes: [], crystals: 0, effectsLevel: 'medium' }) }))
  /* --swap <קובץ>: האנימציה של ד"ר הולו מוחלפת בקובץ מקומי (ניסוי קידוד) */
  if (args.includes('--swap')) { const body = readFileSync(args[args.indexOf('--swap') + 1]); await page.route('**/dr-holo/v2/welcome.mp4', (r) => r.fulfill({ status: 200, contentType: 'video/mp4', body })) }
  await page.goto(`${DEFAULT_BASE}/play/${QID}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForSelector('[data-lab-video][data-playing]', { timeout: 30000 })
  if (css) await page.addStyleTag({ content: css })
  const cdp = await ctx.newCDPSession(page)
  if (rate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate })
  await page.waitForTimeout(4000)
  /* --shot <dir>: הגליץ' מוקפא בשיא (88.5%/89.2% מהמחזור) ופס האור באמצע, וצילום של ד"ר הולו */
  if (args.includes('--shot') && !css) {
    const dir = args[args.indexOf('--shot') + 1]
    const at = (name: string, frac: number, ms: number) => page.evaluate(([n, f, d]) => { for (const a of document.getAnimations()) { if ((a as CSSAnimation).animationName === n) { a.pause(); a.currentTime = (f as number) * (d as number) } } }, [name, frac, ms] as const)
    await page.waitForTimeout(500)
    const painted = await page.evaluate(() => { const c = document.querySelector<HTMLCanvasElement>('.dr-holo__glitch canvas'); if (!c) return null; const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) n++; return n })
    console.log(`פיקסלים מצוירים בעותק הגליץ': ${painted}`)
    await at('dr-holo-glitch-a', 0.9, 4400); await at('dr-holo-glitch-b', 0.9, 4400); await at('dr-holo-band', 0.3, 6500)
    await page.screenshot({ path: `${dir}/holo-glitch.png`, clip: { x: 0, y: 90, width: 700, height: 678 } })
    await at('dr-holo-glitch-a', 0.5, 4400); await at('dr-holo-glitch-b', 0.5, 4400)
    await page.screenshot({ path: `${dir}/holo-calm.png`, clip: { x: 0, y: 90, width: 700, height: 678 } })
  }
  const r = await page.evaluate(() => new Promise<{ fps: number; worst: number; media: string | null; level: string | null; gpu: string | null }>((resolve) => {
    const f: number[] = []
    const t0 = performance.now()
    const tick = (t: number) => {
      f.push(t)
      if (t - t0 < 4000) { requestAnimationFrame(tick); return }
      const gaps = f.slice(1).map((x, i) => x - f[i])
      resolve({
        fps: (f.length - 1) / ((f[f.length - 1] - f[0]) / 1000), worst: Math.max(...gaps),
        media: document.querySelector('[data-dr-holo]')?.getAttribute('data-holo-media') ?? null,
        gpu: (() => { const c = document.createElement('canvas').getContext('webgl'); const d = c?.getExtension('WEBGL_debug_renderer_info'); return d ? String(c!.getParameter(d.UNMASKED_RENDERER_WEBGL)) : null })(),
        level: (window as unknown as { __holoFx?: { level?: () => string } }).__holoFx?.level?.() ?? null,
      })
    }
    requestAnimationFrame(tick)
  }))
  await ctx.close()
  return r
}

/* --gpu: עם כרטיס המסך (ANGLE/D3D11), כמו בדפדפן אמיתי. בלי: רינדור תוכנה, הגרוע ביותר */
const GPU = args.includes('--gpu') ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-features=VaapiVideoDecoder'] : []
/* --headed: חלון אמיתי. בדפדפן בלי חלון שני סרטונים בו-זמנית נעולים על חצי מהקצב גם בלי שום אפקט, ולכן המדידה הקובעת היא בחלון */
const HEADED = args.includes('--headed')
const NAMES = args.includes('--names') ? args[args.indexOf('--names') + 1].split(',') : null
const ONLY = args.includes('--quick') ? new Set(['הכול', 'בלי ד"ר הולו', 'ד"ר הולו בתמונה קבועה']) : null
const browser = await chromium.launch({ executablePath: findChrome(), headless: !HEADED, args: ['--autoplay-policy=no-user-gesture-required', ...GPU] })
try {
  for (const [name, css] of VARIANTS) {
    if (ONLY && !ONLY.has(name)) continue
    if (NAMES && !NAMES.some((n) => name.includes(n))) continue
    const r = await measure(browser, css)
    console.log(`${name.padEnd(22)} ${r.fps.toFixed(1)} FPS · הפריים האיטי ${r.worst.toFixed(0)}ms · ${r.media} · ${r.level} · ${r.gpu}`)
  }
} finally {
  await browser.close()
}
