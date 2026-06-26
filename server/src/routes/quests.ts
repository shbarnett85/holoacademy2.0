import { Router } from 'express'
import { z } from 'zod'
import { claude } from '../lib/claude.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { AppError } from '../middleware/errors.js'
import {
  buildQuestPrompt,
  buildRetryMessage,
  buildStructureRetryMessage,
  requiredKeyCount,
  formOfAddressRule,
  puzzleDataSpec,
  difficultyHeader,
  type QuestGenerationParams,
  type FormOfAddress,
} from '../prompts/questPrompt.js'
import { validateHubStructure, type HubInfo } from '../lib/hubValidation.js'
import { clampLevel, scaleHangman, scaleFinalQuiz, moralDilemmaDepth, narrativeStyleSpec, maxSentenceWords } from '../../../src/shared/lib/difficultyScaling.js'
import { PROFILE_PUZZLE_TYPES, defaultProfileForGrade, gradeToLevel, levelToGradeLabel } from '../../../src/shared/lib/difficultyCalibration.js'
import { requireStaff, ensureOwner } from '../middleware/staffAuth.js'
import jwt from 'jsonwebtoken'
import { hasQuestSubject, hasUserGender, hasPublicQuests, hasQuestVariants, hasDifficultyProfileV2 } from '../lib/activeColumn.js'

export const questsRouter = Router()

/* ── סכמות zod לולידציה של ה-GameData המוחזר מ-Claude ── */

const collectableItemSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/, 'id חייב להיות snake_case באנגלית'),
  name: z.string().min(1),
  imagePrompt: z.string().min(1),
  icon: z.string().min(1),
  imageUrl: z.string().optional(),
})

const choiceSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  isCorrect: z.boolean(),
})

/* בחירת ניווט ברמת הסצנה — מבנה Hub */
const navChoiceSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  nextSceneId: z.string().nullable().optional(),
  requiredItemIds: z.array(z.string()).optional(),
  /* טקסט הפתיחה — מוצג כשהבחירה הנעולה נפתחת */
  unlockText: z.string().optional(),
})

const puzzleObjectSchema = z.object({
  type: z.string().optional(),
  question: z.string(),
  choices: z.array(choiceSchema).optional(),
  explanationCorrect: z.string().optional(),
  explanationIncorrect: z.string().optional(),
  /* tileSwap — גודל הרשת */
  gridSize: z.number().int().min(2).max(4).optional(),
  /* wordSearch — מילים בעברית */
  words: z.array(z.string().min(2)).optional(),
  /* memory — זוגות מושג↔הגדרה */
  pairs: z.array(z.object({ a: z.string().min(1), b: z.string().min(1) })).optional(),
  /* wordCompletion — משפט עם ___ , תשובה, ובנק מילים אופציונלי.
     answers = רשימת התשובות לפי סדר החללים (רמות גבוהות: כמה חללים). answer לתאימות לאחור. */
  sentence: z.string().optional(),
  answer: z.string().optional(),
  answers: z.array(z.string().min(1)).optional(),
  wordBank: z.array(z.string().min(1)).optional(),
  /* sequenceOrder — סידור פריטים ברצף הנכון */
  items: z.array(z.object({ id: z.string().min(1), text: z.string().min(1), imagePrompt: z.string().optional() })).optional(),
  correctOrder: z.array(z.string().min(1)).optional(),
  orderType: z.enum(['chronological', 'logical', 'hierarchical']).optional(),
  /* hangman — מספר טעויות מותר */
  maxWrong: z.number().int().min(3).max(10).optional(),
  /* רמת הקושי שהוזרקה בעת היצירה */
  difficulty: z.number().int().min(1).max(20).optional(),
  /* finalQuiz — רצף שאלות סיכום */
  questions: z
    .array(
      z.object({
        question: z.string().min(1),
        options: z.array(z.string().min(1)).min(2),
        correctIndex: z.number().int().min(0),
        explanationCorrect: z.string().optional(),
        explanationIncorrect: z.string().optional(),
      }),
    )
    .optional(),
  /* moralDilemma — דילמה ערכית ללא תשובה נכונה; כל בחירה עם ההשלכה שלה */
  situation: z.string().optional(),
  moralChoices: z
    .array(z.object({ text: z.string().min(1), consequence: z.string().min(1) }))
    .optional(),
})

const sceneSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  narrative: z.string().optional(),
  imagePrompt: z.string().optional(),
  imageUrl: z.string().optional(),
  /* הבעת הפנים של ד"ר הולו בסצנה זו — תואמת לטון הנרטיב (רק כשהוא מופיע ויזואלית) */
  drHoloExpression: z.string().optional(),
  puzzle: puzzleObjectSchema.optional(),
  collectableItem: collectableItemSchema.optional(),
  choices: z.array(navChoiceSchema).optional(),
  requiresItemId: z.string().nullable().optional(),
  unlockText: z.string().optional(),
  nextSceneId: z.string().nullable().optional(),
})

/* סצנת סיום במעבדה — טובה/מעודדת. תמונת סיום ייעודית (שונה מסצנת הפתיחה),
   עם הבעת פנים התואמת לסוג הסיום (חוגג / קודר). */
const endingSchema = z.object({
  title: z.string().min(1),
  narrative: z.string().min(1),
  drHoloDialog: z.string().optional(),
  imagePrompt: z.string().optional(),
  imageUrl: z.string().optional(),
  drHoloExpression: z.string().optional(),
})

const gameDataSchema = z
  .object({
    scenes: z.array(sceneSchema).min(1),
    entrySceneId: z.string(),
    /* האם ההדמיה מתרחשת בעבר — משפיע על negative prompt בתמונות */
    isHistorical: z.boolean().optional(),
    endingGood: endingSchema.optional(),
    endingBad: endingSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const add = (message: string) => ctx.addIssue({ code: 'custom', message })

    /* ── נגישות: כל סצנה חייבת להיות נגישה מסצנת הכניסה דרך nextSceneId/choices ──
       מונע את הבאג שבו סצנת הכניסה (scene_lab) נשארת ללא קישור (next=null, ללא choices)
       והשרשרת מנותקת → המשחק "קופץ" מהסצנה הראשונה ישר לסיום. */
    const byId = new Map(data.scenes.map((s) => [s.id, s]))
    if (!byId.has(data.entrySceneId)) {
      add(`entrySceneId "${data.entrySceneId}" אינו קיים ברשימת הסצנות`)
    } else if (data.scenes.length > 1) {
      const seen = new Set<string>()
      const stack = [data.entrySceneId]
      while (stack.length) {
        const id = stack.pop()!
        if (seen.has(id) || !byId.has(id)) continue
        seen.add(id)
        const s = byId.get(id)!
        if (s.nextSceneId) stack.push(s.nextSceneId)
        for (const c of s.choices ?? []) if (c.nextSceneId) stack.push(c.nextSceneId)
      }
      const unreachable = data.scenes.filter((s) => !seen.has(s.id))
      if (unreachable.length > 0) {
        add(`סצנות לא נגישות מסצנת הכניסה (${data.entrySceneId}) — ודא שכל סצנה מקושרת קדימה דרך nextSceneId או choices. מנותקות: ${unreachable.map((s) => s.id).join(', ')}`)
      }
    }

    for (const scene of data.scenes) {
      const p = scene.puzzle
      if (!p) continue
      const where = `בסצנה "${scene.title}"`
      switch (p.type) {
        case 'multipleChoice':
        case 'trueFalse':
          if (!p.choices || p.choices.length < 2) add(`${where}: חידת ${p.type} חייבת מערך "choices" עם לפחות 2 תשובות`)
          else if (!p.choices.some((c) => c.isCorrect)) add(`${where}: אין תשובה נכונה (isCorrect: true) בחידה`)
          if (!p.explanationCorrect?.trim() || !p.explanationIncorrect?.trim())
            add(`${where}: חסרים explanationCorrect/explanationIncorrect — שניהם חובה ברב-ברירה ונכון/לא נכון`)
          break
        case 'wordSearch':
          if (!p.words || p.words.length < 3) add(`${where}: חיפוש מילים חייב מערך "words" עם לפחות 3 מילים בעברית`)
          break
        case 'memory':
          if (!p.pairs || p.pairs.length < 2) add(`${where}: זיכרון חייב מערך "pairs" עם לפחות 2 זוגות {a,b}`)
          break
        case 'wordCompletion': {
          const blanks = (p.sentence?.match(/___/g) ?? []).length
          if (blanks === 0) add(`${where}: השלמת מילים חייבת "sentence" המכיל את הסימן ___ במקום החסר`)
          /* answers (כמה חללים) או answer בודד — חייב להתאים למספר החללים */
          const answersList = p.answers && p.answers.length > 0 ? p.answers : p.answer?.trim() ? [p.answer.trim()] : []
          if (answersList.length === 0) add(`${where}: השלמת מילים חייבת "answer"/"answers" — המילה/ים החסרה/ות`)
          else if (blanks > 0 && answersList.length !== blanks)
            add(`${where}: מספר התשובות (${answersList.length}) חייב להתאים למספר החללים ___ במשפט (${blanks})`)
          if (p.wordBank && answersList.length > 0 && !answersList.every((a) => p.wordBank!.includes(a)))
            add(`${where}: "wordBank" חייב לכלול את כל התשובות (answers)`)
          break
        }
        case 'hangman': {
          const ans = (p.answer ?? '').trim()
          if (!ans) add(`${where}: זיהוי קוד חייב "answer" — המילה לניחוש`)
          else if (!/^[א-ת ]+$/.test(ans)) add(`${where}: ה-"answer" בזיהוי קוד חייב להכיל אותיות עבריות בלבד (ללא ניקוד/מספרים)`)
          else if (ans.replace(/ /g, '').length < 2 || ans.length > 14) add(`${where}: אורך ה-"answer" בזיהוי קוד חייב להיות סביר (2-14 אותיות)`)
          break
        }
        case 'sequenceOrder': {
          if (!p.items || p.items.length < 3) add(`${where}: חידת סדר חייבת "items" עם לפחות 3 פריטים`)
          if (!p.orderType) add(`${where}: חידת סדר חייבת "orderType" (chronological/logical/hierarchical)`)
          const itemIds = new Set((p.items ?? []).map((i) => i.id))
          if (!p.correctOrder || p.correctOrder.length !== itemIds.size)
            add(`${where}: "correctOrder" חייב לכלול בדיוק את כל מזהי הפריטים פעם אחת`)
          else if (!p.correctOrder.every((id) => itemIds.has(id)) || new Set(p.correctOrder).size !== p.correctOrder.length)
            add(`${where}: "correctOrder" חייב להכיל את אותם id-ים של items, ללא כפילויות`)
          /* ייחודיות ערך-הסידור: שני פריטים זהים בטקסט, או החולקים אותה שנה (4 ספרות) →
             אין סדר חד-משמעי (כמו 1554 פעמיים) → פסול, retry. */
          const seqTexts = (p.items ?? []).map((i) => i.text.trim())
          if (new Set(seqTexts).size !== seqTexts.length)
            add(`${where}: חידת סדר — שני פריטים זהים בטקסט; כל פריט חייב להיות ייחודי`)
          const seqYears = (p.items ?? []).map((i) => i.text.match(/\b\d{4}\b/)?.[0]).filter((y): y is string => !!y)
          if (new Set(seqYears).size !== seqYears.length)
            add(`${where}: חידת סדר — שני פריטים חולקים אותה שנה/ערך סידור; הסדר חייב להיות חד-משמעי ונבדל`)
          break
        }
        case 'finalQuiz':
          if (!p.questions || p.questions.length < 3 || p.questions.length > 10)
            add(`${where}: מבחן סיכום חייב מערך "questions" באורך 3-10`)
          else
            p.questions.forEach((q, i) => {
              if (q.correctIndex >= q.options.length)
                add(`${where}: בשאלה ${i + 1} במבחן הסיכום correctIndex מחוץ לטווח options`)
              if (!q.explanationCorrect?.trim() || !q.explanationIncorrect?.trim())
                add(`${where}: בשאלה ${i + 1} במבחן הסיכום חסר explanationCorrect/explanationIncorrect`)
            })
          break
        case 'moralDilemma': {
          if (!p.situation?.trim()) add(`${where}: שאלת מוסר חייבת "situation" — תיאור הדילמה`)
          const ch = p.moralChoices ?? []
          if (ch.length < 2 || ch.length > 4) add(`${where}: שאלת מוסר חייבת "moralChoices" עם 2-4 אפשרויות`)
          else if (!ch.every((c) => c.text?.trim() && c.consequence?.trim()))
            add(`${where}: כל אפשרות בשאלת מוסר חייבת "text" + "consequence"`)
          break
        }
        /* tileSwap — אין נתונים חובה (משתמש בתמונת הסצנה); gridSize אופציונלי */
      }
    }
  })

