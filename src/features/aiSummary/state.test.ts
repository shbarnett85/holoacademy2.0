import { describe, expect, it } from 'vitest'
import {
  ERR_SUMMARY_EMPTY_EDIT, ERR_SUMMARY_LOAD, ERR_SUMMARY_SAVE, ERR_SUMMARY_WRITE, ERR_V2_FORBIDDEN, ERR_V2_NOT_FOUND, ERR_V2_RATE_LIMIT, ERR_V2_UNAVAILABLE,
} from '../../shared/lib/findingsNarrative'
import { SummaryStateSchema } from '../../shared/types/aiSummaryV1'
import type { SummaryTarget } from '../../shared/types/aiSummaryV1'
import { SummaryError } from './api'
import type { SummaryApi } from './api'
import {
  derive, initialState, isRetryable, runLoad, runSave, runWrite, splitParagraphs, summaryErrorMessage, summaryReducer, targetKey,
} from './state'
import type { FlowCtx, SummaryDispatch, SummaryUiState } from './state'
import { NOT_ENOUGH, PARAS, aiSummary, summaryState } from './testkit'

const TARGET: SummaryTarget = { scope: 'student', id: 'st-1' }
const KEY = targetKey(TARGET, {})

/* מריצים סדרת פעולות על ה-reducer */
const run = (...actions: SummaryDispatch[]): SummaryUiState => actions.reduce(summaryReducer, initialState)
const loaded = (data = summaryState()): SummaryUiState => run({ type: 'loaded', key: KEY, data })
const view = (s: SummaryUiState) => derive(s, KEY, 'student')

/* api מזויף: כל פונקציה מחזירה מה שמגדירים, ונספרות הקריאות */
function fakeApi(over: Partial<SummaryApi> = {}): SummaryApi & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    get: async () => { calls.push('get'); return { dataState: 'ok', data: summaryState() } },
    create: async (_t, _p, regenerate) => { calls.push(regenerate ? 'regenerate' : 'create'); return { dataState: 'ok', data: summaryState() } },
    edit: async (id, text) => { calls.push(`edit:${id}:${text === null ? 'null' : 'text'}`); return { dataState: 'ok', data: summaryState({ summary: aiSummary({ edited: text !== null, paragraphs: text === null ? PARAS : splitParagraphs(text) }) }) } },
    ...over,
  }
}
function ctx(api: SummaryApi, over: Partial<FlowCtx> = {}): FlowCtx & { actions: SummaryDispatch[] } {
  const actions: SummaryDispatch[] = []
  return { api, target: TARGET, params: {}, key: KEY, dispatch: (a) => { actions.push(a) }, cancelled: () => false, actions, ...over }
}

describe('החוזה בבדיקות', () => {
  it('מצבי הבדיקה עומדים בסכמת aiSummaryV1', () => {
    expect(() => SummaryStateSchema.parse(summaryState())).not.toThrow()
    expect(() => SummaryStateSchema.parse(summaryState({ eligibility: NOT_ENOUGH, summary: null }))).not.toThrow()
  })
})

