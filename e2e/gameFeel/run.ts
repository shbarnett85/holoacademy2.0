/* ───────────────────────────────────────────────────────────
   תחושת משחק (שלב J) — הרצה על הנגן האמיתי, עם /api מדומה (בלי כתיבה ל-DB).
   חלקים (--section):
     flow      משחק מלא: ניסיון שני, גבישים, גוף complete, כיול זהה, מסך סיום, "שחקו שוב"
     shots     צילום כל סוג אתגר בשלוש העוצמות, ב-1366×768 ובטלפון לרוחב
     perf      האטת מעבד פי 4 (CDP): FPS במעוף גביש ובקונפטי, וירידה אוטומטית לעדין
     reduced   prefers-reduced-motion: אין אנימציה רצה, אין חלקיקים, הגבישים מתמלאים מיד
     hologram  ד"ר הולו בארבע ההבעות, ובמסך השיעור
   הרצה:  npx tsx e2e/gameFeel/run.ts --out <dir> [--section flow,shots,...]   יוצא עם קוד 1 אם משהו נכשל.
   ─────────────────────────────────────────────────────────── */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { DEFAULT_BASE, findChrome } from '../lib/config.ts'
import { calibrate, defaultProfileForGrade, perTypeFromChallenges } from '../../src/shared/lib/difficultyCalibration.ts'

const args = process.argv.slice(2)
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d }
const OUT = opt('out', 'e2e/out/gamefeel')
const SECTIONS = opt('section', 'flow,shots,gate,perf,reduced,hologram').split(',')
const ONLY_TYPES = opt('types', '').split(',').filter(Boolean)
mkdirSync(OUT, { recursive: true })

const failures: string[] = []
const results: Record<string, unknown> = {}
const check = (ok: boolean, msg: string) => { console.log(ok ? '  ✓' : '  ✗', msg); if (!ok) failures.push(msg) }

const IMG = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="#16324f"/><stop offset=".5" stop-color="#2a6f97"/><stop offset="1" stop-color="#7b2d8b"/></linearGradient></defs><rect width="1024" height="768" fill="url(#g)"/><circle cx="300" cy="260" r="130" fill="#ffd166" opacity=".8"/><rect x="560" y="360" width="320" height="260" fill="#06d6a0" opacity=".6"/></svg>')}`
const QID = '00000000-0000-4000-8000-0000000000bb'
const MC = (q: string, right: string, wrong: string[]) => ({
  type: 'multipleChoice', question: q, difficulty: 5,
  choices: [{ id: 'r', text: right, isCorrect: true }, ...wrong.map((t, i) => ({ id: `w${i}`, text: t, isCorrect: false }))],
  explanationCorrect: 'נכון, כי זה הנהר שעובר במצרים.', explanationIncorrect: 'התשובה הנכונה היא ' + right + '.', retryHint: 'חשבו על הנהר שעובר במצרים.',
})
const PUZZLES: Record<string, Record<string, unknown>> = {
  multipleChoice: MC('איזה נהר עובר במצרים?', 'הנילוס', ['הירדן', 'הפרת', 'הטיגריס']),
  trueFalse: { type: 'trueFalse', question: 'הנילוס עובר במצרים.', difficulty: 5, choices: [{ id: 't', text: 'נכון', isCorrect: true }, { id: 'f', text: 'לא נכון', isCorrect: false }], explanationCorrect: 'נכון, הנילוס עובר במצרים.', explanationIncorrect: 'התשובה הנכונה היא נכון.' },
  memory: { type: 'memory', question: 'התאימו בין המושגים', difficulty: 3, pairs: [{ a: 'מצרים', b: 'נילוס' }, { a: 'עיראק', b: 'פרת' }, { a: 'ישראל', b: 'ירדן' }] },
  sequenceOrder: { type: 'sequenceOrder', question: 'סדרו לפי הזמן', difficulty: 3, orderType: 'chronological', items: [{ id: 'i1', text: 'זריעה' }, { id: 'i2', text: 'צמיחה' }, { id: 'i3', text: 'קציר' }, { id: 'i4', text: 'אחסון' }], correctOrder: ['i1', 'i2', 'i3', 'i4'] },
  hangman: { type: 'hangman', question: 'מילה שפירושה זרם מים גדול', difficulty: 5, answer: 'נהר', maxWrong: 6 },
  wordCompletion: { type: 'wordCompletion', question: 'השלימו את המשפט', difficulty: 3, sentence: 'הנילוס הוא ___ גדול במצרים.', answer: 'נהר', answers: ['נהר'], blankCount: 1, wordBank: ['נהר', 'הר', 'ים', 'מדבר'] },
  tileSwap: { type: 'tileSwap', question: 'השלימו את התמונה', difficulty: 3, gridSize: 3 },
  wordSearch: { type: 'wordSearch', question: 'מצאו את המילים', difficulty: 3, words: ['נהר', 'מים', 'דגים'] },
  finalQuiz: { type: 'finalQuiz', question: 'מבחן סיכום', difficulty: 5, questions: [
    { question: 'איזה נהר עובר במצרים?', options: ['הנילוס', 'הירדן', 'הפרת'], correctIndex: 0, explanationCorrect: 'נכון.', explanationIncorrect: 'התשובה הנכונה היא הנילוס.' },
    { question: 'מה מביא הנהר לשדות?', options: ['מים', 'חול', 'אבנים'], correctIndex: 0, explanationCorrect: 'נכון.', explanationIncorrect: 'התשובה הנכונה היא מים.' },
    { question: 'מי נהנה מהנהר?', options: ['החקלאים', 'אף אחד', 'רק המלך'], correctIndex: 0, explanationCorrect: 'נכון.', explanationIncorrect: 'התשובה הנכונה היא החקלאים.' },
  ] },
  moralDilemma: { type: 'moralDilemma', question: 'מה עושים?', difficulty: 5, situation: 'הנהר עלה והציף את השדה של השכן. אפשר לעזור לו, אבל השדה שלכם יחכה.', moralChoices: [{ text: 'לעזור לשכן קודם', consequence: 'השכן הודה לכם, והשדה שלכם נזרע באיחור.' }, { text: 'לטפל בשדה שלכם', consequence: 'השדה שלכם ניצל, והשכן נשאר לבד.' }] },
}
const TYPES = Object.keys(PUZZLES)

