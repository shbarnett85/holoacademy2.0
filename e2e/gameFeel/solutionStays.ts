/* ───────────────────────────────────────────────────────────
   כלל 11 של תחושת משחק: מסך שמציג פתרון נשאר עד לחיצה. ובנוסף: גרירה חלקה בחידת סדר.
   הנגן האמיתי עם /api מדומה (בלי כתיבה ל-DB). לכל סוג: כישלון, ובמקום שיש גם ויתור והצלחה.
   הרצה:  npx tsx e2e/gameFeel/solutionStays.ts [--out <dir>]     יוצא עם קוד 1 אם משהו נכשל.
   ─────────────────────────────────────────────────────────── */
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium, type Browser, type Page } from 'playwright-core'
import { DEFAULT_BASE, findChrome } from '../lib/config.ts'

const args = process.argv.slice(2)
const oi = args.indexOf('--out')
const OUT = oi >= 0 ? args[oi + 1] : 'e2e/out/solution-stays'
mkdirSync(OUT, { recursive: true })
const QID = '00000000-0000-4000-8000-0000000000ee'
const failures: string[] = []
const check = (ok: boolean, msg: string) => { console.log(ok ? '  ✓' : '  ✗', msg); if (!ok) failures.push(msg) }
const IMG = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#2a6f97"/><circle cx="400" cy="300" r="160" fill="#ffd166"/></svg>')}`
/* כמה זמן מחכים כדי לוודא שהפתרון לא נעלם: ארוך מכל טיימר ישן */
const HOLD_MS = 6000

const PUZZLES: Record<string, Record<string, unknown>> = {
  sequenceOrder: { type: 'sequenceOrder', question: 'סדרו לפי הזמן', difficulty: 20, orderType: 'chronological', items: [{ id: 'i1', text: 'זריעה' }, { id: 'i2', text: 'צמיחה' }, { id: 'i3', text: 'קציר של השדה כולו, בסוף הקיץ החם' }, { id: 'i4', text: 'אחסון' }, { id: 'i5', text: 'מכירה' }], correctOrder: ['i1', 'i2', 'i3', 'i4', 'i5'] },
  hangman: { type: 'hangman', question: 'מילה שפירושה זרם מים', difficulty: 5, answer: 'נהר', maxWrong: 3 },
  wordCompletion: { type: 'wordCompletion', question: 'השלימו', difficulty: 20, sentence: 'הנילוס הוא ___ גדול.', answer: 'נהר', answers: ['נהר'], blankCount: 1, wordBank: ['נהר', 'הר', 'ים', 'מדבר'] },
  tileSwap: { type: 'tileSwap', question: 'השלימו את התמונה', difficulty: 3, gridSize: 3 },
  wordSearch: { type: 'wordSearch', question: 'מצאו את המילים', difficulty: 3, words: ['נהר', 'מים', 'דגים'] },
  memory: { type: 'memory', question: 'התאימו', difficulty: 3, pairs: [{ a: 'מצרים', b: 'נילוס' }, { a: 'עיראק', b: 'פרת' }] },
}

async function open(browser: Browser, type: string, viewport = { width: 1366, height: 768 }): Promise<Page> {
  const ctx = await browser.newContext({ viewport, screen: viewport, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
  await ctx.addInitScript(`(() => { if (!window.__name) window.__name = (f) => f; try { sessionStorage.setItem('holo_splash_seen','1'); sessionStorage.setItem('holo_token','e2e-fake-token') } catch (e) {} })()`)
  const page = await ctx.newPage()
  const quest = { id: QID, title: 'פתרון', game_data: { entrySceneId: 's1', readingScale: 10, scenes: [
    { id: 's1', title: 'ראשונה', narrative: 'הנהר זורם.', imageUrl: IMG, imagePrompt: 'x', puzzle: PUZZLES[type], nextSceneId: 's2' },
    { id: 's2', title: 'שנייה', narrative: 'הסצנה הבאה.', imageUrl: IMG, imagePrompt: 'x', nextSceneId: null },
  ] } }
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.route(`**/api/quests/${QID}`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quest }) }))
  await page.route('**/api/sessions/start', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionId: 'sess-1', resumed: false, currentSceneId: null, inventory: [], visitedScenes: [], crystals: 0, effectsLevel: 'medium', isReplay: false }) }))
  await page.goto(`${DEFAULT_BASE}/play/${QID}`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /פתרו את האתגר/ }).click({ timeout: 40000 })
  await page.waitForSelector('.holo-stage', { timeout: 10000 })
  await page.waitForTimeout(950)
  return page
}

