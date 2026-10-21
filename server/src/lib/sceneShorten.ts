/* ──────────────────────────────────────────────────────────────────────────
   sceneShorten — הצעת קיצור לסצנה אחת בעורך (כלל "אורך טקסט לתלמיד", סעיף 5): אותה בקשת קיצור ואותן בדיקות
   כמו ביצירה — אימות דטרמיניסטי (נכנס במסך + העובדות נשמרו), בטיחות, דקדוק/ניסוח ובדיקת עובדות.
   **לא שומר**: מחזיר לפני/אחרי לאישור המורה; השמירה עוברת בנתיב עריכת הסצנה הרגיל.
   ────────────────────────────────────────────────────────────────────────── */
import { gradeBandOfLevel, sceneDisplayText, sceneWordBudget, wordCount } from '../../../src/shared/lib/sceneText.js'
import type { GameData } from './questSchemas.js'
import { lintDetachedClitics, lintHighRegister, lintKnownErrors, lintRepetition } from './questSchemas.js'
import { runOutputSafetyCheck } from './contentSafety.js'
import { runFactCheck } from './factCheck.js'
import { lintStudentAddress } from './studentAddress.js'
import { analyzeScene, anchorsOf, shortenWithLlm, verifyShortened, type ShortenFn } from './sceneFit.js'

type Scene = GameData['scenes'][number]

export interface ShortenSide { narrative: string; drHoloDialog: string; words: number; pages: number }
export interface ShortenProposal {
  /* false = הסצנה כבר נכנסת במסך אחד — אין מה לקצר */
  needed: boolean
  ok: boolean
  reasons: string[]
  before?: ShortenSide
  after?: ShortenSide
  checks?: { grammar: string[]; facts: string[] }
}

export async function proposeSceneShortening(scene: Scene, opts: { level: number; shorten?: ShortenFn }): Promise<ShortenProposal> {
  const band = gradeBandOfLevel(opts.level)
  const beforeInfo = analyzeScene(scene, band)
  const before: ShortenSide = { narrative: scene.narrative ?? '', drHoloDialog: scene.drHoloDialog ?? '', words: beforeInfo.words, pages: beforeInfo.pages }
  if (!beforeInfo.overflow) return { needed: false, ok: true, reasons: [], before }

  const shorten = opts.shorten ?? shortenWithLlm
  let result
  try {
    const out = await shorten(
      [{ id: scene.id, narrative: before.narrative, drHoloDialog: before.drHoloDialog, mustKeep: anchorsOf(scene), words: before.words }],
      { band, budget: sceneWordBudget(band), form: 'preserve' },
    )
    result = out.find((x) => x.id === scene.id)
  } catch {
    return { needed: true, ok: false, reasons: ['שירות הקיצור לא זמין כרגע — נסו שוב בעוד רגע'], before }
  }
  if (!result) return { needed: true, ok: false, reasons: ['לא התקבלה הצעת קיצור'], before }

  let verdict = verifyShortened(scene, band, result)
  /* סצנות ארוכות מאוד (≈100 מילים → תקציב ≈25) לא תמיד נכנסות בקיצור הראשון (נמדד: 11 מ-24 נדחו על "עדיין לא נכנס").
     ניסיון שני, פעם אחת בלבד: מקצרים את הקיצור הראשון בתקציב קשיח יותר; העובדות עדיין נבדקות מול הסצנה המקורית. */
  if (!verdict.ok && verdict.narrative && verdict.reasons.some((r) => r.startsWith('עדיין לא נכנס')) && !verdict.reasons.some((r) => r.startsWith('אבדו עובדות'))) {
    try {
      const second = await shorten(
        [{ id: scene.id, narrative: verdict.narrative, drHoloDialog: verdict.drHoloDialog, mustKeep: anchorsOf(scene), words: wordCount(sceneDisplayText({ narrative: verdict.narrative, drHoloDialog: verdict.drHoloDialog })) }],
        { band, budget: Math.max(12, Math.floor(sceneWordBudget(band) * 0.7)), form: 'preserve' },
      )
      const r2 = second.find((x) => x.id === scene.id)
      if (r2) verdict = verifyShortened(scene, band, r2)
    } catch { /* נשארים עם הפסילה של הניסיון הראשון */ }
  }
  if (!verdict.ok) return { needed: true, ok: false, reasons: verdict.reasons, before }

  const probe: Scene = { ...scene, narrative: verdict.narrative, drHoloDialog: verdict.drHoloDialog || undefined }
  const afterInfo = analyzeScene(probe, band)
  const tmp = { scenes: [{ ...probe, nextSceneId: null }], entrySceneId: probe.id } as unknown as GameData

  /* בטיחות — חוסמת (כמו ביצירה): הצעה שנחסמת לא מוצגת */
  const safety = await runOutputSafetyCheck(tmp).catch(() => ({ blocked: true, technical: true }) as { blocked: boolean; technical?: boolean })
  if (safety.blocked) return { needed: true, ok: false, reasons: ['לא ניתן להציע קיצור לטקסט הזה'], before }

  const grammar = [...lintDetachedClitics(tmp), ...lintHighRegister(tmp, opts.level), ...lintKnownErrors(tmp), ...lintRepetition(tmp), ...lintStudentAddress(tmp)].map((x) => x.problem)
  const facts = await runFactCheck(tmp).then((r) => r.errors.map((e) => e.problem)).catch(() => [] as string[])

  return {
    needed: true,
    ok: true,
    reasons: [],
    before,
    after: { narrative: verdict.narrative, drHoloDialog: verdict.drHoloDialog, words: wordCount(sceneDisplayText(probe)), pages: afterInfo.pages },
    checks: { grammar, facts },
  }
}
