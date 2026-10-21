/* ──────────────────────────────────────────────────────────────────────────
   sceneFit — כלל "אורך טקסט לתלמיד" בשרת: בדיקה אחרי יצירה, קיצור, פיצול וסימון (CLAUDE.md).
   · analyzeScene/analyzeQuest — fitsScreen (shared/lib/sceneText, מכויל מול Chrome) על כל סצנה, במסך הייחוס הראשי.
   · enforceSceneFit — סצנה חורגת → **בקשת קיצור אחת** למודל (עם העובדות שהאתגר נשען עליהן) ← אימות דטרמיניסטי
     (נכנס במסך + העובדות נשמרו) ← אם עדיין חורגת: פיצול לשתי סצנות (רק סצנה ליניארית בלי אתגר/בחירות/חפץ) ← אחרת סימון.
     הטקסט המקוצר עובר מיד אחר כך את בדיקות הבטיחות/העובדות/הדקדוק הרגילות של שרשרת היצירה (הן רצות אחרי השלב הזה).
   · הגופן לעולם לא מוקטן — רק הטקסט מתקצר או מתחלק (ובתצוגה: עמודים).
   ────────────────────────────────────────────────────────────────────────── */
import {
  OPTION_WORD_BUDGET, PRIMARY_SCREEN, fitsScreen, gradeBandOfLevel, questionWordBudget, sceneDisplayText, sceneWordBudget, wordCount,
  GRADE_BAND_LABEL, type GradeBand,
} from '../../../src/shared/lib/sceneText.js'
import { paginate, splitUnits } from '../../../src/shared/lib/scenePages.js'
import type { FormOfAddress } from '../prompts/questPrompt.js'
import { extractJson, type GameData } from './questSchemas.js'
import { callHaiku } from './claudeCalls.js'
import { callGeminiText } from './gemini.js'
import { engineFor } from './modelRouter.js'
import { debug, info, error as logError } from './log.js'

type Scene = GameData['scenes'][number]

/* ── ניתוח ── */
export interface SceneFitInfo {
  sceneId: string
  words: number
  lines: number
  maxLines: number
  /* כמה עמודים הסצנה תתפוס בתצוגה במסך הייחוס (1 = נכנסת במלואה) */
  pages: number
  overflow: boolean
  /* נוסח השאלה / אפשרות בבחירה מרובה חורגים מהתקציב (גובה על הבמה) */
  questionOverflow: boolean
  optionOverflow: boolean
}

/* מספר שורות הכפתורים שאזור הפעולות שומר בסצנה (כמו ב-GameScreen: אתגר + איסוף) */
export const sceneActionRows = (s: Scene): number => Math.max(1, (s.puzzle ? 1 : 0) + (s.collectableItem ? 1 : 0))

export function analyzeScene(scene: Scene, band: GradeBand): SceneFitInfo {
  const text = sceneDisplayText(scene)
  const fit = text ? fitsScreen(text, band, PRIMARY_SCREEN, { actionRows: sceneActionRows(scene) }) : null
  const p = scene.puzzle
  const choices = p?.choices ?? []
  const questionOverflow = !!p?.question && (p.type === 'multipleChoice' || p.type === 'trueFalse') && wordCount(p.question) > questionWordBudget(choices.length)
  const optionOverflow = choices.length > 2 && choices.some((c) => wordCount(c.text) > OPTION_WORD_BUDGET)
  return {
    sceneId: scene.id,
    words: wordCount(text),
    lines: fit?.lines ?? 0,
    maxLines: fit?.maxLines ?? 0,
    pages: fit?.pages ?? 1,
    overflow: fit ? !fit.fits : false,
    questionOverflow,
    optionOverflow,
  }
}

export function analyzeQuest(gd: Pick<GameData, 'scenes'>, band: GradeBand): { scenes: SceneFitInfo[]; long: number; total: number } {
  const scenes = gd.scenes.map((s) => analyzeScene(s, band))
  return { scenes, long: scenes.filter((s) => s.overflow).length, total: scenes.length }
}

/* שכבת ההדמיה לצורך הבדיקה: רמת הטקסט השמורה בה (readingScale); אחרת טווח השכבות; אחרת ה׳–ו׳ */
export function bandOfGameData(gd: { readingScale?: number }, grades?: { gradeMin?: number | null; gradeMax?: number | null }): GradeBand {
  if (gd.readingScale != null && Number.isFinite(Number(gd.readingScale))) return gradeBandOfLevel(gd.readingScale)
  if (grades?.gradeMin != null && grades?.gradeMax != null) {
    const mid = Math.round((grades.gradeMin + grades.gradeMax) / 2)
    return mid <= 2 ? 'g1_2' : mid <= 4 ? 'g3_4' : mid <= 6 ? 'g5_6' : 'g7_9'
  }
  return 'g5_6'
}

