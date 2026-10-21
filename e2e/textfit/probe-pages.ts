/* אבחון: גבהי תיבת הטקסט בכל עמוד של סצנה מסוימת מתוך הדמיה שנוצרה. */
import { readFileSync } from 'node:fs'
import { REF_SCREENS, launch, newCtx, openLabScene } from './lab.ts'
const [file, sceneId, screenKey] = process.argv.slice(2)
const j = JSON.parse(readFileSync(file, 'utf8'))
const sc = j.gameData.scenes.find((x: any) => x.id === sceneId)
const s = REF_SCREENS.find((x) => x.key === screenKey)!
const browser = await launch()
const ctx = await newCtx(browser, s)
const page = await openLabScene(ctx, { title: sc.title, narrative: sc.narrative, drHoloDialog: sc.drHoloDialog, puzzle: sc.puzzle, textLevel: j.level }, 1400)
for (let i = 0; i < 6; i++) {
  const m = await page.evaluate(() => {
    const a = document.querySelector<HTMLElement>('.holo-text-area')!
    const ps = [...a.querySelectorAll('p')].map((p) => ({ aria: p.getAttribute('aria-hidden'), h: p.getBoundingClientRect().height, w: Math.round(p.getBoundingClientRect().width), text: (p.textContent ?? '').slice(0, 40) }))
    return { clientH: a.clientHeight, scrollH: a.scrollHeight, clientW: a.clientWidth, ind: document.querySelector('[data-page-indicator]')?.textContent, ps, next: !!document.querySelector('[data-next-page]') }
  })
  console.log(JSON.stringify(m))
  if (!m.next) break
  await page.click('[data-next-page]'); await page.waitForTimeout(400)
}
await browser.close()
