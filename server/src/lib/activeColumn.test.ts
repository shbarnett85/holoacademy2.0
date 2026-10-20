import { beforeEach, describe, expect, it, vi } from 'vitest'

/* ── fake של supabaseAdmin: from(table).select(cols).limit(1) מחזיר את התשובה הבאה בתור, ורושם כל שאילתה ── */
type Err = { code?: string; message?: string } | null
const h = vi.hoisted(() => {
  const calls: string[] = []
  const queue: { error: Err }[] = []
  /* ברירת מחדל כשהתור ריק: הצלחה */
  const next = (): { error: Err } => queue.shift() ?? { error: null }
  const client = {
    from: (table: string) => ({
      select: (cols: string) => ({
        limit: () => { calls.push(`${table}.${cols}`); return Promise.resolve(next()) },
      }),
    }),
  }
  return { calls, queue, client }
})
vi.mock('./supabase.js', () => ({ supabaseAdmin: h.client, supabaseAnon: {} }))
/* הלוגר (pino) נטען מחדש בכל resetModules ומוסיף מאזין יציאה — ממוקק כדי לא לייצר אזהרת דליפה */
vi.mock('./log.js', () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }))

type Mod = typeof import('./activeColumn.js')
let m: Mod

const MISSING_CODES = ['42703', '42P01', 'PGRST204', 'PGRST205']
/* תקלות זמניות מייצגות: ניתוק רשת (בלי קוד), timeout, שגיאת שרת, ו-JWT/RLS לא צפוי */
const TRANSIENT: Err[] = [
  { message: 'TypeError: fetch failed' },
  { code: '57014', message: 'canceling statement due to statement timeout' },
  { code: '08006', message: 'connection failure' },
  { code: 'PGRST000', message: 'Could not connect to the database' },
  { code: '', message: 'Bad Gateway' },
]

beforeEach(async () => {
  h.calls.length = 0
  h.queue.length = 0
  vi.resetModules()
  m = await import('./activeColumn.js')
})

/* ארבע בדיקות הפרטיות, ומספר השאילתות לכל אחת בהצלחה מלאה */
const STRICT: [string, () => Promise<boolean>, number][] = [
  ['hasSyntheticFlag', () => m.hasSyntheticFlag(), 1],
  ['hasFictitious', () => m.hasFictitious(), 3],
  ['hasDataAccessLog', () => m.hasDataAccessLog(), 1],
  ["hasIsActive('users')", () => m.hasIsActive('users'), 1],
]

describe('בדיקות פרטיות: הסכמה קיימת', () => {
  it.each(STRICT)('%s → true, ונשמר ב-cache (אין שאילתה שנייה)', async (_n, probe, queries) => {
    expect(await probe()).toBe(true)
    expect(h.calls).toHaveLength(queries)
    expect(await probe()).toBe(true)
    expect(h.calls).toHaveLength(queries)
  })
})

describe('בדיקות פרטיות: "הסכמה חסרה" → false, בלי cache', () => {
  for (const code of MISSING_CODES) {
    it.each(STRICT)(`%s: קוד ${code} → false`, async (_n, probe) => {
      h.queue.push({ error: { code, message: 'missing' } })
      expect(await probe()).toBe(false)
    })
  }

  it.each(STRICT)('%s: false לא נשמר — אחרי שהמיגרציה הורצה הבדיקה הבאה מחזירה true', async (_n, probe) => {
    h.queue.push({ error: { code: '42703', message: 'column does not exist' } })
    expect(await probe()).toBe(false)
    expect(await probe()).toBe(true)
  })

  it('hasFictitious: עמודה חסרה בטבלה האחרונה (sessions) → false', async () => {
    h.queue.push({ error: null }, { error: null }, { error: { code: 'PGRST204', message: 'x' } })
    expect(await m.hasFictitious()).toBe(false)
    expect(h.calls).toEqual(['users.is_fictitious', 'classes.is_fictitious', 'sessions.is_fictitious'])
  })
})

describe('בדיקות פרטיות: תקלה זמנית → זורק (נכשל סגור), ולא נשמר', () => {
  for (const err of TRANSIENT) {
    it.each(STRICT)(`%s: ${err?.code || err?.message} → זורק 503`, async (_n, probe) => {
      h.queue.push({ error: err })
      await expect(probe()).rejects.toMatchObject({ status: 503, name: 'ProbeUnavailableError' })
    })
  }

  it.each(STRICT)('%s: כישלון זמני אינו נשמר — הניסיון הבא מצליח ומחזיר true', async (_n, probe, queries) => {
    h.queue.push({ error: TRANSIENT[1] })
    await expect(probe()).rejects.toBeInstanceOf(m.ProbeUnavailableError)
    h.calls.length = 0
    expect(await probe()).toBe(true)
    expect(h.calls).toHaveLength(queries)
  })

  it('כישלון זמני אחרי שהוא נשמר כ-true בעבר: ה-cache מגן (אין שאילתה, אין זריקה)', async () => {
    expect(await m.hasSyntheticFlag()).toBe(true)
    h.queue.push({ error: TRANSIENT[0] })
    expect(await m.hasSyntheticFlag()).toBe(true)
  })

  it('hasFictitious: תקלה זמנית באמצע (classes) → זורק, ולא ממשיך לשאילתה השלישית', async () => {
    h.queue.push({ error: null }, { error: TRANSIENT[1] })
    await expect(m.hasFictitious()).rejects.toBeInstanceOf(m.ProbeUnavailableError)
    expect(h.calls).toEqual(['users.is_fictitious', 'classes.is_fictitious'])
  })

  it('פירוט השגיאה נשמר על האובייקט (ללוג), וההודעה ללקוח כללית', async () => {
    h.queue.push({ error: TRANSIENT[1] })
    let e: InstanceType<Mod['ProbeUnavailableError']> | null = null
    try { await m.hasDataAccessLog() } catch (x) { e = x as InstanceType<Mod['ProbeUnavailableError']> }
    if (!e) throw new Error('expected a throw')
    expect(e.detail).toBe('57014')
    expect(e.probe).toBe('__data_access_log')
    expect(e.message).not.toMatch(/57014|statement/)
  })
})

describe('שאר הבדיקות לא השתנו: כל שגיאה = false', () => {
  it.each([
    ['hasClassTeachers', () => m.hasClassTeachers()],
    ['hasHomeroom', () => m.hasHomeroom()],
    ['hasAnswersTable', () => m.hasAnswersTable()],
    ['hasQuestSubject', () => m.hasQuestSubject()],
    ["hasIsActive('classes')", () => m.hasIsActive('classes')],
    ["hasIsActive('schools')", () => m.hasIsActive('schools')],
  ])('%s: תקלה זמנית → false (ללא זריקה)', async (_n, probe) => {
    h.queue.push({ error: TRANSIENT[0] })
    expect(await probe()).toBe(false)
  })
})

describe('isSchemaMissingError', () => {
  it('רק ארבעת הקודים', () => {
    for (const c of MISSING_CODES) expect(m.isSchemaMissingError({ code: c })).toBe(true)
    for (const c of ['', '57014', 'PGRST301', '23505', undefined, null]) expect(m.isSchemaMissingError({ code: c })).toBe(false)
    expect(m.isSchemaMissingError(null)).toBe(false)
    expect(m.isSchemaMissingError(undefined)).toBe(false)
  })
})
