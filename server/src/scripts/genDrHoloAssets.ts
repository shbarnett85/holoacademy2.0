/* יוצר פעם אחת את ארבע ההבעות של ד"ר הולו (רגיל, שמח, חושב, מופתע) ושומר אותן כנכסים קבועים: public/dr-holo/*.webp
   הזהות היא החלק הקבוע של התיאור (DR_HOLO_DESCRIPTION), על רקע שחור מלא: אפקט ההולוגרמה נעשה בקוד (DrHoloHologram).
   השחור הופך לשקיפות כבר בנכס (אלפא לפי בהירות), ולכן הדמות שקופה למחצה מעל כל רקע, בלי תלות ב-mix-blend-mode.
   אותו seed לכל ההבעות, כדי שתהיה אותה דמות. ההמרה ל-webp נעשית ב-Chrome (אין בפרויקט תלות native לתמונות).
   הרצה: npx tsx src/scripts/genDrHoloAssets.ts [--seed N] [--force]   |   --alpha-only: רק המרת השחור לשקיפות בנכסים הקיימים (בלי קריאה למודל) */
import '../env.js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { generateImage } from '../lib/together.js'
import { DR_HOLO_DESCRIPTION } from '../prompts/constants.js'
import { findChrome } from '../../../e2e/lib/config.js'

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/dr-holo')
const args = process.argv.slice(2)
const seedAt = args.indexOf('--seed')
const SEED = seedAt >= 0 ? Number(args[seedAt + 1]) : 48213
const FORCE = args.includes('--force')
const ALPHA_ONLY = args.includes('--alpha-only')

/* הזהות בלבד: בלי המשפט על ההולוגרמה, כי האפקט מגיע מהקוד */
const IDENTITY = DR_HOLO_DESCRIPTION.split(', as a translucent')[0]

const MOODS: Record<string, string> = {
  neutral: 'a calm, attentive expression, mouth closed',
  happy: 'a big warm joyful smile, eyes crinkled with delight',
  thinking: 'a thoughtful pondering expression, eyes looking up and to the side, hand on his chin',
  surprised: 'an amazed surprised expression, eyebrows raised high, mouth slightly open',
}

const prompt = (expr: string) =>
  `Head and upper body portrait of ${IDENTITY}, his face showing ${expr}. Centered, facing the viewer, the whole head in frame with space above it. `
  + 'Isolated on a pure solid black background, nothing else in the image, bright clean studio lighting on the figure, digital painting style, detailed illustration, no text, no words, no lettering'

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: findChrome(), headless: true })
const page = await browser.newPage()
/* 480×600 webp, והשחור הופך לשקיפות: אלפא לפי הערוץ הבהיר ביותר, עם צבע מנורמל כדי שהדמות לא תכהה */
const toAsset = (src: string) => page.evaluate(async (s) => {
  const img = new Image()
  img.src = s
  await img.decode()
  const c = document.createElement('canvas')
  c.width = 480
  c.height = 600
  const g = c.getContext('2d')!
  g.drawImage(img, 0, 0, 480, 600)
  const d = g.getImageData(0, 0, 480, 600)
  for (let i = 0; i < d.data.length; i += 4) {
    const m = Math.max(d.data[i], d.data[i + 1], d.data[i + 2])
    const a = Math.min(255, Math.max(0, (m - 14) * 2.4))
    if (m > 0) { const k = Math.min(255 / m, 255 / Math.max(a, 1)); d.data[i] = Math.min(255, d.data[i] * k); d.data[i + 1] = Math.min(255, d.data[i + 1] * k); d.data[i + 2] = Math.min(255, d.data[i + 2] * k) }
    d.data[i + 3] = a
  }
  g.putImageData(d, 0, 0)
  return c.toDataURL('image/webp', 0.84)
}, src)
for (const [mood, expr] of Object.entries(MOODS)) {
  const file = path.join(OUT, `${mood}.webp`)
  if (ALPHA_ONLY) {
    const webp = await toAsset(`data:image/webp;base64,${readFileSync(file).toString('base64')}`)
    writeFileSync(file, Buffer.from(webp.split(',')[1], 'base64'))
    console.log(`עובד: ${mood}`)
    continue
  }
  if (existsSync(file) && !FORCE) { console.log(`קיים: ${mood}`); continue }
  const b64 = await generateImage(prompt(expr), 768, 960, 'background scenery, room, laboratory, gradient background, multiple people, cropped head', SEED)
  const webp = await toAsset(`data:image/png;base64,${b64}`)
  writeFileSync(file, Buffer.from(webp.split(',')[1], 'base64'))
  console.log(`נוצר: ${mood}`)
}
await browser.close()
