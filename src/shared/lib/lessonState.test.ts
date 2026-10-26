import { describe, expect, it } from 'vitest'
import { ACTIVE_WINDOW_MS, defaultDueAt, dueAtFromDay, formatIsraelDate, isLate, israelDay, israelLocalToUtc, lessonState } from './lessonState'

describe('תאריך יעד ברירת מחדל: +7 ימים, 23:59 שעון ישראל', () => {
  it('קיץ (UTC+3)', () => {
    expect(defaultDueAt('2026-07-01T09:00:00Z').toISOString()).toBe('2026-07-08T20:59:00.000Z')
  })
  it('שליחה אחרי חצות בשעון ישראל נחשבת ליום הבא', () => {
    /* 21:30Z = 00:30 למחרת בישראל (קיץ) */
    expect(defaultDueAt('2026-07-01T21:30:00Z').toISOString()).toBe('2026-07-09T20:59:00.000Z')
  })
  it('חוצה מעבר שעון (סוף אוקטובר 2026: UTC+3 → UTC+2) — הפער נקבע לפי תאריך היעד', () => {
    expect(defaultDueAt('2026-10-21T10:00:00Z').toISOString()).toBe('2026-10-28T21:59:00.000Z')
  })
  it('חורף (UTC+2)', () => {
    expect(defaultDueAt('2027-01-10T08:00:00Z').toISOString()).toBe('2027-01-17T21:59:00.000Z')
  })
  it('מעבר חודש/שנה', () => {
    expect(israelDay(defaultDueAt('2026-12-28T10:00:00Z'))).toBe('2027-01-04')
  })
})

describe('dueAtFromDay / israelDay / israelLocalToUtc', () => {
  it('שדה תאריך → סוף היום הישראלי', () => {
    expect(dueAtFromDay('2026-07-08')!.toISOString()).toBe('2026-07-08T20:59:00.000Z')
    expect(dueAtFromDay('2027-02-03')!.toISOString()).toBe('2027-02-03T21:59:00.000Z')
    expect(israelDay(dueAtFromDay('2026-07-08')!)).toBe('2026-07-08')
  })
  it('תאריך לא תקין → null', () => {
    expect(dueAtFromDay('2026-02-30')).toBeNull()
    expect(dueAtFromDay('08/07/2026')).toBeNull()
    expect(dueAtFromDay('')).toBeNull()
  })
  it('המרה הלוך-חזור', () => {
    expect(israelLocalToUtc(2026, 3, 27, 12, 0).toISOString()).toBe('2026-03-27T09:00:00.000Z') /* אחרי מעבר לקיץ (28.3.2026 בערך) — בדיקת גבול */
    expect(israelLocalToUtc(2026, 1, 15, 12, 0).toISOString()).toBe('2026-01-15T10:00:00.000Z')
  })
})

describe('lessonState — פונקציית מצב אחת', () => {
  const due = '2026-07-08T20:59:00.000Z'
  const now = new Date('2026-07-05T10:00:00Z')
  it('open לפני המועד, ended אחריו', () => {
    expect(lessonState({ now, dueAt: due })).toBe('open')
    expect(lessonState({ now: new Date('2026-07-09T00:00:00Z'), dueAt: due })).toBe('ended')
  })
  it('בלי מועד — תמיד open', () => {
    expect(lessonState({ now, dueAt: null })).toBe('open')
  })
  it('active_now: פעילות ב-5 הדקות האחרונות; חצי דקה מעל החלון — לא', () => {
    expect(lessonState({ now, dueAt: due, lastActivityAt: new Date(now.getTime() - 2 * 60_000) })).toBe('active_now')
    expect(lessonState({ now, dueAt: due, lastActivityAt: new Date(now.getTime() - ACTIVE_WINDOW_MS) })).toBe('active_now')
    expect(lessonState({ now, dueAt: due, lastActivityAt: new Date(now.getTime() - ACTIVE_WINDOW_MS - 30_000) })).toBe('open')
  })
  it('עדיפות: active_now גובר גם אחרי המועד; פעילות עתידית (שעון שונה) לא נחשבת', () => {
    const after = new Date('2026-07-09T10:00:00Z')
    expect(lessonState({ now: after, dueAt: due, lastActivityAt: new Date(after.getTime() - 60_000) })).toBe('active_now')
    expect(lessonState({ now, dueAt: due, lastActivityAt: new Date(now.getTime() + 60_000) })).toBe('open')
  })
})

describe('isLate — סשן שהושלם אחרי המועד', () => {
  const due = '2026-07-08T20:59:00.000Z'
  it('כן / לא / חסר מידע', () => {
    expect(isLate('2026-07-08T21:00:00Z', due)).toBe(true)
    expect(isLate('2026-07-08T20:59:00Z', due)).toBe(false)
    expect(isLate('2026-07-01T10:00:00Z', due)).toBe(false)
    expect(isLate(null, due)).toBe(false)
    expect(isLate('2026-07-09T10:00:00Z', null)).toBe(false)
  })
})

describe('formatIsraelDate', () => {
  it('יום וחודש בעברית לפי שעון ישראל (גם כש-UTC עדיין ביום הקודם)', () => {
    expect(formatIsraelDate('2026-07-08T20:59:00.000Z')).toBe('8 ביולי')
    expect(formatIsraelDate('2026-07-08T21:30:00.000Z')).toBe('9 ביולי')
    expect(formatIsraelDate('2027-01-17T21:59:00.000Z')).toBe('17 בינואר')
  })
})
