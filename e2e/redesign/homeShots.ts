/* ──────────────────────────────────────────────────────────────────────────
   צילומי עמוד הפתיחה והספלאש. כלי בדיקה בלבד: קריאה בלבד (שיעורי ההתנסות מהשרת המקומי), בלי כתיבה ל-DB.
   · splash: פריימים של הספלאש לאורך הזמן (האנימציות מושהות ומקודמות ידנית), כולל הפתיחה אל העמוד.
   · home: המסך הראשון בכמה גדלי מסך, אחרי גלילה, במסך צר ובתנועה מופחתת; ובדיקות: הכניסות והכפתור "שחקו עכשיו"
     בתוך המסך הראשון, החלון לא מכסה את הפורטל, והווידאו של הרקע ושל ד"ר הולו מתנגנים.
   · student: הבית של התלמיד (אותה במה, עם /api מדומה): הפורטל מציג את השיעור האחרון שהתקבל, החצים מדפדפים,
     הרשימה שבתחתית מביאה שיעור אל הפורטל, החיפוש מסנן, והכפתור צולל לשיעור.
   · guest: כניסת אורחים (תלמיד אורח) מחלון קוד הכיתה: שיעורי ההתנסות בפורטל, הודעה שההתקדמות לא נשמרת,
     שום בקשה לשרת שכותבת משהו (אין /api/sessions ואין /api/auth), ויציאה שמנקה את מצב האורח.
   הרצה:  npx tsx e2e/redesign/homeShots.ts --out reports/redesign/stages/home [--only splash,home,student,guest]
   ────────────────────────────────────────────────────────────────────────── */
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium, type Browser, type Page } from 'playwright-core'
import { DEFAULT_BASE, findChrome } from '../lib/config.ts'

const args = process.argv.slice(2)
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d }
const OUT = opt('out', 'reports/redesign/stages/home')
const ONLY = opt('only', 'splash,home,student,guest').split(',')
mkdirSync(OUT, { recursive: true })
let failed = 0
const check = (ok: boolean, label: string) => { console.log(`  ${ok ? '✓' : '✗'} ${label}`); if (!ok) failed++ }
const shot = async (page: Page, name: string) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); console.log('  shot', name) }

async function open(browser: Browser, w: number, h: number, opts: { splash?: boolean; reduced?: boolean } = {}): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: 'he-IL', reducedMotion: opts.reduced ? 'reduce' : 'no-preference' })
  await ctx.addInitScript(`(() => { if (!window.__name) window.__name = (f) => f; try { ${opts.splash ? '' : "sessionStorage.setItem('holo_splash_seen','1');"} } catch (e) {} })()`)
  const page = await ctx.newPage()
  await page.goto(DEFAULT_BASE + '/', { waitUntil: 'domcontentloaded' })
  return page
}

async function splash(browser: Browser): Promise<void> {
  console.log('== splash ==')
  const page = await open(browser, 1366, 768, { splash: true })
  await page.waitForSelector('[data-splash]', { timeout: 30000 })
  /* מקדמים את האנימציות ידנית, כדי שכל פריים יהיה אותו דבר בכל הרצה */
  const at = async (ms: number, name: string) => {
    await page.evaluate((t) => { for (const a of document.querySelector('[data-splash]')!.getAnimations({ subtree: true })) { a.pause(); a.currentTime = t } }, ms)
    await shot(page, name)
  }
  await at(350, 'splash-1-gem-falls')
  await at(800, 'splash-2-sparks')
  await at(1100, 'splash-3-letters')
  await at(2200, 'splash-4-complete')
  /* הפתיחה: מחכים לשלב open, ואז מקדמים את הפתח */
  await page.waitForSelector('[data-splash][data-phase=open]', { timeout: 6000 }).catch(() => undefined)
  const open2 = async (ms: number, name: string) => {
    const ok = await page.evaluate((t) => { const el = document.querySelector('[data-splash]'); if (!el) return false; for (const a of el.getAnimations({ subtree: true })) { a.pause(); a.currentTime = t } return true }, ms)
    if (ok) await shot(page, name)
    return ok
  }
  const a = await open2(260, 'splash-5-opening')
  const b = await open2(520, 'splash-6-opening')
  check(a && b, 'הספלאש נפתח אל העמוד (שלב open)')
  await page.waitForSelector('[data-splash]', { state: 'detached', timeout: 8000 }).catch(() => undefined)
  check(await page.locator('[data-splash]').count() === 0, 'הספלאש נסגר בסוף')
  await page.context().close()

  const skip = await open(browser, 1366, 768, { splash: true })
  await skip.waitForSelector('[data-splash]', { timeout: 30000 })
  await skip.mouse.click(400, 300)
  await skip.waitForTimeout(200)
  check(await skip.locator('[data-splash]').count() === 0, 'לחיצה מדלגת על הספלאש')
  await skip.context().close()
}

