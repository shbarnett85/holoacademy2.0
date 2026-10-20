/* ──────────────────────────────────────────────────────────────────────────
   analysisCache — מטמון ניתוחים בזיכרון (יחידת-כיתה) לספק החי.
   · single-flight: כמה בקשות לאותו מפתח בו-זמנית ← בנייה אחת.
   · טרי (ttl) ← מוחזר מיד. ישן אך בתוך staleMs ← מוחזר מיד ומתרענן ברקע (stale-while-revalidate). אחרת ← בנייה חוסמת.
   · LRU (maxEntries). מקביליות בנייה מוגבלת (concurrency) — כל בנייה היא עשרות קריאות DB.
   · תקרת זמן בנייה: הקורא מקבל 503 מובחן ("מרכזים את התוצאות") אך הבנייה ממשיכה ברקע וממלאת את המטמון — הניסיון הבא פוגע.
   · כשל בנייה: מוחזר הערך הישן אם יש; אחרת 503 מובחן (שגיאת 503 קיימת, למשל בדיקת סכמה, עוברת כמות שהיא).
   · מפתח הכיתה כולל includeSynthetic (נתוני הדגמה לעולם לא נמזגים לנתוני אמת).
   · אין invalidation חוצה-תהליכים (כמו שאר המטמונים בשרת); ה-TTL הקצר הוא הרענון.
   ────────────────────────────────────────────────────────────────────────── */
import { ERR_ANALYSIS_UNAVAILABLE, ERR_ANALYSIS_WARMING } from '../../../../src/shared/lib/findingsNarrative.js'
import { AppError } from '../../middleware/errors.js'
import { warn } from '../log.js'
import type { CatalogSnapshot } from './catalog.js'
import type { LiveAnalysis } from './realWorld/coverage.js'
import { buildCatalog } from './realWorld/catalog.js'
import { fetchCatalogRows } from './realWorld/fetchRaw.js'
import { buildClassAnalysis } from './realWorld/loadWorld.js'

export interface AnalysisCacheOptions {
  /* עד גיל זה הערך טרי */
  ttlMs: number
  /* עד גיל זה אפשר להחזיר ערך ישן ולרענן ברקע (≥ ttlMs) */
  staleMs: number
  maxEntries: number
  /* כמה בניות רצות במקביל */
  concurrency: number
  /* כמה זמן קורא ממתין לבנייה חוסמת לפני 503 */
  buildTimeoutMs: number
  now: () => number
}

export const DEFAULT_CACHE_OPTIONS: AnalysisCacheOptions = {
  ttlMs: 5 * 60_000, staleMs: 60 * 60_000, maxEntries: 200, concurrency: 2, buildTimeoutMs: 25_000, now: () => Date.now(),
}

/* 503 מובחן: warming = הבנייה ממשיכה ברקע ("נסו שוב בעוד דקה"); unavailable = הבנייה נכשלה */
export class AnalysisBuildError extends AppError {
  constructor(public kind: 'warming' | 'unavailable') {
    super(503, kind === 'warming' ? ERR_ANALYSIS_WARMING : ERR_ANALYSIS_UNAVAILABLE, kind === 'warming' ? 'ANALYSIS_WARMING' : 'ANALYSIS_UNAVAILABLE')
    this.name = 'AnalysisBuildError'
  }
}

class BuildTimeout extends Error {}
interface Entry<T> { value: T; builtAt: number }

export class AnalysisCache<T> {
  readonly opts: AnalysisCacheOptions
  private entries = new Map<string, Entry<T>>()
  private inflight = new Map<string, Promise<Entry<T>>>()
  private waiting: (() => void)[] = []
  private running = 0

  constructor(opts: Partial<AnalysisCacheOptions> = {}) {
    this.opts = { ...DEFAULT_CACHE_OPTIONS, ...opts }
    if (this.opts.staleMs < this.opts.ttlMs) this.opts.staleMs = this.opts.ttlMs
    this.opts.concurrency = Math.max(1, Math.floor(this.opts.concurrency))
    this.opts.maxEntries = Math.max(1, Math.floor(this.opts.maxEntries))
  }

  get size(): number { return this.entries.size }
  get inflightCount(): number { return this.inflight.size }
  has(key: string): boolean { return this.entries.has(key) }
  peek(key: string): T | undefined { return this.entries.get(key)?.value }
  clear(): void { this.entries.clear() }
  invalidate(key: string): void { this.entries.delete(key) }

  async get(key: string, build: () => Promise<T>): Promise<T> {
    const e = this.entries.get(key)
    if (e) {
      const age = this.opts.now() - e.builtAt
      if (age < this.opts.ttlMs) { this.touch(key, e); return e.value }
      if (age < this.opts.staleMs) {
        this.touch(key, e)
        this.start(key, build).catch((err) => warn('[analysisCache] background refresh failed:', key, err instanceof Error ? err.message : err))
        return e.value
      }
    }
    try {
      return (await this.withTimeout(this.start(key, build))).value
    } catch (err) {
      if (e) {
        warn('[analysisCache] build failed, serving stale entry:', key, err instanceof Error ? err.message : err)
        return e.value
      }
      if (err instanceof BuildTimeout) throw new AnalysisBuildError('warming')
      if (err instanceof AppError && err.status === 503) throw err
      warn('[analysisCache] build failed:', key, err instanceof Error ? err.message : err)
      throw new AnalysisBuildError('unavailable')
    }
  }

