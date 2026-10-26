import { describe, it, expect } from 'vitest'
import { CLASS_TIERS, TIER_BAND, fakeStudentName, simulateSession, tierForIndex, type Tier } from './demoSim.js'

/* הדמיה סינתטית: 6 רב-ברירה, 2 נכון/לא-נכון, זיכרון, מבחן סיכום */
function makeQuest(n = 8) {
  const scenes: unknown[] = []
  for (let i = 0; i < n; i++) {
    const type = i < n - 3 ? 'multipleChoice' : i === n - 3 ? 'memory' : i === n - 2 ? 'trueFalse' : 'finalQuiz'
    const puzzle: Record<string, unknown> = { type, difficulty: 5 }
    if (type === 'multipleChoice') {
      puzzle.choices = ['a', 'b', 'c', 'd'].map((id, k) => ({ id, text: 'opt-' + id, isCorrect: k === 0 }))
    } else if (type === 'trueFalse') {
      puzzle.choices = [{ id: 't', text: 'נכון', isCorrect: true }, { id: 'f', text: 'לא נכון', isCorrect: false }]
    } else if (type === 'finalQuiz') {
      puzzle.questions = [0, 1, 2].map((q) => ({ question: 'q' + q, options: ['x', 'y', 'z'], correctIndex: 0 }))
    }
    scenes.push({ id: 's' + i, puzzle })
  }
  return { scenes }
}

const rate = (tier: Tier, students: number, quests = 4) => {
  const rates: number[] = []
  for (let s = 0; s < students; s++) {
    for (let q = 0; q < quests; q++) {
      const r = simulateSession({ studentId: `stu-${tier}-${s}`, questId: `quest-${q}`, tier, gameData: makeQuest(10), questIndex: 0 })
      if (r.summary) rates.push(r.summary.successRate)
    }
  }
  return rates.reduce((a, b) => a + b, 0) / rates.length
}

describe('חלוקת כיתה של 12', () => {
  it('2 חזקים / 3 טובים / 3 בינוניים / 2 מתקשים / 1 לא-עקבי / 1 חלקי', () => {
    const count = (t: Tier) => CLASS_TIERS.filter((x) => x === t).length
    expect(CLASS_TIERS).toHaveLength(12)
    expect([count('strong'), count('good'), count('medium'), count('struggling'), count('inconsistent'), count('partial')]).toEqual([2, 3, 3, 2, 1, 1])
    expect(tierForIndex(12)).toBe(tierForIndex(0))
  })
  it('שמות בדויים בעליל — כולם מסתיימים ב"דמו"', () => {
    for (let i = 0; i < 30; i++) expect(fakeStudentName(i)).toMatch(/דמו( \d+)?$/)
  })
})

