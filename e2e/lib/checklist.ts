/* ──────────────────────────────────────────────────────────────────────────
   צ'קליסט פר-מסך — e2e/out/checklist.md.
   נבנה מתוצאות הריצה (או מ-report.json קיים), מאחד מסכים זהים בין תפקידים וצופים:
     "מסך מובחן" = תרחיש אחד (scenario.name) — אותו מסך לכל ה-who שלו; ה-viewports נאספים לתוכו.
   הטבלה נמדדת ב-1366×768 (אם הריצה כללה אותו; אחרת ב-viewport הראשון שנמדד, עם הערה).
   pure: ללא דפדפן ו-DB. נבדק ב-selftest (e2e/selftest.ts, "יחידה: צ'קליסט").
   ────────────────────────────────────────────────────────────────────────── */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { THRESHOLDS } from './config.ts'
import type { RunMeta } from './report.ts'
import type { ScreenChecklist, ScreenResult, Who } from './types.ts'

/* ה-viewport שעליו נשאלת השאלה "נכנס במסך אחד?" (מחשב נייד בית ספרי, CLAUDE.md → עקרונות ממשק) */
export const CHECKLIST_VIEWPORT = '1366x768'

const OK = '✓'
const NO = '✗'
const WARN = '~'
const NA = '—'

/* ── תוויות תפקידים (עברית; המזהה הטכני מופיע בפירוט) ── */
export const WHO_LABEL: Record<Who, string> = {
  'guest-homeroom': 'מחנך/ת · הדגמה',
  'guest-subject-math': 'מורה חשבון · הדגמה',
  'guest-subject-hebrew': 'מורה עברית · הדגמה',
  'guest-admin': 'מנהל/ת · הדגמה',
  'real-homeroom': 'מחנך/ת · אמיתי',
  'real-subject': 'מורה מקצועי · אמיתי',
  'real-unlinked': 'מורה בלי כיתה · אמיתי',
  'real-admin': 'מנהל/ת · אמיתי',
  'real-v2-homeroom': 'מחנך/ת · אמיתי (כיתה עשירה)',
  'real-v2-subject': 'מורה מתמטיקה · אמיתי',
  'real-v2-mixed': 'מחנך/ת בדלה + עברית בעשירה · אמיתי',
  'real-v2-cross': 'מתמטיקה בדלה + היסטוריה בעשירה · אמיתי',
  'real-v2-unspecified': 'שיוך בלי מקצוע · אמיתי',
  'real-v2-empty': 'מחנך/ת כיתה בלי תוצאות · אמיתי',
  'real-v2-no-classes': 'מורה בלי כיתות · אמיתי',
  'real-v2-dual': 'מורה עם תלמיד בשתי כיתות · אמיתי',
  'real-v2-admin': 'מנהל/ת · אמיתי (ארגון עשיר)',
  'real-v2-municipal': 'מנהל/ת עירוני · אמיתי',
  'real-v2-admin-small': 'מנהל/ת בית ספר קטן · אמיתי',
  'real-v2-admin-empty': 'מנהל/ת בית ספר בלי כיתות · אמיתי',
}
const roleLabel = (w: Who): string => WHO_LABEL[w] ?? w

/* ── הרשומה שנכתבת ל-report.json לכל מסך (גם missing/skipped/error → שדות null) ── */
export function screenChecklist(r: ScreenResult): ScreenChecklist {
  const l = r.layout
  return {
    urlPattern: r.urlPattern ?? r.requestedUrl,
    h1: l ? (l.headings.texts?.[0] ?? l.headings.firstH1 ?? null) : null,
    h1Count: l ? l.headings.h1 : 0,
    breadcrumb: l && l.breadcrumb.present ? (l.breadcrumb.fullText ?? l.breadcrumb.text ?? null) : null,
    clicksFromMainTab: r.clicksFromMainTab,
    viewport: r.viewport,
    fitsOneScreen: l ? l.fitsOneScreen : null,
    overflowPx: l ? l.overflowPx : null,
    fitsAt1366x768: l && r.viewport === CHECKLIST_VIEWPORT ? l.fitsOneScreen : null,
    screenshot: r.screenshot,
  }
}

