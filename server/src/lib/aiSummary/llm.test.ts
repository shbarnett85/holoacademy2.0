import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LiveLlmBlockedError, createRealLlm } from './llm.js'

/* אף בדיקה לא יכולה לקרוא למודל חי בטעות: המימוש האמיתי זורק תחת VITEST, ו-claude/gemini נטענים דינמית רק בקריאה בפועל */
describe('llm: המימוש האמיתי חסום בבדיקות', () => {
  it('זורק LiveLlmBlockedError תחת VITEST (בלי AI_SUMMARY_ALLOW_LIVE_IN_TEST)', async () => {
    expect(process.env.VITEST).toBeTruthy()
    expect(process.env.AI_SUMMARY_ALLOW_LIVE_IN_TEST).not.toBe('1')
    await expect(createRealLlm().generate({ system: 's', user: 'u', maxTokens: 10 })).rejects.toBeInstanceOf(LiveLlmBlockedError)
  })

  it('llm.ts לא מייבא את claude.js / gemini.js סטטית (רק import() דינמי בתוך generate)', () => {
    const src = readFileSync(fileURLToPath(new URL('./llm.ts', import.meta.url)), 'utf8')
    expect(src).not.toMatch(/^import[^\n]*from\s+['"]\.\.\/(claude|gemini)\.js['"]/m)
    expect(src).toMatch(/await import\('\.\.\/gemini\.js'\)/)
    expect(src).toMatch(/await import\('\.\.\/claude\.js'\)/)
  })

  it('שאר קבצי השירות לא מייבאים מודל חי בכלל', () => {
    for (const f of ['service.ts', 'inputs.ts', 'guard.ts', 'prompt.ts', 'fallback.ts', 'store.ts']) {
      const src = readFileSync(fileURLToPath(new URL(`./${f}`, import.meta.url)), 'utf8')
      expect(src, f).not.toMatch(/from\s+['"]\.\.\/(claude|gemini|claudeCalls)\.js['"]/)
    }
  })
})
