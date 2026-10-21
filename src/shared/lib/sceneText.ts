/* ──────────────────────────────────────────────────────────────────────────
   sceneText — כלל "אורך טקסט לתלמיד" (CLAUDE.md): הטקסט בסצנה כמעט אף פעם לא עובר את גובה המסך, בלי גלילה.
   pure (ללא DOM/Node): משמש את השרת (יצירה, בדיקה, קיצור), את עורך הסצנה ואת הספרייה.
   · שכבות (GradeBand) ← תקציב מילים לכל טקסט הסצנה (נגזר מהמדידה, ראו SCENE_WORD_BUDGET).
   · fitsScreen(text, grade, layout): מחשב גובה מוצג מוערך מרוחב התווים האמיתי של Heebo ומגיאומטריית תיבת הטקסט
     שנמדדה ב-Chrome (sceneTextMetrics.ts). מכויל מול מדידות דפדפן: סטייה מותרת עד שורה אחת (e2e/textfit/calibrate.ts).
   · הגופן **לעולם לא** מוקטן כדי להכניס טקסט; גודלו נקבע לפי השכבה בלבד (כיום זהה לכל השכבות).
   ────────────────────────────────────────────────────────────────────────── */
import { paginate } from './scenePages'
import {
  HEEBO_DEFAULT_WIDTH_1000, HEEBO_WIDTH_1000, REF_LAYOUTS, type RefScreenKey, type SceneLayout,
} from './sceneTextMetrics'

export type { RefScreenKey, SceneLayout } from './sceneTextMetrics'
export { REF_LAYOUTS } from './sceneTextMetrics'

/* ── שכבות ── */
export const GRADE_BANDS = ['g1_2', 'g3_4', 'g5_6', 'g7_9'] as const
export type GradeBand = (typeof GRADE_BANDS)[number]
export const GRADE_BAND_LABEL: Record<GradeBand, string> = { g1_2: 'א׳–ב׳', g3_4: 'ג׳–ד׳', g5_6: 'ה׳–ו׳', g7_9: 'ז׳–ט׳ ומעלה' }

/* רמת טקסט (1–20, כפי שנבחרת ביצירה — ראו narrativeStyleSpec) ← שכבת גיל.
   narrativeStyleSpec: ≤5 גן/א׳ · 6–7 ב׳–ג׳ · 8–10 ד׳–ו׳ · 11–13 חטיבה · 14+ תיכון. */
export function gradeBandOfLevel(level: number | null | undefined): GradeBand {
  const l = level == null || !Number.isFinite(Number(level)) ? 10 : Math.round(Number(level))
  if (l <= 6) return 'g1_2'
  if (l <= 8) return 'g3_4'
  if (l <= 10) return 'g5_6'
  return 'g7_9'
}
/* מספר שכבה (א׳=1 … יב׳=12) ← שכבת גיל */
export function gradeBandOfGrade(grade: number): GradeBand {
  return grade <= 2 ? 'g1_2' : grade <= 4 ? 'g3_4' : grade <= 6 ? 'g5_6' : 'g7_9'
}
/* שכבת ההדמיה: לפי רמת הטקסט שנשמרה בה; בהדמיות ישנות בלי רמה — לפי טווח השכבות של הספרייה; אחרת ה׳–ו׳ */
export function gradeBandOfQuest(q: { readingScale?: number | null; gradeMin?: number | null; gradeMax?: number | null }): GradeBand {
  if (q.readingScale != null && Number.isFinite(Number(q.readingScale))) return gradeBandOfLevel(q.readingScale)
  const lo = q.gradeMin ?? null
  const hi = q.gradeMax ?? null
  if (lo != null && hi != null) return gradeBandOfGrade(Math.round((lo + hi) / 2))
  if (lo != null) return gradeBandOfGrade(lo)
  return 'g5_6'
}

/* מקדם גודל גופן לשכבה. **כיום 1 לכולן**: הנגן משתמש בגודל אחד (text-lg ב-144% = 25.92px) לכל השכבות.
   כל שינוי עתידי של גודל לפי שכבה נקבע כאן בלבד (לעולם לא לפי אורך הטקסט) ומחייב מדידה מחדש. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- הפרמטר חלק מהחוזה: מקדם לפי שכבה, כיום קבוע
export function fontScaleForBand(_band: GradeBand): number { return 1 }

/* ── תקציבים ── */
/* תקרה עליונה (מילים לכל טקסט הסצנה יחד, כולל ד״ר הולו) — גם אם המדידה מאפשרת יותר */
export const SCENE_WORD_CAP: Record<GradeBand, number> = { g1_2: 30, g3_4: 45, g5_6: 60, g7_9: 75 }

/* ── תקציב מילים לכל שכבה — **נגזר מהמדידה** (e2e/textfit/budgets.ts), לא מהתקרה ──
   במסך הייחוס הראשי (viewport 1366×620) תיבת הטקסט מכילה 8 שורות של ~5.1 מילים: ב-≥95% מהסצנות נכנסים עד 29–31 מילים.
   תקציב = ⌊0.85 × N95⌋ (מרווח ביטחון ~15%), מוגבל בתקרה. התקרות (30/45/60/75) גבוהות מהקיבולת הפיזית במסך הזה —
   כדי להעלות תקציב צריך להגדיל את תיבת הטקסט או להגדיר גודל גופן לפי שכבה (ראו fontScaleForBand) ולמדוד מחדש. */
