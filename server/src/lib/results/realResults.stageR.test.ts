import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Request } from 'express'
import { LiveViewSchema, OverviewSchema, SubmissionListSchema } from '../../../../src/shared/types/resultsV1.js'
import { LIVE_RULES } from '../../../../src/shared/lib/analyticsConfig.js'

/* ══════════════════════════════════════════════════════════════════════════
   שלב R — הספק האמיתי מול DB מדומה: רשימה (השיעורים שלי / כל השיעורים בכיתה שלי, חלון זמן, פס שבועי), תצוגה חיה, טבלת המנהל/ת.
   ההרשאות (מי רואה מה) כמטריצה אחת בסוף.
   ══════════════════════════════════════════════════════════════════════════ */
type Row = Record<string, unknown>
const h = vi.hoisted(() => {
  const db: Record<string, Row[]> = {}
  const calls: string[] = []

  class Q {
    private filters: ((r: Row) => boolean)[] = []
    private orders: { col: string; asc: boolean }[] = []
    private lim: number | null = null
    private rng: [number, number] | null = null
    private one = false
    private ins: Row[] | null = null
    private cols = ''
    constructor(private t: string) { calls.push(t) }
    select(c = '*') { this.cols = c; return this }
    insert(p: Row | Row[]) { this.ins = Array.isArray(p) ? p : [p]; return this }
    eq(k: string, v: unknown) { this.filters.push((r) => r[k] === v); return this }
    in(k: string, a: unknown[]) { this.filters.push((r) => a.includes(r[k])); return this }
    is(k: string, v: unknown) { this.filters.push((r) => (r[k] ?? null) === v); return this }
    gte(k: string, v: string) { this.filters.push((r) => String(r[k]) >= v); return this }
    lt(k: string, v: string) { this.filters.push((r) => String(r[k]) < v); return this }
    not(k: string, _op: string, v: unknown) { this.filters.push((r) => (r[k] ?? null) !== v); return this }
    order(col: string, o?: { ascending?: boolean }) { this.orders.push({ col, asc: o?.ascending !== false }); return this }
    limit(n: number) { this.lim = n; return this }
    range(a: number, b: number) { this.rng = [a, b]; return this }
    maybeSingle() { this.one = true; return this }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    then(ok?: any, bad?: any) {
      const tbl = db[this.t]
      if (!tbl) return Promise.resolve({ data: null, error: { message: `no table ${this.t}` } }).then(ok, bad)
      if (this.ins) { tbl.push(...this.ins); return Promise.resolve({ data: null, error: null }).then(ok, bad) }
      let rows = tbl.filter((r) => this.filters.every((f) => f(r)))
      for (const { col, asc } of [...this.orders].reverse()) {
        rows = [...rows].sort((a, b) => {
          const x = a[col] as string | number | null | undefined, y = b[col] as string | number | null | undefined
          if (x == null && y == null) return 0
          if (x == null) return 1
          if (y == null) return -1
          return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1)
        })
      }
      if (this.rng) rows = rows.slice(this.rng[0], this.rng[1] + 1)
      if (this.lim !== null) rows = rows.slice(0, this.lim)
      if (this.t === 'class_members' && /users\(/.test(this.cols)) rows = rows.map((r) => ({ ...r, users: (db.users ?? []).find((u) => u.id === r.user_id) ?? null }))
      return Promise.resolve({ data: this.one ? (rows[0] ?? null) : rows, error: null }).then(ok, bad)
    }
  }
  return { db, calls, client: { from: (t: string) => new Q(t) } }
})

vi.mock('../supabase.js', () => ({ supabaseAdmin: h.client, supabaseAnon: {} }))
vi.mock('../activeColumn.js', () => ({
  hasAnswersTable: async () => true, hasFictitious: async () => false, hasIsActive: async () => true, hasMisconceptionLinks: async () => false,
  hasMisconceptions: async () => true, hasMoralChoices: async () => true, hasOptionTags: async () => true, hasQuestSubject: async () => false,
  hasQuestSubjectId: async () => true, hasQuestVariants: async () => true, hasSyntheticFlag: async () => true,
  hasClassTeachers: async () => true, hasDataAccessLog: async () => true, hasAssignmentDueAt: async () => true,
  hasAnswerLevel: async () => true, hasSessionLive: async () => true,
}))
vi.mock('../subjects.js', () => ({
  questSubjectOut: async (r: { subject_id?: string | null }) => {
    const m: Record<string, { subject: string; subjectCode: string }> = { [`${'00000000-0000-4000-8000-000000000060'}`]: { subject: 'מדעים', subjectCode: 'science' }, [`${'00000000-0000-4000-8000-000000000061'}`]: { subject: 'מתמטיקה', subjectCode: 'math' } }
    return (r.subject_id && m[r.subject_id]) || { subject: null, subjectCode: null }
  },
}))

