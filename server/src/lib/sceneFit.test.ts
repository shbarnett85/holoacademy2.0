import { describe, expect, it, vi } from 'vitest'

/* בדיקות הבטיחות והעובדות פונות ל-LLM — במבחן יחידה מדמים אותן (אין קריאות חיות) */
vi.mock('./contentSafety.js', () => ({ runOutputSafetyCheck: async () => ({ blocked: false }) }))
vi.mock('./factCheck.js', () => ({ runFactCheck: async () => ({ ok: true, errors: [] }) }))

import type { GameData } from './questSchemas.js'
import {
  analyzeQuest, analyzeScene, anchorsOf, buildShortenPrompt, canSplit, enforceSceneFit, missingAnchors, trySplit, verifyShortened,
  type ShortenFn,
} from './sceneFit.js'
import { proposeSceneShortening } from './sceneShorten.js'
import { sceneDisplayText, wordCount } from '../../../src/shared/lib/sceneText.js'

type Scene = GameData['scenes'][number]

const LONG_NARR =
  'בפתח המעבדה עומד גבר בגלימה יוונית, נושם בכבדות, והאבק עדיין דבוק לסנדליו. הוא מספר שבאסיפה הגדולה של אתונה אזרחים מצביעים בהרמת יד על כל החלטה חשובה, ושמישהו זייף את אסימוני ההצבעה. כולם מחכים לתשובה, וגם אתה.'
const SHORT_NARR = 'בפתח המעבדה עומד גבר בגלימה יוונית. באסיפה מצביעים בהרמת יד, ומישהו זייף את האסימונים.'

const mcScene = (id: string, narrative: string, next: string | null, extra: Partial<Scene> = {}): Scene => ({
  id, title: `סצנה ${id}`, narrative, nextSceneId: next,
  puzzle: { type: 'multipleChoice', question: 'כיצד הצביעו אזרחי אתונה באסיפה?', choices: [
    { id: 'a', text: 'בהרמת יד', isCorrect: true }, { id: 'b', text: 'בכתיבה על פפירוס', isCorrect: false }, { id: 'c', text: 'בשליחת מכתב', isCorrect: false },
  ], explanationCorrect: 'נכון, מצביעים בהרמת יד.', explanationIncorrect: 'לא.' } as Scene['puzzle'],
  ...extra,
})
const linear = (id: string, narrative: string, next: string | null, dialog?: string): Scene => ({ id, title: `סצנה ${id}`, narrative, drHoloDialog: dialog, nextSceneId: next })
const gd = (scenes: Scene[]): GameData => ({ scenes, entrySceneId: scenes[0].id } as GameData)

describe('analyzeScene / analyzeQuest', () => {
  it('סצנה קצרה נכנסת, ארוכה חורגת וסופרת עמודים', () => {
    expect(analyzeScene(linear('a', SHORT_NARR, null), 'g5_6').overflow).toBe(false)
    const big = analyzeScene(linear('b', LONG_NARR + ' ' + LONG_NARR, null), 'g5_6')
    expect(big.overflow).toBe(true)
    expect(big.pages).toBeGreaterThan(1)
    expect(analyzeQuest(gd([linear('a', SHORT_NARR, 'b'), linear('b', LONG_NARR + LONG_NARR, null)]), 'g5_6')).toMatchObject({ long: 1, total: 2 })
  })
  it('שאלה/אפשרויות ארוכות מסומנות', () => {
    const s = mcScene('q', SHORT_NARR, null)
    s.puzzle!.question = Array.from({ length: 25 }, () => 'מילה').join(' ') + '?'
    expect(analyzeScene(s, 'g5_6').questionOverflow).toBe(true)
    const t = mcScene('o', SHORT_NARR, null)
    t.puzzle!.choices![0].text = Array.from({ length: 9 }, () => 'מילה').join(' ')
    expect(analyzeScene(t, 'g5_6').optionOverflow).toBe(true)
  })
})

describe('עוגני עובדות (רגרסיה: אתגר הבנת הנקרא)', () => {
  it('התשובה הנכונה שמופיעה בנרטיב היא עוגן', () => {
    const s = mcScene('a', LONG_NARR, null)
    const anchors = anchorsOf(s)
    expect(anchors.some((a) => 'הרמת'.includes(a) || a.includes('הרמת') || a === 'יד')).toBe(true)
  })
  it('קיצור שמשמיט את העובדה נדחה; קיצור ששומר אותה מתקבל', () => {
    const s = mcScene('a', LONG_NARR, null)
    const lost = verifyShortened(s, 'g5_6', { narrative: 'בפתח המעבדה עומד גבר בגלימה יוונית. מישהו זייף את האסימונים.', drHoloDialog: '' })
    expect(lost.ok).toBe(false)
    expect(lost.reasons.join(' ')).toContain('אבדו עובדות')
    const kept = verifyShortened(s, 'g5_6', { narrative: SHORT_NARR, drHoloDialog: '' })
    expect(kept.ok).toBe(true)
  })
  it('missingAnchors סובל הטיות וניקוד', () => {
    expect(missingAnchors(['הרמת'], 'באסיפה מצביעים בְּהַרְמַת יד.')).toEqual([])
    expect(missingAnchors(['פפירוס'], 'באסיפה מצביעים ביד.')).toEqual(['פפירוס'])
  })
  it('מבחן סיכום (finalQuiz) לא מעגן סצנה אחת', () => {
    expect(anchorsOf({ id: 'z', title: 't', narrative: LONG_NARR, puzzle: { type: 'finalQuiz', question: 'q', questions: [] } } as unknown as Scene)).toEqual([])
  })
})

