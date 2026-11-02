/* יוצר קטע וידאו אחד של ד"ר הולו מנכס הבסיס בגוף מלא (image-to-video), על רקע שחור מוחלט: public/dr-holo/<clip>.mp4
   מיועד למיזוג screen בנגן, ולכן אין ערוץ שקיפות, והגוון, קווי הסריקה והגליץ' לא נצרבים בקטע (CSS בלבד). בלי דיסקית ובלי אלומה.
   ספקים: Gemini Omni Flash (דורש חשבון בתשלום; Veo 3.1 נסגר ב-Gemini API ב-22.10.2026), Veo 3.1 דרך Together (--together) או Wan 2.7 דרך Together (--wan).
   עולה כסף, ולכן אין ניסיון חוזר אוטומטי, והתוצאה הגולמית נשמרת לפני העיבוד, כך שאפשר לעבד מחדש בלי לשלם (--process-only).
   עיבוד: ניקוי שחור (levels), לולאה חלקה (קטע קדימה ואחורה), דחיסה עד 3MB, בלי אודיו.
   הרצה: npx tsx src/scripts/genDrHoloClip.ts <mood> [--together|--wan] [--720] [--last] [--force] [--process-only]
   (--720: יצירה ב-720p והגדלה בעיבוד; --last: אותו פריים גם כסוף) */
import '../env.js'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { uploadBase64Image } from '../lib/storage.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const OUT = path.join(ROOT, 'public/dr-holo')
const WORK = path.join(ROOT, 'reports/stage-j/clips')
const GEMINI_MODEL = 'gemini-omni-1.1-flash'
const TOGETHER_MODEL = 'google/veo-3.1'
const WAN_MODEL = 'Wan-AI/wan2.7-i2v'
const MAX_BYTES = 3 * 1024 * 1024

/* ההנחיה המשותפת לכל קטע: רק הדמות, שחור מוחלט, מצלמה קבועה, בלי טקסט ואובייקטים, תנועה עדינה */
const BASE_RULES = 'Only the character from the image, on a pure solid black background that stays completely black in every frame. '
  + 'Locked-off static camera: no zoom, no pan, no camera movement. Single continuous shot with no cuts. '
  + 'No text, no extra objects, no light effects, no background elements. Keep his face, beard, glasses and coat exactly as in the image. '
  + 'Very gentle, subtle motion only. No dialogue, no music, no sound effects.'

/* ד"ר הולו הוא דמות מדריך, העוגן של התלמיד: כל רגש הוא מחווה קלה, עוצמה 3 מתוך 10. פה סגור, בלי שיניים, עיניים בגודל רגיל.
   קטע לכל מצב רוח (גוף מלא, 1080×1920). רק פריים התחלה: עם פריים התחלה וסוף זהים Veo ממציא תנועה גדולה באמצע.
   הלולאה: קטע מהיצירה (calm, נמדד לפי הפרש בין פריימים) קדימה ואחורה, כך שהיא נסגרת בדיוק */
