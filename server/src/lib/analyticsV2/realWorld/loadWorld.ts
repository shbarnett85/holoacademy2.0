/* ──────────────────────────────────────────────────────────────────────────
   loadWorld — טעינה (fetchRaw) + ניתוח (analyzeRaw) של כיתה אחת. **ללא מטמון** (המטמון ב-analysisCache).
   ────────────────────────────────────────────────────────────────────────── */
import type { CatalogSnapshot } from '../catalog.js'
import { analyzeRaw } from './analyzeRaw.js'
import type { LiveAnalysis } from './coverage.js'
import { fetchClassRaw } from './fetchRaw.js'

export async function buildClassAnalysis(classId: string, includeSynthetic: boolean, now: Date, catalog: CatalogSnapshot): Promise<LiveAnalysis> {
  const raw = await fetchClassRaw(classId, includeSynthetic, now)
  return analyzeRaw(raw, now, catalog)
}
