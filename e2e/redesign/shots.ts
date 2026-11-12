/* ──────────────────────────────────────────────────────────────────────────
   צילומי "לפני/אחרי" של העיצוב החדש (חלק א'). כלי בדיקה בלבד.
   · מסכי המשחק: הנגן האמיתי עם /api מדומה (בלי כתיבה ל-DB).
   · מסכי הצוות: מורה אורח על נתוני ההדגמה (קריאה בלבד).
   · מנהל-על: session מדומה + /api מדומה (בלי סיסמאות).
   הרצה:  npx tsx e2e/redesign/shots.ts --out reports/redesign/before [--only game,staff,public]
   ────────────────────────────────────────────────────────────────────────── */
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { DEFAULT_API, DEFAULT_BASE, findChrome } from '../lib/config.ts'
import { guestLogin } from '../lib/login.ts'

const args = process.argv.slice(2)
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d }
const OUT = opt('out', 'reports/redesign/before')
const ONLY = opt('only', 'game,staff,public').split(',')
mkdirSync(OUT, { recursive: true })
const done: string[] = []
const shot = async (page: Page, name: string) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); done.push(name); console.log('  shot', name) }
const safe = async (name: string, fn: () => Promise<void>) => { try { await fn() } catch (e) { console.log('  FAIL', name, String((e as Error).message).split('\n')[0].slice(0, 200)) } }

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="#7fb7d9"/><stop offset=".6" stop-color="#e9d8a6"/><stop offset="1" stop-color="#94d2bd"/></linearGradient></defs><rect width="1024" height="768" fill="url(#g)"/><circle cx="300" cy="240" r="120" fill="#ffd166"/><path d="M0 560 Q260 470 520 560 T1024 540 V768 H0Z" fill="#3a86c8"/><rect x="620" y="330" width="240" height="190" fill="#b08968"/></svg>'
const IMG = `data:image/svg+xml;utf8,${encodeURIComponent(SVG)}`
const QID = '00000000-0000-4000-8000-0000000000bb'
const MC = {
  type: 'multipleChoice', question: 'כמה הם חצי ועוד שליש?', difficulty: 5,
  choices: [{ id: 'r', text: '5/6', isCorrect: true }, { id: 'w0', text: '2/5', isCorrect: false }, { id: 'w1', text: '1/6', isCorrect: false }, { id: 'w2', text: '2/6', isCorrect: false }],
  explanationCorrect: 'נכון. מכנה משותף 6: שלוש שישיות ועוד שתי שישיות.', explanationIncorrect: 'התשובה הנכונה היא 5/6.', retryHint: 'מצאו קודם מכנה משותף.',
}
const TF = { type: 'trueFalse', question: 'הנילוס עובר במצרים.', difficulty: 5, choices: [{ id: 't', text: 'נכון', isCorrect: true }, { id: 'f', text: 'לא נכון', isCorrect: false }], explanationCorrect: 'נכון, הנילוס עובר במצרים.', explanationIncorrect: 'התשובה הנכונה היא נכון.' }
const NARR = 'הנהר זורם בשקט בין השדות. על הגדה עומדת סירה קטנה, ובתוכה מפה ישנה. מי שיקרא אותה נכון ימצא את הדרך אל המעיין.'
const TAILS = ['', ' הרוח נושבת מן ההרים.', ' ציפור לבנה חגה מעל המים.', ' על החול נראים עקבות קטנים.', ' השמש כבר נוטה מערבה.', ' מרחוק נשמע קול פעמון.']
const scene = (i: number, n: number, puzzle: unknown) => ({ id: `s${i}`, title: `הגשר ${i}`, narrative: NARR + TAILS[i % TAILS.length], drHoloDialog: 'מה רואים על המפה?', imageUrl: IMG, imagePrompt: 'x', puzzle, nextSceneId: i < n ? `s${i + 1}` : null })
const lesson = (puzzles: unknown[], level = 10) => ({
  id: QID, title: 'מסע אל המעיין', subject: 'history', subject_code: 'history',
  game_data: {
    scenes: [{ id: 's0', title: 'המעבדה', narrative: 'ברוכים הבאים למעבדה. היום יוצאים למסע אל המעיין.', drHoloDialog: 'מוכנים לצאת לדרך?', imageUrl: IMG, imagePrompt: 'x', nextSceneId: 's1' }, ...puzzles.map((p, i) => scene(i + 1, puzzles.length, p))], entrySceneId: 's0', readingScale: level, holoMoods: { opening: 'רגיל', closed: 'שמח', open: 'עצוב' },
    endingGood: { title: 'המעיין נמצא', narrative: 'בזכותכם המים חזרו אל השדות.', drHoloDialog: 'פתרתם את התעלומה.', imageUrl: IMG },
    endingBad: { title: 'הסיפור עוד פתוח', narrative: 'חסרות עוד תובנות כדי למצוא את המעיין.', drHoloDialog: 'בואו נחזור ונגלה מה עוד מסתתר שם.', imageUrl: IMG },
  },
})

