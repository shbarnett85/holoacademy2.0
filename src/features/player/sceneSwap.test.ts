import { describe, expect, it } from 'vitest'
import { PAGE_TEXT_IN_MS, PAGE_TEXT_OUT_MS, PAGE_TURN_MS, pageTextDelayMs, planPageTurn, planSceneSwap, sceneSwapMs } from './sceneSwap'

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

describe('דפדוף בין עמודים (עמודת הטקסט)', () => {
  it('כ-250 מילישניות: יציאה ואז כניסה', () => {
    expect(PAGE_TURN_MS).toBe(PAGE_TEXT_OUT_MS + PAGE_TEXT_IN_MS)
    expect(PAGE_TURN_MS).toBeGreaterThanOrEqual(200)
    expect(PAGE_TURN_MS).toBeLessThanOrEqual(300)
  })
  it('החלקה בעוצמה בינונית ומלאה, דהייה בעדינה', () => {
    expect(planPageTurn({ wormhole: false, reduced: false, level: 'medium' })).toBe('slide')
    expect(planPageTurn({ wormhole: false, reduced: false, level: 'full' })).toBe('slide')
    expect(planPageTurn({ wormhole: false, reduced: false, level: 'gentle' })).toBe('fade')
  })
  it('תנועה מופחתת וחור-תולעת: החלפה מיידית', () => {
    expect(planPageTurn({ wormhole: false, reduced: true, level: 'full' })).toBe('none')
    expect(planPageTurn({ wormhole: true, reduced: false, level: 'full' })).toBe('none')
    expect(pageTextDelayMs('none')).toBe(0)
    expect(pageTextDelayMs('slide')).toBe(PAGE_TEXT_OUT_MS)
    expect(pageTextDelayMs('fade')).toBe(PAGE_TEXT_OUT_MS)
  })
})
