/* ──────────────────────────────────────────────────────────────────────────
   צילומי עמוד הפתיחה והספלאש. כלי בדיקה בלבד: קריאה בלבד (שיעורי ההתנסות מהשרת המקומי), בלי כתיבה ל-DB.
   · splash: פריימים של הספלאש לאורך הזמן (האנימציות מושהות ומקודמות ידנית), כולל הפתיחה אל העמוד.
   · home: העמוד במסך אחד בכמה גדלי מסך (פס עליון, במה, באנר השלבים, בלי גלילה), במסך צר ובתנועה מופחתת; ובדיקות: הכניסות והכפתור "שחקו עכשיו"
     בתוך המסך הראשון, החלון לא מכסה את הפורטל, והווידאו של הרקע ושל ד"ר הולו מתנגנים.
   · student: הבית של התלמיד (אותה במה, עם /api מדומה): פס עליון עם השלום והסיכום, הפורטל מציג את השיעור האחרון
     שהתקבל ועליו המצב כטקסט הולוגרפי, מתחתיו שם השיעור והחצים, ובחלון הצד רשימת השיעורים עם חיפוש וסינון.
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

/* מסך צר (החלון מתחת לבמה): כפתור הכניסה אף פעם לא מתחת לשם השיעור (לבקשת המשתמש).
   טלפון: "איפה אני?" וכפתור הכניסה בשורה אחת בראש הבמה, ושם השיעור בתחתית; טאבלט: הכפתור על הקו של שם השיעור, משמאלו */
