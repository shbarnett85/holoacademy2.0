import { describe, expect, it } from 'vitest'
import { labelEvery, layoutMarkers, niceScale, pickBandLabelY, plotIso } from './chartMath'

describe('plotIso', () => {
  it('תחילת חודש (00:00 UTC) נעה לאמצע החודש; תאריך מדויק נשאר כמות שהוא', () => {
    expect(plotIso('2026-04-01T00:00:00.000Z')).toBe('2026-04-15T00:00:00.000Z')
    expect(plotIso('2026-04-26T12:00:00.000Z')).toBe('2026-04-26T12:00:00.000Z')
    expect(plotIso('2026-04-01T09:30:00.000Z')).toBe('2026-04-01T09:30:00.000Z')
  })
})

describe('niceScale', () => {
  it('ציר של מספרים שלמים שמכסה את הערכים, עד כ-5 סימונים', () => {
    const s = niceScale(8.5, 13.3)
    expect(s.lo).toBeLessThanOrEqual(8.5)
    expect(s.hi).toBeGreaterThanOrEqual(13.3)
    expect(s.ticks.length).toBeLessThanOrEqual(6)
    expect(s.ticks.every(Number.isInteger)).toBe(true)
    expect(s.ticks[0]).toBe(s.lo)
    expect(s.ticks[s.ticks.length - 1]).toBe(s.hi)
  })
  it('טווח אפס או קטן מאוד עדיין נותן lo < hi', () => {
    const s = niceScale(10, 10)
    expect(s.hi).toBeGreaterThan(s.lo)
    expect(niceScale(7.2, 7.4).hi).toBeGreaterThan(niceScale(7.2, 7.4).lo)
  })
  it('טווח רחב עובר לקפיצות גדולות יותר', () => {
    const s = niceScale(0, 100)
    expect(s.ticks.length).toBeLessThanOrEqual(6)
  })
})

describe('layoutMarkers', () => {
  it('סימונים רחוקים נשארים בשורה אחת', () => {
    expect(layoutMarkers([{ m: 'a', x: 10 }, { m: 'b', x: 100 }]).map((p) => p.row)).toEqual([0, 0])
  })
  it('סימונים קרובים מתחלפים בין שתי שורות כדי לא לחפוף', () => {
    const rows = layoutMarkers([{ m: 'a', x: 10 }, { m: 'b', x: 20 }, { m: 'c', x: 30 }, { m: 'd', x: 200 }]).map((p) => p.row)
    expect(rows).toEqual([0, 1, 0, 0])
  })
  it('ריק → ריק', () => { expect(layoutMarkers([])).toEqual([]) })
})

describe('labelEvery', () => {
  it('רווח גדול — תווית לכל נקודה; צפוף — דילול', () => {
    expect(labelEvery([0, 50, 100])).toBe(1)
    expect(labelEvery([0, 25, 50])).toBe(2)
    expect(labelEvery([0, 10, 20])).toBe(3)
    expect(labelEvery([5])).toBe(1)
  })
})

describe('pickBandLabelY', () => {
  const base = { top: 100, bottom: 220, fontPx: 14, labelX: [60, 164] as [number, number] }
  it('בלי התנגשות — למעלה, בתוך הרצועה', () => {
    expect(pickBandLabelY({ ...base, points: [{ x: 300, y: 150 }] })).toBe(100 + 6 + 14)
  })
  it('נקודה קרובה לקצה העליון בתחילת הגרף — השם יורד לתחתית הרצועה', () => {
    expect(pickBandLabelY({ ...base, points: [{ x: 70, y: 112 }] })).toBe(220 - 6)
  })
  it('נקודות רחוקות אופקית מהשם לא מתנגשות', () => {
    expect(pickBandLabelY({ ...base, points: [{ x: 400, y: 112 }] })).toBe(100 + 6 + 14)
  })
  it('שני המקומות תפוסים — נשאר למעלה', () => {
    expect(pickBandLabelY({ ...base, points: [{ x: 70, y: 112 }, { x: 100, y: 215 }] })).toBe(100 + 6 + 14)
  })
})