import { realResultsProvider as P } from './realResults.js'
import { resetAccessLogDedup } from '../authz.js'

const uid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const SCHOOL = uid(1), OTHER_SCHOOL = uid(2), C1 = uid(10), C2 = uid(11), C3 = uid(12), C_OTHER = uid(13)
const T_HOME = uid(20), T_SCI = uid(21), T_OUT = uid(22), ADMIN = uid(23), SUPER = uid(24), ADMIN_OTHER = uid(25), T_MATH = uid(26)
const SCI = uid(60), MATH = uid(61), Q_SCI = uid(40), Q_MATH = uid(41)
const STU = [30, 31, 32, 33, 34, 35].map(uid)
const NAMES = ['אבי כהן', 'בני לוי', 'גלית ברק', 'דנה רז', 'הדס שמש', 'ויקטור נחום']
const NOW = '2026-10-26T10:00:00Z' /* יום שני; השבוע מתחיל ב-25.10 00:00 שעון ישראל */
const NOW_MS = Date.parse(NOW)

const GAME = {
  entrySceneId: 's0',
  scenes: [
    { id: 's0', title: 'פתיחה', narrative: 'מילה אחת שתיים שלוש' },
    { id: 's1', title: 'מצב הצבירה', puzzle: { type: 'multipleChoice', question: 'מה מצב הצבירה של קרח?', choices: [{ id: 'a', text: 'מוצק', isCorrect: true }, { id: 'b', text: 'נוזל', isCorrect: false }] } },
    { id: 's2', title: 'סיכום', narrative: 'סיום' },
  ],
}

let seq = 0
const ins = (table: string, rows: Row[]): void => { h.db[table].push(...rows.map((r) => ({ id: `r${++seq}`, ...r }))) }
const ago = (ms: number): string => new Date(NOW_MS - ms).toISOString()
const asg = (id: string, quest: string, cls: string, sender: string, createdAt: string, extra: Row = {}): Row => ({ id, quest_id: quest, class_id: cls, user_id: sender, created_at: createdAt, ...extra })
const sess = (id: string, quest: string, user: string, startedAt: string, completedAt: string | null, extra: Row = {}): Row =>
  ({ id, user_id: user, quest_id: quest, started_at: startedAt, completed_at: completedAt, is_synthetic: false, ...extra })

const req = (userId: string, role: 'teacher' | 'admin' | 'municipal_admin' | 'super_admin' = 'teacher', schoolId: string | null = SCHOOL): Request =>
  ({ staff: { userId, role, schoolId: role === 'super_admin' ? null : schoolId, name: 'x', authId: 'x', canShare: true } }) as unknown as Request
const fail = async (p: Promise<unknown>): Promise<{ status: number; message: string }> => {
  try { await p } catch (e) { return e as { status: number; message: string } }
  throw new Error('expected a rejection')
}