describe('verifyShortened', () => {
  it('לא קוצר / עדיין ארוך / נרטיב ריק — נדחים', () => {
    const s = linear('a', LONG_NARR + ' ' + LONG_NARR, null)
    expect(verifyShortened(s, 'g5_6', { narrative: LONG_NARR + ' ' + LONG_NARR, drHoloDialog: '' }).ok).toBe(false)
    const stillLong = LONG_NARR + ' ' + LONG_NARR.split(' ').slice(0, 25).join(' ')
    expect(analyzeScene(linear('x', stillLong, null), 'g5_6').overflow).toBe(true) /* הנחת יסוד */
    expect(verifyShortened(s, 'g5_6', { narrative: stillLong, drHoloDialog: '' }).reasons.join(' ')).toContain('עדיין לא נכנס')
    expect(verifyShortened(s, 'g5_6', { narrative: '  ', drHoloDialog: '' }).reasons.join(' ')).toContain('נרטיב ריק')
  })
})

describe('buildShortenPrompt', () => {
  it('כולל תקציב, עובדות חובה וצורת פנייה', () => {
    const p = buildShortenPrompt([{ id: 'a', narrative: LONG_NARR, drHoloDialog: '', mustKeep: ['הרמת'], words: 40 }], { band: 'g5_6', budget: 25, form: 'preserve' })
    expect(p).toContain('עד 25 מילים')
    expect(p).toContain('"mustKeep":["הרמת"]')
    expect(p).toContain('שמור בדיוק על צורת הפנייה')
  })
})

describe('trySplit', () => {
  it('סצנה ליניארית ארוכה מתפצלת לשתיים ומשרשרת nextSceneId', () => {
    const long = Array.from({ length: 12 }, (_, i) => `זהו משפט מספר ${i + 1} בסצנה הארוכה מאוד.`).join(' ')
    const data = gd([linear('a', long, 'b'), linear('b', SHORT_NARR, null)])
    const sc = data.scenes[0]
    expect(canSplit(sc)).toBe(true)
    // מתאים רק אם החלוקה הגרידית נותנת שני עמודים — נבדוק על טקסט שמתפצל לשניים בדיוק
    const ok = trySplit(data, sc, 'g5_6')
    if (ok) {
      expect(data.scenes.map((s) => s.id)).toEqual(['a', 'a_b', 'b'])
      expect(data.scenes[0].nextSceneId).toBe('a_b')
      expect(data.scenes[1].nextSceneId).toBe('b')
      for (const s of data.scenes.slice(0, 2)) expect(analyzeScene(s, 'g5_6').overflow).toBe(false)
    } else {
      expect(data.scenes).toHaveLength(2) // לא פוצל — נשאר שלם
    }
  })
  it('סצנה עם אתגר/בחירות/חפץ לא מתפצלת', () => {
    expect(canSplit(mcScene('a', LONG_NARR, null))).toBe(false)
    expect(canSplit({ ...linear('a', LONG_NARR, null), choices: [{ id: 'c', text: 'x', nextSceneId: 'b' }] } as Scene)).toBe(false)
    expect(canSplit({ ...linear('a', LONG_NARR, null), collectableItem: { id: 'k', name: 'מפתח', icon: 'k' } } as unknown as Scene)).toBe(false)
  })
})

