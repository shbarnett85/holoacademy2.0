/* הצעות לתמונת המעבדה הקבועה של מסכי הפתיחה והסיכום (2560×1440): reports/stage-j/lab/option-<n>.jpg
   בתמונה: מסגרת פורטל שפנים שלה אחיד (יוחלף בקוד), ושטח רצפה פנוי לידה לד"ר הולו. אין דמויות.
   עמודת התמונה צרה מ-16:9, ולכן cover חותך מהצדדים: הפורטל והרצפה הפנויה חייבים להיות בחלק האמצעי של הרוחב.
   עולה כסף (Together). הרצה: npx tsx src/scripts/genLabOptions.ts [--only 1,3] */
import '../env.js'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../reports/stage-j/lab')
const MODEL = 'ByteDance/Seedream-5.0-lite'
const WIDTH = 2560
const HEIGHT = 1440

const COMMON = 'Wide cinematic establishing view of an empty futuristic science laboratory, deep navy blue and dark blue walls with cyan light accents, dim moody lighting, clean and uncluttered, digital painting, detailed illustration. '
  + 'The portal frame stands on the floor, its base at floor level, slightly to the right of the center of the image. '
  + 'The inside of the portal frame is completely filled with one flat uniform solid pure black color: no scene through it, no stars, no gradient, no reflection, no light inside it. '
  + 'To the left of the portal there is a wide open empty area of smooth floor, clearly visible, with nothing standing on it. '
  + 'The portal and the empty floor area are both inside the central 70 percent of the image width. The camera looks straight at the portal from a low eye level, with no tilt. '
  + 'Absolutely no people, no characters, no figures, no silhouettes, no robots, no holograms of people. No text, no words, no lettering, no signs, no logos'

/* השילוב שנבחר: החדר והטבעת מהצעה 1, קומפוזיציה חזיתית וסימטרית מהצעה 2, רצפה מאט: בלי השתקפויות, כי השתקפות אמיתית הייתה צריכה להראות את מה שבתוך הפורטל */
const MIX = 'A wide cinematic, perfectly symmetrical, straight-on view of an empty round domed futuristic laboratory chamber: curved deep navy blue walls, a shallow dome ceiling with structural ribs, thin cyan light accents on the walls and ribs, dim moody lighting, digital painting, detailed illustration. '
  + 'In the exact center of the image stands one large perfectly circular ring-shaped portal frame of brushed dark metal with a thin glowing cyan inner edge. The ring faces the camera head-on, not rotated, so it appears as a perfect circle. Its bottom rests on the floor. '
  + 'The inside of the ring is completely filled with one flat uniform solid pure black color: no scene through it, no stars, no gradient, no reflection, no light inside it. '
  + 'The floor is a completely matte, dull, non-reflective dark slate surface, with no reflections at all, no glossy highlights, no light lines, no glowing rings, no pattern and no light from the portal on it. '
  + 'Wide open empty floor on both sides of the portal, with nothing standing on it. '
  + 'Absolutely no people, no characters, no figures, no silhouettes, no robots, no holograms of people. No text, no words, no lettering, no signs, no logos'

/* החדר שלפני הפורטל: דטה סנטר של AI אמיתי, עם ניאון סייברפאנקי מאופק. הטבעת והרצפה המאט כמו ב-MIX */
const dataCenter = (room: string, ringHeight = 70) => `A wide cinematic, perfectly symmetrical, straight-on one-point-perspective view of ${room} `
  + 'It must look like a real working facility, believable and restrained, not over the top: dim moody lighting, mostly dark, photorealistic digital painting. '
  + `In the exact center of the image stands one large perfectly circular ring-shaped portal frame of brushed dark metal with a thin glowing cyan inner edge. The ring faces the camera head-on, not rotated, so it appears as a perfect circle. Its bottom rests on the floor, and its height is about ${ringHeight} percent of the image height, and there is a lot of room on its left and right. `
  + 'The inside of the ring is completely filled with one flat uniform solid pure black color: no scene through it, no stars, no gradient, no reflection, no light inside it. '
  + 'The floor is completely matte, dull and non-reflective dark grey raised-floor tiles with a faint square grid, with no reflections at all, no glossy highlights, no glowing lines and no light from the portal on it. '
  + 'The aisle floor on both sides of the ring is empty, with nothing standing on it. '
  + 'Absolutely no people, no characters, no figures, no silhouettes, no robots, no holograms of people. No text, no words, no numbers, no lettering, no signs, no logos, no screens with writing'

const RACKS = 'the central cold aisle of a modern AI data center hall: tall rows of black GPU server racks line the left and right sides and recede toward the far wall, perforated rack doors with rows of tiny blue and cyan status LEDs, overhead cable trays with neatly bundled cables and thin liquid-cooling pipes.'

