import { describe, expect, it } from 'vitest'
import { planSceneSwap, sceneSwapMs } from './sceneSwap'

const base = { wormhole: false, reduced: false, level: 'medium' as const, sameImage: false }

describe('planSceneSwap', () => {
  it('סריקה בעוצמה בינונית ומלאה', () => {
    expect(planSceneSwap(base)).toBe('scan')
    expect(planSceneSwap({ ...base, level: 'full' })).toBe('scan')
  })
  it('דהייה בעוצמה עדינה (גם אחרי ירידה אוטומטית במחשב חלש)', () => {
    expect(planSceneSwap({ ...base, level: 'gentle' })).toBe('fade')
  })
  it('בלי אנימציה: תנועה מופחתת, חור-תולעת, אותה תמונה', () => {
    expect(planSceneSwap({ ...base, reduced: true })).toBe('cut')
    expect(planSceneSwap({ ...base, wormhole: true })).toBe('cut')
    expect(planSceneSwap({ ...base, sameImage: true })).toBe('cut')
    expect(planSceneSwap({ ...base, level: 'gentle', reduced: true })).toBe('cut')
  })
})

describe('sceneSwapMs', () => {
  it('המעבר קצר משנייה בכל עוצמה, והעוצמה העדינה הכי קצרה', () => {
    for (const l of ['gentle', 'medium', 'full'] as const) expect(sceneSwapMs(l)).toBeLessThan(1000)
    expect(sceneSwapMs('gentle')).toBeLessThan(sceneSwapMs('medium'))
  })
})
