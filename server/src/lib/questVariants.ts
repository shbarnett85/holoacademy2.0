import { callClaude, callHaiku } from './claudeCalls.js'
import { callGeminiText, callGeminiJSON } from './gemini.js'
import { engineFor } from './modelRouter.js'
import { extractJson, puzzleObjectSchema, type GameData, type PuzzleObj } from './questSchemas.js'
import { nakdan } from './dicta.js'
import { clampLevel, scaleHangman, scaleFinalQuiz, narrativeStyleSpec, maxSentenceWords } from '../../../src/shared/lib/difficultyScaling.js'
import { levelToGradeLabel } from '../../../src/shared/lib/difficultyCalibration.js'
import { formOfAddressRule, puzzleDataSpec, difficultyHeader, type FormOfAddress } from '../prompts/questPrompt.js'
import { debug, error as logError } from './log.js'

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
export async function rephraseForAddress(base: GameData, form: FormOfAddress): Promise<GameData> {
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
    const out = engineFor('rephrase') === 'gemini' ? await callGeminiText(instruction, 8000, true) : await callHaiku([{ role: 'user', content: instruction }], 8000)
    const rew = extractJson(out) as Record<string, string>
    if (rew && typeof rew === 'object') applyAddressText(variant, rew)
  } catch (err) {
    logError('[personalize] שכתוב הפנייה נכשל:', err instanceof Error ? err.message : err)
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

/* ניקוד מלא לכל הטקסט הפונה לתלמיד דרך Dicta Nakdan (רמות כתיבה נמוכות ≤6, קוראים
   מתחילים). מחליף את ניקוד המודל בניקוד תקני ומדויק. best-effort (כשל לשדה בודד →
   נשמר ניקוד המודל). pool של 6 בו-זמנית. */
export async function applyNiqqudToGameData(gd: GameData): Promise<number> {
  const texts = collectVariantText(gd, { puzzles: true })
  const keys = Object.keys(texts)
  if (keys.length === 0) return 0
  const out: Record<string, string> = {}
  let i = 0
  const worker = async () => {
    while (i < keys.length) {
      const k = keys[i++]
      out[k] = await nakdan(texts[k])
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, keys.length) }, worker))
  applyVariantText(gd, out)
  return keys.length
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

  /* ── system מקושש (cache_control): כללי הזהב הקבועים + האתגרים המקוריים — זהים בין כל
     התלמידים של אותה הדמיה, כך שבייצוא פר-תלמיד הקריאה ה-2+ פוגעת ב-cache. ── */
  const originalsBlock = jobs
    .map((j, n) => `### אתגר ${n} (type="${j.type}")\n${JSON.stringify(scenes[j.idx].puzzle, null, 0)}`)
    .join('\n\n')
  const cachedSystem = `אתה מתאים אתגרים בהדמיה חינוכית בעברית לרמת הקושי של תלמיד ספציפי, לפי הכללים והאתגרים המקוריים הבאים.

## כללי הזהב (קבועים)
• **שמור על אותו נושא/תחום לימוד** (למשל: השקעות, מלחמת סיני, מחזור המים) — אך **שנה את עומק השאלה עצמה לפי הרמה**, לא רק את המסיחים. אל תמציא נושא חדש, אבל כן שנה איזו שאלה בתוך הנושא נשאלת.
• **הורדת רמה = שאלה על רעיון בסיסי יותר בתוך הנושא** — לא אותו רעיון מתוחכם עם תשובות מטופשות. **דוגמה (השקעות)**: רמה גבוהה = "כשהריבית במשק יורדת, אילו נכסים מרוויחים?"; רמה נמוכה ≠ אותה שאלה עם מסיחים אבסורדיים, אלא שאלה יסודית כמו "מניות קונים בעזרת: אבנים / בובות / כסף". הרעיון הנבחן עצמו פשוט יותר.
• **התאם את הקושי לרמת היעד** לפי המפרט: מספר התשובות/המסיחים/הזוגות/הפריטים/החללים, **עומק הרעיון הנבחן**, ורמת התעתוע של המסיחים (נמוך=שגויים בעליל; גבוה=כמעט-נכונים מתעתעים).
• **אסור** לשנות את שדה "type". שמור על המבנה המדויק שהמפרט דורש.
• לאתגרים עם תשובה נכונה — ודא שיש בדיוק תשובה נכונה אחת והיא נכונה עובדתית.
• **השפה תקנית וזורמת תמיד** — פשוטה כמו ספר ילדים איכותי, אך לעולם לא קטועה/טלגרפית ולא דקדוק משובש.
• **אסור לעוות מונחים**: מונח מקצועי (פיננסי/מדעי/היסטורי) חייב להישאר מדויק. אל תפשט מונח לג'יבריש (למשל "נייר ערך לטווח ארוך" → לא "נייר לנשום ארוך"). אם מורכב מדי — השאר את המונח הנכון עם הסבר קצר, או החלף במונח פשוט **ונכון**.

## האתגרים המקוריים (לפי אינדקס — שמור על אותו נושא/מושג ועל אותה תשובה נכונה תוכנית):
${originalsBlock}`

  const lowAnchor = avgLevel <= 3
    ? `\n• **רמת היעד נמוכה (≤3) — קריטי**: שאל על **הרעיון הכי בסיסי בתוך הנושא**, לא על אותו רעיון מתוחכם עם מסיחים מטופשים. רמה 1 = עובדה/הגדרה יסודית יחידה; **אפס הפשטה, אפס ניואנס**. מוטב פשוט מדי מאשר קשה מדי.`
    : ''
  const highAnchor = avgLevel >= 8
    ? `\n• **רמת היעד גבוהה (≥8) — קריטי**: הקושי בא מ**עומק מושגי**, לא מאוצר מילים. שאלה שדורשת הסקה רב-שלבית/הפשטה/ניואנס/קישור בין רעיונות — לא עובדה ישירה. מסיחים כמעט-נכונים. אם פישוט הניסוח הופך אותה לקלה — העמק את הרעיון במקום.`
    : ''
  /* ── user משתנה (פר-תלמיד): רמת קריאה/מגדר/עוגנים + יעדי הרמה לכל אתגר ── */
  const user = `${difficultyHeader(avgLevel)}
• **רמת קריאה: ${readingLevelDescriptor(textLevel)}** ${genderLine}${lowAnchor}${highAnchor}

## יעדי הרמה לכל אתגר — התאם את האתגר המקורי (באותו אינדקס שב-system) לרמה:
${jobs.map((j, n) => `### אתגר ${n} → רמת יעד ${j.level}/20. מפרט: ${specForPuzzle(j.type, j.level, j.fqCount)}`).join('\n')}

