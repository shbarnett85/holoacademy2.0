/* ──────────────────────────────────────────────────────────────────────────
   אפשרויות לרקע העמוד (במקום רשת הפיקסלים). כלי הצעה בלבד: לא משנה את האתר.
   כל אפשרות היא אריח SVG שטוח, בגווני הלילך של הטוקנים (בלי מעבר צבע, בלי זוהר, בלי תנועה).
   הכלי מצלם כל אפשרות על מסכים אמיתיים (דריסה של --page-background בדפדפן בלבד) ובונה דף השוואה.
   הרצה:  npx tsx e2e/redesign/bgOptions.ts [--out reports/redesign/stages/bg-options] [--only <id,id>] [--no-shots]
   ────────────────────────────────────────────────────────────────────────── */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { DEFAULT_API, DEFAULT_BASE, findChrome } from '../lib/config.ts'
import { guestLogin } from '../lib/login.ts'
import { mixHex, pageBackgroundCss, paletteFromTokens } from '../../src/styles/pageBackground.ts'

const args = process.argv.slice(2)
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d }
const OUT = opt('out', 'reports/redesign/stages/bg-options')
const ONLY = opt('only', '').split(',').filter(Boolean)
mkdirSync(OUT, { recursive: true })

const css = readFileSync('src/styles/tokens.css', 'utf8')
const hexToken = (name: string) => css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))![1].toUpperCase()
const T = { ...paletteFromTokens(css), surface: hexToken('color-surface'), holo: hexToken('color-holo'), human: hexToken('color-human') }
const tok = (name: string) => css.match(new RegExp(`--${name}:[ \\t]*(#[0-9A-Fa-f]{6})`))![1].toUpperCase()
const MUTED = tok('color-muted')
const d = (p: number) => mixHex(T.machine, T.bg, p)   // לילך כהה יותר
const l = (p: number) => mixHex(T.surface, T.bg, p)   // לילך בהיר יותר

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const svg = (w: number, h: number, body: string) => `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${body}</svg>`
const asCss = (s: string, w: number, h: number) => `url("data:image/svg+xml,${s.replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E')}") 0 0 / ${w}px ${h}px, var(--color-machine-bg)`
const r1 = (n: number) => Math.round(n * 10) / 10

