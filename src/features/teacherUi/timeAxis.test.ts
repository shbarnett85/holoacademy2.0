import { describe, expect, it } from 'vitest'
import { buildTimeAxis, sharedAxisRange } from './timeAxis'

describe('buildTimeAxis', () => {
  it('מתפרש על חודשים שלמים עם שמות עבריים', () => {
    const a = buildTimeAxis({ from: '2025-11-20', to: '2026-02-03', x0: 0, x1: 400 })
    expect(a.ticks.map((t) => t.label)).toEqual(['נובמבר', 'דצמבר', 'ינואר', 'פברואר'])
    expect(a.ticks[0].xStart).toBe(0)
    expect(a.ticks[3].xEnd).toBeCloseTo(400, 5)
  })

  it('שנה מוצגת בתווית הראשונה ובכל תווית שהשנה בה השתנתה (כשכל החודשים מסומנים: בחודש הראשון ובינואר)', () => {
    const a = buildTimeAxis({ from: '2025-11-20', to: '2026-02-03', x0: 0, x1: 400 })
    expect(a.ticks.map((t) => t.year)).toEqual([2025, undefined, 2026, undefined])
  })

  it('מדלל תוויות כשצפוף, אבל לא מתחת לרווח המינימלי', () => {
    const a = buildTimeAxis({ from: '2025-09-01', to: '2026-06-30', x0: 0, x1: 300, minLabelGap: 64 })
    const shown = a.ticks.filter((t) => t.showLabel)
    expect(shown.length).toBeLessThan(a.ticks.length)
    for (let i = 1; i < shown.length; i++) expect(shown[i].xMid - shown[i - 1].xMid).toBeGreaterThanOrEqual(64 - 1e-6)
  })

  it('החודש האחרון תמיד מסומן, גם כשהציר מדולל', () => {
    for (const w of [200, 300, 420, 640]) {
      const a = buildTimeAxis({ from: '2025-06-01', to: '2026-10-31', x0: 0, x1: w })
      expect(a.ticks[a.ticks.length - 1].showLabel).toBe(true)
    }
    /* ובכל ציר אחר שנבנה (חודשים שונים, מספר חודשים אי-זוגי) */
    for (const to of ['2026-01-10', '2026-02-10', '2026-03-10', '2026-07-10', '2026-12-10']) {
      const a = buildTimeAxis({ from: '2025-02-01', to, x0: 0, x1: 260 })
      expect(a.ticks[a.ticks.length - 1].showLabel).toBe(true)
    }
  })

  it('השנה מודפסת על התווית הראשונה אחרי חילופי שנה גם כשינואר עצמו אינו מסומן (דילול)', () => {
    /* ספטמבר 2025 → יוני 2026 ב-300px: דילול של 3 חודשים; ינואר אינו מסומן */
    const a = buildTimeAxis({ from: '2025-09-01', to: '2026-06-30', x0: 0, x1: 300, minLabelGap: 64 })
    const jan = a.ticks.find((t) => t.label === 'ינואר')
    expect(jan?.showLabel).toBe(false)
    const shown = a.ticks.filter((t) => t.showLabel)
    expect(shown[0].year).toBe(2025)
    const firstOf2026 = shown.find((t) => new Date(t.iso).getUTCFullYear() === 2026)
    expect(firstOf2026?.year).toBe(2026)
    /* אין שנה על תווית שהשנה בה זהה לקודמת, ואין שנה על חודש שלא מסומן */
    expect(shown.filter((t) => t.year !== undefined)).toHaveLength(2)
    expect(a.ticks.filter((t) => !t.showLabel).every((t) => t.year === undefined)).toBe(true)
  })

  it('שנה בציר שחוצה שתי שנים תמיד מופיעה פעמיים לפחות (תחילה וחילוף)', () => {
    for (const w of [180, 260, 400, 700]) {
      const a = buildTimeAxis({ from: '2025-06-01', to: '2026-10-31', x0: 0, x1: w })
      const years = a.ticks.filter((t) => t.year !== undefined).map((t) => t.year)
      expect(years[0]).toBe(new Date(a.ticks.find((t) => t.showLabel)!.iso).getUTCFullYear())
      expect(years).toContain(2026)
    }
  })

  it('xOf ממקם לפי תאריך אמיתי וחוסם לטווח', () => {
    const a = buildTimeAxis({ from: '2026-01-10', to: '2026-03-10', x0: 10, x1: 310 })
    expect(a.xOf('2026-01-01')).toBe(10)
    expect(a.xOf('2025-01-01')).toBe(10)
    expect(a.xOf('2030-01-01')).toBeCloseTo(310, 5)
    expect(a.xOf('2026-02-01')).toBeGreaterThan(a.xOf('2026-01-15'))
  })

  it('חודש בודד → תג אחד; הטווח ההפוך זהה', () => {
    const one = buildTimeAxis({ from: '2026-03-05', to: '2026-03-25', x0: 0, x1: 100 })
    expect(one.ticks).toHaveLength(1)
    expect(one.ticks[0].label).toBe('מרץ')
    expect(one.ticks[0].year).toBe(2026)
    const rev = buildTimeAxis({ from: '2026-03-25', to: '2026-01-05', x0: 0, x1: 100 })
    expect(rev.ticks.map((t) => t.label)).toEqual(['ינואר', 'פברואר', 'מרץ'])
  })

  it('אותו קלט → אותו ציר בכל גרף (דטרמיניסטי)', () => {
    const o = { from: '2025-09-01', to: '2026-06-30', x0: 40, x1: 700 }
    const a = buildTimeAxis(o), b = buildTimeAxis(o)
    expect(a.ticks).toEqual(b.ticks)
    expect(a.xOf('2026-01-15')).toBe(b.xOf('2026-01-15'))
  })
})

