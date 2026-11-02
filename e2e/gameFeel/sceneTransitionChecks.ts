/* ───────────────────────────────────────────────────────────
   מעבר בין תמונות סצנה: בדיקות התנהגות על הנגן האמיתי, עם /api מדומה (בלי כתיבה ל-DB).
   הרצה:  npx tsx e2e/gameFeel/sceneTransitionChecks.ts     יוצא עם קוד 1 אם משהו נכשל.
   ─────────────────────────────────────────────────────────── */
import { chromium, type Browser, type Page } from 'playwright-core'
import { DEFAULT_BASE, findChrome } from '../lib/config.ts'

const QID = '00000000-0000-4000-8000-0000000000dd'
const failures: string[] = []
const check = (ok: boolean, msg: string) => { console.log(ok ? '  ✓' : '  ✗', msg); if (!ok) failures.push(msg) }
const svg = (c1: string, c2: string) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="1280" height="720" fill="url(#g)"/></svg>`)}`
const A = svg('#16324f', '#2a6f97')
const B = svg('#7b2d8b', '#f3b76a')
const C = svg('#0b6e4f', '#ffd166')

const MC = { type: 'multipleChoice', question: 'איזה נהר עובר במצרים?', difficulty: 5, choices: [{ id: 'r', text: 'הנילוס', isCorrect: true }, { id: 'w', text: 'הירדן', isCorrect: false }], explanationCorrect: 'נכון.', explanationIncorrect: 'התשובה הנכונה היא הנילוס.', retryHint: 'חשבו על מצרים.' }
const s = (id: string, extra: Record<string, unknown>) => ({ id, title: id, narrative: `זו הסצנה ${id}.`, imagePrompt: 'x', ...extra })
const quest = {
  id: QID, title: 'מעברים',
  game_data: {
    entrySceneId: 's1', readingScale: 10,
    scenes: [
      s('s1', { imageUrl: A, nextSceneId: 's2' }),
      s('s2', { imageUrl: B, nextSceneId: 's3' }), /* סריקה */
      s('s3', { imageUrl: B, nextSceneId: 's4' }), /* אותה תמונה */
      s('s4', { nextSceneId: 's5' }), /* בלי תמונה */
      s('s5', { imageUrl: C, puzzle: MC, nextSceneId: 's6' }),
      s('s6', { imageUrl: A, choices: [{ text: 'חזרה אל ההתחלה', nextSceneId: 's2' }, { text: 'להמשיך', nextSceneId: 's7' }] }),
      s('s7', { imageUrl: B, nextSceneId: null }),
    ],
  },
}

async function open(browser: Browser, level: string, reduced = false, viewport = { width: 1366, height: 768 }): Promise<Page> {
  const ctx = await browser.newContext({ viewport, screen: viewport, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', reducedMotion: reduced ? 'reduce' : 'no-preference' })
  await ctx.addInitScript(`(() => { if (!window.__name) window.__name = (f) => f; try { sessionStorage.setItem('holo_splash_seen','1'); sessionStorage.setItem('holo_token','e2e-fake-token') } catch (e) {} })()`)
  const page = await ctx.newPage()
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.route(`**/api/quests/${QID}`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quest }) }))
  await page.route('**/api/sessions/start', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionId: 'sess-1', resumed: false, currentSceneId: null, inventory: [], visitedScenes: [], crystals: 0, effectsLevel: level, isReplay: false }) }))
  await page.goto(`${DEFAULT_BASE}/play/${QID}`, { waitUntil: 'domcontentloaded' })
  await nextBtn(page).waitFor({ timeout: 40000 })
  return page
}
const nextBtn = (page: Page) => page.locator('button.holo-button:visible', { hasText: /המשך|סיום|פתרו/ }).first()
const swap = (page: Page) => page.getAttribute('[data-scene-swap]', 'data-scene-swap')
const shown = (page: Page) => page.getAttribute('[data-scene-image]', 'data-scene-image')
const idle = (page: Page) => page.waitForSelector('[data-scene-swap="idle"]', { timeout: 5000 })
const settled = async (page: Page) => { await idle(page); await nextBtn(page).waitFor({ timeout: 6000 }) }
/* מצב הדף ברגע אחד: נדגם בתוך הדפדפן, כדי שלא יפספס מעבר קצר */
const sampleDuring = (page: Page) => page.evaluate(() => new Promise<{ kind: string; text: boolean; button: boolean; beam: string | null; dim: boolean; layers: number; running: number }>((resolve) => {
  const started = performance.now()
  const step = () => {
    const stage = document.querySelector('[data-scene-swap]')!
    const kind = stage.getAttribute('data-scene-swap')!
    if (kind !== 'idle' || performance.now() - started > 1500) {
      resolve({
        kind,
        text: !!document.querySelector('.holo-text-area .holo-panel'),
        button: !!document.querySelector('.holo-panel-actions button'),
        beam: document.querySelector('.si-beam')?.className ?? null,
        dim: !!document.querySelector('.si-dim'),
        layers: document.querySelectorAll('.si-layer').length,
        running: stage.getAnimations({ subtree: true }).filter((a) => !/kenburns/.test((a as CSSAnimation).animationName ?? '')).length,
      })
      return
    }
    requestAnimationFrame(step)
  }
  step()
}))

