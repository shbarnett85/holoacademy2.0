import { describe, expect, it } from 'vitest'
import { STORY_FONT_MIN_LEVEL, usesStoryFont } from './storyFont'

describe('גופן הסיפור לפי רמת הטקסט', () => {
  it('מהסף ומעלה: גופן הסיפור', () => {
    expect(usesStoryFont(STORY_FONT_MIN_LEVEL)).toBe(true)
    expect(usesStoryFont(12)).toBe(true)
    expect(usesStoryFont(20)).toBe(true)
  })
  it('מתחת לסף: הגופן הקיים', () => {
    expect(usesStoryFont(STORY_FONT_MIN_LEVEL - 1)).toBe(false)
    expect(usesStoryFont(1)).toBe(false)
  })
  it('שיעור בלי רמת טקסט: הגופן הקיים', () => {
    expect(usesStoryFont(undefined)).toBe(false)
    expect(usesStoryFont(null)).toBe(false)
    expect(usesStoryFont(Number.NaN)).toBe(false)
  })
  it('הסף הוא 8 מתוך 20', () => {
    expect(STORY_FONT_MIN_LEVEL).toBe(8)
  })
})