interface Option { id: string; name: string; desc: string; css: string; colors: string[] }
const make = (id: string, name: string, desc: string, w: number, h: number, body: string): Option => {
  const s = svg(w, h, body)
  return { id, name, desc, css: asCss(s, w, h), colors: [...new Set(s.match(/#[0-9A-F]{6}/g) ?? [])] }
}

/* 1. נייר משבצות: קווים דקים כל 24px, וקו מודגש כל 120px */
function paper(): Option {
  const minor = d(0.2), major = d(0.4)
  let b = ''
  for (let i = 1; i < 5; i++) b += `<path d='M${i * 24 + 0.5} 0V120M0 ${i * 24 + 0.5}H120' stroke='${minor}' fill='none'/>`
  b += `<path d='M0.5 0V120M0 0.5H120' stroke='${major}' fill='none'/>`
  return make('paper', 'נייר משבצות', 'קווים דקים כמו במחברת, עם קו מודגש כל חמש משבצות. הכי שקט מבין האפשרויות.', 120, 120, b)
}

/* 2. צורות גדולות: מעט צורות גאומטריות גדולות, גוון על גוון */
function shapes(): Option {
  const b = [
    `<circle cx='140' cy='150' r='95' fill='${l(0.5)}'/>`,
    `<circle cx='705' cy='135' r='70' fill='none' stroke='${d(0.2)}' stroke-width='22'/>`,
    `<path d='M430 330h125a125 125 0 0 1-125 125z' fill='${d(0.14)}'/>`,
    `<rect x='-55' y='-55' width='110' height='110' rx='22' transform='translate(785 480) rotate(18)' fill='${l(0.45)}'/>`,
    `<path d='M90 545a80 80 0 0 1 160 0z' fill='${d(0.17)}'/>`,
    `<path d='M350 115l30-32 30 32 30-32 30 32 30-32 30 32' fill='none' stroke='${l(0.75)}' stroke-width='10' stroke-linejoin='round' stroke-linecap='round'/>`,
    `<path d='M500 615q25-32 50 0t50 0 50 0 50 0' fill='none' stroke='${d(0.24)}' stroke-width='8' stroke-linecap='round'/>`,
    ...[0, 1, 2].flatMap((y) => [0, 1, 2].map((x) => `<circle cx='${300 + x * 24}' cy='${580 + y * 24}' r='5' fill='${d(0.26)}'/>`)),
    `<path d='M250 300l52 90h-104z' fill='${l(0.4)}'/>`,
    `<circle cx='590' cy='240' r='13' fill='${mixHex(T.holo, T.bg, 0.3)}'/>`,
    `<path d='M40 330h46v46h-46z' fill='${mixHex(T.human, T.bg, 0.26)}' transform='rotate(12 63 353)'/>`,
    `<path d='M840 300v44M818 322h44' stroke='${l(0.8)}' stroke-width='9' stroke-linecap='round'/>`,
  ].join('')
  return make('shapes', 'צורות גדולות', 'מעט צורות גדולות ורכות (עיגול, קשת, זיגזג), גוון על גוון. עליז, ונראה מכוון ולא אקראי.', 900, 700, b)
}

/* 3. מדפי ספרים: שורות של ספרים עומדים על קרש, גוון על גוון */
function shelves(): Option {
  const W = 720, H = 220, floor = 206
  const r = rng(20261116)
  const fills = [l(0.42), d(0.06), d(0.11), d(0.16), l(0.2)]
  let b = `<rect y='${floor}' width='${W}' height='6' fill='${d(0.26)}'/>`
  let x = 16
  while (x < W - 40) {
    const v = r()
    if (v < 0.16) { x += 26 + Math.round(r() * 50); continue }
    if (v < 0.24 && x < W - 130) {
      /* ערימה של ספרים שוכבים */
      let y = floor
      const n = 2 + Math.round(r() * 1.4)
      for (let i = 0; i < n; i++) { const w = 70 + Math.round(r() * 34), h = 14 + Math.round(r() * 7); y -= h + 2; b += `<rect x='${x + Math.round(r() * 10)}' y='${y}' width='${w}' height='${h}' rx='2' fill='${fills[Math.floor(r() * fills.length)]}'/>` }
      x += 116
      continue
    }
    const w = 13 + Math.round(r() * 17), h = 98 + Math.round(r() * 70)
    const fill = fills[Math.floor(r() * fills.length)]
    const lean = v > 0.93 ? ` transform='rotate(-11 ${x + w} ${floor})'` : ''
    b += `<g${lean}><rect x='${x}' y='${floor - h}' width='${w}' height='${h}' rx='2' fill='${fill}'/>`
    if (r() < 0.5) b += `<rect x='${x}' y='${floor - h + Math.round(h * 0.16)}' width='${w}' height='7' fill='${fill === l(0.42) ? d(0.1) : l(0.55)}'/>`
    b += '</g>'
    x += w + 3 + (lean ? 14 : 0)
  }
  return make('shelves', 'מדפי ספרים', 'שורות של ספרים על מדפים, גוון על גוון. מתחבר ישירות ל״ספרייה ההולוגרפית״.', W, H, b)
}

/* 4. קווים זורמים: קווים גליים רכים, כמו קווי גובה במפה */
function flow(): Option {
  const W = 800, H = 480, n = 12, gap = H / n
  let b = ''
  for (let k = 0; k < n; k++) {
    const pts: string[] = []
    for (let x = 0; x <= W; x += 10) {
      const y = k * gap + gap / 2 + 13 * Math.sin((2 * Math.PI * x) / W + (2 * Math.PI * k) / n) + 6 * Math.sin((4 * Math.PI * x) / W + 1.3 + (4 * Math.PI * k) / n)
      pts.push(`${x} ${r1(y)}`)
    }
    const heavy = k % 4 === 0
    b += `<path d='M${pts.join('L')}' fill='none' stroke='${heavy ? d(0.34) : d(0.2)}' stroke-width='${heavy ? 2 : 1.5}'/>`
  }
  return make('flow', 'קווים זורמים', 'קווים גליים דקים שזורמים לרוחב הדף, כמו קווי גובה במפה. רך ואורגני.', W, H, b)
}

/* 5. מעגל מודפס: מסלולים דקים עם פינות ונקודות חיבור */
function circuit(): Option {
  const N = 20, cell = 24, W = N * cell, H = N * cell
  const r = rng(77120)
  const used = new Set<string>()
  const key = (x: number, y: number) => `${x * 2},${y * 2}`
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]
  const line = d(0.24), pad = d(0.34)
  let traces = '', pads = ''
  let made = 0
  for (let attempt = 0; attempt < 400 && made < 11; attempt++) {
    let x = 2 + Math.floor(r() * (N - 3)), y = 2 + Math.floor(r() * (N - 3))
    if (used.has(key(x, y))) continue
    const pts: [number, number][] = [[x, y]]
    const mine = new Set<string>([key(x, y)])
    let dir = DIRS[Math.floor(r() * 4)]
    const segs = 3 + Math.floor(r() * 4)
    for (let s = 0; s < segs; s++) {
      const len = 2 + Math.floor(r() * 4)
      let ok = true
      const step: string[] = []
      let cx = x, cy = y
      for (let i = 0; i < len; i++) {
        const nx = cx + dir[0], ny = cy + dir[1]
        const mid = `${cx * 2 + dir[0]},${cy * 2 + dir[1]}`
        if (nx < 1 || ny < 1 || nx > N - 1 || ny > N - 1 || used.has(key(nx, ny)) || mine.has(key(nx, ny)) || used.has(mid)) { ok = false; break }
        step.push(key(nx, ny), mid); cx = nx; cy = ny
      }
      if (!ok) break
      step.forEach((k) => mine.add(k))
      x = cx; y = cy; pts.push([x, y])
      /* פנייה של 45 או 90 מעלות */
      const idx = DIRS.indexOf(dir)
      const turns = idx < 4 ? [DIRS[(idx + 1) % 4], DIRS[(idx + 3) % 4], ...DIRS.slice(4).filter((q) => q[0] === dir[0] || q[1] === dir[1])] : DIRS.slice(0, 4).filter((q) => q[0] === dir[0] || q[1] === dir[1])
      dir = turns[Math.floor(r() * turns.length)]
    }
    if (pts.length < 3) continue
    mine.forEach((k) => used.add(k))
    /* שומרים מרווח סביב הקצוות, כדי שנקודות חיבור לא ייגעו במסלול אחר */
    for (const [px, py] of [pts[0], pts[pts.length - 1]]) for (const [dx, dy] of DIRS) used.add(key(px + dx, py + dy))
    traces += `<path d='M${pts.map(([px, py]) => `${px * cell} ${py * cell}`).join('L')}' fill='none' stroke='${line}' stroke-width='2' stroke-linejoin='round'/>`
    for (const [px, py] of [pts[0], pts[pts.length - 1]]) pads += `<circle cx='${px * cell}' cy='${py * cell}' r='4.5' fill='${T.bg}' stroke='${pad}' stroke-width='2'/>`
    made++
  }
  return make('circuit', 'מעגל מודפס', 'מסלולים דקים עם פינות ונקודות חיבור, כמו לוח של מחשב. טכנולוגי, אבל דליל ורגוע.', W, H, traces + pads)
}

/* 6. גבישים: הגביש של המשחק, מפוזר בדלילות, עם נצנוצים קטנים */
function crystals(): Option {
  const OUTLINE = 'M66 40 L134 40 L170 82 L118 160 L82 160 L30 82 Z'
  const FACETS = 'M30 82 L170 82 M88 40 L88 160 M112 40 L112 160'
  const gems: [number, number, number, number, boolean][] = [[90, 100, 0.4, -12, true], [330, 70, 0.22, 14, false], [470, 190, 0.34, 8, false], [200, 300, 0.26, 20, false], [60, 440, 0.3, 6, false], [380, 400, 0.44, -8, true], [510, 500, 0.2, -18, false]]
  const stars: [number, number, number][] = [[230, 150, 9], [420, 300, 7], [150, 510, 8], [500, 60, 6], [300, 520, 6], [40, 250, 6]]
  let b = ''
  for (const [x, y, s, rot, filled] of gems) {
    b += `<g transform='translate(${x} ${y}) rotate(${rot}) scale(${s}) translate(-100 -100)'><path d='${OUTLINE}' fill='${filled ? l(0.55) : T.bg}' stroke='${d(0.32)}' stroke-width='${r1(2 / s)}' stroke-linejoin='round'/><path d='${FACETS}' fill='none' stroke='${d(0.2)}' stroke-width='${r1(1.5 / s)}'/></g>`
  }
  for (const [x, y, s] of stars) b += `<path d='M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}z' fill='${l(0.85)}'/>`
  return make('crystals', 'גבישים', 'הגביש של המשחק, מפוזר בדלילות בגדלים שונים, עם נצנוצים קטנים. הסימן של המותג.', 560, 560, b)
}

const CURRENT: Option = { id: "current", name: "הרקע הנוכחי", desc: "להשוואה בלבד.", css: pageBackgroundCss(T), colors: [] }
if (circuit().css !== CURRENT.css) console.log("שימו לב: אפשרות 5 שונה מהרקע המותקן")
else console.log("אפשרות 5 זהה לרקע המותקן")
const OPTIONS = [paper(), shapes(), shelves(), flow(), circuit(), crystals()]
const ALL = [...OPTIONS, CURRENT].filter((o) => !ONLY.length || ONLY.includes(o.id))

/* ניגודיות של טקסט muted מול הצבע הכהה ביותר בציור (הכלל של pageBackground.test.ts: 4.5:1) */
const lum = (hex: string) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] }
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
for (const o of OPTIONS) {
  const worst = Math.min(...o.colors.map((c) => contrast(MUTED, c)))
  console.log(`${o.id.padEnd(9)} ${String(o.colors.length).padStart(2)} צבעים · ניגודיות מינימלית לטקסט משני ${worst.toFixed(2)}:1 ${worst >= 4.5 ? '✓' : '✗'} · ${(o.css.length / 1024).toFixed(1)}KB`)
}

const SCREENS = ['shelf', 'results', 'library'] as const
const SCREEN_NAMES: Record<(typeof SCREENS)[number], string> = { results: 'סיכום שיעור (מורה)', shelf: 'מדף הספרים (תלמיד)', library: 'ספריית השיעורים (מורה)' }

async function ctxOf(browser: Browser, init: string): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
  await ctx.addInitScript(`(() => { if (!window.__name) window.__name = (f) => f; try { sessionStorage.setItem('holo_splash_seen','1'); ${init} } catch (e) {} })()`)
  return ctx
}
const applyBg = (page: Page, o: Option) => page.evaluate((v) => {
  let el = document.getElementById('bg-option') as HTMLStyleElement | null
  if (!el) { el = document.createElement('style'); el.id = 'bg-option'; document.head.appendChild(el) }
  el.textContent = `:root { --page-background: ${v} !important; }`
}, o.css)