describe('derive — איזה מצב מוצג', () => {
  it('טוען: לפני שהגיעה תשובה, ובמפתח אחר (עברנו תלמיד/כיתה) — לא מציגים את התשובה הישנה', () => {
    expect(view(initialState).phase).toBe('loading')
    expect(derive(loaded(), targetKey({ scope: 'student', id: 'st-2' }, {}), 'student').phase).toBe('loading')
  })

  it('אין עדיין סיכום ואפשר לכתוב → none; אין מספיק נתונים → ineligible עם הסיבה', () => {
    expect(view(loaded(summaryState({ summary: null }))).phase).toBe('none')
    const m = view(loaded(summaryState({ eligibility: NOT_ENOUGH, summary: null })))
    expect(m.phase).toBe('ineligible')
    expect(m.eligibility).toEqual(NOT_ENOUGH)
  })

  it('יש סיכום → ready עם הפסקאות, המי-כתב והבסיס', () => {
    const m = view(loaded())
    expect(m.phase).toBe('ready')
    expect(m.summary?.paragraphs).toEqual(PARAS)
    expect(m.summary?.writtenBy).toBe('ai')
    expect(m.summary?.basisText).toBe('מבוסס על 14 הדמיות')
  })

  it('טעינה שנכשלה → loadError עם ההודעה', () => {
    const m = view(run({ type: 'loadFailed', key: KEY, error: { action: 'load', status: 503, message: ERR_V2_UNAVAILABLE } }))
    expect(m.phase).toBe('loadError')
    expect(m.error?.message).toBe(ERR_V2_UNAVAILABLE)
  })

  it('הרשאות פעולה: ב-AI מותר לערוך ולכתוב מחדש; תבנית — לנסות שוב עם ד״ר הולו; הדגמה — אף אחד מהם', () => {
    const ai = view(loaded())
    expect([ai.canEdit, ai.canRegenerate, ai.canRetryAi]).toEqual([true, true, false])
    const tpl = view(loaded(summaryState({ summary: aiSummary({ writtenBy: 'template' }) })))
    expect([tpl.canEdit, tpl.canRegenerate, tpl.canRetryAi]).toEqual([true, false, true])
    const demo = view(loaded(summaryState({ demo: true, persisted: false, summary: aiSummary({ writtenBy: 'template', id: null }) })))
    expect([demo.canEdit, demo.canRegenerate, demo.canRetryAi, demo.demo]).toEqual([false, false, false, true])
  })

  it('canRevert רק כשהסיכום נערך (בשרת או מקומית)', () => {
    expect(view(loaded()).canRevert).toBe(false)
    expect(view(loaded(summaryState({ summary: aiSummary({ edited: true }) }))).canRevert).toBe(true)
  })
})

describe('reducer — כתיבה', () => {
  it('כותב: הסיכום הקודם נשאר מוצג, הכפתור מושבת (writing), שגיאה קודמת נמחקת', () => {
    const m = view(run(
      { type: 'loaded', key: KEY, data: summaryState() },
      { type: 'writeFailed', key: KEY, error: { action: 'write', status: 500, message: ERR_SUMMARY_WRITE } },
      { type: 'writeStarted', key: KEY },
    ))
    expect(m.writing).toBe(true)
    expect(m.summary?.paragraphs).toEqual(PARAS)
    expect(m.error).toBeNull()
  })

  it('נכתב: הסיכום מוחלף, wrote=true (הכרטיס המוטמע נפתח), עריכה מקומית ישנה נמחקת', () => {
    const next = summaryState({ summary: aiSummary({ paragraphs: ['פסקה חדשה אחת.'] }) })
    const s = run({ type: 'loaded', key: KEY, data: summaryState() }, { type: 'savedLocal', key: KEY, text: 'ערוך' }, { type: 'writeStarted', key: KEY }, { type: 'written', key: KEY, data: next })
    const m = view(s)
    expect(m.summary?.paragraphs).toEqual(['פסקה חדשה אחת.'])
    expect(m.wrote).toBe(true)
    expect(m.writing).toBe(false)
    expect(m.summary?.edited).toBe(false)
  })

  it('כתיבה שנכשלה: מצב הכתיבה נעצר, ההודעה מוצגת והסיכום הישן נשאר', () => {
    const m = view(run({ type: 'loaded', key: KEY, data: summaryState() }, { type: 'writeStarted', key: KEY }, { type: 'writeFailed', key: KEY, error: { action: 'write', status: 429, message: 'חכו רגע' } }))
    expect(m.writing).toBe(false)
    expect(m.error?.message).toBe('חכו רגע')
    expect(m.summary?.paragraphs).toEqual(PARAS)
  })

  it('פעולה שמגיעה ליעד אחר (המסך עבר לתלמיד אחר באמצע) נזרקת', () => {
    const base = loaded()
    expect(summaryReducer(base, { type: 'written', key: 'אחר', data: summaryState({ summary: aiSummary({ paragraphs: ['לא אמור להיכנס.'] }) }) })).toBe(base)
    expect(summaryReducer(base, { type: 'writeStarted', key: 'אחר' })).toBe(base)
  })
})

