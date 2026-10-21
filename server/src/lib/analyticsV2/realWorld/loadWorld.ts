/* ──────────────────────────────────────────────────────────────────────────
   loadWorld — טעינה (fetchRaw) + ניתוח (analyzeRaw) של כיתה אחת. **ללא מטמון** (המטמון ב-analysisCache).
   ────────────────────────────────────────────────────────────────────────── */
import type { CatalogSnapshot } from '../catalog.js'
import { analyzeRaw } from './analyzeRaw.js'
import { AnalysisDataError } from './buildErrors.js'
import type { LiveAnalysis } from './coverage.js'
import { fetchClassRaw } from './fetchRaw.js'

/* כשל בטעינה (fetchClassRaw) = תשתית; כשל בהרכבה / במנוע על הנתונים שנטענו = שגיאת נתונים (AnalysisDataError) */
export async function buildClassAnalysis(classId: string, includeSynthetic: boolean, now: Date, catalog: CatalogSnapshot): Promise<LiveAnalysis> {
  const raw = await fetchClassRaw(classId, includeSynthetic, now)
  try {
    return analyzeRaw(raw, now, catalog)
  } catch (err) {
    throw new AnalysisDataError(classId, err instanceof Error ? err.message : String(err))
  }
}