async function main(): Promise<void> {
  const browser = await chromium.launch({ executablePath: findChrome(), headless: true })

  console.log('עוצמה בינונית: מסע שלם')
  const page = await open(browser, 'medium')
  await page.evaluate(() => {
    const w = window as unknown as { __img: Element | null }
    w.__img = document.querySelector('.si-img')
  })
  /* s1 → s2 */
  let during = sampleDuring(page)
  await nextBtn(page).click()
  let d = await during
  check(d.kind === 'scan', `סריקה בין שתי תמונות (${d.kind})`)
  check(d.layers === 2, 'שתי התמונות על המסך במהלך המעבר')
  check(!d.text && !d.button, 'בזמן המעבר אין טקסט ואין כפתור המשך')
  check(!!d.beam?.includes('si-beam--fwd'), 'קדימה: הסריקה מימין לשמאל')
  await page.waitForSelector('[data-lab-stage]', { state: 'detached', timeout: 5000 }).catch(() => {})
  check(await page.locator('[data-dr-holo]').count() === 0, 'בסצנות אין ד"ר הולו')
  await idle(page)
  check(await page.locator('.si-layer').count() === 1, 'בסוף המעבר נשארת שכבה אחת')
  check(await shown(page) === 's2', 'הסצנה החדשה מוצגת')
  await settled(page)
  check(await page.locator('.holo-text-area').innerText().then((t) => t.includes('s2')), 'הטקסט של הסצנה החדשה מוצג')

  /* s2 → s3: אותה תמונה */
  during = sampleDuring(page)
  await nextBtn(page).click()
  d = await during
  check(d.kind === 'idle', 'אותה תמונה בשתי סצנות: בלי אנימציה')
  await page.waitForFunction(() => document.querySelector('[data-scene-image]')?.getAttribute('data-scene-image') === 's3', null, { timeout: 3000 })
  await settled(page)
  check(await page.locator('.holo-text-area').innerText().then((t) => t.includes('s3')), 'אותה תמונה: הטקסט מתעדכן והמשחק ממשיך')

  /* s3 → s4: בלי תמונה */
  await nextBtn(page).click()
  await page.waitForFunction(() => document.querySelector('[data-scene-image]')?.getAttribute('data-scene-image') === 's4', null, { timeout: 4000 })
  await settled(page)
  check(await page.locator('.si-empty').count() === 1, 'סצנה בלי תמונה: משטח כהה ולא חור')

  /* s4 → s5 → אתגר → s6: ההכהיה נשמרת על התמונה היוצאת */
  await nextBtn(page).click()
  await page.waitForFunction(() => document.querySelector('[data-scene-image]')?.getAttribute('data-scene-image') === 's5', null, { timeout: 4000 })
  await settled(page)
  await nextBtn(page).click()
  await page.waitForSelector('.holo-stage button', { timeout: 8000 })
  await page.waitForTimeout(950)
  await page.locator('.holo-stage button', { hasText: 'הנילוס' }).first().click()
  const cont = page.locator('.holo-stage button:visible', { hasText: /המשך/ }).first()
  await cont.waitFor({ timeout: 8000 })
  during = sampleDuring(page)
  await cont.click()
  d = await during
  check(d.kind === 'scan' && d.dim, 'יציאה מאתגר: התמונה היוצאת נשארת מוכהית ולא מבהיקה')
  await page.waitForFunction(() => document.querySelector('[data-scene-image]')?.getAttribute('data-scene-image') === 's6', null, { timeout: 4000 })
  await idle(page)
  check(await page.locator('.si-dim').count() === 0, 'ההכהיה נעלמת בסוף המעבר')

  /* s6 → s2 (סצנה שכבר ביקרנו בה): הסריקה בכיוון ההפוך, ודילוג בלחיצה */
  await page.waitForSelector('[data-choices-stage] button', { timeout: 8000 })
  during = sampleDuring(page)
  await page.locator('[data-choices-stage] button', { hasText: 'חזרה' }).click()
  d = await during
  check(!!d.beam?.includes('si-beam--back'), 'חזרה לסצנה קודמת: הסריקה בכיוון ההפוך')
  await page.locator('.si-skip').dispatchEvent('pointerdown')
  check(await swap(page) === 'idle', 'לחיצה על התמונה מדלגת לסוף המעבר')
  check(await shown(page) === 's2', 'אחרי דילוג מוצגת הסצנה החדשה')
  await page.context().close()

  console.log('עוצמה עדינה')
  const gentle = await open(browser, 'gentle')
  during = sampleDuring(gentle)
  await nextBtn(gentle).click()
  d = await during
  check(d.kind === 'fade' && d.beam === null, 'דהייה בלבד, בלי קו סריקה')
  await idle(gentle)
  await gentle.context().close()

  console.log('עוצמה מלאה')
  const full = await open(browser, 'full')
  during = sampleDuring(full)
  await nextBtn(full).click()
  d = await during
  check(d.kind === 'scan', 'סריקה')
  check(await full.locator('.si-frame').count() === 1, 'המסגרת נדלקת')
  await idle(full)
  check(await full.locator('.si-frame').count() === 0, 'המסגרת נעלמת בסוף המעבר')
  await full.context().close()

  console.log('תנועה מופחתת')
  const reduced = await open(browser, 'full', true)
  during = sampleDuring(reduced)
  await nextBtn(reduced).click()
  d = await during
  check(d.kind === 'idle' && d.layers === 1, 'החלפה מיידית, בלי אנימציה')
  await reduced.waitForFunction(() => document.querySelector('[data-scene-image]')?.getAttribute('data-scene-image') === 's2', null, { timeout: 2000 })
  check(await reduced.evaluate(() => document.querySelector('.si-img')!.getAnimations().length) === 0, 'התמונה לא זזה')
  await reduced.context().close()

  console.log('טלפון לרוחב')
  const phone = await open(browser, 'medium', false, { width: 740, height: 360 })
  const before = await phone.evaluate(() => document.documentElement.scrollWidth)
  during = sampleDuring(phone)
  await nextBtn(phone).click()
  d = await during
  check(d.kind === 'scan', 'סריקה')
  check(await phone.evaluate((w) => document.documentElement.scrollWidth === w, before), 'המעבר לא מוסיף גלילה אופקית')
  await idle(phone)
  await phone.context().close()

  await browser.close()
  if (failures.length) { console.log(`\n${failures.length} כשלים:\n${failures.join('\n')}`); process.exit(1) }
  console.log('\nהכול עבר')
}

main().catch((e) => { console.error(e); process.exit(1) })