describe('reducer — עריכה', () => {
  it('פתיחת עריכה: הטיוטה היא הטקסט המוצג, פסקאות מופרדות בשורה ריקה', () => {
    const s = summaryReducer(loaded(), { type: 'editStarted', key: KEY })
    expect(s.editing).toBe(true)
    expect(s.draft).toBe(PARAS.join('\n\n'))
    expect(view(s).editing).toBe(true)
  })

  it('ביטול: חוזרים לתצוגה והטיוטה נמחקת', () => {
    const s = run({ type: 'loaded', key: KEY, data: summaryState() }, { type: 'editStarted', key: KEY }, { type: 'draftChanged', key: KEY, text: 'שינוי' }, { type: 'editCancelled', key: KEY })
    expect(s.editing).toBe(false)
    expect(s.draft).toBe('')
    expect(view(s).summary?.paragraphs).toEqual(PARAS)
  })

  it('עריכה מקומית (בלי מזהה) מחליפה את הפסקאות המוצגות ומסומנת "נערך"', () => {
    const s = run({ type: 'loaded', key: KEY, data: summaryState({ persisted: false, summary: aiSummary({ id: null }) }) }, { type: 'savedLocal', key: KEY, text: 'אחת.\n\nשתיים.' })
    const m = view(s)
    expect(m.summary?.paragraphs).toEqual(['אחת.', 'שתיים.'])
    expect(m.summary?.edited).toBe(true)
    expect(m.canRevert).toBe(true)
  })
})

describe('הודעות שגיאה בעברית פשוטה', () => {
  it('לפי הסטטוס: 403/429/503 מציגים את הטקסט העברי של השרת, אחרת הודעה קבועה', () => {
    expect(summaryErrorMessage('write', 429, 'הסיכום נכתב לפני רגע. אפשר לכתוב מחדש בעוד כמה שניות.')).toBe('הסיכום נכתב לפני רגע. אפשר לכתוב מחדש בעוד כמה שניות.')
    expect(summaryErrorMessage('write', 429, 'Too many requests')).toBe(ERR_V2_RATE_LIMIT)
    expect(summaryErrorMessage('load', 503, 'אנחנו מרכזים את התוצאות של הכיתה. נסו שוב בעוד דקה.')).toBe('אנחנו מרכזים את התוצאות של הכיתה. נסו שוב בעוד דקה.')
    expect(summaryErrorMessage('load', 503, 'upstream timeout')).toBe(ERR_V2_UNAVAILABLE)
    expect(summaryErrorMessage('load', 403, 'אין גישה לנתוני התלמיד/ה')).toBe('אין גישה לנתוני התלמיד/ה')
    expect(summaryErrorMessage('load', 403, '')).toBe(ERR_V2_FORBIDDEN)
    expect(summaryErrorMessage('load', 404, 'not found')).toBe(ERR_V2_NOT_FOUND)
  })

  it('תקלה כללית ואין חיבור: הודעה לפי הפעולה (טעינה / כתיבה / שמירה), לא טקסט טכני', () => {
    for (const status of [0, 500, 502]) {
      expect(summaryErrorMessage('load', status, 'Error: ECONNRESET')).toBe(ERR_SUMMARY_LOAD)
      expect(summaryErrorMessage('write', status)).toBe(ERR_SUMMARY_WRITE)
      expect(summaryErrorMessage('save', status)).toBe(ERR_SUMMARY_SAVE)
    }
  })

  it('"נסו שוב" רק כשיש טעם: עומס/תקלה כן, הרשאה/לא נמצא/בקשה לא תקינה לא', () => {
    expect([0, 429, 500, 503].every(isRetryable)).toBe(true)
    expect([400, 401, 403, 404].some(isRetryable)).toBe(false)
  })
})

