/* ──────────────────────────────────────────────────────────────────────────
   בדיקה עצמית של התשתית (בלי האפליקציה): דף סינתטי עם פגמים מוכרים → ה-audit חייב לתפוס בדיוק אותם.
   הרצה:  npm run e2e:ux -- --selftest      (או: npx tsx e2e/run.ts --selftest)
   ────────────────────────────────────────────────────────────────────────── */
import { pathToFileURL } from 'node:url'
import { auditPage, judge } from './lib/audit.ts'
import { launchBrowser, newContext } from './lib/browser.ts'
import {
  axeCell, buildChecklist, clicksCell, crumbCell, distinctScreens, fitsCell, forbiddenCell, minFontCell, questionCell, rolesCell, screenChecklist, screenshotsCell,
} from './lib/checklist.ts'
import { scanForbidden } from './lib/forbidden.ts'
import { ALL_WHO } from './lib/types.ts'
import type { LayoutMetrics, ScreenResult, Who } from './lib/types.ts'
import { SCENARIOS } from './scenarios.ts'

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

/* ── צ'קליסט: תוצאות סינתטיות (בלי דפדפן) ── */
function mkLayout(over: Partial<LayoutMetrics> = {}, h1: string | null = 'איך הכיתה הצליחה בהדמיה?'): LayoutMetrics {
  return {
    innerWidth: 1366, innerHeight: 768, scrollHeight: 768, scrollWidth: 1366, fitsOneScreen: true, overflowPx: 0, horizontalOverflow: false,
    overflowers: [], innerScrollers: [], tallestOverflowPx: 0,
    smallTargets: { count: 0, total: 20, inlineExcluded: 0, examples: [] },
    fonts: { min: 16, below14: 0, below16: 0, textElements: 30, examples: [] },
    hoverOnly: { controls: 0, info: 0, examples: [] }, clickableNonSemantic: { count: 0, examples: [] },
    breadcrumb: { present: true, via: 'attr', text: 'תוצאות › מדעים', fullText: 'תוצאות › מדעים › ו2' },
    headings: { h1: h1 ? 1 : 0, firstH1: h1, texts: h1 ? [h1] : [] },
    ...over,
  }
}
function mkResult(name: string, who: Who, o: Partial<ScreenResult> = {}, layout: Partial<LayoutMetrics> = {}, h1: string | null = 'איך הכיתה הצליחה בהדמיה?'): ScreenResult {
  const vp = o.viewport ?? '1366x768'
  return {
    id: `${name}.${who}`, name, who, group: 'results', viewport: vp, theme: 'light', urlPattern: `/results/${name}`, requestedUrl: `/results/${name}`, finalUrl: `/results/${name}`,
    status: 'ok', statusDetail: null, inner: true, clicksFromMainTab: 1, screenshot: `${name}.${who}-${vp}.png`,
    axe: { critical: 0, serious: 0, moderate: 0, minor: 0, incomplete: 0, violations: [] }, forbidden: [], layout: mkLayout(layout, h1),
    consoleErrors: { count: 0, samples: [] }, failedRequests: { count: 0, samples: [] }, loadMs: 100, hardFailures: [], strictFailures: [], note: null, attempts: 1,
    ...o,
  }
}
const META = { generatedAt: '2026-01-01T00:00:00.000Z', base: 'http://x', api: 'http://y', theme: 'light' as const, viewports: ['1366x768'], strict: false, args: [], fixture: { used: false, note: null } }