describe('simulateSession — דטרמיניזם', () => {
  it('אותו תלמיד + אותו שיעור ⇒ תוצאה זהה בדיוק', () => {
    const gd = makeQuest()
    const a = simulateSession({ studentId: 'u1', questId: 'q1', tier: 'medium', gameData: gd, questIndex: 0 })
    const b = simulateSession({ studentId: 'u1', questId: 'q1', tier: 'medium', gameData: gd, questIndex: 0 })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
  it('תלמיד אחר ⇒ תוצאה שונה', () => {
    const gd = makeQuest()
    const a = simulateSession({ studentId: 'u1', questId: 'q1', tier: 'good', gameData: gd, questIndex: 0 })
    const b = simulateSession({ studentId: 'u2', questId: 'q1', tier: 'good', gameData: gd, questIndex: 0 })
    expect(JSON.stringify(a.challenges)).not.toBe(JSON.stringify(b.challenges))
  })
})

describe('simulateSession — פרופילי הצלחה', () => {
  it.each(['strong', 'good', 'medium', 'struggling'] as Tier[])('%s נמצא בטווח המוגדר', (tier) => {
    const avg = rate(tier, 6)
    const [lo, hi] = TIER_BAND[tier]
    expect(avg).toBeGreaterThanOrEqual(lo - 0.08)
    expect(avg).toBeLessThanOrEqual(hi + 0.08)
  })
  it.each(['strong', 'good', 'medium', 'struggling'] as Tier[])('%s: כל סשן בודד נופל בתוך הטווח (גם בשיעורים קצרים)', (tier) => {
    const [lo, hi] = TIER_BAND[tier]
    for (const n of [5, 6, 8, 10]) {
      for (let s = 0; s < 12; s++) {
        const r = simulateSession({ studentId: `b-${tier}-${s}`, questId: 'q' + n, tier, gameData: makeQuest(n + 1), questIndex: 0 })
        const rate = r.summary!.successRate
        expect(rate).toBeGreaterThanOrEqual(lo - 1e-9)
        expect(rate).toBeLessThanOrEqual(hi + 1e-9)
      }
    }
  })
  it('סדר ההצלחה: חזק > טוב > בינוני > מתקשה', () => {
    const [s, g, m, st] = (['strong', 'good', 'medium', 'struggling'] as Tier[]).map((t) => rate(t, 6))
    expect(s).toBeGreaterThan(g)
    expect(g).toBeGreaterThan(m)
    expect(m).toBeGreaterThan(st)
  })
  it('לא-עקבי: חזק בסוגי אתגר אחדים וחלש באחרים (פיזור גבוה בין סוגים)', () => {
    const byType = new Map<string, number[]>()
    for (let s = 0; s < 6; s++) {
      const r = simulateSession({ studentId: 'inc-' + s, questId: 'q', tier: 'inconsistent', gameData: makeQuest(12), questIndex: 0 })
      for (const c of r.challenges) byType.set(c.puzzleType, [...(byType.get(c.puzzleType) ?? []), c.correct ? 1 : 0])
    }
    const means = [...byType.values()].map((v) => v.reduce((a, b) => a + b, 0) / v.length)
    expect(Math.max(...means) - Math.min(...means)).toBeGreaterThan(0.3)
  })
  it('חלקי: מסיים רק חלק מהשיעורים — האחרים באמצע/לא-התחיל', () => {
    const statuses = [0, 1, 2, 3, 4, 5].map((i) => simulateSession({ studentId: 'p1', questId: 'q' + i, tier: 'partial', gameData: makeQuest(), questIndex: i }).status)
    expect(statuses.filter((s) => s === 'completed').length).toBe(3)
    expect(statuses).toContain('in_progress')
    expect(statuses).toContain('not_started')
  })
})

describe('simulateSession — תשובות בפועל ומסיחים', () => {
  it('נשמרת התשובה שנבחרה וסוג האתגר לכל שאלת רב-ברירה/נכון-לא-נכון', () => {
    const r = simulateSession({ studentId: 'x', questId: 'q', tier: 'medium', gameData: makeQuest(), questIndex: 0 })
    for (const c of r.challenges.filter((c) => c.puzzleType === 'multipleChoice' || c.puzzleType === 'trueFalse')) {
      expect(typeof c.extra.selectedChoiceId).toBe('string')
      expect(c.extra.correctChoiceId).toBeDefined()
      expect(c.correct).toBe(c.extra.selectedChoiceId === c.extra.correctChoiceId)
    }
  })
  it('מתקשים נצמדים למסיח הפופולרי של השאלה (רוב הטעויות על אותו מסיח)', () => {
    const wrongPicks = new Map<string, Map<string, number>>()
    for (let s = 0; s < 12; s++) {
      const r = simulateSession({ studentId: 'st-' + s, questId: 'q', tier: 'struggling', gameData: makeQuest(10), questIndex: 0 })
      for (const c of r.challenges) {
        if (c.puzzleType !== 'multipleChoice' || c.correct) continue
        const m = wrongPicks.get(c.sceneId) ?? new Map<string, number>()
        m.set(c.extra.selectedChoiceId as string, (m.get(c.extra.selectedChoiceId as string) ?? 0) + 1)
        wrongPicks.set(c.sceneId, m)
      }
    }
    let top = 0
    let total = 0
    for (const m of wrongPicks.values()) { const v = [...m.values()]; top += Math.max(...v); total += v.reduce((a, b) => a + b, 0) }
    expect(total).toBeGreaterThan(10)
    expect(top / total).toBeGreaterThan(0.6)
  })
})

describe('simulateSession — התאמה אישית של קושי', () => {
  it('חזק מקבל קושי גבוה יותר ממתקשה על אותו שיעור', () => {
    const avg = (tier: Tier) => {
      const r = simulateSession({ studentId: 'd', questId: 'q', tier, gameData: makeQuest(), questIndex: 0 })
      return r.challenges.reduce((a, c) => a + c.difficulty, 0) / r.challenges.length
    }
    expect(avg('strong')).toBeGreaterThan(avg('struggling') + 2)
  })
  it('זמני סצנה/אתגר וימי פעילות סבירים (פיזור על פני ימים אחרונים)', () => {
    const days = new Set<number>()
    for (let s = 0; s < 30; s++) {
      const r = simulateSession({ studentId: 'z' + s, questId: 'q', tier: 'good', gameData: makeQuest(), questIndex: 0 })
      days.add(r.dayOffset)
      expect(r.dayOffset).toBeGreaterThanOrEqual(0)
      expect(r.dayOffset).toBeLessThan(10)
      for (const c of r.challenges) expect(c.solveTimeMs).toBeGreaterThan(1000)
    }
    expect(days.size).toBeGreaterThan(4)
  })
})
