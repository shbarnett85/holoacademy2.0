/* יוצר פעם אחת את נכסי ד"ר הולו בגוף מלא: public/dr-holo/{neutral,happy,thinking,surprised}.webp (720×1280, רקע שקוף).
   שלב 1 (--base): נכס הבסיס. אותה דמות לפי DR_HOLO, בעמידה טבעית מהראש עד הנעליים, על שחור מלא. בלי מקרן ובלי דיסקית.
   שלב 2 (--moods): שלוש ההבעות האחרות הן עריכה של נכס הבסיס ולא יצירה חדשה, כדי שהדמות, הגוף והבגדים יהיו זהים. "רגיל" הוא הבסיס עצמו.
   השחור הקשור לשולי התמונה הופך לשקיפות (מילוי מהשוליים), ולכן חולצה כהה בתוך הדמות נשארת אטומה.
   המקורות על שחור נשמרים ב-reports/stage-j/clips: מהם נוצרים קטעי הווידאו (genDrHoloClip.ts). הגוון הכחול בקוד (DrHoloHologram), לא בנכס.
   עולה כסף (Together, בערך $0.03 לתמונה). הרצה: npx tsx src/scripts/genDrHoloAssets.ts --base | --outfit <slug> [--from <file>] | --edit <from> <to> "<prompt>" | --moods | --alpha-only */
import '../env.js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { DR_HOLO_IDENTITY } from '../prompts/constants.js'
import { findChrome } from '../../../e2e/lib/config.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const OUT = path.join(ROOT, 'public/dr-holo')
const RAW = path.join(ROOT, 'reports/stage-j/clips')
const args = process.argv.slice(2)
const WIDTH = 720
const HEIGHT = 1280
const MODEL = 'black-forest-labs/FLUX.2-pro'
const USD_PER_IMAGE = 0.03
const rawPath = (mood: string) => path.join(RAW, `${mood}-full-black.jpg`)

const BASE_PROMPT = `Full body portrait of ${DR_HOLO_IDENTITY}, light grey shoes, a calm attentive expression, mouth closed. `
  + 'He stands in a natural relaxed pose, facing the viewer, arms loose at his sides with both hands fully visible. '
  + 'The entire figure is in frame from the top of the head to the soles of the shoes, centered, with a small margin above the head and below the shoes. '
  + 'Isolated on a pure solid black background: no floor, no shadow, no base, no platform, no light beam, no glow around him, nothing else in the image. '
  + 'Bright even studio lighting on the whole figure, natural skin tones, digital painting style, detailed illustration, no text, no words, no lettering'

/* "חוגג" לא נוצר בנפרד: המודל מוסיף שיניים גם כשמבקשים פה סגור, ולכן public/dr-holo/celebrating.* הם עותק של happy */
const MOODS: Record<string, string> = {
  happy: 'a warm, calm, modest closed-mouth smile, with relaxed natural eyes that stay open and look at the viewer, a gentle kind look, not exaggerated',
  thinking: 'a quiet thoughtful look: softened eyebrows, lips gently together',
  surprised: 'a gentle look of interest: eyebrows raised only slightly',
  amused: 'a faint knowing half-smile: the corners of the closed mouth lifted very slightly',
  /* "עצוב" הוא מבט מאוכזב קל, ולכן הראש זז. נוצר ב---edit ולא ב---moods, כי editPrompt נועל את התנוחה */
  sad: 'a little bummed and slightly let down: his head lowered only a little with his whole face still visible, soft kind eyes looking down toward the floor, eyebrows relaxed and tilted slightly up in the middle, not frowning, not stern, mouth closed with a tiny soft downturn, not crying, not despairing',
  angry: 'a slightly serious, mildly displeased look: eyebrows lowered just a touch, a steady calm gaze, not frightening',
  scared: 'a slightly concerned look: eyebrows just a little raised and drawn together, calm eyes',
}
/* --outfit <slug>: מחליף רק את הבגדים בנכס שב---from, לקובץ מועמד neutral-outfit-<slug>.jpg. הנבחר מועתק ידנית ל-neutral-full-black.jpg */
const OUTFIT = 'Redraw only his clothes, exactly as follows, from the inside out. '
  + 'Shirt: a dark navy long-sleeved collared button-up dress shirt, buttoned, with a neat collar and a visible row of buttons, no tie, seen down the open front of the coat. '
  + 'Trousers: plain medium grey trousers. Shoes: light grey, unchanged. '
  + 'Coat: over the shirt he wears an open semi-transparent sapphire blue lab coat, made of see-through glassy material, with bright glowing neon cyan lines all over it that look like electronic circuit board traces. '
  + 'The coat hem ends exactly at his knees, so the knees are level with the bottom of the coat. '
  + 'The coat sleeves are long and reach his wrists, and they completely cover the shirt sleeves: no shirt cuff sticks out past the end of the coat sleeve, only his hands come out of the coat sleeves. The navy shirt sleeves are faintly visible through the see-through coat sleeves. '
  + 'Keep the same man, same face, same beard, same glasses, same pose, same hands, same framing, same pure black background. No other change'
/* דמות מדריך: כל רגש הוא מחווה קלה, עוצמה 3 מתוך 10. המודל נוטה להגזים, ולכן זה נאמר במפורש */
const editPrompt = (expr: string) => `Make a tiny adjustment to his face only: ${expr}. His eyes stay open at exactly the same size, his head stays at exactly the same angle, his mouth stays closed with no teeth. `
  + 'Keep everything else exactly identical: the same man, same face shape, same pose, same body, same hands, same clothes, same glasses, same framing, same pure black background. No other change'

