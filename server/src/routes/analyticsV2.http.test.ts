/* בדיקות ברמת HTTP של נתיבי האנליטיקה החדשה: מגבלות קצב, כותרות, יכולות, 404 אחיד, יומן גישה (ממתינים לפני התגובה), ספק חי מזויף.
   אין DB: האימות, ההרשאות (authz) והיומן מוחלפים ב-mocks; הספק החי הוא createProvider על ניתוח קבוע. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import express from 'express'

const h = vi.hoisted(() => ({
  users: new Map<string, { staff: Record<string, unknown>; authz: Record<string, unknown>; v2: unknown }>(),
  logCalls: [] as { viewer: { userId: string }; entries: { studentId?: string | null; scope: string; endpoint: string }[]; opts: Record<string, unknown> }[],
  auditDone: false,
  auditFails: false,
}))

vi.mock('../middleware/staffAuth.js', async () => {
  const { AppError } = await import('../middleware/errors.js')
  return {
    requireStaff: (req: { headers: Record<string, string | undefined>; staff?: unknown }, _res: unknown, next: (e?: unknown) => void) => {
      const id = req.headers['x-user']
      const u = id ? h.users.get(id) : undefined
      if (!u) return next(new AppError(401, 'נדרשת התחברות צוות'))
      req.staff = u.staff
      next()
    },
    isDemoGuest: (req: { staff?: { isGuest?: boolean } }) => req.staff?.isGuest === true && process.env.DEMO_ANALYTICS !== '0',
  }
})
vi.mock('../lib/authz.js', async (orig) => {
  const m = await orig<typeof import('../lib/authz.js')>()
  const { AppError } = await import('../middleware/errors.js')
  return {
    ...m,
    loadViewer: vi.fn(async (req: { staff: { userId: string } }) => h.users.get(req.staff.userId)!.authz),
    logAccessMany: vi.fn(async (viewer: { userId: string }, entries: { studentId?: string | null; scope: string; endpoint: string }[], opts: Record<string, unknown>) => {
      h.logCalls.push({ viewer, entries, opts })
      await new Promise((r) => setTimeout(r, 30))
      if (h.auditFails) throw new AppError(503, m.MSG_ACCESS_LOG_UNAVAILABLE)
      h.auditDone = true
    }),
  }
})
vi.mock('../lib/analyticsV2/liveViewer.js', async (orig) => ({
  ...(await orig<typeof import('../lib/analyticsV2/liveViewer.js')>()),
  toV2Viewer: vi.fn(async (base: { userId: string }) => h.users.get(base.userId)!.v2),
}))
vi.mock('../lib/analyticsV2/liveProvider.js', async () => {
  const kit = await import('../lib/analyticsV2/providerTestkit.js')
  const { createProvider } = await import('../lib/analyticsV2/providerCore.js')
  return { liveProvider: createProvider(kit.fakeSource(kit.standardAnalysis())) }
})

import { ERR_AGGREGATE_ONLY, ERR_NOT_FOUND, ERR_NO_ACCESS, ERR_V2_BAD_SCOPE, ERR_V2_BAD_SUBJECT, ERR_V2_DISABLED } from '../../../src/shared/lib/findingsNarrative.js'
import { MSG_ACCESS_LOG_UNAVAILABLE } from '../lib/authz.js'
import type { V2Viewer } from '../lib/analyticsV2/access.js'
import { CA, CB, CC, adminViewer, grant, live } from '../lib/analyticsV2/providerTestkit.js'
import { errorHandler } from '../middleware/errors.js'
import { demoProvider } from '../lib/analyticsV2/demoProvider.js'
import { emptyProvider } from '../lib/analyticsV2/provider.js'
import { ANALYTICS_V2_RATE, AUDIT_DEDUP_MS, analyticsV2Router, providerFor } from './analyticsV2.js'

const addUser = (id: string, role: string, v2: V2Viewer | null, extra: { isGuest?: boolean; seesSynthetic?: boolean } = {}): void => {
  h.users.set(id, {
    staff: { userId: id, role, schoolId: 'sch-1', isGuest: extra.isGuest ?? false, canShare: true },
    authz: { userId: id, role, schoolId: 'sch-1', grants: new Map(), seesSynthetic: extra.seesSynthetic ?? false },
    v2,
  })
}
const HOME = live([grant(CA.id, { homeroom: true }), grant(CB.id, { subjects: ['math'] })])
const SPLIT = live([grant(CA.id, { subjects: ['history'] }), grant(CB.id, { subjects: ['math'] })])
addUser('u-home', 'teacher', HOME)
addUser('u-split', 'teacher', SPLIT)
addUser('u-none', 'teacher', live([]))
addUser('u-rate', 'teacher', live([grant(CA.id, { homeroom: true })]))
addUser('u-unspec', 'teacher', live([grant(CA.id, { unspecified: true })]))
addUser('u-admin', 'admin', adminViewer)
addUser('u-muni', 'municipal_admin', adminViewer)
addUser('u-super', 'super_admin', null)
addUser('u-guest', 'teacher', null, { isGuest: true })
addUser('u-demo-org', 'teacher', null, { seesSynthetic: true })

let server: Server
let base = ''
beforeAll(async () => {
  const app = express()
  app.set('trust proxy', true)
  app.use('/api/analytics-v2', analyticsV2Router)
  app.use(errorHandler)
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()) })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/analytics-v2`
})
afterAll(async () => { await new Promise((r) => server.close(r)) })
beforeEach(() => {
  delete process.env.ANALYTICS_V2
  delete process.env.ANALYTICS_V2_LIVE
  delete process.env.ANALYTICS_V2_AUDIT_FAIL_CLOSED
  delete process.env.ANALYTICS_V2_PROVIDER
  delete process.env.DEMO_ANALYTICS
  h.logCalls.length = 0
  h.auditDone = false
  h.auditFails = false
})

let ipSeq = 0
async function get(path: string, user: string | null, ip = `10.0.${++ipSeq}.1`): Promise<{ status: number; headers: Headers; body: Record<string, unknown> }> {
  const res = await fetch(base + path, { headers: { ...(user ? { 'x-user': user } : {}), 'x-forwarded-for': ip } })
  return { status: res.status, headers: res.headers, body: (await res.json()) as Record<string, unknown> }
}
const guestQ = (q: string): string => `?${q}`

describe('כותרות', () => {
  it('Cache-Control: private, no-store — בתגובה מוצלחת ובשגיאה', async () => {
    const ok = await get('/config', 'u-home')
    expect(ok.status).toBe(200)
    expect(ok.headers.get('cache-control')).toBe('private, no-store')
    const err = await get('/student/nope', 'u-home')
    expect(err.status).toBe(404)
    expect(err.headers.get('cache-control')).toBe('private, no-store')
  })
})

describe('הגבלת קצב', () => {
  it('פר-משתמש: אחרי התקרה — 429', async () => {
    const ip = '10.99.0.1'
    for (let i = 0; i < ANALYTICS_V2_RATE.perUser; i++) expect((await get('/config', 'u-rate', ip)).status, `#${i}`).toBe(200)
    expect((await get('/config', 'u-rate', ip)).status).toBe(429)
    /* משתמש אחר מאותו IP לא נחסם בגלל משתמש אחד */
    expect((await get('/config', 'u-none', ip)).status).toBe(200)
  }, 30_000)
  it('/admin/overview: תקרה נפרדת וקטנה יותר', async () => {
    const ip = '10.99.0.2'
    for (let i = 0; i < ANALYTICS_V2_RATE.adminPerUser; i++) expect((await get('/admin/overview', 'u-muni', ip)).status, `#${i}`).toBe(200)
    expect((await get('/admin/overview', 'u-muni', ip)).status).toBe(429)
    /* שאר הנקודות של אותו משתמש עדיין פתוחות */
    expect((await get('/config', 'u-muni', ip)).status).toBe(200)
  })
  it('פר-IP: לפני האימות — גם בקשות בלי התחברות נספרות', async () => {
    const ip = '10.99.0.3'
    for (let i = 0; i < ANALYTICS_V2_RATE.perIp; i++) expect((await get('/config', null, ip)).status, `#${i}`).toBe(401)
    expect((await get('/config', null, ip)).status).toBe(429)
  }, 60_000)
})

