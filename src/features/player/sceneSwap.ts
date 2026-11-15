/* איזה מעבר מקבלת תמונת סצנה, ובכמה זמן. פונקציות טהורות (נבדקות ב-sceneSwap.test.ts); הרינדור ב-SceneImageStage. */
import type { EffectLevel } from '../../shared/lib/gemModel'

export type SceneSwapKind = 'cut' | 'fade' | 'scan'

export function planSceneSwap(o: { wormhole: boolean; reduced: boolean; level: EffectLevel; sameImage: boolean }): SceneSwapKind {
  /* חור-התולעת מכסה את המסך, תנועה מופחתת אוסרת תנועה, ואותה תמונה בשתי סצנות לא צריכה מעבר */
  if (o.wormhole || o.reduced || o.sameImage) return 'cut'
  return o.level === 'gentle' ? 'fade' : 'scan'
}

const MS: Readonly<Record<EffectLevel, number>> = { gentle: 320, medium: 760, full: 860 }
export const sceneSwapMs = (level: EffectLevel): number => MS[level]

/* ── דפדוף בין עמודים: עמודת הטקסט ──────────────────────────────────────────
   מעבר קצר, כ-250ms: הטקסט של העמוד היוצא מחליק החוצה ונמוג, ואז הטקסט של העמוד החדש מחליק פנימה.
   התמונה מתחלפת במעבר שלה, בתוך העמודה שלה (planSceneSwap), והטקסט לא מחכה לה.
   בלי קיפול נייר, בלי מרקם ובלי פינות. תנועה מופחתת: החלפה מיידית. עוצמה עדינה: דהייה בלי תזוזה. */
export const PAGE_TEXT_OUT_MS = 110
export const PAGE_TEXT_IN_MS = 140
export const PAGE_TURN_MS = PAGE_TEXT_OUT_MS + PAGE_TEXT_IN_MS

export type PageTurnKind = 'none' | 'fade' | 'slide'
export function planPageTurn(o: { wormhole: boolean; reduced: boolean; level: EffectLevel }): PageTurnKind {
  /* חור-התולעת מכסה את המסך, ותנועה מופחתת אוסרת תנועה */
  if (o.wormhole || o.reduced) return 'none'
  return o.level === 'gentle' ? 'fade' : 'slide'
}
/* מתי הטקסט החדש נכנס: אחרי שהיוצא יצא. בלי מעבר: מיד */
export const pageTextDelayMs = (kind: PageTurnKind): number => (kind === 'none' ? 0 : PAGE_TEXT_OUT_MS)