const OPTIONS: { name: string; prompt: string; full?: boolean }[] = [
  { name: 'טבעת עגולה באולם עגול', prompt: 'A large perfectly circular ring-shaped portal frame of brushed dark metal with a thin glowing cyan inner edge, inside a round domed chamber with a polished reflective dark floor and concentric floor light lines.' },
  { name: 'שער קשתי במסדרון', prompt: 'A tall arched gateway portal frame with a rounded top, made of dark metal with vertical cyan light strips, at the end of a long lab hall with symmetrical wall panels and a matte dark floor with a faint grid.' },
  { name: 'משושה בקיר עם עמדות עבודה', prompt: 'A large regular hexagonal portal frame set against the back wall, thick dark metal with cyan edge lighting, lab workbenches and glowing instrument consoles pushed against the far right wall, a dark tiled floor.' },
  { name: 'מלבן מעוגל על מרפסת תצפית', prompt: 'A large rounded-rectangle portal frame, like a huge screen standing upright, slim dark frame with soft cyan rim light, in a wide observation-deck style lab with low railings far behind it, tall dark window panels and a smooth glossy floor.' },
  { name: 'שילוב: גרסה א', prompt: MIX, full: true },
  { name: 'שילוב: גרסה ב', prompt: MIX, full: true },
  { name: 'שילוב: גרסה ג', prompt: MIX, full: true },
  { name: 'דטה סנטר: מעבר קר, ניאון ציאן', prompt: dataCenter(`${RACKS} Thin cyan neon light lines run along the top edges of the racks and along the ceiling.`), full: true },
  { name: 'דטה סנטר: ציאן ונגיעות מג׳נטה', prompt: dataCenter(`${RACKS} Thin cyan neon light lines run along the top edges of the racks, with a few restrained thin magenta neon accents and a few small magenta LEDs among the cyan ones.`), full: true },
  { name: 'דטה סנטר: אולם רחב עם זכוכית', prompt: dataCenter('a wide AI data center hall seen from a central aisle: rows of black GPU server racks behind floor-to-ceiling glass containment panels on the left and right, tiny blue and cyan status LEDs, overhead cable trays and thin liquid-cooling pipes, thin cyan and a little magenta neon light along the ceiling and the top of the glass panels.'), full: true },
  { name: 'דטה סנטר: אולם זכוכית, טבעת קטנה', prompt: dataCenter('a wide AI data center hall seen from a central aisle: rows of black GPU server racks behind floor-to-ceiling glass containment panels on the left and right, tiny blue and cyan status LEDs, overhead cable trays and thin liquid-cooling pipes, thin cyan and a little magenta neon light along the ceiling and the top of the glass panels.', 58), full: true },
  { name: 'דטה סנטר: אולם זכוכית, טבעת קטנה ב', prompt: dataCenter('a wide AI data center hall seen from a central aisle: rows of black GPU server racks behind floor-to-ceiling glass containment panels on the left and right, tiny blue and cyan status LEDs, overhead cable trays and thin liquid-cooling pipes, thin cyan and a little magenta neon light along the ceiling and the top of the glass panels.', 58), full: true },
  { name: 'דטה סנטר: קיר אחורי של צינורות', prompt: dataCenter(`${RACKS} Behind the ring the aisle ends in a dark wall of orderly coolant pipes and cable bundles. Thin cyan neon lines run along the ceiling, with one thin magenta neon line on each side.`), full: true },
]

const onlyAt = process.argv.indexOf('--only')
const only = onlyAt >= 0 ? process.argv[onlyAt + 1].split(',').map(Number) : null
const key = process.env.TOGETHER_API_KEY?.trim()
if (!key) throw new Error('TOGETHER_API_KEY חסר')
mkdirSync(OUT, { recursive: true })

for (const [i, option] of OPTIONS.entries()) {
  const n = i + 1
  if (only && !only.includes(n)) continue
  const res = await fetch('https://api.together.xyz/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt: option.full ? option.prompt : `${option.prompt} ${COMMON}`, width: WIDTH, height: HEIGHT, n: 1, response_format: 'b64_json' }),
    signal: AbortSignal.timeout(240_000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Together ${res.status} בהצעה ${n}: ${text.slice(0, 500)}`)
  const b64 = (JSON.parse(text) as { data?: { b64_json?: string }[] }).data?.[0]?.b64_json
  if (!b64) throw new Error(`לא חזרה תמונה בהצעה ${n}: ${text.slice(0, 300)}`)
  writeFileSync(path.join(OUT, `option-${n}.jpg`), Buffer.from(b64, 'base64'))
  console.log(`הצעה ${n}: ${option.name}`)
}
