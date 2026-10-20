import { describe, expect, it } from 'vitest'
import { bySubjectOrder, bySubjectOrderOf } from '../teacherUi'
import { LOCKED_OVERVIEW_TEXT } from './labels'
import { overviewTabItem } from './tabs'

describe('overviewTabItem — "סקירה" קיימת אצל כולם', () => {
  it('מחנך/ת: טאב רגיל פעיל', () => {
    const t = overviewTabItem(true)
    expect(t.label).toBe('סקירה')
    expect(t.locked).toBeUndefined()
    expect(t.lockedReason).toBeUndefined()
  })
  it('מורה מקצועי: אותו טאב, חסום, עם הסיבה גלויה (מנעול + "זמין למחנך/ת הכיתה")', () => {
    const t = overviewTabItem(false)
    expect(t.id).toBe(overviewTabItem(true).id)
    expect(t.label).toBe(overviewTabItem(true).label)
    expect(t.locked).toBe(true)
    expect(t.lockedReason).toBe(LOCKED_OVERVIEW_TEXT)
    expect(LOCKED_OVERVIEW_TEXT).toBe('זמין למחנך/ת הכיתה')
  })
})

describe('סדר מקצועות אחיד (shared/lib/subjects)', () => {
  const unordered = [{ code: 'science' }, { code: 'hebrew' }, { code: 'math' }, { code: 'history' }, { code: 'english' }]
  const expected = ['hebrew', 'history', 'math', 'english', 'science']
  it('bySubjectOrder', () => {
    expect(bySubjectOrder(unordered).map((s) => s.code)).toEqual(expected)
  })
  it('bySubjectOrderOf לפריטים שהקוד שלהם בתוך שדה אחר (שורות סקירה, תאי מנהל)', () => {
    const rows = unordered.map((s) => ({ subject: s, n: 1 }))
    expect(bySubjectOrderOf(rows, (r) => r.subject.code).map((r) => r.subject.code)).toEqual(expected)
  })
  it('קוד לא מוכר בסוף, ויציב: לא מערבב מקצועות שווים ולא משנה את הקלט', () => {
    const input = [{ code: 'zzz', i: 1 }, { code: 'math', i: 2 }, { code: 'zzz', i: 3 }, { code: 'hebrew', i: 4 }]
    const before = JSON.stringify(input)
    expect(bySubjectOrder(input).map((s) => s.i)).toEqual([4, 2, 1, 3])
    expect(JSON.stringify(input)).toBe(before)
  })
})