/* "חוגג" הוא עותק של happy.mp4: המודל הוסיף שיניים גם כשביקשנו פה סגור */
const CLIPS: Record<string, { seconds: number; calm?: [number, number]; base: string; motion: string }> = {
  neutral: {
    seconds: 8,
    base: 'neutral',
    motion: 'He stands calmly on the spot and looks at the viewer with a relaxed, attentive face. Slow natural breathing, one natural blink, and a very slight shift of weight. His feet stay planted, his arms stay relaxed at his sides, and his mouth stays closed. His position in the frame does not change.',
  },
  amused: {
    seconds: 8,
    base: 'amused',
    motion: 'He stands on the spot with a faint, knowing half-smile. His expression stays exactly as in the image the whole time and does not grow. His mouth stays closed and his eyes stay their normal size. Only slow breathing and one natural blink. His head stays facing the viewer, his feet stay planted and his arms stay relaxed at his sides. His position in the frame does not change.',
  },
  surprised: {
    seconds: 8,
    base: 'surprised',
    motion: 'He stands on the spot with a gentle look of interest, eyebrows slightly raised. His expression stays exactly as in the image the whole time and does not grow. He does not speak: his lips stay pressed together in every frame and never part. His eyes stay their normal size. Only slow breathing and one natural blink. His head stays facing the viewer, his feet stay planted and his arms stay relaxed at his sides. His position in the frame does not change.',
  },
  thinking: {
    seconds: 8,
    base: 'thinking',
    motion: 'He stands on the spot with a quiet, thoughtful look. His expression stays exactly as in the image the whole time and does not grow. His mouth stays closed and his eyes stay their normal size, looking straight at the viewer in every frame. He does not look up, does not look aside and does not tilt or turn his head. Only slow breathing and one natural blink. His head stays facing the viewer, his feet stay planted and his arms stay relaxed at his sides. His position in the frame does not change.',
  },
  sad: {
    seconds: 8,
    base: 'sad',
    motion: 'He stands on the spot, a little let down, keeping his head lowered exactly as in the image and his eyes looking down at the floor the whole time. His head does not lift and he does not look up. He breathes out slowly once, his shoulders sink very slightly, and he blinks slowly once. His mouth stays closed and his face stays soft and kind. His feet stay planted and his arms stay relaxed at his sides. His position in the frame does not change.',
  },
  angry: {
    seconds: 8,
    base: 'angry',
    motion: 'He stands on the spot with a slightly serious, mildly displeased look. His expression stays exactly as in the image the whole time and does not grow. His mouth stays closed and his eyes stay their normal size. Only slow breathing and one natural blink. His head stays facing the viewer, his feet stay planted and his arms stay relaxed at his sides. His position in the frame does not change.',
  },
  scared: {
    seconds: 8,
    base: 'scared',
    motion: 'He stands on the spot with a slightly concerned look. His expression stays exactly as in the image the whole time and does not grow. His mouth stays closed and his eyes stay their normal size. Only slow breathing and one natural blink. His head stays facing the viewer, his feet stay planted and his arms stay relaxed at his sides. His position in the frame does not change.',
  },
  happy: {
    seconds: 8,
    base: 'happy',
    motion: 'He stands on the spot with a calm, gentle, closed-mouth smile that stays the same size the whole time, looking at the viewer. He breathes slowly, blinks naturally once and gives one small pleased nod. He does not laugh, his mouth stays closed, and his eyes stay relaxed. His feet stay planted and his arms stay relaxed at his sides. His position in the frame does not change.',
  },
}

const args = process.argv.slice(2)
const name = args.find((a) => !a.startsWith('--')) ?? 'neutral'
const clip = CLIPS[name]
if (!clip) throw new Error(`קטע לא מוכר: ${name}. קיימים: ${Object.keys(CLIPS).join(', ')}`)
const FORCE = args.includes('--force')
const WAN = args.includes('--wan')
const TOGETHER = args.includes('--together') || WAN
const PROCESS_ONLY = args.includes('--process-only')

const ff = (...a: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a], { stdio: ['ignore', 'pipe', 'inherit'] })
const probe = (file: string) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim())

mkdirSync(WORK, { recursive: true })
const frame = path.join(WORK, `${clip.base}-full-black.jpg`)
const raw = path.join(WORK, `${name}-raw.mp4`)
const meta = path.join(WORK, `${name}-raw.json`)
const target = path.join(OUT, `${name}.mp4`)

