/* מייצר את src/shared/lib/sceneTextMetrics.ts מתוצאות measure-metrics (layouts.json + charwidths.json). */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const DIR = process.argv[2]
const layouts = JSON.parse(readFileSync(path.join(DIR, 'layouts.json'), 'utf8')) as Record<string, any>
const cw = JSON.parse(readFileSync(path.join(DIR, 'charwidths.json'), 'utf8')) as { weight: string; widths: Record<string, number> }

const entries = Object.entries(layouts).map(([key, v]) => {
  const r1 = v.byRows[1]
  const textW = Math.round((r1.areaW - r1.padX) * 100) / 100
  const textH = Math.round((r1.areaH - r1.padY) * 100) / 100
  return `  '${key}': { key: '${key}', label: ${JSON.stringify(v.label)}, viewport: { w: ${v.width}, h: ${v.height} }, rootPx: ${r1.root}, fontPx: ${r1.font}, linePx: ${r1.line}, textWidthPx: ${textW}, textHeightPx: ${textH}, actionRowPx: ${Math.round(4.3 * r1.root * 100) / 100} },`
})

const widthEntries = Object.entries(cw.widths).filter(([k]) => k !== '__default').map(([k, w]) => `${JSON.stringify(k)}: ${w}`)
const out = `/* ──────────────────────────────────────────────────────────────────────────
   sceneTextMetrics — **נוצר אוטומטית** ע"י e2e/textfit/gen-metrics.ts מתוך מדידות Chrome אמיתיות
   (e2e/textfit/measure-metrics.ts). אל תערוך ידנית — הרץ מחדש את המדידה כשה-CSS של תיבת הטקסט משתנה.
   · HEEBO_WIDTH_1000: רוחב כל תו בגופן Heebo (משקל ${cw.weight}) ביחידות של 1/1000 em.
   · REF_LAYOUTS: גיאומטריה של תיבת הטקסט בנגן בכל מסכי הייחוס (אזור הטקסט ללא גלילה, אחרי ריפוד).
   ────────────────────────────────────────────────────────────────────────── */

export interface SceneLayout {
  key: string
  label: string
  viewport: { w: number; h: number }
  rootPx: number
  /* הגופן לא מוקטן לעולם; גודלו נקבע לפי השכבה (כיום זהה לכל השכבות) */
  fontPx: number
  linePx: number
  /* רוחב וגובה אזור הטקסט הפנוי (אחרי ריפוד), כשאזור הפעולות שמור לשורת כפתורים אחת */
  textWidthPx: number
  textHeightPx: number
  /* כל שורת כפתורים נוספת באזור הפעולות גוזלת כך מגובה הטקסט */
  actionRowPx: number
}

export type RefScreenKey = 'laptop-620' | 'laptop-768' | 'tablet' | 'phone-landscape'

export const REF_LAYOUTS: Record<RefScreenKey, SceneLayout> = {
${entries.join('\n')}
}

export const HEEBO_WEIGHT = ${cw.weight}
export const HEEBO_DEFAULT_WIDTH_1000 = ${cw.widths['__default']}
export const HEEBO_WIDTH_1000: Record<string, number> = {
  ${widthEntries.join(', ')},
}
`
writeFileSync('src/shared/lib/sceneTextMetrics.ts', out)
console.log('written, layouts', Object.keys(layouts).length, 'chars', widthEntries.length)
