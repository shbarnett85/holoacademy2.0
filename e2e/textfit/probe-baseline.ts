/* מדידת בסיס: הגיאומטריה של תיבת הטקסט בנגן לפני השינוי, בכל מסכי הייחוס. */
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { REF_SCREENS, launch, newCtx, openLabScene, measureBox } from './lab.ts'

const OUT = process.argv[2] ?? path.resolve('e2e/textfit/out')
mkdirSync(OUT, { recursive: true })
const SAMPLE = 'בפתח המעבדה עומד גבר בגלימה יוונית, נושם בכבדות. "ד״ר הולו שלח לקרוא לך," הוא אומר. "בעוד שעה תתכנס האסיפה להצביע על גורל העיר, ויש לנו רק זמן קצר כדי להבין מי מזייף את האסימונים." אתה לוקח נשימה עמוקה ומסתכל סביב. על השולחן מונחים חרסים רבים, ולכל אחד מהם סימן אחר חרוט בצד. מי מהם הוא המזויף, ואיך אפשר לדעת זאת בלי להתבלבל?'

const browser = await launch()
const rows: unknown[] = []
for (const s of REF_SCREENS) {
  const ctx = await newCtx(browser, s)
  const page = await openLabScene(ctx, { narrative: SAMPLE, drHoloDialog: 'שימו לב לסימנים הקטנים, הם מספרים את הסיפור.' })
  const m = await measureBox(page)
  rows.push({ screen: s.key, ...m })
  await page.screenshot({ path: path.join(OUT, `baseline-${s.key}.png`) })
  await ctx.close()
}
await browser.close()
writeFileSync(path.join(OUT, 'baseline.json'), JSON.stringify(rows, null, 1))
console.log(JSON.stringify(rows.map((r: any) => ({ screen: r.screen, root: r.rootFontPx, panel: r.panel, first: r.firstClient, actions: r.actions, font: r.fontPx, line: r.linePx, fam: r.fontFamily?.slice(0, 40) })), null, 1))
