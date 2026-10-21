/* בדיקה: סצנת Hub עם 3 בחירות — הטקסט שומר גובה מלא, הבחירות על הבמה. */
import path from 'node:path'
import { REF_SCREENS, launch, newCtx, openLabScene, measureBox } from './lab.ts'

const OUT = process.argv[2] ?? path.resolve('e2e/textfit/out')
const browser = await launch()
for (const s of [REF_SCREENS[0], REF_SCREENS[3]]) {
  const ctx = await newCtx(browser, s)
  const page = await openLabScene(ctx, {
    narrative: 'אתה עומד בתחנה המרכזית של העיר העתיקה. שלושה שבילים נפתחים לפניך.',
    choices: [
      { id: 'a', text: 'לכו אל השוק הגדול', nextSceneId: 's2' },
      { id: 'b', text: 'לכו אל בית המטבעה', nextSceneId: 's2' },
      { id: 'c', text: 'חזרו למעבדה של ד״ר הולו', nextSceneId: 's2' },
    ],
  })
  const m = await measureBox(page)
  const stage = await page.locator('[data-choices-stage]').count()
  console.log(s.key, JSON.stringify({ area: m.areaClient, lines: m.textLines, actionsH: m.actions?.h, choicesOnStage: stage }))
  await page.screenshot({ path: path.join(OUT, `hub-${s.key}.png`) })
  await ctx.close()
}
await browser.close()
