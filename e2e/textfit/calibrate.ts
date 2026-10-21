/* ──────────────────────────────────────────────────────────────────────────
   calibrate — fitsScreen מול מדידת Chrome אמיתית על 200 טקסטים קיימים (דיוק ושיעור טעויות).
   לכל מסך ייחוס: מספר השורות בדפדפן (גובה פסקה ברוחב תיבת הטקסט האמיתי) מול measureLines.
   הרצה:  npx tsx e2e/textfit/calibrate.ts <texts.json> <outDir>
   ────────────────────────────────────────────────────────────────────────── */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { REF_SCREENS, launch, newCtx, openLabScene } from './lab.ts'
import { REF_LAYOUTS, fitsScreen, measureLines, sceneDisplayText, wordCount, type RefScreenKey } from '../../src/shared/lib/sceneText.ts'

const [textsFile, outDir] = [process.argv[2], process.argv[3] ?? path.resolve('e2e/textfit/out')]
const all = (JSON.parse(readFileSync(textsFile, 'utf8')) as any[])
  .map((o) => ({ text: sceneDisplayText({ narrative: o.narrative, drHoloDialog: o.dialog }), words: wordCount(o.narrative) + wordCount(o.dialog), lvl: o.lvl as number | null }))
  .filter((o) => o.words >= 3)

/* מדגם מרובד: 200 טקסטים, פרוס על פני התפלגות האורך (לא רק הארוכים) */
all.sort((a, b) => a.words - b.words)
const SAMPLE = 200
const sample = Array.from({ length: SAMPLE }, (_, i) => all[Math.floor((i + 0.5) * all.length / SAMPLE)])

const browser = await launch()
const report: Record<string, unknown> = {}
const domByScreen: Record<string, number[]> = {}
for (const s of REF_SCREENS) {
  const key = s.key as RefScreenKey
  const lay = REF_LAYOUTS[key]
  const ctx = await newCtx(browser, s)
  const page = await openLabScene(ctx, { narrative: 'בדיקה.' }, 1500)
  const dom: number[] = await page.evaluate(({ texts, width }) => {
    const area = document.querySelector<HTMLElement>('.holo-text-area')!
    const probe = document.createElement('p')
    probe.className = 'text-lg leading-relaxed'
    Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', margin: '0', padding: '0', width: `${width}px`, whiteSpace: 'pre-line', top: '0', insetInlineStart: '0' })
    area.appendChild(probe)
    const line = parseFloat(getComputedStyle(probe).lineHeight)
    const out = texts.map((t) => { probe.textContent = t; return Math.round(probe.getBoundingClientRect().height / line) })
    probe.remove()
    return out
  }, { texts: sample.map((x) => x.text), width: lay.textWidthPx })
  await ctx.close()
  domByScreen[key] = dom

  let exact = 0, within1 = 0, bias = 0, falseFit = 0, falseOverflow = 0, agree = 0
  const maxLines = Math.floor((lay.textHeightPx - 2) / lay.linePx)
  const diffs: number[] = []
  sample.forEach((x, i) => {
    const sim = measureLines(x.text, lay.textWidthPx, lay.fontPx)
    const d = sim - dom[i]
    diffs.push(d)
    if (d === 0) exact++
    if (Math.abs(d) <= 1) within1++
    bias += d
    const domFits = dom[i] <= maxLines
    const simFits = fitsScreen(x.text, 'g5_6', key).fits
    if (domFits === simFits) agree++
    else if (simFits && !domFits) falseFit++
    else falseOverflow++
  })
  const n = sample.length
  report[key] = {
    textWidthPx: lay.textWidthPx, maxLines, n,
    exactPct: +(100 * exact / n).toFixed(1), within1Pct: +(100 * within1 / n).toFixed(1), meanBiasLines: +(bias / n).toFixed(3),
    fitsAgreementPct: +(100 * agree / n).toFixed(1), falseFit, falseOverflow,
    maxAbsDiff: Math.max(...diffs.map(Math.abs)),
    domOverflowPct: +(100 * dom.filter((l) => l > maxLines).length / n).toFixed(1),
  }
  console.log(key, JSON.stringify(report[key]))
}
await browser.close()
writeFileSync(path.join(outDir, 'calibration.json'), JSON.stringify(report, null, 1))

/* תמונת-מדידה (golden) ליחידת-בדיקה: 30 טקסטים אמיתיים + מספר השורות שנמדד ב-Chrome בכל מסך ייחוס */
const goldenIdx = Array.from({ length: 30 }, (_, i) => Math.floor((i + 0.5) * sample.length / 30))
const golden = goldenIdx.map((i) => ({ text: sample[i].text, lines: Object.fromEntries(Object.keys(domByScreen).map((k) => [k, domByScreen[k][i]])) }))
writeFileSync(path.resolve('src/shared/lib/sceneText.golden.ts'), `/* נוצר אוטומטית ע"י e2e/textfit/calibrate.ts — טקסטים אמיתיים ומספר השורות שנמדד בדפדפן (Chrome, Heebo) בכל מסך ייחוס. */
export const GOLDEN: { text: string; lines: Record<'laptop-620' | 'laptop-768' | 'tablet' | 'phone-landscape', number> }[] = ${JSON.stringify(golden, null, 1)}
`)