/* הפתרון על המסך, פס התוצאה והכפתור בתוך המסך, וההמשך רק בלחיצה */
async function assertStays(page: Page, name: string, solution: string, mustFit = true): Promise<void> {
  await page.waitForSelector('[data-puzzle-result="bar"]', { timeout: 8000 })
  await page.waitForTimeout(HOLD_MS)
  const st = await page.evaluate((sel) => {
    const btn = [...document.querySelectorAll('[data-puzzle-result] button')][0] as HTMLElement | undefined
    const b = btn?.getBoundingClientRect()
    /* כל חלק של הפתרון גלוי באמת: בתוך המסך ולא מוסתר בפס התוצאה */
    const parts = [...document.querySelectorAll<HTMLElement>(sel)]
    const hidden = parts.filter((el) => {
      const r = el.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return !hit || !(el.contains(hit) || hit.contains(el))
    }).length
    return { hidden, parts: parts.length, solution: parts.length > 0, scene: document.querySelector('[data-scene-image]')?.getAttribute('data-scene-image'), btnInView: !!b && b.top >= 0 && b.bottom <= innerHeight, stageVisible: !!document.querySelector('.holo-stage') }
  }, solution)
  check(st.solution, `${name}: הפתרון עדיין על המסך אחרי ${HOLD_MS / 1000} שניות`)
  if (mustFit) check(st.hidden === 0, `${name}: כל הפתרון גלוי (${st.parts - st.hidden} מתוך ${st.parts})`)
  else console.log(`  · ${name}: גלוי בלי גלילה ${st.parts - st.hidden} מתוך ${st.parts}`)
  check(st.scene === 's1' && st.stageVisible, `${name}: לא עברנו מסך בלי לחיצה`)
  check(st.btnInView, `${name}: כפתור ההמשך בתוך המסך`)
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
  await page.locator('[data-puzzle-result] button').click()
  await page.waitForFunction(() => document.querySelector('[data-scene-image]')?.getAttribute('data-scene-image') === 's2' && !document.querySelector('[data-puzzle-result]'), null, { timeout: 6000 })
  check(true, `${name}: הלחיצה מעבירה הלאה`)
  await page.context().close()
}

const giveUp = (page: Page) => page.getByRole('button', { name: /ויתור על האתגר/ }).click()