async function home(browser: Browser): Promise<void> {
  console.log('== home ==')
  for (const [w, h] of [[1366, 768], [1366, 620], [1920, 1080], [1280, 800]] as const) {
    const page = await open(browser, w, h)
    await page.waitForSelector('[data-portal-panel]', { timeout: 30000 })
    await page.waitForTimeout(4500)
    await shot(page, `home-${w}x${h}`)
    const g = await page.evaluate(() => {
      const r = (s: string) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom } }
      const hit = document.querySelector('[data-lab-portal-hit]')?.getBoundingClientRect()
      const vids = [...document.querySelectorAll('video')].map((v) => ({ playing: !v.paused && v.readyState >= 2, src: v.currentSrc.split('/').pop() }))
      return { panel: r('[data-portal-panel]'), play: r('[data-home-play]'), now: r('[data-portal-under]'), bubble: r('[data-portal-bubble]'), portal: hit ? { l: hit.left, t: hit.top, r: hit.right, b: hit.bottom } : null, vids, vh: innerHeight, vw: innerWidth, holo: !!document.querySelector('[data-lab-holo]'), canvas: document.querySelectorAll('.lab-hologram').length }
    })
    const inside = (b: { l: number; t: number; r: number; b: number } | null) => !!b && b.t >= 0 && b.b <= g.vh + 0.5 && b.l >= 0 && b.r <= g.vw + 0.5
    check(inside(g.panel), `${w}×${h}: חלון הכניסות כולו במסך הראשון`)
    check(inside(g.play), `${w}×${h}: "שחקו עכשיו" במסך הראשון`)
    check(!!g.panel && !!g.portal && g.panel.l >= g.portal.r - 1, `${w}×${h}: החלון לא מכסה את הפורטל`)
    check(!!g.now && !!g.panel && g.now.r <= g.panel.l + 1, `${w}×${h}: שורת השיעור לא נכנסת מתחת לחלון`)
    check(g.vids.length >= 2 && g.vids.every((v) => v.playing), `${w}×${h}: הרקע וד"ר הולו מתנגנים (${g.vids.map((v) => v.src).join(', ')})`)
    check(g.canvas === 1, `${w}×${h}: הפורטל מציג הולוגרמה חיה`)
    await page.context().close()
  }

  /* גלילה למטה: המדף והשלבים */
  const sc = await open(browser, 1366, 768)
  await sc.waitForSelector('[data-portal-panel]')
  await sc.waitForTimeout(2500)
  await sc.locator('#home-how').scrollIntoViewIfNeeded()
  await sc.waitForTimeout(600)
  await shot(sc, 'home-more')
  await sc.context().close()

  /* מסך צר (טלפון לאורך) ומסך 4:3: הבמה למעלה והחלון מתחתיה */
  for (const [name, w, h] of [['phone', 390, 800], ['tablet-4x3', 1024, 768]] as const) {
    const p = await open(browser, w, h)
    await p.waitForSelector('[data-portal-panel]')
    await p.waitForTimeout(3500)
    await p.screenshot({ path: path.join(OUT, `home-${name}.png`), fullPage: false }); console.log('  shot', `home-${name}`)
    const ok = await p.evaluate(() => { const a = document.querySelector('[data-portal-panel]')!.getBoundingClientRect(); const s = document.querySelector('.home4-stage')!.getBoundingClientRect(); return a.top >= s.bottom - 40 && document.documentElement.scrollWidth <= innerWidth + 1 })
    check(ok, `${name}: החלון מתחת לבמה, בלי גלילה לרוחב`)
    await p.context().close()
  }

  /* תנועה מופחתת: תמונות קבועות, בלי וידאו */
  const rm = await open(browser, 1366, 768, { reduced: true })
  await rm.waitForSelector('[data-portal-panel]')
  await rm.waitForTimeout(2500)
  await shot(rm, 'home-reduced-motion')
  check(await rm.evaluate(() => [...document.querySelectorAll('video')].every((v) => v.paused)), 'תנועה מופחתת: שום וידאו לא מתנגן')
  await rm.context().close()

  /* הצלילה לפורטל פותחת את השיעור */
  const dv = await open(browser, 1366, 768)
  await dv.waitForSelector('[data-home-play]')
  await dv.waitForTimeout(2500)
  await dv.locator('[data-home-play]').click()
  await dv.waitForTimeout(600)
  await shot(dv, 'home-dive')
  await dv.waitForURL(/\/play\//, { timeout: 6000 }).catch(() => undefined)
  check(/\/play\//.test(dv.url()), `"שחקו עכשיו": צלילה לפורטל ואז השיעור נפתח (${new URL(dv.url()).pathname})`)
  await dv.context().close()
}

async function student(browser: Browser): Promise<void> {
  console.log('== student ==')
  const img = (a: string, b: string, c: string) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768"><rect width="1024" height="768" fill="${a}"/><circle cx="300" cy="240" r="120" fill="${b}"/><path d="M0 560 Q260 470 520 560 T1024 540 V768 H0Z" fill="${c}"/><rect x="620" y="330" width="240" height="190" fill="${b}"/></svg>`)}`
  const IMGS = [img('#7fb7d9', '#ffd166', '#3a86c8'), img('#e9d8a6', '#bc6c25', '#606c38'), img('#cdb4db', '#ffafcc', '#457b9d'), img('#94d2bd', '#ee9b00', '#005f73')]
  const day = 86_400_000, now = Date.now()
  const subj = ['math', 'history', 'science', 'hebrew', 'english', 'geography']
  const names = ['מתמטיקה', 'היסטוריה', 'מדעים', 'עברית', 'אנגלית', 'גאוגרפיה']
  const titles = ['קרב השברים', 'מסע אל המעיין', 'טיפת המים', 'בלשי השורש', 'The Lost Key', 'מפת האוצר של הנגב']
  /* השיעור הראשון (i=0) הוא האחרון שהתקבל */
  const quests = subj.map((s, i) => ({
    id: `q${i}`, title: titles[i], sceneCount: 6, artStyle: 'digital-painting', subject: names[i], subjectCode: s, teacherName: 'המורה רון',
    assignedAt: new Date(now - (i + 1) * day).toISOString(), entryImageUrl: IMGS[i % IMGS.length], thumbUrl: IMGS[i % IMGS.length], gradeMin: 5, gradeMax: 6,
    dueAt: new Date(now + (3 + i) * day).toISOString(), state: 'open', late: false,
    sessionStatus: i === 3 ? 'completed' : i === 1 ? 'in_progress' : null, crystals: i === 3 ? 4 : null, gems: i === 3 ? 4 : null, maxScore: 5, isReview: false, bookmarkPage: i === 1 ? 3 : null,
  }))
  const fakeJwt = `x.${Buffer.from(JSON.stringify({ userId: 'stu-demo', role: 'student', classId: 'c1', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64')}.y`
  const openStudent = async (w: number, h: number, list: unknown[] = quests): Promise<Page> => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
    await ctx.addInitScript(`(() => { if (!window.__name) window.__name = (f) => f; try { sessionStorage.setItem('holo_splash_seen','1'); sessionStorage.setItem('holo_token','${fakeJwt}'); sessionStorage.setItem('holo_student_name','נועה לוי') } catch (e) {} })()`)
    const page = await ctx.newPage()
    await page.route('**/api/**', (r) => r.fulfill({ json: {} }))
    await page.route('**/api/sessions/assigned', (r) => r.fulfill({ json: { quests: list } }))
    await page.goto(DEFAULT_BASE + '/student', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-portal-panel]', { timeout: 30000 })
    await page.waitForTimeout(3500)
    return page
  }
  const lessonTitle = (page: Page) => page.locator('[data-portal-lesson] [data-lesson-title]').innerText()

  for (const [w, h] of [[1366, 768], [1366, 620]] as const) {
    const page = await openStudent(w, h)
    await shot(page, `student-${w}x${h}`)
    const g = await page.evaluate(() => {
      const r = (s: string) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom } }
      return { panel: r('[data-portal-panel]'), play: r('[data-portal-play]'), vh: innerHeight, vw: innerWidth }
    })
    const inside = (b: { l: number; t: number; r: number; b: number } | null) => !!b && b.t >= 0 && b.b <= g.vh + 0.5 && b.l >= 0 && b.r <= g.vw + 0.5
    check(inside(g.panel) && inside(g.play), `${w}×${h}: החלון והכפתור במסך הראשון`)
    await page.context().close()
  }

  const page = await openStudent(1366, 768)
  check(await lessonTitle(page) === titles[0], `בכניסה: בפורטל השיעור האחרון שהתקבל (${await lessonTitle(page)})`)
  check((await page.locator('[data-portal-position]').innerText()).includes('1 מתוך 6'), 'מתחת לפורטל: "שיעור 1 מתוך 6"')
  check(!/סצנ/.test(await page.evaluate(() => document.body.innerText)), 'אין "סצנה" בעמוד')
  await page.locator('[data-portal-next]').click(); await page.waitForTimeout(500)
  check(await lessonTitle(page) === titles[1], `החץ מדפדף לשיעור הבא (${await lessonTitle(page)})`)
  check((await page.locator('[data-portal-state]').innerText()).includes('עמוד 3'), 'שיעור בקריאה: "בקריאה, עמוד 3"')
  await shot(page, 'student-reading')
  await page.locator('[data-portal-prev]').click(); await page.locator('[data-portal-prev]').click(); await page.waitForTimeout(500)
  check(await lessonTitle(page) === titles[5], `החץ אחורה מהראשון מגיע לאחרון (${await lessonTitle(page)})`)

  /* הרשימה שבתחתית: חיפוש ובחירה */
  await page.locator('#lesson-finder').scrollIntoViewIfNeeded(); await page.waitForTimeout(700)
  await shot(page, 'student-finder')
  check(await page.locator('[data-result]').count() === 6, 'ברשימה שש שורות, אחת לכל שיעור')
  await page.locator('[data-lesson-finder] input').fill('שורש'); await page.waitForTimeout(400)
  check(await page.locator('[data-result]').count() === 1, 'החיפוש מסנן את הרשימה')
  await page.locator('[data-result]').first().click(); await page.waitForTimeout(1200)
  check(await lessonTitle(page) === titles[3], `בחירה ברשימה מביאה את השיעור אל הפורטל (${await lessonTitle(page)})`)
  check(await page.evaluate(() => document.querySelector('[data-portal-hero]')!.getBoundingClientRect().top > -5), 'אחרי הבחירה העמוד חוזר למעלה, אל הפורטל')
  check(await page.locator('[data-portal-lesson] [role=img]').count() === 1, 'שיעור שהושלם: הגבישים מוצגים')
  await shot(page, 'student-done')

  /* כניסה לשיעור: צלילה לפורטל */
  await page.locator('[data-portal-play]').click()
  await page.waitForURL(/\/play\/q3/, { timeout: 6000 }).catch(() => undefined)
  check(/\/play\/q3/.test(page.url()), `הכפתור צולל לפורטל ופותח את השיעור (${new URL(page.url()).pathname})`)
  await page.context().close()

  /* בלי שיעורים */
  const empty = await openStudent(1366, 768, [])
  await shot(empty, 'student-empty')
  check(await empty.locator('[data-portal-empty]').count() === 1 && await empty.locator('[data-lesson-finder]').count() === 0, 'בלי שיעורים: הודעה בחלון, בלי רשימה')
  await empty.context().close()

  /* טלפון לאורך */
  const ph = await openStudent(390, 800)
  await ph.screenshot({ path: path.join(OUT, 'student-phone.png') }); console.log('  shot', 'student-phone')
  check(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'טלפון: בלי גלילה לרוחב')
  await ph.context().close()
}

