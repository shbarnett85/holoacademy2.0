import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Request } from 'express'

/* ══════════════════════════════════════════════════════════════════════════
   הנתיב הישן /api/analytics/summary — הופרש (R4#6). הוא עקף את שומר הפלט ואת התקרה היומית של /api/ai-summary (פלט ה-LLM הוחזר כמות שהוא).
   · POST ו-PATCH למשתמש אמיתי: 410 עם הודעה בעברית פשוטה, בלי LLM, בלי DB, בלי יומן.
   · GET: "אין סיכום" (לכולם), בלי DB.
   · אורח: POST מחזיר את סיכום ההדגמה הקבוע כמו קודם.
   · אין בקובץ קריאה למודל חי ואין כתיבה לטבלת pedagogical_summaries.
   ══════════════════════════════════════════════════════════════════════════ */
const h = vi.hoisted(() => ({ dbCalls: 0, llmCalls: 0 }))
vi.mock('../lib/supabase.js', () => ({ supabaseAdmin: { from: () => { h.dbCalls++; throw new Error('DB must not be touched') } }, supabaseAnon: {} }))
vi.mock('../lib/claude.js', () => ({ claude: { messages: { create: () => { h.llmCalls++; throw new Error('LLM must not be called') } } } }))

import { ERR_LEGACY_SUMMARY_MOVED } from '../../../src/shared/lib/findingsNarrative.js'
import { AppError } from '../middleware/errors.js'
import { analyticsRouter } from './analytics.js'

interface Layer { route?: { path: string; methods: Record<string, boolean>; stack: { handle: (req: Request, res: unknown, next: (e?: unknown) => void) => unknown }[] } }
const layers = (): Layer[] => (analyticsRouter as unknown as { stack: Layer[] }).stack.filter((l) => l.route?.path === '/summary')
async function call(method: 'get' | 'post' | 'patch', input: { query?: Record<string, string>; body?: Record<string, unknown>; guest?: boolean }): Promise<{ body?: Record<string, unknown>; error?: AppError }> {
  const layer = layers().find((l) => l.route!.methods[method])!
  const req = { staff: { userId: input.guest ? 'guest' : 'user-A', role: 'teacher', isGuest: input.guest === true }, method: method.toUpperCase(), path: '/summary', query: input.query ?? {}, body: input.body ?? {}, params: {} } as unknown as Request
  let body: Record<string, unknown> | undefined
  let error: AppError | undefined
  const stack = layer.route!.stack
  await stack[stack.length - 1].handle(req, { json: (b: Record<string, unknown>) => { body = b } }, (e) => { error = e as AppError })
  return { body, error }
}

describe('סיכום ישן: הופרש', () => {
  it('POST למשתמש אמיתי: 410 עם ההודעה בעברית פשוטה; בלי LLM ובלי DB', async () => {
    for (const scope of ['student', 'class', 'assignment']) {
      const r = await call('post', { body: { scope, id: 'x1', regenerate: true } })
      expect(r.body).toBeUndefined()
      expect(r.error?.status, scope).toBe(410)
      expect(r.error?.message).toBe(ERR_LEGACY_SUMMARY_MOVED)
    }
    expect(ERR_LEGACY_SUMMARY_MOVED).toBe('הסיכום עבר למסך ההתקדמות של התלמיד/ה והכיתה')
    expect(h.llmCalls).toBe(0)
    expect(h.dbCalls).toBe(0)
  })

  it('PATCH (עריכה) למשתמש אמיתי: 410', async () => {
    const r = await call('patch', { body: { scope: 'student', id: 'x1', edited_content: 'עריכה' } })
    expect(r.error?.status).toBe(410)
    expect(r.error?.message).toBe(ERR_LEGACY_SUMMARY_MOVED)
    expect(h.dbCalls).toBe(0)
  })

  it('GET: אין סיכום (לכולם), בלי DB', async () => {
    expect((await call('get', { query: { scope: 'class', id: 'c1' } })).body).toEqual({ summary: null })
    expect((await call('get', { query: { scope: 'student', id: 's1' }, guest: true })).body).toEqual({ summary: null })
    expect(h.dbCalls).toBe(0)
  })

  it('אורח: POST מחזיר סיכום הדגמה קבוע (כמו קודם) — בלי DB ובלי LLM', async () => {
    const r = await call('post', { guest: true, body: { scope: 'class', id: 'c1' } })
    expect(r.error).toBeUndefined()
    expect(r.body).toBeTruthy()
    expect(h.llmCalls).toBe(0)
    expect(h.dbCalls).toBe(0)
  })

  it('אורח עם גוף לא תקין: אינו מקבל סיכום הדגמה (410), ואין שגיאת שרת', async () => {
    const r = await call('post', { guest: true, body: { scope: 'nope', id: '' } })
    expect(r.error?.status).toBe(410)
  })

  it('הקוד: אין קריאה למודל חי, אין כתיבה/קריאה לטבלת pedagogical_summaries, ואין עוד צרכן ב-client', () => {
    const src = readFileSync(fileURLToPath(new URL('./analytics.ts', import.meta.url)), 'utf8')
    const summaryZone = src.slice(src.indexOf('סיכום פדגוגי (נתיב ישן)'), src.indexOf('GET /api/analytics/review-suggestions'))
    expect(summaryZone.length).toBeGreaterThan(200)
    expect(summaryZone).not.toMatch(/claude|callGemini|callSonnet|pedagogical_summaries|supabaseAdmin/)
    expect(src).not.toMatch(/from '\.\.\/lib\/(claude|gemini)\.js'/)
  })
})