type Scene = Record<string, unknown>
const scene = (id: string, title: string, extra: Scene): Scene => ({ id, title, narrative: `זו ${title}. הנהר זורם בשקט בין השדות.`, imageUrl: IMG, imagePrompt: 'x', ...extra })
const ENDINGS = {
  endingGood: { title: 'הנילוס חזר לזרום', narrative: 'בזכותכם המים חזרו אל השדות.', drHoloDialog: 'כל הכבוד, פתרתם את התעלומה!', imageUrl: IMG },
  endingBad: { title: 'הסיפור עוד פתוח', narrative: 'מצאתם את המקור, אבל חסרות עוד תובנות כדי להחזיר את המים.', drHoloDialog: 'בואו נחזור ונגלה מה עוד מסתתר שם.', imageUrl: IMG },
}
const single = (type: string) => ({
  id: QID, title: `אתגר ${type}`,
  game_data: { scenes: [scene('s1', 'סצנה ראשונה', { puzzle: PUZZLES[type], nextSceneId: 's2' }), scene('s2', 'סצנה אחרונה', { nextSceneId: null })], entrySceneId: 's1', readingScale: 10, ...ENDINGS },
})
const lesson = (types: string[]) => ({
  id: QID, title: 'מסע אל הנילוס',
  game_data: {
    scenes: types.map((t, i) => scene(`s${i + 1}`, `סצנה ${i + 1}`, { puzzle: PUZZLES[t], nextSceneId: i < types.length - 1 ? `s${i + 2}` : null })),
    entrySceneId: 's1', readingScale: 10, ...ENDINGS,
  },
})

async function newCtx(browser: Browser, width: number, height: number, reduced: boolean, dsf = 1): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width, height }, screen: { width, height }, deviceScaleFactor: dsf, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', reducedMotion: reduced ? 'reduce' : 'no-preference' })
  await ctx.addInitScript(`(() => { if (!window.__name) window.__name = (f) => f; try { sessionStorage.setItem('holo_splash_seen','1'); sessionStorage.setItem('holo_token','e2e-fake-token') } catch (e) {} })()`)
  return ctx
}

