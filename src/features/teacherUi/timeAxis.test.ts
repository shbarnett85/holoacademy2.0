import { describe, expect, it } from 'vitest'
import { buildTimeAxis } from './timeAxis'

describe('buildTimeAxis', () => {
  it('מתפרש על חודשים שלמים עם שמות עבריים', () => {
    const a = buildTimeAxis({ from: '2025-11-20', to: '2026-02-03', x0: 0, x1: 400 })
    expect(a.ticks.map((t) => t.label)).toEqual(['נובמבר', 'דצמבר', 'ינואר', 'פברואר'])
    expect(a.ticks[0].xStart).toBe(0)
    expect(a.ticks[3].xEnd).toBeCloseTo(400, 5)
  })

  it('שנה מוצגת בחודש הראשון ובכל ינואר בלבד', () => {
    const a = buildTimeAxis({ from: '2025-11-20', to: '2026-02-03', x0: 0, x1: 400 })
    expect(a.ticks.map((t) => t.year)).toEqual([2025, undefined, 2026, undefined])
  })

  it('מדלל תוויות כשצפוף, אבל לא מתחת לרווח המינימלי', () => {
    const a = buildTimeAxis({ from: '2025-09-01', to: '2026-06-30', x0: 0, x1: 300, minLabelGap: 64 })
    const shown = a.ticks.filter((t) => t.showLabel)
    expect(shown.length).toBeLessThan(a.ticks.length)
    for (let i = 1; i < shown.length; i++) expect(shown[i].xMid - shown[i - 1].xMid).toBeGreaterThanOrEqual(64 - 1e-6)
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