function checklistUnit(): void {
  console.log("— יחידה: צ'קליסט —")
  /* איחוד: אותו מסך בשני תפקידים ושני viewports → מסך מובחן אחד, נמדד ב-1366×768 */
  const merged = distinctScreens([
    mkResult('s1', 'guest-homeroom'), mkResult('s1', 'real-homeroom'),
    mkResult('s1', 'guest-homeroom', { viewport: '1920x1080' }, { fitsOneScreen: false, overflowPx: 999 }),
    mkResult('s2', 'guest-homeroom'),
  ])
  check('איחוד: 2 מסכים מובחנים', merged.length === 2 && merged[0].name === 's1' && merged[1].name === 's2', merged.map((m) => m.name).join(','))
  check('איחוד: 1366×768 נבחר, 1920 לא משפיע', merged[0].viewport === '1366x768' && merged[0].measured.length === 2 && merged[0].all.length === 3 && fitsCell(merged[0]) === '✓')
  check('תפקידים: שני תוויות', rolesCell(merged[0]).includes('מחנך/ת · הדגמה') && rolesCell(merged[0]).includes('מחנך/ת · אמיתי'))
  check('שאלה אחת משותפת → ציטוט יחיד', questionCell(merged[0]) === '"איך הכיתה הצליחה בהדמיה?"', questionCell(merged[0]))

  /* h1 שונה בין תפקידים → שניהם מופיעים עם התפקיד */
  const diff = distinctScreens([mkResult('d', 'guest-homeroom', {}, {}, 'שאלה א'), mkResult('d', 'real-unlinked', {}, {}, 'שאלה ב')])[0]
  check('h1 שונה: שני ציטוטים עם תפקיד', questionCell(diff).includes('"שאלה א" — מחנך/ת · הדגמה') && questionCell(diff).includes('"שאלה ב" — מורה בלי כיתה · אמיתי'), questionCell(diff))
  const noH1 = distinctScreens([mkResult('n', 'guest-homeroom', {}, {}, null)])[0]
  check('אין h1 → ✗', questionCell(noH1).includes('✗ אין h1'))

  /* נתיב חזרה: דוגמה אחת + ספירת וריאציות; תפקיד בלי נתיב מסומן בשמו */
  const crumbs = distinctScreens([
    mkResult('k', 'guest-homeroom'),
    mkResult('k', 'real-homeroom', {}, { breadcrumb: { present: true, via: 'attr', text: 'x', fullText: 'תוצאות › אחר' } }),
    mkResult('k', 'real-subject', {}, { breadcrumb: { present: false, via: null, text: null } }),
  ])[0]
  check('נתיב חזרה: דוגמה + וריאציה + תפקיד בלי נתיב', crumbCell(crumbs).includes('ועוד וריאציה אחת') && crumbCell(crumbs).includes('✗ אין נתיב חזרה — מורה מקצועי · אמיתי'), crumbCell(crumbs))
  check('נתיב חזרה: מסך לא-פנימי → —', crumbCell({ ...crumbs, inner: false }) === '—')

  /* חריגה בגובה: הגרוע, ורק התפקיד שחורג */
  const over = distinctScreens([mkResult('o', 'guest-homeroom'), mkResult('o', 'real-homeroom', {}, { fitsOneScreen: false, overflowPx: 120 })])[0]
  check('חריגה: ✗ +120px עם התפקיד החורג בלבד', fitsCell(over) === '✗ +120px (מחנך/ת · אמיתי)', fitsCell(over))
  const inner = distinctScreens([mkResult('i', 'guest-homeroom', {}, { innerScrollers: [{ selector: 'div.x', overflowPx: 80 }] })])[0]
  check('גלילה פנימית נרשמת כאזהרה', fitsCell(inner).includes('~ גלילה פנימית עד +80px'), fitsCell(inner))
  const only1920 = distinctScreens([mkResult('w', 'guest-homeroom', { viewport: '1920x1080' })])[0]
  check('בלי 1366×768 → הערה מפורשת', !only1920.atChecklistViewport && fitsCell(only1920).includes('נמדד ב-1920x1080'), fitsCell(only1920))

  /* שאר העמודות */
  const bad = distinctScreens([mkResult('b', 'guest-homeroom', {
    clicksFromMainTab: 3,
    forbidden: [{ word: 'מובהק', match: 'מובהק', context: 'x' }],
    axe: { critical: 0, serious: 1, moderate: 0, minor: 0, incomplete: 0, violations: [{ id: 'color-contrast', impact: 'serious', help: 'h', helpUrl: '', nodes: 2, targets: [] }] },
  }, { smallTargets: { count: 3, total: 20, inlineExcluded: 0, examples: [] }, fonts: { min: 11, below14: 2, below16: 5, textElements: 30, examples: [] } })])[0]
  check('לחיצות 3 → ✗ 3; 1 → "1"', clicksCell(bad) === '✗ 3' && clicksCell(merged[0]) === '1')
  check('axe: ✗ 1 (color-contrast)', axeCell(bad) === '✗ 1 (color-contrast)', axeCell(bad))
  check('מילים אסורות: ✗ 1 (מובהק)', forbiddenCell(bad) === '✗ 1 (מובהק)', forbiddenCell(bad))
  check('גופן 11px → ✗', minFontCell(bad).startsWith('✗ 11px'), minFontCell(bad))
  check('קישורי צילום', screenshotsCell(merged[0]).includes('](s1.guest-homeroom-1366x768.png)'))

  /* מסך שלא נמדד */
  const miss = distinctScreens([mkResult('m', 'guest-homeroom', { status: 'missing', statusDetail: 'route/element missing: דף ריק', layout: null, axe: null, screenshot: null })])[0]
  check('missing: אין מדידה, הסיבה מוצגת', miss.measured.length === 0 && questionCell(miss).includes('דף ריק') && fitsCell(miss) === '—' && axeCell(miss) === '—' && rolesCell(miss).includes('MISSING'))

  /* הרשומה ב-report.json */
  const c = screenChecklist(mkResult('c', 'guest-homeroom'))
  check('screenChecklist: h1/נתיב/לחיצות/מסך-אחד/צילום', c.h1 === 'איך הכיתה הצליחה בהדמיה?' && c.breadcrumb === 'תוצאות › מדעים › ו2' && c.clicksFromMainTab === 1 && c.fitsAt1366x768 === true && c.screenshot === 'c.guest-homeroom-1366x768.png', JSON.stringify(c))
  const c19 = screenChecklist(mkResult('c', 'guest-homeroom', { viewport: '1920x1080' }))
  check('screenChecklist: fitsAt1366x768=null מחוץ ל-1366', c19.fitsAt1366x768 === null && c19.fitsOneScreen === true)
  const cm = screenChecklist(miss.all[0])
  check('screenChecklist: מסך חסר → שדות null', cm.h1 === null && cm.fitsOneScreen === null && cm.breadcrumb === null && cm.urlPattern === '/results/m')

  const md = buildChecklist(META, [mkResult('s1', 'guest-homeroom'), mkResult('s1', 'real-homeroom'), bad.all[0], miss.all[0]])
  const rows = md.split('\n').filter((l) => /^\| \d+ \|/.test(l))
  check('מסמך: שורה לכל מסך מובחן (3), כותרות בעברית', rows.length === 3 && md.includes('על איזו שאלה הוא עונה') && md.includes('נכנס במסך אחד ב-1366×768') && md.includes('לחיצות מהטאב הראשי'), String(rows.length))
}