interface Mock { complete: any[]; starts: number; classGems: unknown; assigned: unknown[]; startExtra?: Record<string, unknown> }
async function open(ctx: BrowserContext, quest: unknown, level: string, mock: Mock = { complete: [], starts: 0, classGems: { available: false }, assigned: [] }): Promise<{ page: Page; mock: Mock }> {
  const page = await ctx.newPage()
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.route(`**/api/quests/${QID}`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quest }) }))
  await page.route('**/api/sessions/start', (r) => { mock.starts++; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionId: 'sess-1', resumed: false, currentSceneId: null, inventory: [], visitedScenes: [], crystals: 0, effectsLevel: level, isReplay: mock.starts > 1, ...mock.startExtra }) }) })
  await page.route('**/api/sessions/*/complete', async (r) => { try { mock.complete.push(JSON.parse(r.request().postData() ?? 'null')) } catch { /* ignore */ } await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, profileUpdated: true }) }) })
  await page.route('**/api/sessions/class-gems/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock.classGems) }))
  await page.route('**/api/sessions/assigned', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quests: mock.assigned }) }))
  await page.goto(`${DEFAULT_BASE}/play/${QID}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.holo-text-area', { timeout: 30000 })
  return { page, mock }
}

const startBtn = (page: Page) => page.getByRole('button', { name: /פתרו את האתגר|התחילו את מבחן הסיכום/ })
async function openChallenge(page: Page): Promise<void> {
  try { await startBtn(page).click({ timeout: 15000 }) } catch (e) {
    await shot(page, 'DEBUG-no-start')
    console.log('buttons:', JSON.stringify(await page.locator('button:visible').allInnerTexts()), 'text:', (await page.locator('.holo-text-area').innerText().catch(() => '')).slice(0, 120))
    throw e
  }
  await page.waitForSelector('.holo-stage', { timeout: 10000 })
  await page.waitForTimeout(950)
}
const choice = (page: Page, text: string) => page.locator('.holo-stage button', { hasText: text }).first()
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const counter = (page: Page) => page.evaluate(() => Number(document.querySelector('[data-gem-counter]')?.getAttribute('data-gem-counter') ?? -1))
async function next(page: Page): Promise<void> {
  /* "המשך" של פאנל התוצאה, או מעבר הסצנה */
  for (let i = 0; i < 20; i++) {
    if (await page.locator('[data-end-screen]').count()) return
    if (await startBtn(page).isVisible().catch(() => false)) return
    const b = page.locator('button.holo-button:visible', { hasText: /המשך|סיום|לסיכום/ }).first()
    if (await b.isVisible().catch(() => false)) await b.click({ timeout: 2000 }).catch((e) => { console.log('NEXT-CLICK-ERR', String(e.message).replace(/\s+/g, ' ').slice(0, 700)) })
    await page.waitForTimeout(450)
  }
}

/* ── איך משחקים בכל סוג, עם צילומים לאורך הדרך ── */
async function playAndShoot(page: Page, type: string, name: string): Promise<string> {
  const after = async (suffix: string, ms = 260) => { await page.waitForTimeout(ms); await shot(page, `${name}-${suffix}`) }
  switch (type) {
    case 'multipleChoice':
      await choice(page, 'הירדן').click(); await after('wrong', 420)
      await choice(page, 'הנילוס').click(); await after('right')
      return 'solved'
    case 'trueFalse':
      await choice(page, 'נכון').first().click(); await after('right')
      return 'solved'
    case 'finalQuiz':
      await choice(page, 'הירדן').click(); await after('wrong', 420)
      await choice(page, 'הנילוס').click(); await after('right')
      return 'played'
    case 'moralDilemma':
      await choice(page, 'לעזור לשכן').click(); await after('consequence', 500)
      return 'solved'
    case 'memory': {
      /* הטקסט של קלף גלוי רק אחרי שהופך: משחקים כמו תלמיד/ה — זוכרים מה ראינו. טעות ראשונה נשארת, והזוגות נפתרים */
      const cards = page.locator('[data-mem-state]')
      const partner: Record<string, string> = { מצרים: 'נילוס', נילוס: 'מצרים', עיראק: 'פרת', פרת: 'עיראק', ישראל: 'ירדן', ירדן: 'ישראל' }
      const n = await cards.count()
      const seen = new Map<string, number>()
      const flip = async (i: number): Promise<string> => { await cards.nth(i).click(); await page.waitForTimeout(420); return ((await cards.nth(i).innerText()).match(/[א-ת]+/g) ?? []).find((w) => w in partner) ?? '' }
      let shotMatch = false
      for (let guard = 0; guard < 12; guard++) {
        const left = await cards.evaluateAll((els) => els.map((e, i) => (e.getAttribute('data-mem-state') === 'down' ? i : -1)).filter((i) => i >= 0))
        if (!left.length) break
        const a = left.find((i) => ![...seen.values()].includes(i)) ?? left[0]
        const ta = await flip(a)
        seen.set(ta, a)
        if (guard === 0) await shot(page, `${name}-flip`)
        const known = seen.get(partner[ta])
        const b = known !== undefined && known !== a ? known : left.find((i) => i !== a && ![...seen.values()].includes(i))
        if (b === undefined) break
        await cards.nth(b).click()
        await page.waitForTimeout(280)
        const tb = known !== undefined ? partner[ta] : ((await cards.nth(b).innerText()).match(/[א-ת]+/g) ?? []).find((w) => w in partner) ?? ''
        seen.set(tb, b)
        if (partner[ta] === tb && !shotMatch) { shotMatch = true; await shot(page, `${name}-match`) }
        await page.waitForTimeout(partner[ta] === tb ? 450 : 1300)
      }
      void n
      await after('done', 900)
      return shotMatch ? 'solved' : 'played'
    }
    case 'hangman': {
      await page.locator('.hang-key', { hasText: /^ש$/ }).click(); await after('wrong', 240)
      for (const l of ['נ', 'ה', 'ר']) { await page.locator('.hang-key', { hasText: new RegExp(`^${l}$`) }).click(); await page.waitForTimeout(90) }
      await after('chain', 380)
      return 'solved'
    }
    case 'wordCompletion':
      await choice(page, 'נהר').click(); await after('right')
      return 'solved'
    case 'sequenceOrder': {
      for (let pos = 0; pos < 4; pos++) {
        const ids = await page.locator('[data-seq-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-seq-id')))
        const want = `i${pos + 1}`
        if (ids[pos] === want) continue
        const from = await page.locator(`[data-seq-id="${want}"]`).boundingBox()
        const to = await page.locator(`[data-seq-id="${ids[pos]}"]`).boundingBox()
        if (!from || !to) continue
        await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
        await page.mouse.down()
        await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 })
        await page.mouse.up()
        await page.waitForTimeout(280)
      }
      await after('ordered', 60)
      await page.locator('.holo-stage button.holo-button').first().click(); await after('lights', 420)
      return 'solved'
    }
    case 'tileSwap': {
      const tiles = page.locator('.holo-stage button[style*="aspect-ratio"]')
      if (await tiles.count() >= 2) { await tiles.nth(0).click(); await tiles.nth(1).click(); await after('swap', 280) }
      return 'mid-play'
    }
    case 'wordSearch': {
      const a = await page.locator('[data-r="0"][data-c="0"]').boundingBox()
      const b = await page.locator('[data-r="0"][data-c="2"]').boundingBox()
      if (a && b) { await page.mouse.move(a.x + 5, a.y + 5); await page.mouse.down(); await page.mouse.move(b.x + 5, b.y + 5, { steps: 5 }); await after('drag', 120); await page.mouse.up() }
      return 'mid-play'
    }
    default: return 'none'
  }
}

/* ── flow ── */
async function flow(browser: Browser): Promise<void> {
  console.log('\n== flow: משחק מלא ==')
  const ctx = await newCtx(browser, 1366, 768, false)
  const types = ['multipleChoice', 'multipleChoice', 'trueFalse', 'multipleChoice', 'moralDilemma']
  const quest = lesson(types)
  const assigned = [
    { id: QID, title: 'מסע אל הנילוס', subjectCode: 'history', assignedAt: '2026-10-20T08:00:00Z', sessionStatus: 'completed', gems: 3 },
    { id: 'q2', title: 'שיעור הבא', subjectCode: 'history', assignedAt: '2026-10-22T08:00:00Z', sessionStatus: 'not_started', gems: null },
  ]
  const { page, mock } = await open(ctx, quest, 'medium', { complete: [], starts: 0, classGems: { available: true, classGems: 41, mine: 3, target: 72, allClosed: false }, assigned })
  await page.waitForTimeout(800)
  check((await page.evaluate(() => (window as any).__holoFx?.level?.())) === 'medium', 'העוצמה מהכיתה הוחלה')
  /* s1: טעות ואז הצלחה */
  await openChallenge(page)
  await choice(page, 'הירדן').click()
  await page.waitForTimeout(350)
  const locked = await choice(page, 'הירדן').isDisabled()
  const hint = await page.locator('[data-retry-hint]').textContent().catch(() => '')
  check(locked, 'האפשרות השגויה ננעלה')
  check(!!hint && !/הנילוס/.test(hint), `הרמז לא מגלה את התשובה: "${hint}"`)
  check(await page.locator('.holo-stage button', { hasText: 'הפרת' }).isEnabled(), 'אפשר לבחור פעם נוספת')
  await choice(page, 'הנילוס').click()
  await page.waitForTimeout(1200)
  check(await counter(page) === 0, 'אחרי 0.5 נקודה מתוך 5: עדיין 0 גבישים שלמים במונה')
  await next(page)
  /* s2: נכון מיד */
  await openChallenge(page); await choice(page, 'הנילוס').click(); await page.waitForTimeout(1200)
  check(await counter(page) === 1, 'אחרי 1.5 נקודות: גביש שלם אחד')
  await next(page)
  /* s3: נכון/לא נכון — נכון */
  await openChallenge(page); await choice(page, 'נכון').first().click(); await page.waitForTimeout(1200)
  check(await counter(page) === 2, 'אחרי 2.5 נקודות: 2 גבישים')
  await next(page)
  /* s4: שתי טעויות */
  await openChallenge(page); await choice(page, 'הירדן').click(); await page.waitForTimeout(350); await choice(page, 'הפרת').click(); await page.waitForTimeout(500)
  const shownRight = await page.locator('.holo-stage').evaluate((el) => (el.textContent ?? '').includes('הנילוס'))
  check(shownRight, 'אחרי שתי טעויות התשובה הנכונה מסומנת')
  await page.waitForTimeout(900)
  check(await counter(page) === 2, 'שתי טעויות: 0 נקודות, המונה לא זז')
  await next(page)
  /* s5: דילמה */
  await openChallenge(page); await choice(page, 'לעזור לשכן').click(); await page.waitForTimeout(1200)
  check(await counter(page) === 3, 'דילמה: תמיד 1. 3.5 נקודות = 3 גבישים')
  await next(page)
  await page.waitForSelector('[data-end-screen]', { timeout: 20000 })
  await page.waitForTimeout(1800)
  await shot(page, 'flow-end-closed')
  const endText = await page.locator('[data-end-screen]').innerText()
  check((await page.getAttribute('[data-end-screen]', 'data-end-screen')) === 'closed', 'הסיפור נסגר ב-3 גבישים')
  check(/2 אתגרים הצליחו בניסיון הראשון/.test(endText), 'משפט צמיחה: בניסיון הראשון (2, בלי הדילמה)')
  check(/פעם אחת ניסיתם שוב והצלחתם/.test(endText), 'משפט צמיחה: ניסו שוב והצליחו')
  check(/הכיתה אספה עד עכשיו 41 גבישים, ו-3 מהם שלכם. היעד: 72./.test(endText), 'גבישי הכיתה: הטקסט המדויק')
  check(!/דרג|%|אחוז|מקום/.test(endText), 'אין דרגה, אחוזים או השוואה במסך הסיום')
  check(!/הסיום הטוב|הסיום הרע/.test(endText), 'בלי הביטויים האסורים')
  check(await page.locator('[data-end-journey]').count() === 1, 'המסע מוצג במסך הסיום')
  check(await page.locator('[data-play-again]').count() === 1, 'יש כפתור "שחקו שוב"')
  const body = mock.complete.at(-1)
  check(!!body, 'נשלח complete')
  if (body) {
    results.completeBody = { gemPoints: body.gemPoints, gems: body.gems, finished: body.finished, challenges: body.challenges?.map((c: any) => ({ type: c.puzzleType, correct: c.correct, shards: c.shards })), answers: body.answers?.map((a: any) => ({ localId: a.localId, attemptNo: a.attemptNo ?? a.attempt_no, isCorrect: a.isCorrect })) }
    /* gems מחושב בשרת מ-gemPoints ÷ gemPossible (הלקוח לא קובע אותו) */
    check(body.gemPoints === 3.5 && body.gemPossible === 5, `gemPoints=${body.gemPoints}, gemPossible=${body.gemPossible}`)
    check(body.finished === true, 'finished=true')
    check(body.challenges?.[0]?.correct === false && body.challenges?.[0]?.shards === 0, 'ניסיון שני מוצלח: לכיול correct=false, shards=0')
    check(body.challenges?.[1]?.correct === true, 'ניסיון ראשון מוצלח: correct=true')
    const a2 = (body.answers ?? []).filter((a: any) => (a.attemptNo ?? a.attempt_no) === 2 && a.puzzleType === 'multipleChoice')
    check(a2.length === 2, `שתי שורות attempt_no=2 (נמצאו ${a2.length})`)
    /* הכיול על מה שנשלח בפועל, מול הסשן כפי שהיה לפני השינוי (רק הניסיון הראשון) */
    const prev = defaultProfileForGrade('ו׳')
    const before = [{ puzzleType: 'multipleChoice', correct: false }, { puzzleType: 'multipleChoice', correct: true }, { puzzleType: 'trueFalse', correct: true }, { puzzleType: 'multipleChoice', correct: false }, { puzzleType: 'moralDilemma', correct: true }]
    const A = calibrate(prev, { perType: perTypeFromChallenges(before), avgSceneMs: 12000 })
    const B = calibrate(prev, { perType: perTypeFromChallenges(body.challenges), avgSceneMs: 12000 })
    check(JSON.stringify(A) === JSON.stringify(B), 'כיול 60/80 על גוף ה-complete האמיתי: אותן רמות כמו לפני השינוי')
    results.calibration = { before: A.profile, after: B.profile }
  }
  /* שחקו שוב */
  const startsBefore = mock.starts /* ב-StrictMode של הפיתוח start נקרא פעמיים בטעינה */
  await page.click('[data-play-again]')
  await page.waitForSelector('.holo-text-area', { timeout: 15000 })
  await page.waitForTimeout(600)
  check(mock.starts > startsBefore, 'שחקו שוב: session חדש (start נקרא שוב)')
  check(await counter(page) === 0, 'שחקו שוב: הגבישים מתחילים מאפס')
  await page.close()

  /* סיפור פתוח */
  const { page: p2 } = await open(ctx, lesson(['multipleChoice', 'trueFalse']), 'medium', { complete: [], starts: 0, classGems: { available: false }, assigned: [] })
  await openChallenge(p2); await choice(p2, 'הירדן').click(); await p2.waitForTimeout(350); await choice(p2, 'הפרת').click(); await p2.waitForTimeout(1000); await next(p2)
  await openChallenge(p2); await choice(p2, 'לא נכון').click(); await p2.waitForTimeout(1000); await next(p2)
  await p2.waitForSelector('[data-end-screen]', { timeout: 20000 })
  await p2.waitForTimeout(1500)
  await shot(p2, 'flow-end-open')
  check((await p2.getAttribute('[data-end-screen]', 'data-end-screen')) === 'open', 'פחות מ-3 גבישים: הסיפור נשאר פתוח')
  const openText = await p2.locator('[data-end-screen]').innerText()
  check(/חסרות עוד תובנות/.test(openText) && /שחקו שוב/.test(openText), 'בסיפור הפתוח: "חסרות עוד תובנות" והזמנה לשחק שוב')
  await p2.close()

  /* 5 גבישים */
  const { page: p3 } = await open(ctx, lesson(['trueFalse']), 'full', { complete: [], starts: 0, classGems: { available: false }, assigned: [] })
  await openChallenge(p3); await choice(p3, 'נכון').first().click(); await p3.waitForTimeout(1200); await next(p3)
  await p3.waitForSelector('[data-end-screen]', { timeout: 20000 })
  await p3.waitForTimeout(1500)
  await shot(p3, 'flow-end-radiant')
  check((await p3.getAttribute('[data-end-screen]', 'data-end-screen')) === 'radiant', '5 גבישים: זוהר מיוחד')
  await p3.close()
  await ctx.close()
}

/* ── shots ── */
async function shots(browser: Browser): Promise<void> {
  console.log('\n== shots: כל סוג × שלוש עוצמות × שני מסכים ==')
  const table: Record<string, string> = {}
  for (const [vp, w, h] of [['1366', 1366, 768], ['phone', 740, 360]] as const) {
    for (const level of ['gentle', 'medium', 'full']) {
      const ctx = await newCtx(browser, w, h, false)
      for (const type of ONLY_TYPES.length ? ONLY_TYPES : TYPES) {
        const name = `${vp}-${level}-${type}`
        const { page } = await open(ctx, single(type), level)
        const errs: string[] = []
        page.on('pageerror', (e) => errs.push(e.message))
        try {
          await openChallenge(page)
          await shot(page, `${name}-open`)
          const state = await playAndShoot(page, type, name)
          table[name] = state
          const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
          if (over) failures.push(`${name}: גלילה אופקית`)
          check(errs.length === 0 && !over, `${name}: ${state}`)
        } catch (e) {
          check(false, `${name}: ${(e as Error).message.split('\n')[0]}`)
          await shot(page, `${name}-FAILED`).catch(() => {})
        }
        await page.close()
      }
      await ctx.close()
    }
  }
  results.shots = table
}

/* ── gate: המפתח מסתובב והשער נפתח ── */
async function gate(browser: Browser): Promise<void> {
  console.log('\n== gate ==')
  const quest = {
    id: QID, title: 'השער',
    game_data: {
      scenes: [
        scene('s1', 'המפתח', { collectableItem: { id: 'key1', name: 'מפתח הנהר', icon: '🔑', description: 'פותח את השער' }, nextSceneId: 's2' }),
        scene('s2', 'השער', { requiresItemId: 'key1', unlockText: 'השער נפתח, והמים זורמים פנימה.', nextSceneId: 's3' }),
        scene('s3', 'אחרי השער', { nextSceneId: null }),
      ],
      entrySceneId: 's1', readingScale: 10, ...ENDINGS,
    },
  }
  for (const [vp, w, h] of [['1366', 1366, 768], ['phone', 740, 360]] as const) {
    const ctx = await newCtx(browser, w, h, false)
    const { page } = await open(ctx, quest, 'medium')
    await page.getByRole('button', { name: /אספו את/ }).click({ timeout: 15000 })
    await page.waitForTimeout(500)
    await shot(page, `${vp}-gate-locked`)
    const item = page.locator('button', { hasText: '🔑' }).first()
    await item.click({ timeout: 10000 })
    await page.waitForSelector('[data-gate-unlock]', { timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(420)
    await shot(page, `${vp}-gate-unlock`)
    check(await page.locator('[data-gate-unlock]').count() === 1, `${vp}: המפתח מסתובב והשער נפתח`)
    await ctx.close()
  }
}

/* ── perf ── */
const sampleFps = (page: Page, ms: number, action: string) => page.evaluate(async ({ ms, action }) => {
  const fx = (window as any).__holoFx
  const times: number[] = []
  let on = true
  const tick = (t: number) => { times.push(t); if (on) requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
  const from = document.querySelector('.holo-stage button, .holo-button')
  new Function('fx', 'from', action)(fx, from)
  /* בקרה: האפקט באמת רץ. סופרים פיקסלים מצוירים באמצע, ובודקים שהגביש עף */
  await new Promise((r) => setTimeout(r, Math.min(300, ms / 2)))
  const flyerSeen = !!document.querySelector('[data-gem-flyer]')
  const cv = document.querySelector('canvas[data-game-feel-fx]') as HTMLCanvasElement | null
  let paintedPixels = 0
  if (cv) { const d = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data; for (let i = 3; i < d.length; i += 4) if (d[i]) paintedPixels++ }
  await new Promise((r) => setTimeout(r, ms - Math.min(300, ms / 2)))
  on = false
  const gaps = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b)
  return { flyerSeen, paintedPixels, fps: Math.round(((times.length - 1) * 1000) / (times[times.length - 1] - times[0])), p95ms: Math.round(gaps[Math.floor(gaps.length * 0.95)] ?? 0), worstMs: Math.round(gaps[gaps.length - 1] ?? 0), frames: times.length }
}, { ms, action })

async function perf(browser: Browser): Promise<void> {
  console.log('\n== perf: האטת מעבד פי 4 ==')
  const out: Record<string, unknown> = {}
  for (const rate of [1, 4]) {
    for (const level of ['gentle', 'medium', 'full']) {
      const ctx = await newCtx(browser, 1366, 768, false)
      const { page } = await open(ctx, single('multipleChoice'), 'medium')
      await page.waitForTimeout(4200) /* שהבדיקה האוטומטית תסתיים לפני קביעת העוצמה */
      const cdp = await ctx.newCDPSession(page)
      const busy = () => page.evaluate(() => { const t = performance.now(); let x = 0; for (let i = 0; i < 2e7; i++) x += Math.sqrt(i); return Math.round(performance.now() - t + (x > 0 ? 0 : 1)) })
      const busyBefore = await busy()
      await cdp.send('Emulation.setCPUThrottlingRate', { rate })
      const busyAfter = await busy()
      await page.evaluate((l) => (window as any).__holoFx.setLevel(l), level)
      const flight = await sampleFps(page, 1100, 'fx.flyGem(from, 0.5)')
      await page.waitForTimeout(500)
      const n = { gentle: 0, medium: 50, full: 150 }[level] ?? 0
      const conf = await sampleFps(page, 2000, `fx.confetti(${n})`)
      out[`×${rate} ${level}`] = { busyBefore, busyAfter, gemFlight: flight, confetti: conf }
      console.log(`  ×${rate} ${level}: לולאת בקרה ${busyBefore}→${busyAfter}ms | מעוף גביש ${flight.fps}fps (p95 ${flight.p95ms}ms, הכי גרוע ${flight.worstMs}ms, גביש נראה: ${flight.flyerSeen}) | קונפטי ${conf.fps}fps (p95 ${conf.p95ms}ms, הכי גרוע ${conf.worstMs}ms, פיקסלים ${conf.paintedPixels})`)
      if (level !== 'gentle' && (!flight.flyerSeen || conf.paintedPixels === 0)) failures.push(`×${rate} ${level}: האפקט לא רץ במדידה`)
      await ctx.close()
    }
  }
  /* הירידה האוטומטית: הבדיקה רצה בשניות הראשונות של השיעור */
  const auto: Record<string, string> = {}
  for (const rate of [1, 4, 25]) {
    const ctx = await newCtx(browser, 1366, 768, false)
    const page = await ctx.newPage()
    const cdp = await ctx.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate })
    await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
    await page.route(`**/api/quests/${QID}`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quest: single('multipleChoice') }) }))
    await page.route('**/api/sessions/start', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionId: 's', resumed: false, currentSceneId: null, inventory: [], visitedScenes: [], crystals: 0, effectsLevel: 'full' }) }))
    await page.goto(`${DEFAULT_BASE}/play/${QID}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForSelector('.holo-text-area', { timeout: 120000 })
    await page.waitForTimeout(rate > 4 ? 12000 : 5000)
    auto[`×${rate}`] = await page.evaluate(() => (window as any).__holoFx.level())
    console.log(`  ×${rate}: התחיל ב-full, אחרי הבדיקה: ${auto[`×${rate}`]}`)
    await ctx.close()
  }
  check(auto['×1'] === 'full', 'בלי האטה: העוצמה נשארת')
  check(auto['×25'] === 'gentle', 'מחשב איטי מאוד: יורד לעדין אוטומטית')
  out.auto = auto
  results.perf = out
}

