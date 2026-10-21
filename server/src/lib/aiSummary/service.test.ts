import { beforeAll, describe, expect, it } from 'vitest'
import {
  AI_SUMMARY_TEXT, CAVEAT_TREND, ERR_SUMMARY_COOLDOWN, ERR_SUMMARY_DEMO_EDIT, ERR_SUMMARY_EDIT_EXISTS, ERR_SUMMARY_EMPTY_EDIT, ERR_SUMMARY_LIMIT_DAILY, ERR_SUMMARY_NOT_FOUND, ERR_SUMMARY_SAVE,
} from '../../../../src/shared/lib/findingsNarrative.js'
import { SummaryStateSchema, type SummaryTarget } from '../../../../src/shared/types/aiSummaryV1.js'
import { demoProvider, getAnalysis } from '../analyticsV2/demoProvider.js'
import { AppError } from '../../middleware/errors.js'
import { projectSource, type SummarySource } from './inputs.js'
import { createMemoryStore } from './store.js'
import { FULL_AUDIENCE, SUMMARY_STALE_AFTER_DAYS, createSummaryService, subjectAudience, type SummaryRequest, type SummaryServiceDeps } from './service.js'
import { NOW, demoIdentifiers, fakeLlm, goodResponse, homeroomOf } from './testkit.js'

let source: SummarySource
let sid: string
let studentName: string
let GOOD: string
/* תשובה תקינה שנייה (טקסט שונה): ציטוט נאמן של העובדה הרביעית */
let SECOND: string
let SECOND_TEXT: string

beforeAll(async () => {
  const A = getAnalysis(NOW)
  sid = A.classById.get('c-v2')!.studentIds[0]
  const overview = (await demoProvider.student(homeroomOf('c-v2'), sid)).data
  studentName = overview.student.displayName
  source = { scope: 'student', overview, gender: 'male' }
  const input = projectSource(source)
  GOOD = goodResponse(input)
  const fact = input.facts[3] ?? input.facts[input.facts.length - 1]
  SECOND_TEXT = `לפי הנתונים, ${fact.text}`
  SECOND = JSON.stringify({ paragraphs: [{ text: SECOND_TEXT, facts: [fact.id] }] })
})

const BAD_TECH = JSON.stringify({ paragraphs: [{ text: 'לפי הנתונים, השינוי מובהק מבחינה סטטיסטית.', facts: ['f1'] }] })
const target = (): SummaryTarget => ({ scope: 'student', id: sid })
const request = (over: Partial<SummaryRequest> = {}): SummaryRequest => ({
  viewer: { userId: 'u-A', demo: false }, target: target(), audienceKey: 'full', load: async () => source, ...over,
})

interface Clock { t: number; now: () => Date; advance: (ms: number) => void }
const clock = (): Clock => { const c: Clock = { t: NOW.getTime(), now: () => new Date(c.t), advance: (ms) => { c.t += ms } }; return c }
const make = (llm: ReturnType<typeof fakeLlm>, over: Partial<SummaryServiceDeps> = {}) => {
  const store = createMemoryStore()
  const c = clock()
  const logs: string[] = []
  const service = createSummaryService({ llm, store, now: c.now, log: (m) => logs.push(m), ...over })
  return { service, store, clock: c, logs }
}
const failsWith = async (p: Promise<unknown>, status: number, message?: string): Promise<void> => {
  const e = await p.then(() => null, (x: unknown) => x)
  expect(e).toBeInstanceOf(AppError)
  expect((e as AppError).status).toBe(status)
  if (message) expect((e as AppError).message).toBe(message)
}

