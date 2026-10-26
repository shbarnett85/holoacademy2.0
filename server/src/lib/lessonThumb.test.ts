import { describe, expect, it } from 'vitest'
import { lessonThumbUrl } from './lessonThumb.js'

describe('lessonThumbUrl', () => {
  const gd = { entrySceneId: 'a', scenes: [{ id: 'a', imageUrl: 'lab.png', nextSceneId: 'b' }, { id: 'b', imageUrl: 'world.png' }, { id: 'c', imageUrl: 'x.png' }] }
  it('הסצנה השנייה (עולם התוכן), לא מעבדת הפתיחה', () => {
    expect(lessonThumbUrl(gd)).toBe('world.png')
  })
  it('אין תמונה בשנייה → הפתיחה; אין בפתיחה → כל תמונה; אין בכלל → null', () => {
    expect(lessonThumbUrl({ ...gd, scenes: [{ id: 'a', imageUrl: 'lab.png', nextSceneId: 'b' }, { id: 'b' }] })).toBe('lab.png')
    expect(lessonThumbUrl({ entrySceneId: 'a', scenes: [{ id: 'a', nextSceneId: 'b' }, { id: 'b' }, { id: 'c', imageUrl: 'x.png' }] })).toBe('x.png')
    expect(lessonThumbUrl({ scenes: [{ id: 'a' }] })).toBeNull()
    expect(lessonThumbUrl(null)).toBeNull()
    expect(lessonThumbUrl({ scenes: [] })).toBeNull()
  })
  it('בלי nextSceneId — הסצנה שאחרי הפתיחה לפי הסדר', () => {
    expect(lessonThumbUrl({ entrySceneId: 'a', scenes: [{ id: 'a', imageUrl: 'lab.png' }, { id: 'b', imageUrl: 'world.png' }] })).toBe('world.png')
  })
})