async function shots(browser: Browser): Promise<void> {
  /* מורה אורח: ספריית השיעורים וסיכום שיעור */
  const session = await guestLogin(DEFAULT_API)
  const staff = await ctxOf(browser, `localStorage.setItem('holo_staff_session', ${JSON.stringify(JSON.stringify(session))});`)
  const page = await staff.newPage()
  for (const [name, url] of [['library', '/creator/library'], ['results', '/results']] as const) {
    await page.goto(DEFAULT_BASE + url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => undefined)
    await page.waitForTimeout(2500)
    for (const o of ALL) { await applyBg(page, o); await page.waitForTimeout(250); await page.screenshot({ path: path.join(OUT, `${o.id}-${name}.png`) }); console.log('  shot', o.id, name) }
  }
  await staff.close()

  /* תלמיד: מדף הספרים, עם /api מדומה */
  const fakeJwt = `x.${Buffer.from(JSON.stringify({ userId: 'stu-demo', role: 'student', classId: 'c1', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64')}.y`
  const img = (a: string, b: string, c: string) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768"><rect width="1024" height="768" fill="${a}"/><circle cx="300" cy="240" r="120" fill="${b}"/><path d="M0 560 Q260 470 520 560 T1024 540 V768 H0Z" fill="${c}"/><rect x="620" y="330" width="240" height="190" fill="${b}"/></svg>`)}`
  const IMGS = [img('#7fb7d9', '#ffd166', '#3a86c8'), img('#e9d8a6', '#bc6c25', '#606c38'), img('#cdb4db', '#ffafcc', '#457b9d'), img('#94d2bd', '#ee9b00', '#005f73')]
  const day = 86_400_000, now = Date.now()
  const subj = ['math', 'history', 'science', 'hebrew', 'english', 'geography']
  const names = ['מתמטיקה', 'היסטוריה', 'מדעים', 'עברית', 'אנגלית', 'גאוגרפיה']
  const titles = ['קרב השברים', 'מסע אל המעיין', 'טיפת המים', 'בלשי השורש', 'The Lost Key', 'מפת האוצר של הנגב']
  const quests = subj.map((s, i) => ({
    id: `q${i}`, title: titles[i], sceneCount: 6, artStyle: 'digital-painting', subject: names[i], subjectCode: s, teacherName: 'המורה רון',
    assignedAt: new Date(now - (i + 1) * day).toISOString(), entryImageUrl: IMGS[i % IMGS.length], thumbUrl: IMGS[i % IMGS.length], gradeMin: 5, gradeMax: 6,
    dueAt: new Date(now + (3 + i) * day).toISOString(), state: 'open', late: false,
    sessionStatus: i === 3 ? 'completed' : i === 1 ? 'in_progress' : null, crystals: i === 3 ? 4 : null, gems: i === 3 ? 5 : null, maxScore: 5, isReview: false, bookmarkPage: i === 1 ? 3 : null,
  }))
  const stu = await ctxOf(browser, `sessionStorage.setItem('holo_token','${fakeJwt}'); sessionStorage.setItem('holo_student_name','נועה לוי');`)
  const sp = await stu.newPage()
  await sp.route('**/api/**', (r) => r.fulfill({ json: {} }))
  await sp.route('**/api/sessions/assigned', (r) => r.fulfill({ json: { quests } }))
  await sp.goto(`${DEFAULT_BASE}/student`, { waitUntil: 'networkidle' }).catch(() => undefined)
  await sp.waitForTimeout(1500)
  for (const o of ALL) { await applyBg(sp, o); await sp.waitForTimeout(250); await sp.screenshot({ path: path.join(OUT, `${o.id}-shelf.png`) }); console.log('  shot', o.id, 'shelf') }
  await stu.close()
}

