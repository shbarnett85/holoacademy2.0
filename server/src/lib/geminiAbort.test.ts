import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callGeminiJSON } from './gemini.js'

/* R4#12: ה-AbortSignal מגיע ל-fetch של Gemini, ביטול עוצר גם את ניסיונות ה-retry. בלי רשת: fetch מוחלף. */
const realFetch = globalThis.fetch
let seen: (RequestInit | undefined)[] = []
beforeEach(() => { seen = []; process.env.GEMINI_API_KEY = 'test-key-not-real' })
afterEach(() => { globalThis.fetch = realFetch; delete process.env.GEMINI_API_KEY; vi.restoreAllMocks() })

describe('callGeminiJSON: signal', () => {
  it('מועבר ל-fetch', async () => {
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      seen.push(init)
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"x":1}' }] } }] }) } as Response
    }) as typeof fetch
    const ctl = new AbortController()
    expect(await callGeminiJSON('s', 'u', 100, ctl.signal)).toBe('{"x":1}')
    expect(seen[0]?.signal).toBe(ctl.signal)
  })

  it('signal שכבר הופעל: אין fetch בכלל', async () => {
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => { seen.push(init); return { ok: true } as Response }) as typeof fetch
    const ctl = new AbortController()
    ctl.abort()
    await expect(callGeminiJSON('s', 'u', 100, ctl.signal)).rejects.toThrow()
    expect(seen).toHaveLength(0)
  })

  it('ביטול בזמן retry (503): לא ממשיכים לניסיון הבא', async () => {
    const ctl = new AbortController()
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      seen.push(init)
      ctl.abort()
      return { ok: false, status: 503, text: async () => 'busy' } as Response
    }) as typeof fetch
    await expect(callGeminiJSON('s', 'u', 100, ctl.signal)).rejects.toThrow()
    expect(seen).toHaveLength(1)
  })

  it('בלי signal: ההתנהגות הקודמת (fetch בלי signal)', async () => {
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      seen.push(init)
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) } as Response
    }) as typeof fetch
    expect(await callGeminiJSON('s', 'u', 100)).toBe('ok')
    expect(seen[0]).not.toHaveProperty('signal')
  })
})
