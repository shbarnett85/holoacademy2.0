import { Router } from 'express'
import { createHash } from 'node:crypto'
import { supabaseAdmin } from '../lib/supabase.js'
import { claude } from '../lib/claude.js'
import { callGeminiText } from '../lib/gemini.js'
import { engineFor } from '../lib/modelRouter.js'
import { generateImage, styledPrompt, HISTORICAL_NEGATIVE } from '../lib/together.js'
import { uploadBase64Image } from '../lib/storage.js'
import { AppError } from '../middleware/errors.js'
import { DR_HOLO_PLACEHOLDER, drHoloWithExpression } from '../prompts/constants.js'
import { requireStaff, ensureOwner } from '../middleware/staffAuth.js'

export const imagesRouter = Router()

/* החלפת ה-placeholder {DR_HOLO} בזהות הקבועה + ההבעה המשתנה של הסצנה — לפני enhancement ו-Together.
   הזהות (פנים, זקן, משקפיים, חלוק) זהה תמיד; רק ההבעה משתנה לפי טון הסצנה. */
function resolveDrHolo(prompt: string, expression?: string | null): string {
  if (!prompt.includes(DR_HOLO_PLACEHOLDER)) return prompt
  return prompt.split(DR_HOLO_PLACEHOLDER).join(drHoloWithExpression(expression))
}

/* סיומת ייחודית ל-public_id בכל יצירה-מחדש → URL חדש לגמרי שלא נמצא במטמון הדפדפן
   (אחרת אותו URL מוגש מהמטמון עם התמונה הישנה, ובמיוחד חוזר אחרי "שמור") */
function uniqueSuffix(): string {
  return Date.now().toString(36)
}

/* ── שכתוב פרומפטים היסטוריים — מנצח את ההטיה של מודל התמונות להריסות ── */

const REWRITE_INSTRUCTION = `Rewrite this image prompt for a text-to-image model. The scene depicts a historical structure as it appeared when NEWLY BUILT and FULLY INTACT. The image model is heavily biased toward depicting famous landmarks as modern ruins — your rewrite must defeat this bias:
- Explicitly describe the COMPLETE ROOF (e.g. 'complete gabled roof covered with terracotta tiles', 'fully enclosed structure')
- Explicitly state structural completeness: 'every column intact, full entablature, complete triangular pediments on both ends, no missing parts'
- Keep the original scene's mood, characters and composition
- If the prompt contains a detailed character description (e.g. a scientist character), you MUST copy that description verbatim into your rewrite — do NOT change, shorten, or rephrase any part of the character's appearance OR their stated facial expression (e.g. "his face showing a worried, tense expression"). Preserve both the fixed identity and the exact expression word-for-word.
- Output only the rewritten prompt, nothing else.`

/* cache בזיכרון לפי hash — לא משלמים פעמיים על אותו פרומפט ב-retry */
const rewriteCache = new Map<string, string>()

async function enhanceHistoricalPrompt(imagePrompt: string): Promise<string> {
  const key = createHash('sha1').update(imagePrompt).digest('hex')
  const cached = rewriteCache.get(key)
  if (cached) return cached

  try {
    const uc = `${REWRITE_INSTRUCTION}\n\nPrompt: ${imagePrompt}`
    let rewritten = ''
    if (engineFor('imageprompt') === 'gemini') {
      rewritten = (await callGeminiText(uc, 600)).trim()
    } else {
      const response = await claude.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 600,
        messages: [{ role: 'user', content: uc }],
      })
      const block = response.content.find((b) => b.type === 'text')
      rewritten = block && block.type === 'text' ? block.text.trim() : ''
    }
    if (rewritten) {
      rewriteCache.set(key, rewritten)
      return rewritten
    }
  } catch {
    /* שכתוב נכשל — ממשיכים עם הפרומפט המקורי */
  }
  return imagePrompt
}

interface ImageTask {
  kind: 'scene' | 'item'
  sceneId: string
  ending?: 'good' | 'bad' /* תמונת סיום במקום סצנה רגילה */
  prompt: string
  drHoloExpression?: string
  width: number
  height: number
  publicId: string
}

interface SceneRef {
  id: string
  imagePrompt?: string
  imageUrl?: string
  drHoloExpression?: string
  collectableItem?: { id: string; imagePrompt?: string; imageUrl?: string }
}

