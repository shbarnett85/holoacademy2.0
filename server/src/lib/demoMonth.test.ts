import { describe, expect, it } from 'vitest'
import { DEMO_MONTHS, WORLD_LESSONS, addMonthsKeepDay, anchorMonth, lessonSendDates, monthsToShift, schoolDay, studentStart } from './demoMonth.js'

const IL = (iso: string) => new Date(iso)

describe('anchorMonth: החודש האחרון של הנתונים הוא החודש הקודם', () => {
  it('נכנסים בנובמבר — אוקטובר; בדצמבר — נובמבר; בינואר — דצמבר של השנה הקודמת', () => {
    expect(anchorMonth(IL('2026-11-09T10:00:00Z'))).toEqual({ year: 2026, month1: 10 })
    expect(anchorMonth(IL('2026-12-01T10:00:00Z'))).toEqual({ year: 2026, month1: 11 })
    expect(anchorMonth(IL('2027-01-15T10:00:00Z'))).toEqual({ year: 2026, month1: 12 })
  })
  it('לפי שעון ישראל: 31 באוקטובר בשעה 23:30 בישראל הוא עדיין אוקטובר', () => {
    expect(anchorMonth(IL('2026-10-31T21:30:00Z'))).toEqual({ year: 2026, month1: 9 })
    expect(anchorMonth(IL('2026-10-31T22:30:00Z'))).toEqual({ year: 2026, month1: 10 })
  })
})

describe('addMonthsKeepDay', () => {
  it('אותו יום ואותה שעה, ובסוף חודש קצר — היום האחרון שלו', () => {
    expect(addMonthsKeepDay(IL('2026-10-13T06:30:00Z'), 1).toISOString()).toBe('2026-11-13T06:30:00.000Z')
    expect(addMonthsKeepDay(IL('2027-01-31T06:30:00Z'), 1).toISOString()).toBe('2027-02-28T06:30:00.000Z')
    expect(addMonthsKeepDay(IL('2026-12-20T06:30:00Z'), 2).toISOString()).toBe('2027-02-20T06:30:00.000Z')
  })
})

describe('lessonSendDates', () => {
  const dates = lessonSendDates({ year: 2026, month1: 10 })
  it('15 שיעורים, 5 בכל אחד משלושת החודשים, והאחרונים בחודש העוגן', () => {
    expect(dates).toHaveLength(WORLD_LESSONS.length)
    const months = dates.map((d) => d.getUTCMonth() + 1)
    expect(months.slice(0, 5).every((m) => m === 8)).toBe(true)
    expect(months.slice(5, 10).every((m) => m === 9)).toBe(true)
    expect(months.slice(10).every((m) => m === 10)).toBe(true)
    expect(DEMO_MONTHS).toBe(3)
  })
  it('בימי לימודים בלבד (ראשון עד חמישי), ובסדר עולה', () => {
    for (const d of dates) expect([5, 6]).not.toContain(d.getUTCDay())
    for (let i = 1; i < dates.length; i++) expect(dates[i].getTime()).toBeGreaterThan(dates[i - 1].getTime())
  })
  it('שבת עוברת לראשון ושישי לחמישי', () => {
    expect(schoolDay(2026, 10, 3).getUTCDay()).toBe(0) /* 3.10.2026 הוא שבת */
    expect(schoolDay(2026, 10, 2).getUTCDay()).toBe(4) /* 2.10.2026 הוא שישי */
  })
})

describe('studentStart', () => {
  it('אחרי השליחה, עד שבוע, לא בשישי/שבת, ודטרמיניסטי', () => {
    const sent = schoolDay(2026, 10, 13)
    for (let i = 0; i < 40; i++) {
      const at = studentStart(sent, `s${i}`, 'q')
      expect(at.getTime()).toBeGreaterThan(sent.getTime())
      expect(at.getTime() - sent.getTime()).toBeLessThan(7 * 86_400_000)
      expect([5, 6]).not.toContain(at.getUTCDay())
      expect(studentStart(sent, `s${i}`, 'q').getTime()).toBe(at.getTime())
    }
  })
})

describe('monthsToShift', () => {
  it('הנתונים מאוקטובר: בנובמבר אין הזזה, בדצמבר חודש אחד, במרץ ארבעה (נתוני פברואר)', () => {
    const latest = IL('2026-10-23T06:30:00Z')
    expect(monthsToShift(latest, IL('2026-11-20T10:00:00Z'))).toBe(0)
    expect(monthsToShift(latest, IL('2026-12-02T10:00:00Z'))).toBe(1)
    expect(monthsToShift(latest, IL('2027-03-02T10:00:00Z'))).toBe(4)
  })
  it('נתונים מהחודש הנוכחי (או מהעתיד) לא זזים אחורה', () => {
    expect(monthsToShift(IL('2026-11-05T06:30:00Z'), IL('2026-11-20T10:00:00Z'))).toBe(-1)
  })
})