type GameData = z.infer<typeof gameDataSchema>

const generateRequestSchema = z.object({
  title: z.string().min(1),
  curriculum: z.string().default(''),
  questLength: z.number().int().positive(),
  puzzlePreferences: z
    .object({
      types: z.record(z.string(), z.boolean()).optional(),
      counts: z.record(z.string(), z.number().int().min(1).max(10)).optional(),
    })
    .optional(),
  difficultySettings: z.record(z.string(), z.unknown()).optional(),
  includeDrHolo: z.boolean().optional(),
  artStyle: z.string().optional(),
  questType: z.string().optional(),
  subject: z.string().optional(),
  /* צורת פנייה — ברירת מחדל plural (גרסה כיתתית/ניטרלית) */
  formOfAddress: z.enum(['male', 'female', 'plural']).optional(),
})

/* חילוץ JSON מתשובת Claude (כולל ניקוי גדרות קוד אם יש) */
function extractJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  return JSON.parse(cleaned)
}

/* ולידציה מלאה: סכמה + מספר מפתחות תואם */
function validateGameData(
  raw: unknown,
  expectedKeys: number,
): { ok: true; data: GameData } | { ok: false; reason: string; actualKeys?: number } {
  const parsed = gameDataSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.message }
  }
  const actualKeys = parsed.data.scenes.filter((s) => s.collectableItem).length
  if (actualKeys !== expectedKeys) {
    return { ok: false, reason: 'key count mismatch', actualKeys }
  }
  return { ok: true, data: parsed.data }
}

async function callClaude(messages: { role: 'user' | 'assistant'; content: string }[]) {
  /* streaming מונע timeout של ה-SDK בפלטים ארוכים (קווסטים של 15 סצנות).
     sonnet-4-6 (דור חדש, מאוזן) עם effort=medium — אותה איכות, מהיר יותר. */
  const response = await claude.messages
    .stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 32000,
      output_config: { effort: 'medium' },
      messages,
    })
    .finalMessage()
  const u = response.usage
  console.log(`[tokens] sonnet: in=${u.input_tokens} out=${u.output_tokens}`)
  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new AppError(502, 'תשובה ריקה מ-Claude')
  }
  return textBlock.text
}

/* קריאת haiku מהירה (לא-streaming) — לבדיקת עובדות ולתיקון ממוקד */
async function callHaiku(messages: { role: 'user' | 'assistant'; content: string }[], maxTokens: number): Promise<string> {
  const response = await claude.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: maxTokens,
    messages,
  })
  const u = response.usage
  console.log(`[tokens] haiku: in=${u.input_tokens} out=${u.output_tokens}`)
  const block = response.content.find((b) => b.type === 'text')
  return block && block.type === 'text' ? block.text : ''
}

/* ── שכבה 2: בדיקת עובדות (fact-check) ── */

interface FactError {
  sceneId?: string
  problem: string
  correction?: string
}

/* התוכן הטקסטואלי הנבדק — כותרות, נרטיבים ושאלות חידה (לא imagePrompt). sceneIds? = רק סצנות אלו. */
function factCheckContent(gameData: GameData, sceneIds?: string[]): string {
  const lines: string[] = []
  for (const s of gameData.scenes) {
    if (sceneIds && !sceneIds.includes(s.id)) continue
    lines.push(`[${s.id}] כותרת: ${s.title}`)
    if (s.narrative) lines.push(`  נרטיב: ${s.narrative}`)
    if (s.puzzle?.question) lines.push(`  שאלה: ${s.puzzle.question}`)
    for (const q of s.puzzle?.questions ?? []) lines.push(`  שאלת מבחן: ${q.question}`)
  }
  return lines.join('\n')
}

/* בדיקת עובדות על haiku (משימת זיהוי פשוטה — מהיר פי כמה מ-sonnet). מחזיר ok=false אם נכשלה טכנית.
   sceneIds? — לבדוק רק סצנות מסוימות (לבדיקה החוזרת אחרי תיקון). */
async function runFactCheck(gameData: GameData, sceneIds?: string[]): Promise<{ ok: boolean; errors: FactError[] }> {
  const content = factCheckContent(gameData, sceneIds)
  if (!content.trim()) return { ok: true, errors: [] }
  const instruction = `אתה בודק עובדות בכלי חינוכי. עבור על התוכן הבא וזהה שני סוגי בעיות:
1. **שגיאות עובדתיות/היסטוריות/אנכרוניזמים** — דמות בתקופה הלא נכונה, מבנה שטרם נבנה או כבר נהרס, טכנולוגיה שטרם הומצאה, נתון/תאריך/קשר שגוי.
2. **ביטויים מדעיים/לוגיים חסרי-משמעות או מטעים** — ניסוח שנשמע "מדעי" אך אין לו פשר אמיתי או שמטעה תפיסתית (למשל "גביש של אוויר", "אנרגיה שלילית של חום"), **גם אם הרעיון הכללי מאחוריו נכון**. דגל את הביטוי והצע ניסוח מדעי תקין.
אל תדגל סגנון, ניסוח ספרותי או דעות — רק שגיאות עובדתיות וביטויים מדעיים/לוגיים שגויים מובהקים.
החזר JSON תקין בלבד, ללא טקסט נוסף, במבנה:
{ "hasErrors": boolean, "errors": [{ "sceneId": "מזהה הסצנה", "problem": "תיאור השגיאה בעברית", "correction": "התיקון הנכון בעברית" }] }
אם אין שגיאות עובדתיות החזר { "hasErrors": false, "errors": [] }.`
  try {
    const text = await callHaiku([{ role: 'user', content: `${instruction}\n\nהתוכן לבדיקה:\n${content}` }], 2000)
    const json = extractJson(text) as { hasErrors?: boolean; errors?: FactError[] }
    const errors = Array.isArray(json.errors) ? json.errors.filter((e) => e && e.problem) : []
    return { ok: true, errors: json.hasErrors ? errors : [] }
  } catch (err) {
    console.error('[fact-check] נכשל טכנית:', err instanceof Error ? err.message : err)
    return { ok: false, errors: [] }
  }
}

/* תיקון ממוקד על haiku — מתקן רק את שדות הטקסט של הסצנות שבהן זוהו שגיאות (כותרת/נרטיב/שאלה/הסברים),
   בלי לגעת ב-id, בחידות (choices/answer/isCorrect), במפתחות או במבנה. מחזיר את מזהי הסצנות שתוקנו. */