async function generateGemini(): Promise<void> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY חסר ב-env')
  const data = readFileSync(frame).toString('base64')
  const image = { type: 'image', data, mime_type: 'image/jpeg' }
  const body = {
    model: GEMINI_MODEL,
    input: [image, { type: 'text', text: `${clip.seconds}-second video. ${clip.motion} ${BASE_RULES}` }],
    response_format: { type: 'video', aspect_ratio: '9:16', resolution: '1080p' },
    background: false,
    store: false,
    stream: false,
  }
  const t0 = Date.now()
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(280_000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${text.slice(0, 600)}`)
  const json = JSON.parse(text) as { id?: string; status?: string; usage?: unknown; steps?: { type: string; content?: { type: string; data?: string; mime_type?: string }[] }[] }
  const video = json.steps?.flatMap((s) => s.content ?? []).find((c) => c.type === 'video' && c.data)
  if (!video?.data) throw new Error(`לא חזר וידאו: ${text.slice(0, 600)}`)
  writeFileSync(raw, Buffer.from(video.data, 'base64'))
  writeFileSync(meta, JSON.stringify({ id: json.id, status: json.status, usage: json.usage ?? null, model: GEMINI_MODEL, ms: Date.now() - t0 }, null, 2))
  console.log(`נוצר ${path.basename(raw)} ב-${Math.round((Date.now() - t0) / 1000)} שניות, usage: ${JSON.stringify(json.usage ?? null)}`)
}

/* Veo 3.1 או Wan 2.7 דרך Together: עבודה אסינכרונית */
async function generateTogether(): Promise<void> {
  const key = process.env.TOGETHER_API_KEY?.trim()
  if (!key) throw new Error('TOGETHER_API_KEY חסר')
  /* Wan מקבל כתובת ולא base64 (מגבלת אורך). הנכס עולה לאחסון התמונות של הפרויקט */
  const b64 = readFileSync(frame).toString('base64')
  const image = WAN ? await uploadBase64Image(b64, 'holoacademy/dr-holo-assets', `${clip.base}-full`) : b64
  const t0 = Date.now()
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  const res = await fetch('https://api.together.xyz/v2/videos', {
    method: 'POST',
    headers,
    body: JSON.stringify(WAN
      /* Wan 2.7: גודל לפי resolution+ratio. פריים התחלה בלבד */
      ? { model: WAN_MODEL, prompt: `${clip.motion} ${BASE_RULES}`, resolution: '1080P', ratio: '9:16', seconds: '6', output_format: 'MP4', media: { frame_images: [{ input_image: image, frame: 'first' }] } }
      : {
        model: TOGETHER_MODEL,
        prompt: `${clip.motion} ${BASE_RULES}`,
        width: args.includes('--720') ? 720 : 1080,
        height: args.includes('--720') ? 1280 : 1920,
        seconds: String(clip.seconds),
        /* בלי אודיו: Veo מחייב יותר על אודיו, והנגן לא משתמש בו */
        providerSettings: { google: { generateAudio: false } },
        output_format: 'MP4',
        media: { frame_images: [{ input_image: image, frame: 'first' }, ...(args.includes('--last') ? [{ input_image: image, frame: 'last' }] : [])] },
      }),
  })
  const created = await res.text()
  if (!res.ok) throw new Error(`Together ${res.status}: ${created.slice(0, 600)}`)
  const id = (JSON.parse(created) as { id: string }).id
  console.log(`עבודה ${id}`)
  for (;;) {
    await new Promise((r) => setTimeout(r, 8000))
    const poll = await fetch(`https://api.together.xyz/v2/videos/${id}`, { headers })
    const text = await poll.text()
    if (!poll.ok) throw new Error(`Together ${poll.status}: ${text.slice(0, 400)}`)
    const job = JSON.parse(text) as { status: string; outputs?: { video_url?: string; cost?: number }; error?: unknown }
    if (job.status === 'failed' || job.status === 'cancelled') throw new Error(`נכשל: ${text.slice(0, 1400)}`)
    if (job.status !== 'completed') continue
    const url = job.outputs?.video_url
    if (!url) throw new Error(`אין כתובת: ${text.slice(0, 400)}`)
    writeFileSync(raw, Buffer.from(await (await fetch(url)).arrayBuffer()))
    writeFileSync(meta, JSON.stringify({ id, model: WAN ? WAN_MODEL : TOGETHER_MODEL, cost: job.outputs?.cost ?? null, ms: Date.now() - t0 }, null, 2))
    console.log(`נוצר ${path.basename(raw)} ב-${Math.round((Date.now() - t0) / 1000)} שניות, עלות מהספק: ${job.outputs?.cost ?? 'לא דווחה'}`)
    return
  }
}

/* levels שחותך את רצפת הדחיסה, ולולאה: הקטע קדימה ואחורה */
function processClip(crf: number): void {
  const [from, to] = clip.calm ?? [0, probe(raw)]
  const clean = 'scale=1080:1920:flags=lanczos,colorlevels=rimin=0.06:gimin=0.06:bimin=0.06:rimax=0.98:gimax=0.98:bimax=0.98,format=yuv420p'
  const graph = `[0:v]trim=${from}:${to},setpts=PTS-STARTPTS,${clean},split[a][b];[b]reverse,trim=start_frame=1,setpts=PTS-STARTPTS[r];[a][r]concat=n=2:v=1[v]`
  ff('-i', raw, '-filter_complex', graph, '-map', '[v]', '-an', '-c:v', 'libx264', '-profile:v', 'main', '-pix_fmt', 'yuv420p',
    '-preset', 'veryslow', '-crf', String(crf), '-movflags', '+faststart', target)
}

if (!existsSync(frame)) throw new Error(`אין פריים בסיס: ${frame} (genDrHoloAssets.ts --base)`)
if (!PROCESS_ONLY) {
  if (existsSync(raw) && !FORCE) console.log(`כבר קיים ${path.basename(raw)}: בלי קריאה למודל (--force ליצירה מחדש)`)
  else if (TOGETHER) await generateTogether()
  else await generateGemini()
}
if (!existsSync(raw)) throw new Error(`אין ${raw}`)
let crf = 24
processClip(crf)
while (statSync(target).size > MAX_BYTES && crf < 36) { crf += 2; processClip(crf) }
console.log(`${path.basename(target)}: ${(statSync(target).size / 1048576).toFixed(2)}MB, crf ${crf}, ${probe(target).toFixed(2)} שניות בלולאה (מקור ${probe(raw).toFixed(1)} שניות)`)