/* ── איחוד למסכים מובחנים ── */
export interface DistinctScreen {
  name: string
  group: string
  urlPattern: string
  inner: boolean
  note: string | null
  /* ה-viewport שעליו נמדדה השורה בטבלה */
  viewport: string
  /* true = ה-viewport הוא 1366×768 המבוקש. false = הריצה לא כללה אותו (השורה נמדדה בגודל אחר) */
  atChecklistViewport: boolean
  /* status 'ok' ב-viewport של השורה */
  measured: ScreenResult[]
  /* כל השאר באותו viewport (missing / skipped / error) */
  unmeasured: ScreenResult[]
  /* כל התוצאות של המסך, בכל ה-viewports */
  all: ScreenResult[]
}

export function distinctScreens(results: ScreenResult[]): DistinctScreen[] {
  const order: string[] = []
  const byName = new Map<string, ScreenResult[]>()
  for (const r of results) {
    if (!byName.has(r.name)) { byName.set(r.name, []); order.push(r.name) }
    byName.get(r.name)!.push(r)
  }
  return order.map((name) => {
    const all = byName.get(name)!
    const atPrimary = all.some((r) => r.viewport === CHECKLIST_VIEWPORT)
    const viewport = atPrimary ? CHECKLIST_VIEWPORT : all[0].viewport
    const inVp = all.filter((r) => r.viewport === viewport)
    return {
      name,
      group: all[0].group,
      urlPattern: all[0].urlPattern ?? all[0].requestedUrl,
      inner: all.some((r) => r.inner),
      note: all.find((r) => r.note)?.note ?? null,
      viewport,
      atChecklistViewport: atPrimary,
      measured: inVp.filter((r) => r.status === 'ok' && r.layout && r.axe),
      unmeasured: inVp.filter((r) => !(r.status === 'ok' && r.layout && r.axe)),
      all,
    }
  })
}

/* ── עזרי תא ── */
const esc = (s: string): string => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim()
const cellOf = (parts: string[]): string => (parts.length ? parts.map(esc).join('<br>') : NA)
const quoted = (s: string): string => `"${s}"`
const roles = (rs: ScreenResult[]): string => [...new Set(rs.map((r) => roleLabel(r.who)))].join(', ')

function groupBy(items: ScreenResult[], key: (r: ScreenResult) => string): Map<string, ScreenResult[]> {
  const m = new Map<string, ScreenResult[]>()
  for (const r of items) {
    const k = key(r)
    const a = m.get(k)
    if (a) a.push(r)
    else m.set(k, [r])
  }
  return m
}

/* ── תאי הטבלה (כל אחד מקבל את התוצאות שנמדדו ב-viewport של השורה) ── */
export function rolesCell(s: DistinctScreen): string {
  const parts = [roles(s.measured) || NA]
  if (s.unmeasured.length) {
    const why = groupBy(s.unmeasured, (r) => r.status.toUpperCase())
    for (const [status, rs] of why) parts.push(`לא נמדדו (${status}): ${roles(rs)}`)
  }
  return cellOf(parts)
}

export function questionCell(s: DistinctScreen): string {
  if (!s.measured.length) {
    const d = s.unmeasured.find((r) => r.statusDetail)?.statusDetail
    return cellOf([d ? `${NA} (${d.slice(0, 90)})` : NA])
  }
  const by = groupBy(s.measured, (r) => screenChecklist(r).h1 ?? '')
  const multi = s.measured.some((r) => (r.layout?.headings.h1 ?? 0) > 1)
  const parts: string[] = []
  if (by.size === 1) {
    const [h1] = [...by.keys()]
    parts.push(h1 ? quoted(h1) : `${NO} אין h1`)
  } else {
    for (const [h1, rs] of by) parts.push(`${h1 ? quoted(h1) : `${NO} אין h1`} — ${roles(rs)}`)
  }
  if (multi) parts.push(`${WARN} יש יותר מ-h1 אחד`)
  return cellOf(parts)
}

/* נתיב החזרה מכיל שמות מהנתונים (כיתה, תלמיד, הדמיה) ולכן שונה בין תפקידים; בטבלה מוצגת דוגמה אחת
   ומספר הווריאציות, ובפירוט (למטה) כל תפקיד. מה שחשוב לראות בטבלה: מי *בלי* נתיב חזרה בעמוד פנימי. */
export function crumbCell(s: DistinctScreen): string {
  if (!s.inner) return NA
  if (!s.measured.length) return NA
  const withCrumb = s.measured.filter((r) => screenChecklist(r).breadcrumb)
  const without = s.measured.filter((r) => !screenChecklist(r).breadcrumb)
  const parts: string[] = []
  if (withCrumb.length) {
    const variants = new Set(withCrumb.map((r) => screenChecklist(r).breadcrumb))
    parts.push(`${quoted(screenChecklist(withCrumb[0]).breadcrumb!)}${variants.size === 2 ? ' (ועוד וריאציה אחת לפי נתונים)' : variants.size > 2 ? ` (ועוד ${variants.size - 1} וריאציות לפי נתונים)` : ''}`)
  }
  if (without.length) parts.push(`${NO} אין נתיב חזרה${withCrumb.length ? ` — ${roles(without)}` : ''}`)
  return cellOf(parts)
}