  /* בנייה אחת לכל מפתח (single-flight); ממשיכה גם אם הקורא ויתר על ההמתנה */
  private start(key: string, build: () => Promise<T>): Promise<Entry<T>> {
    const cur = this.inflight.get(key)
    if (cur) return cur
    const p = (async (): Promise<Entry<T>> => {
      const release = await this.acquire()
      try {
        const entry: Entry<T> = { value: await build(), builtAt: this.opts.now() }
        this.entries.delete(key)
        this.entries.set(key, entry)
        while (this.entries.size > this.opts.maxEntries) this.entries.delete(this.entries.keys().next().value as string)
        return entry
      } finally {
        release()
      }
    })()
    this.inflight.set(key, p)
    const done = (): void => { if (this.inflight.get(key) === p) this.inflight.delete(key) }
    p.then(done, done)
    return p
  }

  private touch(key: string, e: Entry<T>): void {
    this.entries.delete(key)
    this.entries.set(key, e)
  }

  private acquire(): Promise<() => void> {
    const release = (): void => {
      this.running--
      this.waiting.shift()?.()
    }
    if (this.running < this.opts.concurrency) { this.running++; return Promise.resolve(release) }
    return new Promise((resolve) => { this.waiting.push(() => { this.running++; resolve(release) }) })
  }

  private withTimeout(p: Promise<Entry<T>>): Promise<Entry<T>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new BuildTimeout()), this.opts.buildTimeoutMs)
      timer.unref?.()
      p.then((v) => { clearTimeout(timer); resolve(v) }, (err) => { clearTimeout(timer); reject(err) })
    })
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   המופעים של השרת: ניתוח כיתה, וקטלוג (גלובלי)
   ══════════════════════════════════════════════════════════════════════════ */
const intEnv = (name: string, fallback: number): number => {
  const n = Number(process.env[name])
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}
const classOptions = (): Partial<AnalysisCacheOptions> => ({
  ttlMs: intEnv('ANALYTICS_V2_CACHE_TTL_MS', DEFAULT_CACHE_OPTIONS.ttlMs),
  staleMs: intEnv('ANALYTICS_V2_CACHE_STALE_MS', DEFAULT_CACHE_OPTIONS.staleMs),
  maxEntries: intEnv('ANALYTICS_V2_CACHE_MAX', DEFAULT_CACHE_OPTIONS.maxEntries),
  concurrency: intEnv('ANALYTICS_V2_BUILD_CONCURRENCY', DEFAULT_CACHE_OPTIONS.concurrency),
  buildTimeoutMs: intEnv('ANALYTICS_V2_BUILD_TIMEOUT_MS', DEFAULT_CACHE_OPTIONS.buildTimeoutMs),
})

let classCache = new AnalysisCache<LiveAnalysis>(classOptions())
/* הקטלוג המאושר משתנה לעיתים רחוקות: טרי ל-30 דקות, ישן עד 6 שעות */
let catalogCache = new AnalysisCache<CatalogSnapshot>({ ttlMs: 30 * 60_000, staleMs: 6 * 60 * 60_000, maxEntries: 1, concurrency: 1 })

export const classCacheKey = (classId: string, includeSynthetic: boolean): string => `${classId}|${includeSynthetic ? 'syn' : 'real'}`

export function getCatalog(): Promise<CatalogSnapshot> {
  return catalogCache.get('catalog', async () => buildCatalog(await fetchCatalogRows()))
}

/* הניתוח של כיתה אחת (מטמון + single-flight). now — לבדיקות בלבד: הבנייה משתמשת בו; מפתח המטמון אינו כולל אותו */
export function getClassAnalysis(classId: string, includeSynthetic: boolean, now?: Date): Promise<LiveAnalysis> {
  return classCache.get(classCacheKey(classId, includeSynthetic), async () =>
    buildClassAnalysis(classId, includeSynthetic, now ?? new Date(), await getCatalog()))
}

/* לבדיקות: מאפס את שני המטמונים (ומיישם מחדש את משתני הסביבה) */
export function resetAnalysisCaches(): void {
  classCache = new AnalysisCache<LiveAnalysis>(classOptions())
  catalogCache = new AnalysisCache<CatalogSnapshot>({ ttlMs: 30 * 60_000, staleMs: 6 * 60 * 60_000, maxEntries: 1, concurrency: 1 })
}
export const classCacheStats = (): { size: number; inflight: number } => ({ size: classCache.size, inflight: classCache.inflightCount })
