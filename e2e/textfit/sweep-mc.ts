/* מטריצת תקציב לשאלה ולאפשרויות בבחירה מרובה: לכל מספר אפשרויות — מה הצירופים (מילות שאלה × מילות אפשרות) שנכנסים בלי גלילה. */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { REF_SCREENS, launch, newCtx, openLabScene } from './lab.ts'
import { mcFits } from './probe-mc.ts'

const OUT = process.argv[2] ?? path.resolve('e2e/textfit/out')
const screens = process.argv[3] ? REF_SCREENS.filter((s) => s.key === process.argv[3]) : [REF_SCREENS[0], REF_SCREENS[1]]
const WORD = 'אבגדה' /* מילה אופיינית באורך 5 אותיות */
const W = (n: number) => Array.from({ length: n }, (_, i) => WORD.slice(0, 3 + (i % 3))).join(' ')

const browser = await launch()
const out: Record<string, Record<string, Record<string, boolean>>> = {}
for (const s of screens) {
  out[s.key] = {}
  for (const n of [3, 4, 5, 6]) {
    const grid: Record<string, boolean> = {}
    for (const qw of [6, 8, 10, 12, 14, 16, 20]) {
      for (const ow of [1, 2, 3, 4, 5, 6, 8]) {
        const ctx = await newCtx(browser, s)
        const choices = Array.from({ length: n }, (_, i) => ({ id: `c${i}`, text: W(ow), isCorrect: i === 0 }))
        const page = await openLabScene(ctx, { narrative: 'טקסט קצר.', puzzle: { type: 'multipleChoice', question: W(qw) + '?', choices, explanationCorrect: 'נכון', explanationIncorrect: 'לא' } }, 1200)
        const m = await mcFits(page)
        grid[`q${qw}/o${ow}`] = !(m.panelScroll && m.panelScroll.scrollH > m.panelScroll.clientH + 1)
        await ctx.close()
      }
    }
    out[s.key][`n${n}`] = grid
    const maxQ = (ow: number) => [6, 8, 10, 12, 14, 16, 20].filter((q) => grid[`q${q}/o${ow}`]).pop() ?? 0
    console.log(s.key, `n=${n}`, 'max question words by option words:', JSON.stringify(Object.fromEntries([1, 2, 3, 4, 5, 6, 8].map((o) => [o, maxQ(o)]))))
  }
}
await browser.close()
writeFileSync(path.join(OUT, 'mc-sweep.json'), JSON.stringify(out, null, 1))