async function guest(browser: Browser): Promise<void> {
  console.log('== guest ==')
  const page = await open(browser, 1366, 768)
  /* כל בקשה שאינה קריאה בלבד, וכל בקשה לנתיבי התלמיד או ההזדהות */
  const writes: string[] = []
  page.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/') && (r.method() !== 'GET' || /\/api\/(sessions|auth)\//.test(u.pathname))) writes.push(`${r.method()} ${u.pathname}`) })
  await page.waitForSelector('[data-home-door=student]', { timeout: 30000 })
  await page.waitForTimeout(1500)
  await page.locator('[data-home-door=student]').click()
  await page.waitForSelector('[data-guest-enter]')
  await page.waitForTimeout(300)
  await shot(page, 'guest-entry')
  await page.locator('[data-guest-enter]').click()
  await page.waitForURL(/\/student$/, { timeout: 6000 }).catch(() => undefined)
  await page.waitForSelector('[data-portal-lesson]', { timeout: 15000 }).catch(() => undefined)
  await page.waitForTimeout(3000)
  await shot(page, 'guest-student-home')
  check(/\/student$/.test(page.url()), 'כניסת אורחים מובילה לבית של התלמיד')
  check(await page.locator('[data-student-home][data-guest]').count() === 1 && await page.locator('[data-guest-note]').count() === 1, 'מסומן כאורח, עם ההודעה שההתקדמות לא נשמרת')
  const lessons = await page.locator('[data-result]').count()
  check(lessons >= 2, `שיעורי ההתנסות מוצגים (${lessons} ברשימה)`)
  check((await page.evaluate(() => document.body.innerText)).includes('אורחים'), 'השלום פונה לאורחים')
  /* מסמנים שיעור כאילו האורח סיים אותו (כמו שהנגן רושם בסוף משחק), ורואים שהפורטל מציג "הושלם" */
  const firstId = await page.locator('[data-portal-lesson]').getAttribute('data-portal-lesson')
  await page.evaluate((id) => sessionStorage.setItem('holo_guest_progress', JSON.stringify({ [id!]: 4 })), firstId)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-portal-lesson]', { timeout: 15000 })
  await page.waitForTimeout(1500)
  check((await page.locator('[data-portal-state]').innerText()).includes('הושלם') && await page.locator('[data-portal-lesson] [role=img]').count() === 1, 'שיעור שהאורח סיים: "הושלם" והגבישים (מהלשונית בלבד)')
  await page.locator('[data-portal-play]').click()
  await page.waitForURL(/\/play\//, { timeout: 6000 }).catch(() => undefined)
  check(/\/play\//.test(page.url()), 'האורח נכנס לשיעור דרך הפורטל')
  await page.waitForTimeout(2500)
  check(writes.length === 0, `שום בקשה לשרת שכותבת או מזדהה (${writes.join(', ') || 'אין'})`)
  /* חזרה ויציאה: מצב האורח נמחק */
  await page.goto(DEFAULT_BASE + '/student', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-portal-panel]')
  await page.getByRole('button', { name: 'יציאה' }).click()
  await page.waitForTimeout(600)
  check(await page.evaluate(() => !sessionStorage.getItem('holo_guest_student') && !sessionStorage.getItem('holo_guest_progress')), 'יציאה מנקה את מצב האורח')
  await page.goto(DEFAULT_BASE + '/student', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-guest-enter]', { timeout: 10000 }).catch(() => undefined)
  check(await page.locator('[data-portal-panel]').count() === 0 && await page.locator('[data-guest-enter]').count() === 1, 'אחרי היציאה: בלי כניסה אין ספרייה, ויש כפתור כניסת אורחים')
  await page.context().close()
}

const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
if (ONLY.includes('splash')) await splash(browser)
if (ONLY.includes('home')) await home(browser)
if (ONLY.includes('student')) await student(browser)
if (ONLY.includes('guest')) await guest(browser)
await browser.close()
console.log(failed ? `\n${failed} נכשלו` : '\nהכול עבר')
process.exit(failed ? 1 : 0)