/* ── תרחישים: מבנה תקין (שמות ייחודיים, צופים מוכרים, משתני-גילוי מוכרים, תנאים לצופים שבתרחיש) ── */
const KNOWN_VARS = new Set([
  'submissionId', 'submissionClassId', 'resultsStudentId', 'resultsAttentionStudentId', 'classId', 'className', 'studentId', 'subject', 'subjectName',
  'richClassId', 'sparseClassId', 'emptyClassId', 'otherClassId', 'dualAClassId', 'dualBClassId',
  'attentionStudentId', 'calmStudentId', 'emptyStudentId', 'sparseStudentId', 'otherStudentId', 'sharedStudentId', 'biasStudentId', 'memoryStudentId', 'trendUpStudentId', 'skipperStudentId',
])
function scenariosUnit(): void {
  console.log('— יחידה: תרחישים —')
  const names = SCENARIOS.map((s) => s.name)
  check('שמות תרחישים ייחודיים', new Set(names).size === names.length, names.filter((n, i) => names.indexOf(n) !== i).join(','))
  check('שמות בלטינית/מספרים/מקפים', names.every((n) => /^[a-z0-9-]+$/.test(n)), names.filter((n) => !/^[a-z0-9-]+$/.test(n)).join(','))
  const whos = (s: (typeof SCENARIOS)[number]): Who[] => (Array.isArray(s.who) ? s.who : [s.who])
  const unknownWho = SCENARIOS.flatMap((s) => whos(s).filter((w) => !ALL_WHO.includes(w)).map((w) => `${s.name}:${w}`))
  check('כל ה-who מוכרים', unknownWho.length === 0, unknownWho.join(','))
  const badVars = SCENARIOS.flatMap((s) => [...JSON.stringify([s.url, s.steps ?? [], s.expect ?? {}, s.expectBy ?? {}]).matchAll(/{(w+)}/g)].map((m) => m[1]).filter((v) => !KNOWN_VARS.has(v)).map((v) => `${s.name}:{${v}}`))
  check('כל משתני {…} מוכרים', badVars.length === 0, badVars.join(','))
  const badBy = SCENARIOS.flatMap((s) => Object.keys(s.expectBy ?? {}).filter((w) => !whos(s).includes(w as Who)).map((w) => `${s.name}:${w}`))
  check('expectBy רק לצופים שבתרחיש', badBy.length === 0, badBy.join(','))
  /* משתני fixture-בלבד (real-v2-*) לא מתגלים אצל אורח: תרחיש עם אורח לא יכול להשתמש בהם */
  const FIXTURE_ONLY = ['richClassId', 'sparseClassId', 'emptyClassId', 'otherClassId', 'dualAClassId', 'dualBClassId', 'attentionStudentId', 'calmStudentId', 'emptyStudentId', 'sparseStudentId', 'otherStudentId', 'sharedStudentId', 'biasStudentId', 'memoryStudentId', 'trendUpStudentId', 'skipperStudentId']
  const guestFixtureVars = SCENARIOS.filter((s) => whos(s).some((w) => w.startsWith('guest-') || w === 'real-homeroom' || w === 'real-subject' || w === 'real-unlinked'))
    .filter((s) => FIXTURE_ONLY.some((v) => JSON.stringify([s.url, s.steps ?? []]).includes(`{${v}}`))).map((s) => s.name)
  check('אורח/fixture-התוצאות לא משתמשים במשתני fixture-האנליטיקה', guestFixtureVars.length === 0, guestFixtureVars.join(','))
}