/* סצנת סיום עם תמונה ייעודית (endingGood/endingBad) — מחוץ ל-scenes[] */
interface EndingRef {
  imagePrompt?: string
  imageUrl?: string
  drHoloExpression?: string
}

interface GameDataRef {
  scenes: SceneRef[]
  entrySceneId: string
  isHistorical?: boolean
  endingGood?: EndingRef
  endingBad?: EndingRef
}

/* sceneId סינתטי לתמונות הסיום (אינן ב-scenes[]) */
const ENDING_SCENE_ID = { good: '__endingGood__', bad: '__endingBad__' } as const

/* ── שמירה בטוחה של קישורי תמונות: מיזוג אל game_data *טרי* ──
   יצירת תמונות אורכת דקות; בזמן הזה כותבים אחרים ל-game_data (בדיקת-העובדות ברקע
   כותבת factCheck+תיקוני לשון, מורה עורך סצנה). כתיבת ה-game_data שנטען בתחילת
   הבקשה הייתה דורסת את כולם (lost update — כך כל אצוות הספרייה איבדה את ה-factCheck).
   לכן: טוענים מחדש את השורה, ממזגים אליה **רק** את קישורי התמונות שנוצרו, ושומרים. */
interface ProducedImage { sceneId: string; kind: 'scene' | 'item'; ending?: 'good' | 'bad'; url: string }

async function saveImageUrlsFresh(questId: string, produced: ProducedImage[]): Promise<string | null> {
  if (produced.length === 0) return null
  const { data: fresh, error: fetchErr } = await supabaseAdmin
    .from('quests').select('game_data').eq('id', questId).single()
  if (fetchErr || !fresh?.game_data) return 'טעינת game_data טרי נכשלה: ' + (fetchErr?.message ?? '')
  const gd = fresh.game_data as GameDataRef
  for (const p of produced) {
    if (p.ending) {
      const ending = p.ending === 'good' ? gd.endingGood : gd.endingBad
      if (ending) ending.imageUrl = p.url
    } else {
      const scene = gd.scenes.find((s) => s.id === p.sceneId)
      if (!scene) continue
      if (p.kind === 'scene') scene.imageUrl = p.url
      else if (scene.collectableItem) scene.collectableItem.imageUrl = p.url
    }
  }
  const { error } = await supabaseAdmin.from('quests').update({ game_data: gd }).eq('id', questId)
  return error ? 'שמירת הקישורים נכשלה: ' + error.message : null
}

/* הרצת משימות עם מקסימום 2 במקביל */
async function runPool<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<void> {
  let next = 0
  async function worker() {
    while (next < tasks.length) {
      const i = next++
      await tasks[i]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker))
}

/* POST /api/quests/:id/regenerate-image — יצירה מחדש של תמונה בודדת
   body: { sceneId, kind?: 'scene' | 'item' } */
