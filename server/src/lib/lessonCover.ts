/* תמונת העטיפה של שיעור (לבקשת המשתמש): תמונה אחת שמייצגת את השיעור כולו, כמו עטיפה של ספר. היא "שער הכניסה" לשיעור:
   מוצגת בפורטל של מסך בחירת השיעורים ובכרטיס השיעור בכל הרשימות (lessonThumbUrl).
   למה צריך אותה: עד עכשיו בפורטל של מסך הבחירה הוצגה התמונה של העמוד הראשון, ואותה תמונה בדיוק הוצגה שוב בפורטל
   שבתוך השיעור, אחרי הפתיחה. שני פורטלים עם אותה תמונה בלבלו.
   מה יש בה: נושא מרכזי אחד (האדם, התופעה, המקום או החפץ שהשיעור עוסק בו) ומסביבו כמה מהדברים המזוהים ביותר עם
   הנושא. למשל בשיעור על לאונרדו דה וינצ'י: לאונרדו עצמו, ומסביבו כמה מהיצירות וההמצאות המפורסמות שלו.
   הפרומפט של התמונה נכתב כאן, בקריאה קצרה למודל (ואחריה בדיקה בלי מודל, lintCoverPrompt), מתוך השיעור שכבר נוצר (ולא בפרומפט היצירה הגדול): כך אותה פקודה
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

First decide which kind of topic the lesson is, and follow the rules of that kind.

KIND A: a person, a story, history or culture.
- The central subject is the main person or the main thing the lesson is about, in the centre and large. A famous person appears as the world recognises them: at the age and with the look they are famous for (for example Leonardo da Vinci as the old master with the long grey beard), even when the story of the lesson shows them as a child, and with accurate clothing for their time.
- Around the centre, exactly 3 of the most famous, instantly recognisable things connected to the topic (works, inventions, tools, symbols, key moments). Choose them from general knowledge of the topic, the things everyone knows it for, and not from small details of this lesson's story.
- Describe each of those things concretely, by what it looks like, as a physical object standing in the scene (a framed painting on an easel, a wooden model hanging from the ceiling, a drawing pinned to the wall, a tool on a table), and make each one large and clearly visible: an image model drops anything that is only named or only hinted at.
- The image model does not know works of art, inventions or monuments by their names, so never rely on a name: describe what the thing looks like. Instead of "the Mona Lisa": "a framed portrait of a dark-haired woman with a faint smile and folded hands, a hazy landscape behind her". Instead of "a flying machine": "a large wooden glider with bat-like canvas wings".
- Lay the picture out explicitly, because otherwise the image model paints a close-up portrait and nothing else: a wide frame; the central subject in the middle third, shown from the waist up and not as a close-up; then say where each surrounding thing is (on the left, on the right, above, in the foreground).
- Nothing modern in a historical topic.

KIND B: space, nature, the human body or any other science topic.
- The image model makes factual errors whenever several bodies share one picture, so this cover shows ONE main subject only: the single most recognisable thing of the topic, large, in the centre, in its real setting.
- A celestial body floats alone in black space with small stars behind it. Name and show exactly one body: no second planet, moon or sun anywhere in the prompt, no orbit lines, no lineup of planets, no size comparison. Nothing holds it, and never write that it hangs or is suspended (the image model paints hooks and chains): it floats. Describe its real look correctly (which body has rings, what colour it is).
- An animal, a plant or an organ is shown whole and correct, in its natural place. No diagram, no cutaway with labels, no arrows.
- Nothing is arranged around the subject.

KIND C: mathematics, language or another abstract topic.
- Show the everyday situation the lesson uses, with one friendly central character whose face is clearly visible, standing behind or beside the objects, and express every quantity with objects only: a pie cut into equal parts with some parts taken, piles of coins of different heights, rows of fruit. Coins are plain golden discs with nothing stamped on them: no currency sign and no number.
- Never show digits, percent signs, formulas, symbols, price tags, labels, receipts, shop signs or screens: the image model turns all of them into wrong numbers and gibberish.
- Choose a setting that has no signs in it (a market stall, a kitchen table, a workshop), never a mall or a street of shops.

Rules for every kind:
- It must NOT be a plain view of a place. Inside the lesson the next picture is a wide, empty establishing shot, and the cover has to look clearly different from it.
- No text, letters, numbers, titles, logos, labels, frames or borders. The image model writes gibberish on anything that can carry writing, so never include a scroll, parchment, manuscript, letter, notebook, open book, page of writing, map, sign, banner or blackboard, and never use the words writing, script, text, notes or handwriting. Show drawings and objects only.
- No hologram, no scientist host character, no laboratory, no screens.
- The only people in the image are the ones the topic is about. Never add children, pupils or an audience, and do not use the words children, kids or students in the prompt.
- Warm, inviting, full of wonder. No violence, no gore.
- The head and the face of every person are fully inside the frame, in the upper half of the picture and never cut off by its edge.
- People are always real human beings. Never call a person a giant, a monster or a creature, even in a legend: describe a very tall, strong man.
- English, one paragraph, at most 110 words.

Answer in exactly this form, and nothing else:
KIND: A, B or C
PROMPT: the prompt`

/* מה שנוסף לפרומפט בזמן היצירה: קומפוזיציה של עטיפה */
export const COVER_SUFFIX = 'wide shot, balanced composition, not a close-up portrait'

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

