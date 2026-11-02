import { claude } from './claude.js'

/* ── בקרת דיוק של תמונת סצנה אחרי היצירה ──
   מודל התמונות טועה גם כשהפרומפט נכון (שמש קטנה שמתנגשת בכוכב לכת, שני כדורי ארץ, חגורת אסטרואידים במקום הלא נכון),
   ולכן בודקים את התמונה עצמה, ולא רק את הפרומפט. נכשלת-פתוח: תקלה טכנית לא חוסמת יצירה.
   כיבוי: IMAGE_REVIEW=0 */
const MODEL = 'claude-sonnet-4-6'

const INSTRUCTION = `You check one background image from an educational game for children. The students learn from it, so it must not teach anything false.
Report only clear errors that a teacher would notice:
- Scientific errors: wrong relative sizes of well-known objects (the Sun far smaller than a planet), celestial bodies touching, overlapping or colliding, a body shown twice in one view (two Earths, two Moons), objects in the wrong place (the asteroid belt around the outer planets instead of between Mars and Jupiter), wrong features (rings on a rocky planet), wrong anatomy or biology, impossible physics or geography presented as real.
- Historical errors: modern objects in a past era, ruins where the scene shows a building in use, wrong era clothing or architecture.
- Readable text, letters or labels in the image.
Artistic style, dramatic light and simplification are fine. Do not report something you are unsure about.`

export interface ImageReview { ok: boolean; problems: string[] }

const mediaTypeOf = (b64: string): 'image/png' | 'image/jpeg' | 'image/webp' =>
  b64.startsWith('/9j/') ? 'image/jpeg' : b64.startsWith('UklG') ? 'image/webp' : 'image/png'

export async function reviewSceneImage(b64: string, ctx: { prompt: string; establishing?: boolean; lessonTitle?: string }): Promise<ImageReview> {
  if (process.env.IMAGE_REVIEW === '0') return { ok: true, problems: [] }
  try {
    const rules = ctx.establishing
      ? `${INSTRUCTION}\n- This image is an establishing shot of a place: any person, character, crowd or animal in it is an error.`
      : INSTRUCTION
    const res = await claude.messages.create({
      model: MODEL,
      max_tokens: 1200,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaTypeOf(b64), data: b64 } },
          /* קודם רישום של מה שרואים ואיפה, ואז הכרעה: בלי הרישום המודל מאשר לפי הכוונה בפרומפט ולא לפי התמונה (תמונת ירח עם שני כדורי ארץ עברה) */
          { type: 'text', text: `${rules}\n\nLesson: ${ctx.lessonTitle ?? ''}\nIntended scene: ${ctx.prompt}\n\nLook at the image itself, not at the intended scene. First list every distinct object you see and where it is: count each surface, sphere, horizon or body separately, including a curved horizon or atmosphere at the edge of the frame. Then judge whether this could be real.\nAnswer with JSON only: {"seen": ["..."], "problems": ["short description in English"]}. An empty problems list means the image is fine.` },
        ],
      }],
    })
    const block = res.content.find((b) => b.type === 'text')
    const text = block && block.type === 'text' ? block.text : ''
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as { problems?: unknown }
    const problems = Array.isArray(parsed.problems) ? parsed.problems.filter((p): p is string => typeof p === 'string' && !!p.trim()) : []
    return { ok: problems.length === 0, problems }
  } catch (err) {
    console.warn('[images] בקרת תמונה נכשלה, ממשיכים בלי בקרה:', err instanceof Error ? err.message : err)
    return { ok: true, problems: [] }
  }
}
