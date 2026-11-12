/* בדיקת ניגודיות (axe: color-contrast) על מסכי התלמיד והמסכים הציבוריים, שהביקורת של מסכי המורה (e2e/run.ts) לא מכסה.
   הנגן רץ עם /api מדומה (בלי כתיבה ל-DB).   npx tsx e2e/redesign/contrast.ts */
import { createRequire } from 'node:module'
import { chromium, type Page } from 'playwright-core'
import { DEFAULT_BASE, findChrome } from '../lib/config.ts'

const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js')
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768"><rect width="1024" height="768" fill="#9cc"/></svg>'
const IMG = `data:image/svg+xml;utf8,${encodeURIComponent(SVG)}`
const QID = '00000000-0000-4000-8000-0000000000cc'
const MC = { type: 'multipleChoice', question: 'כמה הם חצי ועוד שליש?', difficulty: 5, choices: [{ id: 'r', text: '5/6', isCorrect: true }, { id: 'w0', text: '2/5', isCorrect: false }, { id: 'w1', text: '1/6', isCorrect: false }], explanationCorrect: 'נכון. מכנה משותף 6.', explanationIncorrect: 'התשובה הנכונה היא 5/6.', retryHint: 'מצאו קודם מכנה משותף.' }
const sc = (id: string, next: string | null, puzzle?: unknown) => ({ id, title: `הגשר ${id}`, narrative: `הנהר זורם בשקט בין השדות, ליד ${id}. על הגדה עומדת סירה קטנה.`, drHoloDialog: 'מה רואים על המפה?', imageUrl: IMG, imagePrompt: 'x', puzzle, nextSceneId: next })
const quest = { id: QID, title: 'מסע אל המעיין', game_data: { scenes: [sc('s0', 's1'), sc('s1', 's2', MC), sc('s2', null, MC)], entrySceneId: 's0', readingScale: 10, endingGood: { title: 'המעיין נמצא', narrative: 'המים חזרו.', imageUrl: IMG }, endingBad: { title: 'הסיפור עוד פתוח', narrative: 'חסרות תובנות.', imageUrl: IMG } } }
const jwt = `x.${Buffer.from(JSON.stringify({ userId: 'stu', role: 'student', classId: 'c1', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64')}.y`

const browser = await chromium.launch({ executablePath: findChrome(), headless: true })
let total = 0
async function check(page: Page, name: string): Promise<void> {
  await page.addScriptTag({ path: axePath })
  const res = await page.evaluate(async () => {
    const r = await (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { nodes: { target: string[]; any: { data?: { contrastRatio?: number; fgColor?: string; bgColor?: string; fontSize?: string } }[]; html: string }[] }[] }> } }).axe.run(document, { runOnly: ['color-contrast'] })
    return r.violations.flatMap((v) => v.nodes.map((n) => ({ target: n.target.join(' '), ratio: n.any[0]?.data?.contrastRatio, fg: n.any[0]?.data?.fgColor, bg: n.any[0]?.data?.bgColor, size: n.any[0]?.data?.fontSize, html: n.html.replace(/\s+/g, ' ').slice(0, 110) })))
  })
  total += res.length
  console.log(`${name}: ${res.length ? '' : 'אין הפרות ניגודיות'}`)
  for (const r of res.slice(0, 8)) console.log(`   ${r.ratio}:1  ${r.fg} על ${r.bg}  ${r.size}  ${r.html}`)
}
async function ctx(init: string, w = 1366, h = 768) {
  const c = await browser.newContext({ viewport: { width: w, height: h }, locale: 'he-IL', reducedMotion: 'reduce' })
  await c.addInitScript(`(() => { try { sessionStorage.setItem('holo_splash_seen','1'); ${init} } catch (e) {} })()`)
  return c
}
const STUDENT = `sessionStorage.setItem('holo_token','${jwt}'); sessionStorage.setItem('holo_student_name','נועה לוי');`