describe('יצירה: פלט נקי נשמר', () => {
  it('נכתב ב-AI, נשמר, וההקשר שנשלח למודל אנונימי; התגובה עומדת בחוזה', async () => {
    const llm = fakeLlm([GOOD])
    const { service, store } = make(llm)
    const res = await service.generate(request())
    expect(res.dataState).toBe('ok')
    expect(SummaryStateSchema.safeParse(res.data).success).toBe(true)
    const s = res.data.summary!
    expect(s.writtenBy).toBe('ai')
    expect(s.label).toBe(AI_SUMMARY_TEXT.label.ai)
    expect(s.notice).toBeNull()
    expect(s.caveat).toBe(CAVEAT_TREND)
    expect(s.basisText).toMatch(/^מבוסס על \d+ הדמיות$/)
    expect(s.id).not.toBeNull()
    expect(s.edited).toBe(false)
    expect(res.data.persisted).toBe(true)
    expect(res.data.persistenceNote).toBeNull()
    expect(res.data.demo).toBe(false)
    expect(res.data.privacyNote).toBe('שם התלמיד/ה לא נשלח לבינה המלאכותית.')
    expect(s.howWritten.join(' ')).toContain('fake-model-1')
    expect(store.rows.size).toBe(1)
    const row = [...store.rows.values()][0]
    expect(row).toMatchObject({ viewerId: 'u-A', scope: 'student', entityId: sid, subjectCode: '', audienceKey: 'full', writtenBy: 'ai', model: 'fake-model-1', editedText: null })
    expect(row.inputFacts.length).toBeGreaterThan(3)
    /* ל-LLM הלכו עובדות אנונימיות בלבד */
    expect(llm.calls).toHaveLength(1)
    const sent = llm.calls[0].system + llm.calls[0].user
    const ids = demoIdentifiers()
    expect(sent).not.toContain(studentName)
    expect(sent).not.toContain(sid)
    for (const n of ids.names) expect(sent.includes(n), n).toBe(false)
    expect(JSON.stringify(row.inputFacts)).not.toContain(studentName)
    expect(llm.calls[0].maxTokens).toBeGreaterThan(0)
  })
})

describe('יצירה: שומר, ניסיון חוזר ותבנית', () => {
  it('הפרה בניסיון הראשון → ניסיון חוזר עם רשימת ההפרות → נכתב ב-AI', async () => {
    const llm = fakeLlm([BAD_TECH, GOOD])
    const { service, logs } = make(llm)
    const res = await service.generate(request())
    expect(llm.calls).toHaveLength(2)
    expect(llm.calls[1].user).toContain('נפסל בבדיקה אוטומטית')
    expect(llm.calls[1].user).toContain('מונח טכני')
    expect(llm.calls[0].user).not.toContain('נפסל בבדיקה')
    expect(res.data.summary!.writtenBy).toBe('ai')
    expect(logs.some((l) => l.includes('forbidden_ui'))).toBe(true)
    /* הלוג מכיל קודים בלבד — לא טקסט שנפסל ולא שמות */
    expect(logs.join('\n')).not.toContain('סטטיסטית')
    expect(logs.join('\n')).not.toContain(studentName)
  })

  it('שתי הפרות → תבנית דטרמיניסטית (written_by=template), נשמרת, עם באנר', async () => {
    const llm = fakeLlm([BAD_TECH])
    const { service, store } = make(llm)
    const res = await service.generate(request())
    expect(llm.calls).toHaveLength(2)
    const s = res.data.summary!
    expect(s.writtenBy).toBe('template')
    expect(s.label).toBe(AI_SUMMARY_TEXT.label.template)
    expect(s.notice).toBe(AI_SUMMARY_TEXT.notice.template)
    expect(s.paragraphs.length).toBeGreaterThanOrEqual(1)
    expect([...store.rows.values()][0]).toMatchObject({ writtenBy: 'template', model: null })
    expect(s.howWritten.join(' ')).not.toContain('fake-model')
    expect(SummaryStateSchema.safeParse(res.data).success).toBe(true)
  })

  it('כשל טכני של המודל (timeout / רשת) → תבנית מיד, בלי ניסיון נוסף', async () => {
    const llm = fakeLlm([new Error('timeout')])
    const { service } = make(llm)
    const res = await service.generate(request())
    expect(llm.calls).toHaveLength(1)
    expect(res.data.summary!.writtenBy).toBe('template')
  })

  it('JSON שבור ומספר מומצא נפסלים (מספר לא מהעובדות לעולם לא מוצג)', async () => {
    const invented = JSON.stringify({ paragraphs: [{ text: 'לפי הנתונים, הרמה היא 77.7.', facts: ['f1'] }] })
    const { service } = make(fakeLlm(['לא JSON', invented]))
    const res = await service.generate(request())
    expect(res.data.summary!.writtenBy).toBe('template')
  })
})

