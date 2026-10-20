/* ──────────────────────────────────────────────────────────────────────────
   analyzeRaw — הרכבה (assemble) + מנוע (analyze) משורות גולמיות של כיתה אחת. **טהור** (בלי DB) — נבדק ללא Supabase.
   · BH בתוך משפחה = (סוג ממצא × כיתה): analyze רץ פר כיתה.
   · baselines (קריאה / זיכרון): לא מוזרקים. המנוע גוזר אותם מנתוני הכיתה עצמה, ורק כשיש ≥ MIN_CELL_SIZE תורמים; בלי בסיס אין מועמד.
     (כיתה שכולה מדלגת לא תסומן — מגבלה ידועה עד שיהיה בסיס ברמת בית הספר.)
   · אחרי הניתוח world.data מרוקן במקום: התצוגה צורכת רק את התוצאות, והמטמון מחזיק עשרות ניתוחים.
   ────────────────────────────────────────────────────────────────────────── */
import { analyze } from '../engine.js'
import type { CatalogSnapshot } from '../catalog.js'
import { assembleWorldDetailed } from './assemble.js'
import type { LiveAnalysis } from './coverage.js'
import { emptyRaw, type RawClassData } from './rawTypes.js'

export function analyzeRaw(raw: RawClassData, now: Date, catalog: CatalogSnapshot, opts: { keepData?: boolean } = {}): LiveAnalysis {
  const { world, coverage, primaryClassOf } = assembleWorldDetailed(raw, now)
  coverage.catalogEmpty = catalog.concepts.length === 0 && catalog.misconceptions.length === 0
  const a = analyze(world, catalog)
  if (!opts.keepData) a.world.data.clear()
  return Object.assign(a, { coverage, primaryClassOf }) as LiveAnalysis
}

/* ניתוח ריק תקין (אין כיתות בהיקף): המנוע רץ על עולם בלי כיתות — לא זורק */
export function emptyAnalysis(now: Date, catalog: CatalogSnapshot, includeSynthetic = false): LiveAnalysis {
  return analyzeRaw(emptyRaw(includeSynthetic), now, catalog)
}
