/* ──────────────────────────────────────────────────────────────────────────
   בדיקה עצמית של התשתית (בלי האפליקציה): דף סינתטי עם פגמים מוכרים → ה-audit חייב לתפוס בדיוק אותם.
   הרצה:  npm run e2e:ux -- --selftest      (או: npx tsx e2e/run.ts --selftest)
   ────────────────────────────────────────────────────────────────────────── */
import { pathToFileURL } from 'node:url'
import { auditPage, judge } from './lib/audit.ts'
import { launchBrowser, newContext } from './lib/browser.ts'
import { scanForbidden } from './lib/forbidden.ts'

let failed = 0
const check = (name: string, ok: boolean, extra = ''): void => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : extra ? `  → ${extra}` : ''}`)
}

const BAD_PAGE = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>bad</title>
<style>body{margin:0;font:16px sans-serif} .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}</style></head><body>
<nav data-breadcrumb><a href="#a" style="display:inline-block;min-height:44px;min-width:44px">תוצאות</a> › הדמיה › ו2</nav>
<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="50" height="50">
<p>הממצא מובהק סטטיסטית.</p>
<div data-how-we-calc>וקטור p-value BH Benjamini אינדקס</div>
<div style="display:none">קורלציה</div>
<p style="font-size:11px">טקסט קטן מאוד</p>
<button id="tiny" style="width:20px;height:20px">x</button>
<button id="big" style="width:80px;height:50px">גדול</button>
<button class="sr">מוסתר חזותית</button>
<button id="icon" title="סגור" style="width:50px;height:50px"></button>
<span title="הסבר ארוך שמופיע רק כשמרחפים עם העכבר מעל האלמנט הזה">תג</span>
<div style="height:1800px">גבוה</div>
</body></html>`

const GOOD_PAGE = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>good</title>
<style>body{margin:0;font:16px sans-serif;color:#111;background:#fff} button{font:inherit}</style></head><body>
<main><h1>איך הכיתה הצליחה?</h1><p>11 מתוך 24 תלמידים סיימו.</p>
<button style="min-width:80px;min-height:48px">פתיחה</button></main></body></html>`

async function main(): Promise<number> {
  console.log('— יחידה: מילים אסורות —')
  const hits = scanForbidden('הדפוס מובהק, ה-p-value נמוך, BH מתוקן. p מתוקן. גודל אפקט. קורלציות. וקטורים. אינדקסים. הסתברותי. Benjamini–Hochberg')
  const words = new Set(hits.map((h) => h.word))
  for (const w of ['וקטור', 'p-value', 'p מתוקן', 'מובהק', 'BH', 'Benjamini', 'אינדקס', 'קורלציה', 'גודל אפקט', 'הסתברות']) check(`תופס "${w}"`, words.has(w))
  check('לא תופס BH בתוך מילה לטינית', scanForbidden('bhajan ABHA').length === 0)
  check('טקסט נקי → 0', scanForbidden('11 מתוך 24 תלמידים סיימו את ההדמיה').length === 0)

  console.log('— דפדפן: דף סינתטי עם פגמים —')
  const browser = await launchBrowser(false)
  try {
    const ctx = await newContext(browser, { viewport: { width: 1366, height: 768 }, theme: 'light', session: null })
    const page = await ctx.newPage()
    await page.setContent(BAD_PAGE)
    const a = await auditPage(page, null)
    const l = a.layout
    check('axe לא נכשל טכנית', !a.axe.error, a.axe.error)
    check('axe: image-alt (critical)', a.axe.violations.some((v) => v.id === 'image-alt' && v.impact === 'critical'), JSON.stringify(a.axe.violations.map((v) => v.id)))
    check('מילה אסורה מחוץ ל-how-we-calc נתפסת (מובהק)', a.forbidden.some((h) => h.word === 'מובהק'))
    check('תוכן [data-how-we-calc] לא נסרק', !a.forbidden.some((h) => ['וקטור', 'p-value', 'BH', 'Benjamini', 'אינדקס'].includes(h.word)), JSON.stringify(a.forbidden.map((h) => h.word)))
    check('טקסט display:none לא נסרק (קורלציה)', !a.forbidden.some((h) => h.word === 'קורלציה'))
    check('לא נכנס במסך אחד', !l.fitsOneScreen && l.overflowPx > 1000, `overflow=${l.overflowPx}`)
    check('יעד קטן אחד נספר (#tiny); הגדול/ה-sr-only לא', l.smallTargets.examples.some((e) => e.selector.includes('#tiny')) && !l.smallTargets.examples.some((e) => e.selector.includes('#big') || /מוסתר/.test(e.text)), JSON.stringify(l.smallTargets))
    check('גופן מינימלי 11px, below14 ≥ 1', l.fonts.min === 11 && l.fonts.below14 >= 1, JSON.stringify({ min: l.fonts.min, b: l.fonts.below14 }))
    check('hover-only: כפתור אייקון עם title', l.hoverOnly.controls >= 1, JSON.stringify(l.hoverOnly))
    check('hover-only: span עם title בלבד', l.hoverOnly.info >= 1, JSON.stringify(l.hoverOnly))
    check('breadcrumb (data-breadcrumb) זוהה', l.breadcrumb.present && l.breadcrumb.via === 'attr')
    check('אין h1 → h1=0', l.headings.h1 === 0)
    const v = judge({ axe: a.axe, forbidden: a.forbidden, layout: l, inner: true, clicksFromMainTab: 3 })
    check('judge: כשלים קשיחים (axe + מילים)', v.hard.length === 2, JSON.stringify(v.hard))
    check('judge: כשלי strict (פריסה/יעדים/גופן/hover/לחיצות/h1)', v.strict.length >= 5, JSON.stringify(v.strict))

    console.log('— דפדפן: דף תקין —')
    await page.setContent(GOOD_PAGE)
    const g = await auditPage(page, null)
    const vg = judge({ axe: g.axe, forbidden: g.forbidden, layout: g.layout, inner: false, clicksFromMainTab: 0 })
    check('נכנס במסך אחד', g.layout.fitsOneScreen)
    check('אין יעדים קטנים', g.layout.smallTargets.count === 0, JSON.stringify(g.layout.smallTargets))
    check('גופן ≥ 16', g.layout.fonts.min !== null && g.layout.fonts.min >= 16)
    check('judge: אין כשלים', vg.hard.length === 0 && vg.strict.length === 0, JSON.stringify(vg))
    await ctx.close()
  } finally {
    await browser.close()
  }
  console.log(failed ? `\nselftest: ${failed} כשלים` : '\nselftest: הכול עבר')
  return failed ? 1 : 0
}

export const runSelftest = main

/* הרצה ישירה: npx tsx e2e/selftest.ts */
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().then((code) => { process.exitCode = code }, (e: unknown) => { console.error(e); process.exitCode = 1 })
}