async function main(): Promise<void> {
  const browser = await chromium.launch({ executablePath: findChrome(), headless: true })
  for (const vp of [{ width: 1366, height: 768, tag: '' }, { width: 740, height: 360, tag: '-phone' }]) {
    const view = { width: vp.width, height: vp.height }
    console.log(`מסך ${vp.width}×${vp.height}`)
    /* חידת סדר: נגמרו הניסיונות */
    let page = await open(browser, 'sequenceOrder', view)
    const check1 = page.getByRole('button', { name: /בדיקה/ })
    /* הסדר ההתחלתי תמיד שגוי, ולכן לוחצים עד שהניסיונות נגמרים */
    while (await check1.isVisible()) { await check1.click(); await page.waitForTimeout(500) }
    await page.waitForFunction(() => !!document.querySelector('.seq-sweep') || !!document.querySelector('[data-puzzle-result]'), null, { timeout: 4000 })
    await assertStays(page, `sequence-lose${vp.tag}`, '.seq-sweep', !vp.tag)

    /* איש תלוי: נגמרו הניסיונות */
    page = await open(browser, 'hangman', view)
    for (const l of ['א', 'ב', 'ג']) await page.locator('.hang-key', { hasText: l }).first().click()
    await assertStays(page, `hangman-lose${vp.tag}`, '[data-hang-slot]')

    /* השלמת מילים: נגמרו הניסיונות */
    page = await open(browser, 'wordCompletion', view)
    for (const w of ['מדבר', 'ים', 'הר']) {
      const b = page.locator('.holo-stage button:enabled', { hasText: w }).first()
      if (await b.isVisible()) { await b.click(); await page.waitForTimeout(450) }
    }
    await assertStays(page, `completion-lose${vp.tag}`, '.holo-stage .holo-panel .holo-panel span span')

    /* ויתור: הפתרון נחשף */
    page = await open(browser, 'tileSwap', view)
    await giveUp(page)
    await assertStays(page, `tile-giveup${vp.tag}`, '.tileswap-grid button', !vp.tag)

    page = await open(browser, 'wordSearch', view)
    await giveUp(page)
    await assertStays(page, `search-giveup${vp.tag}`, '[data-r]', !vp.tag)

    page = await open(browser, 'memory', view)
    await giveUp(page)
    await page.waitForFunction(() => document.querySelectorAll('.mem-inner.up').length === 4, null, { timeout: 2000 })
    await assertStays(page, `memory-giveup${vp.tag}`, '.mem-inner.up', !vp.tag)
  }

  console.log('גרירה בחידת סדר')
  const p = await open(browser, 'sequenceOrder')
  const tops = () => p.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-seq-id]')].map((e) => ({ id: e.getAttribute('data-seq-id'), top: Math.round(e.getBoundingClientRect().top) })))
  const before = await tops()
  const first = await p.locator('[data-seq-id]').first().boundingBox()
  const x = first!.x + first!.width / 2
  const y = first!.y + first!.height / 2
  await p.mouse.move(x, y)
  await p.mouse.down()
  /* השורה עוקבת אחרי העכבר בדיוק, פיקסל-פיקסל */
  const errors: number[] = []
  for (let d = 4; d <= 60; d += 4) {
    await p.mouse.move(x, y + d)
    const now = await p.evaluate((id) => document.querySelector<HTMLElement>(`[data-seq-id="${id}"]`)!.getBoundingClientRect(), before[0].id)
    errors.push(Math.abs(now.y + now.height / 2 - (y + d)))
  }
  check(Math.max(...errors) <= 2, `השורה צמודה לעכבר (סטייה מרבית ${Math.max(...errors).toFixed(1)}px)`)
  /* הגרירה לא מרנדרת ולא משנה את סדר ה-DOM עד העזיבה */
  const domOrder = await p.evaluate(() => [...document.querySelectorAll('[data-seq-id]')].map((e) => e.getAttribute('data-seq-id')))
  check(domOrder.join() === before.map((b) => b.id).join(), 'הסדר מתעדכן רק בעזיבה')
  /* גרירה הרחק מהרשימה לא בורחת מגבולותיה */
  await p.mouse.move(x, 760)
  await p.waitForTimeout(250)
  const clamp = await p.evaluate((id) => { const list = document.querySelector('[data-seq-id]')!.parentElement!.getBoundingClientRect(); const r = document.querySelector<HTMLElement>(`[data-seq-id="${id}"]`)!.getBoundingClientRect(); return r.bottom - list.bottom }, before[0].id)
  check(clamp <= 3, 'השורה לא יוצאת מגבולות הרשימה')
  await p.mouse.up()
  await p.waitForTimeout(400)
  const after = await tops()
  check(after[after.length - 1].id === before[0].id, 'עזיבה בתחתית: השורה עברה למקום האחרון')
  check(after.every((r, i) => i === 0 || r.top > after[i - 1].top), 'אחרי העזיבה השורות מסודרות בלי חפיפה')
  await p.context().close()

  console.log('רשימה ארוכה מהמסך: גלילה אוטומטית בגרירה')
  PUZZLES.sequenceOrder = { ...PUZZLES.sequenceOrder, items: ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => ({ id: `i${n}`, text: `שלב מספר ${n}` })), correctOrder: ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => `i${n}`) }
  const lp = await open(browser, 'sequenceOrder')
  const ids = await lp.evaluate(() => [...document.querySelectorAll('[data-seq-id]')].map((e) => e.getAttribute('data-seq-id')))
  await lp.locator('[data-seq-id]').first().scrollIntoViewIfNeeded()
  const b1 = (await lp.locator('[data-seq-id]').first().boundingBox())!
  await lp.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2)
  await lp.mouse.down()
  await lp.mouse.move(b1.x + b1.width / 2, 755, { steps: 12 })
  await lp.waitForTimeout(2500)
  await lp.mouse.up()
  await lp.waitForTimeout(400)
  const ids2 = await lp.evaluate(() => [...document.querySelectorAll('[data-seq-id]')].map((e) => e.getAttribute('data-seq-id')))
  check(ids2[ids2.length - 1] === ids[0], 'גרירה אל הקצה גוללת ומגיעה עד המקום האחרון')
  /* 9 שורות במסך הפתרון */
  const c9 = lp.getByRole('button', { name: /בדיקה/ })
  while (await c9.isVisible()) { await c9.click(); await lp.waitForTimeout(500) }
  await assertStays(lp, 'sequence-9-lose', '.seq-sweep')

  await browser.close()
  if (failures.length) { console.log(`\n${failures.length} כשלים:\n${failures.join('\n')}`); process.exit(1) }
  console.log('\nהכול עבר')
}

main().catch((e) => { console.error(e); process.exit(1) })
