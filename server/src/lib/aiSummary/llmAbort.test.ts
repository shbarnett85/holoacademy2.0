import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/* R4#12: ה-timeout של קריאת המודל מבטל את הקריאה עצמה (AbortSignal עד ה-fetch), ולא רק "מפסיק לחכות" — אחרת נשארת קריאה יתומה שממשיכה לצרוך טוקנים.
   הבדיקה מחליפה את gemini.js במחלקה מזויפת שמאזינה ל-signal; המימוש האמיתי חסום בבדיקות אלא עם AI_SUMMARY_ALLOW_LIVE_IN_TEST. */
const h = vi.hoisted(() => ({ signal: undefined as AbortSignal | undefined, aborted: false }))
vi.mock('../modelRouter.js', () => ({ engineFor: () => 'gemini' }))
vi.mock('../gemini.js', () => ({
  callGeminiJSON: async (_s: string, _u: string, _m: number, signal?: AbortSignal): Promise<string> => {
    h.signal = signal
    await new Promise<void>((_, reject) => signal?.addEventListener('abort', () => { h.aborted = true; reject(new Error('aborted')) }, { once: true }))
    return ''
  },
}))

import { createRealLlm } from './llm.js'

beforeEach(() => { h.signal = undefined; h.aborted = false; process.env.AI_SUMMARY_ALLOW_LIVE_IN_TEST = '1' })
afterEach(() => { delete process.env.AI_SUMMARY_ALLOW_LIVE_IN_TEST })

describe('llm: ה-signal מגיע לקריאת Gemini ומבטל אותה', () => {
  it('timeout/ביטול → ההבטחה נדחית וה-signal שהועבר לקריאה מופעל (לא קריאה יתומה)', async () => {
    const ctl = new AbortController()
    const p = createRealLlm().generate({ system: 's', user: 'u', maxTokens: 100, signal: ctl.signal })
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 5))
    expect(h.signal).toBe(ctl.signal)
    ctl.abort()
    await expect(p).rejects.toThrow()
    expect(h.aborted).toBe(true)
  })

  it('בלי signal מהקורא: נקבע timeout פנימי והוא מועבר לקריאה', async () => {
    const p = createRealLlm().generate({ system: 's', user: 'u', maxTokens: 100 })
    p.catch(() => undefined)
    await new Promise((r) => setTimeout(r, 5))
    expect(h.signal).toBeInstanceOf(AbortSignal)
    expect(h.signal!.aborted).toBe(false)
  })
})