async function scopedFactFix(gameData: GameData, errors: FactError[]): Promise<string[]> {
  const ids = [...new Set(errors.map((e) => e.sceneId).filter((x): x is string => !!x))]
  const scenes = gameData.scenes.filter((s) => ids.includes(s.id))
  if (scenes.length === 0) return []

  const blocks = scenes.map((s) => {
    const errs = errors.filter((e) => e.sceneId === s.id)
    const fields: string[] = [`title: ${s.title}`]
    if (s.narrative) fields.push(`narrative: ${s.narrative}`)
    if (s.puzzle?.question) fields.push(`question: ${s.puzzle.question}`)
    if (s.puzzle?.explanationCorrect) fields.push(`explanationCorrect: ${s.puzzle.explanationCorrect}`)
    if (s.puzzle?.explanationIncorrect) fields.push(`explanationIncorrect: ${s.puzzle.explanationIncorrect}`)
    return `סצנה "${s.id}":\n${fields.join('\n')}\nשגיאות לתיקון:\n${errs.map((e) => `- ${e.problem}${e.correction ? ` → ${e.correction}` : ''}`).join('\n')}`
  }).join('\n\n')

  const instruction = `תקן אך ורק את השגיאות העובדתיות בשדות הטקסט של הסצנות הבאות. שמור על אותה משמעות, אורך, שפה (עברית) וסגנון — שנה רק את העובדה השגויה. אל תיגע במבנה, בחידות, בתשובות או במזהים.
החזר JSON תקין בלבד במבנה: { "<sceneId>": { "title"?, "narrative"?, "question"?, "explanationCorrect"?, "explanationIncorrect"? } } — כלול אך ורק שדות שבאמת השתנו.

${blocks}`

  const text = await callHaiku([{ role: 'user', content: instruction }], 4000)
  const fixes = extractJson(text) as Record<string, Record<string, unknown>>
  const corrected: string[] = []
  for (const s of scenes) {
    const fix = fixes?.[s.id]
    if (!fix || typeof fix !== 'object') continue
    let changed = false
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
    const t = str(fix.title); if (t) { s.title = t; changed = true }
    const n = str(fix.narrative); if (n && s.narrative !== undefined) { s.narrative = n; changed = true }
    if (s.puzzle) {
      const q = str(fix.question); if (q) { s.puzzle.question = q; changed = true }
      const ec = str(fix.explanationCorrect); if (ec) { s.puzzle.explanationCorrect = ec; changed = true }
      const ei = str(fix.explanationIncorrect); if (ei) { s.puzzle.explanationIncorrect = ei; changed = true }
    }
    if (changed) corrected.push(s.id)
  }
  return corrected
}

/* ── וריאציה אישית ממוגדרת: שכתוב כל הטקסט הפונה לתלמיד לצורת פנייה נבחרת ──
   אוסף את כל שדות הטקסט הפונים לתלמיד (key→text), שולח ל-haiku עם כלל הפנייה,
   ומחזיר אותם משוכתבים בלבד דקדוקית (אותה משמעות/אורך/עובדות). */
type LooseScene = {
  id: string
  narrative?: string
  drHoloDialog?: string
  puzzle?: {
    type?: string
    difficulty?: number
    maxWrong?: number
    question?: string
    explanationCorrect?: string
    explanationIncorrect?: string
    sentence?: string
    choices?: { id: string; text: string }[]
    questions?: { question?: string; explanationCorrect?: string; explanationIncorrect?: string }[]
    moralChoices?: { text: string; consequence: string }[]
  }
  choices?: { id: string; text: string }[]
}
type LooseEnding = { narrative?: string; drHoloDialog?: string }

/* איסוף שדות הטקסט הפונים לתלמיד לכדי מפת key→text */
function collectAddressText(gd: GameData): Record<string, string> {
  const out: Record<string, string> = {}
  const put = (k: string, v?: string) => { if (typeof v === 'string' && v.trim()) out[k] = v }
  for (const sc of gd.scenes as unknown as LooseScene[]) {
    put(`s:${sc.id}:narrative`, sc.narrative)
    put(`s:${sc.id}:dlg`, sc.drHoloDialog)
    const p = sc.puzzle
    if (p) {
      put(`s:${sc.id}:q`, p.question)
      put(`s:${sc.id}:ec`, p.explanationCorrect)
      put(`s:${sc.id}:ei`, p.explanationIncorrect)
      put(`s:${sc.id}:sentence`, p.sentence)
      ;(p.questions ?? []).forEach((q, i) => {
        put(`s:${sc.id}:fq${i}:q`, q.question)
        put(`s:${sc.id}:fq${i}:ec`, q.explanationCorrect)
        put(`s:${sc.id}:fq${i}:ei`, q.explanationIncorrect)
      })
    }
    ;(sc.choices ?? []).forEach((c) => put(`s:${sc.id}:ch:${c.id}`, c.text))
  }
  const eg = (gd as unknown as { endingGood?: LooseEnding }).endingGood
  const eb = (gd as unknown as { endingBad?: LooseEnding }).endingBad
  put('end:good:narrative', eg?.narrative); put('end:good:dlg', eg?.drHoloDialog)
  put('end:bad:narrative', eb?.narrative); put('end:bad:dlg', eb?.drHoloDialog)
  return out
}

/* החלת הטקסט המשוכתב בחזרה על עותק של game_data */
function applyAddressText(gd: GameData, rew: Record<string, string>): void {
  const str = (k: string) => (typeof rew[k] === 'string' && rew[k].trim() ? rew[k].trim() : null)
  for (const sc of gd.scenes as unknown as LooseScene[]) {
    const n = str(`s:${sc.id}:narrative`); if (n) sc.narrative = n
    const d = str(`s:${sc.id}:dlg`); if (d) sc.drHoloDialog = d
    const p = sc.puzzle
    if (p) {
      const q = str(`s:${sc.id}:q`); if (q) p.question = q
      const ec = str(`s:${sc.id}:ec`); if (ec) p.explanationCorrect = ec
      const ei = str(`s:${sc.id}:ei`); if (ei) p.explanationIncorrect = ei
      const se = str(`s:${sc.id}:sentence`); if (se) p.sentence = se
      ;(p.questions ?? []).forEach((qq, i) => {
        const fq = str(`s:${sc.id}:fq${i}:q`); if (fq) qq.question = fq
        const fec = str(`s:${sc.id}:fq${i}:ec`); if (fec) qq.explanationCorrect = fec
        const fei = str(`s:${sc.id}:fq${i}:ei`); if (fei) qq.explanationIncorrect = fei
      })
    }
    ;(sc.choices ?? []).forEach((c) => { const t = str(`s:${sc.id}:ch:${c.id}`); if (t) c.text = t })
  }
  const eg = (gd as unknown as { endingGood?: LooseEnding }).endingGood
  const eb = (gd as unknown as { endingBad?: LooseEnding }).endingBad
  if (eg) { const n = str('end:good:narrative'); if (n) eg.narrative = n; const d = str('end:good:dlg'); if (d) eg.drHoloDialog = d }
  if (eb) { const n = str('end:bad:narrative'); if (n) eb.narrative = n; const d = str('end:bad:dlg'); if (d) eb.drHoloDialog = d }
}

/* יצירת וריאציה אישית ממוגדרת מתוך game_data בסיסי (פנייה plural). best-effort דרך haiku. */
async function rephraseForAddress(base: GameData, form: FormOfAddress): Promise<GameData> {
  const variant = JSON.parse(JSON.stringify(base)) as GameData
  if (form === 'plural') return variant /* הבסיס כבר ניטרלי/רבים */
  const texts = collectAddressText(variant)
  const keys = Object.keys(texts)
  if (keys.length === 0) return variant
  const instruction = `${formOfAddressRule(form)}

לפניך אובייקט JSON של מקטעי טקסט בעברית מתוך הדמיה חינוכית (key→טקסט). שכתב כל ערך כך שהפנייה לתלמיד תהיה בצורה הנדרשת בלבד — **שמור על אותה משמעות, אותו אורך בקירוב, אותן עובדות ואותו סגנון**. שנה אך ורק את הצורה הדקדוקית של הפנייה (גוף שני). אל תשנה שמות, מספרים, מושגים או עובדות.
החזר JSON תקין בלבד עם **אותם keys בדיוק**, כל ערך הוא הטקסט המשוכתב. ללא טקסט נוסף.

${JSON.stringify(texts, null, 0)}`
  try {
    const out = await callHaiku([{ role: 'user', content: instruction }], 8000)
    const rew = extractJson(out) as Record<string, string>
    if (rew && typeof rew === 'object') applyAddressText(variant, rew)
  } catch (err) {
    console.error('[personalize] שכתוב הפנייה נכשל:', err instanceof Error ? err.message : err)
  }
  return variant
}

/* ── וריאציה מותאמת-תלמיד ── */

/* איסוף שדות הטקסט לשכתוב מותאם.
   opts.puzzles=false → דלג על טקסט האתגרים (כשהם נוצרים מחדש ב-Sonnet ולא צריך פרפרזה כפולה). */
function collectVariantText(gd: GameData, opts: { puzzles?: boolean } = {}): Record<string, string> {
  const includePuzzles = opts.puzzles !== false
  const out: Record<string, string> = {}
  const put = (k: string, v?: string) => { if (typeof v === 'string' && v.trim()) out[k] = v }
  for (const sc of gd.scenes as unknown as LooseScene[]) {
    put(`s:${sc.id}:narrative`, sc.narrative)
    put(`s:${sc.id}:dlg`, sc.drHoloDialog)
    const p = sc.puzzle
    if (p && includePuzzles) {
      put(`s:${sc.id}:q`, p.question)
      put(`s:${sc.id}:ec`, p.explanationCorrect)
      put(`s:${sc.id}:ei`, p.explanationIncorrect)
      put(`s:${sc.id}:sentence`, p.sentence)
      ;(p.questions ?? []).forEach((q, i) => {
        put(`s:${sc.id}:fq${i}:q`, q.question)
        put(`s:${sc.id}:fq${i}:ec`, q.explanationCorrect)
        put(`s:${sc.id}:fq${i}:ei`, q.explanationIncorrect)
      })
      ;(p.moralChoices ?? []).forEach((c, i) => {
        put(`s:${sc.id}:mc${i}:text`, c.text)
        put(`s:${sc.id}:mc${i}:con`, c.consequence)
      })
    }
    ;(sc.choices ?? []).forEach((c) => put(`s:${sc.id}:ch:${c.id}`, c.text))
  }
  const eg = (gd as unknown as { endingGood?: LooseEnding }).endingGood
  const eb = (gd as unknown as { endingBad?: LooseEnding }).endingBad
  put('end:good:narrative', eg?.narrative); put('end:good:dlg', eg?.drHoloDialog)
  put('end:bad:narrative', eb?.narrative); put('end:bad:dlg', eb?.drHoloDialog)
  return out
}