/* ── עובדות שהאתגר נשען עליהן (עוגנים שחייבים לשרוד קיצור) ── */
const STOP = new Set(['של', 'אל', 'על', 'עם', 'זה', 'זו', 'זאת', 'הוא', 'היא', 'הם', 'הן', 'אתה', 'את', 'אתם', 'אנחנו', 'מה', 'מי', 'איך', 'למה', 'כל', 'לא', 'כן', 'או', 'גם', 'אבל', 'כי', 'אם', 'עוד', 'רק', 'אחד', 'אחת', 'היה', 'היתה', 'הייתה', 'יש', 'אין', 'כך', 'פה', 'שם', 'ממנו', 'בין', 'לפני', 'אחרי', 'כאשר', 'האם'])
const stripNiqqud = (s: string): string => s.replace(/[֑-ׇ]/g, '')
const norm = (s: string): string => stripNiqqud(s).replace(/[״"'׳’"“”.,!?:;()\-–—…־]/g, ' ').replace(/\s+/g, ' ').trim()
const PREFIXES = /^[והבכלמש]+/
/* "ליבה" של מילה: בלי ניקוד ובלי אותיות שימוש מובילות (ה/ו/ב/כ/ל/מ/ש) כשנשאר שורש ≥3 אותיות */
function core(word: string): string {
  const w = norm(word)
  const stripped = w.replace(PREFIXES, '')
  return stripped.length >= 3 ? stripped : w
}

/* עוגנים: העובדות שהאתגר נשען עליהן ושהסצנה מספקת — מילות **התשובה הנכונה** (בחירה/השלמה/פענוח) וכל **מספר/שנה** שבאתגר —
   אך **רק** אם הן מופיעות בטקסט הסצנה המקורי. מילות השאלה וההסבר אינן עוגנים (אפשר לנסח אותן אחרת); מבחן סיכום
   (finalQuiz) לא מעוגן לסצנה אחת — מדלגים. חובה למנוע קיצור שמוחק את מה שהתלמיד צריך כדי לענות נכון. */
export function anchorsOf(scene: Scene): string[] {
  const p = scene.puzzle
  if (!p || p.type === 'finalQuiz') return []
  const original = norm(sceneDisplayText(scene))
  const originalCores = new Set(original.split(' ').map(core))
  const correct = (p.choices ?? []).filter((c) => c.isCorrect).map((c) => c.text)
  const answerSources: string[] = [...correct]
  if (p.answer) answerSources.push(p.answer)
  if (p.answers) answerSources.push(...p.answers)
  const numberSources: string[] = [...answerSources]
  if (p.question) numberSources.push(p.question)
  if (p.explanationCorrect) numberSources.push(p.explanationCorrect)
  if (p.sentence) numberSources.push(p.sentence)

  const out = new Set<string>()
  for (const src of answerSources) {
    for (const w of norm(src).split(' ')) {
      if (!w || STOP.has(w) || /\d/.test(w) || w.length < 4) continue
      const c = core(w)
      if (c.length >= 3 && !STOP.has(c) && originalCores.has(c)) out.add(c)
    }
  }
  for (const src of numberSources) {
    for (const w of norm(src).split(' ')) if (/\d/.test(w) && original.includes(w)) out.add(w)
  }
  return [...out].slice(0, 8)
}

export function missingAnchors(anchors: string[], text: string): string[] {
  const hay = norm(text)
  const hayCores = hay.split(' ').map(core)
  return anchors.filter((a) => !hay.includes(a) && !hayCores.some((c) => c.includes(a) || (c.length >= 3 && a.includes(c))))
}

/* ── קיצור ── */
export interface ShortenItem { id: string; narrative: string; drHoloDialog: string; mustKeep: string[]; words: number }
export interface ShortenResult { id: string; narrative: string; drHoloDialog: string }
/* form='preserve' נשאר לתאימות; הפנייה לתלמיד היא תמיד לשון רבים (STUDENT_ADDRESS_RULE) */
export type ShortenForm = FormOfAddress | 'preserve'
export type ShortenFn = (items: ShortenItem[], opts: { band: GradeBand; budget: number; form: ShortenForm }) => Promise<ShortenResult[]>

