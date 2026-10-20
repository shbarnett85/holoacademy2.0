/* ──────────────────────────────────────────────────────────────────────────
   liveSource — מקור הנתונים האמיתי של ספק האנליטיקה (מממש AnalyticsSource; createProvider(liveSource) בונה ממנו ספק).
   · היקף הצופה: מורה = כיתות ה-grants שלו (כולל כיתות בלי נתונים); מנהל = כל כיתות בית הספר שלו. כל כיתה = ניתוח נפרד במטמון
     (analysisCache), ומיזוג (analysisMerge) כשיש יותר מאחת. ההרשאה לפי כיתה/מקצוע נאכפת בספק (access.ts), לא כאן.
   · includeSynthetic: רק לצופה בארגון הדגמה (V2Viewer.seesSynthetic, אם הוגדר); אחרת false — נתוני הדגמה לעולם לא נמזגים לנתוני אמת.
   · אסור שיזרוק על נתונים ריקים: בלי כיתות בהיקף ← ניתוח ריק תקין.
   · אין כאן רישום ביומן הגישה (logNamed) — הנתיב רושם (W4).
   ────────────────────────────────────────────────────────────────────────── */
import { SUBJECTS, type SubjectCode } from '../../../../src/shared/lib/subjects.js'
import { grantsOf, scopeClassIds, type V2Viewer } from './access.js'
import { AnalysisCache, getCatalog, getClassAnalysis } from './analysisCache.js'
import { mergeAnalyses } from './analysisMerge.js'
import type { Analysis } from './engine.js'
import { orderSubjects } from './realWorld/assemble.js'
import type { LiveAnalysis, LiveCoverage } from './realWorld/coverage.js'
import { fetchSchoolClassIds } from './realWorld/fetchRaw.js'
import { emptyAnalysis } from './realWorld/analyzeRaw.js'
import type { AnalyticsSource } from './source.js'

/* צופה בארגון הדגמה (V2Viewer.seesSynthetic); חסר ← false */
export const includeSyntheticOf = (v: V2Viewer): boolean => v.seesSynthetic === true

/* כיתות המורה לפי ה-grants של access.ts (כולל שיוך בלי מקצוע — הספק מחליט מה נראה), בסדר מיון יציב (מפתח מטמון / מיזוג) */
export const grantClassIds = (v: V2Viewer): string[] => [...new Set(scopeClassIds(v))].sort()

/* כיתות בית הספר של מנהל — מטמון קצר (single-flight) כדי שרענון הדף לא ישאל את ה-DB בכל פעם */
const schoolClasses = new AnalysisCache<string[]>({ ttlMs: 60_000, staleMs: 5 * 60_000, maxEntries: 50, concurrency: 4 })
const schoolClassIds = (schoolId: string, include: boolean): Promise<string[]> =>
  schoolClasses.get(`${schoolId}|${include ? 'syn' : 'real'}`, () => fetchSchoolClassIds(schoolId, include))

/* מיזוג ניתוחים: ממוזכר לפי זהות החלקים, כך שאותה קבוצת כיתות במטמון לא ממוזגת מחדש בכל בקשה */
const MERGE_MEMO_MAX = 20
const mergeMemo = new Map<string, { parts: LiveAnalysis[]; merged: LiveAnalysis }>()
function mergedOf(key: string, parts: LiveAnalysis[]): LiveAnalysis {
  const hit = mergeMemo.get(key)
  if (hit && hit.parts.length === parts.length && hit.parts.every((p, i) => p === parts[i])) {
    mergeMemo.delete(key)
    mergeMemo.set(key, hit)
    return hit.merged
  }
  const merged = mergeAnalyses(parts)
  mergeMemo.delete(key)
  mergeMemo.set(key, { parts, merged })
  while (mergeMemo.size > MERGE_MEMO_MAX) mergeMemo.delete(mergeMemo.keys().next().value as string)
  return merged
}
export function resetLiveSourceCaches(): void { schoolClasses.clear(); mergeMemo.clear() }

/* המקצועות שהצופה רשאי לראות לפי ה-grants (איחוד); מחנך טהור — ריק (רואה הכול, והרשימה נגזרת מהכיתה) */
function viewerSubjects(v: V2Viewer): SubjectCode[] {
  const known = new Set<string>(SUBJECTS.map((s) => s.code))
  return orderSubjects(grantsOf(v).flatMap((g) => g.subjects).filter((c) => known.has(c)))
}

export const liveSource: AnalyticsSource = {
  kind: 'live',

  async analysis(v: V2Viewer, now?: Date): Promise<Analysis> {
    const include = includeSyntheticOf(v)
    const ids = v.lens === 'admin' ? (v.schoolId ? await schoolClassIds(v.schoolId, include) : []) : grantClassIds(v)
    if (ids.length === 0) return emptyAnalysis(now ?? new Date(), await getCatalog(), include)
    const parts = await Promise.all(ids.map((id) => getClassAnalysis(id, include, now)))
    return parts.length === 1 ? parts[0] : mergedOf(`${include ? 'syn' : 'real'}|${ids.join(',')}`, parts)
  },

  classIds(v: V2Viewer, a: Analysis): string[] {
    if (v.lens === 'admin') return [...a.classById.keys()].sort()
    return grantClassIds(v).filter((id) => a.classById.has(id))
  },

  classSubjects(a: Analysis, classId: string): SubjectCode[] {
    return a.classById.get(classId)?.subjects ?? []
  },

  configParts(v: V2Viewer) {
    return { availableLenses: [v.lens], subjects: viewerSubjects(v), dataNotice: null, curriculumNotice: null }
  },

  coverage(_v: V2Viewer, a: Analysis) {
    const c = a.coverage as LiveCoverage | undefined
    return { unclassifiedSessions: c?.unclassifiedSessions ?? 0, detailAvailableFrom: c?.detailAvailableFrom ?? null }
  },
}