describe('enforceSceneFit', () => {
  it('סצנה חורגת מקוצרת בבקשה אחת, והעובדות נשמרות', async () => {
    const data = gd([mcScene('a', LONG_NARR + ' ' + LONG_NARR, 'b'), linear('b', SHORT_NARR, null)])
    const shorten = vi.fn<ShortenFn>(async (items) => items.map((i) => ({ id: i.id, narrative: SHORT_NARR, drHoloDialog: '' })))
    const stats = await enforceSceneFit(data, { level: 10, form: 'plural', shorten })
    expect(shorten).toHaveBeenCalledTimes(1)
    expect(stats).toMatchObject({ overflow: 1, shortened: 1, split: 0, flagged: 0 })
    expect(data.scenes[0].narrative).toBe(SHORT_NARR)
    expect(analyzeScene(data.scenes[0], 'g5_6').overflow).toBe(false)
  })
  it('קיצור שמאבד עובדה נדחה — סצנה עם אתגר מסומנת, לא נשברת', async () => {
    const orig = LONG_NARR + ' ' + LONG_NARR
    const data = gd([mcScene('a', orig, null)])
    const shorten: ShortenFn = async (items) => items.map((i) => ({ id: i.id, narrative: 'גבר בגלימה מדבר עם מישהו.', drHoloDialog: '' }))
    const stats = await enforceSceneFit(data, { level: 10, form: 'plural', shorten })
    expect(stats).toMatchObject({ overflow: 1, shortened: 0, flagged: 1 })
    expect(data.scenes[0].narrative).toBe(orig)
  })
  it('כשל בקריאת הקיצור לא מפיל: סצנה ליניארית מתפצלת או מסומנת', async () => {
    const long = Array.from({ length: 10 }, (_, i) => `משפט מספר ${i + 1} שמספר חלק מהסיפור.`).join(' ')
    const data = gd([linear('a', long, 'b'), linear('b', SHORT_NARR, null)])
    const stats = await enforceSceneFit(data, { level: 10, form: 'plural', shorten: async () => { throw new Error('boom') } })
    expect(stats.overflow).toBe(1)
    expect(stats.split + stats.flagged).toBe(1)
  })
  it('כשהכול נכנס — אין קריאת מודל', async () => {
    const shorten = vi.fn()
    const stats = await enforceSceneFit(gd([linear('a', SHORT_NARR, null)]), { level: 10, form: 'plural', shorten })
    expect(shorten).not.toHaveBeenCalled()
    expect(stats.overflow).toBe(0)
  })
})

describe('proposeSceneShortening (עורך)', () => {
  it('סצנה שנכנסת: needed=false; ארוכה: before/after ובדיקות', async () => {
    const fine = await proposeSceneShortening(linear('a', SHORT_NARR, null), { level: 10 })
    expect(fine.needed).toBe(false)
    const shorten: ShortenFn = async (items) => items.map((i) => ({ id: i.id, narrative: SHORT_NARR, drHoloDialog: '' }))
    const scene = mcScene('a', LONG_NARR + ' ' + LONG_NARR, null)
    const r = await proposeSceneShortening(scene, { level: 10, shorten })
    expect(r).toMatchObject({ needed: true, ok: true })
    expect(r.after!.words).toBeLessThan(r.before!.words)
    expect(r.after!.pages).toBe(1)
  })
  it('קיצור ראשון שעדיין ארוך — ניסיון שני אחד בתקציב קשיח יותר; העובדות נבדקות מול המקור', async () => {
    const STILL_LONG = LONG_NARR + ' ' + LONG_NARR.split(' ').slice(0, 25).join(' ')
    const scene = mcScene('a', LONG_NARR + ' ' + LONG_NARR + ' ' + LONG_NARR, null)
    const shorten = vi.fn<ShortenFn>()
    shorten.mockResolvedValueOnce([{ id: 'a', narrative: STILL_LONG, drHoloDialog: '' }])
    shorten.mockResolvedValueOnce([{ id: 'a', narrative: SHORT_NARR, drHoloDialog: '' }])
    const r = await proposeSceneShortening(scene, { level: 10, shorten })
    expect(shorten).toHaveBeenCalledTimes(2)
    expect(shorten.mock.calls[1][1].budget).toBeLessThan(shorten.mock.calls[0][1].budget)
    expect(r).toMatchObject({ needed: true, ok: true })
  })
  it('ניסיון שני שנכשל לא נוסף על הראשון: מחזיר את הסיבה האחרונה ולא יותר משני ניסיונות', async () => {
    const STILL_LONG = LONG_NARR + ' ' + LONG_NARR.split(' ').slice(0, 25).join(' ')
    const scene = mcScene('a', LONG_NARR + ' ' + LONG_NARR + ' ' + LONG_NARR, null)
    const shorten = vi.fn<ShortenFn>(async () => [{ id: 'a', narrative: STILL_LONG, drHoloDialog: '' }])
    const r = await proposeSceneShortening(scene, { level: 10, shorten })
    expect(shorten).toHaveBeenCalledTimes(2)
    expect(r.ok).toBe(false)
    expect(r.reasons.join(' ')).toContain('עדיין לא נכנס')
  })
  it('קיצור שאיבד עובדה לא מקבל ניסיון שני (לא "מתקנים" אובדן עובדות בקיצור נוסף)', async () => {
    const scene = mcScene('a', LONG_NARR + ' ' + LONG_NARR, null)
    const shorten = vi.fn<ShortenFn>(async () => [{ id: 'a', narrative: 'גבר בגלימה מדבר עם מישהו.', drHoloDialog: '' }])
    const r = await proposeSceneShortening(scene, { level: 10, shorten })
    expect(shorten).toHaveBeenCalledTimes(1)
    expect(r.ok).toBe(false)
  })
})

describe('סכמות עזר', () => {
  it('sceneDisplayText/wordCount עקביים', () => {
    expect(wordCount(sceneDisplayText({ narrative: 'אחת שתיים', drHoloDialog: 'שלוש' }))).toBe(6) /* 2 + "ד״ר הולו אומר:" (3) + 1 */
  })
})