async function narrowLayout(p: Page, name: string, playSel: string): Promise<void> {
  const g = await p.evaluate((sel) => {
    const r = (s: string) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom } }
    return { stage: r('.home4-stage'), where: r('[data-home-where]'), play: r(sel), row: r('.home4-now-row'), card: r('.home4-now-card'), panel: r('[data-portal-panel]') }
  }, playSel)
  const all = !!g.stage && !!g.where && !!g.play && !!g.row && !!g.card && !!g.panel
  if (!all) { check(false, `${name}: הכפתורים ושם השיעור מוצגים`); return }
  const { stage, where, play, row, card, panel } = g as { [k in keyof typeof g]: NonNullable<(typeof g)[k]> }
  const apart = (a: typeof play, b: typeof play) => a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t
  check(play.t < card.b - 1 && !(play.t >= card.b - 1), `${name}: כפתור הכניסה לא מתחת לשם השיעור`)
  check([where, play, row].every((b) => b.l >= stage.l && b.r <= stage.r && b.t >= stage.t && b.b <= Math.min(stage.b, panel.t)), `${name}: "איפה אני?", כפתור הכניסה ושם השיעור בתוך הבמה, מעל החלון`)
  check(apart(play, row) && apart(play, where) && apart(where, row), `${name}: הכפתורים ושם השיעור לא עולים זה על זה`)
  check(Math.abs((card.l + card.r) / 2 - (stage.l + stage.r) / 2) <= 2, `${name}: שם השיעור ממורכז מתחת לפורטל`)
  const sameLine = Math.abs(play.b - card.b) <= 1 && play.r <= row.l, topLine = Math.abs(play.t - where.t) <= 1 && play.l >= where.r
  check(sameLine || topLine, `${name}: כפתור הכניסה ${sameLine ? 'על הקו של שם השיעור, משמאלו' : topLine ? 'בראש הבמה, מול "איפה אני?"' : 'לא במקום'}`)
  if (sameLine) check(Math.abs(play.l - where.l) <= 1, `${name}: כפתור הכניסה ו"איפה אני?" מתחילים על אותה צלע שמאלית`)
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
  for (const [w, h] of [[1366, 768], [1366, 620], [1920, 1080], [1280, 800], [1536, 730], [1280, 600], [1100, 620]] as const) {
    const page = await open(browser, w, h)
    await page.waitForSelector('[data-portal-panel]', { timeout: 30000 })
    await page.waitForTimeout(4500)
    await shot(page, `home-${w}x${h}`)
    const g = await page.evaluate(() => {
      const r = (s: string) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom } }
      const hit = document.querySelector('[data-lab-portal-hit]')?.getBoundingClientRect()
      const vids = [...document.querySelectorAll('video')].map((v) => ({ playing: !v.paused && v.readyState >= 2, src: v.currentSrc.split('/').pop() }))
      return { panel: r('[data-portal-panel]'), play: r('[data-home-play]'), now: r('[data-portal-under]'), bubble: r('[data-portal-bubble]'), lesson: r('[data-home-lesson]'), card: r('[data-home-lesson] .home4-now-card'), where: r('[data-home-where]'), logo: r('[data-home-mark] img'), holoBox: r('[data-lab-holo]'), how: document.querySelector('[data-portal-panel] .holo-link')?.textContent?.trim() ?? '', portal: hit ? { l: hit.left, t: hit.top, r: hit.right, b: hit.bottom } : null, vids, vh: innerHeight, vw: innerWidth, holo: !!document.querySelector('[data-lab-holo]'), canvas: document.querySelectorAll('.lab-hologram').length }
    })
    const inside = (b: { l: number; t: number; r: number; b: number } | null) => !!b && b.t >= 0 && b.b <= g.vh + 0.5 && b.l >= 0 && b.r <= g.vw + 0.5
    check(inside(g.panel), `${w}×${h}: חלון הכניסות כולו במסך הראשון`)
    check(inside(g.play), `${w}×${h}: "שחקו עכשיו" במסך הראשון`)
    check(!!g.panel && !!g.portal && g.panel.l >= g.portal.r - 1, `${w}×${h}: החלון לא מכסה את הפורטל`)
    check(!!g.now && !!g.panel && g.now.r <= g.panel.l + 1, `${w}×${h}: שורת השיעור לא נכנסת מתחת לחלון`)
    check(g.vids.length >= 2 && g.vids.every((v) => v.playing), `${w}×${h}: הרקע וד"ר הולו מתנגנים (${g.vids.map((v) => v.src).join(', ')})`)
    check(g.vids.some((v) => v.src === 'idle.mp4') && !g.vids.some((v) => v.src === 'welcome.mp4'), `${w}×${h}: ד"ר הולו בלופ העמידה המחויך (idle), ולא ב"ברוכים הבאים"`)
    check(g.canvas === 1, `${w}×${h}: הפורטל מציג הולוגרמה חיה`)
    /* "שחקו עכשיו" באותה שורה, משמאל לשם השיעור ולחצים */
    check(!!g.play && !!g.lesson && g.play.r <= g.lesson.l + 1 && g.play.t < g.lesson.b && g.play.b > g.lesson.t, `${w}×${h}: "שחקו עכשיו" משמאל לשם השיעור, באותה שורה`)
    {
      /* שם השיעור ממורכז מתחת לפורטל, והקו התחתון של המסגרת שלו בגובה הקו התחתון של החלון; "שחקו עכשיו" על אותו קו, מעל ד"ר הולו */
      const mid = (b: { l: number; r: number }) => (b.l + b.r) / 2
      const ok = !!g.card && !!g.portal && !!g.panel && !!g.play && !!g.holoBox
      check(ok && Math.abs(mid(g.card!) - mid(g.portal!)) <= 2, `${w}×${h}: שם השיעור ממורכז מתחת לפורטל (${ok ? (mid(g.card!) - mid(g.portal!)).toFixed(1) : '?'})`)
      /* בבמה נמוכה שם השיעור עולה מעט על השפה התחתונה של הפתח (עד עשירית מהגובה שלו), ולא יותר */
      const lip = ok ? Math.max(0, g.portal!.b - g.card!.t) / (g.portal!.b - g.portal!.t) : 1
      check(ok && Math.abs(g.card!.b - g.panel!.b) <= 1 && lip <= 0.1, `${w}×${h}: הקו התחתון של שם השיעור בגובה הקו התחתון של החלון (${ok ? (g.card!.b - g.panel!.b).toFixed(1) : '?'}), מתחת לפתח הפורטל (מכסה ${(lip * 100).toFixed(0)}% ממנו)`)
      check(ok && Math.abs(g.play!.b - g.card!.b) <= 1 && g.play!.l < mid(g.holoBox!) && g.play!.r > mid(g.holoBox!), `${w}×${h}: "שחקו עכשיו" על אותו קו, מעל ד"ר הולו`)
    }
    check(!g.bubble, `${w}×${h}: אין בועת דיבור`)
    check(inside(g.where) && !!g.portal && !!g.where && g.where.r <= g.portal.l + 1, `${w}×${h}: הכפתור "איפה אני?" במסך הראשון, ולא על הפורטל`)
    {
      /* המסגרת: כל הממשק על הצלעות של מלבן אחד. למעלה, למטה ומימין: הקצוות של החלון; משמאל: הקצה השמאלי של "איפה אני?" */
      const cx = (b: { l: number; r: number }) => (b.l + b.r) / 2
      const dx = g.where && g.holoBox ? Math.abs(cx(g.where) - cx(g.holoBox)) : 99, dy = g.where && g.panel ? Math.abs(g.where.t - g.panel.t) : 99
      check(dx <= 3 && dy <= 1, `${w}×${h}: "איפה אני?" מעל הראש של ד"ר הולו, והקצה העליון שלו על הקו העליון של החלון (סטייה ${dx.toFixed(1)}, ${dy.toFixed(1)} פיקסלים)`)
      const dl = g.where && g.play ? Math.abs(g.play.l - g.where.l) : 99
      check(dl <= 1, `${w}×${h}: "שחקו עכשיו" מתחיל על הצלע השמאלית של המסגרת, כמו "איפה אני?" (סטייה ${dl.toFixed(1)} פיקסלים)`)
      check(!!g.where && !!g.holoBox && g.where.b <= g.holoBox.t + 40, `${w}×${h}: הכפתור מעל הדמות ולא עליה`)
    }
    {
      /* הכול במסך אחד, בלי גלילה (לבקשת המשתמש, לפי המוקאפ שלו): פס עליון, הבמה, ובאנר השלבים */
      const f = await page.evaluate(() => {
        const r = (sel: string) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom } }
        const p = document.querySelector<HTMLElement>('[data-portal-panel]')!
        const shown = [...p.children].filter((c) => getComputedStyle(c).display !== 'none' && getComputedStyle(c).position !== 'absolute')
        const steps = [...document.querySelectorAll('[data-home-band] .home3-step-card')].map((e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom } })
        return {
          scroll: Math.max(document.body.scrollHeight - document.body.clientHeight, document.documentElement.scrollHeight - innerHeight), strip: r('[data-home-strip]'), stage: r('.home4-stage'), band: r('[data-home-band]'),
          title: document.querySelector('[data-home-band] h2')?.textContent?.trim() ?? '', steps, chips: document.querySelectorAll('[data-home-strip] li').length, brief: r('[data-home-strip] a'),
          panelCut: p.scrollHeight - p.clientHeight, lastIn: shown.length ? shown[shown.length - 1].getBoundingClientRect().bottom <= p.getBoundingClientRect().bottom - 4 : false,
          howShown: !!document.querySelector('.home4-how-link') && getComputedStyle(document.querySelector('.home4-how-link')!).display !== 'none',
        }
      })
      check(f.scroll <= 0, `${w}×${h}: העמוד כולו במסך אחד, בלי גלילה (${f.scroll})`)
      check(!!f.strip && !!f.stage && !!f.band && f.strip.t === 0 && f.strip.b <= f.stage.t + 1 && f.stage.b <= f.band.t + 4 && f.band.b <= g.vh + 0.5, `${w}×${h}: פס עליון, הבמה, ומתחתיה באנר השלבים`)
      check(f.chips === 4 && inside(f.brief) && !!f.strip && !!f.brief && f.brief.b <= f.strip.b, `${w}×${h}: בפס העליון ארבעת היתרונות והתקציר לרשויות ולבתי ספר`)
      check(f.title === 'שיעורי הרפתקה אינטראקטיביים — בכל מקצוע, שכבה ורמה', `${w}×${h}: כותרת הבאנר (${f.title})`)
      check(f.steps.length === 3 && f.steps.every((b) => inside(b)) && f.steps.every((b) => Math.abs(b.t - f.steps[0].t) <= 1), `${w}×${h}: שלושת השלבים בשורה אחת, כולם במסך`)
      check(f.panelCut <= 0 && f.lastIn, `${w}×${h}: שום דבר בחלון הכניסות לא נחתך (${f.panelCut})`)
      check(!f.howShown, `${w}×${h}: בלי הקישור "איך זה עובד?" (השלבים כבר מוצגים)`)
    }
    await page.context().close()
  }

  /* מעבר בין שיעורים בפורטל: קו אור חושף את התמונה הבאה (בלי חיתוך ובלי רגע ריק), ושם השיעור מחליק */
  {
    const tp = await open(browser, 1366, 768)
    await tp.waitForSelector('[data-lab-hologram=on]', { timeout: 20000 }); await tp.waitForTimeout(1500)
    await tp.hover('[data-home-lesson]')
    const rects = () => tp.evaluate(() => ['[data-home-lesson] .home4-now-card', '[data-home-play]', '.home4-arrow'].map((s) => { const b = document.querySelector(s)!.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(Math.round).join(',') }).join(' | '))
    const before = await rects()
    const title0 = await tp.locator('.home4-now-title').innerText()
    /* מעקב אחרי ההולוגרמה לאורך המעבר: היא לא נכבית אפילו לרגע */
    await tp.evaluate(() => { const w = window as unknown as { __holoOff: number; __phases: string[] }; w.__holoOff = 0; w.__phases = []; const c = document.querySelector('[data-lab-hologram]')!; new MutationObserver(() => { if (c.getAttribute('data-lab-hologram') !== 'on') w.__holoOff++ }).observe(c, { attributes: true }); const sw = document.querySelector('.swap-slide')!; new MutationObserver(() => { const p = sw.getAttribute('data-phase'); if (p) w.__phases.push(p) }).observe(sw, { attributes: true }) })
    await tp.locator('button[aria-label="השיעור הבא"]').click()
    const swapOn = await tp.waitForSelector('[data-lab-hologram][data-portal-swap=forward]', { timeout: 3000 }).then(() => true, () => false)
    check(swapOn, 'החלפת שיעור: מעבר סריקה בפורטל, קדימה')
    await tp.waitForTimeout(380); await shot(tp, 'home-portal-swap')
    const swapOff = await tp.waitForFunction(() => !document.querySelector('[data-lab-hologram]')?.hasAttribute('data-portal-swap'), undefined, { timeout: 3000 }).then(() => true, () => false)
    const seen = await tp.evaluate(() => { const w = window as unknown as { __holoOff: number; __phases: string[] }; return { off: w.__holoOff, phases: w.__phases.join(',') } })
    check(swapOff && seen.off === 0, `המעבר מסתיים, וההולוגרמה לא נכבית באמצע (${seen.off})`)
    check(seen.phases.startsWith('out') && seen.phases.includes('in'), `שם השיעור מחליק החוצה ואז פנימה (${seen.phases})`)
    check(await tp.locator('.home4-now-title').innerText() !== title0, 'אחרי המעבר מוצג שם השיעור הבא')
    check(await rects() === before, 'הכרטיס, החצים והכפתור לא זזים כשהשם מתחלף')
    await tp.locator('button[aria-label="השיעור הקודם"]').click()
    check(await tp.waitForSelector('[data-lab-hologram][data-portal-swap=back]', { timeout: 3000 }).then(() => true, () => false), 'חזרה לשיעור הקודם: המעבר בכיוון ההפוך')
    await tp.context().close()
    /* תנועה מופחתת: ההחלפה מיידית */
    const rp = await open(browser, 1366, 768, { reduced: true })
    await rp.waitForSelector('[data-home-lesson]'); await rp.waitForTimeout(1500)
    const t0 = await rp.locator('.home4-now-title').innerText()
    await rp.locator('button[aria-label="השיעור הבא"]').click(); await rp.waitForTimeout(80)
    check(await rp.locator('.home4-now-title').innerText() !== t0 && await rp.locator('[data-lab-hologram]').count() === 0, 'תנועה מופחתת: השם והתמונה מתחלפים מיד, בלי מעבר')
    await rp.context().close()
  }

  /* "איפה אני?": חלון הסבר על הספרייה, על ד"ר הולו ועל המערכת */
  for (const [w, h] of [[1366, 768], [1366, 620], [390, 800]] as const) {
    const wp = await open(browser, w, h)
    await wp.waitForSelector('[data-home-where]'); await wp.waitForTimeout(2600)
    if (w === 390) check(await wp.evaluate(() => { const b = document.querySelector('[data-home-where]')!.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth && b.top >= 0 }), `${w}×${h}: הכפתור "איפה אני?" כולו בתוך המסך`)
    await wp.locator('[data-home-where]').click(); await wp.waitForSelector('[data-where-am-i]'); await wp.waitForTimeout(400)
    await shot(wp, `home-where-${w}x${h}`)
    const d = await wp.evaluate(() => {
      const e = document.querySelector<HTMLElement>('[data-where-am-i]')!; const b = e.getBoundingClientRect()
      return { fits: b.top >= 0 && b.bottom <= innerHeight + 0.5 && b.left >= 0 && b.right <= innerWidth + 0.5, parts: [...e.querySelectorAll('[data-where-part]')].map((x) => (x as HTMLElement).dataset.wherePart), text: e.innerText, focus: document.activeElement === e.querySelector('[data-where-close]') }
    })
    check(d.fits, `${w}×${h}: חלון "איפה אני?" כולו במסך`)
    check(d.parts.join(',') === 'library,holo,system' && d.text.includes('הספרייה ההולוגרפית') && d.text.includes('ד״ר הולו') && d.text.includes('HoloAcademy'), `${w}×${h}: שלושה חלקים: הספרייה, ד"ר הולו והמערכת`)
    if (w === 1366 && h === 768) {
      check(d.focus, 'החלון נפתח עם הפוקוס על "סגירה"')
      await wp.keyboard.press('Escape'); await wp.waitForTimeout(300)
      check(await wp.locator('[data-where-am-i]').count() === 0, 'Escape סוגר את החלון')
      await wp.locator('[data-home-where]').click(); await wp.waitForSelector('[data-where-am-i]')
      await wp.locator('[data-where-close]').click(); await wp.waitForTimeout(300)
      check(await wp.locator('[data-where-am-i]').count() === 0, '"סגירה" סוגר את החלון')
      await wp.locator('[data-home-where]').click(); await wp.waitForSelector('[data-where-am-i]')
      await wp.locator('[data-where-play]').click()
      await wp.waitForURL(/\/play\//, { timeout: 6000 }).catch(() => undefined)
      check(/\/play\//.test(wp.url()), '"שחקו עכשיו" בחלון: צלילה לפורטל ואז השיעור נפתח')
    }
    await wp.context().close()
  }

  /* מסך צר: העמוד נגלל. "איך זה עובד?" מוצג בחלון וגולל אל השלבים, והיתרונות בסוף העמוד */
  const sc = await open(browser, 390, 800)
  await sc.waitForSelector('[data-portal-panel]')
  await sc.waitForTimeout(2500)
  check((await sc.locator('.home4-how-link').innerText()).trim() === 'איך זה עובד?', 'מסך צר: הקישור "איך זה עובד?" מוצג בחלון, בלי חץ')
  await sc.locator('.home4-how-link').click()
  await sc.waitForTimeout(900)
  await shot(sc, 'home-more')
  check(await sc.evaluate(() => { const b = document.querySelector('[data-home-band] h2')!.getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight }), 'מסך צר: הקישור גולל אל השלבים')
  check(await sc.evaluate(() => { const band = document.querySelector('[data-home-band]')!.getBoundingClientRect(); const strip = document.querySelector('[data-home-strip]')!.getBoundingClientRect(); const hero = document.querySelector('[data-portal-hero]')!.getBoundingClientRect(); return hero.bottom <= band.top + 1 && band.bottom <= strip.top + 1 }), 'מסך צר: הסדר הוא הבמה והחלון, השלבים, ובסוף היתרונות')
  /* חלון נמוך מדי למסך אחד: העמוד נגלל, ושום דבר לא נחתך */
  const low = await open(browser, 1366, 520)
  await low.waitForSelector('[data-portal-panel]')
  await low.waitForTimeout(2500)
  check(await low.evaluate(() => { const p = document.querySelector<HTMLElement>('[data-portal-panel]')!; return p.scrollHeight <= p.clientHeight && document.body.scrollHeight > document.body.clientHeight }), 'חלון נמוך מדי (1366×520): העמוד נגלל, והחלון לא נחתך')
  await low.context().close()
  await sc.context().close()

  /* מסך צר (טלפון לאורך) ומסך 4:3: הבמה למעלה והחלון מתחתיה */
  for (const [name, w, h] of [['phone', 390, 800], ['phone-small', 320, 640], ['tablet-portrait', 768, 1024], ['tablet-4x3', 1024, 768]] as const) {
    const p = await open(browser, w, h)
    await p.waitForSelector('[data-portal-panel]')
    await p.waitForTimeout(3500)
    await p.screenshot({ path: path.join(OUT, `home-${name}.png`), fullPage: false }); console.log('  shot', `home-${name}`)
    const ok = await p.evaluate(() => { const a = document.querySelector('[data-portal-panel]')!.getBoundingClientRect(); const s = document.querySelector('.home4-stage')!.getBoundingClientRect(); return a.top >= s.bottom - 40 && document.documentElement.scrollWidth <= innerWidth + 1 })
    check(ok, `${name}: החלון מתחת לבמה, בלי גלילה לרוחב`)
    await narrowLayout(p, name, '[data-home-play]')
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

  for (const [w, h] of [[1366, 768], [1366, 620], [1920, 1080]] as const) {
    const page = await openStudent(w, h)
    await shot(page, `student-${w}x${h}`)
    const g = await page.evaluate(() => {
      const r = (s: string) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom } }
      const hit = document.querySelector('[data-lab-portal-hit]')?.getBoundingClientRect()
      const list = document.querySelector('[data-lesson-list]')
      return {
        top: r('[data-portal-top]'), panel: r('[data-portal-panel]'), play: r('[data-portal-play]'), under: r('[data-portal-under]'), caption: r('[data-portal-caption]'), stage: r('.home4-stage'),
        card: r('[data-portal-lesson]'), where: r('[data-home-where]'), holoBox: r('[data-lab-holo]'), bubble: !!document.querySelector('[data-portal-bubble]'),
        portal: hit ? { l: hit.left, t: hit.top, r: hit.right, b: hit.bottom } : null, rows: [...document.querySelectorAll('[data-result]')].filter((e) => { const b = e.getBoundingClientRect(), l = list!.getBoundingClientRect(); return b.top >= l.top - 1 && b.bottom <= l.bottom + 1 }).length,
        vh: innerHeight, vw: innerWidth, pageScroll: document.body.scrollHeight > document.body.clientHeight + 1 && document.querySelector('[data-portal-hero]')!.getBoundingClientRect().bottom > innerHeight + 1,
      }
    })
    const inside = (b: { l: number; t: number; r: number; b: number } | null) => !!b && b.t >= 0 && b.b <= g.vh + 0.5 && b.l >= 0 && b.r <= g.vw + 0.5
    check(inside(g.top) && inside(g.panel) && inside(g.play), `${w}×${h}: הפס העליון, החלון והכפתור במסך הראשון`)
    check(!!g.top && !!g.stage && Math.abs(g.stage.t - g.top.b) < 1.5, `${w}×${h}: הבמה מתחילה מתחת לפס העליון`)
    check(!!g.panel && !!g.portal && g.panel.l >= g.portal.r - 1, `${w}×${h}: רשימת השיעורים לא מכסה את הפורטל`)
    check(!!g.caption && !!g.portal && g.caption.l >= g.portal.l && g.caption.r <= g.portal.r && g.caption.t >= g.portal.t && g.caption.b <= g.portal.b, `${w}×${h}: המצב מוקרן בתוך הפורטל`)
    check(!!g.caption && !!g.under && g.caption.b <= g.under.t + 1, `${w}×${h}: הטקסט שעל הפורטל לא מוסתר על ידי השורה שמתחתיו`)
    check(g.rows >= 3, `${w}×${h}: ברשימה נראות לפחות שלוש שורות בלי גלילה (${g.rows})`)
    {
      /* אותו סידור כמו בעמוד הפתיחה (לבקשת המשתמש): הכול על הצלעות של מלבן אחד, בלי בועת דיבור */
      const mid = (b: { l: number; r: number }) => (b.l + b.r) / 2
      const ok = !!g.card && !!g.portal && !!g.panel && !!g.play && !!g.where && !!g.holoBox
      check(!g.bubble, `${w}×${h}: אין בועת דיבור`)
      check(ok && Math.abs(mid(g.card!) - mid(g.portal!)) <= 2 && Math.abs(g.card!.b - g.panel!.b) <= 1, `${w}×${h}: שם השיעור ממורכז מתחת לפורטל, על הקו התחתון של החלון`)
      check(ok && Math.abs(g.play!.b - g.panel!.b) <= 1 && Math.abs(g.play!.l - g.where!.l) <= 1, `${w}×${h}: כפתור הכניסה על אותו קו, ומתחיל על הצלע השמאלית כמו "איפה אני?"`)
      check(ok && Math.abs(g.where!.t - g.panel!.t) <= 1 && Math.abs(mid(g.where!) - mid(g.holoBox!)) <= 3 && inside(g.where), `${w}×${h}: "איפה אני?" מעל הראש של ד"ר הולו, על הקו העליון של החלון`)
      check(ok && g.play!.r <= g.card!.l && g.where!.r <= g.portal!.l + 1, `${w}×${h}: הכפתורים לא על הפורטל ולא על שם השיעור`)
    }
    await page.context().close()
  }

  const page = await openStudent(1366, 768)
  /* ד"ר הולו ממתין ליד הפורטל בלופ העמידה המחויך (הווידאו מתחיל אחרי מדידת הקצב) */
  const idleOn = await page.waitForFunction(() => [...document.querySelectorAll('video')].some((v) => v.currentSrc.endsWith('/dr-holo/v2/idle.mp4') && !v.paused && v.readyState >= 2), undefined, { timeout: 12000 }).then(() => true, () => false)
  check(idleOn && await page.evaluate(() => ![...document.querySelectorAll('video')].some((v) => v.currentSrc.endsWith('welcome.mp4'))), 'ד"ר הולו בלופ העמידה המחויך (idle), ולא ב"ברוכים הבאים"')
  check(await lessonTitle(page) === titles[0], `בכניסה: בפורטל השיעור האחרון שהתקבל, והשם שלו מתחת לפורטל (${await lessonTitle(page)})`)
  check((await page.locator('[data-portal-position]').textContent() ?? '').includes('1 מתוך 6'), 'לקוראי מסך: "שיעור 1 מתוך 6" והמצב')
  check(!/סצנ/.test(await page.evaluate(() => document.body.innerText)), 'אין "סצנה" בעמוד')
  /* הפס העליון: השלום והסיכום */
  const hello = await page.locator('[data-portal-hello]').innerText()
  check(/(בוקר טוב|צהריים טובים|ערב טוב|לילה טוב)/.test(hello) && hello.includes('נועה לוי'), `הפס העליון: שלום לפי השעה, עם השם (${hello.replace(/\s+/g, ' ')})`)
  const stat = async (k: string) => (await page.locator(`[data-stat=${k}]`).innerText()).replace(/\s+/g, ' ')
  check((await stat('gems')).includes('4') && (await stat('done')).includes('1 מתוך 6') && (await stat('paused')).includes('1'), `הסיכום: ${await stat('gems')} | ${await stat('done')} | ${await stat('paused')}`)
  check(await page.locator('[data-portal-state=notDone]').count() === 1 && (await page.locator('[data-portal-state]').innerText()).includes('לא הושלם'), 'שיעור שלא הותחל: על הפורטל "לא הושלם"')
  check(await page.locator('.shome-status').count() === 0 && await page.evaluate(() => getComputedStyle(document.querySelector('[data-portal-caption] .pcap')!).backgroundColor === 'rgba(0, 0, 0, 0)'), 'המצב הוא שכבת טקסט, בלי תיבה')
  /* "איפה אני?": אותו חלון הסבר, והכפתור שבו לפי מצב השיעור */
  await page.locator('[data-home-where]').click()
  check(await page.locator('[data-where-am-i] [data-where-part]').count() === 3 && (await page.locator('[data-where-play]').innerText()).trim() === (await page.locator('[data-portal-play]').innerText()).trim(), 'חלון "איפה אני?": שלושה חלקים, והכפתור כמו כפתור הכניסה לשיעור')
  await shot(page, 'student-where')
  await page.keyboard.press('Escape')
  check(await page.locator('[data-where-am-i]').count() === 0, 'Escape סוגר את החלון')
  await page.locator('[data-portal-next]').click(); await page.waitForTimeout(700)
  check(await lessonTitle(page) === titles[1], `החץ מדפדף לשיעור הבא (${await lessonTitle(page)})`)
  check(await page.locator('[data-portal-state=paused]').count() === 1 && (await page.locator('[data-portal-state]').innerText()).includes('עמוד 3'), 'שיעור שהופסק: על הפורטל "הופסק באמצע" והעמוד')
  check(await page.locator('[data-result][aria-pressed=true]').getAttribute('data-result') === 'q1', 'השורה של השיעור שבפורטל מסומנת ברשימה')
  await shot(page, 'student-paused')
  await page.locator('[data-portal-prev]').click(); await page.locator('[data-portal-prev]').click(); await page.waitForTimeout(500)
  check(await lessonTitle(page) === titles[5], `החץ אחורה מהראשון מגיע לאחרון (${await lessonTitle(page)})`)
  check(await page.evaluate(() => { const l = document.querySelector('[data-lesson-list]')!.getBoundingClientRect(); const r = document.querySelector('[data-result][aria-pressed=true]')!.getBoundingClientRect(); return r.top >= l.top - 1 && r.bottom <= l.bottom + 1 }), 'הרשימה נגללת אל השורה של השיעור שבפורטל')

  /* הרשימה שבחלון הצד: חיפוש, סינון ובחירה */
  check(await page.locator('[data-result]').count() === 6, 'ברשימה שש שורות, אחת לכל שיעור')
  await page.locator('[data-filter=status]').selectOption('in_progress'); await page.waitForTimeout(400)
  check(await page.locator('[data-result]').count() === 1 && await lessonTitle(page) === titles[1], 'סינון לפי מצב: רק השיעור שהופסק, והוא בפורטל')
  await page.locator('[data-filter=status]').selectOption('all')
  await page.locator('[data-lesson-search]').fill('שורש'); await page.waitForTimeout(400)
  check(await page.locator('[data-result]').count() === 1, 'החיפוש מסנן את הרשימה')
  await page.locator('[data-lesson-search]').fill(''); await page.waitForTimeout(300)
  await page.locator('[data-result=q3]').click(); await page.waitForTimeout(1200)
  check(await lessonTitle(page) === titles[3], `בחירה ברשימה מביאה את השיעור אל הפורטל (${await lessonTitle(page)})`)
  check(await page.locator('[data-portal-state=done]').count() === 1 && (await page.locator('[data-portal-state]').innerText()).includes('4 גבישים מתוך 5'), 'שיעור שהושלם: על הפורטל "הושלם" והגבישים')
  check(await page.locator('[data-result][aria-pressed=true] [role=img]').count() === 1, 'שיעור שהושלם: הגבישים מוצגים גם בשורה שלו')
  await shot(page, 'student-done')
  await page.locator('[data-lesson-search]').fill('אין שיעור כזה'); await page.waitForTimeout(400)
  check(await page.locator('[data-portal-nomatch]').count() === 1 && await page.locator('[data-portal-caption]').count() === 0, 'חיפוש בלי תוצאות: הודעה בחלון, והפורטל ריק')
  await shot(page, 'student-nomatch')
  await page.locator('[data-portal-nomatch] button').click(); await page.waitForTimeout(400)
  await page.locator('[data-result=q3]').click(); await page.waitForTimeout(600)

  /* כניסה לשיעור: צלילה לפורטל */
  await page.locator('[data-portal-play]').click()
  await page.waitForURL(/\/play\/q3/, { timeout: 6000 }).catch(() => undefined)
  check(/\/play\/q3/.test(page.url()), `הכפתור צולל לפורטל ופותח את השיעור (${new URL(page.url()).pathname})`)
  await page.context().close()

  /* גלילה למטה: המסע שלי */
  const jr = await openStudent(1366, 768)
  await jr.locator('#my-journey').scrollIntoViewIfNeeded(); await jr.waitForTimeout(700)
  await shot(jr, 'student-journey')
  check(await jr.locator('[data-my-journey]').count() === 1, 'בגלילה למטה: המסע שלי')
  await jr.context().close()

  /* בלי שיעורים */
  const empty = await openStudent(1366, 768, [])
  await shot(empty, 'student-empty')
  check(await empty.locator('[data-portal-empty]').count() === 1 && await empty.locator('[data-lesson-list]').count() === 0 && await empty.locator('[data-portal-stats]').count() === 0, 'בלי שיעורים: הודעה בחלון, בלי רשימה ובלי סיכום')
  await empty.context().close()

  /* טאבלט 4:3 וטלפון לאורך: הבמה למעלה והרשימה מתחתיה */
  for (const [name, w, h] of [['tablet-4x3', 1024, 768], ['tablet-portrait', 768, 1024], ['phone', 390, 800], ['phone-small', 320, 640]] as const) {
    const ph = await openStudent(w, h)
    await ph.screenshot({ path: path.join(OUT, `student-${name}.png`) }); console.log('  shot', `student-${name}`)
    check(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.body.scrollWidth <= innerWidth + 1), `${name}: בלי גלילה לרוחב`)
    check(await ph.evaluate(() => { const c = document.querySelector('[data-portal-caption]')?.getBoundingClientRect(); const u = document.querySelector('.home4-now-row')?.getBoundingClientRect(); return !!c && !!u && c.bottom <= u.top + 1 }), `${name}: הטקסט שעל הפורטל מעל השורה שמתחתיו`)
    await narrowLayout(ph, name, '[data-portal-play]')
    {
      /* גם בשיעור שהופסק באמצע, שבו הכפתור ארוך יותר ("המשיכו לקרוא") */
      await ph.locator('[data-portal-next]').click(); await ph.waitForTimeout(700)
      await narrowLayout(ph, `${name}, שיעור שהופסק`, '[data-portal-play]')
      check(await ph.evaluate(() => { const c = document.querySelector('[data-portal-caption]')?.getBoundingClientRect(); const pl = document.querySelector('[data-portal-play]')?.getBoundingClientRect(); const w = document.querySelector('[data-home-where]')?.getBoundingClientRect(); return !!c && !!pl && !!w && [pl, w].every((b) => b.bottom <= c.top || b.top >= c.bottom || b.right <= c.left || b.left >= c.right) }), `${name}: הכפתורים לא מכסים את הטקסט שעל הפורטל`)
      await ph.screenshot({ path: path.join(OUT, `student-${name}-paused.png`) })
    }
    await ph.context().close()
  }
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
  check(await page.locator('[data-portal-state=done]').count() === 1 && (await page.locator('[data-portal-state]').innerText()).includes('4 גבישים') && (await page.locator('[data-stat=gems]').innerText()).includes('4'), 'שיעור שהאורח סיים: "הושלם" והגבישים, על הפורטל ובסיכום (מהלשונית בלבד)')
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