/* דף ההשוואה: לכל אפשרות דוגמה בגודל אמיתי (אותו CSS) ושלושה צילומי מסך */
function gallery(): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  const card = (o: Option, i: number) => `
  <section class="opt" id="${o.id}">
    <h2>${o === CURRENT ? '' : `${i + 1}. `}${o.name}</h2>
    <p>${o.desc}</p>
    <div class="swatch" style="background: ${esc(o.css)}"><div class="panel"><b>כך נראה הרקע בגודל אמיתי</b><span>חלון לבן עם קו וצל, כמו באתר</span></div></div>
    <div class="shots">${SCREENS.map((s) => `<a href="${o.id}-${s}.png" target="_blank"><img loading="lazy" src="${o.id}-${s}.png" alt="${o.name}: ${SCREEN_NAMES[s]}"><span>${SCREEN_NAMES[s]}</span></a>`).join('')}</div>
  </section>`
  return `<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>אפשרויות לרקע</title>
<style>
  :root { --color-machine-bg: ${T.bg}; --ink: ${tok('color-ink')}; --muted: ${MUTED}; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 28px 24px 60px; background: #fff; color: var(--ink); font: 17px/1.55 Heebo, "Segoe UI", Arial, sans-serif; }
  main { max-width: 1240px; margin: 0 auto; display: grid; gap: 34px; }
  h1 { margin: 0 0 6px; font-size: 28px; } h2 { margin: 0; font-size: 22px; } p { margin: 0; color: var(--muted); }
  .opt { display: grid; gap: 12px; }
  .swatch { height: 300px; border: 2px solid var(--ink); border-radius: 12px; display: grid; place-items: center; }
  .panel { background: #fff; border: 2px solid var(--ink); border-radius: 12px; box-shadow: 3px 3px 0 var(--ink); padding: 14px 22px; display: grid; gap: 2px; text-align: center; }
  .panel span { color: var(--muted); font-size: 15px; }
  .shots { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .shots a { display: grid; gap: 4px; color: var(--ink); font-size: 15px; font-weight: 700; text-decoration: none; }
  .shots img { width: 100%; border: 2px solid var(--ink); border-radius: 8px; display: block; }
  @media (max-width: 760px) { .shots { grid-template-columns: 1fr; } }
</style></head><body><main>
  <header><h1>איזה רקע במקום הפיקסלים?</h1><p>שש אפשרויות, כולן בגווני הלילך הקיימים, שטוחות ובלי תנועה. לחיצה על צילום פותחת אותו בגודל מלא. כתבו לי את המספר, ואפשר גם לשלב או לבקש שינוי (חזק יותר, עדין יותר, דליל יותר).</p></header>
  ${ALL.map(card).join('\n')}
</main></body></html>`
}