describe('cache ועריכה אישיים לצופה', () => {
  it('צופה ב׳ לא רואה סיכום של צופה א׳; קריאה חוזרת של א׳ לא קוראת שוב ל-LLM', async () => {
    const llm = fakeLlm([GOOD])
    const { service, store } = make(llm)
    const a = await service.generate(request())
    await service.generate(request())
    expect(llm.calls).toHaveLength(1)
    const getA = await service.get(request())
    expect(getA.data.summary!.id).toBe(a.data.summary!.id)

    const asB = request({ viewer: { userId: 'u-B', demo: false } })
    const getB = await service.get(asB)
    expect(getB.data.summary).toBeNull()
    expect(getB.data.eligibility).toEqual({ ok: true })
    const b = await service.generate(asB)
    expect(llm.calls).toHaveLength(2)
    expect(b.data.summary!.id).not.toBe(a.data.summary!.id)
    expect(store.rows.size).toBe(2)
  })

  it('קהל אחר (מורה מקצועי מול מחנך) = מפתח אחר: אין זליגה של סיכום "מלא" לקהל חלקי', async () => {
    const llm = fakeLlm([GOOD])
    const { service } = make(llm)
    await service.generate(request({ audienceKey: 'full' }))
    const subj = await service.get(request({ audienceKey: 'subj:math' }))
    expect(subj.data.summary).toBeNull()
    await service.generate(request({ audienceKey: 'subj:math' }))
    expect(llm.calls).toHaveLength(2)
  })

  it('PATCH של צופה אחר נדחה (404); הבעלים עורך, ו-null מחזיר לטקסט המקורי', async () => {
    const { service } = make(fakeLlm([GOOD]))
    const created = await service.generate(request())
    const id = created.data.summary!.id!
    expect(await service.describe(id, 'u-B')).toBeNull()
    await failsWith(service.edit({ viewer: { userId: 'u-B', demo: false }, summaryId: id, audienceKey: 'full', editedText: 'פריצה' }), 404, ERR_SUMMARY_NOT_FOUND)
    const info = await service.describe(id, 'u-A')
    expect(info).toEqual({ target: target(), audienceKey: 'full' })

    const edited = await service.edit({ viewer: { userId: 'u-A', demo: false }, summaryId: id, audienceKey: 'full', editedText: '  הפסקה הראשונה שלי.\r\n\r\n\r\n\r\nהפסקה השנייה שלי.  ' })
    expect(edited.data.summary!.edited).toBe(true)
    expect(edited.data.summary!.paragraphs).toEqual(['הפסקה הראשונה שלי.', 'הפסקה השנייה שלי.'])
    expect(edited.data.summary!.generatedParagraphs).toEqual(created.data.summary!.generatedParagraphs)
    /* get אחרי עריכה מחזיר את הגרסה הערוכה */
    expect((await service.get(request())).data.summary!.paragraphs).toEqual(['הפסקה הראשונה שלי.', 'הפסקה השנייה שלי.'])

    const reverted = await service.edit({ viewer: { userId: 'u-A', demo: false }, summaryId: id, audienceKey: 'full', editedText: null })
    expect(reverted.data.summary!.edited).toBe(false)
    expect(reverted.data.summary!.paragraphs).toEqual(created.data.summary!.generatedParagraphs)
  })

  it('עריכה ריקה → 400; קהל שונה מזה ששמור → 404; הדגמה → 403', async () => {
    const { service } = make(fakeLlm([GOOD]))
    const id = (await service.generate(request())).data.summary!.id!
    await failsWith(service.edit({ viewer: { userId: 'u-A', demo: false }, summaryId: id, audienceKey: 'full', editedText: ' \n ' }), 400, ERR_SUMMARY_EMPTY_EDIT)
    await failsWith(service.edit({ viewer: { userId: 'u-A', demo: false }, summaryId: id, audienceKey: 'subj:math', editedText: 'x' }), 404)
    await failsWith(service.edit({ viewer: { userId: 'u-A', demo: true }, summaryId: id, audienceKey: 'full', editedText: 'x' }), 403, ERR_SUMMARY_DEMO_EDIT)
  })
})

