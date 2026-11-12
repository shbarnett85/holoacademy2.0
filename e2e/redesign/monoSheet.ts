/* גיליון אחד עם חיתוכים מוגדלים של תוויות Space Mono. כלי בדיקה בלבד. */
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'
import { findChrome } from '../lib/config.ts'

const dir = path.resolve(process.argv[2] ?? 'reports/redesign/font')
const crops = [
  { img: 'creator-full.png', x: 250, y: 92, w: 140, h: 58, cap: 'שיעור חדש: תווית משנה באנגלית מתחת לכותרת ("TUNING"), 10.5px' },
  { img: 'creator-full.png', x: 1180, y: 92, w: 140, h: 58, cap: 'שיעור חדש: תווית משנה בעברית ("0 פעילות"), 10.5px' },
  { img: 'creator-full.png', x: 800, y: 618, w: 130, h: 34, cap: 'שיעור חדש: טווח מתחת לסרגל ("4 — 15 סצנות"), 9.5px' },
  { img: 'students-full.png', x: 420, y: 278, w: 560, h: 90, cap: 'כיתות ותלמידים: כותרות הטבלה (9.5px) + קוד כיתה וקוד סודי (11.5px)' },
  { img: 'students-full.png', x: 1010, y: 205, w: 330, h: 95, cap: 'כיתות ותלמידים: כותרת החלונית ושורת הכיתה (8.5 עד 9px)' },
  { img: 'students-full.png', x: 30, y: 205, w: 260, h: 50, cap: 'כיתות ותלמידים: מונה ("25 תלמידים"), 10px' },
]
const Z = 3
const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:28px;background:#fff;font-family:Heebo,Arial,sans-serif;direction:rtl;width:1800px">
<h1 style="font-size:30px;margin:0 0 6px">תוויות Space Mono היום (מוגדל פי ${Z})</h1>
<p style="font-size:19px;margin:0 0 22px;color:#444">ל-Space Mono אין אותיות עבריות. ספרות ואנגלית מוצגות בו, והעברית נופלת לגופן ברירת המחדל של הדפדפן (Times New Roman).</p>
${crops.map((c) => `<div style="margin:0 0 26px"><div style="font-size:20px;font-weight:700;margin-bottom:8px">${c.cap}</div>
<div style="width:${c.w * Z}px;height:${c.h * Z}px;overflow:hidden;border:2px solid #1E1830;border-radius:8px;direction:ltr">
<img src="${pathToFileURL(path.join(dir, c.img)).href}" style="width:${1366 * Z}px;margin-left:${-c.x * Z}px;margin-top:${-c.y * Z}px;display:block"></div></div>`).join('')}
</body>`
const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ['--allow-file-access-from-files'] })
const page = await browser.newPage({ viewport: { width: 1860, height: 900 } })
const f = path.join(dir, '_sheet.html')
await (await import('node:fs/promises')).writeFile(f, html, 'utf8')
await page.goto(pathToFileURL(f).href)
await page.waitForTimeout(600)
await page.screenshot({ path: path.join(dir, 'space-mono-today.png'), fullPage: true })
await browser.close()
console.log('ok')
