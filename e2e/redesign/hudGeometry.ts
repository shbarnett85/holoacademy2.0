/* ─────────────────────────────────────────────────
   גובה ה-HUD, תיבת הטקסט של העמוד וצד פס הגלילה, בעמוד משחק (נגן אמיתי עם /api מדומה).
   מדידת אורך הטקסט (sceneTextMetrics) נשענת על גובה ה-HUD ועל תיבת הטקסט: שינוי עיצוב שמזיז אותן מחייב מדידה מחדש.
   פס הגלילה: גוף העמוד הוא אזור הגלילה, ולכן הפס בשמאל (התוכן מתחיל אחרי הפס). Chrome בלי ממשק מסתיר פסי גלילה של אלמנטים,
   ולכן כאן יוצא 'none'; עם --headed רואים את הפס בשמאל.
   הרצה:  npx tsx e2e/redesign/hudGeometry.ts [--headed]
   ───────────────────────────────────────────────── */
import { chromium } from 'playwright-core'
import { DEFAULT_BASE, findChrome } from '../lib/config.ts'

const QID = '00000000-0000-4000-8000-0000000000bd'
const TF = { type: 'trueFalse', question: 'הנילוס עובר במצרים.', difficulty: 5, choices: [{ id: 't', text: 'נכון', isCorrect: true }, { id: 'f', text: 'לא נכון', isCorrect: false }], explanationCorrect: 'נכון.', explanationIncorrect: 'לא.' }
const quest = { id: QID, title: 'מסע', game_data: { entrySceneId: 's1', readingScale: 10, scenes: [
  { id: 's1', title: 'הנהר', narrative: 'הנהר זורם בשקט בין השדות.', imageUrl: '/lab/library.webp', imagePrompt: 'x', puzzle: TF, nextSceneId: 's2' },
  { id: 's2', title: 'השער', narrative: 'השער.', imageUrl: '/lab/library.webp', imagePrompt: 'x', puzzle: TF, nextSceneId: null }],
  endingGood: { title: 'סוף', narrative: 'סוף.' }, endingBad: { title: 'פתוח', narrative: 'פתוח.' } } }
const fakeJwt = `x.${Buffer.from(JSON.stringify({ userId: 'stu', role: 'student', classId: 'c1', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64')}.y`

const browser = await chromium.launch({ executablePath: findChrome(), headless: !process.argv.includes('--headed') })
for (const [w, h] of [[1366, 620], [1366, 768], [1024, 768], [740, 360]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'he-IL' })
  await ctx.addInitScript(`(() => { if (!window.__name) window.__name = (f) => f; try { sessionStorage.setItem('holo_splash_seen','1'); sessionStorage.setItem('holo_token','${fakeJwt}'); sessionStorage.setItem('holo_student_name','נועה לוי') } catch (e) {} })()`)
  const page = await ctx.newPage()
  await page.route('**/api/**', (r) => r.fulfill({ json: {} }))
  await page.route(`**/api/quests/${QID}`, (r) => r.fulfill({ json: { quest } }))
  await page.route('**/api/sessions/start', (r) => r.fulfill({ json: { sessionId: 's', resumed: false, currentSceneId: null, inventory: [], visitedScenes: [], crystals: 0, effectsLevel: 'gentle' } }))
  await page.goto(`${DEFAULT_BASE}/play/${QID}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.holo-text-area', { timeout: 30000 })
  await page.waitForTimeout(1500)
  const g = await page.evaluate(() => {
    const r = (s: string) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return `${Math.round(b.width)}×${Math.round(b.height)}@${Math.round(b.left)},${Math.round(b.top)}` }
    const sb = window.innerWidth - document.body.clientWidth
    return { hud: r('.holo-hud-top'), text: r('.holo-text-area'), scrollbar: sb, scrollbarSide: sb === 0 ? 'none' : (document.body.getBoundingClientRect().left + sb <= document.body.firstElementChild!.getBoundingClientRect().left + 0.5 ? 'left' : 'right') }
  })
  console.log(`${w}×${h}`, JSON.stringify(g))
  await ctx.close()
}
await browser.close()
