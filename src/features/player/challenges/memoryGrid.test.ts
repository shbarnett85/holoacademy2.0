import { describe, expect, it } from 'vitest'
import { memoryGrid } from './memoryGrid'

describe('memoryGrid', () => {
  it('ריבוע כשאפשר', () => {
    expect(memoryGrid(4)).toEqual({ cols: 2, rows: 2 })
    expect(memoryGrid(16)).toEqual({ cols: 4, rows: 4 })
    expect(memoryGrid(36)).toEqual({ cols: 6, rows: 6 })
  })
  it('אחרת המלבן הקרוב ביותר לריבוע', () => {
    expect(memoryGrid(6)).toEqual({ cols: 3, rows: 2 })
    expect(memoryGrid(12)).toEqual({ cols: 4, rows: 3 })
    expect(memoryGrid(20)).toEqual({ cols: 5, rows: 4 })
    expect(memoryGrid(28)).toEqual({ cols: 7, rows: 4 })
  })
  it('הצד הקצר לא משתנה לפי החלון, רק הכיוון', () => {
    expect(memoryGrid(12, 400, 700)).toEqual({ cols: 3, rows: 4 })
    expect(memoryGrid(12, 700, 400)).toEqual({ cols: 4, rows: 3 })
  })
})
