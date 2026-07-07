/* קליינט Together AI ליצירת תמונות */

const TOGETHER_URL = 'https://api.together.xyz/v1/images/generations'

/* ששת הסגנונות האמנותיים הסופיים → fragment לפרומפט התמונה.
   הסגנון מצורף *אחרי* תיאור ד"ר הולו + ההבעה (resolveDrHolo ב-images.ts), כך שהזהות נשמרת בכל סגנון. */
const STYLE_SUFFIX: Record<string, string> = {
  'digital-painting': 'digital painting style, vibrant colors, detailed illustration',
  realistic: 'photorealistic, cinematic lighting, high detail',
  comic: 'comic book style, bold outlines, dynamic composition',
  storybook: "soft watercolor children's storybook illustration, warm gentle colors, friendly rounded shapes, whimsical hand-painted look, cozy and inviting",
  anime: 'anime and manga art style, cel shaded, expressive characters, vibrant, clean linework, Japanese animation aesthetic',
  /* בלי מילת המותג "Pixar" — FLUX מצייר שמות מותג כטקסט בתמונה (נצפה: "PIXAR" בשמיים) */
  'pixar-3d': '3D animated feature film style, soft rounded forms, warm cinematic lighting, expressive friendly characters, polished render',
}

/* סגנון לא מוכר (למשל pixel-art ישן שהוסר) → fallback ל-digital-painting, לא נשבר */
export function styledPrompt(imagePrompt: string, artStyle?: string): string {
  const style = STYLE_SUFFIX[artStyle ?? ''] ?? STYLE_SUFFIX['digital-painting']
  /* הגנרטור לפעמים מטמיע את שם הסגנון בתוך ה-imagePrompt עצמו ("..., pixar 3d style") —
     מילת מותג בפרומפט חיובי מנוצחת את ה-negative ומצוירת כטקסט. מסירים אותה תמיד. */
  const clean = imagePrompt.replace(/,?\s*pixar[\s-]*(3d)?\s*(style)?/gi, '').trim()
  /* איסור טקסט גורף — מודל התמונות מג'בר כיתוב (שלטים "PIXIAT", כותרות ג'יבריש).
     המגן בפרומפט החיובי חזק מה-negative לבדו. */
  return `${clean}, ${style}, no text, no words, no lettering, no signs, no captions, no labels`
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const BASE_NEGATIVE = 'text, letters, words, captions, watermark, signature'

/* תוספת ל-negative בהדמיות היסטוריות — מונע הריסות מודרניות */
export const HISTORICAL_NEGATIVE =
  'ruins, crumbling, weathered stone, eroded, broken columns, modern city, tourists, cars, power lines, scaffolding, ' +
  'roofless, missing roof, open-air ruins, partial structure, collapsed roof, broken pediment, incomplete building, exposed interior'

/* יצירת תמונה — מחזירה base64. retry אוטומטי על 429 (rate limit) */
export async function generateImage(
  prompt: string,
  width: number,
  height: number,
  extraNegative?: string,
): Promise<string> {
  const apiKey = process.env.TOGETHER_API_KEY?.trim()
  if (!apiKey) throw new Error('TOGETHER_API_KEY לא מוגדר ב-.env')

  const MAX_ATTEMPTS = 3
  let lastError = ''

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(TOGETHER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'Qwen/Qwen-Image',
        prompt,
        negative_prompt: extraNegative ? `${BASE_NEGATIVE}, ${extraNegative}` : BASE_NEGATIVE,
        width,
        height,
        n: 1,
        /* seed אקראי בכל קריאה — בלעדיו Qwen-Image משתמש ב-seed קבוע, ואותו prompt מחזיר
           את אותה תמונה בדיוק (→ "יצירה מחדש" לא משנה כלום). */
        seed: Math.floor(Math.random() * 2_147_483_647),
        response_format: 'b64_json',
      }),
    })

    if (res.ok) {
      const json = (await res.json()) as { data?: { b64_json?: string }[] }
      const b64 = json.data?.[0]?.b64_json
      if (!b64) throw new Error('Together AI לא החזיר תמונה')
      return b64
    }

    const body = await res.text().catch(() => '')
    lastError = `Together AI החזיר ${res.status}: ${body.slice(0, 200)}`

    /* rate limit או דחייה זמנית — המתנה גדלה בין ניסיונות */
    if ((res.status === 429 || res.status === 401) && attempt < MAX_ATTEMPTS) {
      await sleep(attempt * 20_000)
      continue
    }
    break
  }

  throw new Error(lastError)
}
