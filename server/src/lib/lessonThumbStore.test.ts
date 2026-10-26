import { describe, expect, it, vi } from 'vitest'

/* אם thumbsFor ניגשת ל-DB כשהשורה כבר נושאת את העמודות — הבדיקה נכשלת */
vi.mock('./supabase.js', () => ({ supabaseAdmin: { from: () => { throw new Error('אסור לגשת ל-DB') } }, supabaseAnon: {} }))

import { fastThumbUrl, resolveThumb, thumbPublicId, thumbsFor, THUMB_HEIGHT, THUMB_WIDTH, thumbGenerationEnabled } from './lessonThumbStore.js'

const SB = 'https://abc.supabase.co/storage/v1/object/public/quest-images/holoacademy/q1/scene_2.png'
const CL = 'https://res.cloudinary.com/demo/image/upload/v1700000000/holoacademy/q2/scene_2.jpg'

describe('תמונה ממוזערת שמורה לשיעור', () => {
  it('מזהה הקובץ יציב לשיעור+מקור, ומשתנה כשהמקור משתנה (לא מוגש מהמטמון תמונה ישנה)', () => {
    expect(thumbPublicId('q1', SB)).toBe(thumbPublicId('q1', SB))
    expect(thumbPublicId('q1', SB)).not.toBe(thumbPublicId('q1', SB.replace('scene_2', 'scene_2_b')))
    expect(thumbPublicId('q1', SB)).not.toBe(thumbPublicId('q2', SB))
    expect(thumbPublicId('q1', SB)).toMatch(/^q1-[0-9a-f]{8}$/)
  })

  it('ממוזערת שמורה מאותו מקור — מוצגת ואין צורך ליצור', () => {
    const r = resolveThumb(SB, { url: 'https://res.cloudinary.com/x/t.jpg', src: SB })
    expect(r).toEqual({ url: 'https://res.cloudinary.com/x/t.jpg', needsGeneration: false })
  })

  it('אין שמורה, או שהמקור התחלף: צריך ליצור, ובינתיים מציגים כתובת מהירה (לא נחסם)', () => {
    expect(resolveThumb(SB, undefined)).toEqual({ url: SB, needsGeneration: true })
    expect(resolveThumb(SB, { url: 'https://res.cloudinary.com/x/old.jpg', src: 'https://other/old.png' })).toEqual({ url: SB, needsGeneration: true })
    expect(resolveThumb(SB, { url: null, src: null }).needsGeneration).toBe(true)
  })

  it('שיעור בלי תמונה: אין כתובת ואין יצירה', () => {
    expect(resolveThumb(null, undefined)).toEqual({ url: null, needsGeneration: false })
  })

  it('תמונה שכבר ב-Cloudinary מקבלת כתובת מומרת (חיתוך 480×360 מה-CDN); מקור אחר נשאר כמו שהוא', () => {
    expect(THUMB_WIDTH).toBe(480)
    expect(THUMB_HEIGHT).toBe(360)
    expect(fastThumbUrl(CL)).toBe('https://res.cloudinary.com/demo/image/upload/c_fill,g_auto,w_480,h_360,f_auto,q_auto/v1700000000/holoacademy/q2/scene_2.jpg')
    expect(fastThumbUrl(SB)).toBe(SB)
  })

  it('בבדיקות ובלי Cloudinary לא יוצרים תמונות', () => {
    expect(thumbGenerationEnabled()).toBe(false)
  })
})

describe('thumbsFor — שורות שנשלפו עם עמודות התמונה הממוזערת', () => {
  const game = (img: string | null) => ({ entrySceneId: 'a', scenes: [{ id: 'a', imageUrl: 'lab.png', nextSceneId: 'b' }, { id: 'b', imageUrl: img ?? undefined }] })

  it('בלי שאילתה נוספת: שמורה מהמקור הנוכחי — היא; מקור שהתחלף — המקור; בלי תמונה — null', async () => {
    const m = await thumbsFor([
      { id: 'q1', game_data: game('world.png'), thumb_url: 'https://res.cloudinary.com/x/q1.jpg', thumb_src: 'world.png' },
      { id: 'q2', game_data: game('world2.png'), thumb_url: 'https://res.cloudinary.com/x/old.jpg', thumb_src: 'older.png' },
      { id: 'q3', game_data: { scenes: [{ id: 'a' }] }, thumb_url: null, thumb_src: null },
      { id: 'q4', game_data: game('w4.png'), thumb_url: null, thumb_src: null },
    ])
    expect(m.get('q1')).toBe('https://res.cloudinary.com/x/q1.jpg')
    expect(m.get('q2')).toBe('world2.png')
    expect(m.get('q3')).toBeNull()
    expect(m.get('q4')).toBe('w4.png')
  })
})
