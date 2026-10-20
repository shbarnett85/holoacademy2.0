/* ──────────────────────────────────────────────────────────────────────────
   liveProvider — ספק האנליטיקה על נתוני אמת: אותו createProvider של ההדגמה, עם מקור ה-DB (liveSource).
   החוזה והמסכים זהים; ההבדל היחיד הוא מאיפה מגיע הניתוח.
   ────────────────────────────────────────────────────────────────────────── */
import { liveSource } from './liveSource.js'
import { createProvider } from './providerCore.js'

export const liveProvider = createProvider(liveSource)
