/* ──────────────────────────────────────────────────────────────────────────
   llm — ממשק הקריאה למודל הסיכום + המימוש האמיתי (Gemini / Claude לפי engineFor('summary')).
   · השירות (service.ts) מקבל SummaryLlm בהזרקה: בבדיקות — מזויף. המימוש האמיתי **זורק תחת VITEST** (אלא אם AI_SUMMARY_ALLOW_LIVE_IN_TEST=1),
     ו-gemini.js/claude.js נטענים דינמית רק בקריאה בפועל — כך שאף בדיקה לא יכולה לקרוא למודל חי בטעות.
   · ה-thinking של Gemini 2.5 נצרך מ-maxOutputTokens, ולכן תקציב Gemini גדול מ-maxTokens של הבקשה.
   · timeout 45 שניות — ה-AbortSignal מועבר ל-fetch של Gemini (ולקריאת Claude), כך שאחרי ה-timeout אין קריאה יתומה שממשיכה לצרוך טוקנים.
   ────────────────────────────────────────────────────────────────────────── */
import { engineFor } from '../modelRouter.js'

export interface SummaryLlmRequest { system: string; user: string; maxTokens: number; signal?: AbortSignal }
export interface SummaryLlmResult { text: string; model: string }
export interface SummaryLlm { generate(req: SummaryLlmRequest): Promise<SummaryLlmResult> }

export const LLM_TIMEOUT_MS = 45_000
export const GEMINI_SUMMARY_MAX_TOKENS = 16_000
export const DEFAULT_CLAUDE_SUMMARY_MODEL = 'claude-sonnet-4-6'

export class LiveLlmBlockedError extends Error {
  constructor() {
    super('live LLM calls are disabled under test (set AI_SUMMARY_ALLOW_LIVE_IN_TEST=1 to override)')
    this.name = 'LiveLlmBlockedError'
  }
}

/* דוחה כשה-signal מופעל (ה-signal עצמו מועבר גם לקריאה, כך שהיא מתבטלת באמת ולא ממשיכה ברקע) */
function raceAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error('timeout'))
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(new Error('timeout'))
    signal.addEventListener('abort', onAbort, { once: true })
    p.then(
      (v) => { signal.removeEventListener('abort', onAbort); resolve(v) },
      (e) => { signal.removeEventListener('abort', onAbort); reject(e) },
    )
  })
}

export function createRealLlm(): SummaryLlm {
  return {
    async generate(req: SummaryLlmRequest): Promise<SummaryLlmResult> {
      if (process.env.VITEST && process.env.AI_SUMMARY_ALLOW_LIVE_IN_TEST !== '1') throw new LiveLlmBlockedError()
      const signal = req.signal ?? AbortSignal.timeout(LLM_TIMEOUT_MS)
      if (engineFor('summary') === 'gemini') {
        const { callGeminiJSON } = await import('../gemini.js')
        const text = (await raceAbort(callGeminiJSON(req.system, req.user, Math.max(req.maxTokens, GEMINI_SUMMARY_MAX_TOKENS), signal), signal)).trim()
        if (!text) throw new Error('empty response from Gemini')
        return { text, model: process.env.GEMINI_CONTENT_MODEL?.trim() || 'gemini-2.5-pro' }
      }
      const { claude } = await import('../claude.js')
      const model = process.env.AI_SUMMARY_CLAUDE_MODEL?.trim() || DEFAULT_CLAUDE_SUMMARY_MODEL
      const res = await claude.messages.create(
        { model, max_tokens: req.maxTokens, system: req.system, messages: [{ role: 'user', content: req.user }] },
        { signal },
      )
      const block = res.content.find((b) => b.type === 'text')
      const text = block && block.type === 'text' ? block.text.trim() : ''
      if (!text) throw new Error('empty response from Claude')
      return { text, model }
    },
  }
}