/* שני גיליונות לצ'אט, שש האפשרויות בכל אחד: מדף הספרים של התלמיד, וסיכום שיעור של המורה */
function sheet(screen: (typeof SCREENS)[number]): string {
  const cells = OPTIONS.map((o, i) => `<div><h2>${i + 1}. ${o.name}</h2><img src="${o.id}-${screen}.png"></div>`).join('')
  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>
  body { margin: 0; padding: 20px; background: #fff; color: ${tok('color-ink')}; font: 700 22px Heebo, "Segoe UI", Arial, sans-serif; width: 1860px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px 16px; } h2 { margin: 0 0 6px; font-size: 28px; }
  img { width: 100%; display: block; border: 2px solid ${tok('color-ink')}; }
  </style></head><body><div class="grid">${cells}</div></body></html>`
}

const browser = await chromium.launch({ executablePath: findChrome(), headless: true })
if (!args.includes('--no-shots')) await shots(browser)
writeFileSync(path.join(OUT, 'index.html'), gallery(), 'utf8')
const sp = await (await browser.newContext({ viewport: { width: 1900, height: 1000 }, deviceScaleFactor: 1 })).newPage()
for (const screen of ['shelf', 'results'] as const) {
  writeFileSync(path.join(OUT, `sheet-${screen}.html`), sheet(screen), 'utf8')
  await sp.goto('file:///' + path.resolve(OUT, `sheet-${screen}.html`).split(path.sep).join('/'))
  await sp.waitForTimeout(800)
  await sp.screenshot({ path: path.join(OUT, `sheet-${screen}.png`), fullPage: true })
}
await browser.close()
console.log(`\nדף ההשוואה: ${path.join(OUT, 'index.html')} · גיליונות: sheet-shelf.png, sheet-results.png`)