describe('מתגי כיבוי', () => {
  it('ANALYTICS_V2_LIVE=0: משתמש אמיתי — enabled=false, יתר הנקודות 403; אורח עדיין עובד', async () => {
    process.env.ANALYTICS_V2_LIVE = '0'
    const cfg = await get('/config', 'u-home')
    expect((cfg.body.data as { enabled: boolean }).enabled).toBe(false)
    const roster = await get('/roster', 'u-home')
    expect(roster.status).toBe(403)
    expect(roster.body.error).toBe(ERR_V2_DISABLED)
    expect((await get(`/entry${guestQ('lens=homeroom')}`, 'u-guest')).status).toBe(200)
  })
  it('מנהל-על: enabled=false (נשאר ב-/admin), יתר הנקודות 403', async () => {
    expect(((await get('/config', 'u-super')).body.data as { enabled: boolean }).enabled).toBe(false)
    expect((await get('/roster', 'u-super')).status).toBe(403)
  })
  it('config של משתמש אמיתי: enabled, עדשה יחידה, בלי הערת "נתוני הדגמה"', async () => {
    const d = (await get('/config', 'u-home')).body.data as { enabled: boolean; lens: string; availableLenses: string[]; dataNotice: unknown; classes: { id: string }[] }
    expect(d).toMatchObject({ enabled: true, lens: 'homeroom', availableLenses: ['homeroom'], dataNotice: null })
    expect(d.classes.map((c) => c.id)).toEqual([CA.id, CB.id])
  })
})