export const SCENE_WORD_BUDGET: Record<GradeBand, number> = { g1_2: 26, g3_4: 25, g5_6: 25, g7_9: 24 }
/* מתוך תקציב הסצנה: ד״ר הולו — משפט אחד קצר; השאר לנרטיב */
export const DIALOG_WORD_BUDGET = 10
/* שאלת האתגר ואפשרויות הבחירה (על הבמה): נמדד ב-e2e/textfit/sweep-mc.ts עם פריסת 2 עמודות במסכים נמוכים */
export const OPTION_WORD_BUDGET = 5
export const QUESTION_WORD_BUDGET = { upTo4Options: 16, fiveOrSixOptions: 8 } as const
export function questionWordBudget(optionCount: number): number {
  return optionCount >= 5 ? QUESTION_WORD_BUDGET.fiveOrSixOptions : QUESTION_WORD_BUDGET.upTo4Options
}
export function sceneWordBudget(grade: GradeBand | number | null | undefined): number {
  const band = typeof grade === 'number' ? gradeBandOfLevel(grade) : grade ?? 'g5_6'
  return Math.min(SCENE_WORD_CAP[band], SCENE_WORD_BUDGET[band])
}

/* מסך הייחוס הראשי: מחשב נייד בית ספרי, viewport ≈ 1366×620 */
export const PRIMARY_SCREEN: RefScreenKey = 'laptop-620'

/* ── טקסט כפי שמוצג בפאנל (מקור יחיד: הנגן והבדיקות) ── */
export function sceneDisplayText(scene: { narrative?: string | null; drHoloDialog?: string | null }): string {
  return [scene.narrative?.trim() || null, scene.drHoloDialog?.trim() ? `ד״ר הולו אומר: "${scene.drHoloDialog.trim()}"` : null].filter(Boolean).join('\n\n')
}

export function wordCount(text: string | null | undefined): number {
  return text ? text.trim().split(/\s+/).filter(Boolean).length : 0
}

/* ── הערכת שורות: שבירת שורות גרידית לפי רוחב תווים אמיתי ── */
const COMBINING = /[֑-ׇ]/
function charUnits(ch: string): number {
  const w = HEEBO_WIDTH_1000[ch]
  if (w !== undefined) return w
  if (COMBINING.test(ch)) return 0
  return HEEBO_DEFAULT_WIDTH_1000
}
function widthUnits(s: string): number { let u = 0; for (const ch of s) u += charUnits(ch); return u }
/* הזדמנויות שבירה בתוך מילה: אחרי מקף / מקף עברי / רב-קו */
const BREAK_AFTER = /(?<=[-־–—])/

/* מספר השורות שטקסט תופס ברוחב נתון (white-space: pre-line). פסקה ריקה = שורה ריקה. */
export function measureLines(text: string, widthPx: number, fontPx: number): number {
  const scale = fontPx / 1000
  const space = charUnits(' ') * scale
  let lines = 0
  for (const para of text.split('\n')) {
    const words = para.split(/[ \t]+/).filter(Boolean)
    if (words.length === 0) { lines += 1; continue }
    let cur = 0
    let used = 1
    let first = true
    for (const word of words) {
      const segs = word.split(BREAK_AFTER).filter(Boolean)
      segs.forEach((seg, i) => {
        const sw = widthUnits(seg) * scale
        const gap = i === 0 && !first ? space : 0
        if (first) {
          first = false
          cur = sw
        } else if (cur + gap + sw <= widthPx + 0.01) {
          cur += gap + sw
          return
        } else { used += 1; cur = sw }
        if (cur > widthPx) { /* מילה ארוכה מהשורה — נשברת בכוח */
          const extra = Math.floor((cur - 0.01) / widthPx)
          used += extra
          cur -= extra * widthPx
        }
      })
    }
    lines += used
  }
  return lines
}

export interface FitResult {
  fits: boolean
  lines: number
  /* כמה שורות נכנסות בתיבה (לפי גובה מוצג) */
  maxLines: number
  heightPx: number
  maxHeightPx: number
  /* כמה עמודים הטקסט יתפוס בתצוגה (1 = נכנס במלואו) */
  pages: number
  words: number
}

const SAFETY_PX = 2
function resolveLayout(layout: RefScreenKey | SceneLayout): SceneLayout { return typeof layout === 'string' ? REF_LAYOUTS[layout] : layout }
/* actionRows: מספר שורות הכפתורים השמורות באזור הפעולות (1 כברירת מחדל; אתגר+איסוף = 2) */
function boxFor(layout: SceneLayout, band: GradeBand, actionRows: number) {
  const fontPx = layout.fontPx * fontScaleForBand(band)
  const linePx = layout.linePx * fontScaleForBand(band)
  const maxHeightPx = layout.textHeightPx - SAFETY_PX - Math.max(0, actionRows - 1) * layout.actionRowPx
  return { fontPx, linePx, widthPx: layout.textWidthPx, maxHeightPx }
}

/* האם הטקסט נכנס במלואו בתיבת הטקסט (בלי גלילה ובלי עמוד נוסף) ב-layout הנתון */
export function fitsScreen(text: string, grade: GradeBand | number, layout: RefScreenKey | SceneLayout = PRIMARY_SCREEN, opts: { actionRows?: number } = {}): FitResult {
  const band = typeof grade === 'number' ? gradeBandOfLevel(grade) : grade
  const lay = resolveLayout(layout)
  const box = boxFor(lay, band, opts.actionRows ?? 1)
  const lines = measureLines(text, box.widthPx, box.fontPx)
  const heightPx = lines * box.linePx
  const fits = heightPx <= box.maxHeightPx
  const maxLines = Math.max(0, Math.floor(box.maxHeightPx / box.linePx))
  const pages = fits ? 1 : paginate(text, (s) => measureLines(s, box.widthPx, box.fontPx) * box.linePx <= box.maxHeightPx).length
  return { fits, lines, maxLines, heightPx, maxHeightPx: box.maxHeightPx, pages, words: wordCount(text) }
}