export function fitsCell(s: DistinctScreen): string {
  if (!s.measured.length) return NA
  const over = s.measured.filter((r) => !r.layout!.fitsOneScreen)
  const parts: string[] = []
  if (!over.length) parts.push(OK)
  else {
    const max = Math.max(...over.map((r) => r.layout!.overflowPx))
    parts.push(`${NO} +${max}px${over.length < s.measured.length ? ` (${roles(over)})` : ''}`)
  }
  const inner = Math.max(0, ...s.measured.map((r) => r.layout!.innerScrollers[0]?.overflowPx ?? 0))
  if (inner > 0) parts.push(`${WARN} גלילה פנימית עד +${inner}px`)
  if (s.measured.some((r) => r.layout!.horizontalOverflow)) parts.push(`${NO} גלילה אופקית`)
  if (!s.atChecklistViewport) parts.push(`(נמדד ב-${s.viewport}, לא ב-${CHECKLIST_VIEWPORT})`)
  return cellOf(parts)
}

export function clicksCell(s: DistinctScreen): string {
  const n = s.all.find((r) => r.clicksFromMainTab !== null)?.clicksFromMainTab ?? null
  if (n === null) return NA
  return n > THRESHOLDS.maxClicks ? `${NO} ${n}` : String(n)
}

export function seriousAxeIds(s: DistinctScreen): string[] {
  return [...new Set(s.measured.flatMap((r) => r.axe!.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)))]
}
export function axeCell(s: DistinctScreen): string {
  if (!s.measured.length) return NA
  const ids = seriousAxeIds(s)
  if (ids.length) return cellOf([`${NO} ${ids.length} (${ids.join(', ')})`])
  return s.measured.every((r) => r.axe!.error) ? `${NA} (axe לא רץ)` : `${OK} 0`
}

export function smallTargetsCell(s: DistinctScreen): string {
  if (!s.measured.length) return NA
  const worst = s.measured.reduce((a, r) => (r.layout!.smallTargets.count > a.layout!.smallTargets.count ? r : a))
  const { count, total } = worst.layout!.smallTargets
  return count === 0 ? `${OK} 0 מתוך ${total}` : `${NO} ${count} מתוך ${total}`
}

export function minFontCell(s: DistinctScreen): string {
  if (!s.measured.length) return NA
  const fonts = s.measured.map((r) => r.layout!.fonts).filter((f) => f.min !== null)
  if (!fonts.length) return NA
  const min = Math.min(...fonts.map((f) => f.min!))
  const below16 = Math.max(...fonts.map((f) => f.below16))
  if (min < THRESHOLDS.fontFlag) return `${NO} ${min}px (${below16} מתחת ל-${THRESHOLDS.fontBody})`
  if (below16 > 0) return `${WARN} ${min}px (${below16} מתחת ל-${THRESHOLDS.fontBody})`
  return `${OK} ${min}px`
}

export function forbiddenWordsOf(s: DistinctScreen): string[] {
  return [...new Set(s.measured.flatMap((r) => r.forbidden.map((h) => h.word)))]
}
export function forbiddenCell(s: DistinctScreen): string {
  if (!s.measured.length) return NA
  const words = forbiddenWordsOf(s)
  return words.length ? `${NO} ${words.length} (${words.join(', ')})` : `${OK} 0`
}

export function screenshotsCell(s: DistinctScreen): string {
  const links = s.measured.filter((r) => r.screenshot).map((r) => `[${esc(roleLabel(r.who))}](${r.screenshot})`)
  return links.length ? links.join('<br>') : NA
}