describe('יכולת לפי נקודת קצה', () => {
  const TEACHER_PATHS = ['/student/stu-A-1', '/student/stu-A-1/feedback', `/class/${CA.id}/overview`, `/class/${CA.id}/subject/math`, '/briefing/student/stu-A-1', `/briefing/class/${CA.id}`, '/student/does-not-exist']
  it.each(['u-admin', 'u-muni'])('%s מול כל נקודת מורה: 403 ERR_AGGREGATE_ONLY — גם על ישות שאינה קיימת', async (user) => {
    for (const p of TEACHER_PATHS) {
      const r = await get(p, user)
      expect(r.status, p).toBe(403)
      expect(r.body.error, p).toBe(ERR_AGGREGATE_ONLY)
    }
  })
  it('מנהל: config / roster / entry → 200 ריקים', async () => {
    expect(((await get('/config', 'u-admin')).body.data as { classes: unknown[] }).classes).toEqual([])
    expect((await get('/roster', 'u-admin')).body.data).toEqual({ classes: [], students: [] })
    expect((await get('/entry', 'u-admin')).body.data).toMatchObject({ classes: [], alerts: [], alertsTotal: 0, unclassifiedCount: 0, coverageNote: null })
  })
  it('מורה מול /admin/overview: 403; מנהל: 200 וללא מזהי תלמידים/כיתות', async () => {
    const t = await get('/admin/overview', 'u-home')
    expect(t.status).toBe(403)
    expect(t.body.error).toBe(ERR_NO_ACCESS)
    const a = await get('/admin/overview', 'u-admin')
    expect(a.status).toBe(200)
    const json = JSON.stringify(a.body)
    for (const s of ['stu-', 'cls-', 'שם-']) expect(json.includes(s), s).toBe(false)
  })
})

