import { describe, expect, it } from 'vitest'
import { readHexTokens } from './readTokens'
import { contrastRatio } from '../shared/lib/subjects'

const T = readHexTokens()
const c = (fg: string, bg: string): number => contrastRatio(T[fg], T[bg])

describe('קובץ הטוקנים — ערכי הפלטה כפי שהוגדרו', () => {
  it.each([
    ['--color-machine-bg', '#d9d2ec'], ['--color-machine', '#b9a2e8'], ['--color-machine-deep', '#6a3fb5'], ['--color-machine-tint', '#f1ebfc'],
    ['--color-crystal-empty', '#9a80d4'], ['--color-holo', '#3ab0f2'], ['--color-action', '#b3e4ff'], ['--color-action-pressed', '#8fd0f7'],
    ['--color-human', '#ff7a45'], ['--color-human-soft', '#ffd2ba'], ['--color-human-tint', '#fff1e8'], ['--color-human-deep', '#8a3a16'],
    ['--color-ink', '#1e1830'], ['--color-surface', '#ffffff'], ['--color-muted', '#4f4866'], ['--color-wrong', '#d7263d'],
    ['--subject-math', '#e9b949'], ['--subject-arabic', '#1f6f6a'], ['--subject-french', '#2a3f7a'], ['--subject-other', '#9a9a9a'],
  ])('%s = %s', (name, hex) => {
    expect(T[name]).toBe(hex)
  })

  it('אין שחור טהור בפלטה', () => {
    expect(Object.values(T)).not.toContain('#000000')
  })
})

describe('ניגודיות AA (4.5:1) לצירופי הטקסט שבשימוש', () => {
  /* [טקסט, רקע] — כל צירוף שהעיצוב משתמש בו לטקסט רגיל */
  const PAIRS: [string, string][] = [
    ['--color-ink', '--color-surface'], ['--color-ink', '--color-machine-bg'], ['--color-ink', '--color-machine'], ['--color-ink', '--color-machine-tint'],
    ['--color-ink', '--color-action'], ['--color-ink', '--color-action-pressed'], ['--color-ink', '--color-human-soft'], ['--color-ink', '--color-human-tint'], ['--color-ink', '--color-human'],
    ['--color-muted', '--color-surface'], ['--color-muted', '--color-machine-bg'], ['--color-muted', '--color-machine-tint'], ['--color-muted', '--color-human-tint'],
    ['--color-machine-deep', '--color-surface'], ['--color-machine-deep', '--color-machine-bg'], ['--color-machine-deep', '--color-machine-tint'],
    ['--color-human-deep', '--color-surface'], ['--color-human-deep', '--color-human-tint'], ['--color-human-deep', '--color-human-soft'],
    ['--color-surface', '--color-ink'], ['--color-surface', '--color-correct'], ['--color-surface', '--color-wrong'],
    ['--color-correct', '--color-surface'], ['--color-wrong', '--color-surface'],
  ]
  it.each(PAIRS)('%s על %s', (fg, bg) => {
    expect(c(fg, bg), `${fg} על ${bg}`).toBeGreaterThanOrEqual(4.5)
  })

  /* צירופים שנמדדו ונכשלים: מתועדים כאן כדי שלא ייכנסו לשימוש כטקסט */
  const FORBIDDEN: [string, string][] = [
    ['--color-machine-deep', '--color-machine'], ['--color-muted', '--color-machine'],
    ['--color-correct', '--color-machine-bg'], ['--color-wrong', '--color-machine-bg'],
    ['--color-human', '--color-surface'], ['--color-holo', '--color-surface'],
  ]
  it.each(FORBIDDEN)('לא לטקסט: %s על %s (מתחת ל-4.5)', (fg, bg) => {
    expect(c(fg, bg)).toBeLessThan(4.5)
  })
})
