/* בדיקת פריסה: הנגן עם הטקסט הארוך — תיבה בלי גלילה, עמודים, מחוון, "המשך ›". */
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { REF_SCREENS, launch, newCtx, openLabScene, measureBox } from './lab.ts'

const OUT = process.argv[2] ?? path.resolve('e2e/textfit/out')
mkdirSync(OUT, { recursive: true })
const SAMPLE = 'בפתח המעבדה עומד גבר בגלימה יוונית, נושם בכבדות. "ד״ר הולו שלח לקרוא לך," הוא אומר. "בעוד שעה תתכנס האסיפה להצביע על גורל העיר, ויש לנו רק זמן קצר כדי להבין מי מזייף את האסימונים." אתה לוקח נשימה עמוקה ומסתכל סביב. על השולחן מונחים חרסים רבים, ולכל אחד מהם סימן אחר חרוט בצד. מי מהם הוא המזויף, ואיך אפשר לדעת זאת בלי להתבלבל?'
const SHORT = 'בפתח המעבדה עומד גבר בגלימה. "ד״ר הולו שלח לקרוא לך," הוא אומר.'

const browser = await launch()
const rows: unknown[] = []
for (const s of REF_SCREENS) {
  for (const [name, text] of [['long', SAMPLE], ['short', SHORT]] as const) {
    const ctx = await newCtx(browser, s)
    const page = await openLabScene(ctx, { narrative: text, drHoloDialog: name === 'long' ? 'שימו לב לסימנים הקטנים, הם מספרים את הסיפור.' : undefined })
    const m = await measureBox(page)
    rows.push({ screen: s.key, case: name, area: m.areaClient, areaPad: m.areaPad, actions: m.actions?.h, lines: m.textLines, font: m.fontPx, line: m.linePx, ind: m.pageIndicator, next: m.hasNextPage, textLen: m.text.length })
    await page.screenshot({ path: path.join(OUT, `layout-${s.key}-${name}.png`) })
    await ctx.close()
  }
}
await browser.close()
writeFileSync(path.join(OUT, 'layout.json'), JSON.stringify(rows, null, 1))
for (const r of rows as any[]) console.log(JSON.stringify(r))