describe('404 אחיד: מחוץ להיקף = לא קיים; 403 רק על מקצוע/סקירה נעולים בכיתה שבהיקף', () => {
  const pairs = (outsideStudent: string, outsideClass: string): [string, string][] => [
    [`/student/${outsideStudent}`, '/student/ghost'],
    [`/student/${outsideStudent}/feedback`, '/student/ghost/feedback'],
    [`/briefing/student/${outsideStudent}`, '/briefing/student/ghost'],
    [`/class/${outsideClass}/overview`, '/class/ghost/overview'],
    [`/class/${outsideClass}/subject/math`, '/class/ghost/subject/math'],
    [`/briefing/class/${outsideClass}`, '/briefing/class/ghost'],
  ]
  it('מחנך כיתה A בלבד מול ישויות של כיתה C (מחוץ להיקף) — גוף זהה לישות שאינה קיימת', async () => {
    addUser('u-home-a', 'teacher', live([grant(CA.id, { homeroom: true })]))
    for (const [outside, ghost] of pairs('stu-C-0', CC.id)) {
      const o = await get(outside, 'u-home-a')
      const g = await get(ghost, 'u-home-a')
      expect(o.status, outside).toBe(404)
      expect(o.body, outside).toEqual(g.body)
      expect(o.body.error).toBe(ERR_NOT_FOUND)
    }
  })
  it('מורה בלי כיתות: הכול 404; config / roster / entry ריקים ו-200', async () => {
    for (const [outside] of pairs('stu-A-0', CA.id)) expect((await get(outside, 'u-none')).status, outside).toBe(404)
    expect((await get('/roster', 'u-none')).body.data).toEqual({ classes: [], students: [] })
    expect(((await get('/entry', 'u-none')).body.data as { classes: unknown[] }).classes).toEqual([])
    expect(((await get('/config', 'u-none')).body.data as { enabled: boolean }).enabled).toBe(true)
  })
  it('מורה היסטוריה@א׳ + מתמטיקה@ב׳: הזוגות האסורים 403 (ERR_NO_ACCESS), המותרים 200', async () => {
    expect((await get(`/class/${CA.id}/subject/history`, 'u-split')).status).toBe(200)
    expect((await get(`/class/${CB.id}/subject/math`, 'u-split')).status).toBe(200)
    for (const p of [`/class/${CA.id}/subject/math`, `/class/${CB.id}/subject/history`, `/class/${CA.id}/overview`, `/class/${CB.id}/overview`]) {
      const r = await get(p, 'u-split')
      expect(r.status, p).toBe(403)
      expect(r.body.error, p).toBe(ERR_NO_ACCESS)
    }
    /* מקצוע שאינו בכיתה בכלל — 404 */
    expect((await get(`/class/${CA.id}/subject/science`, 'u-split')).status).toBe(404)
  })
  it('שיוך בלי מקצוע: הכיתה בהיקף אך הכול נעול (403)', async () => {
    expect((await get(`/class/${CA.id}/subject/math`, 'u-unspec')).status).toBe(403)
    expect((await get(`/class/${CA.id}/overview`, 'u-unspec')).status).toBe(403)
    expect((await get(`/briefing/class/${CA.id}`, 'u-unspec')).status).toBe(403)
    expect((await get('/student/stu-A-1', 'u-unspec')).status).toBe(200)
  })
  it('פרמטרים לא תקינים: 400', async () => {
    const s = await get(`/class/${CA.id}/subject/not-a-subject`, 'u-home')
    expect([s.status, s.body.error]).toEqual([400, ERR_V2_BAD_SUBJECT])
    const b = await get('/briefing/galaxy/x', 'u-home')
    expect([b.status, b.body.error]).toEqual([400, ERR_V2_BAD_SCOPE])
  })
})

describe('פרמטרי שאילתה (lens / subject) נקראים רק למורה אורח', () => {
  it('משתמש חי: lens=admin בשאילתה לא הופך אותו למנהל', async () => {
    const r = await get('/config?lens=admin&subject=math', 'u-home')
    expect((r.body.data as { lens: string }).lens).toBe('homeroom')
    expect((await get('/student/stu-A-1?lens=admin', 'u-home')).status).toBe(200)
  })
  it('אורח: העדשה מהשאילתה (ספק הדגמה)', async () => {
    expect(((await get('/config?lens=admin', 'u-guest')).body.data as { lens: string }).lens).toBe('admin')
    expect(((await get('/config?lens=subject_teacher&subject=hebrew', 'u-guest')).body.data as { lens: string }).lens).toBe('subject_teacher')
  })
})

