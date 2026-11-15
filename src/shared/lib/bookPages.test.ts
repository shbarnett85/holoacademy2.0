import { describe, expect, it } from 'vitest'
import { bookmarkPage, pageNumberOf } from './bookPages'

const scenes = [{ id: 'lab' }, { id: 'hub' }, { id: 'a' }, { id: 'b' }, { id: 'end' }]

describe('מספר העמוד: המקום של העמוד בספר', () => {
  it('העמוד הראשון הוא 1', () => {
    expect(pageNumberOf(scenes, 'lab')).toBe(1)
    expect(pageNumberOf(scenes, 'b')).toBe(4)
  })
  it('עמוד שלא קיים, או בלי נתונים: אין מספר', () => {
    expect(pageNumberOf(scenes, 'zzz')).toBeNull()
    expect(pageNumberOf(scenes, null)).toBeNull()
    expect(pageNumberOf([], 'lab')).toBeNull()
    expect(pageNumberOf(undefined, 'lab')).toBeNull()
  })
})

describe('הסימנייה במדף הספרים', () => {
  it('העמוד של הקריאה הפתוחה', () => {
    expect(bookmarkPage(scenes, [{ completed_at: null, last_seen_at: '2026-11-01T10:00:00Z', live: { sceneId: 'a' } }])).toBe(3)
  })
  it('קריאה שהושלמה לא נותנת סימנייה', () => {
    expect(bookmarkPage(scenes, [{ completed_at: '2026-11-01T10:00:00Z', live: { sceneId: 'a' } }])).toBeNull()
  })
  it('כמה קריאות פתוחות: האחרונה שנראתה', () => {
    expect(bookmarkPage(scenes, [
      { completed_at: null, last_seen_at: '2026-11-01T10:00:00Z', live: { sceneId: 'a' } },
      { completed_at: null, last_seen_at: '2026-11-03T10:00:00Z', live: { sceneId: 'b' } },
    ])).toBe(4)
  })
  it('בלי דופק חי, או עם עמוד שלא קיים: אין מספר', () => {
    expect(bookmarkPage(scenes, [{ completed_at: null, live: null }])).toBeNull()
    expect(bookmarkPage(scenes, [{ completed_at: null, live: { sceneId: 'zzz' } }])).toBeNull()
    expect(bookmarkPage(scenes, [{ completed_at: null, live: { sceneId: 7 } }])).toBeNull()
    expect(bookmarkPage(scenes, [])).toBeNull()
  })
})