describe('מפתחות קהל', () => {
  it('full למחנך; subj:<קודים ממוינים וייחודיים> למורה מקצועי', () => {
    expect(FULL_AUDIENCE).toBe('full')
    expect(subjectAudience(['math'])).toBe('subj:math')
    expect(subjectAudience(['math', 'hebrew', 'math'])).toBe('subj:hebrew,math')
    expect(subjectAudience(['hebrew', 'math'])).toBe(subjectAudience(['math', 'hebrew']))
  })
})

describe('כתיבה מחדש', () => {
  it('על סיכום שהמורה ערכה: בלי אישור — 409 ועריכה נשמרת; עם discardEdit — מאפסת את העריכה ומחליפה את הטקסט; קירור של 20 שניות בין כתיבות', async () => {
    const { service, store, clock: c } = make(fakeLlm([GOOD, SECOND]))
    const created = await service.generate(request())
    const id = created.data.summary!.id!
    await service.edit({ viewer: { userId: 'u-A', demo: false }, summaryId: id, audienceKey: 'full', editedText: 'הגרסה שלי' })
    expect([...store.rows.values()][0].editedText).toBe('הגרסה שלי')

    /* בלי אישור מפורש: נדחה, בלי LLM, והעריכה שלמה (גם אחרי שעבר הקירור) */
    c.advance(21_000)
    await failsWith(service.generate(request(), { regenerate: true }), 409, ERR_SUMMARY_EDIT_EXISTS)
    await failsWith(service.generate(request(), { regenerate: true, discardEdit: false }), 409, ERR_SUMMARY_EDIT_EXISTS)
    expect([...store.rows.values()][0].editedText).toBe('הגרסה שלי')

    const again = await service.generate(request(), { regenerate: true, discardEdit: true })
    expect(again.data.summary!.edited).toBe(false)
    expect(again.data.summary!.paragraphs).toEqual([SECOND_TEXT])
    expect(again.data.summary!.id).toBe(id)
    expect([...store.rows.values()][0].editedText).toBeNull()
    expect(store.rows.size).toBe(1)
    await failsWith(service.generate(request(), { regenerate: true, discardEdit: true }), 429, ERR_SUMMARY_COOLDOWN)
  })

  it('מרוץ בין לשוניות: find לא ראה את הסיכום (נוצר ונערך באותו רגע בלשונית אחרת) — השמירה לא דורסת את העריכה (R4#10)', async () => {
    const { service, store } = make(fakeLlm([GOOD]))
    /* סיכום קיים עם עריכה של המורה, אבל ה-find של הבקשה הזו "פספס" אותו */
    const first = await service.generate(request())
    await service.edit({ viewer: { userId: 'u-A', demo: false }, summaryId: first.data.summary!.id!, audienceKey: 'full', editedText: 'העריכה שלי' })
    const find = store.find
    store.find = async () => null
    const raced = await service.generate(request())
    store.find = find
    expect(raced.data.summary!.edited).toBe(true)
    expect([...store.rows.values()][0].editedText).toBe('העריכה שלי')
    expect(store.rows.size).toBe(1)
  })

  it('סיכום שלא נערך: כתיבה מחדש ללא discardEdit מותרת (אין מה לאבד)', async () => {
    const { service, clock: c } = make(fakeLlm([GOOD]))
    await service.generate(request())
    c.advance(21_000)
    const again = await service.generate(request(), { regenerate: true })
    expect(again.data.summary!.edited).toBe(false)
  })

  it('עריכה בלשונית אחרת בזמן שהלקוח מציג סיכום לא ערוך: השרת תופס זאת (409) ולא דורס', async () => {
    const { service, store, clock: c } = make(fakeLlm([GOOD]))
    const created = await service.generate(request())
    c.advance(21_000)
    await service.edit({ viewer: { userId: 'u-A', demo: false }, summaryId: created.data.summary!.id!, audienceKey: 'full', editedText: 'נערך בלשונית אחרת' })
    await failsWith(service.generate(request(), { regenerate: true }), 409)
    expect([...store.rows.values()][0].editedText).toBe('נערך בלשונית אחרת')
  })

  it('שתי בקשות במקביל לאותה ישות → קריאה אחת ל-LLM', async () => {
    const llm = fakeLlm([GOOD])
    const { service } = make(llm)
    const [x, y] = await Promise.all([service.generate(request()), service.generate(request())])
    expect(llm.calls).toHaveLength(1)
    expect(x.data.summary!.id).toBe(y.data.summary!.id)
  })
})

