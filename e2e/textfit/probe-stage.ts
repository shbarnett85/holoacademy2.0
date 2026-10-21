/* בדיקת פאנל האתגר של סצנה מסוימת מתוך הדמיה שנוצרה: מדידת גלישה + צילום. */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { REF_SCREENS, launch, newCtx, openLabScene } from './lab.ts'
const [file, sceneId, screenKey, out] = process.argv.slice(2)
const j = JSON.parse(readFileSync(file, 'utf8'))
const sc = j.gameData.scenes.find((x: any) => x.id === sceneId)
const s = REF_SCREENS.find((x) => x.key === screenKey)!
const browser = await launch()
const ctx = await newCtx(browser, s)
const page = await openLabScene(ctx, { title: sc.title, narrative: sc.narrative, drHoloDialog: sc.drHoloDialog, puzzle: sc.puzzle, textLevel: j.level }, 1400)
await page.getByRole('button', { name: /פתרו את האתגר/ }).click()
await page.waitForSelector('.holo-stage')
await page.waitForTimeout(800)
const m = await page.evaluate(() => {
  const st = document.querySelector<HTMLElement>('.holo-stage')!
  const panel = st.querySelector<HTMLElement>('.holo-panel')!
  const kids = [...panel.children].map((c) => ({ tag: c.tagName, cls: (c as HTMLElement).className.slice(0, 40), h: Math.round(c.getBoundingClientRect().height) }))
  return { stageH: st.clientHeight, panelClientH: panel.clientHeight, panelScrollH: panel.scrollHeight, vh: innerHeight, panelTop: Math.round(panel.getBoundingClientRect().top), kids }
})
console.log(JSON.stringify(m, null, 1))
await page.screenshot({ path: path.resolve(out) })
await browser.close()