async function main(): Promise<number> {
  checklistUnit()
  scenariosUnit()
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
    check('breadcrumb.fullText מלא (data-breadcrumb)', (l.breadcrumb.fullText ?? '').includes('תוצאות') && (l.breadcrumb.fullText ?? '').includes('הדמיה'), JSON.stringify(l.breadcrumb))
    const v = judge({ axe: a.axe, forbidden: a.forbidden, layout: l, inner: true, clicksFromMainTab: 3 })
    check('judge: כשלים קשיחים (axe + מילים)', v.hard.length === 2, JSON.stringify(v.hard))
    check('judge: כשלי strict (פריסה/יעדים/גופן/hover/לחיצות/h1)', v.strict.length >= 5, JSON.stringify(v.strict))

    console.log('— דפדפן: דף תקין —')
    await page.setContent(GOOD_PAGE)
    const g = await auditPage(page, null)
    const vg = judge({ axe: g.axe, forbidden: g.forbidden, layout: g.layout, inner: false, clicksFromMainTab: 0 })
    check('נכנס במסך אחד', g.layout.fitsOneScreen)
    check('h1 מלא נרשם (headings.texts)', g.layout.headings.texts?.[0] === 'איך הכיתה הצליחה?', JSON.stringify(g.layout.headings))
    check('אין יעדים קטנים', g.layout.smallTargets.count === 0, JSON.stringify(g.layout.smallTargets))
    check('גופן ≥ 16', g.layout.fonts.min !== null && g.layout.fonts.min >= 16)
    check('judge: אין כשלים', vg.hard.length === 0 && vg.strict.length === 0, JSON.stringify(vg))
    const va = judge({ axe: g.axe, forbidden: g.forbidden, layout: g.layout, inner: false, clicksFromMainTab: 0, assertFailures: ['חסר (אמור להיות גלוי): x'] })
    check('judge: כשל תנאי תרחיש → כשל קשיח', va.hard.length === 1 && va.hard[0].startsWith('חסר'), JSON.stringify(va))
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
