/* מרכיב צילום "לפני | אחרי" לכל מסך ייחוס — אותו טקסט, אותו מסך (לפני = הפריסה הישנה עם גלילה, אחרי = הפריסה החדשה).
   הרצה:  npx tsx e2e/textfit/compose-before-after.ts <dir-with-baseline-and-layout-pngs> <outDir> */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { launch } from './lab.ts'

const [dir, out] = [process.argv[2], process.argv[3]]
const SCREENS = [
  { key: 'laptop-620', label: 'נייד בית ספרי <bdi dir="ltr">1366×620</bdi> (ראשי)', w: 1366, h: 620 },
  { key: 'tablet', label: 'טאבלט <bdi dir="ltr">1024×768</bdi>', w: 1024, h: 768 },
  { key: 'phone-landscape', label: 'טלפון לרוחב <bdi dir="ltr">740×360</bdi>', w: 740, h: 360 },
]
const b64 = (p: string) => `data:image/png;base64,${readFileSync(p).toString('base64')}`
const browser = await launch()
for (const s of SCREENS) {
  const before = b64(path.join(dir, `baseline-${s.key}.png`))
  const after = b64(path.join(dir, `layout-${s.key}-long.png`))
  const W = s.w * 2 + 90
  const html = `<!doctype html><html dir="rtl" lang="he"><meta charset="utf-8"><body style="margin:0;background:#0b0f1a;font-family:Heebo,Arial,sans-serif;color:#e8f1ff;width:${W}px">
  <div style="padding:18px 30px 6px;font-size:26px;font-weight:700">${s.label} — אותו טקסט בדיוק</div>
  <div style="display:flex;gap:30px;padding:10px 30px 24px;flex-direction:row">
    <figure style="margin:0"><figcaption style="font-size:22px;padding:6px 0;color:#ffd27a">לפני — גלילה פנימית, המשפט נחתך והכפתורים מחוץ למסך</figcaption><img src="${before}" width="${s.w}" height="${s.h}" style="display:block;border:1px solid #2b3550"></figure>
    <figure style="margin:0"><figcaption style="font-size:22px;padding:6px 0;color:#7dffb2">אחרי — עמודים בגבולות משפט, "1/2" ו"המשך ›", בלי גלילה</figcaption><img src="${after}" width="${s.w}" height="${s.h}" style="display:block;border:1px solid #2b3550"></figure>
  </div></body></html>`
  const page = await browser.newPage({ viewport: { width: W, height: s.h + 130 }, deviceScaleFactor: 1 })
  await page.setContent(html)
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(out, `before-after-${s.key}.png`), fullPage: true })
  await page.close()
  console.log('before-after-' + s.key)
}
await browser.close()