imagesRouter.post('/:id/regenerate-image', requireStaff, async (req, res, next) => {
  try {
    const { sceneId, kind = 'scene' } = req.body as { sceneId?: string; kind?: 'scene' | 'item' }
    if (!sceneId) throw new AppError(400, 'חסר sceneId')

    const { data: quest, error } = await supabaseAdmin
      .from('quests')
      .select('id, art_style, game_data, created_by')
      .eq('id', req.params.id)
      .single()

    if (error || !quest?.game_data) throw new AppError(404, 'הדמיה לא נמצאה')
    ensureOwner(req, quest.created_by)

    const gameData = quest.game_data as GameDataRef

    /* תמונת סיום (endingGood/endingBad) — sceneId סינתטי, לא ב-scenes[] */
    const endingWhich = sceneId === ENDING_SCENE_ID.good ? 'good' : sceneId === ENDING_SCENE_ID.bad ? 'bad' : null
    if (endingWhich) {
      const ending = endingWhich === 'good' ? gameData.endingGood : gameData.endingBad
      if (!ending?.imagePrompt) throw new AppError(400, 'אין imagePrompt לתמונה זו')
      const rawPrompt = resolveDrHolo(ending.imagePrompt, ending.drHoloExpression)
      const base = gameData.isHistorical ? await enhanceHistoricalPrompt(rawPrompt) : rawPrompt
      const extraNeg = gameData.isHistorical ? HISTORICAL_NEGATIVE : undefined
      const b64 = await generateImage(styledPrompt(base, quest.art_style), 1280, 720, extraNeg)
      /* public_id ייחודי בכל יצירה-מחדש → URL חדש לגמרי שלא נמצא במטמון (אחרת אותו URL
         מוגש מהמטמון של הדפדפן עם התמונה הישנה, ובמיוחד חוזר אחרי "שמור"). */
      const imageUrl = await uploadBase64Image(b64, `holoacademy/${quest.id}`, `ending_${endingWhich}_${uniqueSuffix()}`)
      /* מיזוג אל game_data טרי — לא דורסים עריכות/בדיקת-עובדות שנכתבו בזמן היצירה */
      const upErr = await saveImageUrlsFresh(quest.id, [{ sceneId, kind: 'scene', ending: endingWhich, url: imageUrl }])
      if (upErr) throw new AppError(500, upErr)
      res.json({ sceneId, kind: 'scene', imageUrl })
      return
    }

    const scene = gameData.scenes.find((s) => s.id === sceneId)
    if (!scene) throw new AppError(404, 'סצנה לא נמצאה')

    const rawPromptSrc = kind === 'item' ? scene.collectableItem?.imagePrompt : scene.imagePrompt
    if (!rawPromptSrc) throw new AppError(400, 'אין imagePrompt לתמונה זו')

    /* החלפת {DR_HOLO} (זהות + הבעת הסצנה) לפני ה-enhancement, כדי שהשכתוב יראה את התיאור המלא */
    const rawPrompt = resolveDrHolo(rawPromptSrc, scene.drHoloExpression)
    const base = gameData.isHistorical ? await enhanceHistoricalPrompt(rawPrompt) : rawPrompt
    const extraNeg = gameData.isHistorical ? HISTORICAL_NEGATIVE : undefined

    const b64 =
      kind === 'item'
        ? await generateImage(styledPrompt(base, quest.art_style), 512, 512, extraNeg)
        : await generateImage(styledPrompt(base, quest.art_style), 1280, 720, extraNeg)

    /* public_id ייחודי בכל יצירה-מחדש → URL חדש (לא מהמטמון; לא חוזר לישנה אחרי "שמור") */
    const uniq = uniqueSuffix()
    const publicId = kind === 'item' ? `item_${scene.collectableItem!.id}_${uniq}` : `scene_${scene.id}_${uniq}`
    const imageUrl = await uploadBase64Image(b64, `holoacademy/${quest.id}`, publicId)

    /* מיזוג אל game_data טרי — לא דורסים עריכות/בדיקת-עובדות שנכתבו בזמן היצירה */
    const updateErr = await saveImageUrlsFresh(quest.id, [{ sceneId, kind, url: imageUrl }])
    if (updateErr) throw new AppError(500, updateErr)

    res.json({ sceneId, kind, imageUrl })
  } catch (err) {
    next(err)
  }
})

/* POST /api/quests/:id/generate-images — יצירת תמונות עם progress ב-SSE.
   body אופציונלי: { style?, regenerateAll? } — "צור תמונות מחדש": יצירה-מחדש של *כל*
   התמונות בסגנון אמנותי חדש (המורה בוחר מתוך ששת הסגנונות). הסגנון נשמר ל-art_style
   כך שגם regenerate-image עתידי של סצנה בודדת ישתמש בו. */