export function buildShortenPrompt(items: ShortenItem[], opts: { band: GradeBand; budget: number; form: ShortenForm }): string {
  const genderLine = 'פנייה לתלמידים בלשון רבים בלבד (אתם/בחרו) — בלי יחיד ובלי צורות עם לוכסן (בחר/י); דמויות מדברות כרגיל.'
  return `אתה מקצר טקסט של סצנות במשחק לימודי בעברית לתלמידים, כך שכל סצנה תיכנס במסך אחד בלי גלילה.
שכבת היעד: ${GRADE_BAND_LABEL[opts.band]}. **הגבלה: סך הטקסט של סצנה — "narrative" ו-"drHoloDialog" יחד — עד ${opts.budget} מילים.**
כללים:
• **אל תמחק עובדה שהאתגר נשען עליה.** לכל סצנה ניתנת רשימת "mustKeep" — מילים/שמות/מספרים שחייבים להישאר בטקסט המקוצר (אפשר בהטיה, אבל לא להשמיט את העובדה).
• משפטים קצרים, רעיון אחד, בלי הקדמות ובלי חזרות. אל תוסיף מידע חדש ואל תשנה משמעות.
• "drHoloDialog" = דברי ד"ר הולו: משפט אחד קצר. אם אין מקום — אפשר להחזיר "" (ריק), אבל **רק** אם כל ה-mustKeep נשארים ב-narrative.
• ${genderLine} עברית תקנית, יומיומית, התאמת מין ומספר מדויקת. אם הטקסט המקורי מנוקד — שמור על הניקוד.
• אל תשנה שמות דמויות, ואל תכניס טקסט בלועזית.
החזר JSON תקין בלבד: {"scenes":[{"id":"...","narrative":"...","drHoloDialog":"..."}]} — אותם id-ים בדיוק, כל הסצנות.

${JSON.stringify(items.map((i) => ({ id: i.id, narrative: i.narrative, drHoloDialog: i.drHoloDialog, mustKeep: i.mustKeep, currentWords: i.words })), null, 0)}`
}

/* מימוש ברירת מחדל: haiku (או Gemini לפי modelRouter, תפקיד phrasing) */
export const shortenWithLlm: ShortenFn = async (items, opts) => {
  const prompt = buildShortenPrompt(items, opts)
  const out = engineFor('phrasing') === 'gemini' ? await callGeminiText(prompt, 8000, true) : await callHaiku([{ role: 'user', content: prompt }], 6000)
  const parsed = extractJson(out) as { scenes?: unknown }
  const arr = Array.isArray(parsed?.scenes) ? (parsed.scenes as unknown[]) : []
  return arr
    .map((x) => x as Partial<ShortenResult>)
    .filter((x): x is ShortenResult => typeof x.id === 'string' && typeof x.narrative === 'string')
    .map((x) => ({ id: x.id, narrative: x.narrative.trim(), drHoloDialog: typeof x.drHoloDialog === 'string' ? x.drHoloDialog.trim() : '' }))
}

export interface ShortenVerdict { ok: boolean; reasons: string[]; narrative: string; drHoloDialog: string }
/* אימות דטרמיניסטי של טקסט מקוצר: נכנס במסך, קצר מהמקור, והעובדות נשמרו */
export function verifyShortened(scene: Scene, band: GradeBand, next: { narrative: string; drHoloDialog: string }): ShortenVerdict {
  const reasons: string[] = []
  const probe: Scene = { ...scene, narrative: next.narrative, drHoloDialog: next.drHoloDialog || undefined }
  const text = sceneDisplayText(probe)
  if (!next.narrative.trim()) reasons.push('נרטיב ריק')
  if (analyzeScene(probe, band).overflow) reasons.push('עדיין לא נכנס במסך')
  if (wordCount(text) >= wordCount(sceneDisplayText(scene))) reasons.push('לא קוצר')
  const lost = missingAnchors(anchorsOf(scene), text)
  if (lost.length) reasons.push(`אבדו עובדות: ${lost.join(', ')}`)
  return { ok: reasons.length === 0, reasons, narrative: next.narrative.trim(), drHoloDialog: next.drHoloDialog.trim() }
}