describe('יומן גישה ברמת תלמיד', () => {
  it('roster: שורה לכל תלמיד (scope + endpoint), נכתב ומחכים לו לפני שהתגובה נשלחת', async () => {
    const r = await get('/roster', 'u-home')
    expect(r.status).toBe(200)
    expect(h.auditDone, 'התגובה נשלחה לפני שהכתיבה ליומן הסתיימה').toBe(true)
    expect(h.logCalls).toHaveLength(1)
    const call = h.logCalls[0]
    expect(call.viewer.userId).toBe('u-home')
    const students = (r.body.data as { students: { id: string }[] }).students
    expect(call.entries.map((e) => e.studentId).sort()).toEqual(students.map((s) => s.id).sort())
    expect(call.entries.every((e) => e.scope === 'analytics_v2_roster' && e.endpoint === 'GET /api/analytics-v2/roster')).toBe(true)
    expect(call.opts).toEqual({ studentLevel: true, failClosed: undefined, dedupMs: AUDIT_DEDUP_MS })
  })
  it('נקודות תלמיד: שורה אחת לתלמיד, scope לפי הנקודה', async () => {
    for (const [path, scope, ep] of [
      ['/student/stu-A-1', 'analytics_v2_student', 'GET /api/analytics-v2/student/:id'],
      ['/student/stu-A-1/feedback', 'analytics_v2_feedback', 'GET /api/analytics-v2/student/:id/feedback'],
      ['/briefing/student/stu-A-1', 'analytics_v2_briefing', 'GET /api/analytics-v2/briefing/:scope/:id'],
    ] as const) {
      h.logCalls.length = 0
      expect((await get(path, 'u-home')).status, path).toBe(200)
      expect(h.logCalls).toHaveLength(1)
      expect(h.logCalls[0].entries).toEqual([{ studentId: 'stu-A-1', scope, endpoint: ep }])
    }
  })
  it('entry / סקירה / מקצוע בכיתה: נרשמים; תדריך כיתה, config ו-admin: אין תלמידים → אין רישום', async () => {
    expect((await get('/entry', 'u-home')).status).toBe(200)
    expect(h.logCalls.at(-1)?.entries.every((e) => e.scope === 'analytics_v2_entry')).toBe(true)
    h.logCalls.length = 0
    expect((await get(`/class/${CA.id}/overview`, 'u-home')).status).toBe(200)
    expect((await get(`/class/${CB.id}/subject/math`, 'u-home')).status).toBe(200)
    expect(h.logCalls.map((c) => c.entries[0].scope)).toEqual(['analytics_v2_classOverview', 'analytics_v2_classSubject'])
    h.logCalls.length = 0
    for (const [p, u] of [[`/briefing/class/${CA.id}`, 'u-home'], ['/config', 'u-home'], ['/admin/overview', 'u-admin'], ['/roster', 'u-admin'], ['/entry', 'u-admin']] as const) {
      expect((await get(p, u)).status, p).toBe(200)
    }
    expect(h.logCalls).toHaveLength(0)
  })
  it('דחיות (404 / 403) לא נרשמות: לא נחשף דבר', async () => {
    await get('/student/ghost', 'u-home')
    await get(`/class/${CC.id}/overview`, 'u-home')
    await get(`/class/${CB.id}/overview`, 'u-home')
    await get('/student/stu-A-1', 'u-admin')
    expect(h.logCalls).toHaveLength(0)
  })
  it('אורח וארגון הדגמה (ספק הדגמה, אין DB): אין רישום', async () => {
    expect((await get('/roster?lens=homeroom', 'u-guest')).status).toBe(200)
    expect((await get('/roster', 'u-demo-org')).status).toBe(200)
    expect(h.logCalls).toHaveLength(0)
  })
  it('כשל בכתיבה ליומן: התגובה נחסמת (503) ואין בה נתוני תלמידים', async () => {
    h.auditFails = true
    const r = await get('/student/stu-A-1', 'u-home')
    expect(r.status).toBe(503)
    expect(r.body).toEqual({ error: MSG_ACCESS_LOG_UNAVAILABLE })
    expect(JSON.stringify(r.body)).not.toContain('שם-')
  })
  it('ANALYTICS_V2_AUDIT_FAIL_CLOSED=all: הנתיב מבקש נכשל-סגור לכל התפקידים', async () => {
    process.env.ANALYTICS_V2_AUDIT_FAIL_CLOSED = 'all'
    await get('/student/stu-A-1', 'u-home')
    expect(h.logCalls[0].opts).toMatchObject({ studentLevel: true, failClosed: 'all' })
  })
})

describe('בחירת ספק לפי הצופה', () => {
  it('הדגמה → ספק הדגמה, חי → הספק החי; ANALYTICS_V2_PROVIDER=empty (או real) מכריח ספק ריק לבדיקות', async () => {
    expect(providerFor({ viewer: HOME, provider: 'demo', authz: null })).toBe(demoProvider)
    expect(providerFor({ viewer: HOME, provider: 'live', authz: null })).not.toBe(demoProvider)
    for (const forced of ['empty', 'real']) {
      process.env.ANALYTICS_V2_PROVIDER = forced
      expect(providerFor({ viewer: HOME, provider: 'live', authz: null })).toBe(emptyProvider)
      expect(providerFor({ viewer: HOME, provider: 'demo', authz: null })).toBe(emptyProvider)
    }
    const r = await get('/roster', 'u-home')
    expect(r.body).toMatchObject({ dataState: 'insufficient', data: { classes: [], students: [] } })
  })
  it('ארגון הדגמה ומורה אורח מקבלים את עולם ההדגמה, ומשתמש אמיתי את הספק החי (מזהי כיתות שונים)', async () => {
    const demo = ((await get('/roster?lens=homeroom', 'u-guest')).body.data as { classes: { id: string }[] }).classes.map((c) => c.id)
    expect(demo).toEqual(['c-v2'])
    const org = ((await get('/roster', 'u-demo-org')).body.data as { classes: { id: string }[] }).classes
    expect(org).toEqual([])
    const real = ((await get('/roster', 'u-home')).body.data as { classes: { id: string }[] }).classes.map((c) => c.id)
    expect(real).toEqual([CA.id, CB.id])
  })
})
