/* ──────────────────────────────────────────────────────────────────────────
   render-generated — מציג בנגן האמיתי את הסצנות של הדמיות שנוצרו (textFitGen) במסכי הייחוס,
   ובודק לכל סצנה: (א) תיבת הטקסט לא גוללת (scrollHeight ≤ clientHeight) בכל עמוד,
   (ב) האם הסצנה נכנסת בעמוד אחד, (ג) שבמסך האתגר (רב-ברירה) הפאנל לא גולל.
   שומר צילומי מסך למדגם (שתי סצנות לכל שכבה) בכל מסך.
   הרצה:  npx tsx e2e/textfit/render-generated.ts <genDir> <outDir> [screens=laptop-620,laptop-768,tablet]
   ────────────────────────────────────────────────────────────────────────── */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { REF_SCREENS, launch, newCtx, openLabScene } from './lab.ts'

const genDir = process.argv[2]
const outDir = process.argv[3] ?? path.resolve('e2e/textfit/out')
const screens = (process.argv[4] ?? 'laptop-620,laptop-768,tablet').split(',')
mkdirSync(path.join(outDir, 'shots'), { recursive: true })

interface Row { band: string; quest: string; scene: string; screen: string; pages: number; onePage: boolean; pageOverflow: boolean; stageOverflow: boolean | null; words: number }
const rows: Row[] = []
const browser = await launch()
const files = readdirSync(genDir).filter((f) => f.endsWith('.json')).sort()
const shotCount: Record<string, number> = {}

for (const key of screens) {
  const s = REF_SCREENS.find((x) => x.key === key)!
  for (const f of files) {
    const j = JSON.parse(readFileSync(path.join(genDir, f), 'utf8'))
    const band = j.band as string
    for (const sc of j.gameData.scenes) {
      const ctx = await newCtx(browser, s)
      const page = await openLabScene(ctx, {
        title: sc.title, narrative: sc.narrative, drHoloDialog: sc.drHoloDialog, puzzle: sc.puzzle, choices: sc.choices, textLevel: j.level,
      }, 1400)
      let pages = 1
      let pageOverflow = false
      for (let guard = 0; guard < 12; guard++) {
        const m = await page.evaluate(() => {
          const a = document.querySelector<HTMLElement>('.holo-text-area')
          /* סצנה בלי טקסט כלל (אין תיבת טקסט) — אין מה לגלוש */
          return { over: !!a && a.scrollHeight > a.clientHeight + 1, ind: document.querySelector('[data-page-indicator]')?.textContent ?? '', next: !!document.querySelector('[data-next-page]') }
        })
        if (m.over) pageOverflow = true
        const mm = /(\d+)\s*\/\s*(\d+)/.exec(m.ind)
        if (mm) pages = Math.max(pages, Number(mm[2]))
        if (guard === 0 && (shotCount[`${key}|${band}`] ?? 0) < 2) {
          shotCount[`${key}|${band}`] = (shotCount[`${key}|${band}`] ?? 0) + 1
          await page.screenshot({ path: path.join(outDir, 'shots', `${key}-${band}-${f.replace('.json', '')}-${sc.id}.png`) })
        }
        if (!m.next) break
        await page.click('[data-next-page]')
        await page.waitForTimeout(350)
      }
      let stageOverflow: boolean | null = null
      if (sc.puzzle && (sc.puzzle.type === 'multipleChoice' || sc.puzzle.type === 'trueFalse')) {
        try {
          await page.getByRole('button', { name: /פתרו את האתגר/ }).click({ timeout: 3000 })
          await page.waitForSelector('.holo-stage', { timeout: 6000 })
          await page.waitForTimeout(600)
          stageOverflow = await page.evaluate(() => {
            const st = document.querySelector<HTMLElement>('.holo-stage')!
            const panel = st.querySelector<HTMLElement>('.holo-panel')
            return !!panel && panel.scrollHeight > panel.clientHeight + 1
          })
        } catch { stageOverflow = null }
      }
      rows.push({ band, quest: f.replace('.json', ''), scene: sc.id, screen: key, pages, onePage: pages === 1, pageOverflow, stageOverflow, words: ((sc.narrative ?? '') + ' ' + (sc.drHoloDialog ?? '')).trim().split(/\s+/).filter(Boolean).length })
      await ctx.close()
    }
  }
  console.log('סיום מסך', key, rows.filter((r) => r.screen === key).length, 'סצנות')
}
await browser.close()

const summary: Record<string, any> = {}
for (const key of screens) {
  for (const band of ['g1_2', 'g3_4', 'g5_6', 'g7_9', 'all']) {
    const mine = rows.filter((r) => r.screen === key && (band === 'all' || r.band === band))
    if (!mine.length) continue
    const st = mine.filter((r) => r.stageOverflow !== null)
    summary[`${band}|${key}`] = {
      scenes: mine.length, onePagePct: +(100 * mine.filter((r) => r.onePage).length / mine.length).toFixed(1),
      pageOverflowViolations: mine.filter((r) => r.pageOverflow).length,
      stageChecked: st.length, stageOverflowViolations: st.filter((r) => r.stageOverflow).length,
      maxPages: Math.max(...mine.map((r) => r.pages)),
    }
  }
}
const tag = screens.join('+')
writeFileSync(path.join(outDir, `render-${tag}.json`), JSON.stringify({ summary, rows }, null, 1))
console.log(JSON.stringify(summary, null, 1))
