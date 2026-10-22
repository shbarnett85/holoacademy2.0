/* FX1b: גיל מקסימלי לערך ישן שמוחזר בכשל (R1#8), וסיווג שגיאת נתונים משגיאת תשתית (R2#6). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ERR_ANALYSIS_UNAVAILABLE } from '../../../../src/shared/lib/findingsNarrative.js'

vi.mock('../log.js', () => ({ warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() }))
const load = vi.hoisted(() => ({ buildClassAnalysis: vi.fn(), fetchCatalogRows: vi.fn() }))
vi.mock('./realWorld/loadWorld.js', () => ({ buildClassAnalysis: load.buildClassAnalysis }))
vi.mock('./realWorld/fetchRaw.js', () => ({ fetchCatalogRows: load.fetchCatalogRows }))

import { AnalysisBuildError, AnalysisCache, DEFAULT_CACHE_OPTIONS, getClassAnalysis, resetAnalysisCaches } from './analysisCache.js'
import { emptyCatalogRows } from './realWorld/catalog.js'
import { AnalysisDataError } from './realWorld/buildErrors.js'

const HOUR = 3_600_000

describe('ערך ישן בכשל: גיל מקסימלי', () => {
  let t = 0
  const mk = (over = {}): AnalysisCache<string> => new AnalysisCache<string>({ ttlMs: 1000, staleMs: 5000, maxErrorStaleMs: 20_000, maxEntries: 3, concurrency: 2, buildTimeoutMs: 100, now: () => t, ...over })
  beforeEach(() => { t = 0 })

  it('ברירת המחדל: 6 שעות', () => { expect(DEFAULT_CACHE_OPTIONS.maxErrorStaleMs).toBe(6 * HOUR) })

  it('בנייה חוסמת נכשלת: ערך בתוך הגיל המקסימלי מוחזר; מעבר לו — שגיאה, לא נתונים בני ימים', async () => {
    const c = mk()
    await c.get('k', async () => 'old')
    t = 19_999 /* מעל staleMs (בנייה חוסמת) אך מתחת למקסימום */
    expect(await c.get('k', async () => { throw new Error('db down') })).toBe('old')
    t = 20_001
    const err = await c.get('k', async () => { throw new Error('db down') }).catch((e) => e)
    expect(err).toBeInstanceOf(AnalysisBuildError)
    expect(err).toMatchObject({ status: 503, kind: 'unavailable', message: ERR_ANALYSIS_UNAVAILABLE })
  })

  it('תקרת זמן (warming) על ערך ישן מדי: 503 warming ולא הערך הישן; בנייה שמסתיימת אחר כך מרעננת', async () => {
    vi.useFakeTimers()
    try {
      let now = 0
      const c = mk({ now: () => now })
      await c.get('k', async () => 'old')
      now = 30_000
      let release: (v: string) => void = () => undefined
      const p = c.get('k', () => new Promise<string>((r) => { release = r })).catch((e) => e)
      await vi.advanceTimersByTimeAsync(150)
      expect(await p).toMatchObject({ status: 503, kind: 'warming' })
      release('fresh')
      await vi.advanceTimersByTimeAsync(0)
      expect(await c.get('k', async () => 'never')).toBe('fresh')
    } finally { vi.useRealTimers() }
  })

  it('maxErrorStaleMs קטן מ-staleMs מתוקן ל-staleMs', () => {
    expect(mk({ staleMs: 5000, maxErrorStaleMs: 10 }).opts.maxErrorStaleMs).toBe(5000)
  })
})

describe('שגיאת נתונים מול שגיאת תשתית', () => {
  beforeEach(() => {
    resetAnalysisCaches()
    load.buildClassAnalysis.mockReset()
    load.fetchCatalogRows.mockReset().mockResolvedValue(emptyCatalogRows())
  })
  afterEach(() => { vi.useRealTimers() })

  it('AnalysisDataError (ההרכבה / המנוע נכשלו על נתוני הכיתה) → AnalysisBuildError(kind="data"), 503, ללא שמירה במטמון', async () => {
    load.buildClassAnalysis.mockRejectedValue(new AnalysisDataError('c1', 'bad row'))
    const err = await getClassAnalysis('c1', false).catch((e) => e)
    expect(err).toBeInstanceOf(AnalysisBuildError)
    expect(err).toMatchObject({ status: 503, kind: 'data', code: 'ANALYSIS_DATA', message: ERR_ANALYSIS_UNAVAILABLE })
    load.buildClassAnalysis.mockResolvedValue({ ok: true })
    expect(await getClassAnalysis('c1', false)).toEqual({ ok: true })
  })

  it('שגיאה רגילה (DB / רשת) נשארת kind="unavailable"', async () => {
    load.buildClassAnalysis.mockRejectedValue(new Error('connection reset'))
    expect(await getClassAnalysis('c2', false).catch((e) => e)).toMatchObject({ kind: 'unavailable', code: 'ANALYSIS_UNAVAILABLE' })
  })
})
