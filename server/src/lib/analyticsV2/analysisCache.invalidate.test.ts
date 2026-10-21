/* G1 (UX#4): שיוך / שינוי מקצוע להדמיה מבטל את מטמון ניתוחי הכיתות — המורה חוזרת לאנליטיקה ורואה את השינוי, לא את הערך שמוגש מהמטמון עד פקיעת ה-TTL.
   בנייה שהתחילה לפני הביטול לא נכנסת למטמון, ובקשה חדשה אינה מצטרפת אליה. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../log.js', () => ({ warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() }))
const load = vi.hoisted(() => ({ buildClassAnalysis: vi.fn(), fetchCatalogRows: vi.fn() }))
vi.mock('./realWorld/loadWorld.js', () => ({ buildClassAnalysis: load.buildClassAnalysis }))
vi.mock('./realWorld/fetchRaw.js', () => ({ fetchCatalogRows: load.fetchCatalogRows }))

import { AnalysisCache, getClassAnalysis, invalidateAllClassAnalyses, resetAnalysisCaches } from './analysisCache.js'
import { emptyCatalogRows } from './realWorld/catalog.js'

const deferred = <T>(): { promise: Promise<T>; resolve: (v: T) => void } => {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

describe('AnalysisCache.clear', () => {
  let t = 0
  const mk = (): AnalysisCache<string> => new AnalysisCache<string>({ ttlMs: 1000, staleMs: 5000, maxErrorStaleMs: 20_000, maxEntries: 5, concurrency: 2, buildTimeoutMs: 1000, now: () => t })
  beforeEach(() => { t = 0 })

  it('ערך טרי נבנה מחדש אחרי clear (לא ממתינים ל-TTL)', async () => {
    const c = mk()
    let n = 0
    const build = async (): Promise<string> => `v${++n}`
    expect(await c.get('k', build)).toBe('v1')
    expect(await c.get('k', build)).toBe('v1')
    c.clear()
    expect(await c.get('k', build)).toBe('v2')
  })

  it('ערך בתוך חלון ה-stale (היה מוגש מיד ומתרענן ברקע) לא מוגש אחרי clear: הבנייה חוסמת ומחזירה ערך חדש', async () => {
    const c = mk()
    let n = 0
    const build = async (): Promise<string> => `v${++n}`
    await c.get('k', build)
    t = 3000 /* אחרי ה-TTL ובתוך staleMs: בלי clear מוחזר v1 */
    c.clear()
    expect(await c.get('k', build)).toBe('v2')
  })

  it('בנייה שרצה בזמן הביטול: לא נשמרת, ובקשה חדשה אחריו אינה מצטרפת אליה אלא בונה מחדש', async () => {
    const c = mk()
    const first = deferred<string>()
    let builds = 0
    const slow = (): Promise<string> => { builds++; return first.promise }
    const pending = c.get('k', slow)
    await Promise.resolve()
    c.clear() /* שיוך מקצוע קרה בזמן שהבנייה רצה */
    expect(await c.get('k', async () => { builds++; return 'fresh' })).toBe('fresh')
    first.resolve('stale-from-before')
    expect(await pending).toBe('stale-from-before') /* מי שחיכה לבנייה הישנה מקבל אותה, אך היא לא נכנסת למטמון */
    expect(await c.get('k', async () => { builds++; return 'never' })).toBe('fresh')
    expect(builds).toBe(2)
  })

  it('בלי ביטול: בקשה שנייה מצטרפת לבנייה שרצה (single-flight נשמר)', async () => {
    const c = mk()
    const first = deferred<string>()
    let builds = 0
    const p1 = c.get('k', () => { builds++; return first.promise })
    const p2 = c.get('k', () => { builds++; return first.promise })
    first.resolve('x')
    expect(await Promise.all([p1, p2])).toEqual(['x', 'x'])
    expect(builds).toBe(1)
  })
})

describe('invalidateAllClassAnalyses (המטמון של השרת)', () => {
  beforeEach(() => {
    resetAnalysisCaches()
    load.buildClassAnalysis.mockReset()
    load.fetchCatalogRows.mockReset().mockResolvedValue(emptyCatalogRows())
  })

  it('כל כיתה נבנית מחדש בקריאה הבאה אחרי הביטול; בלי ביטול — מהמטמון', async () => {
    let n = 0
    load.buildClassAnalysis.mockImplementation(async (id: string) => ({ id, build: ++n }))
    const a1 = await getClassAnalysis('c-a', false)
    const b1 = await getClassAnalysis('c-b', false)
    expect(await getClassAnalysis('c-a', false)).toBe(a1)
    expect(load.buildClassAnalysis).toHaveBeenCalledTimes(2)
    invalidateAllClassAnalyses()
    const a2 = await getClassAnalysis('c-a', false)
    const b2 = await getClassAnalysis('c-b', false)
    expect(a2).not.toBe(a1)
    expect(b2).not.toBe(b1)
    expect(load.buildClassAnalysis).toHaveBeenCalledTimes(4)
  })

  it('הקטלוג (גלובלי) אינו מושפע: נטען פעם אחת', async () => {
    load.buildClassAnalysis.mockImplementation(async (id: string) => ({ id }))
    await getClassAnalysis('c-a', false)
    invalidateAllClassAnalyses()
    await getClassAnalysis('c-a', false)
    expect(load.fetchCatalogRows).toHaveBeenCalledTimes(1)
  })
})
