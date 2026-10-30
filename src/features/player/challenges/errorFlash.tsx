/* משוב על טעות, אחיד לכל סוגי האתגרים: נדנוד רך וצליל עמום (CLAUDE.md "תחושת משחק: כללים", כלל 2).
   בלי הבזק אדום ובלי צליל של זמזם. האתגרים קוראים לזה מכל מקום שיורדת בו פסילה. */
import { feelWrong } from '../gameFeel/engine'

export function triggerErrorFlash(el?: Element | null) {
  if (typeof window === 'undefined') return
  feelWrong(el)
}