describe('runLoad', () => {
  it('מצליח: loaded עם הנתונים', async () => {
    const c = ctx(fakeApi())
    await runLoad(c)
    expect(c.actions).toHaveLength(1)
    expect(c.actions[0]).toMatchObject({ type: 'loaded', key: KEY })
  })

  it('נכשל (503 עם הודעה בעברית): loadFailed עם ההודעה', async () => {
    const c = ctx(fakeApi({ get: async () => { throw new SummaryError(503, 'אנחנו מרכזים את התוצאות של הכיתה. נסו שוב בעוד דקה.') } }))
    await runLoad(c)
    expect(c.actions[0]).toMatchObject({ type: 'loadFailed', error: { action: 'load', status: 503, message: 'אנחנו מרכזים את התוצאות של הכיתה. נסו שוב בעוד דקה.' } })
  })

  it('שגיאה שאינה SummaryError (אין חיבור) נחשבת סטטוס 0', async () => {
    const c = ctx(fakeApi({ get: async () => { throw new TypeError('Failed to fetch') } }))
    await runLoad(c)
    expect(c.actions[0]).toMatchObject({ type: 'loadFailed', error: { status: 0, message: ERR_SUMMARY_LOAD } })
  })

  it('המסך נסגר באמצע: לא מעדכנים', async () => {
    const c = ctx(fakeApi(), { cancelled: () => true })
    await runLoad(c)
    expect(c.actions).toEqual([])
  })
})

describe('runWrite', () => {
  it('כתיבה ראשונה: writeStarted ואז written; regenerate מועבר לשרת רק כשמבקשים', async () => {
    const api = fakeApi()
    const c = ctx(api)
    await runWrite(c, false)
    expect(c.actions.map((a) => a.type)).toEqual(['writeStarted', 'written'])
    await runWrite(ctx(api), true)
    expect(api.calls).toEqual(['create', 'regenerate'])
  })

  it('קירור (429) → writeFailed עם הטקסט של השרת', async () => {
    const c = ctx(fakeApi({ create: async () => { throw new SummaryError(429, 'הסיכום נכתב לפני רגע. אפשר לכתוב מחדש בעוד כמה שניות.') } }))
    await runWrite(c, true)
    expect(c.actions[1]).toMatchObject({ type: 'writeFailed', error: { action: 'write', status: 429, message: 'הסיכום נכתב לפני רגע. אפשר לכתוב מחדש בעוד כמה שניות.' } })
  })

  it('המסך נסגר באמצע הכתיבה: written לא נשלח', async () => {
    let closed = false
    const c = ctx(fakeApi({ create: async () => { closed = true; return { dataState: 'ok', data: summaryState() } } }), { cancelled: () => closed })
    await runWrite(c, false)
    expect(c.actions.map((a) => a.type)).toEqual(['writeStarted'])
  })
})

