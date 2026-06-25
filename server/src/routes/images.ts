import { Router } from 'express'
import { createHash } from 'node:crypto'
import { supabaseAdmin } from '../lib/supabase.js'
import { claude } from '../lib/claude.js'
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
    const response = await claude.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 600,
      messages: [{ role: 'user', content: `${REWRITE_INSTRUCTION}\n\nPrompt: ${imagePrompt}` }],
    })
    const block = response.content.find((b) => b.type === 'text')
    const rewritten = block && block.type === 'text' ? block.text.trim() : ''
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
      const b64 = await generateImage(styledPrompt(base, quest.art_style), 1344, 768, extraNeg)
      const imageUrl = await uploadBase64Image(b64, `holoacademy/${quest.id}`, `ending_${endingWhich}`)
      ending.imageUrl = imageUrl
      const { error: upErr } = await supabaseAdmin.from('quests').update({ game_data: gameData }).eq('id', quest.id)
      if (upErr) throw new AppError(500, 'שגיאה בשמירה: ' + upErr.message)
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
        : await generateImage(styledPrompt(base, quest.art_style), 1344, 768, extraNeg)

    const publicId = kind === 'item' ? `item_${scene.collectableItem!.id}` : `scene_${scene.id}`
    const imageUrl = await uploadBase64Image(b64, `holoacademy/${quest.id}`, publicId)

    if (kind === 'item' && scene.collectableItem) scene.collectableItem.imageUrl = imageUrl
    else scene.imageUrl = imageUrl

    const { error: updateError } = await supabaseAdmin
      .from('quests')
      .update({ game_data: gameData })
      .eq('id', quest.id)
    if (updateError) throw new AppError(500, 'שגיאה בשמירה: ' + updateError.message)

    res.json({ sceneId, kind, imageUrl })
  } catch (err) {
    next(err)
  }
})

/* POST /api/quests/:id/generate-images — יצירת תמונות עם progress ב-SSE */
imagesRouter.post('/:id/generate-images', requireStaff, async (req, res, next) => {
  try {
    const { data: quest, error } = await supabaseAdmin
      .from('quests')
      .select('id, art_style, game_data, created_by')
      .eq('id', req.params.id)
      .single()

    if (error || !quest?.game_data) throw new AppError(404, 'הדמיה לא נמצאה')
    ensureOwner(req, quest.created_by)

    const gameData = quest.game_data as GameDataRef
    const artStyle = quest.art_style as string | undefined
    /* בהדמיה היסטורית — negative נוסף נגד הריסות מודרניות */
    const extraNegative = gameData.isHistorical ? HISTORICAL_NEGATIVE : undefined

    /* איסוף המשימות: סצנות וחפצים עם imagePrompt (שטרם נוצרה להם תמונה) */
    const tasks: ImageTask[] = []
    for (const scene of gameData.scenes) {
      if (scene.imagePrompt && !scene.imageUrl) {
        tasks.push({
          kind: 'scene',
          sceneId: scene.id,
          prompt: scene.imagePrompt,
          drHoloExpression: scene.drHoloExpression,
          width: 1344,
          height: 768,
          publicId: `scene_${scene.id}`,
        })
      }
      const item = scene.collectableItem
      if (item?.imagePrompt && !item.imageUrl) {
        tasks.push({
          kind: 'item',
          sceneId: scene.id,
          prompt: item.imagePrompt,
          drHoloExpression: scene.drHoloExpression,
          width: 512,
          height: 512,
          publicId: `item_${item.id}`,
        })
      }
    }

    /* תמונות הסיום הייעודיות (endingGood/endingBad) — מסכי הסיכום, שונות מסצנת הפתיחה */
    for (const which of ['good', 'bad'] as const) {
      const ending = which === 'good' ? gameData.endingGood : gameData.endingBad
      if (ending?.imagePrompt && !ending.imageUrl) {
        tasks.push({
          kind: 'scene',
          sceneId: ENDING_SCENE_ID[which],
          ending: which,
          prompt: ending.imagePrompt,
          drHoloExpression: ending.drHoloExpression,
          width: 1344,
          height: 768,
          publicId: `ending_${which}`,
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

          /* עדכון ה-game_data בזיכרון */
          if (task.ending) {
            const ending = task.ending === 'good' ? gameData.endingGood : gameData.endingBad
            if (ending) ending.imageUrl = url
          } else {
            const scene = gameData.scenes.find((s) => s.id === task.sceneId)
            if (scene) {
              if (task.kind === 'scene') scene.imageUrl = url
              else if (scene.collectableItem) scene.collectableItem.imageUrl = url
            }
          }

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

    /* שמירת ה-game_data המעודכן ב-DB */
    const { error: updateError } = await supabaseAdmin
      .from('quests')
      .update({ game_data: gameData })
      .eq('id', quest.id)

    if (updateError) warnings.push('שגיאה בשמירת הקישורים ב-DB: ' + updateError.message)

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