/* מסכים ציבוריים */
{
  const c = await ctx('')
  const p = await c.newPage()
  for (const [name, url] of [['דף הבית', '/'], ['כניסת צוות', '/staff/login'], ['הרשמת צוות', '/staff/signup'], ['כניסת כיתה', '/class/demo-vav2']] as const) {
    await p.goto(DEFAULT_BASE + url, { waitUntil: 'networkidle' }).catch(() => undefined); await p.waitForTimeout(1500); await check(p, name)
  }
  await c.close()
}
/* רשימת השיעורים של התלמיד/ה */
{
  const c = await ctx(STUDENT)
  const p = await c.newPage()
  await p.route('**/api/**', (r) => r.fulfill({ json: {} }))
  const day = 86_400_000, now = Date.now()
  await p.route('**/api/sessions/assigned', (r) => r.fulfill({ json: { quests: ['math', 'history', 'science', null].map((s, i) => ({ id: `q${i}`, title: `שיעור ${i + 1}`, sceneCount: 6, subjectCode: s, teacherName: 'המורה רון', assignedAt: new Date(now - (i + 1) * day).toISOString(), thumbUrl: i === 3 ? null : IMG, entryImageUrl: null, gradeMin: 5, gradeMax: 6, dueAt: new Date(now + (i === 2 ? -2 : 3) * day).toISOString(), state: i === 2 ? 'ended' : 'open', late: i === 1, sessionStatus: i === 1 ? 'completed' : i === 2 ? 'in_progress' : null, gems: i === 1 ? 4 : null, crystals: i === 1 ? 4 : null, maxScore: 5 })) } }))
  await p.goto(DEFAULT_BASE + '/student', { waitUntil: 'networkidle' }).catch(() => undefined); await p.waitForTimeout(1500); await check(p, 'רשימת השיעורים')
  await c.close()
}
/* המשחק */
for (const [label, w, h] of [['', 1366, 768], [' (טלפון לרוחב)', 740, 360]] as const) {
  const c = await ctx(STUDENT, w, h)
  const p = await c.newPage()
  await p.route('**/api/**', (r) => r.fulfill({ json: {} }))
  await p.route(`**/api/quests/${QID}`, (r) => r.fulfill({ json: { quest } }))
  await p.route('**/api/sessions/start', (r) => r.fulfill({ json: { sessionId: 's', resumed: false, currentSceneId: null, inventory: [], visitedScenes: [], crystals: 0, effectsLevel: 'gentle', isReplay: false } }))
  await p.route('**/api/sessions/class-gems/**', (r) => r.fulfill({ json: { available: true, classGems: 41, mine: 3, target: 72, allClosed: false } }))
  await p.route('**/api/sessions/assigned', (r) => r.fulfill({ json: { quests: [] } }))
  await p.goto(`${DEFAULT_BASE}/play/${QID}`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('.holo-text-area', { timeout: 30000 })
  const start = p.getByRole('button', { name: /פתרו את האתגר/ })
  const next = async () => { for (let i = 0; i < 24; i++) { if (await p.locator('[data-end-screen]').count()) return; if (await start.isVisible().catch(() => false)) return; const b = p.locator('button:visible:not([disabled])', { hasText: /המשך|סיום|לסיכום/ }).last(); if (await b.isVisible().catch(() => false)) await b.click({ timeout: 1500 }).catch(() => undefined); await p.waitForTimeout(400) } }
  const pick = (n: number, d: number) => p.locator(`.holo-stage button:has([data-fraction][aria-label="${n} חלקי ${d}"])`).first()
  await next(); await p.waitForTimeout(1200); await check(p, `משחק: עמוד טקסט${label}`)
  await start.click(); await p.waitForSelector('.holo-stage'); await p.waitForTimeout(1000); await check(p, `משחק: אתגר${label}`)
  await pick(2, 5).click(); await p.waitForTimeout(700); await check(p, `משחק: טעות ראשונה${label}`)
  await pick(5, 6).click(); await p.waitForTimeout(1300); await check(p, `משחק: תשובה נכונה${label}`)
  await next(); await p.waitForTimeout(800); await start.click(); await p.waitForTimeout(900)
  await pick(2, 5).click(); await p.waitForTimeout(400); await pick(1, 6).click(); await p.waitForTimeout(1300); await check(p, `משחק: שתי טעויות${label}`)
  await next(); await p.waitForSelector('[data-end-screen]', { timeout: 25000 }).catch(() => undefined); await p.waitForTimeout(2500); await check(p, `מסך הסיום${label}`)
  await c.close()
}
await browser.close()
console.log(`\nסך הכול הפרות ניגודיות: ${total}`)
process.exit(total ? 1 : 0)