החזר **מערך JSON בלבד** באורך ${jobs.length} בדיוק (באותו סדר), כל איבר הוא אובייקט ה-puzzle המלא והמחודש (כולל "type"). ללא טקסט נוסף וללא עטיפת markdown.`

  try {
    const t0 = Date.now()
    debug('[variant:puzzles] calling sonnet, jobs:', jobs.length, 'levels:', jobs.map((j) => `${j.type}:${j.level}`).join(','))
    const out = engineFor('variantPuzzles') === 'gemini' ? await callGeminiJSON(cachedSystem ?? '', user, 12000) : await callClaude([{ role: 'user', content: user }], cachedSystem)
    const parsed = extractJson(out)
    if (!Array.isArray(parsed)) { logError('[variant:puzzles] התגובה אינה מערך'); return }
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
    debug('[variant:puzzles] done', Date.now() - t0, 'ms, applied:', applied, '/', jobs.length)
  } catch (err) {
    logError('[variant:puzzles] נכשל:', err instanceof Error ? err.message : err)
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
export async function enforceNarrativePhrasing(gd: GameData, scaleLevel: number, form: FormOfAddress): Promise<number> {
  const limit = maxSentenceWords(scaleLevel)
  const tolerance = Math.ceil(limit * 1.4) /* רק חריגה ניכרת מפעילה תיקון */
  const all = collectVariantText(gd, { puzzles: true })
  const offending: Record<string, string> = {}
  for (const [k, v] of Object.entries(all)) {
    if (longestSentenceWords(v) > tolerance) offending[k] = v
  }
  const keys = Object.keys(offending)
  if (keys.length === 0) { debug('[phrasing:enforce] level', scaleLevel, 'limit', limit, '— הכל תקין'); return 0 }
  const genderLine = form !== 'plural' ? formOfAddressRule(form) : 'פנייה בלשון רבים ניטרלית (אתם/כם).'
  const instruction = `המקטעים הבאים (JSON של key→טקסט) מנוסחים מורכב מדי לרמת הקריאה הנדרשת. פשט **רק את הניסוח** (אורך משפט, תחביר, אוצר מילים):
