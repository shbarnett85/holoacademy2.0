/* ──────────────────────────────────────────────────────────────────────────
   liveSource — מקור הנתונים האמיתי של ספק האנליטיקה (מממש AnalyticsSource; createProvider(liveSource) בונה ממנו ספק).
   · היקף הצופה: מורה = כיתות ה-grants שלו (כולל כיתות בלי נתונים); מנהל = כל כיתות בית הספר שלו. כל כיתה = ניתוח נפרד במטמון
     (analysisCache), ומיזוג (analysisMerge) כשיש יותר מאחת. ההרשאה לפי כיתה/מקצוע נאכפת בספק (access.ts), לא כאן.
   · includeSynthetic: רק לצופה בארגון הדגמה (V2Viewer.seesSynthetic, אם הוגדר); אחרת false — נתוני הדגמה לעולם לא נמזגים לנתוני אמת.
   · אסור שיזרוק על נתונים ריקים: בלי כיתות בהיקף ← ניתוח ריק תקין.
   · כיתה שנכשלה לא מפילה את כל הבקשה: הטעינה פר כיתה (allSettled), הניתוח חלקי, וההערה "לא הצלחנו לטעון כיתה" מגיעה במילים דרך coverage
     (classesNotLoaded = נכשלה בתשתית — חולף, classesDataError = נכשלה על הנתונים של הכיתה — לא יעבור בניסיון חוזר, classesLoading = עדיין נבנית ברקע). 503 רק כשאף כיתה לא נטענה — 'warming' (נבנית) גובר על כשל אחר, כדי שהמורה יידע שמספיק לרענן.
   · אין כאן רישום ביומן הגישה (logNamed) — הנתיב רושם (W4).
   ────────────────────────────────────────────────────────────────────────── */
import { SUBJECTS, type SubjectCode } from '../../../../src/shared/lib/subjects.js'
import { grantsOf, scopeClassIds, type V2Viewer } from './access.js'
import { AnalysisBuildError, AnalysisCache, getCatalog, getClassAnalysis } from './analysisCache.js'
import { mergeAnalyses } from './analysisMerge.js'
import type { Analysis } from './engine.js'
import { orderSubjects } from './realWorld/assemble.js'
import type { LiveAnalysis, LiveCoverage } from './realWorld/coverage.js'
import { fetchSchoolClassIds } from './realWorld/fetchRaw.js'
import { emptyAnalysis } from './realWorld/analyzeRaw.js'
import type { AnalyticsSource, ScopedGap, SourceCoverage } from './source.js'
import { AppError } from '../../middleware/errors.js'

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

/* אם אף כיתה לא נטענה: איזו שגיאה מוחזרת. 'בנייה בעיצומה' (warming) גוברת על כל כשל אחר; אחרת שגיאת 503 קיימת (למשל בדיקת סכמה); אחרת הראשונה */
function worstOf(reasons: unknown[]): AppError {
  const warming = reasons.find((r): r is AnalysisBuildError => r instanceof AnalysisBuildError && r.kind === 'warming')
  if (warming) return warming
  const known = reasons.find((r): r is AppError => r instanceof AppError)
  return known ?? new AnalysisBuildError('unavailable')
}

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
    const settled = await Promise.allSettled(ids.map((id) => getClassAnalysis(id, include, now)))
    const parts: LiveAnalysis[] = []
    const loadedIds: string[] = []
    const reasons: unknown[] = []
    let loading = 0, dataErrors = 0
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') { parts.push(r.value); loadedIds.push(ids[i]); return }
      reasons.push(r.reason)
      if (r.reason instanceof AnalysisBuildError && r.reason.kind === 'warming') loading++
      else if (r.reason instanceof AnalysisBuildError && r.reason.kind === 'data') dataErrors++
    })
    if (parts.length === 0) throw worstOf(reasons)
    const merged = parts.length === 1 ? parts[0] : mergedOf(`${include ? 'syn' : 'real'}|${loadedIds.join(',')}`, parts)
    if (reasons.length === 0) return merged
    /* ניתוח חלקי: עותק רדוד עם ההערה (הניתוח במטמון לא משתנה) */
    const notLoaded = reasons.length - loading - dataErrors
    const partial: LiveAnalysis = {
      ...merged, coverage: { ...merged.coverage, classesNotLoaded: notLoaded || undefined, classesLoading: loading || undefined, classesDataError: dataErrors || undefined },
    }
    return partial
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

  coverage(_v: V2Viewer, a: Analysis): SourceCoverage {
    const c = a.coverage as LiveCoverage | undefined
    /* משחקים שהרמה שלהם לא נכנסת לסדרות: אין רמה בכלל, או שחושבה לא לפי מקצוע ההדמיה (FX1a) */
    const playsWithoutLevel = (c?.sessionsWithoutLevel ?? 0) + (c?.sessionsWithoutSubjectLevel ?? 0)
    /* שדות הפער מופיעים רק כשהם גדולים מאפס — כך תגובת "הכול תקין" זהה למה שהייתה */
    return {
      unclassifiedSessions: c?.unclassifiedSessions ?? 0, detailAvailableFrom: c?.detailAvailableFrom ?? null,
      ...(c?.classesWithoutGrade ? { ungradedClasses: c.classesWithoutGrade } : {}),
      ...(c?.classesWithoutGradeNames?.length ? { ungradedClassNames: [...c.classesWithoutGradeNames] } : {}),
      ...(c?.classesNotLoaded ? { classesNotLoaded: c.classesNotLoaded } : {}),
      ...(c?.classesLoading ? { classesLoading: c.classesLoading } : {}),
      ...(c?.classesDataError ? { classesDataError: c.classesDataError } : {}),
      ...(playsWithoutLevel ? { playsWithoutLevel } : {}),
      ...(c?.catalogEmpty ? { catalogEmpty: true } : {}),
    }
  },

  /* משחקים שלא נכללו אצל התלמידים הנתונים (סכום חברי כיתה / תלמיד/ה בודד): לכל תלמיד/ה משחק נספר פעם אחת, ולכן הסכום אינו כופל */
  scopedGap(_v: V2Viewer, a: Analysis, studentIds: readonly string[]): ScopedGap {
    const c = a.coverage as LiveCoverage | undefined
    let unclassified = 0, withoutLevel = 0
    for (const id of studentIds) {
      unclassified += c?.unclassifiedByStudent?.[id] ?? 0
      withoutLevel += c?.unleveledByStudent?.[id] ?? 0
    }
    return { unclassified, withoutLevel }
  },
}