describe('הדגמה / אורח', () => {
  it('אורח: תבנית דטרמיניסטית, בלי LLM ובלי שמירה', async () => {
    const llm = fakeLlm([GOOD])
    const { service, store } = make(llm)
    const res = await service.generate(request({ viewer: { userId: 'guest', demo: true } }))
    expect(llm.calls).toHaveLength(0)
    expect(store.rows.size).toBe(0)
    expect(res.data.demo).toBe(true)
    expect(res.data.persisted).toBe(false)
    const s = res.data.summary!
    expect(s.id).toBeNull()
    expect(s.writtenBy).toBe('template')
    expect(s.label).toBe(AI_SUMMARY_TEXT.label.demo)
    expect(s.notice).toBe(AI_SUMMARY_TEXT.notice.demo)
    expect(SummaryStateSchema.safeParse(res.data).success).toBe(true)
    /* דטרמיניסטי */
    const again = await service.generate(request({ viewer: { userId: 'guest', demo: true } }))
    expect(again.data.summary!.paragraphs).toEqual(s.paragraphs)
    expect((await service.get(request({ viewer: { userId: 'guest', demo: true } }))).data.summary).toBeNull()
  })

  it('AI_SUMMARY_DEMO_LLM: קריאת LLM גם בהדגמה, אבל עדיין בלי שמירה', async () => {
    const llm = fakeLlm([GOOD])
    const { service, store } = make(llm, { demoLlm: true })
    const res = await service.generate(request({ viewer: { userId: 'guest', demo: true } }))
    expect(llm.calls).toHaveLength(1)
    expect(res.data.summary!.writtenBy).toBe('ai')
    expect(res.data.summary!.id).toBeNull()
    expect(store.rows.size).toBe(0)
  })
})