function applyVariantText(gd: GameData, rew: Record<string, string>): void {
  const str = (k: string) => (typeof rew[k] === 'string' && rew[k].trim() ? rew[k].trim() : null)
  for (const sc of gd.scenes as unknown as LooseScene[]) {
    const n = str(`s:${sc.id}:narrative`); if (n) sc.narrative = n
    const d = str(`s:${sc.id}:dlg`); if (d) sc.drHoloDialog = d
    const p = sc.puzzle
    if (p) {
      const q = str(`s:${sc.id}:q`); if (q) p.question = q
      const ec = str(`s:${sc.id}:ec`); if (ec) p.explanationCorrect = ec
      const ei = str(`s:${sc.id}:ei`); if (ei) p.explanationIncorrect = ei
      const se = str(`s:${sc.id}:sentence`); if (se) p.sentence = se
      ;(p.questions ?? []).forEach((qq, i) => {
        const fq = str(`s:${sc.id}:fq${i}:q`); if (fq) qq.question = fq
        const fec = str(`s:${sc.id}:fq${i}:ec`); if (fec) qq.explanationCorrect = fec
        const fei = str(`s:${sc.id}:fq${i}:ei`); if (fei) qq.explanationIncorrect = fei
      })
      ;(p.moralChoices ?? []).forEach((c, i) => {
        const t = str(`s:${sc.id}:mc${i}:text`); if (t) c.text = t
        const co = str(`s:${sc.id}:mc${i}:con`); if (co) c.consequence = co
      })
    }
    ;(sc.choices ?? []).forEach((c) => { const t = str(`s:${sc.id}:ch:${c.id}`); if (t) c.text = t })
  }
  const eg = (gd as unknown as { endingGood?: LooseEnding }).endingGood
  const eb = (gd as unknown as { endingBad?: LooseEnding }).endingBad
  if (eg) { const n = str('end:good:narrative'); if (n) eg.narrative = n; const d = str('end:good:dlg'); if (d) eg.drHoloDialog = d }
  if (eb) { const n = str('end:bad:narrative'); if (n) eb.narrative = n; const d = str('end:bad:dlg'); if (d) eb.drHoloDialog = d }
}

/* כוונון קושי חידות לפי פרופיל — משנה puzzle.difficulty + hangman.maxWrong. ללא AI. */
function applyDifficultyOverrides(gd: GameData, perPuzzleLevel: Record<string, number>): void {
  for (const sc of gd.scenes as unknown as LooseScene[]) {
    const p = sc.puzzle
    if (!p) continue
    const type = p.type === 'slidingPuzzle' ? 'tileSwap' : (p.type ?? '')
    const level = perPuzzleLevel[type]
    if (typeof level === 'number') {
      p.difficulty = level
      if (type === 'hangman') p.maxWrong = scaleHangman(level).maxWrong
    }
  }
}

type PuzzleObj = z.infer<typeof puzzleObjectSchema>

/* תיאור מעוגן-שכבה לרמת הקריאה (סקאלת 1-20) — עוגן שכבת-גיל + מחוון הניסוח
   הקונקרטי המשותף (narrativeStyleSpec), הכל על אותה סקאלת 20. */
function readingLevelDescriptor(level: number): string {
  const l = clampLevel(level) /* 1-20 */
  return `שכבת ${levelToGradeLabel(l)} (רמה ${l}/20). ${narrativeStyleSpec(l)}`
}

/* מפרט קושי לסוג אתגר יחיד (puzzleDataSpec + finalQuiz שמטופל בנפרד בפרומפט הראשי) */
function specForPuzzle(type: string, level: number, finalQuizCount: number): string {
  if (type === 'finalQuiz') {
    const { optionCount, guidance } = scaleFinalQuiz(level)
    return `"type":"finalQuiz" — "question" (כותרת קצרה) + "questions": מערך של **בדיוק ${finalQuizCount}** שאלות אינטגרטיביות, כל אחת { "question", "options":[**בדיוק ${optionCount} מחרוזות**], "correctIndex" (0-based), "explanationCorrect", "explanationIncorrect" }. **קושי: ${guidance}**`
  }
  return puzzleDataSpec(type, level)
}

/* ולידציה ממוקדת פר-סוג — האם האתגר המחודש שמיש (כדי לא לשבור את המשחק) */
function puzzleValidForType(p: PuzzleObj): boolean {
  const t = p.type === 'slidingPuzzle' ? 'tileSwap' : p.type
  switch (t) {
    case 'multipleChoice':
      return !!p.choices && p.choices.length >= 2 && p.choices.filter((c) => c.isCorrect).length === 1
    case 'trueFalse':
      return !!p.choices && p.choices.length === 2 && p.choices.filter((c) => c.isCorrect).length === 1
    case 'finalQuiz':
      return !!p.questions && p.questions.length >= 1 && p.questions.every((q) => q.options.length >= 2 && q.correctIndex >= 0 && q.correctIndex < q.options.length)
    case 'wordSearch':
      return !!p.words && p.words.length >= 3
    case 'memory':
      return !!p.pairs && p.pairs.length >= 2
    case 'wordCompletion':
      return !!p.sentence && p.sentence.includes('___') && ((!!p.answers && p.answers.length > 0) || !!p.answer)
    case 'sequenceOrder':
      return !!p.items && p.items.length >= 2 && !!p.correctOrder && p.correctOrder.length === p.items.length && p.correctOrder.every((id) => p.items!.some((it) => it.id === id))
    case 'hangman':
      return !!p.answer && p.answer.trim().length > 0
    case 'moralDilemma':
      return !!p.moralChoices && p.moralChoices.length >= 2 && p.moralChoices.every((c) => c.text && c.consequence)
    default:
      return false
  }
}

/* ייצור מחדש של תוכן האתגרים לרמת היעד (Sonnet, קריאה אחת לכל האתגרים).
   שומר על אותו נושא/מושג ותשובה נכונה, אך מתאים מספר מסיחים/זוגות/פריטים/חללים, עומק
   מושגי ורמת תעתוע לפי הרמה. tileSwap מדולג (אין תוכן — רק תמונת הסצנה). best-effort:
   אתגר שלא עבר ולידציה נשאר במקור. */
async function regeneratePuzzles(
  gd: GameData,
  perPuzzleLevel: Record<string, number>,
  textLevel: number,
  form: FormOfAddress,
  moralLevel: number,
): Promise<void> {
  const scenes = gd.scenes as unknown as LooseScene[]
  const jobs: { idx: number; type: string; level: number; fqCount: number }[] = []
  scenes.forEach((sc, idx) => {
    const p = sc.puzzle
    if (!p?.type) return
    const type = p.type === 'slidingPuzzle' ? 'tileSwap' : p.type
    if (type === 'tileSwap') return /* אין תוכן לחדש — הרשת נגזרת מהקושי בצד הקליינט */
    const level = type === 'moralDilemma' ? moralLevel : (perPuzzleLevel[type] ?? Math.round((textLevel / 16) * 10))
    const fqCount = type === 'finalQuiz' ? (p.questions?.length ?? 5) : 0
    jobs.push({ idx, type, level: clampLevel(level), fqCount })
  })
  if (jobs.length === 0) return

  const genderLine = form !== 'plural' ? formOfAddressRule(form) : 'פנייה בלשון רבים ניטרלית (אתם/כם), ללא לוכסנים.'
  const avgLevel = Math.round(jobs.reduce((a, j) => a + j.level, 0) / jobs.length)
  const itemsTxt = jobs
    .map((j, n) => {
      const orig = JSON.stringify(scenes[j.idx].puzzle, null, 0)
      return `### אתגר ${n} (type="${j.type}", רמת קושי יעד=${j.level}/10)
מפרט הרמה: ${specForPuzzle(j.type, j.level, j.fqCount)}
האתגר המקורי (שמור על אותו נושא/מושג נלמד ועל אותה תשובה נכונה תוכנית):
${orig}`
    })
    .join('\n\n')

  const lowAnchor = avgLevel <= 3
    ? `\n• **רמת היעד נמוכה (≤3) — קריטי**: שאל על **הרעיון הכי בסיסי בתוך הנושא**, לא על אותו רעיון מתוחכם עם מסיחים מטופשים. רמה 1 = עובדה/הגדרה יסודית יחידה שתלמיד מתקשה עונה עליה כמעט תמיד; **אפס הפשטה, אפס ניואנס, אפס קישור בין מושגים**. אל "תייפה" כלפי מעלה — מוטב פשוט מדי מאשר קשה מדי.`
    : ''
  const highAnchor = avgLevel >= 8
    ? `\n• **רמת היעד גבוהה (≥8) — קריטי**: הקושי בא מ**עומק מושגי**, לא מאוצר מילים או ניסוח מפותל. שאל שאלה שדורשת **הסקה רב-שלבית, הפשטה/עיקרון כללי, ניואנס וקישור בין כמה רעיונות** — לא עובדה ישירה. המסיחים כמעט-נכונים ודורשים הבחנה דקה (טעויות תפיסה נפוצות). **מבחן אנטי-קישוט**: אם אפשר לפשט את ניסוח השאלה ועדיין היא קשה — מצוין. אם פישוט הניסוח הופך אותה לקלה — הקושי היה לשוני מזויף; העמק את הרעיון במקום.`
    : ''
  const instruction = `אתה מתאים אתגרים בהדמיה חינוכית בעברית לרמת הקושי של תלמיד ספציפי.
${difficultyHeader(avgLevel)}

## כללי הזהב
• **שמור על אותו נושא/תחום לימוד** (למשל: השקעות, מלחמת סיני, מחזור המים) — אך **שנה את עומק השאלה עצמה לפי הרמה**, לא רק את המסיחים. אל תמציא נושא חדש, אבל כן שנה איזו שאלה בתוך הנושא נשאלת.
• **הורדת רמה = שאלה על רעיון בסיסי יותר בתוך הנושא** — לא אותו רעיון מתוחכם עם תשובות מטופשות. **דוגמה (השקעות)**: רמה גבוהה = "כשהריבית במשק יורדת, אילו נכסים מרוויחים?"; רמה נמוכה ≠ אותה שאלה עם מסיחים אבסורדיים, אלא שאלה יסודית כמו "מניות קונים בעזרת: אבנים / בובות / כסף". הרעיון הנבחן עצמו פשוט יותר.
• **התאם את הקושי לרמת היעד** לפי המפרט: מספר התשובות/המסיחים/הזוגות/הפריטים/החללים, **עומק הרעיון הנבחן**, ורמת התעתוע של המסיחים (נמוך=שגויים בעליל; גבוה=כמעט-נכונים מתעתעים) — שני אלה נעים יחד עם עומק השאלה, לא במקומו.
• **רמת קריאה: ${readingLevelDescriptor(textLevel)}** ${genderLine}
• **אסור** לשנות את שדה "type". שמור על המבנה המדויק שהמפרט דורש.
• לאתגרים עם תשובה נכונה — ודא שיש בדיוק תשובה נכונה אחת והיא נכונה עובדתית.
• **השפה תקנית וזורמת תמיד** — פשוטה כמו ספר ילדים איכותי, אך לעולם לא קטועה/טלגרפית ולא דקדוק משובש.
• **אסור לעוות מונחים**: מונח מקצועי (פיננסי/מדעי/היסטורי) חייב להישאר מדויק. אל תפשט מונח לג'יבריש (למשל "נייר ערך לטווח ארוך" → לא "נייר לנשום ארוך"). אם מורכב מדי — השאר את המונח הנכון עם הסבר קצר, או החלף במונח פשוט **ונכון**. לעולם לא ביטוי חסר-משמעות.${lowAnchor}${highAnchor}

לפניך ${jobs.length} אתגרים. החזר **מערך JSON בלבד** באורך ${jobs.length} בדיוק (באותו סדר), כל איבר הוא אובייקט ה-puzzle המלא והמחודש (כולל "type"). ללא טקסט נוסף וללא עטיפת markdown.

${itemsTxt}`

  try {
    const t0 = Date.now()
    console.log('[variant:puzzles] calling sonnet, jobs:', jobs.length, 'levels:', jobs.map((j) => `${j.type}:${j.level}`).join(','))
    const out = await callClaude([{ role: 'user', content: instruction }])
    const parsed = extractJson(out)
    if (!Array.isArray(parsed)) { console.error('[variant:puzzles] התגובה אינה מערך'); return }
    let applied = 0
    jobs.forEach((j, n) => {
      const cand = parsed[n]
      if (!cand || typeof cand !== 'object') return
      const res = puzzleObjectSchema.safeParse({ ...(cand as object), type: j.type })
      if (!res.success || !puzzleValidForType(res.data)) return
      const merged: Record<string, unknown> = { ...res.data, type: j.type, difficulty: j.level }
      if (j.type === 'hangman') merged.maxWrong = scaleHangman(j.level).maxWrong
      ;(scenes[j.idx] as { puzzle?: unknown }).puzzle = merged
      applied++
    })
    console.log('[variant:puzzles] done', Date.now() - t0, 'ms, applied:', applied, '/', jobs.length)
  } catch (err) {
    console.error('[variant:puzzles] נכשל:', err instanceof Error ? err.message : err)
  }
}