/* ── בדיקה של הפרומפט לפני שיוצרים ממנו תמונה (בלי מודל) ──
   המודל שכותב את הפרומפט לא תמיד מציית לכללים, וכל הפרה כאן הופכת לטעות בתמונה: כמה גופים בחלל יחד, מספרים ותוויות,
   חפצים עם כתב, "ענק" שמצויר כמפלצת. הפרה מקבלת ניסיון כתיבה אחד נוסף, עם ההפרות כהנחיה. */
export type CoverKind = 'A' | 'B' | 'C'
const BODIES = ['sun', 'moon', 'earth', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']
export function lintCoverPrompt(kind: CoverKind, prompt: string): string[] {
  const p = prompt.toLowerCase()
  const has = (re: RegExp) => re.test(p)
  const out: string[] = []
  if (has(/\b(scroll|parchment|manuscript|notebook|handwriting|writing|blackboard|banner)s?\b/)) out.push('It contains something that carries writing (scroll, parchment, manuscript, notebook, blackboard, banner) or the word writing.')
  if (has(/\b(children|kids|students|pupils)\b/)) out.push('It mentions children, kids, students or pupils.')
  if (/["“”]/.test(prompt)) out.push('It quotes text that would be written in the image.')
  if (kind === 'A' && has(/\b(giant|monster|ogre|beast)s?\b/)) out.push('It calls a person a giant or a monster: the image model paints a fantasy creature. Describe a very tall, strong man instead.')
  if (kind === 'B') {
    const bodies = BODIES.filter((b) => new RegExp(`\\b${b}\\b`).test(p))
    if (bodies.length > 1) out.push(`It shows several celestial bodies (${bodies.join(', ')}). Show exactly one.`)
    if (has(/\b(planets|moons|orbits?|orbiting|orbital|solar system|lineup)\b/)) out.push('It mentions planets, orbits or a whole system. Show exactly one body, with no orbit lines.')
    if (has(/\b(hang|hangs|hanging|hung|suspended|dangling)\b/)) out.push('It says a body hangs or is suspended: the image model paints hooks and chains. Say it floats.')
  }
  if (kind === 'C') {
    if (/\d|%/.test(prompt)) out.push('It contains digits or a percent sign.')
    if (has(/\b(price tags?|tags?|labels?|signs?|receipts?|symbols?|formulas?|percentages?|percent|fractions?|numbers?|digits?|screens?|mall|storefronts?)\b/)) out.push('It mentions tags, labels, signs, symbols, numbers, fractions or percentages, a screen or a mall. Express quantities with objects only, in a setting without signs.')
  }
  return out
}

function parseCover(out: string): { kind: CoverKind; prompt: string } | null {
  const kind = (/KIND:\s*([ABC])\b/i.exec(out)?.[1]?.toUpperCase() ?? 'A') as CoverKind
  const body = /PROMPT:\s*([\s\S]+)/i.exec(out)?.[1] ?? out.replace(/KIND:\s*[ABC]\b/i, '')
  const prompt = body.replace(/^["'`\s]+|["'`\s]+$/g, '').replace(/\s+/g, ' ').trim()
  return prompt.length >= 20 ? { kind, prompt: prompt.slice(0, 900) } : null
}

async function askCoverWriter(user: string): Promise<string> {
  if (engineFor('imageprompt') === 'gemini') return callGeminiText(user, 4000) /* thinking נצרך מהתקציב */
  /* Sonnet ולא haiku: haiku התעלם מהכללים של מדע ושל מתמטיקה (כמה כוכבי לכת יחד, תוויות מחיר עם מספרים) */
  const res = await claude.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 700, messages: [{ role: 'user', content: user }] })
  const block = res.content.find((b) => b.type === 'text')
  return block && block.type === 'text' ? block.text : ''
}

/* הפרומפט של תמונת העטיפה. null: אין ממה לכתוב (שיעור ריק), או שהקריאה נכשלה */
export async function writeCoverPrompt(src: CoverSource): Promise<string | null> {
  if (!(src.gameData.scenes ?? []).length) return null
  const user = `${COVER_INSTRUCTION}\n\n${coverBrief(src)}`
  try {
    const first = parseCover(await askCoverWriter(user))
    if (!first) return null
    const broken = lintCoverPrompt(first.kind, first.prompt)
    if (!broken.length) return first.prompt
    console.log('[cover] הפרומפט הפר כללים, ניסיון נוסף:', broken.join(' | '))
    const second = parseCover(await askCoverWriter(`${user}\n\nYour previous answer was:\n${first.prompt}\n\nIt broke these rules:\n${broken.map((b) => `- ${b}`).join('\n')}\nWrite it again, following every rule.`))
    if (!second) return first.prompt
    const still = lintCoverPrompt(second.kind, second.prompt)
    if (still.length) console.log('[cover] נשארו הפרות בפרומפט:', still.join(' | '))
    return still.length <= broken.length ? second.prompt : first.prompt
  } catch (err) {
    console.log('[cover] כתיבת הפרומפט נכשלה:', err instanceof Error ? err.message : String(err))
    return null
  }
}