describe('זכאות, תקרה יומית ואחסון חסר', () => {
  it('אין מספיק נתונים: מצב "אין עדיין מספיק נתונים" בלי LLM ובלי שמירה, עם מה שיקרה', async () => {
    const empty: SummarySource = { scope: 'student', overview: { ...(source as Extract<SummarySource, { scope: 'student' }>).overview, panels: [], crossSubject: [] }, gender: null }
    const llm = fakeLlm([GOOD])
    const { service, store } = make(llm)
    const res = await service.generate(request({ load: async () => empty }))
    expect(res.dataState).toBe('insufficient')
    expect(res.data.summary).toBeNull()
    expect(res.data.eligibility.ok).toBe(false)
    if (!res.data.eligibility.ok) {
      expect(res.data.eligibility.text).toContain('אין מספיק נתונים')
      expect(res.data.eligibility.whatNext).toMatch(/יהיה זמין אחרי 4 הדמיות/)
    }
    expect(llm.calls).toHaveLength(0)
    expect(store.rows.size).toBe(0)
    const got = await service.get(request({ load: async () => empty, cheapLoad: true }))
    expect(got.data.eligibility.ok).toBe(false)
    expect(SummaryStateSchema.safeParse(res.data).success).toBe(true)
  })

  it('תקרה יומית לצופה (גם בזיכרון): אחריה 429, וצופה אחר לא מושפע', async () => {
    const { service } = make(fakeLlm([GOOD]), { dailyCap: 2 })
    const t = (id: string): SummaryRequest => request({ target: { scope: 'student', id } })
    await service.generate(t('11111111-1111-4111-8111-111111111111'))
    await service.generate(t('22222222-2222-4222-8222-222222222222'))
    await failsWith(service.generate(t('33333333-3333-4333-8333-333333333333')), 429, ERR_SUMMARY_LIMIT_DAILY)
    await service.generate(request({ viewer: { userId: 'u-B', demo: false }, target: { scope: 'student', id: '33333333-3333-4333-8333-333333333333' } }))
  })

  it('התקרה מתאפסת למחרת', async () => {
    const { service, clock: c } = make(fakeLlm([GOOD]), { dailyCap: 1 })
    await service.generate(request())
    await failsWith(service.generate(request({ target: { scope: 'student', id: 'other-entity' } })), 429)
    c.advance(26 * 3_600_000)
    await service.generate(request({ target: { scope: 'student', id: 'other-entity' } }))
  })

  it('לפני המיגרציה (אין טבלה): הסיכום נוצר ומוחזר עם id=null והסבר במילים; get לא מוצא', async () => {
    const store = createMemoryStore({ available: false })
    const service = createSummaryService({ llm: fakeLlm([GOOD]), store, now: clock().now })
    const res = await service.generate(request())
    expect(res.data.summary!.id).toBeNull()
    expect(res.data.summary!.writtenBy).toBe('ai')
    expect(res.data.persisted).toBe(false)
    expect(res.data.persistenceNote).toBe(AI_SUMMARY_TEXT.persistenceNote)
    expect(res.data.demo).toBe(false)
    expect((await service.get(request())).data.summary).toBeNull()
    expect(SummaryStateSchema.safeParse(res.data).success).toBe(true)
    await failsWith(service.edit({ viewer: { userId: 'u-A', demo: false }, summaryId: 'x', audienceKey: 'full', editedText: 'y' }), 404)
  })

  it('כשל DB חולף בקריאה (find): 503, בלי LLM, והעריכה נשארת — לא נראה כ"אין סיכום" (R4#10)', async () => {
    const llm = fakeLlm([GOOD])
    const { service, store } = make(llm)
    const created = await service.generate(request())
    await service.edit({ viewer: { userId: 'u-A', demo: false }, summaryId: created.data.summary!.id!, audienceKey: 'full', editedText: 'שלי' })
    const find = store.find
    store.find = async () => { throw new AppError(503, 'db') }
    await failsWith(service.generate(request()), 503)
    await failsWith(service.get(request()), 503)
    expect(llm.calls).toHaveLength(1)
    store.find = find
    expect((await service.get(request())).data.summary!.paragraphs).toEqual(['שלי'])
  })

  it('כשל DB בשמירה: 503; ניסיון חוזר שומר את אותה יצירה בלי קריאה שנייה ל-LLM', async () => {
    const llm = fakeLlm([GOOD])
    const { service, store } = make(llm)
    const upsert = store.upsert
    store.upsert = async () => { throw new AppError(503, 'db down') }
    await failsWith(service.generate(request()), 503)
    expect(llm.calls).toHaveLength(1)
    expect(store.rows.size).toBe(0)
    store.upsert = upsert
    const retry = await service.generate(request())
    expect(llm.calls).toHaveLength(1)
    expect(retry.data.persisted).toBe(true)
    expect(retry.data.summary!.writtenBy).toBe('ai')
    expect(store.rows.size).toBe(1)
  })

  it('כשל DB בשמירת עריכה: 503 עם "לא הצלחנו לשמור" (ולא 404 "לא נמצא")', async () => {
    const { service, store } = make(fakeLlm([GOOD]))
    const created = await service.generate(request())
    store.setEdited = async () => { throw new AppError(503, 'db down') }
    await failsWith(service.edit({ viewer: { userId: 'u-A', demo: false }, summaryId: created.data.summary!.id!, audienceKey: 'full', editedText: 'x' }), 503, ERR_SUMMARY_SAVE)
  })

  it('כשל ברישום השימוש לא מפיל את היצירה (best-effort), אבל נכתב ללוג', async () => {
    const { service, store, logs } = make(fakeLlm([GOOD]))
    store.recordGeneration = async () => { throw new AppError(503, 'db') }
    const res = await service.generate(request())
    expect(res.data.summary!.writtenBy).toBe('ai')
    expect(logs.some((l) => l.includes('usage record failed'))).toBe(true)
  })
})