function reset(): void {
  for (const k of Object.keys(h.db)) delete h.db[k]
  for (const t of ['schools', 'classes', 'class_teachers', 'users', 'class_members', 'quests', 'assignments', 'sessions', 'events', 'answers', 'quest_variants', 'option_tags', 'misconceptions', 'moral_choices', 'data_access_log']) h.db[t] = []
  h.calls.length = 0
  seq = 0
  ins('schools', [{ id: SCHOOL, demo_data_enabled: false }, { id: OTHER_SCHOOL, demo_data_enabled: false }])
  /* ו׳2 (C1) ו-ו׳3 (C3) באותה שכבה; ז׳1 (C2) לבד; ו-ח׳... בבית ספר אחר */
  ins('classes', [
    { id: C1, name: 'ו׳2', grade_label: 'ו׳2', school_id: SCHOOL },
    { id: C2, name: 'ז׳1', grade_label: 'ז׳1', school_id: SCHOOL },
    { id: C3, name: 'ו׳3', grade_label: 'ו׳3', school_id: SCHOOL },
    { id: C_OTHER, name: 'ו׳1', grade_label: 'ו׳1', school_id: OTHER_SCHOOL },
  ])
  ins('class_teachers', [
    { class_id: C1, teacher_id: T_HOME, is_homeroom: true, subject_id: null },
    { class_id: C1, teacher_id: T_SCI, is_homeroom: false, subject_id: SCI },
    { class_id: C1, teacher_id: T_MATH, is_homeroom: false, subject_id: MATH },
    { class_id: C2, teacher_id: T_OUT, is_homeroom: true, subject_id: null },
  ])
  const roster = (cls: string, ids: string[], names: string[]): void => {
    ins('users', ids.map((id, i) => ({ id, name: names[i], role: 'student', school_id: SCHOOL, is_active: true })))
    ins('class_members', ids.map((id) => ({ class_id: cls, user_id: id })))
  }
  roster(C1, STU, NAMES)
  const c3 = [40, 41, 42, 43, 44].map((n) => uid(200 + n))
  roster(C3, c3, ['א א', 'ב ב', 'ג ג', 'ד ד', 'ה ה'])
  roster(C2, [uid(300)], ['תלמיד יחיד'])
  ins('users', [
    ...[[T_HOME, 'מחנך'], [T_SCI, 'מורה מדעים'], [T_OUT, 'מורה אחר'], [T_MATH, 'מורה חשבון']].map(([id, name]) => ({ id, name, role: 'teacher', school_id: SCHOOL, is_active: true })),
  ])
  ins('quests', [
    { id: Q_SCI, title: 'מסע המים', created_by: T_SCI, subject_id: SCI, game_data: GAME },
    { id: Q_MATH, title: 'מסע השברים', created_by: T_MATH, subject_id: MATH, game_data: GAME },
  ])
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(NOW)); reset(); resetAccessLogDedup() })
afterEach(() => { vi.useRealTimers() })

/* ══════════════════════════════════════════════════════════════════════════ */
describe('רשימה: "השיעורים שלי" / "כל השיעורים בכיתה שלי"', () => {
  beforeEach(() => {
    ins('assignments', [
      asg(uid(501), Q_SCI, C1, T_SCI, '2026-10-20T08:00:00Z'), /* מורה המדעים שלח לכיתת-החינוך של T_HOME */
      asg(uid(502), Q_MATH, C1, T_HOME, '2026-10-22T08:00:00Z'), /* המחנך שלח בעצמו, שיעור במקצוע של T_MATH */
    ])
  })

  it('מחנך/ת: ברירת המחדל = מה ששלח/ה בעצמו/ה; הבורר זמין; אין פס שבועי', async () => {
    const r = await P.list(req(T_HOME), {})
    expect(r.view).toBe('mine')
    expect(r.canToggleView).toBe(true)
    expect(r.weekStrip).toBeUndefined()
    expect(r.submissions.map((s) => s.id)).toEqual([uid(502)])
    expect(SubmissionListSchema.safeParse(r).success).toBe(true)
  })

  it('מחנך/ת: "כל השיעורים בכיתה שלי" — כל מה שנשלח לכיתה, עם מי ששלח', async () => {
    const r = await P.list(req(T_HOME), { view: 'class' })
    expect(r.view).toBe('class')
    expect(r.submissions.map((s) => s.id)).toEqual([uid(502), uid(501)])
    expect(r.submissions.find((s) => s.id === uid(501))).toMatchObject({ source: 'homeroom', senderName: 'מורה מדעים' })
  })

  it('מורה מקצוע: רואה את שלו ואת כל מה שבמקצועו בכיתות שלו; אין בורר, וגם אם ביקש "class" מקבל "mine"', async () => {
    const r = await P.list(req(T_SCI), { view: 'class' })
    expect(r.canToggleView).toBe(false)
    expect(r.view).toBe('mine')
    expect(r.weekStrip).toBeUndefined()
    expect(r.submissions.map((s) => s.id)).toEqual([uid(501)])
    /* גם שיעור של מורה אחר במקצועו (מדעים) יופיע */
    ins('assignments', [asg(uid(503), Q_SCI, C1, T_HOME, '2026-10-23T08:00:00Z')])
    expect((await P.list(req(T_SCI), {})).submissions.map((s) => s.id)).toEqual([uid(503), uid(501)])
    /* מורה שאינו משויך לכיתה בכלל — רשימה ריקה */
    expect((await P.list(req(T_OUT), {})).submissions).toEqual([])
  })

  it('מורה שהוא גם מחנך וגם מלמד מקצוע: שיעור של אחר במקצועו נחשב "שלי"', async () => {
    ins('class_teachers', [{ class_id: C1, teacher_id: T_HOME, is_homeroom: false, subject_id: SCI }])
    ins('assignments', [asg(uid(504), Q_SCI, C1, T_SCI, '2026-10-24T08:00:00Z')])
    const mine = (await P.list(req(T_HOME), {})).submissions.map((s) => s.id)
    expect(mine).toEqual(expect.arrayContaining([uid(504), uid(502)]))
  })

  it('מנהל-על: רואה הכול, בלי בורר', async () => {
    const r = await P.list(req(SUPER, 'super_admin'), {})
    expect(r.canToggleView).toBe(false)
    expect(r.submissions).toHaveLength(2)
  })
})

