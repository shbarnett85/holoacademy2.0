/* תמונת העטיפה של שיעור (לבקשת המשתמש): תמונה אחת שמייצגת את השיעור כולו, כמו עטיפה של ספר. היא "שער הכניסה" לשיעור:
   מוצגת בפורטל של מסך בחירת השיעורים ובכרטיס השיעור בכל הרשימות (lessonThumbUrl).
   למה צריך אותה: עד עכשיו בפורטל של מסך הבחירה הוצגה התמונה של העמוד הראשון, ואותה תמונה בדיוק הוצגה שוב בפורטל
   שבתוך השיעור, אחרי הפתיחה. שני פורטלים עם אותה תמונה בלבלו.
   מה יש בה: נושא מרכזי אחד (האדם, התופעה, המקום או החפץ שהשיעור עוסק בו) ומסביבו כמה מהדברים המזוהים ביותר עם
   הנושא. למשל בשיעור על לאונרדו דה וינצ'י: לאונרדו עצמו, ומסביבו כמה מהיצירות וההמצאות המפורסמות שלו.
   הפרומפט של התמונה נכתב כאן, בקריאה קצרה למודל, מתוך השיעור שכבר נוצר (ולא בפרומפט היצירה הגדול): כך אותה פקודה
   משמשת שיעור חדש (routes/images.ts, יחד עם שאר התמונות) ושיעור קיים (scripts/backfillCovers.ts).
   נשמר ב-game_data.cover = { imagePrompt, imageUrl }. */
import { claude } from './claude.js'
import { callGeminiText } from './gemini.js'
import { engineFor } from './modelRouter.js'

/* המזהה של העטיפה בנתיבי התמונות (היא אינה עמוד בשיעור) */
export const COVER_SCENE_ID = '__cover__'

export interface CoverScene { id: string; title?: string; narrative?: string; imagePrompt?: string }
export interface CoverSource { title: string; gameData: { scenes?: CoverScene[]; entrySceneId?: string; isHistorical?: boolean } }

const COVER_INSTRUCTION = `You write ONE text-to-image prompt for the COVER image of a lesson for school children: the single picture that represents the whole lesson, like the cover of a book or a film poster, but without any text.
Rules:
- One clear central subject that stands for the whole lesson: the main person, creature, object, place or phenomenon the lesson is about. If the lesson is about a person, show that person in the centre, large, as the world recognises them: at the age and with the look they are famous for (for example Leonardo da Vinci as the old master with the long grey beard), even when the story of the lesson shows them as a child, and with accurate clothing for their time.
- Around the centre, exactly 3 of the most famous, instantly recognisable things connected to the topic (works, inventions, tools, symbols, key moments), arranged as one balanced composition. Choose them from general knowledge of the topic, the things everyone knows it for, and not from small details of this lesson's story.
- Describe each of those things concretely, by what it looks like, as a physical object standing in the scene (a framed painting on an easel, a wooden model hanging from the ceiling, a drawing pinned to the wall, a tool on a table), and make each one large and clearly visible: an image model drops anything that is only named or only hinted at.
- The image model does not know works of art, inventions or monuments by their names, so never rely on a name: describe what the thing looks like. Instead of "the Mona Lisa": "a framed portrait of a dark-haired woman with a faint smile and folded hands, a hazy landscape behind her". Instead of "a flying machine": "a large wooden glider with bat-like canvas wings".
- Lay the picture out explicitly, because otherwise the image model paints a close-up portrait and nothing else: a wide frame; the central subject in the middle third, shown from the waist up and not as a close-up; then say where each surrounding thing is (on the left, on the right, above, in the foreground).
- It must NOT be a plain view of a place. Inside the lesson the next picture is a wide, empty establishing shot, and the cover has to look clearly different from it.
- Historically and scientifically accurate. Nothing modern in a historical topic. For a science topic keep it simple and correct: one main body or organism with a few correct details, never a crowded diagram.
- No text, letters, numbers, titles, logos, labels, frames or borders. The image model writes gibberish on anything that can carry writing, so never include a scroll, parchment, manuscript, letter, notebook, open book, page of writing, map, sign, banner or blackboard, and never use the words writing, script, text, notes or handwriting. Show drawings and objects only.
- No hologram, no scientist host character, no laboratory, no screens.
- The only people in the image are the ones the topic is about. Never add children, pupils or an audience, and do not use the words children, kids or students in the prompt.
- Warm, inviting, full of wonder. No violence, no gore.
- English, one paragraph, at most 110 words. Output only the prompt, nothing else.`

/* מה שנוסף לפרומפט בזמן היצירה: קומפוזיציה של עטיפה */
export const COVER_SUFFIX = 'wide shot, the central subject in the middle third of the frame, the surrounding objects large and clearly visible on both sides, balanced composition, not a close-up portrait'

const stripNikud = (s: string) => s.replace(/[֑-ׇ]/g, '')
const short = (s: string | undefined, n: number) => { const t = stripNikud(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n)}…` : t }

/* מה שהמודל מקבל: שם השיעור, העמודים שלו בקצרה, והפרומפט של התמונה שאחרי הפתיחה (שממנה העטיפה צריכה להיות שונה).
   בלי שום פרט על תלמידים או מורים: רק תוכן השיעור. */
export function coverBrief(src: CoverSource): string {
  const scenes = src.gameData.scenes ?? []
  const entry = scenes.find((s) => s.id === src.gameData.entrySceneId) ?? scenes[0]
  const content = scenes.filter((s) => s !== entry)
  const pages = (content.length ? content : scenes).slice(0, 8).map((s) => `- ${short(s.title, 60)}: ${short(s.narrative, 160)}`)
  const establishing = short(content[0]?.imagePrompt, 300)
  return [
    `Lesson title (Hebrew): ${short(src.title, 120)}`,
    src.gameData.isHistorical ? 'The lesson takes place in the past.' : '',
    'Pages of the lesson (Hebrew):',
    ...pages,
    establishing ? `The establishing shot that follows the cover (do not repeat it): ${establishing}` : '',
  ].filter(Boolean).join('\n')
}

/* הפרומפט של תמונת העטיפה. null: אין ממה לכתוב (שיעור ריק), או שהקריאה נכשלה */
export async function writeCoverPrompt(src: CoverSource): Promise<string | null> {
  if (!(src.gameData.scenes ?? []).length) return null
  const user = `${COVER_INSTRUCTION}\n\n${coverBrief(src)}`
  try {
    let out = ''
    if (engineFor('imageprompt') === 'gemini') {
      out = await callGeminiText(user, 3000) /* thinking נצרך מהתקציב */
    } else {
      const res = await claude.messages.create({ model: 'claude-haiku-4-5', max_tokens: 500, messages: [{ role: 'user', content: user }] })
      const block = res.content.find((b) => b.type === 'text')
      out = block && block.type === 'text' ? block.text : ''
    }
    const prompt = out.replace(/^["'`\s]+|["'`\s]+$/g, '').replace(/\s+/g, ' ').trim()
    return prompt.length >= 20 ? prompt.slice(0, 900) : null
  } catch (err) {
    console.log('[cover] כתיבת הפרומפט נכשלה:', err instanceof Error ? err.message : String(err))
    return null
  }
}
