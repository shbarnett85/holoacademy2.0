import { describe, expect, it } from 'vitest'
import { DEFAULT_LAB_MOODS, HOLO_MOODS, HOLO_MOOD_LABELS, labMoodsOf, normalizeHoloMood } from './holoMoods'

describe('normalizeHoloMood', () => {
  it('מקבל כל ערך ברשימה, באנגלית ובעברית', () => {
    expect(HOLO_MOODS).toHaveLength(9)
    for (const m of HOLO_MOODS) {
      expect(normalizeHoloMood(m)).toBe(m)
      expect(normalizeHoloMood(HOLO_MOOD_LABELS[m])).toBe(m)
    }
    expect(normalizeHoloMood(' SAD ')).toBe('sad')
  })
  it('ערך שלא ברשימה הופך לרגיל', () => {
    for (const v of ['furious', 'a joyful, proud smile', '', null, undefined, 3, {}]) expect(normalizeHoloMood(v)).toBe('neutral')
  })
})

describe('labMoodsOf', () => {
  it('שיעור בלי השדה מקבל את ברירות המחדל', () => {
    for (const v of [undefined, null, 'x']) expect(labMoodsOf(v)).toEqual(DEFAULT_LAB_MOODS)
    expect(DEFAULT_LAB_MOODS).toEqual({ opening: 'neutral', closed: 'happy', open: 'sad' })
  })
  it('שדה קיים: כל ערך נבדק לבד', () => {
    expect(labMoodsOf({ opening: 'scared', closed: 'חוגג' })).toEqual({ opening: 'scared', closed: 'celebrating', open: 'sad' })
    expect(labMoodsOf({ opening: 'lol', closed: 'lol' })).toMatchObject({ opening: 'neutral', closed: 'neutral' })
  })
  it('סיפור פתוח תמיד עצוב, גם כשנשמר משהו אחר', () => {
    for (const open of ['thinking', 'angry', 'scared', 'lol', undefined]) expect(labMoodsOf({ opening: 'happy', closed: 'happy', open }).open).toBe('sad')
  })
})
