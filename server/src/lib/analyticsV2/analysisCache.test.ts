import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ERR_ANALYSIS_UNAVAILABLE, ERR_ANALYSIS_WARMING } from '../../../../src/shared/lib/findingsNarrative.js'
import { AppError } from '../../middleware/errors.js'

vi.mock('../log.js', () => ({ warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() }))
const load = vi.hoisted(() => ({ buildClassAnalysis: vi.fn(), fetchCatalogRows: vi.fn() }))
vi.mock('./realWorld/loadWorld.js', () => ({ buildClassAnalysis: load.buildClassAnalysis }))
vi.mock('./realWorld/fetchRaw.js', () => ({ fetchCatalogRows: load.fetchCatalogRows }))

import { EMPTY_CATALOG } from './catalog.js'
import { AnalysisBuildError, AnalysisCache, classCacheKey, classCacheStats, getCatalog, getClassAnalysis, resetAnalysisCaches } from './analysisCache.js'
import { emptyCatalogRows } from './realWorld/catalog.js'

const deferred = <T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } => {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('AnalysisCache', () => {
  let t = 0
  const mk = (over = {}): AnalysisCache<string> => new AnalysisCache<string>({ ttlMs: 1000, staleMs: 5000, maxEntries: 3, concurrency: 2, buildTimeoutMs: 100, now: () => t, ...over })
  beforeEach(() => { t = 0 })

  it('single-flight: כמה קריאות בו-זמנית לאותו מפתח = בנייה אחת', async () => {
    const c = mk()
    const d = deferred<string>()
    const build = vi.fn(() => d.promise)
    const ps = [c.get('k', build), c.get('k', build), c.get('k', build)]
    await tick()
    expect(build).toHaveBeenCalledTimes(1)
    expect(c.inflightCount).toBe(1)
    d.resolve('v')
    expect(await Promise.all(ps)).toEqual(['v', 'v', 'v'])
    expect(c.inflightCount).toBe(0)
  })

  it('טרי (בתוך ה-TTL) מוחזר בלי בנייה חדשה; אחרי ה-TTL — ישן מוחזר מיד ומתרענן ברקע', async () => {
    const c = mk()
    const build = vi.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2')
    expect(await c.get('k', build)).toBe('v1')
    t = 900
    expect(await c.get('k', build)).toBe('v1')
    expect(build).toHaveBeenCalledTimes(1)
    t = 2000 /* ישן, אך בתוך staleMs */
    expect(await c.get('k', build)).toBe('v1') /* מוחזר מיד */
    await tick()
    expect(build).toHaveBeenCalledTimes(2)
    expect(await c.get('k', build)).toBe('v2') /* הרענון נחת (טרי מ-t=2000) */
    expect(build).toHaveBeenCalledTimes(2)
  })

  it('רענון ברקע שנכשל משאיר את הערך הישן ואינו זורק', async () => {
    const c = mk()
    const build = vi.fn().mockResolvedValueOnce('v1').mockRejectedValueOnce(new Error('db down'))
    await c.get('k', build)
    t = 2000
    expect(await c.get('k', build)).toBe('v1')
    await tick()
    expect(c.peek('k')).toBe('v1')
  })

  it('מעבר ל-staleMs: בנייה חוסמת; אם נכשלת — הערך הישן; אם אין ערך ישן — 503 מובחן', async () => {
    const c = mk()
    await c.get('k', async () => 'old')
    t = 9000
    expect(await c.get('k', async () => { throw new Error('boom') })).toBe('old')
    const c2 = mk()
    const err = await c2.get('x', async () => { throw new Error('boom') }).catch((e) => e)
    expect(err).toBeInstanceOf(AnalysisBuildError)
    expect(err).toMatchObject({ status: 503, kind: 'unavailable', code: 'ANALYSIS_UNAVAILABLE', message: ERR_ANALYSIS_UNAVAILABLE })
  })

  it('שגיאת 503 קיימת (למשל בדיקת סכמה) עוברת כמות שהיא', async () => {
    const c = mk()
    const own = new AppError(503, 'x', 'SCHEMA_PROBE_UNAVAILABLE')
    expect(await c.get('x', async () => { throw own }).catch((e) => e)).toBe(own)
  })

  it('תקרת זמן: הקורא מקבל 503 warming, הבנייה ממשיכה ומאכלסת את המטמון — הקריאה הבאה פוגעת', async () => {
    vi.useFakeTimers()
    try {
      const c = mk({ buildTimeoutMs: 50 })
      const d = deferred<string>()
      const build = vi.fn(() => d.promise)
      const p = c.get('k', build).catch((e) => e)
      await vi.advanceTimersByTimeAsync(60)
      const err = await p
      expect(err).toBeInstanceOf(AnalysisBuildError)
      expect(err).toMatchObject({ status: 503, kind: 'warming', code: 'ANALYSIS_WARMING', message: ERR_ANALYSIS_WARMING })
      expect(c.inflightCount).toBe(1)
      d.resolve('done')
      await vi.advanceTimersByTimeAsync(0)
      expect(await c.get('k', build)).toBe('done')
      expect(build).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })

  it('ניסיון נוסף בזמן שבנייה רצה מצטרף אליה (לא בונה שוב)', async () => {
    vi.useFakeTimers()
    try {
      const c = mk({ buildTimeoutMs: 50 })
      const d = deferred<string>()
      const build = vi.fn(() => d.promise)
      const first = c.get('k', build).catch((e) => e)
      await vi.advanceTimersByTimeAsync(60)
      await first
      const second = c.get('k', build)
      d.resolve('late')
      expect(await second).toBe('late')
      expect(build).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })

  it('מקביליות בנייה מוגבלת: שלוש בניות עם concurrency=2 — השלישית ממתינה', async () => {
    const c = mk({ buildTimeoutMs: 10_000 })
    const ds = [deferred<string>(), deferred<string>(), deferred<string>()]
    let running = 0, peak = 0
    const build = (i: number) => async (): Promise<string> => {
      running++; peak = Math.max(peak, running)
      try { return await ds[i].promise } finally { running-- }
    }
    const ps = ds.map((_, i) => c.get(`k${i}`, build(i)))
    await tick()
    expect(running).toBe(2)
    ds[0].resolve('a')
    await tick()
    expect(running).toBe(2) /* השלישית נכנסה */
    ds[1].resolve('b'); ds[2].resolve('c')
    expect(await Promise.all(ps)).toEqual(['a', 'b', 'c'])
    expect(peak).toBe(2)
  })

  it('LRU: מעל maxEntries הישן ביותר נפלט; קריאה מחדשת אותו', async () => {
    const c = mk({ maxEntries: 3 })
    for (const k of ['a', 'b', 'c']) await c.get(k, async () => k)
    await c.get('a', async () => 'x') /* a טרי ← הופך לאחרון */
    await c.get('d', async () => 'd')
    expect(c.has('b')).toBe(false)
    expect(['a', 'c', 'd'].every((k) => c.has(k))).toBe(true)
    expect(c.size).toBe(3)
  })

  it('invalidate / clear', async () => {
    const c = mk()
    await c.get('a', async () => '1')
    c.invalidate('a')
    expect(c.has('a')).toBe(false)
    await c.get('a', async () => '2')
    c.clear()
    expect(c.size).toBe(0)
  })

  it('staleMs קטן מ-ttlMs מתוקן ל-ttlMs', () => {
    expect(mk({ ttlMs: 1000, staleMs: 10 }).opts.staleMs).toBe(1000)
  })
})

describe('getClassAnalysis / getCatalog', () => {
  beforeEach(() => {
    resetAnalysisCaches()
    load.buildClassAnalysis.mockReset()
    load.fetchCatalogRows.mockReset().mockResolvedValue(emptyCatalogRows())
  })
  afterEach(() => { vi.useRealTimers() })

  it('מפתח הכיתה כולל includeSynthetic — נתוני הדגמה לא נמזגים לנתוני אמת', async () => {
    load.buildClassAnalysis.mockImplementation(async (classId: string, include: boolean) => ({ classId, include }))
    const real = await getClassAnalysis('c1', false)
    const syn = await getClassAnalysis('c1', true)
    expect(real).toEqual({ classId: 'c1', include: false })
    expect(syn).toEqual({ classId: 'c1', include: true })
    expect(load.buildClassAnalysis).toHaveBeenCalledTimes(2)
    await getClassAnalysis('c1', false)
    await getClassAnalysis('c1', true)
    expect(load.buildClassAnalysis).toHaveBeenCalledTimes(2)
    expect(classCacheKey('c1', false)).not.toBe(classCacheKey('c1', true))
    expect(classCacheStats().size).toBe(2)
  })

  it('כיתות שונות — בניות נפרדות; אותה כיתה בו-זמנית — בנייה אחת; הקטלוג נטען פעם אחת', async () => {
    load.buildClassAnalysis.mockImplementation(async (classId: string) => ({ classId }))
    await Promise.all([getClassAnalysis('a', false), getClassAnalysis('a', false), getClassAnalysis('b', false)])
    expect(load.buildClassAnalysis).toHaveBeenCalledTimes(2)
    expect(load.fetchCatalogRows).toHaveBeenCalledTimes(1)
  })

  it('הקטלוג מועבר לבנייה; קטלוג ריק = EMPTY_CATALOG', async () => {
    load.buildClassAnalysis.mockImplementation(async (_c: string, _i: boolean, _n: Date, catalog: unknown) => ({ catalog }))
    expect(await getCatalog()).toBe(EMPTY_CATALOG)
    const a = await getClassAnalysis('x', false)
    expect((a as unknown as { catalog: unknown }).catalog).toBe(EMPTY_CATALOG)
  })

  it('כשל בטעינת הקטלוג נכשל סגור (503) — לא ניתוח עם "אין תיוג" שנשמר במטמון', async () => {
    load.fetchCatalogRows.mockRejectedValueOnce(new Error('db'))
    await expect(getClassAnalysis('x', false)).rejects.toBeInstanceOf(AnalysisBuildError)
    expect(classCacheStats().size).toBe(0)
    load.buildClassAnalysis.mockResolvedValue({ ok: true })
    expect(await getClassAnalysis('x', false)).toEqual({ ok: true })
  })

  it('now מועבר לבנייה', async () => {
    load.buildClassAnalysis.mockResolvedValue({})
    const now = new Date('2026-03-06T10:00:00Z')
    await getClassAnalysis('y', false, now)
    expect(load.buildClassAnalysis.mock.calls[0][2]).toBe(now)
  })
})