/* אורך המשפט הארוך ביותר (במילים) בקטע טקסט — לוולידציית ניסוח */
function longestSentenceWords(text: string): number {
  const sentences = text.split(/[.!?\n]+/).map((s) => s.trim()).filter(Boolean)
  let max = 0
  for (const s of sentences) {
    const w = s.split(/\s+/).filter(Boolean).length
    if (w > max) max = w
  }
  return max
}

/* ולידציית ניסוח: סורק מקטעי טקסט שחורגים מאורך המשפט המותר לרמה, ומריץ מעבר haiku ממוקד
   שמפשט **ניסוח בלבד** (שומר משמעות/עובדות/עומק). scaleLevel = 1-10. best-effort, מחזיר כמה תוקנו. */
async function enforceNarrativePhrasing(gd: GameData, scaleLevel: number, form: FormOfAddress): Promise<number> {
  const limit = maxSentenceWords(scaleLevel)
  const tolerance = Math.ceil(limit * 1.4) /* רק חריגה ניכרת מפעילה תיקון */
  const all = collectVariantText(gd, { puzzles: true })
  const offending: Record<string, string> = {}
  for (const [k, v] of Object.entries(all)) {
    if (longestSentenceWords(v) > tolerance) offending[k] = v
  }
  const keys = Object.keys(offending)
  if (keys.length === 0) { console.log('[phrasing:enforce] level', scaleLevel, 'limit', limit, '— הכל תקין'); return 0 }
  const genderLine = form !== 'plural' ? formOfAddressRule(form) : 'פנייה בלשון רבים ניטרלית (אתם/כם).'
  const instruction = `המקטעים הבאים (JSON של key→טקסט) מנוסחים מורכב מדי לרמת הקריאה הנדרשת. פשט **רק את הניסוח** (אורך משפט, תחביר, אוצר מילים):
${narrativeStyleSpec(scaleLevel)}
${genderLine}
שמור על אותה משמעות, אותן עובדות ואותו עומק תוכן — אל תשמיט רעיונות, רק פצל ופשט משפטים. עברית תקנית וזורמת (לא קטועה/טלגרפית). אל תעוות מונחים מקצועיים.
החזר JSON תקין עם אותם keys בדיוק. ללא טקסט נוסף.

${JSON.stringify(offending, null, 0)}`
  try {
    const out = await callHaiku([{ role: 'user', content: instruction }], 8000)
    const rew = extractJson(out)
    if (rew && typeof rew === 'object') applyVariantText(gd, rew as Record<string, string>)
    console.log('[phrasing:enforce] level', scaleLevel, 'limit', limit, 'fixed', keys.length, '/', Object.keys(all).length)
    return keys.length
  } catch (err) {
    console.error('[phrasing:enforce] נכשל:', err instanceof Error ? err.message : err)
    return 0
  }
}

/* יצירת game_data מותאמת-תלמיד: כוונון קושי + ייצור מחדש של אתגרים (Sonnet) + שכתוב נרטיב (haiku). תמונות לא מחודשות. */
async function buildStudentVariant(
  base: GameData,
  textLevel: number,
  form: FormOfAddress,
  perPuzzleLevel: Record<string, number>,
  moralLevel: number,
): Promise<GameData> {
  const variant = JSON.parse(JSON.stringify(base)) as GameData

  applyDifficultyOverrides(variant, perPuzzleLevel)

  /* ייצור מחדש של תוכן האתגרים לרמת היעד (Sonnet) — לפני שכתוב הנרטיב */
  await regeneratePuzzles(variant, perPuzzleLevel, textLevel, form, moralLevel)

  /* שכתוב נרטיב/דיאלוג/בחירות/סיומים בלבד — תוכן האתגרים כבר נוצר מחדש ב-Sonnet */
  const texts = collectVariantText(variant, { puzzles: false })
  /* ── DIAG ── */
  console.log('[variant:build]', { textLevel, form, textCount: Object.keys(texts).length, willCallHaiku: Object.keys(texts).length > 0 })
  /* ── /DIAG ── */
  if (Object.keys(texts).length > 0) {
    const genderLine = form !== 'plural'
      ? `\n${formOfAddressRule(form)}`
      : '\nפנייה בלשון רבים ניטרלית (אתם/כם).'
    const header = `אתה מתאים את הנרטיב של הדמיה חינוכית בעברית לתלמיד ספציפי.

**רמת הקריאה: ${readingLevelDescriptor(textLevel)}**${genderLine}

לפניך JSON של מקטעי טקסט עלילתי (key→טקסט). שכתב **כל** ערך לפי הכללים:
• שמור על אותן עובדות, שמות ומשמעות — אל תוסיף, אל תשמיט.
• התאם את מורכבות השפה **בפועל** לרמת הקריאה שלמעלה — ברמה נמוכה מילים יסודיות ומשפטים קצרים, לא רק "ניסוח קל" של טקסט מורכב.
• **קריטי**: השפה חייבת להישאר עברית **תקנית, זורמת וטבעית** — פשוטה כמו ספר ילדים איכותי, **לא** קטועה, לא "טלגרפית", בלי דקדוק משובש או ניסוח עילג. עדיף משפט שלם ופשוט על פני כמה מילים מקוטעות.
• **אסור לעוות מונחים**: מונח מקצועי (פיננסי/מדעי/היסטורי וכו') חייב להישאר מדויק. אל "תפשט" מונח לג'יבריש (למשל "נייר ערך לטווח ארוך" → לעולם לא "נייר לנשום ארוך"). אם מונח מורכב מדי — השאר את המונח הנכון והוסף הסבר קצר ופשוט לידו, או החלף במונח פשוט **ונכון** במשמעותו. בשום אופן לא ביטוי חסר-משמעות.
• שנה רק רמת הניסוח וצורת הפנייה הדקדוקית — לא תוכן, לא שמות, לא עובדות.`

    /* שכתוב מפה של key→טקסט. מחזיר את המפה המשוכתבת (best-effort). */
    const rewriteBatch = async (batch: Record<string, string>): Promise<Record<string, string>> => {
      const instruction = `${header}

החזר JSON תקין עם **כל ${Object.keys(batch).length} ה-keys בדיוק** (אל תשמיט אף אחד). ללא טקסט נוסף.

${JSON.stringify(batch, null, 0)}`
      const out = await callHaiku([{ role: 'user', content: instruction }], 12000)
      const rew = extractJson(out)
      return rew && typeof rew === 'object' ? (rew as Record<string, string>) : {}
    }

    try {
      const t0 = Date.now()
      console.log('[variant:haiku] calling haiku, promptLen:', JSON.stringify(texts).length)
      const rew = await rewriteBatch(texts)
      if (Object.keys(rew).length > 0) applyVariantText(variant, rew)

      /* מעבר שני ממוקד: מפתחות שהושמטו או נשארו זהים (haiku נוטה "להתעצל" בסוף הרשימה) */
      const srcKeys = Object.keys(texts)
      const leftover: Record<string, string> = {}
      for (const k of srcKeys) {
        const r = rew[k]
        if (typeof r !== 'string' || !r.trim() || r.trim() === texts[k]) leftover[k] = texts[k]
      }
      const firstChanged = srcKeys.length - Object.keys(leftover).length
      if (Object.keys(leftover).length > 0) {
        console.log('[variant:haiku] retry leftover:', Object.keys(leftover).length, '/', srcKeys.length)
        const rew2 = await rewriteBatch(leftover)
        if (Object.keys(rew2).length > 0) applyVariantText(variant, rew2)
        const stillSame = Object.keys(leftover).filter((k) => {
          const r = rew2[k]
          return typeof r !== 'string' || !r.trim() || r.trim() === texts[k]
        }).length
        console.log('[variant:merge]', { total: srcKeys.length, firstPass: firstChanged, retried: Object.keys(leftover).length, stillSame })
      } else {
        console.log('[variant:merge]', { total: srcKeys.length, firstPass: firstChanged, retried: 0, stillSame: 0 })
      }
      console.log('[variant:haiku] done', Date.now() - t0, 'ms')
    } catch (err) {
      console.error('[variant] שכתוב טקסט נכשל:', err instanceof Error ? err.message : err)
    }
  }

  /* ולידציית ניסוח — מתקן מקטעים שעדיין מורכבים מדי לרמת הקריאה */
  await enforceNarrativePhrasing(variant, textLevel, form)

  /* רמת קריאה אישית (1-20) — קצב אפקט ההקלדה בקליינט לפי רמת התלמיד */
  ;(variant as unknown as { readingScale?: number }).readingScale = textLevel

  return variant
}

