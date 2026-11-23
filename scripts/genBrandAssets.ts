/* מייצר את קובצי האייקון ואת תמונת השיתוף מתוך שני קובצי הלוגו שב-public. הקבצים עצמם לא משתנים: רק גודל ורקע.
     favicon.svg                 עותק של holoacademy-mark.svg
     favicon-32x32.png           האייקון, 32 פיקסלים, רקע שקוף
     favicon.ico                 האייקון ב-16, 32 ו-48 (קובצי PNG בתוך ICO)
     apple-touch-icon.png (180), android-chrome-192x192.png, android-chrome-512x512.png
                                 האייקון על ריבוע לוונדר אטום, עם שטח נקי של רבע מרוחבו מכל צד
                                 (iOS צובע רקע שקוף בשחור, ואנדרואיד חותך לעיגול: האייקון כולו בתוך האזור הבטוח)
     og-image.png (1200×630)     הלוגו המלא במרכז, על לוונדר
   הרצה (אחרי שינוי של אחד משני קובצי הלוגו):  npx tsx scripts/genBrandAssets.ts
   הרינדור ב-Chrome המותקן (playwright-core), בלי ספריית תמונות. */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { launchBrowser } from '../e2e/lib/browser.ts'

const PUBLIC = 'public'
const LAVENDER = '#D9D2EC'
const LOGO = readFileSync(path.join(PUBLIC, 'holoacademy-logo.svg'), 'utf8')
const MARK = readFileSync(path.join(PUBLIC, 'holoacademy-mark.svg'), 'utf8')
/* היחס של הלוגו המלא, מה-viewBox שלו */
const LOGO_RATIO = 168 / 204

const dataUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`

const browser = await launchBrowser(false)

async function render(w: number, h: number, body: string, background: string | null): Promise<Buffer> {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  await page.setContent(`<!doctype html><html><body style="margin:0;width:${w}px;height:${h}px;display:grid;place-items:center;background:${background ?? 'transparent'}">${body}</body></html>`)
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())))
  const png = await page.screenshot({ type: 'png', omitBackground: background === null })
  await page.close()
  return png
}

const img = (svg: string, w: number, h: number) => `<img src="${dataUri(svg)}" width="${w}" height="${h}" style="display:block">`

/* האייקון לבדו, על רקע שקוף */
const markPng = (size: number) => render(size, size, img(MARK, size, size), null)
/* האייקון על ריבוע לוונדר: רוחב האייקון שני שלישים מהריבוע, כלומר רבע מרוחבו נשאר נקי מכל צד */
const tilePng = (size: number) => { const m = Math.round(size / 1.5); return render(size, size, img(MARK, m, m), LAVENDER) }

function ico(entries: { size: number; png: Buffer }[]): Buffer {
  const head = Buffer.alloc(6)
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(entries.length, 4)
  let offset = 6 + 16 * entries.length
  const dir = entries.map(({ size, png }) => {
    const e = Buffer.alloc(16)
    e.writeUInt8(size, 0); e.writeUInt8(size, 1); e.writeUInt8(0, 2); e.writeUInt8(0, 3)
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(png.length, 8); e.writeUInt32LE(offset, 12)
    offset += png.length
    return e
  })
  return Buffer.concat([head, ...dir, ...entries.map((e) => e.png)])
}

const out = (name: string, data: Buffer) => { writeFileSync(path.join(PUBLIC, name), data); console.log(`  ${name}  ${data.length} bytes`) }

copyFileSync(path.join(PUBLIC, 'holoacademy-mark.svg'), path.join(PUBLIC, 'favicon.svg'))
console.log('  favicon.svg  (עותק של holoacademy-mark.svg)')
const p32 = await markPng(32)
out('favicon-32x32.png', p32)
out('favicon.ico', ico([{ size: 16, png: await markPng(16) }, { size: 32, png: p32 }, { size: 48, png: await markPng(48) }]))
out('apple-touch-icon.png', await tilePng(180))
out('android-chrome-192x192.png', await tilePng(192))
out('android-chrome-512x512.png', await tilePng(512))
/* תמונת השיתוף: גובה הלוגו 420, ומעליו ומתחתיו נשאר יותר מרבע מרוחבו */
const OG_LOGO_H = 420
out('og-image.png', await render(1200, 630, img(LOGO, Math.round(OG_LOGO_H * LOGO_RATIO), OG_LOGO_H), LAVENDER))

await browser.close()
