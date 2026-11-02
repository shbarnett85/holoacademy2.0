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