/* ── פיצול סצנה ליניארית לשתי סצנות ── */
export function canSplit(scene: Scene): boolean {
  return !scene.puzzle && !scene.collectableItem && !(scene.choices && scene.choices.length > 0) && !scene.requiresItemId && !scene.unlockText
}
export function trySplit(gd: GameData, scene: Scene, band: GradeBand): boolean {
  if (!canSplit(scene)) return false
  const text = sceneDisplayText(scene)
  const fits = (s: string) => fitsScreen(s, band, PRIMARY_SCREEN).fits
  const pages = paginate(text, fits)
  if (pages.length !== 2) return false
  /* מפצלים את הנרטיב בנקודה שבה הוא מסתיים בעמוד הראשון; ד״ר הולו נשאר בסצנה השנייה */
  const narrUnits = splitUnits(scene.narrative ?? '')
  let first = ''
  let used = 0
  for (const u of narrUnits) {
    const cand = first ? first + u.sep + u.text : u.text
    if (!fits(cand)) break
    first = cand
    used++
  }
  if (!first || used >= narrUnits.length) return false
  const restUnits = narrUnits.slice(used)
  const rest = restUnits.map((u, i) => (i === 0 ? u.text : u.sep + u.text)).join('')
  const second: Scene = {
    ...scene,
    id: `${scene.id}_b`,
    title: `${scene.title} — המשך`,
    narrative: rest,
    drHoloDialog: scene.drHoloDialog,
    imageUrl: undefined,
    nextSceneId: scene.nextSceneId,
  }
  if (gd.scenes.some((s) => s.id === second.id)) return false
  const firstScene: Scene = { ...scene, narrative: first, drHoloDialog: undefined, nextSceneId: second.id }
  if (analyzeScene(firstScene, band).overflow || analyzeScene(second, band).overflow) return false
  const idx = gd.scenes.findIndex((s) => s.id === scene.id)
  gd.scenes.splice(idx, 1, firstScene, second)
  return true
}

/* ── האכיפה ── */
export interface FitStats { scenes: number; overflow: number; shortened: number; split: number; flagged: number; questionFlags: number }

export async function enforceSceneFit(
  gd: GameData,
  opts: { level: number; form: FormOfAddress; shorten?: ShortenFn },
): Promise<FitStats> {
  const band = gradeBandOfLevel(opts.level)
  const budget = sceneWordBudget(band)
  const stats: FitStats = { scenes: gd.scenes.length, overflow: 0, shortened: 0, split: 0, flagged: 0, questionFlags: 0 }
  const initial = analyzeQuest(gd, band)
  stats.questionFlags = initial.scenes.filter((s) => s.questionOverflow || s.optionOverflow).length
  const over = initial.scenes.filter((s) => s.overflow).map((s) => s.sceneId)
  stats.overflow = over.length
  if (over.length === 0) { logFit(stats, band); return stats }

  const shorten = opts.shorten ?? shortenWithLlm
  const items: ShortenItem[] = over.map((id) => {
    const sc = gd.scenes.find((s) => s.id === id)!
    return { id, narrative: sc.narrative ?? '', drHoloDialog: sc.drHoloDialog ?? '', mustKeep: anchorsOf(sc), words: wordCount(sceneDisplayText(sc)) }
  })
  let results: ShortenResult[] = []
  try { results = await shorten(items, { band, budget, form: opts.form }) } catch (err) { logError('[fit] קריאת הקיצור נכשלה:', err instanceof Error ? err.message : err) }

  const stillOver: string[] = []
  for (const id of over) {
    const sc = gd.scenes.find((s) => s.id === id)!
    const r = results.find((x) => x.id === id)
    if (r) {
      const v = verifyShortened(sc, band, r)
      if (v.ok) { sc.narrative = v.narrative; sc.drHoloDialog = v.drHoloDialog || undefined; stats.shortened++; continue }
      debug('[fit] קיצור נדחה', id, v.reasons.join(' | '))
    }
    stillOver.push(id)
  }
  for (const id of stillOver) {
    const sc = gd.scenes.find((s) => s.id === id)!
    if (trySplit(gd, sc, band)) stats.split++
    else stats.flagged++
  }
  stats.scenes = gd.scenes.length
  logFit(stats, band)
  return stats
}

function logFit(s: FitStats, band: GradeBand): void {
  info(`[gen] אורך טקסט (${GRADE_BAND_LABEL[band]}): סצנות=${s.scenes} חורגות=${s.overflow} קוצרו=${s.shortened} פוצלו=${s.split} סומנו=${s.flagged} שאלה/אפשרויות-ארוכות=${s.questionFlags}`)
}