/* ── סיכום ראשי ── */
export interface ChecklistTotals {
  screens: number
  measured: number
  unmeasured: number
  fit: number
  noH1: number
  axeFail: number
  forbiddenFail: number
  clicksFail: number
  /* מסכים שנכשלו בתנאי התרחיש (expect / שגיאת ממשק בלתי צפויה) */
  assertFail: number
  /* מסכים עם בעיה ידועה (באג מוצר מתועד) */
  knownIssues: number
}
export function checklistTotals(screens: DistinctScreen[]): ChecklistTotals {
  const m = screens.filter((s) => s.measured.length)
  return {
    screens: screens.length,
    measured: m.length,
    unmeasured: screens.length - m.length,
    fit: m.filter((s) => s.measured.every((r) => r.layout!.fitsOneScreen)).length,
    noH1: m.filter((s) => s.measured.some((r) => !screenChecklist(r).h1)).length,
    axeFail: m.filter((s) => seriousAxeIds(s).length > 0).length,
    forbiddenFail: m.filter((s) => forbiddenWordsOf(s).length > 0).length,
    clicksFail: screens.filter((s) => (s.all.find((r) => r.clicksFromMainTab !== null)?.clicksFromMainTab ?? 0) > THRESHOLDS.maxClicks).length,
    assertFail: screens.filter((s) => s.all.some((r) => (r.assertFailures ?? []).length > 0)).length,
    knownIssues: screens.filter((s) => s.all.some((r) => (r.knownIssues ?? []).length > 0)).length,
  }
}