/* ── reduced ── */
async function reduced(browser: Browser): Promise<void> {
  console.log('\n== reduced: prefers-reduced-motion ==')
  const ctx = await newCtx(browser, 1366, 768, true)
  const running = (page: Page) => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').map((a) => {
    const t = (a.effect as KeyframeEffect | null)?.target as Element | null
    return `${(a as CSSAnimation).animationName ?? 'wa'}@${t?.tagName}.${String(t?.getAttribute?.('class') ?? '').slice(0, 30)}`
  }))
  const seen: Record<string, string[]> = {}
  const { page } = await open(ctx, lesson(['multipleChoice', 'memory', 'trueFalse']), 'full')
  await page.waitForTimeout(700)
  seen.scene = await running(page)
  await openChallenge(page)
  seen.challenge = await running(page)
  await choice(page, 'הירדן').click()
  await page.waitForTimeout(150)
  seen.wrong = await running(page)
  await choice(page, 'הנילוס').click()
  await page.waitForTimeout(150)
  seen.right = await running(page)
  const flying = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-game-feel-fx]')
    if (!c) return 0
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]) n++
    return n
  })
  check(flying === 0, 'אין חלקיקים על ה-canvas')
  await next(page)
  await page.waitForTimeout(500)
  await openChallenge(page)
  const cards = page.locator('[data-mem-state]')
  await cards.nth(0).click()
  await page.waitForTimeout(120)
  seen.memory = await running(page)
  await page.close()
  /* סוף שיעור */
  const { page: p2 } = await open(ctx, lesson(['trueFalse']), 'full')
  await openChallenge(p2); await choice(p2, 'נכון').first().click(); await p2.waitForTimeout(250)
  check(await counter(p2) === 5, 'הגבישים מתמלאים מיד')
  await next(p2)
  await p2.waitForSelector('[data-end-screen]', { timeout: 20000 })
  await p2.waitForTimeout(250)
  seen.end = await running(p2)
  await shot(p2, 'reduced-end')
  await p2.close()
  await ctx.close()
  results.reducedRunning = seen
  for (const [k, v] of Object.entries(seen)) check(v.length === 0, `${k}: ${v.length} אנימציות רצות${v.length ? ` (${[...new Set(v)].slice(0, 6).join(', ')})` : ''}`)
}