describe('רשימה: חלון זמן, פעיל עכשיו, פס שבועי', () => {
  it('שיעורים ישנים מ-30 יום מחכים מאחורי הכפתור; olderCount אומר כמה', async () => {
    ins('assignments', [
      asg(uid(510), Q_SCI, C1, T_SCI, '2026-10-20T08:00:00Z'),
      asg(uid(511), Q_SCI, C1, T_SCI, '2026-09-01T08:00:00Z'),
      asg(uid(512), Q_SCI, C1, T_SCI, '2026-08-01T08:00:00Z'),
    ])
    const recent = await P.list(req(T_SCI), {})
    expect(recent.submissions.map((s) => s.id)).toEqual([uid(510)])
    expect(recent.olderCount).toBe(2)
    const all = await P.list(req(T_SCI), { older: true })
    expect(all.submissions.map((s) => s.id)).toEqual([uid(510), uid(511), uid(512)])
    expect(all.olderCount).toBe(2)
    /* חיפוש וסינון חלים גם על הישנים: olderCount סופר רק את ההתאמות */
    expect((await P.list(req(T_SCI), { q: 'אין כזה' })).olderCount).toBe(0)
  })

  it('פעיל עכשיו קודם, גם אם הוא ישן יותר (פעילות ב-5 הדקות האחרונות — התחלה, השלמה או פעימה)', async () => {
    ins('assignments', [asg(uid(520), Q_SCI, C1, T_SCI, '2026-10-26T06:00:00Z'), asg(uid(521), Q_SCI, C1, T_SCI, '2026-10-21T08:00:00Z', { quest_id: Q_MATH })])
    /* הישן יותר פעיל כרגע: פעימה לפני 40 שניות */
    ins('sessions', [sess('x1', Q_MATH, STU[0], ago(20 * 60_000), null, { last_seen_at: ago(40_000) })])
    const r = await P.list(req(T_HOME), { view: 'class' })
    expect(r.submissions.map((s) => s.id)).toEqual([uid(521), uid(520)])
    expect(r.submissions[0].state).toBe('active_now')
  })

  it('פס שבועי: שיעורי השבוע בכיתת-החינוך בלבד; מי שסומן/ה בשני מקצועות; לא מושפע מסינון', async () => {
    /* השבוע (מ-25.10): מדעים ומתמטיקה. סשן של STU[0] שהושלם בלי הצלחה בכל אחד = "ויתר" ≥2? נשתמש בכלל "לא התחיל אחרי המועד" */
    ins('assignments', [
      asg(uid(530), Q_SCI, C1, T_SCI, '2026-10-25T08:00:00Z', { due_at: '2026-10-25T20:00:00Z' }),
      asg(uid(531), Q_MATH, C1, T_MATH, '2026-10-25T09:00:00Z', { due_at: '2026-10-25T20:00:00Z' }),
      asg(uid(532), Q_SCI, C1, T_SCI, '2026-10-18T08:00:00Z'), /* שבוע שעבר — לא בפס */
    ])
    const r = await P.list(req(T_HOME), { view: 'class' })
    const strip = r.weekStrip!
    expect(strip.lessons).toBe(2)
    expect(strip.subjects).toBe(2)
    expect(strip.sentence).toBe('השבוע: 2 שיעורים ב-2 מקצועות')
    /* שני השיעורים הסתיימו (המועד עבר), ואף תלמיד לא התחיל: כולם לתשומת לב בשניהם → כולם מסומנים בשני מקצועות */
    expect(strip.flagged.map((f) => f.name).sort((a, b) => a.localeCompare(b, 'he'))).toEqual([...NAMES].sort((a, b) => a.localeCompare(b, 'he')))
    for (const f of strip.flagged) expect(f.subjects).toEqual(['מתמטיקה', 'מדעים'])
    expect(strip.flaggedLine).toContain(NAMES[0])
    /* סינון לפי מקצוע משנה את הרשימה, לא את הפס */
    const filtered = await P.list(req(T_HOME), { view: 'class', subject: 'math' })
    expect(filtered.submissions.map((s) => s.id)).toEqual([uid(531)])
    expect(filtered.weekStrip).toEqual(strip)
  })

  it('פס שבועי בלי שיעורים השבוע: משפט שאומר זאת', async () => {
    ins('assignments', [asg(uid(540), Q_SCI, C1, T_SCI, '2026-10-20T08:00:00Z')])
    const r = await P.list(req(T_HOME), { view: 'class' })
    expect(r.weekStrip).toMatchObject({ lessons: 0, subjects: 0, flagged: [], flaggedLine: null })
    expect(r.weekStrip!.sentence).toBe('השבוע: עוד לא נשלחו שיעורים לכיתה.')
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
describe('תצוגה חיה', () => {
  const A = uid(600)
  beforeEach(() => {
    ins('assignments', [asg(A, Q_SCI, C1, T_SCI, '2026-10-26T06:00:00Z')])
    ins('sessions', [
      sess('f', Q_SCI, STU[0], ago(30 * 60_000), ago(10 * 60_000), { last_seen_at: ago(10 * 60_000) }),
      sess('w', Q_SCI, STU[1], ago(8 * 60_000), null, { last_seen_at: ago(10_000), live: { sceneId: 's1', inPuzzle: false, mistakes: 0, progressAt: ago(30_000), lastChallenge: null } }),
      sess('s', Q_SCI, STU[2], ago(9 * 60_000), null, { last_seen_at: ago(12_000), live: { sceneId: 's1', inPuzzle: true, mistakes: LIVE_RULES.stuckMistakes, progressAt: ago(60_000), lastChallenge: null } }),
      sess('i', Q_SCI, STU[3], ago(20 * 60_000), null, { last_seen_at: ago(LIVE_RULES.inactiveMs + 60_000), live: { sceneId: 's2', inPuzzle: false, mistakes: 0, progressAt: ago(200_000), lastChallenge: null } }),
    ])
  })

  it('אריח לכל תלמיד/ה; מצבים מהכללים; מי שנתקע/ה קודם; הסצנה והסיבה במילים', async () => {
    const v = await P.live(req(T_SCI), A)
    expect(LiveViewSchema.safeParse({ ...v }).success).toBe(true)
    expect(v.available).toBe(true)
    expect(v.refreshMs).toBe(LIVE_RULES.refreshMs)
    expect(v.counts).toEqual({ not_started: 2, working: 1, stuck: 1, gave_up: 0, inactive: 1, finished: 1 })
    expect(v.tiles.map((t) => t.status)).toEqual(['stuck', 'working', 'inactive', 'not_started', 'not_started', 'finished'])
    const stuck = v.tiles[0]
    expect(stuck).toMatchObject({ name: NAMES[2], sceneOrder: 2, sceneTitle: 'מצב הצבירה' })
    expect(stuck.reasonText).toBe(`${LIVE_RULES.stuckMistakes} טעויות ברצף באותו אתגר`)
    expect(v.tiles.find((t) => t.status === 'inactive')!.reasonText).toContain('בלי שום פעולה')
    expect(v.tiles.find((t) => t.status === 'finished')!.sceneOrder).toBeNull()
    expect(v.summary).toContain('משחקים עכשיו')
    expect(v.head.state).toBe('active_now')
  })

  it('קל ומהיר: לא טוען תשובות/אירועים/תגיות', async () => {
    h.calls.length = 0
    await P.live(req(T_SCI), A)
    for (const t of ['answers', 'events', 'option_tags', 'moral_choices', 'quest_variants']) expect(h.calls, t).not.toContain(t)
  })

  it('יומן גישה: שורה לכל תלמיד פעם אחת, ולא בכל רענון', async () => {
    await P.live(req(T_SCI), A)
    const first = h.db.data_access_log.filter((r) => r.scope === 'results_live')
    expect(first).toHaveLength(STU.length)
    await P.live(req(T_SCI), A)
    expect(h.db.data_access_log.filter((r) => r.scope === 'results_live')).toHaveLength(STU.length)
  })

  it('הרשאה: שיעור שאינו גלוי — 404; מנהל — 403', async () => {
    expect((await fail(P.live(req(T_OUT), A))).status).toBe(404)
    expect((await fail(P.live(req(ADMIN, 'admin'), A))).status).toBe(403)
    expect((await fail(P.live(req(T_SCI), 'not-a-uuid'))).status).toBe(404)
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
describe('טבלת המנהל/ת: שכבה × מקצוע', () => {
  beforeEach(() => {
    ins('assignments', [
      asg(uid(700), Q_SCI, C1, T_SCI, '2026-10-12T08:00:00Z'), /* ו׳ × מדעים */
      asg(uid(701), Q_SCI, C3, T_SCI, '2026-10-13T08:00:00Z'), /* ו׳ × מדעים — כיתה שנייה */
      asg(uid(702), Q_MATH, C1, T_MATH, '2026-10-14T08:00:00Z'), /* ו׳ × חשבון — כיתה אחת בלבד: מוסתר */
      asg(uid(703), Q_SCI, C2, T_OUT, '2026-10-15T08:00:00Z'), /* ז׳ × מדעים — תלמיד אחד: מוסתר */
      asg(uid(704), Q_SCI, C1, T_SCI, '2026-09-20T08:00:00Z'), /* ספטמבר — לא בחודש */
    ])
    ins('sessions', [
      sess('p1', Q_SCI, STU[0], '2026-10-12T09:00:00Z', null), sess('p2', Q_SCI, STU[1], '2026-10-12T09:05:00Z', '2026-10-12T09:25:00Z'),
      sess('p3', Q_SCI, uid(240), '2026-10-13T09:00:00Z', '2026-10-13T09:20:00Z'),
    ])
  })

  it('מנהל: התא המוצג מכיל שיעורים והשתתפות; כיתה אחת או מעט תלמידים — מוסתר; התקופה היא החודש', async () => {
    const o = await P.overview(req(ADMIN, 'admin'))
    expect(OverviewSchema.safeParse(o).success).toBe(true)
    expect(o.periodLabel).toBe('אוקטובר 2026')
    const cell = (grade: string, subject: string) => o.cells.find((c) => c.gradeId === grade && c.subject === subject)!
    expect(cell('g6', 'science')).toEqual({ gradeId: 'g6', subject: 'science', status: 'shown', lessons: 1, participated: 3, total: 11 })
    expect(cell('g6', 'math').status).toBe('hidden')
    expect(cell('g7', 'science').status).toBe('hidden')
    expect(cell('g7', 'math').status).toBe('empty')
    expect(o.hasHidden).toBe(true)
    expect(o.sentence).toContain('נשלחו שיעורים')
    expect(o.howWeCalculated.length).toBeGreaterThan(0)
  })

  it('פרטיות: בלי שמות תלמידים, בלי שמות כיתות ובלי שמות מורים בתגובה; תא מוסתר בלי מספרים', async () => {
    const o = await P.overview(req(ADMIN, 'admin'))
    const json = JSON.stringify(o)
    for (const secret of [...NAMES, 'ו׳2', 'ו׳3', 'ז׳1', 'מורה מדעים', 'מורה חשבון', 'מסע המים']) expect(json.includes(secret), secret).toBe(false)
    for (const c of o.cells.filter((x) => x.status !== 'shown')) expect([c.lessons, c.participated, c.total]).toEqual([undefined, undefined, undefined])
  })

  it('בית ספר אחר לא נכלל; מנהל עירוני מקבל אותה טבלה; מנהל בלי בית ספר — טבלה ריקה', async () => {
    ins('assignments', [asg(uid(710), Q_SCI, C_OTHER, T_SCI, '2026-10-12T08:00:00Z')])
    const other = await P.overview(req(ADMIN_OTHER, 'admin', OTHER_SCHOOL))
    expect(other.cells.filter((c) => c.status === 'shown')).toEqual([])
    expect(other.sentence).toBe('עוד לא נשלחו שיעורים החודש. הטבלה תתמלא כשמורים ישלחו שיעורים לתלמידים.')
    const muni = await P.overview(req(ADMIN, 'municipal_admin'))
    expect(muni.cells.filter((c) => c.status === 'shown')).toHaveLength(1)
    const none = await P.overview(req(ADMIN, 'admin', null))
    expect(none.cells).toEqual([])
  })

  it('תקרה נמוכה: 4 תלמידים בשתי כיתות — מוסתר (סף מינימום תלמידים)', async () => {
    h.db.class_members = h.db.class_members.filter((m) => m.class_id !== C3 || [uid(240)].includes(m.user_id as string)) /* ל-ו׳3 נשאר תלמיד אחד */
    h.db.class_members = h.db.class_members.filter((m) => m.class_id !== C1 || (STU.slice(0, 3) as unknown[]).includes(m.user_id)) /* ול-ו׳2 שלושה */
    const o = await P.overview(req(ADMIN, 'admin'))
    expect(o.cells.find((c) => c.gradeId === 'g6' && c.subject === 'science')!.status).toBe('hidden')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   מטריצת הרשאות לשלב R: מי רואה את הרשימה, את השיעור החי ואת הטבלה
   ══════════════════════════════════════════════════════════════════════════ */
describe('מטריצת הרשאות: רשימה / תצוגה חיה / טבלה', () => {
  const A = uid(800)
  beforeEach(() => { ins('assignments', [asg(A, Q_SCI, C1, T_SCI, '2026-10-26T06:00:00Z')]) })
  type Who = { name: string; r: Request }
  const who: Who[] = [
    { name: 'מחנך הכיתה', r: req(T_HOME) },
    { name: 'מורה המקצוע ששלח', r: req(T_SCI) },
    { name: 'מורה אחר בכיתה (מקצוע אחר)', r: req(T_MATH) },
    { name: 'מורה מכיתה אחרת', r: req(T_OUT) },
    { name: 'מנהל', r: req(ADMIN, 'admin') },
    { name: 'מנהל עירוני', r: req(ADMIN, 'municipal_admin') },
    { name: 'מנהל-על', r: req(SUPER, 'super_admin') },
  ]
  /* [רשימה מכילה את השיעור, עמוד שיעור/תצוגה חיה: סטטוס, טבלה: סטטוס] */
  const expected: Record<string, ['yes' | 'no' | 403, 200 | 404 | 403, 200 | 403]> = {
    'מחנך הכיתה': ['no', 200, 403], /* ברשימת "שלי" הוא לא מופיע (נשלח ע"י אחר), אך בעמוד השיעור ובתצוגה החיה — כן */
    'מורה המקצוע ששלח': ['yes', 200, 403],
    'מורה אחר בכיתה (מקצוע אחר)': ['no', 404, 403],
    'מורה מכיתה אחרת': ['no', 404, 403],
    'מנהל': [403, 403, 200],
    'מנהל עירוני': [403, 403, 200],
    'מנהל-על': ['yes', 200, 403],
  }
  for (const w of who) {
    it(w.name, async () => {
      const [inList, page, table] = expected[w.name]
      if (inList === 403) expect((await fail(P.list(w.r, {}))).status).toBe(403)
      else expect((await P.list(w.r, {})).submissions.some((s) => s.id === A)).toBe(inList === 'yes')
      const livePage = async (): Promise<number> => { try { await P.live(w.r, A); return 200 } catch (e) { return (e as { status: number }).status } }
      expect(await livePage(), 'תצוגה חיה').toBe(page)
      const classPage = async (): Promise<number> => { try { await P.classView(w.r, A); return 200 } catch (e) { return (e as { status: number }).status } }
      expect(await classPage(), 'עמוד שיעור').toBe(page)
      const tablePage = async (): Promise<number> => { try { await P.overview(w.r); return 200 } catch (e) { return (e as { status: number }).status } }
      expect(await tablePage(), 'טבלה').toBe(table)
    })
  }
})
