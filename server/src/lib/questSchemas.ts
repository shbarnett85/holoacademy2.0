import { z } from 'zod'

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

export const puzzleObjectSchema = z.object({
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
  /* יעד הלמידה שהאתגר בוחן (מזהה מתוך game_data.objectives) — מזין את דיווח השליטה */
  objectiveId: z.string().optional(),
  /* finalQuiz — רצף שאלות סיכום */
  questions: z
    .array(
      z.object({
        question: z.string().min(1),
        options: z.array(z.string().min(1)).min(2),
        correctIndex: z.number().int().min(0),
        explanationCorrect: z.string().optional(),
        explanationIncorrect: z.string().optional(),
        /* יעד הלמידה שהשאלה בוחנת — תיוג פר-שאלה במבחן הסיכום */
        objectiveId: z.string().optional(),
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
  /* דיאלוג ד"ר הולו בסצנה (טקסט מדובר המוצג לתלמיד) */
  drHoloDialog: z.string().optional(),
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

export const gameDataSchema = z
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

export type GameData = z.infer<typeof gameDataSchema>

export const generateRequestSchema = z.object({
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
  /* יעדי למידה (טקסט חופשי מהמורה / חילוץ AI) — השרת מקצה מזהים ומזריק לפרומפט */
  objectives: z.array(z.string().min(1).max(300)).max(8).optional(),
})

/* חילוץ JSON מתשובת Claude (כולל ניקוי גדרות קוד אם יש).
   סובלני: אם הפרסינג הישיר נכשל (המודל הוסיף טקסט לפני/אחרי ה-JSON — קורה
   לעיתים בפלטים ארוכים), מחלץ את הקטע מה-{ הראשון עד ה-} האחרון ומנסה שוב —
   אותה טכניקה שכבר הוכיחה את עצמה ב-extractSafetyJson של בדיקת הבטיחות. */
export function extractJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  try {
    return JSON.parse(cleaned)
  } catch (err) {
    const first = cleaned.indexOf('{')
    const last = cleaned.lastIndexOf('}')
    if (first !== -1 && last > first) {
      return JSON.parse(cleaned.slice(first, last + 1))
    }
    throw err
  }
}

/* ולידציה מלאה: סכמה + מספר מפתחות תואם */
export function validateGameData(
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

/* הוראת ברירת-מחדל ל-question בחידות מבוססות-משחק (שבהן question הוא הוראה גנרית, לא תוכן לימודי) */
const PUZZLE_DEFAULT_QUESTION: Record<string, string> = {
  tileSwap: 'השלם את התמונה',
  slidingPuzzle: 'השלם את התמונה',
  wordSearch: 'מצא את כל המילים המוסתרות',
  memory: 'התאם בין הזוגות',
  sequenceOrder: 'סדר את הפריטים בסדר הנכון',
  wordCompletion: 'השלם את המילים החסרות',
  hangman: 'נחש את המילה',
  finalQuiz: 'מבחן הסיכום',
}

/* ── עמידות: תיקון חידות פגומות לפני הולידציה הקשיחה ──
   חידה בודדת חסרת "question" (שדה חובה בסכמה) מפילה את כל ה-safeParse עם שגיאה סתומה
   ואת כל ההדמיה. כאן מתקנים נקודתית כדי שלא ייפול הכול: חידה מבוססת-משחק (tileSwap/
   wordSearch/...) מקבלת הוראה גנרית; שאלת מוסר גוזרת question מה-situation; חידת-תוכן
   (multipleChoice/trueFalse) חסרת-שאלה — מסירים את החידה מהסצנה (סצנה בלי חידה עדיפה על
   כשל מלא) ומדגלים למורה. מחזיר אזהרות; מוטציה על raw. */
export function repairRawPuzzles(raw: unknown): string[] {
  const warnings: string[] = []
  const scenes = (raw as { scenes?: unknown })?.scenes
  if (!Array.isArray(scenes)) return warnings
  scenes.forEach((sc, idx) => {
    const scene = sc as { title?: string; puzzle?: Record<string, unknown> | null }
    const p = scene?.puzzle
    if (!p || typeof p !== 'object') return
    const where = scene.title ? `"${scene.title}"` : `סצנה ${idx + 1}`
    const q = typeof p.question === 'string' ? p.question.trim() : ''
    if (q) return /* יש שאלה — תקין */
    const type = typeof p.type === 'string' ? p.type : ''
    /* שאלת מוסר — גזור question מה-situation */
    if (type === 'moralDilemma') {
      const sit = typeof p.situation === 'string' ? p.situation.trim() : ''
      if (sit) { p.question = 'מה תבחר?' }
      else { delete scene.puzzle; warnings.push(`חידה הוסרה ב${where}: שאלת מוסר ללא תיאור דילמה`) }
      return
    }
    /* חידה מבוססת-משחק — הוראה גנרית מספיקה (question הוא הוראה, לא תוכן) */
    const fallback = PUZZLE_DEFAULT_QUESTION[type]
    if (fallback) { p.question = fallback; warnings.push(`הושלמה הוראת ברירת-מחדל לחידה ב${where} (חסרה "question")`); return }
    /* חידת-תוכן (multipleChoice/trueFalse או סוג לא מוכר) ללא שאלה — הסר את החידה ודגל.
       (קודם לכן רץ recoverMissingQuestions שמנסה לשחזר את ה-question; כאן רק מה שלא שוחזר.) */
    delete scene.puzzle
    warnings.push(`חידה הוסרה ב${where}: חסרה שאלה (question) ולא ניתן לשחזר את התוכן`)
  })
  return warnings
}

export type PuzzleObj = z.infer<typeof puzzleObjectSchema>