/* ── פירוט מסך: מי הפר, איפה, וקישורי צילום לכל viewport ── */
function detailLines(s: DistinctScreen): string[] {
  const out: string[] = []
  out.push(`### ${s.name}`)
  out.push(`- קבוצה: ${s.group} · כתובת: \`${s.urlPattern}\`${s.inner ? ' · עמוד פנימי' : ''}${s.note ? ` · ${s.note}` : ''}`)
  for (const r of s.all) {
    const c = screenChecklist(r)
    const head = `- \`${r.who}\` @ ${r.viewport}:`
    if (r.status !== 'ok' || !r.layout) {
      out.push(`${head} **${r.status.toUpperCase()}**${r.statusDetail ? ` — ${esc(r.statusDetail).slice(0, 160)}` : ''}${r.screenshot ? ` · [צילום](${r.screenshot})` : ''}`)
      continue
    }
    const bits: string[] = []
    bits.push(r.layout.fitsOneScreen ? `${OK} נכנס במסך אחד` : `${NO} חורג +${r.layout.overflowPx}px`)
    bits.push(c.h1 ? `h1: ${quoted(c.h1)}` : `${NO} אין h1`)
    if (r.inner) bits.push(c.breadcrumb ? `נתיב: ${quoted(c.breadcrumb)}` : `${NO} אין נתיב חזרה`)
    if (r.screenshot) bits.push(`[צילום](${r.screenshot})`)
    out.push(`${head} ${bits.join(' · ')}`)
    if (!r.layout.fitsOneScreen) for (const o of r.layout.overflowers.slice(0, 2)) out.push(`  - מגיע הכי נמוך: \`${o.selector}\` ${quoted(o.text)} ${o.note ?? ''}`.trimEnd())
    for (const sc of r.layout.innerScrollers.slice(0, 2)) out.push(`  - אזור גלילה פנימי: \`${sc.selector}\` (+${sc.overflowPx}px)`)
    if (r.layout.smallTargets.count) for (const e of r.layout.smallTargets.examples.slice(0, 3)) out.push(`  - יעד קטן: \`${e.selector}\` ${quoted(e.text)} ${e.w}×${e.h}`)
    for (const v of r.axe!.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical')) out.push(`  - axe \`${v.id}\` (${v.impact}, ${v.nodes} צמתים): ${esc(v.help)}`)
    for (const h of r.forbidden.slice(0, 3)) out.push(`  - מילה אסורה "${h.word}": …${esc(h.context)}…`)
    for (const f of r.assertFailures ?? []) out.push(`  - **תנאי נכשל:** ${esc(f)}`)
    for (const f of r.knownIssues ?? []) out.push(`  - **בעיה ידועה (באג מוצר):** ${esc(f)}`)
  }
  out.push('')
  return out
}

/* ── המסמך ── */
export function buildChecklist(meta: RunMeta, results: ScreenResult[]): string {
  const screens = distinctScreens(results)
  const t = checklistTotals(screens)
  const L: string[] = []
  L.push('# צ\'קליסט מסכי מורה')
  L.push('')
  L.push(`- הופק: ${meta.generatedAt} · base: ${meta.base} · ערכה: **${meta.theme}** · viewports בריצה: ${meta.viewports.join(', ')}`)
  const anyOff = screens.some((s) => !s.atChecklistViewport)
  L.push(`- הטבלה נמדדת ב-**${CHECKLIST_VIEWPORT.replace('x', '×')}**${anyOff ? ` — ⚠ הריצה לא כללה אותו, ולכן חלק מהשורות נמדדו בגודל אחר (מצוין בעמודת "נכנס במסך אחד")` : ''}. מסכים זהים אוחדו בין תפקידים וצופים; ערך בשורה הוא הגרוע שבין התפקידים.`)
  L.push(`- fixture מורים אמיתיים: ${meta.fixture.used ? 'כן' : 'לא'}${meta.fixture.note ? ` — ${meta.fixture.note}` : ''}`)
  L.push('')
  L.push('## בקצרה')
  L.push('')
  L.push(`- ${t.screens} מסכים מובחנים; ${t.measured} נמדדו${t.unmeasured ? `, ${t.unmeasured} לא נמדדו (עוד לא נבנו / אין מזהה / שגיאה)` : ''}.`)
  if (t.measured) {
    L.push(`- נכנסים במסך אחד: ${t.fit} מתוך ${t.measured}.`)
    L.push(`- בלי כותרת h1 (השאלה שהמסך עונה עליה): ${t.noH1} מתוך ${t.measured}.`)
    L.push(`- הפרות axe חמורות/קריטיות: ${t.axeFail} מתוך ${t.measured} מסכים. מילים אסורות: ${t.forbiddenFail} מתוך ${t.measured} מסכים.`)
  }
  L.push(`- יותר מ-${THRESHOLDS.maxClicks} לחיצות מהטאב הראשי: ${t.clicksFail} מתוך ${t.screens} מסכים. תנאי תרחיש שנכשלו (כפתור שאמור/אסור להופיע, שגיאת ממשק בלתי צפויה): ${t.assertFail} מסכים; מסכים עם בעיה ידועה (באג מוצר מתועד): ${t.knownIssues}.`)
  L.push('')
  L.push('## טבלת המסכים')
  L.push('')
  L.push(`| # | מסך | תפקידים שנבדקו | על איזו שאלה הוא עונה (h1) | נתיב חזרה | נכנס במסך אחד ב-${CHECKLIST_VIEWPORT.replace('x', '×')} | לחיצות מהטאב הראשי | axe חמור/קריטי | יעדי לחיצה קטנים (<${THRESHOLDS.minTarget}px) | גופן מינימלי | מילים אסורות | צילומים |`)
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|')
  screens.forEach((s, i) => {
    L.push(`| ${i + 1} | ${esc(s.name)}<br>${esc(s.group)} | ${rolesCell(s)} | ${questionCell(s)} | ${crumbCell(s)} | ${fitsCell(s)} | ${clicksCell(s)} | ${axeCell(s)} | ${smallTargetsCell(s)} | ${minFontCell(s)} | ${forbiddenCell(s)} | ${screenshotsCell(s)} |`)
  })
  L.push('')
  L.push(`מקרא: ${OK} עבר · ${NO} נכשל · ${WARN} אזהרה (גלילה פנימית / גופן קטן מ-${THRESHOLDS.fontBody}px) · ${NA} לא רלוונטי או לא נמדד. "יעדי לחיצה קטנים" = קטנים מתוך כלל היעדים הגלויים; "axe" = מספר הכללים שנכשלו ב-impact חמור/קריטי.`)
  L.push('')
  L.push('## פירוט לפי מסך')
  L.push('')
  for (const s of screens) L.push(...detailLines(s))
  return L.join('\n')
}

/* ── קבצים ── */
export async function writeChecklist(outDir: string, meta: RunMeta, results: ScreenResult[]): Promise<{ md: string; totals: ChecklistTotals; screens: DistinctScreen[] }> {
  await mkdir(outDir, { recursive: true })
  const md = path.join(outDir, 'checklist.md')
  await writeFile(md, buildChecklist(meta, results), 'utf8')
  const screens = distinctScreens(results)
  return { md, totals: checklistTotals(screens), screens }
}

/* בונה מחדש מ-report.json קיים (בלי להריץ דפדפן): `npm run e2e:ux -- --checklist-only` */
export async function readReport(outDir: string): Promise<{ meta: RunMeta; results: ScreenResult[] }> {
  const file = path.join(outDir, 'report.json')
  let raw: string
  try { raw = await readFile(file, 'utf8') } catch { throw new Error(`אין ${file} — הריצו קודם: npm run e2e:checklist`) }
  const j = JSON.parse(raw) as { meta?: RunMeta; results?: ScreenResult[] }
  if (!j.meta || !Array.isArray(j.results)) throw new Error(`${file} לא בצורה הצפויה (meta + results)`)
  return { meta: j.meta, results: j.results }
}