imagesRouter.post('/:id/generate-images', requireStaff, async (req, res, next) => {
  try {
    const { style, regenerateAll } = (req.body ?? {}) as { style?: string; regenerateAll?: boolean }

    const { data: quest, error } = await supabaseAdmin
      .from('quests')
      .select('id, art_style, game_data, created_by')
      .eq('id', req.params.id)
      .single()

    if (error || !quest?.game_data) throw new AppError(404, 'הדמיה לא נמצאה')
    ensureOwner(req, quest.created_by)

    const gameData = quest.game_data as GameDataRef
    const artStyle = (style || quest.art_style) as string | undefined
    /* סגנון חדש נשמר מיד — כך שגם יצירה-מחדש של תמונה בודדת בהמשך תשתמש בו */
    if (style && style !== quest.art_style) {
      await supabaseAdmin.from('quests').update({ art_style: style }).eq('id', quest.id)
    }
    /* בהדמיה היסטורית — negative נוסף נגד הריסות מודרניות */
    const extraNegative = gameData.isHistorical ? HISTORICAL_NEGATIVE : undefined

    /* regenerateAll → path ייחודי לכל תמונה (URL חדש, לא מוגש מהמטמון); אחרת path קבוע */
    const uniq = regenerateAll ? `_${uniqueSuffix()}` : ''

    /* איסוף המשימות: סצנות וחפצים עם imagePrompt. ברירת מחדל — רק חסרות תמונה;
       regenerateAll — כולן (יצירה-מחדש בסגנון חדש). */
    const tasks: ImageTask[] = []
    for (const scene of gameData.scenes) {
      if (scene.imagePrompt && (regenerateAll || !scene.imageUrl)) {
        tasks.push({
          kind: 'scene',
          sceneId: scene.id,
          prompt: scene.imagePrompt,
          drHoloExpression: scene.drHoloExpression,
          width: 1280,
          height: 720,
          publicId: `scene_${scene.id}${uniq}`,
        })
      }
      const item = scene.collectableItem
      if (item?.imagePrompt && (regenerateAll || !item.imageUrl)) {
        tasks.push({
          kind: 'item',
          sceneId: scene.id,
          prompt: item.imagePrompt,
          drHoloExpression: scene.drHoloExpression,
          width: 512,
          height: 512,
          publicId: `item_${item.id}${uniq}`,
        })
      }
    }

    /* תמונות הסיום הייעודיות (endingGood/endingBad) — מסכי הסיכום, שונות מסצנת הפתיחה */
    for (const which of ['good', 'bad'] as const) {
      const ending = which === 'good' ? gameData.endingGood : gameData.endingBad
      if (ending?.imagePrompt && (regenerateAll || !ending.imageUrl)) {
        tasks.push({
          kind: 'scene',
          sceneId: ENDING_SCENE_ID[which],
          ending: which,
          prompt: ending.imagePrompt,
          drHoloExpression: ending.drHoloExpression,
          width: 1280,
          height: 720,
          publicId: `ending_${which}${uniq}`,
        })
      }
    }

    /* פתיחת SSE */
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    const send = (payload: unknown) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`)
    }

    const total = tasks.length
    let completed = 0
    const warnings: string[] = []

    send({ started: true, total })

    if (total === 0) {
      send({ done: true, completed: 0, total: 0, warnings: ['אין תמונות ליצירה בהדמיה זו'] })
      res.end()
      return
    }

    const folder = `holoacademy/${quest.id}`

    /* יצירה במקביל (2 בו-זמנית) — מעבר לכך Together מחזיר 429. כשל בתמונה בודדת לא מפיל את השאר */
    const produced: ProducedImage[] = []
    await runPool(
      tasks.map((task) => async () => {
        try {
          /* החלפת {DR_HOLO} (זהות + הבעת הסצנה) לפני ה-enhancement, ואז שכתוב היסטורי במידת הצורך */
          const resolved = resolveDrHolo(task.prompt, task.drHoloExpression)
          const base = gameData.isHistorical
            ? await enhanceHistoricalPrompt(resolved)
            : resolved
          const b64 = await generateImage(styledPrompt(base, artStyle), task.width, task.height, extraNegative)
          const url = await uploadBase64Image(b64, folder, task.publicId)

          produced.push({ sceneId: task.sceneId, kind: task.kind, ending: task.ending, url })
          completed++
          send({ sceneId: task.sceneId, kind: task.kind, imageUrl: url, completed, total })
        } catch (err) {
          completed++
          const msg = err instanceof Error ? err.message : String(err)
          warnings.push(`תמונה (${task.kind}) בסצנה ${task.sceneId} נכשלה: ${msg}`)
          send({ sceneId: task.sceneId, kind: task.kind, failed: true, completed, total })
        }
      }),
      2,
    )

    /* שמירה בטוחה — מיזוג הקישורים אל game_data טרי (לא דורסים כותבים מקבילים:
       בדיקת-העובדות ברקע, עריכות מורה) */
    const saveErr = await saveImageUrlsFresh(quest.id, produced)
    if (saveErr) warnings.push(saveErr)

    send({ done: true, completed, total, warnings })
    res.end()
  } catch (err) {
    /* אם ה-SSE כבר נפתח אי אפשר להחזיר סטטוס — שולחים אירוע שגיאה */
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: err instanceof Error ? err.message : 'שגיאה' })}\n\n`)
      res.end()
      return
    }
    next(err)
  }
})