describe('sharedAxisRange', () => {
  it('לפחות 12 חודשים, גם כשיש נתונים של כמה חודשים בלבד', () => {
    const r = sharedAxisRange(['2026-08-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z'])
    expect(r).toEqual({ from: '2025-11-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' })
  })

  it('מתרחב אחורה כשיש נתונים מוקדמים יותר מ-12 חודשים', () => {
    const r = sharedAxisRange(['2025-06-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z'])
    expect(r).toEqual({ from: '2025-06-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' })
  })

  it('now מאריך את הציר עד החודש הנוכחי', () => {
    const r = sharedAxisRange(['2026-03-15T00:00:00.000Z'], { now: '2026-10-20T12:00:00.000Z' })
    expect(r?.to).toBe('2026-10-01T00:00:00.000Z')
    expect(r?.from).toBe('2025-11-01T00:00:00.000Z')
  })

  it('שני גרפים באותו מסך מקבלים את אותו טווח כשהטווח נגזר מכל התאריכים יחד', () => {
    const a = ['2026-02-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z']
    const b = ['2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z']
    const shared = sharedAxisRange([...a, ...b])
    const axisA = buildTimeAxis({ ...shared!, x0: 40, x1: 640 })
    const axisB = buildTimeAxis({ ...shared!, x0: 40, x1: 640 })
    expect(axisA.ticks.map((t) => t.iso)).toEqual(axisB.ticks.map((t) => t.iso))
    expect(axisA.xOf('2026-09-01')).toBe(axisB.xOf('2026-09-01'))
  })

  it('בלי תאריכים ובלי now אין טווח', () => {
    expect(sharedAxisRange([])).toBeNull()
    expect(sharedAxisRange(['לא תאריך'])).toBeNull()
  })

  it('minMonths מכוון את המינימום', () => {
    const r = sharedAxisRange(['2026-10-01T00:00:00.000Z'], { minMonths: 6 })
    expect(r).toEqual({ from: '2026-05-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' })
  })
})
