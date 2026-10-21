/* מדידת בחירה מרובה על הבמה: האם שאלה + N אפשרויות נכנסות בגובה הבמה בלי גלילה. */
import path from 'node:path'
import { REF_SCREENS, launch, newCtx, openLabScene } from './lab.ts'

const OUT = process.argv[2] ?? path.resolve('e2e/textfit/out')
const W = (n: number, w = 'מילה') => Array.from({ length: n }, () => w).join(' ')

export async function mcFits(page: import('playwright-core').Page) {
  await page.getByRole('button', { name: /פתרו את האתגר/ }).click()
  await page.waitForSelector('.holo-stage', { timeout: 8000 })
  await page.waitForTimeout(700)
  return page.evaluate(() => {
    const st = document.querySelector<HTMLElement>('.holo-stage')!
    const panel = st.querySelector<HTMLElement>('.holo-panel')
    const r = (el: Element | null) => el ? (({ width, height }) => ({ w: Math.round(width), h: Math.round(height) }))(el.getBoundingClientRect()) : null
    return { stage: { clientH: st.clientHeight, scrollH: st.scrollHeight, clientW: st.clientWidth }, panel: r(panel), panelScroll: panel ? { clientH: panel.clientHeight, scrollH: panel.scrollHeight } : null, inner: st.innerText.slice(0, 80) }
  })
}

if (process.argv[1]?.endsWith('probe-mc.ts')) {
  const browser = await launch()
  const keys = (process.argv[3] ?? 'laptop-620,phone-landscape').split(',')
  for (const s of REF_SCREENS.filter((x) => keys.includes(x.key))) {
    for (const n of [3, 4, 5, 6]) {
      for (const [qw, ow] of [[4, 1], [8, 2], [14, 4]] as const) {
        const ctx = await newCtx(browser, s)
        const choices = Array.from({ length: n }, (_, i) => ({ id: `c${i}`, text: W(ow, `אפשרות${i + 1}`), isCorrect: i === 0 }))
        const page = await openLabScene(ctx, { narrative: 'טקסט קצר.', puzzle: { type: 'multipleChoice', question: W(qw, 'שאלה') + '?', choices, explanationCorrect: 'נכון', explanationIncorrect: 'לא' } }, 1800)
        const m = await mcFits(page)
        console.log(s.key, `options=${n} qWords=${qw} optWords=${ow}`, JSON.stringify({ stage: m.stage, panel: m.panel, panelScroll: m.panelScroll, overflow: !!m.panelScroll && m.panelScroll.scrollH > m.panelScroll.clientH + 1 }))
        if (n === 4 && qw === 14) await page.screenshot({ path: path.join(OUT, `mc-${s.key}.png`) })
        await ctx.close()
      }
    }
  }
  await browser.close()
}