describe('תקרה יומית: נספרת מיומן השימוש, כולל כתיבות מחדש, ושורדת ריסטרט (R1#7, R4#12)', () => {
  it('כתיבה מחדש של אותה ישות נספרת בכל פעם; שירות חדש על אותה חנות (ריסטרט) ממשיך מאותה ספירה', async () => {
    const store = createMemoryStore()
    const c = clock()
    const llm = fakeLlm([GOOD])
    const mk = () => createSummaryService({ llm, store, now: c.now, dailyCap: 3 })
    const s1 = mk()
    await s1.generate(request())
    c.advance(21_000)
    await s1.generate(request(), { regenerate: true })
    c.advance(21_000)
    await s1.generate(request(), { regenerate: true })
    expect(store.usage).toHaveLength(3)
    /* ריסטרט: זיכרון התהליך אבד, היומן נשאר */
    const s2 = mk()
    c.advance(21_000)
    await failsWith(s2.generate(request(), { regenerate: true }), 429, ERR_SUMMARY_LIMIT_DAILY)
    expect(llm.calls).toHaveLength(3)
    /* יום אחר: מתאפס */
    c.advance(26 * 3_600_000)
    await s2.generate(request(), { regenerate: true })
  })

  it('גם יצירה שנפלה לתבנית (ניסיון LLM שנפסל) נספרת — העלות כבר נגרמה', async () => {
    const { service, store } = make(fakeLlm([BAD_TECH]))
    await service.generate(request())
    expect(store.usage).toHaveLength(1)
  })

  it('כשל DB בספירה (לא "סכמה חסרה") → 503 ולא קריאת LLM בלי תקרה', async () => {
    const llm = fakeLlm([GOOD])
    const { service, store } = make(llm)
    store.countGeneratedSince = async () => { throw new AppError(503, 'db') }
    await failsWith(service.generate(request()), 503)
    expect(llm.calls).toHaveLength(0)
  })
})