describe('runSave', () => {
  const ready = loaded()

  it('טיוטה ריקה: שגיאה ברורה, בלי קריאה לשרת', async () => {
    const api = fakeApi()
    const c = ctx(api)
    await runSave(c, ready, '   \n ')
    expect(api.calls).toEqual([])
    expect(c.actions[0]).toMatchObject({ type: 'saveFailed', error: { action: 'save', message: ERR_SUMMARY_EMPTY_EDIT } })
  })

  it('בלי שינוי בטקסט: סוגרים את העריכה, בלי קריאה לשרת', async () => {
    const api = fakeApi()
    const c = ctx(api)
    await runSave(c, ready, PARAS.join('\n\n'))
    expect(api.calls).toEqual([])
    expect(c.actions[0]).toMatchObject({ type: 'editCancelled' })
  })

  it('סיכום שמור (יש מזהה): נשלח לשרת, והתשובה מחליפה את המצב', async () => {
    const api = fakeApi()
    const c = ctx(api)
    await runSave(c, ready, 'ניסוח חדש.\n\nפסקה שנייה.')
    expect(api.calls).toEqual(['edit:sum-1:text'])
    expect(c.actions.map((a) => a.type)).toEqual(['saveStarted', 'saved'])
    const after = c.actions.reduce<SummaryUiState>((s, a) => summaryReducer(s, a), run({ type: 'loaded', key: KEY, data: summaryState() }, { type: 'editStarted', key: KEY }))
    expect(view(after).summary?.paragraphs).toEqual(['ניסוח חדש.', 'פסקה שנייה.'])
    expect(view(after).summary?.edited).toBe(true)
    expect(after.editing).toBe(false)
  })

  it('סיכום בלי מזהה (עוד לא נשמר בשרת): עריכה מקומית בלבד, בלי קריאה לשרת', async () => {
    const api = fakeApi()
    const c = ctx(api)
    await runSave(c, loaded(summaryState({ persisted: false, summary: aiSummary({ id: null }) })), 'ניסוח מקומי.')
    expect(api.calls).toEqual([])
    expect(c.actions[0]).toMatchObject({ type: 'savedLocal', text: 'ניסוח מקומי.' })
  })

  it('חזרה לטקסט של ד״ר הולו: PATCH עם null לסיכום שמור; מקומי — מנקה את העריכה', async () => {
    const api = fakeApi()
    await runSave(ctx(api), loaded(summaryState({ summary: aiSummary({ edited: true }) })), null)
    expect(api.calls).toEqual(['edit:sum-1:null'])
    const local = ctx(fakeApi())
    await runSave(local, loaded(summaryState({ persisted: false, summary: aiSummary({ id: null }) })), null)
    expect(local.actions[0]).toMatchObject({ type: 'savedLocal', text: null })
  })

  it('שמירה שנכשלה: saveFailed עם הודעה לפי הסטטוס, והעריכה נשארת פתוחה', async () => {
    const c = ctx(fakeApi({ edit: async () => { throw new SummaryError(500, 'boom') } }))
    await runSave(c, ready, 'ניסוח חדש.')
    expect(c.actions[1]).toMatchObject({ type: 'saveFailed', error: { action: 'save', message: ERR_SUMMARY_SAVE } })
    const s = c.actions.reduce<SummaryUiState>((st, a) => summaryReducer(st, a), run({ type: 'loaded', key: KEY, data: summaryState() }, { type: 'editStarted', key: KEY }))
    expect(s.editing).toBe(true)
    expect(s.busy).toBe('idle')
  })
})

describe('targetKey', () => {
  it('מתחלף עם היעד, העדשה של האורח והניסיון החוזר', () => {
    const a = targetKey(TARGET, {})
    expect(targetKey({ scope: 'student', id: 'st-2' }, {})).not.toBe(a)
    expect(targetKey(TARGET, { lens: 'homeroom' })).not.toBe(a)
    expect(targetKey(TARGET, { lens: 'subject_teacher', subject: 'math' })).not.toBe(targetKey(TARGET, { lens: 'subject_teacher', subject: 'hebrew' }))
    expect(targetKey(TARGET, {}, 1)).not.toBe(a)
    expect(targetKey({ scope: 'class_subject', id: 'c1', subject: 'math' }, {})).not.toBe(targetKey({ scope: 'class_subject', id: 'c1', subject: 'hebrew' }, {}))
  })
})

describe('splitParagraphs', () => {
  it('שורה ריקה = פסקה חדשה; רווחים וקצוות מנוקים', () => {
    expect(splitParagraphs('  אחת.  \n\n\n  שתיים.\nעדיין שתיים.\n\n')).toEqual(['אחת.', 'שתיים.\nעדיין שתיים.'])
    expect(splitParagraphs('   ')).toEqual([])
  })
})