/* ניסוח אזהרה למורה */
function factWarning(e: FactError): string {
  return `ד"ר הולו ממליץ לבדוק: ${e.problem}${e.correction ? ` (תיקון מוצע: ${e.correction})` : ''}`
}

/* מטא בדיקת עובדות שנשמר בתוך game_data (ללא צורך במיגרציה) — הקליינט קורא אותו לתצוגה */
interface FactCheckMeta {
  status: 'pending' | 'done'
  warnings?: string[]
  correctedSceneIds?: string[]
  error?: boolean
}

/* בדיקת העובדות המלאה (זיהוי → תיקון ממוקד → בדיקה חוזרת) — רצה ברקע ומעדכנת את ה-DB.
   best-effort: כל כשל נבלע, ה-status תמיד מסומן 'done' בסוף כדי שהקליינט יפסיק לחכות. */
async function factCheckInBackground(questId: string, gameData: GameData, baseWarnings: string[], level: number, form: FormOfAddress): Promise<void> {
  const t = Date.now()
  const meta = gameData as unknown as { factCheck?: FactCheckMeta }
  let warnings = [...baseWarnings]
  let correctedSceneIds: string[] = []
  let detected = 0
  /* ולידציית ניסוח — מפשט מקטעים שיצאו מורכבים מדי לרמה (לא פוגע ב-time-to-teacher; רקעי) */
  try {
    await enforceNarrativePhrasing(gameData, level, form)
  } catch (err) {
    console.error('[phrasing:enforce] רקע נכשל:', err instanceof Error ? err.message : err)
  }
  try {
    const fc = await runFactCheck(gameData)
    detected = fc.errors.length
    if (fc.ok && fc.errors.length > 0) {
      try {
        correctedSceneIds = await scopedFactFix(gameData, fc.errors)
        /* בדיקה חוזרת רק על הסצנות שתוקנו */
        if (correctedSceneIds.length > 0) {
          const recheck = await runFactCheck(gameData, correctedSceneIds)
          if (recheck.ok && recheck.errors.length > 0) warnings = [...warnings, ...recheck.errors.map(factWarning)]
        }
        /* שגיאות בסצנות שלא תוקנו אוטומטית (למשל בתשובות חידה) → אזהרה למורה */
        const unfixed = fc.errors.filter((e) => !e.sceneId || !correctedSceneIds.includes(e.sceneId))
        if (unfixed.length > 0) warnings = [...warnings, ...unfixed.map(factWarning)]
      } catch (err) {
        console.error('[fact-check] תיקון ברקע נכשל:', err instanceof Error ? err.message : err)
        warnings = [...warnings, ...fc.errors.map(factWarning)]
      }
    }
    meta.factCheck = { status: 'done', warnings, correctedSceneIds }
    console.log(`[fact-check] רקע: ${((Date.now() - t) / 1000).toFixed(1)} שניות (${detected} זוהו · ${correctedSceneIds.length} תוקנו · ${warnings.length} אזהרות)`)
  } catch (err) {
    console.error('[fact-check] רקע נכשל טכנית:', err instanceof Error ? err.message : err)
    meta.factCheck = { status: 'done', warnings, correctedSceneIds, error: true }
  }
  const { error } = await supabaseAdmin.from('quests').update({ game_data: gameData }).eq('id', questId)
  if (error) console.error('[fact-check] שמירת תיקוני הרקע נכשלה:', error.message)
}

/* GET /api/quests — ספריית ההדמיות של הצוות. מורה רואה רק את שלו; מנהל רואה הכול. */
questsRouter.get('/', requireStaff, async (req, res, next) => {
  try {
    const [pub, subj] = await Promise.all([hasPublicQuests(), hasQuestSubject()])
    const cols = 'id, title, game_data, status, created_at' + (pub ? ', is_public' : '') + (subj ? ', subject' : '')
    let query = supabaseAdmin
      .from('quests')
      .select(cols)
      .order('created_at', { ascending: false })
    if (req.staff!.role !== 'admin') query = query.eq('created_by', req.staff!.userId)
    const { data, error } = await query

    if (error) throw new AppError(500, 'שגיאה בשליפת הדמיות: ' + error.message)

    const quests = ((data ?? []) as unknown as { id: string; title: string; created_at: string; status: string; game_data?: { scenes?: unknown[] }; is_public?: boolean; subject?: string | null }[]).map((q) => ({
      id: q.id,
      title: q.title,
      created_at: q.created_at,
      is_published: q.status === 'published',
      is_public: pub ? q.is_public === true : false,
      sceneCount: q.game_data?.scenes?.length ?? 0,
      subject: subj ? (q.subject ?? null) : null,
    }))

    res.json({ quests })
  } catch (err) {
    next(err)
  }
})

/* GET /api/quests/:id — הדמיה בודדת מלאה */
questsRouter.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('quests')
      .select('id, title, game_data, status, created_at')
      .eq('id', req.params.id)
      .single()

    if (error || !data) throw new AppError(404, 'הדמיה לא נמצאה')

    /* אם התלמיד מחובר ויש וריאנט אישי — החזר אותו במקום ה-game_data המקורי */
    let gameData = data.game_data
    try {
      const token = req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7) : null
      const secret = process.env.JWT_SECRET
      if (token && secret) {
        const payload = jwt.verify(token, secret) as { userId?: string; role?: string }
        if (payload.role === 'student' && payload.userId && (await hasQuestVariants())) {
          const { data: vRow } = await supabaseAdmin
            .from('quest_variants')
            .select('game_data')
            .eq('quest_id', req.params.id)
            .eq('student_id', payload.userId)
            .maybeSingle()
          if (vRow?.game_data) gameData = vRow.game_data
        }
      }
    } catch { /* JWT שגוי / טבלה חסרה — נפול ל-game_data רגיל */ }

    res.json({ quest: { ...data, game_data: gameData } })
  } catch (err) {
    next(err)
  }
})

/* POST /api/quests/:id/personalize — וריאציה אישית ממוגדרת (פנייה זכר/נקבה/רבים).
   מחזיר game_data משוכתב לצורת הפנייה — אינו נשמר (שכבת המשחק/הקצאה תבחר אותו). */
const personalizeSchema = z.object({
  gender: z.enum(['male', 'female']).optional(),
  form: z.enum(['male', 'female', 'plural']).optional(),
  studentId: z.string().uuid().optional(),
})
questsRouter.post('/:id/personalize', requireStaff, async (req, res, next) => {
  try {
    const parsed = personalizeSchema.safeParse(req.body ?? {})
    if (!parsed.success) throw new AppError(400, 'בקשה לא תקינה')
    const { data: quest, error } = await supabaseAdmin
      .from('quests')
      .select('id, title, game_data, created_by')
      .eq('id', req.params.id)
      .single()
    if (error || !quest?.game_data) throw new AppError(404, 'הדמיה לא נמצאה')
    ensureOwner(req, quest.created_by)

    /* קביעת צורת הפנייה: form מפורש > gender מפורש > מגדר התלמיד (studentId) > plural */
    let form: FormOfAddress = parsed.data.form ?? parsed.data.gender ?? 'plural'
    if (!parsed.data.form && !parsed.data.gender && parsed.data.studentId && (await hasUserGender())) {
      const { data: stu } = await supabaseAdmin.from('users').select('gender').eq('id', parsed.data.studentId).maybeSingle()
      const g = (stu as { gender?: string | null } | null)?.gender
      if (g === 'male' || g === 'female') form = g
    }

    const variant = await rephraseForAddress(quest.game_data as GameData, form)
    res.json({ quest: { id: quest.id, title: quest.title, game_data: variant }, formOfAddress: form })
  } catch (err) {
    next(err)
  }
})

/* POST /api/quests/:id/variant — יצירת/עדכון וריאציה מותאמת-תלמיד.
   דורש בעלות על ההדמיה. טוען פרופיל+מגדר התלמיד, מתאים ושומר ב-quest_variants.
   עמיד לחוסר הטבלה (hasQuestVariants). */
const variantSchema = z.object({ studentId: z.string().uuid() })