describe('התיישנות: "ייתכן שהנתונים השתנו" (R4#5)', () => {
  const sourceWith = (mutate: (s: Extract<SummarySource, { scope: 'student' }>) => Extract<SummarySource, { scope: 'student' }>): SummarySource => mutate(source as Extract<SummarySource, { scope: 'student' }>)

  it('סיכום טרי עם אותם נתונים: לא ישן; נתונים שהשתנו: ישן; גיל מעל 14 יום: ישן גם בלי להשוות', async () => {
    const { service, clock: c } = make(fakeLlm([GOOD]))
    const cheap = (load?: SummaryRequest['load']): SummaryRequest => request({ cheapLoad: true, ...(load ? { load } : {}) })
    const created = await service.generate(cheap())
    expect(created.data.summary!.stale).toBe(false)
    expect((await service.get(cheap())).data.summary!.stale).toBe(false)

    /* נתונים אחרים (פאנל אחד פחות) → חותמת שונה */
    const changed = sourceWith((s) => ({ ...s, overview: { ...s.overview, panels: s.overview.panels.slice(0, Math.max(1, s.overview.panels.length - 1)), crossSubject: [] } }))
    expect((await service.get(cheap(async () => changed))).data.summary!.stale).toBe(true)

    /* אותם נתונים אבל גיל: ישן */
    c.advance((SUMMARY_STALE_AFTER_DAYS + 1) * 86_400_000)
    expect((await service.get(cheap())).data.summary!.stale).toBe(true)
  })

  it('חותמת הנתונים לא תלויה במגדר: אותם נתונים עם מגדר אחר אינם "השתנו"', async () => {
    const { service } = make(fakeLlm([GOOD]))
    await service.generate(request({ cheapLoad: true }))
    const other = sourceWith((s) => ({ ...s, gender: 'female' }))
    expect((await service.get(request({ cheapLoad: true, load: async () => other }))).data.summary!.stale).toBe(false)
  })

  it('טעינה יקרה (הגשה): GET לא טוען נתונים — ההתיישנות לפי גיל בלבד', async () => {
    const { service, clock: c } = make(fakeLlm([GOOD]))
    await service.generate(request())
    let loads = 0
    const heavy = request({ cheapLoad: false, load: async () => { loads++; return source } })
    expect((await service.get(heavy)).data.summary!.stale).toBe(false)
    expect(loads).toBe(0)
    c.advance((SUMMARY_STALE_AFTER_DAYS + 1) * 86_400_000)
    expect((await service.get(heavy)).data.summary!.stale).toBe(true)
    expect(loads).toBe(0)
  })

  it('כשל בטעינה בזמן חישוב ההתיישנות לא מפיל את ה-GET (לפי הגיל בלבד)', async () => {
    const { service } = make(fakeLlm([GOOD]))
    await service.generate(request())
    const res = await service.get(request({ cheapLoad: true, load: async () => { throw new Error('boom') } }))
    expect(res.data.summary!.stale).toBe(false)
  })

  it('עריכה מחזירה את אותו מצב התיישנות', async () => {
    const { service, clock: c } = make(fakeLlm([GOOD]))
    const created = await service.generate(request())
    c.advance((SUMMARY_STALE_AFTER_DAYS + 1) * 86_400_000)
    const edited = await service.edit({ viewer: { userId: 'u-A', demo: false }, summaryId: created.data.summary!.id!, audienceKey: 'full', editedText: 'x' })
    expect(edited.data.summary!.stale).toBe(true)
  })
})

describe('GET זול (R5#2)', () => {
  it('אין סיכום שמור והטעינה יקרה (הגשה אמיתית): לא נטענים נתונים; הזכאות נדחית ל-POST', async () => {
    const { service } = make(fakeLlm([GOOD]))
    let loads = 0
    const heavy = request({ cheapLoad: false, load: async () => { loads++; return source } })
    const res = await service.get(heavy)
    expect(loads).toBe(0)
    expect(res.data.summary).toBeNull()
    expect(res.data.eligibility).toEqual({ ok: true })
  })
  it('אין סיכום שמור והטעינה זולה: הזכאות נבדקת', async () => {
    const { service } = make(fakeLlm([GOOD]))
    const res = await service.get(request({ cheapLoad: true }))
    expect(res.data.eligibility).toEqual({ ok: true })
  })
})
