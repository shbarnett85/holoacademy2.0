/* ──────────────────────────────────────────────────────────────────────────
   pagination-flow — מסלול מלא בנגן האמיתי (עם הקלדה, בלי reducedMotion) על סצנה ארוכה:
   · אין גלילה בתיבת הטקסט בשום עמוד (overflow hidden, scrollHeight ≤ clientHeight, אין פס גלילה)
   · "המשך ›" ו-"1/N" מופיעים רק אחרי שהעמוד הוקלד; האתגר מופיע רק אחרי העמוד האחרון
   · התיעוד: sceneTimes של הסצנה כולל pages + pageMs (נתפס מה-complete היחיד שנשלח בסיום)
   הרצה:  npx tsx e2e/textfit/pagination-flow.ts [screenKey=laptop-620]
   יוצא עם קוד 1 אם משהו נכשל.
   ────────────────────────────────────────────────────────────────────────── */
import { REF_SCREENS, launch, newCtx } from './lab.ts'
import { DEFAULT_BASE } from '../lib/config.ts'

const screenKey = process.argv[2] ?? 'laptop-620'
const screen = REF_SCREENS.find((s) => s.key === screenKey)!
const SENT = 'המצרים הקדמונים חיו לאורך הנילוס, והנהר השקה את שדותיהם בכל שנה.'
const LONG = Array.from({ length: 9 }, (_, i) => `${SENT} (${i + 1})`).join(' ')

const failures: string[] = []
const check = (ok: boolean, msg: string) => { console.log(ok ? '  ✓' : '  ✗', msg); if (!ok) failures.push(msg) }

const browser = await launch()
const ctx = await newCtx(browser, screen, { reducedMotion: false })
await ctx.addInitScript(`(() => { try { sessionStorage.setItem('holo_token', 'e2e-fake-token') } catch (e) {} })()`)
const page = await ctx.newPage()
const id = '00000000-0000-4000-8000-0000000000aa'
const quest = {
  id, title: 'מסלול עמודים',
  game_data: {
    scenes: [
      { id: 's1', title: 'סצנה ארוכה', narrative: LONG, imagePrompt: 'x', puzzle: { type: 'multipleChoice', question: 'מי השקה את השדות?', choices: [{ id: 'a', text: 'הנילוס', isCorrect: true }, { id: 'b', text: 'הים', isCorrect: false }], explanationCorrect: 'נכון', explanationIncorrect: 'לא' }, nextSceneId: 's2' },
      { id: 's2', title: 'סיום', narrative: 'סצנת סיום קצרה.', imagePrompt: 'x' },
    ],
    entrySceneId: 's1', readingScale: 10,
  },
}
let completeBody: any = null
/* Playwright: הנתיב האחרון שנרשם גובר — הכללי נרשם ראשון */
await page.route('**/api/sessions/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
await page.route(`**/api/quests/${id}`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quest }) }))
await page.route('**/api/sessions/start', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionId: 'sess-1', resumed: false, currentSceneId: null, inventory: [], visitedScenes: [], crystals: 0 }) }))
await page.route('**/api/sessions/*/complete', async (r) => { try { completeBody = JSON.parse(r.request().postData() ?? 'null') } catch { /* ignore */ } await r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) })
await page.route('**/api/funnel/**', (r) => r.fulfill({ status: 204, body: '' }))
await page.goto(`${DEFAULT_BASE}/play/${id}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.holo-text-area', { timeout: 20000 })

const area = async () => page.evaluate(() => {
  const a = document.querySelector<HTMLElement>('.holo-text-area')!
  const cs = getComputedStyle(a)
  return {
    over: a.scrollHeight > a.clientHeight + 1, overflowY: cs.overflowY, scrollbar: a.offsetWidth - a.clientWidth,
    ind: document.querySelector('[data-page-indicator]')?.textContent?.trim() ?? '', next: !!document.querySelector('[data-next-page]'),
    puzzleBtn: [...document.querySelectorAll('button')].some((b) => /פתרו את האתגר/.test(b.textContent ?? '')),
  }
})

console.log(`מסך ${screen.key} (${screen.width}×${screen.height})`)
let pagesSeen = 0
let first = true
for (let guard = 0; guard < 12; guard++) {
  /* ממתינים להקלדת העמוד: או "המשך ›" או כפתור האתגר */
  await page.waitForFunction(() => !!document.querySelector('[data-next-page]') || [...document.querySelectorAll('button')].some((b) => /פתרו את האתגר/.test(b.textContent ?? '')), undefined, { timeout: 45000 })
  const a = await area()
  pagesSeen++
  if (first) {
    first = false
    check(a.overflowY === 'hidden' && a.scrollbar === 0, `תיבת הטקסט ללא גלילה (overflow=${a.overflowY}, פס=${a.scrollbar}px)`)
    check(/^1\/\d+$/.test(a.ind), `מציג מחוון עמודים בעמוד הראשון: "${a.ind}"`)
  }
  check(!a.over, `עמוד ${pagesSeen}: אין גלישה בתיבת הטקסט`)
  if (!a.next) {
    check(a.puzzleBtn, `עמוד אחרון (${a.ind || '1/1'}): כפתור האתגר מופיע`)
    break
  }
  check(!a.puzzleBtn, `עמוד ${pagesSeen}: האתגר לא מוצג לפני העמוד האחרון`)
  await page.click('[data-next-page]')
  await page.waitForTimeout(250)
}
check(pagesSeen >= 2, `הסצנה התפצלה לכמה עמודים (${pagesSeen})`)

/* עוברים את האתגר ואת הסצנה האחרונה כדי שיישלח complete */
await page.getByRole('button', { name: /פתרו את האתגר/ }).click()
await page.waitForSelector('.holo-stage')
await page.waitForTimeout(700)
await page.getByRole('button', { name: 'הנילוס' }).click()
if (process.env.DEBUG_FLOW) await page.screenshot({ path: process.env.DEBUG_FLOW + '-a.png' })
for (let i = 0; i < 8 && !completeBody; i++) {
  await page.waitForTimeout(900)
  if (process.env.DEBUG_FLOW) { console.log('buttons:', JSON.stringify(await page.locator('button:visible').allInnerTexts())); await page.screenshot({ path: process.env.DEBUG_FLOW + '-' + i + '.png' }) }
  const btn = page.getByRole('button', { name: /^(המשך|סיום|סיימו|לסיכום|המשך להרפתקה|סיים)/ }).first()
  if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {})
  else {
    const any = page.locator('button.holo-button:visible').first()
    if (await any.count()) await any.click().catch(() => {})
  }
}
await page.waitForTimeout(1200)
const st = completeBody?.sceneTimes?.find((s: any) => s.sceneId === 's1')
check(!!completeBody, 'נשלח complete יחיד בסיום')
check(!!st && st.pages === pagesSeen, `sceneTimes[s1].pages = ${st?.pages} (צפוי ${pagesSeen})`)
check(!!st && Array.isArray(st.pageMs) && st.pageMs.length === st.pages && st.pageMs.every((x: number) => x > 0), `sceneTimes[s1].pageMs = ${JSON.stringify(st?.pageMs)}`)
check(typeof st?.wordCount === 'number' && st.wordCount > 0 && typeof st?.closedDwellMs === 'number', `word_count/closedDwellMs נשמרו (${st?.wordCount} מילים)`)
await browser.close()
if (failures.length) { console.log(`\n✗ ${failures.length} כשלים`); process.exit(1) }
console.log('\n✓ כל הבדיקות עברו')
