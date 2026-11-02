import { describe, expect, it } from 'vitest'
import { gameDataSchema, applyLabPolicy, isEstablishingScene, type GameData } from './questSchemas.js'
import { buildQuestPrompt } from '../prompts/questPrompt.js'

const raw = (extra: Record<string, unknown> = {}) => ({
  entrySceneId: 'lab',
  scenes: [
    { id: 'lab', title: 'מעבדה', imagePrompt: 'lab, {DR_HOLO} near a portal', drHoloExpression: 'worried', nextSceneId: 's1' },
    { id: 's1', title: 'שוק', imagePrompt: 'a market, {DR_HOLO} pointing at a stall , sunny', drHoloExpression: 'happy', nextSceneId: null },
  ],
  endingGood: { title: 'א', narrative: 'ב', imagePrompt: 'x {DR_HOLO}', drHoloExpression: 'y' },
  endingBad: { title: 'א', narrative: 'ב', imagePrompt: 'x {DR_HOLO}', drHoloExpression: 'y' },
  ...extra,
})

const parsed = (extra?: Record<string, unknown>) => {
  const r = gameDataSchema.safeParse(raw(extra))
  if (!r.success) throw new Error(r.error.message)
  const gd = r.data as unknown as GameData
  applyLabPolicy(gd)
  return gd as unknown as ReturnType<typeof raw> & { holoMoods: unknown }
}

describe('applyLabPolicy', () => {
  it('בלי תמונות פתיחה וסיום ובלי {DR_HOLO} באף פרומפט', () => {
    const gd = parsed()
    expect(JSON.stringify(gd)).not.toContain('{DR_HOLO}')
    expect(JSON.stringify(gd)).not.toContain('drHoloExpression')
    expect(gd.scenes[0].imagePrompt).toBeUndefined()
    expect(gd.endingGood.imagePrompt).toBeUndefined()
    expect(gd.endingBad.imagePrompt).toBeUndefined()
    expect(gd.scenes[1].imagePrompt).toBe('a market, pointing at a stall, sunny')
  })
  it('מעבדה עם פאזל החלפה שומרת על הפרומפט, כי הפאזל בנוי מהתמונה', () => {
    const r = raw()
    ;(r.scenes[0] as Record<string, unknown>).puzzle = { type: 'tileSwap', question: 'סדרו', difficulty: 1 }
    const v = gameDataSchema.safeParse(r)
    if (!v.success) throw new Error(v.error.message)
    applyLabPolicy(v.data as unknown as GameData)
    expect(v.data.scenes[0].imagePrompt).toBe('lab, near a portal')
  })
  it('מצבי רוח: הערך נשמר, וערך שלא ברשימה הופך לרגיל. ערך לא תקין לא מפיל את הוולידציה', () => {
    expect(parsed({ holoMoods: { opening: 'scared', closed: 'חוגג', open: 'furious' } }).holoMoods).toEqual({ opening: 'scared', closed: 'celebrating', open: 'sad' })
    expect(parsed({ holoMoods: 'nope' }).holoMoods).toEqual({ opening: 'neutral', closed: 'happy', open: 'sad' })
  })
})

describe('הפרומפט', () => {
  it('לא מבקש {DR_HOLO} או תמונות לפתיחה ולסיום, ומבקש holoMoods', () => {
    const r = buildQuestPrompt({ title: 'א', curriculum: 'ב', questLength: 5, includeDrHolo: true } as never)
    const p = r.system + r.user
    expect(p).not.toContain('{DR_HOLO}')
    expect(p).not.toContain('"drHoloExpression":')
    expect(p).toContain('holoMoods')
    expect(p).toContain('celebrating')
  })
})

describe('isEstablishingScene', () => {
  const lab = { id: 'lab', nextSceneId: 's1' }
  const s1 = { id: 's1', nextSceneId: 's2' }
  const s2 = { id: 's2' }
  it('הסצנה שאחרי המעבדה, ורק היא', () => {
    const gd = { entrySceneId: 'lab', scenes: [lab, s1, s2] }
    expect(isEstablishingScene(s1, gd)).toBe(true)
    expect(isEstablishingScene(s2, gd)).toBe(false)
    expect(isEstablishingScene(lab, gd)).toBe(false)
  })
  it('לפי הקישור ולא לפי הסדר במערך, וגם במבנה Hub', () => {
    expect(isEstablishingScene(s2, { entrySceneId: 'lab', scenes: [{ id: 'lab', nextSceneId: 's2' }, s1, s2] })).toBe(true)
    expect(isEstablishingScene(s1, { entrySceneId: 'lab', scenes: [{ id: 'lab', choices: [{ nextSceneId: 's1' }, { nextSceneId: 's2' }] }, s1, s2] })).toBe(true)
  })
  it('מעבדה עם פאזל החלפה: גם תמונתה בלי דמויות', () => {
    const labPuzzle = { id: 'lab', nextSceneId: 's1', puzzle: { type: 'tileSwap' } }
    expect(isEstablishingScene(labPuzzle, { entrySceneId: 'lab', scenes: [labPuzzle, s1] })).toBe(true)
  })
})