async function together(prompt: string, reference?: string): Promise<Buffer> {
  const key = process.env.TOGETHER_API_KEY?.trim()
  if (!key) throw new Error('TOGETHER_API_KEY חסר')
  const res = await fetch('https://api.together.xyz/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt, width: WIDTH, height: HEIGHT, n: 1, response_format: 'b64_json', ...(reference ? { reference_images: [reference] } : {}) }),
    signal: AbortSignal.timeout(180_000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Together ${res.status}: ${text.slice(0, 500)}`)
  const b64 = (JSON.parse(text) as { data?: { b64_json?: string }[] }).data?.[0]?.b64_json
  if (!b64) throw new Error(`לא חזרה תמונה: ${text.slice(0, 300)}`)
  return Buffer.from(b64, 'base64')
}

const dataUri = (file: string, mime: string) => `data:${mime};base64,${readFileSync(file).toString('base64')}`

/* שחור שקשור לשולי התמונה → שקוף, עם קצה רך. webp כדי שהנכס יהיה קל */
async function toAssets(moods: string[]): Promise<void> {
  const browser = await chromium.launch({ executablePath: findChrome(), headless: true })
  const page = await browser.newPage()
  await page.addInitScript('window.__name = (f) => f')
  await page.goto('about:blank')
  for (const mood of moods) {
    if (!existsSync(rawPath(mood))) continue
    const webp = await page.evaluate(async ([src, w, h]) => {
      const img = new Image()
      img.src = src as string
      await img.decode()
      const c = document.createElement('canvas')
      c.width = w as number
      c.height = h as number
      const g = c.getContext('2d')!
      g.drawImage(img, 0, 0, c.width, c.height)
      const d = g.getImageData(0, 0, c.width, c.height)
      const W = c.width
      const H = c.height
      const lum = (i: number) => Math.max(d.data[i * 4], d.data[i * 4 + 1], d.data[i * 4 + 2])
      const bg = new Uint8Array(W * H)
      const stack: number[] = []
      const push = (i: number) => { if (!bg[i] && lum(i) < 26) { bg[i] = 1; stack.push(i) } }
      for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x) }
      for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1) }
      while (stack.length) {
        const i = stack.pop()!
        const x = i % W
        if (x > 0) push(i - 1)
        if (x < W - 1) push(i + 1)
        if (i >= W) push(i - W)
        if (i < W * (H - 1)) push(i + W)
      }
      for (let i = 0; i < W * H; i++) {
        if (bg[i]) { d.data[i * 4 + 3] = 0; continue }
        /* קצה: פיקסל שנוגע ברקע מקבל שקיפות לפי הבהירות שלו */
        const x = i % W
        const edge = (x > 0 && bg[i - 1]) || (x < W - 1 && bg[i + 1]) || (i >= W && bg[i - W]) || (i < W * (H - 1) && bg[i + W])
        if (edge) d.data[i * 4 + 3] = Math.min(255, lum(i) * 3)
      }
      g.putImageData(d, 0, 0)
      return c.toDataURL('image/webp', 0.86)
    }, [dataUri(rawPath(mood), 'image/jpeg'), WIDTH, HEIGHT] as const)
    writeFileSync(path.join(OUT, `${mood}.webp`), Buffer.from(webp.split(',')[1], 'base64'))
    console.log(`נכס: ${mood}.webp`)
  }
  await browser.close()
}

mkdirSync(RAW, { recursive: true })
mkdirSync(OUT, { recursive: true })
if (args.includes('--base')) {
  writeFileSync(rawPath('neutral'), await together(BASE_PROMPT))
  console.log(`בסיס נוצר. עלות משוערת: $${USD_PER_IMAGE}`)
  await toAssets(['neutral'])
} else if (args.includes('--outfit')) {
  const slug = args[args.indexOf('--outfit') + 1]
  const from = args.includes('--from') ? path.join(RAW, args[args.indexOf('--from') + 1]) : rawPath('neutral')
  writeFileSync(path.join(RAW, `neutral-outfit-${slug}.jpg`), await together(OUTFIT, dataUri(from, 'image/jpeg')))
  console.log(`בגדים: ${slug}. עלות משוערת: $${USD_PER_IMAGE}`)
} else if (args.includes('--edit')) {
  /* --edit <מקור> <יעד> "<הנחיה>": תיקון נקודתי של נכס גולמי, בלי לגעת בשאר */
  const [from, to, prompt] = args.slice(args.indexOf('--edit') + 1)
  writeFileSync(path.join(RAW, `${to}.jpg`), await together(prompt, dataUri(path.join(RAW, `${from}.jpg`), 'image/jpeg')))
  console.log(`נערך: ${to}. עלות משוערת: $${USD_PER_IMAGE}`)
} else if (args.includes('--moods')) {
  const reference = dataUri(rawPath('neutral'), 'image/jpeg')
  /* --only <mood>: עריכה מחדש של הבעה אחת */
  const onlyAt = args.indexOf('--only')
  const only = onlyAt >= 0 ? args[onlyAt + 1] : null
  for (const [mood, expr] of Object.entries(MOODS)) {
    if (only && only !== mood) continue
    writeFileSync(rawPath(mood), await together(editPrompt(expr), reference))
    console.log(`הבעה נערכה: ${mood}`)
  }
  console.log(`עלות משוערת: $${(USD_PER_IMAGE * (only ? 1 : 3)).toFixed(2)}`)
  await toAssets(Object.keys(MOODS))
} else if (args.includes('--alpha-only')) {
  await toAssets(['neutral', ...Object.keys(MOODS)])
} else {
  throw new Error('--base | --outfit | --edit | --moods | --alpha-only')
}