questsRouter.post('/:id/variant', requireStaff, async (req, res, next) => {
  try {
    const parsed = variantSchema.safeParse(req.body)
    if (!parsed.success) throw new AppError(400, 'studentId נדרש')
    const { studentId } = parsed.data
    const questId = req.params.id

    const { data: quest } = await supabaseAdmin.from('quests').select('game_data, created_by').eq('id', questId).single()
    if (!quest) throw new AppError(404, 'הדמיה לא נמצאה')
    ensureOwner(req, (quest as { created_by?: string | null }).created_by ?? null)

    /* ── שלוף פרופיל + מגדר + שכבת כיתה במקביל ── */
    const [v2, hasGender] = await Promise.all([hasDifficultyProfileV2(), hasUserGender()])
    const profileCols = v2 ? 'text_level, per_puzzle_level' : 'id'
    const userCols = hasGender ? 'gender' : 'id'

    /* התלמיד משויך לכיתה דרך class_members (לא users.class_id) */
    const [{ data: profileRow }, { data: userRow }, { data: memberRow }] = await Promise.all([
      supabaseAdmin.from('difficulty_profiles').select(profileCols).eq('user_id', studentId).maybeSingle(),
      supabaseAdmin.from('users').select(userCols).eq('id', studentId).maybeSingle(),
      supabaseAdmin.from('class_members').select('class_id').eq('user_id', studentId).maybeSingle(),
    ])

    /* grade_label לברירת מחדל מבוססת-שכבה */
    const ur = userRow as Record<string, unknown> | null
    const classId = (memberRow as { class_id?: string } | null)?.class_id ?? null
    let gradeLabel: string | null = null
    if (classId) {
      const { data: classRow } = await supabaseAdmin.from('classes').select('grade_label').eq('id', classId).maybeSingle()
      gradeLabel = (classRow as Record<string, unknown> | null)?.grade_label as string | null ?? null
    }

    const pr = profileRow as Record<string, unknown> | null
    const fallback = defaultProfileForGrade(gradeLabel)
    const textLevel = typeof pr?.text_level === 'number' ? pr.text_level : fallback.textLevel
    const perPuzzleLevel: Record<string, number> = v2 && pr?.per_puzzle_level && typeof pr.per_puzzle_level === 'object'
      ? pr.per_puzzle_level as Record<string, number>
      : { ...fallback.perPuzzleLevel }

    const gender = (ur?.gender === 'male' || ur?.gender === 'female') ? ur.gender as 'male' | 'female' : null
    const form: FormOfAddress = gender ?? 'plural'

    /* עומק דילמת מוסר = min(רמת השכבה, רמת הטקסט) על סקאלת 1-20 (לא 60/80) */
    const moralLevel = moralDilemmaDepth(gradeToLevel(gradeLabel) ?? undefined, textLevel)

    /* ── DIAG ── */
    console.log('[variant:profile]', {
      studentId, v2,
      hasProfileRow: pr !== null,
      gradeLabel, textLevel, moralLevel,
      perPuzzleLevel_sample: Object.fromEntries(Object.entries(perPuzzleLevel).slice(0, 3)),
      gender, form,
    })
    /* ── /DIAG ── */

    const variantData = await buildStudentVariant(quest.game_data as GameData, textLevel, form, perPuzzleLevel, moralLevel)
    const snapshot = { textLevel, perPuzzleLevel, gender }

    const hasTable = await hasQuestVariants()
    console.log('[variant:save]', { hasTable, studentId })
    if (hasTable) {
      const { error } = await supabaseAdmin.from('quest_variants').upsert(
        { quest_id: questId, student_id: studentId, game_data: variantData, profile_snapshot: snapshot, created_at: new Date().toISOString() },
        { onConflict: 'quest_id,student_id' },
      )
      if (error) console.error('[variant] שמירה נכשלה:', error.message)
    }

    res.json({ ok: true, variantGameData: variantData, profileSnapshot: snapshot, persisted: hasTable })
  } catch (err) {
    next(err)
  }
})

/* POST /api/quests/:id/share — שיתוף ההדמיה לספרייה הציבורית (היוצר בלבד, ללא אישור מראש) */
questsRouter.post('/:id/share', requireStaff, async (req, res, next) => {
  try {
    if (!(await hasPublicQuests())) throw new AppError(503, 'הספרייה הציבורית עדיין לא זמינה (נדרשת מיגרציה)')
    const { data: quest, error } = await supabaseAdmin
      .from('quests')
      .select('id, created_by, original_author_id')
      .eq('id', req.params.id)
      .single()
    if (error || !quest) throw new AppError(404, 'הדמיה לא נמצאה')
    ensureOwner(req, quest.created_by)
    const patch: Record<string, unknown> = {
      is_public: true,
      published_at: new Date().toISOString(),
      original_author_id: (quest as { original_author_id?: string | null }).original_author_id ?? quest.created_by,
    }
    const { error: upErr } = await supabaseAdmin.from('quests').update(patch).eq('id', quest.id)
    if (upErr) throw new AppError(500, 'שגיאה בשיתוף: ' + upErr.message)
    res.json({ ok: true, is_public: true })
  } catch (err) {
    next(err)
  }
})

/* POST /api/quests/:id/unshare — הסרת ההדמיה מהספרייה הציבורית (היוצר בלבד) */
questsRouter.post('/:id/unshare', requireStaff, async (req, res, next) => {
  try {
    if (!(await hasPublicQuests())) throw new AppError(503, 'הספרייה הציבורית עדיין לא זמינה')
    const { data: quest, error } = await supabaseAdmin.from('quests').select('id, created_by').eq('id', req.params.id).single()
    if (error || !quest) throw new AppError(404, 'הדמיה לא נמצאה')
    ensureOwner(req, quest.created_by)
    const { error: upErr } = await supabaseAdmin.from('quests').update({ is_public: false }).eq('id', quest.id)
    if (upErr) throw new AppError(500, 'שגיאה בהסרה: ' + upErr.message)
    res.json({ ok: true, is_public: false })
  } catch (err) {
    next(err)
  }
})

/* POST /api/quests/:id/assign — הקצאת הדמיה לכיתות (יוצר ההדמיה)
   body: { classIds: string[] } — מזהי כיתות UUID; upsert כדי לא לשכפל */
questsRouter.post('/:id/assign', requireStaff, async (req, res, next) => {
  try {
    const { classIds } = req.body as { classIds?: string[] }
    if (!Array.isArray(classIds) || classIds.length === 0) throw new AppError(400, 'חסר classIds')

    const { data: quest, error } = await supabaseAdmin.from('quests').select('id, created_by').eq('id', req.params.id).single()
    if (error || !quest) throw new AppError(404, 'הדמיה לא נמצאה')
    ensureOwner(req, quest.created_by)

    /* סינון כיתות שכבר מוקצות — מניעת כפילויות ללא unique constraint */
    const { data: existing } = await supabaseAdmin
      .from('assignments').select('class_id').eq('quest_id', quest.id).in('class_id', classIds)
    const existingIds = new Set((existing ?? []).map((r: { class_id: string }) => r.class_id))
    const newRows = classIds.filter((id: string) => !existingIds.has(id))
      .map((classId: string) => ({ quest_id: quest.id, class_id: classId }))

    const inserted: { id: string; class_id: string }[] = []
    if (newRows.length > 0) {
      const { data, error: insErr } = await supabaseAdmin
        .from('assignments').insert(newRows).select('id, class_id')
      if (insErr) throw new AppError(500, 'שגיאה ביצירת הקצאות: ' + insErr.message)
      if (data) inserted.push(...data)
    }

    res.status(201).json({ assignments: inserted })
  } catch (err) {
    next(err)
  }
})

