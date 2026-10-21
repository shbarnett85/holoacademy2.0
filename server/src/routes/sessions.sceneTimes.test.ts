/* כלל "אורך טקסט לתלמיד" — תיעוד עמודים ב-complete: sceneTimes[].pages/pageMs.
   הסכמה סובלנית: ערך פגום נזרק (catch → undefined) ולא מפיל את ה-complete (אחרת מאבדים את כל האנליטיקה של המשחק). */
import { describe, expect, it } from 'vitest'
import { sceneTimeSchema } from './sessions.js'

describe('sceneTimeSchema — עמודי טקסט וזמן לכל עמוד', () => {
  it('עמודים וזמנים תקינים עוברים כמות שהם, יחד עם שדות 1B', () => {
    const r = sceneTimeSchema.parse({ sceneId: 's1', dwellMs: 41000, wordCount: 108, closedDwellMs: 40500, pages: 3, pageMs: [12559, 10782, 13025] })
    expect(r).toMatchObject({ sceneId: 's1', dwellMs: 41000, wordCount: 108, closedDwellMs: 40500, pages: 3, pageMs: [12559, 10782, 13025] })
  })
  it('קליינט ישן בלי השדות — תקין, השדות נעדרים', () => {
    const r = sceneTimeSchema.parse({ sceneId: 's1', dwellMs: 900 })
    expect(r.pages).toBeUndefined()
    expect(r.pageMs).toBeUndefined()
  })
  it('ערכים פגומים נזרקים בשקט — לא מפילים את השליחה', () => {
    const r = sceneTimeSchema.parse({ sceneId: 's1', dwellMs: 900, pages: 0, pageMs: [-5, 10] })
    expect(r.pages).toBeUndefined()
    expect(r.pageMs).toBeUndefined()
    expect(sceneTimeSchema.parse({ sceneId: 's1', dwellMs: 900, pages: 999 }).pages).toBeUndefined()
    expect(sceneTimeSchema.parse({ sceneId: 's1', dwellMs: 900, pages: 2.5 }).pages).toBeUndefined()
    expect(sceneTimeSchema.parse({ sceneId: 's1', dwellMs: 900, pageMs: new Array(51).fill(1) }).pageMs).toBeUndefined()
    expect(sceneTimeSchema.parse({ sceneId: 's1', dwellMs: 900, pageMs: 'x' }).pageMs).toBeUndefined()
  })
  it('שדות החובה נשארו חובה (dwellMs לא שלילי)', () => {
    expect(sceneTimeSchema.safeParse({ sceneId: 's1', dwellMs: -1 }).success).toBe(false)
    expect(sceneTimeSchema.safeParse({ dwellMs: 1 }).success).toBe(false)
  })
})
