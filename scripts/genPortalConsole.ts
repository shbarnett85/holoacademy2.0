/* מייצר את תמונת הקונסולה שלפני הפורטל (public/lab/console.webp) מתוך קובץ המקור שהמשתמש סיפק
   (design-reference/portal-console-source.webp: הקונסולה על רקע שחור, עם הכיתוב אפוי בכפתור).
     1. הכיתוב שבכפתור נמחק (כל שורה ממולאת במעבר בין שני הצדדים הנקיים שלה), כי הכיתוב נכתב בקוד, כטקסט אמיתי.
     2. הרקע השחור הופך לשקוף: מילוי מהשוליים פנימה דרך הפיקסלים הכהים, והזוהר שמסביב נשאר כזוהר חצי שקוף.
     3. חיתוך לקונסולה עצמה.
   הסקריפט מדפיס את המקומות של השדה, של החצים ושל הכפתור באחוזים מהתמונה החתוכה: אלה הקבועים של PortalConsole.tsx.
   הרצה (אחרי שקובץ המקור הוחלף):  npx tsx scripts/genPortalConsole.ts [--preview <dir>]
   הרינדור ב-Chrome המותקן (playwright-core), בלי ספריית תמונות. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { launchBrowser } from '../e2e/lib/browser.ts'

const SOURCE = 'design-reference/portal-console-source.webp'
const TARGET = 'public/lab/console.webp'
const previewAt = process.argv.indexOf('--preview')
const PREVIEW = previewAt > 0 ? process.argv[previewAt + 1] : null

const browser = await launchBrowser(false)
const page = await browser.newPage()
await page.evaluate(`window.__name = (f) => f`)
const out = await page.evaluate(async (src) => {
  const img = new Image(); img.src = src; await img.decode()
  const w = img.naturalWidth, h = img.naturalHeight, k = w / 1671
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h
  const cx = cv.getContext('2d')!; cx.drawImage(img, 0, 0)
  const d = cx.getImageData(0, 0, w, h), p = d.data
  const S = (v: number) => Math.round(v * k)
  const mx = (i: number) => Math.max(p[i], p[i + 1], p[i + 2]), mn = (i: number) => Math.min(p[i], p[i + 1], p[i + 2])
  /* תיבה של פיקסלים שעומדים בתנאי, בתוך אזור חיפוש */
  const bbox = (x0: number, y0: number, x1: number, y1: number, test: (i: number) => boolean) => {
    let a = x1, b = y1, c = x0, e = y0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (test((y * w + x) * 4)) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > e) e = y }
    return { x0: a, y0: b, x1: c, y1: e }
  }

  /* 1. הכיתוב שבכפתור: האותיות הן הפיקסלים הבהירים שבתוך הכפתור */
  const text = bbox(S(660), S(345), S(1012), S(425), (i) => mn(i) > 150)
  const pad = S(14), tx0 = text.x0 - pad, tx1 = text.x1 + pad
  for (let y = text.y0 - pad; y <= text.y1 + pad; y++) {
    const edge = (x: number, c: number) => { let s = 0; for (let j = -2; j <= 2; j++) s += p[(y * w + x + j) * 4 + c]; return s / 5 }
    for (let c = 0; c < 3; c++) {
      const a = edge(tx0 - 3, c), b = edge(tx1 + 3, c)
      for (let x = tx0; x <= tx1; x++) p[(y * w + x) * 4 + c] = Math.round(a + (b - a) * (x - tx0) / (tx1 - tx0))
    }
  }

  /* המקומות של החלקים (לפני החיתוך): השדה הלבן, שני החצים (המסגרת הכחולה שלהם) והכפתור (המסגרת הכתומה) */
  const field = bbox(S(430), S(455), S(1245), S(660), (i) => mn(i) > 236)
  const blue = (i: number) => p[i + 2] > 200 && p[i] < 120
  const left = bbox(S(240), S(470), S(430), S(630), blue), right = bbox(S(1240), S(470), S(1430), S(630), blue)
  const launch = bbox(S(600), S(300), S(1070), S(465), (i) => p[i] > 230 && p[i + 1] > 90 && p[i + 1] < 200 && p[i + 2] < 110)

  /* 2. הרקע השחור: מילוי מהשוליים דרך הפיקסלים הכהים. פיקסל כהה מקבל שקיפות לפי הבהירות שלו, והצבע שלו מתוקן בהתאם,
        כך שהזוהר שסביב הקונסולה נשאר זוהר ולא הופך לשוליים כהים */
  const T = 72
  const seen = new Uint8Array(w * h), stack: number[] = []
  const push = (x: number, y: number) => { const q = y * w + x; if (x < 0 || y < 0 || x >= w || y >= h || seen[q] || mx(q * 4) >= T) return; seen[q] = 1; stack.push(q) }
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1) }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y) }
  while (stack.length) { const q = stack.pop()!, x = q % w, y = (q - x) / w; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1) }
  let x0 = w, y0 = h, x1 = 0, y1 = 0
  for (let q = 0; q < w * h; q++) {
    const i = q * 4
    if (seen[q]) {
      const m = mx(i), a = m / T
      for (let c = 0; c < 3; c++) p[i + c] = a > 0 ? Math.min(255, Math.round(p[i + c] / a)) : 0
      p[i + 3] = Math.round(255 * a * a)
    }
    if (p[i + 3] > 30) { const x = q % w, y = (q - x) / w; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  }
  cx.putImageData(d, 0, 0)

  /* 3. חיתוך */
  const m = S(4); x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m)
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1
  const crop = document.createElement('canvas'); crop.width = bw; crop.height = bh
  crop.getContext('2d')!.drawImage(cv, x0, y0, bw, bh, 0, 0, bw, bh)
  const pct = (b: { x0: number; y0: number; x1: number; y1: number }) => ({
    left: +((b.x0 - x0) / bw * 100).toFixed(2), top: +((b.y0 - y0) / bh * 100).toFixed(2),
    width: +((b.x1 - b.x0 + 1) / bw * 100).toFixed(2), height: +((b.y1 - b.y0 + 1) / bh * 100).toFixed(2),
  })
  return { webp: crop.toDataURL('image/webp', 0.92), png: crop.toDataURL('image/png'), bw, bh, field: pct(field), left: pct(left), right: pct(right), launch: pct(launch) }
}, `data:image/webp;base64,${readFileSync(SOURCE).toString('base64')}`)
await page.close()

const bytes = (url: string) => Buffer.from(url.split(',')[1], 'base64')
writeFileSync(TARGET, bytes(out.webp))
console.log(`${TARGET}: ${out.bw}x${out.bh}, ${(bytes(out.webp).length / 1024).toFixed(0)}KB`)
console.log(JSON.stringify({ aspect: +(out.bw / out.bh).toFixed(4), field: out.field, left: out.left, right: out.right, launch: out.launch }, null, 1))

if (PREVIEW) {
  /* לבדיקה בעין: התמונה על לוונדר ועל כהה */
  mkdirSync(PREVIEW, { recursive: true })
  const pv = await browser.newPage({ viewport: { width: 1600, height: 1040 } })
  await pv.setContent(`<body style="margin:0"><div style="background:#cfc4f2;padding:30px"><img src="${out.png}" width="1500"></div><div style="background:#2a2150;padding:30px"><img src="${out.png}" width="1500"></div></body>`)
  await pv.evaluate(() => Promise.all([...document.images].map((i) => i.decode())))
  await pv.screenshot({ path: path.join(PREVIEW, 'console-preview.png') })
  await pv.close()
}
await browser.close()
