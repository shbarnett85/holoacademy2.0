/* ──────────────────────────────────────────────────────────────────────────
   auditPage — הבדיקות על דף אחד שכבר נטען ונפתר:
     (1) צילום מסך מלא   (2) axe-core   (3) מילים אסורות (innerText בלבד, בלי [data-how-we-calc])
     (4) מדדי פריסה: נכנס במסך אחד, יעדי לחיצה, גופנים, hover-only, breadcrumb
   judge — מתרגם תוצאות לגורמי כישלון (קשיחים: axe חמור/קריטי + מילים אסורות; strict: שאר הדברים).
   ────────────────────────────────────────────────────────────────────────── */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { Page } from 'playwright-core'
import { AXE_TAGS, HOW_WE_CALC_ATTR, REPO_ROOT, THRESHOLDS } from './config.ts'
import { scanForbidden } from './forbidden.ts'
import { INTERACTIVE_SELECTOR, bodyTextWithoutHowWeCalc, probePage, type ProbeOptions } from './pageProbe.ts'
import type { AxeSummary, ForbiddenHit, LayoutMetrics, ScreenResult } from './types.ts'

let axeSource: string | null = null
function loadAxe(): string {
  if (axeSource) return axeSource
  const p = path.join(REPO_ROOT, 'node_modules/axe-core/axe.min.js')
  if (!existsSync(p)) throw new Error('axe-core לא מותקן (npm install -D axe-core בשורש)')
  axeSource = readFileSync(p, 'utf8')
  return axeSource
}

interface AxeApi { run(ctx: Document, opts: unknown): Promise<{ violations: AxeViolation[]; incomplete: unknown[] }> }
interface AxeViolation { id: string; impact: string | null; help: string; helpUrl: string; nodes: { target: unknown[] }[] }

export async function runAxe(page: Page): Promise<AxeSummary> {
  const empty: AxeSummary = { critical: 0, serious: 0, moderate: 0, minor: 0, incomplete: 0, violations: [] }
  try {
    /* evaluate (CDP) עוקף CSP של הדף, בניגוד ל-addScriptTag */
    await page.evaluate(loadAxe())
    const raw = await page.evaluate(async (tags) => {
      const axe = (window as unknown as { axe?: AxeApi }).axe
      if (!axe) throw new Error('axe לא נטען בדף')
      const r = await axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations', 'incomplete'] })
      return {
        incomplete: r.incomplete.length,
        violations: r.violations.map((v) => ({
          id: v.id, impact: v.impact ?? 'minor', help: v.help, helpUrl: v.helpUrl, nodes: v.nodes.length,
          targets: v.nodes.slice(0, 3).map((n) => n.target.map(String).join(' ')),
        })),
      }
    }, [...AXE_TAGS])
    const out: AxeSummary = { ...empty, incomplete: raw.incomplete, violations: raw.violations }
    /* ספירה לפי "הפרות" ולא לפי צמתים: serious/critical = מספר הכללים שנכשלו */
    out.critical = raw.violations.filter((v) => v.impact === 'critical').length
    out.serious = raw.violations.filter((v) => v.impact === 'serious').length
    out.moderate = raw.violations.filter((v) => v.impact === 'moderate').length
    out.minor = raw.violations.filter((v) => v.impact === 'minor').length
    return out
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : String(e) }
  }
}

export interface PageAudit { axe: AxeSummary; forbidden: ForbiddenHit[]; layout: LayoutMetrics }

export async function auditPage(page: Page, screenshotPath: string | null): Promise<PageAudit> {
  if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' })

  const opts: ProbeOptions = {
    minTarget: THRESHOLDS.minTarget, fontFlag: THRESHOLDS.fontFlag, fontBody: THRESHOLDS.fontBody,
    fitTolerance: THRESHOLDS.fitTolerance, maxExamples: 8,
  }
  /* הפריסה נמדדת לפני axe (axe לא משנה DOM, אבל כך המדידה נקייה) */
  /* הפונקציות רצות בדף: מסריאלזים את הקוד שלהן (הן לא נגישות בהקשר הדף כמשתנים מיובאים) */
  const layout = await page.evaluate<LayoutMetrics>(`(${probePage.toString()})(${JSON.stringify(opts)}, ${JSON.stringify(INTERACTIVE_SELECTOR)})`)
  const axe = await runAxe(page)
  const text = await page.evaluate<string>(`(${bodyTextWithoutHowWeCalc.toString()})(${JSON.stringify(HOW_WE_CALC_ATTR)})`)
  return { axe, forbidden: scanForbidden(text), layout }
}

/* ── פסיקה ── */
export function judge(r: Pick<ScreenResult, 'axe' | 'forbidden' | 'layout' | 'inner' | 'clicksFromMainTab'> & { assertFailures?: string[] }): { hard: string[]; strict: string[] } {
  const hard: string[] = []
  const strict: string[] = []
  /* תנאי התרחיש (expect / שגיאה בלתי צפויה במסך) — כשל קשיח */
  for (const f of r.assertFailures ?? []) hard.push(f)
  if (r.axe) {
    const bad = r.axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    if (bad.length) hard.push(`axe: ${bad.length} הפרות חמורות/קריטיות (${bad.map((v) => v.id).join(', ')})`)
    if (r.axe.error) strict.push(`axe לא רץ: ${r.axe.error}`)
  }
  if (r.forbidden.length) {
    const words = [...new Set(r.forbidden.map((h) => h.word))]
    hard.push(`מילים אסורות: ${words.join(', ')}`)
  }
  const l = r.layout
  if (l) {
    if (!l.fitsOneScreen) strict.push(`לא נכנס במסך אחד (+${l.overflowPx}px)`)
    if (l.horizontalOverflow) strict.push('גלילה אופקית')
    if (l.smallTargets.count > 0) strict.push(`${l.smallTargets.count} יעדי לחיצה קטנים מ-${THRESHOLDS.minTarget}px`)
    if (l.fonts.below14 > 0) strict.push(`${l.fonts.below14} אלמנטים עם גופן קטן מ-${THRESHOLDS.fontFlag}px (מינימום ${l.fonts.min}px)`)
    if (l.hoverOnly.controls + l.hoverOnly.info > 0) strict.push(`${l.hoverOnly.controls + l.hoverOnly.info} פריטים עם מידע רק ב-hover (title)`)
    if (r.inner && !l.breadcrumb.present) strict.push('אין breadcrumb גלוי בעמוד פנימי')
    if (l.headings.h1 === 0) strict.push('אין כותרת h1 גלויה (השאלה שהמסך עונה עליה)')
  }
  if (r.clicksFromMainTab !== null && r.clicksFromMainTab > THRESHOLDS.maxClicks) strict.push(`${r.clicksFromMainTab} לחיצות מהטאב הראשי (מקסימום ${THRESHOLDS.maxClicks})`)
  return { hard, strict }
}