const fakeJwt = `x.${Buffer.from(JSON.stringify({ userId: 'stu-demo', role: 'student', classId: 'c1', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64')}.y`
async function ctxOf(browser: Browser, w: number, h: number, init: string, reduced = false): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, screen: { width: w, height: h }, deviceScaleFactor: 1, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', reducedMotion: reduced ? 'reduce' : 'no-preference' })
  await ctx.addInitScript(`(() => { if (!window.__name) window.__name = (f) => f; try { sessionStorage.setItem('holo_splash_seen','1'); ${init} } catch (e) {} })()`)
  return ctx
}
const STUDENT = `sessionStorage.setItem('holo_token','${fakeJwt}'); sessionStorage.setItem('holo_student_name','נועה לוי');`
const staffInit = (session: unknown) => `localStorage.setItem('holo_staff_session', ${JSON.stringify(JSON.stringify(session))});`

async function openGame(ctx: BrowserContext, quest: unknown): Promise<Page> {
  const page = await ctx.newPage()
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.route(`**/api/quests/${QID}`, (r) => r.fulfill({ json: { quest } }))
  await page.route('**/api/sessions/start', (r) => r.fulfill({ json: { sessionId: 'sess-1', resumed: false, currentSceneId: null, inventory: [], visitedScenes: [], crystals: 0, effectsLevel: 'medium', isReplay: false } }))
  await page.route('**/api/sessions/*/complete', (r) => r.fulfill({ json: { ok: true, profileUpdated: true } }))
  await page.route('**/api/sessions/class-gems/**', (r) => r.fulfill({ json: { available: true, classGems: 41, mine: 3, target: 72, allClosed: false } }))
  await page.route('**/api/sessions/assigned', (r) => r.fulfill({ json: { quests: [] } }))
  await page.goto(`${DEFAULT_BASE}/play/${QID}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.holo-text-area', { timeout: 30000 })
  return page
}
const startBtn = (page: Page) => page.getByRole('button', { name: /פתרו את האתגר|התחילו את מבחן הסיכום/ })
/* תשובה שהיא שבר ("2/5") מוצגת כמונה מעל מכנה, ולכן מאתרים אותה לפי התווית של השבר */
const choice = (page: Page, text: string | RegExp) => {
  const m = typeof text === 'string' ? /^(\d+)\/(\d+)$/.exec(text) : null
  if (m) return page.locator(`.holo-stage button:has([data-fraction][aria-label="${m[1]} חלקי ${m[2]}"])`).first()
  return page.locator('.holo-stage button', { hasText: text }).first()
}
async function openChallenge(page: Page): Promise<void> {
  try { await startBtn(page).click({ timeout: 12000 }) } catch (e) {
    await page.screenshot({ path: path.join(OUT, '_debug.png') })
    console.log('   buttons:', JSON.stringify(await page.locator('button:visible').allInnerTexts()))
    throw e
  }
  await page.waitForSelector('.holo-stage', { timeout: 10000 }); await page.waitForTimeout(950)
}
async function next(page: Page): Promise<void> {
  for (let i = 0; i < 24; i++) {
    if (await page.locator('[data-end-screen]').count()) return
    if (await startBtn(page).isVisible().catch(() => false)) return
    const b = page.locator('button:visible:not([disabled])', { hasText: /המשך|סיום|לסיכום/ }).last()
    if (await b.isVisible().catch(() => false)) await b.click({ timeout: 2000 }).catch(() => undefined)
    await page.waitForTimeout(450)
  }
}

async function game(browser: Browser): Promise<void> {
  console.log('== game ==')
  await safe('game-desktop', async () => {
    const ctx = await ctxOf(browser, 1366, 768, STUDENT)
    const page = await openGame(ctx, lesson([MC, MC, TF]))
    await page.waitForTimeout(2500); await shot(page, 'game-01-opening-lab')
    await next(page); await page.waitForTimeout(1500); await shot(page, 'game-02-page-text')
    await openChallenge(page); await shot(page, 'game-03-challenge')
    await choice(page, '2/5').click(); await page.waitForTimeout(600); await shot(page, 'game-04-wrong-first')
    await choice(page, '5/6').click(); await page.waitForTimeout(1300); await shot(page, 'game-05-correct')
    await next(page); await page.waitForTimeout(1200)
    await openChallenge(page); await choice(page, '2/5').click(); await page.waitForTimeout(400); await choice(page, '1/6').click(); await page.waitForTimeout(1300); await shot(page, 'game-06-wrong-final')
    await ctx.close()
  })
  for (const [gems, rights] of [[2, 2], [3, 3], [5, 5]] as const) {
    await safe(`end-${gems}`, async () => {
      const ctx = await ctxOf(browser, 1366, 768, STUDENT)
      const page = await openGame(ctx, lesson([TF, TF, TF, TF, TF]))
      await next(page)
      for (let i = 0; i < 5; i++) {
        await openChallenge(page)
        await choice(page, i < rights ? /^\s*נכון\s*$/ : /לא נכון/).click(); await page.waitForTimeout(900)
        if (i === 2) await shot(page, `hud-after-3-of-5-run${gems}`)
        await next(page)
      }
      await page.waitForSelector('[data-end-screen]', { timeout: 25000 })
      await page.waitForTimeout(3200); await shot(page, `end-${gems}-gems`)
      await page.waitForTimeout(1300); await shot(page, `end-${gems}-gems-b`)
      await ctx.close()
    })
  }
  await safe('end-5-reduced', async () => {
    const ctx = await ctxOf(browser, 1366, 768, STUDENT, true)
    const page = await openGame(ctx, lesson([TF, TF]))
    await next(page)
    for (let i = 0; i < 2; i++) { await openChallenge(page); await choice(page, /^\s*נכון\s*$/).click(); await page.waitForTimeout(600); await next(page) }
    await page.waitForSelector('[data-end-screen]', { timeout: 25000 }); await page.waitForTimeout(1500); await shot(page, 'end-5-gems-reduced-motion')
    await ctx.close()
  })
  await safe('game-mobile', async () => {
    const ctx = await ctxOf(browser, 740, 360, STUDENT)
    const page = await openGame(ctx, lesson([MC, TF]))
    await page.waitForTimeout(2500); await shot(page, 'mobile-01-opening-lab')
    await next(page); await page.waitForTimeout(1500); await shot(page, 'mobile-02-page-text')
    await openChallenge(page); await shot(page, 'mobile-03-challenge')
    await choice(page, '5/6').click(); await page.waitForTimeout(1300); await shot(page, 'mobile-04-correct')
    await ctx.close()
  })
  await safe('student-home', async () => {
    const ctx = await ctxOf(browser, 1366, 768, STUDENT)
    const page = await ctx.newPage()
    const day = 86_400_000
    const now = Date.now()
    const subj = ['math', 'history', 'science', 'hebrew', 'english', null]
    const titles = ['קרב השברים', 'מסע אל המעיין', 'טיפת המים', 'בלשי השורש', 'The Lost Key', 'שיעור בלי מקצוע']
    await page.route('**/api/**', (r) => r.fulfill({ json: {} }))
    await page.route('**/api/sessions/assigned', (r) => r.fulfill({ json: { quests: subj.map((s, i) => ({
      id: `q${i}`, title: titles[i], sceneCount: 6, artStyle: 'digital-painting', subjectCode: s, teacherName: 'המורה רון',
      assignedAt: new Date(now - (i + 1) * day).toISOString(), entryImageUrl: i === 4 ? null : IMG, thumbUrl: i === 4 ? null : IMG, gradeMin: 5, gradeMax: 6,
      dueAt: new Date(now + (i === 2 ? -2 : 3 + i) * day).toISOString(), state: i === 2 ? 'ended' : 'open', late: i === 4,
      sessionStatus: i === 3 || i === 4 ? 'completed' : i === 1 ? 'in_progress' : null, crystals: i === 3 ? 4 : i === 4 ? 2 : null, gems: i === 3 ? 5 : i === 4 ? 2 : null, maxScore: 5, isReview: i === 1,
    })) } }))
    await page.goto(`${DEFAULT_BASE}/student`, { waitUntil: 'networkidle' }).catch(() => undefined)
    await page.waitForTimeout(1500); await shot(page, 'student-home')
    await ctx.close()
  })
  await safe('projector', async () => {
    const session = await guestLogin(DEFAULT_API)
    const ctx = await ctxOf(browser, 1920, 1080, staffInit(session))
    const page = await openGame(ctx, lesson([MC, TF]))
    await next(page); await page.waitForTimeout(1500); await shot(page, 'projector-01-page-text')
    await openChallenge(page); await shot(page, 'projector-02-challenge')
    await ctx.close()
  })
}

async function staff(browser: Browser): Promise<void> {
  console.log('== staff ==')
  const session = await guestLogin(DEFAULT_API)
  const ctx = await ctxOf(browser, 1366, 768, staffInit(session))
  const page = await ctx.newPage()
  const go = async (name: string, url: string, wait = 1800) => safe(name, async () => { await page.goto(DEFAULT_BASE + url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => undefined); await page.waitForTimeout(wait); await shot(page, name) })
  await go('staff-01-new-lesson', '/creator')
  await go('staff-02-library', '/creator/library', 2500)
  await go('staff-03-lesson-summary-list', '/results', 2500)
  await safe('staff-04-lesson-summary-page', async () => {
    const link = page.locator('a[href^="/results/"]').first()
    await link.click({ timeout: 8000 }); await page.waitForTimeout(3000); await shot(page, 'staff-04-lesson-summary-page')
    const url = page.url()
    const id = new URL(url).pathname.split('/')[2]
    await page.goto(`${DEFAULT_BASE}/results/${id}?tab=challenges`, { waitUntil: 'networkidle' }).catch(() => undefined); await page.waitForTimeout(2000); await shot(page, 'staff-05-lesson-summary-challenges')
    await page.goto(`${DEFAULT_BASE}/results/${id}/live`, { waitUntil: 'networkidle' }).catch(() => undefined); await page.waitForTimeout(2000); await shot(page, 'staff-06-live-view')
  })
  await go('staff-07-progress-entry', '/analytics', 3000)
  await safe('staff-08-progress-class', async () => {
    await page.locator('[data-class-id]').first().click({ timeout: 8000 }); await page.waitForTimeout(3000); await shot(page, 'staff-08-progress-class')
  })
  await go('staff-09-admin-lens-progress', '/analytics?lens=admin', 3000)
  await go('staff-10-admin-lens-summary', '/results?lens=admin', 3000)
  await go('staff-11-manage', '/manage', 2500)
  await go('staff-12-students', '/manage/students', 2500)
  await ctx.close()

  await safe('superadmin', async () => {
    const fake = { access_token: 'e2e-fake', refresh_token: 'e2e-fake', expires_at: Math.floor(Date.now() / 1000) + 3000, staff: { userId: 'su', name: 'מנהל-על', role: 'super_admin', schoolId: null, email: 'su@example.test' } }
    const c2 = await ctxOf(browser, 1366, 768, staffInit(fake))
    const p = await c2.newPage()
    await p.route('**/api/**', (r) => r.fulfill({ json: {} }))
    await p.route('**/api/admin/schools', (r) => r.fulfill({ json: { schools: [{ id: 's1', name: 'בית ספר הדקל', slug: 'dekel', is_active: true, userCount: 212, activeUserCount: 205 }, { id: 's2', name: 'בית ספר הגפן', slug: 'gefen', is_active: false, userCount: 96, activeUserCount: 0 }] } }))
    await p.route('**/api/admin/reports**', (r) => r.fulfill({ json: { reports: [] } }))
    await p.route('**/api/admin/gen-stats', (r) => r.fulfill({ json: { days: [], anonConversion: null, anonActors: 0 } }))
    await p.route('**/api/funnel/summary', (r) => r.fulfill({ json: { sinceDays: 30, counts: { showcase_click: 42, visitor_play_start: 31, visitor_finish: 17, cta_whatsapp: 4, cta_create: 6, teacher_whatsapp: 3 }, topQuests: [] } }))
    await p.route('**/api/staff/teacher-requests', (r) => r.fulfill({ json: { requests: [] } }))
    await p.goto(`${DEFAULT_BASE}/admin`, { waitUntil: 'networkidle' }).catch(() => undefined); await p.waitForTimeout(1500); await shot(p, 'staff-13-superadmin')
    await c2.close()
  })
}

async function pub(browser: Browser): Promise<void> {
  console.log('== public ==')
  const ctx = await ctxOf(browser, 1366, 768, '')
  const page = await ctx.newPage()
  const go = async (name: string, url: string, wait = 2000) => safe(name, async () => { await page.goto(DEFAULT_BASE + url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => undefined); await page.waitForTimeout(wait); await shot(page, name) })
  await go('public-01-home', '/', 2500)
  await safe('public-01b-home-full', async () => { await page.screenshot({ path: path.join(OUT, 'public-01b-home-full.png'), fullPage: true }); done.push('public-01b-home-full') })
  await go('public-02-staff-login', '/staff/login')
  await go('public-03-staff-signup', '/staff/signup')
  await go('public-04-class-entry', '/class/demo-vav2', 2500)
  await ctx.close()
  await safe('public-05-splash', async () => {
    const c2 = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'he-IL' })
    const p = await c2.newPage(); await p.goto(DEFAULT_BASE + '/', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(900); await shot(p, 'public-05-splash'); await c2.close()
  })
}

const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
if (ONLY.includes('public')) await pub(browser)
if (ONLY.includes('staff')) await staff(browser)
if (ONLY.includes('game')) await game(browser)
await browser.close()
console.log(`\n${done.length} shots in ${OUT}`)