/* ── hologram ── */
async function hologram(browser: Browser): Promise<void> {
  console.log('\n== hologram ==')
  const ctx = await newCtx(browser, 1366, 768, false, 2)
  const { page } = await open(ctx, lesson(['multipleChoice']), 'medium')
  await page.waitForTimeout(1800)
  await shot(page, 'hologram-scene-1366')
  const spot = page.locator('[data-dr-holo]').first()
  check(await spot.count() === 1, 'ד"ר הולו על המסך')
  const loaded = await page.evaluate(() => { const i = document.querySelector<HTMLImageElement>('[data-dr-holo] img'); return !!i && i.complete && i.naturalWidth > 0 })
  check(loaded, 'נכס ההבעה נטען (לא נפל לסמל)')
  for (const mood of ['neutral', 'happy', 'thinking', 'surprised']) {
    await page.evaluate((m) => (window as any).__holoFx.setMood(m), mood)
    await page.waitForTimeout(350)
    await page.locator('[data-dr-holo]').first().screenshot({ path: path.join(OUT, `hologram-${mood}.png`) })
  }
  await page.evaluate(() => (window as any).__holoFx.setMood('neutral'))
  /* מותר להבהב רק נדיר */
  const flicker = await page.evaluate(() => {
    const a = document.getAnimations().find((x) => (x as CSSAnimation).animationName === 'dr-holo-flicker')
    return a ? (a.effect as KeyframeEffect).getTiming().duration : null
  })
  results.hologramFlicker = flicker
  await page.close()
  await ctx.close()
}

const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ['--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required'] })
if (SECTIONS.includes('flow')) await flow(browser)
if (SECTIONS.includes('hologram')) await hologram(browser)
if (SECTIONS.includes('reduced')) await reduced(browser)
if (SECTIONS.includes('shots')) await shots(browser)
if (SECTIONS.includes('gate')) await gate(browser)
if (SECTIONS.includes('perf')) await perf(browser)
await browser.close()
writeFileSync(path.join(OUT, `results-${SECTIONS.join('_')}.json`), JSON.stringify({ results, failures }, null, 2))
if (failures.length) { console.log(`\n✗ ${failures.length} כשלים`); for (const f of failures) console.log('  -', f); process.exit(1) }
console.log('\n✓ כל הבדיקות עברו')