${narrativeStyleSpec(scaleLevel)}
${genderLine}
שמור על אותה משמעות, אותן עובדות ואותו עומק תוכן — אל תשמיט רעיונות, רק פצל ופשט משפטים. עברית תקנית וזורמת (לא קטועה/טלגרפית). אל תעוות מונחים מקצועיים.
החזר JSON תקין עם אותם keys בדיוק. ללא טקסט נוסף.

${JSON.stringify(offending, null, 0)}`
  try {
    const out = engineFor('phrasing') === 'gemini' ? await callGeminiText(instruction, 8000, true) : await callHaiku([{ role: 'user', content: instruction }], 8000)
    const rew = extractJson(out)
    if (rew && typeof rew === 'object') applyVariantText(gd, rew as Record<string, string>)
    debug('[phrasing:enforce] level', scaleLevel, 'limit', limit, 'fixed', keys.length, '/', Object.keys(all).length)
    return keys.length
  } catch (err) {
    logError('[phrasing:enforce] נכשל:', err instanceof Error ? err.message : err)
    return 0
  }
}

/* יצירת game_data מותאמת-תלמיד: כוונון קושי + ייצור מחדש של אתגרים (Sonnet) + שכתוב נרטיב (haiku). תמונות לא מחודשות. */
export async function buildStudentVariant(
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
  debug('[variant:build]', { textLevel, form, textCount: Object.keys(texts).length, willCallHaiku: Object.keys(texts).length > 0 })
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
      const out = engineFor('variantText') === 'gemini' ? await callGeminiText(instruction, 12000, true) : await callHaiku([{ role: 'user', content: instruction }], 12000)
      const rew = extractJson(out)
      return rew && typeof rew === 'object' ? (rew as Record<string, string>) : {}
    }

    try {
      const t0 = Date.now()
      debug('[variant:haiku] calling haiku, promptLen:', JSON.stringify(texts).length)
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
        debug('[variant:haiku] retry leftover:', Object.keys(leftover).length, '/', srcKeys.length)
        const rew2 = await rewriteBatch(leftover)
        if (Object.keys(rew2).length > 0) applyVariantText(variant, rew2)
        const stillSame = Object.keys(leftover).filter((k) => {
          const r = rew2[k]
          return typeof r !== 'string' || !r.trim() || r.trim() === texts[k]
        }).length
        debug('[variant:merge]', { total: srcKeys.length, firstPass: firstChanged, retried: Object.keys(leftover).length, stillSame })
      } else {
        debug('[variant:merge]', { total: srcKeys.length, firstPass: firstChanged, retried: 0, stillSame: 0 })
      }
      debug('[variant:haiku] done', Date.now() - t0, 'ms')
    } catch (err) {
      logError('[variant] שכתוב טקסט נכשל:', err instanceof Error ? err.message : err)
    }
  }

  /* ולידציית ניסוח — מתקן מקטעים שעדיין מורכבים מדי לרמת הקריאה */
  await enforceNarrativePhrasing(variant, textLevel, form)

  /* ניקוד מלא ומדויק (Dicta) לתלמיד ברמת קריאה נמוכה (≤6) */
  if (textLevel <= 6) await applyNiqqudToGameData(variant)

  /* רמת קריאה אישית (1-20) — קצב אפקט ההקלדה בקליינט לפי רמת התלמיד */
  ;(variant as unknown as { readingScale?: number }).readingScale = textLevel

  return variant
}