/* DELETE /api/quests/:id — מחיקת הדמיה (בעל ההדמיה או מנהל) */
questsRouter.delete('/:id', requireStaff, async (req, res, next) => {
  try {
    const { data: quest, error } = await supabaseAdmin
      .from('quests')
      .select('id, created_by')
      .eq('id', req.params.id)
      .single()
    if (error || !quest) throw new AppError(404, 'הדמיה לא נמצאה')
    ensureOwner(req, quest.created_by)

    const { error: delError } = await supabaseAdmin.from('quests').delete().eq('id', quest.id)
    if (delError) throw new AppError(500, 'שגיאה במחיקה: ' + delError.message)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

/* ── עריכת סצנה בודדת — עדכון חלקי של game_data ── */

const patchPuzzleSchema = z.object({
  question: z.string().optional(),
  choices: z
    .array(z.object({ id: z.string(), text: z.string(), isCorrect: z.boolean() }))
    .optional(),
  explanationCorrect: z.string().optional(),
  explanationIncorrect: z.string().optional(),
})

const patchSceneSchema = z.object({
  sceneId: z.string(),
  narrative: z.string().optional(),
  imagePrompt: z.string().optional(),
  drHoloExpression: z.string().optional(),
  drHoloDialog: z.string().optional(),
  title: z.string().optional(),
  puzzle: patchPuzzleSchema.optional(),
})

/* סצנה גנרית בתוך game_data — לעריכה בלבד */
interface EditableScene {
  id: string
  narrative?: string
  imagePrompt?: string
  drHoloExpression?: string
  puzzle?: {
    question?: string
    choices?: { id: string; text: string; isCorrect: boolean }[]
    explanationCorrect?: string
    explanationIncorrect?: string
  }
}

interface EditableEnding {
  title?: string
  narrative?: string
  drHoloDialog?: string
  imagePrompt?: string
  imageUrl?: string
  drHoloExpression?: string
}

/* PATCH /api/quests/:id/scene — עדכון חלקי של שדות סצנה בתוך game_data
   body: { sceneId, narrative?, imagePrompt?, puzzle? } */
questsRouter.patch('/:id/scene', requireStaff, async (req, res, next) => {
  try {
    const parsed = patchSceneSchema.safeParse(req.body)
    if (!parsed.success) {
      throw new AppError(400, 'בקשה לא תקינה: ' + parsed.error.message)
    }
    const { sceneId, narrative, imagePrompt, drHoloExpression, drHoloDialog, title, puzzle } = parsed.data

    const { data: quest, error } = await supabaseAdmin
      .from('quests')
      .select('id, game_data, created_by')
      .eq('id', req.params.id)
      .single()

    if (error || !quest?.game_data) throw new AppError(404, 'הדמיה לא נמצאה')
    ensureOwner(req, quest.created_by)

    const gameData = quest.game_data as { scenes: EditableScene[]; endingGood?: EditableEnding; endingBad?: EditableEnding }

    /* עדכון סצנת סיום (endingGood / endingBad) — sceneId סינתטי */
    if (sceneId === '__endingGood__' || sceneId === '__endingBad__') {
      const ending = sceneId === '__endingGood__' ? gameData.endingGood : gameData.endingBad
      if (!ending) throw new AppError(404, 'סצנת הסיום לא נמצאה')
      if (title !== undefined) ending.title = title
      if (narrative !== undefined) ending.narrative = narrative
      if (drHoloDialog !== undefined) ending.drHoloDialog = drHoloDialog
      if (imagePrompt !== undefined) ending.imagePrompt = imagePrompt
      if (drHoloExpression !== undefined) ending.drHoloExpression = drHoloExpression
      const { error: updateError } = await supabaseAdmin.from('quests').update({ game_data: gameData }).eq('id', quest.id)
      if (updateError) throw new AppError(500, 'שגיאה בשמירה: ' + updateError.message)
      return res.json({ scene: { id: sceneId, ...ending } })
    }

    const scene = gameData.scenes.find((s) => s.id === sceneId)
    if (!scene) throw new AppError(404, 'סצנה לא נמצאה')

    /* עדכון רק של השדות שנשלחו (partial update) */
    if (narrative !== undefined) scene.narrative = narrative
    if (imagePrompt !== undefined) scene.imagePrompt = imagePrompt
    if (drHoloExpression !== undefined) scene.drHoloExpression = drHoloExpression
    if (puzzle !== undefined) {
      if (!scene.puzzle) throw new AppError(400, 'לסצנה זו אין חידה לעריכה')
      if (puzzle.question !== undefined) scene.puzzle.question = puzzle.question
      if (puzzle.choices !== undefined) scene.puzzle.choices = puzzle.choices
      if (puzzle.explanationCorrect !== undefined)
        scene.puzzle.explanationCorrect = puzzle.explanationCorrect
      if (puzzle.explanationIncorrect !== undefined)
        scene.puzzle.explanationIncorrect = puzzle.explanationIncorrect
    }

    const { error: updateError } = await supabaseAdmin
      .from('quests')
      .update({ game_data: gameData })
      .eq('id', quest.id)
    if (updateError) throw new AppError(500, 'שגיאה בשמירה: ' + updateError.message)

    res.json({ scene })
  } catch (err) {
    next(err)
  }
})

/* מטא יצירה שנשמר בתוך game_data בזמן/בסיום היצירה — הקליינט עושה polling וקורא אותו.
   generating=true בזמן היצירה; genError=הודעה אם נכשלה; genMeta=warnings/hub בסיום. */
interface GenMeta { warnings?: string[]; hub?: HubInfo | null }

/* ── יצירת ההדמיה ברקע ──
   רצה אחרי שה-route כבר החזיר את ה-id (מנתק את היצירה הארוכה ~130-170ש׳ מ-timeout
   של ה-proxy בפרודקשן). בסיום מעדכן את game_data בשורה; בכשל כותב genError. */
async function generateQuestInBackground(questId: string, params: QuestGenerationParams): Promise<void> {
  const expectedKeys = requiredKeyCount(params)
  const prompt = buildQuestPrompt(params)
  const tStart = Date.now()
  const secs = (from: number) => ((Date.now() - from) / 1000).toFixed(1)
  let retryCount = 0
  console.log(`[gen] התחלה (רקע) · אורך פרומפט ${prompt.length} תווים · ${params.questLength} סצנות · מפתחות צפויים ${expectedKeys}`)

  try {
    /* קריאה ראשונה */
    const tMain = Date.now()
    const firstText = await callClaude([{ role: 'user', content: prompt }])
    console.log(`[gen] קריאה ראשית (sonnet): ${secs(tMain)} שניות · פלט ${firstText.length} תווים`)

    let gameData: GameData
    let raw: unknown
    try {
      raw = extractJson(firstText)
    } catch {
      throw new AppError(502, 'Claude החזיר JSON לא תקין')
    }

    /* ולידציה מלאה לניסיון: סכמה + מפתחות + מבנה Hub. מחזירה הודעת retry אם נכשל */
    function fullValidate(candidate: unknown): {
      data?: GameData
      retryMessage?: string
      fatal?: string
      hub?: HubInfo
      structureErrors?: string[]
    } {
      const result = validateGameData(candidate, expectedKeys)
      if (!result.ok) {
        return {
          retryMessage:
            result.reason === 'key count mismatch'
              ? buildRetryMessage(expectedKeys, result.actualKeys ?? 0)
              : `ה-JSON שהחזרת אינו תואם לסכמה הנדרשת: ${result.reason}. תקן והחזר JSON תקין בלבד.`,
          fatal: 'יצירת הקווסט נכשלה: ' + result.reason,
        }
      }
      /* סצנות סיום — חובה כשד"ר הולו פעיל */
      if (params.includeDrHolo && (!result.data.endingGood || !result.data.endingBad)) {
        return {
          retryMessage:
            'חסרים שדות "endingGood" ו/או "endingBad" ברמה העליונה של ה-JSON. הוסף את שתי סצנות הסיום במעבדה (title, narrative, drHoloDialog) כמתואר בהנחיות, והחזר את ה-JSON המלא המתוקן בלבד.',
          fatal: 'חסרות סצנות סיום (endingGood/endingBad)',
        }
      }
      /* ולידציית מבנה Hub — רק כשנדרשים מפתחות */
      if (expectedKeys > 0) {
        const hubResult = validateHubStructure(result.data, expectedKeys)
        if (!hubResult.ok) {
          return {
            data: result.data,
            retryMessage: buildStructureRetryMessage(expectedKeys, hubResult.errors),
            structureErrors: hubResult.errors,
            hub: hubResult.hub,
          }
        }
        return { data: result.data, hub: hubResult.hub }
      }
      return { data: result.data }
    }

    let warnings: string[] = []
    let hubInfo: HubInfo | undefined

    const first = fullValidate(raw)
    if (first.data && !first.retryMessage) {
      gameData = first.data
      hubInfo = first.hub
    } else {
      /* retry אחד עם הודעת תיקון מדויקת */
      retryCount++
      const tRetry = Date.now()
      console.log(`[gen] ולידציה נכשלה בניסיון 1 (${first.fatal ?? first.structureErrors?.join('; ') ?? 'מבנה'}) → retry`)
      const retryText = await callClaude([
        { role: 'user', content: prompt },
        { role: 'assistant', content: firstText },
        { role: 'user', content: first.retryMessage! },
      ])
      console.log(`[gen] retry (sonnet): ${secs(tRetry)} שניות`)

      let retryRaw: unknown
      try {
        retryRaw = extractJson(retryText)
      } catch {
        throw new AppError(502, 'Claude החזיר JSON לא תקין גם לאחר ניסיון תיקון')
      }

      const second = fullValidate(retryRaw)
      if (second.data && !second.retryMessage) {
        gameData = second.data
        hubInfo = second.hub
      } else if (second.data && second.structureErrors) {
        /* סכמה תקינה אבל מבנה ה-Hub עדיין שגוי — מחזירים עם אזהרות למורה */
        gameData = second.data
        hubInfo = second.hub
        warnings = second.structureErrors.map(
          (e) => `מבנה הקווסט אינו תקין במלואו: ${e}`,
        )
      } else if (first.data && first.structureErrors) {
        /* ה-retry החמיר (סכמה שבורה) — חוזרים לגרסה הראשונה עם אזהרות */
        gameData = first.data
        hubInfo = first.hub
        warnings = first.structureErrors.map(
          (e) => `מבנה הקווסט אינו תקין במלואו: ${e}`,
        )
      } else {
        throw new AppError(502, second.fatal ?? 'יצירת הקווסט נכשלה לאחר ניסיון תיקון')
      }
    }

    /* הזרקת רמת הקושי לכל אתגר — לחישוב פרמטרי תצוגה בקליינט (פאזל/חיפוש מילים) */
    const level = clampLevel(params.difficultySettings?.puzzleDifficulty as number | undefined)
    for (const sc of gameData.scenes) if (sc.puzzle) sc.puzzle.difficulty = level
    /* רמת קריאה (1-20) ברמת ה-game_data — קובעת קצב אפקט ההקלדה בקליינט */
    ;(gameData as unknown as { readingScale?: number }).readingScale = level

    /* מטא ליצירה — הקליינט קורא בעת ה-polling. בדיקת עובדות תרוץ ברקע (pending). */
    ;(gameData as unknown as { factCheck?: FactCheckMeta }).factCheck = { status: 'pending' }
    ;(gameData as unknown as { genMeta?: GenMeta }).genMeta = { warnings, hub: hubInfo ?? null }

    /* עדכון השורה (שכבר נוצרה כ-stub) עם ה-game_data המוכן */
    const { error } = await supabaseAdmin.from('quests').update({ game_data: gameData }).eq('id', questId)
    if (error) throw new AppError(500, 'שגיאה בשמירת ההדמיה: ' + error.message)

    console.log(`[gen] ━━ ההדמיה מוכנה: ${secs(tStart)} שניות · retries=${retryCount} ━━`)

    /* שכבה 2: בדיקת עובדות + תיקון ממוקד + ולידציית ניסוח — ברקע (best-effort, לא חוסם) */
    void factCheckInBackground(questId, gameData, warnings, level, params.formOfAddress ?? 'plural')
  } catch (err) {
    const msg = err instanceof AppError ? err.message : err instanceof Error ? err.message : 'יצירת ההדמיה נכשלה'
    console.error('[gen] יצירה ברקע נכשלה:', msg)
    await supabaseAdmin.from('quests')
      .update({ game_data: { genError: msg } })
      .eq('id', questId)
      .then(({ error }) => { if (error) console.error('[gen] שמירת genError נכשלה:', error.message) })
  }
}

/* POST /api/quests/generate — רושם הדמיה "בעיצומה של יצירה" ומחזיר מיד; היצירה רצה
   ברקע (מנתק את היצירה הארוכה מ-timeout של ה-proxy). הקליינט עושה polling ל-GET /:id. */
questsRouter.post('/generate', requireStaff, async (req, res, next) => {
  try {
    const parsed = generateRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      throw new AppError(400, 'בקשה לא תקינה: ' + parsed.error.message)
    }
    const params: QuestGenerationParams = parsed.data

    const stub: Record<string, unknown> = {
      title: params.title,
      curriculum: params.curriculum,
      quest_type: params.questType ?? 'adventure',
      quest_length: params.questLength,
      art_style: params.artStyle ?? 'digital-painting',
      include_dr_holo: params.includeDrHolo ?? true,
      puzzle_preferences: params.puzzlePreferences ?? {},
      difficulty_settings: params.difficultySettings ?? {},
      game_data: { generating: true },
      status: 'draft',
      created_by: req.staff!.userId,
    }
    if (parsed.data.subject && (await hasQuestSubject())) stub.subject = parsed.data.subject

    const { data: quest, error } = await supabaseAdmin.from('quests').insert(stub).select().single()
    if (error || !quest) throw new AppError(500, 'שגיאה ביצירת ההדמיה: ' + (error?.message ?? ''))

    /* מחזירים מיד — היצירה ממשיכה ברקע */
    res.status(201).json({ quest, generating: true })
    void generateQuestInBackground(quest.id, params)
  } catch (err) {
    next(err)
  }
})
