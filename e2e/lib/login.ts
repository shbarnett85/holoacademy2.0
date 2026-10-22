/* ──────────────────────────────────────────────────────────────────────────
   כניסה: (א) מורה אורח; (ב) מורים אמיתיים משני fixtures (נפרדים, בקידומות שונות — אפשר להזריע את שניהם באותה ריצה):
     · results   — server/src/scripts/resultsFixture.ts   (zz-ux-res-):   real-homeroom | real-subject | real-unlinked | real-admin
     · analytics — server/src/scripts/analyticsFixture.ts (zz-ux-v2-w8-):  real-v2-*   (מחנך עשיר, מורה מקצועי, מעורב, צולב, בלי כיתות, מנהלים…)
   · ה-session נכתב ל-localStorage['holo_staff_session'] (init script ב-browser.ts) באותו פורמט כמו
     src/shared/lib/staffSession.ts: { access_token, refresh_token, expires_at, staff }.
   · ה-fixture רץ בתהליך-בן (cwd=server, כדי שה-.env ו-node_modules של השרת יטענו נכון) ומחזיר JSON.
     אסור להדפיס טוקנים/סיסמאות; שורת התוצאה (שמכילה אותם) לא מועברת ל-stdout.
   · טוקן Supabase חי כשעה, ו-expires_at בדפדפן 50 דקות: בריצה ארוכה מחדשים את הכניסה (freshSession) לפני יצירת הקשר דפדפן חדש,
     לפי הסיסמאות שה-fixture של האנליטיקה מחזיר (בזיכרון בלבד). ל-fixture של התוצאות אין סיסמאות — אין חידוש (הריצה שלו קצרה).
   ────────────────────────────────────────────────────────────────────────── */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { E2E_DIR, REPO_ROOT, SERVER_DIR } from './config.ts'
import { isAnalyticsFixtureWho, isRealWho } from './types.ts'
import type { Vars, Who } from './types.ts'

export interface StaffProfile {
  userId: string
  name: string
  role: 'teacher' | 'admin' | 'municipal_admin' | 'super_admin'
  schoolId: string | null
  email: string
  isGuest?: boolean
}
export interface StaffSession {
  access_token: string
  refresh_token: string
  expires_at?: number
  staff: StaffProfile
}

/* fetch עם ניסיונות חוזרים על שגיאת רשת / 502-504: השרת רץ ב-tsx watch ומתאתחל בכל שמירת קובץ (במיוחד כשכמה סוכנים עורכים) */
export async function fetchRetry(url: string | URL, init: RequestInit = {}, attempts = 4): Promise<Response> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) })
      if (res.status < 502 || res.status > 504 || i === attempts - 1) return res
    } catch (e) {
      lastErr = e
    }
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)))
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

/* ── (א) אורח ── */
export async function guestLogin(api: string): Promise<StaffSession> {
  const res = await fetchRetry(`${api}/api/auth/guest-login`, { method: 'POST' })
  if (!res.ok) throw new Error(`guest-login נכשל (${res.status}) — האם השרת רץ על ${api}?`)
  const j = (await res.json()) as { session?: { access_token: string; refresh_token: string; expires_at?: number }; staff?: StaffProfile }
  if (!j.session?.access_token || !j.staff) throw new Error('guest-login החזיר תגובה לא צפויה')
  return { access_token: j.session.access_token, refresh_token: j.session.refresh_token, expires_at: j.session.expires_at, staff: j.staff }
}

/* בורר העדשה של האורח — נוסף ל-URL ולקריאות ה-API (?lens=&subject=) */
export function lensParams(who: Who): Record<string, string> {
  switch (who) {
    case 'guest-homeroom': return { lens: 'homeroom' }
    case 'guest-subject-math': return { lens: 'subject_teacher', subject: 'math' }
    case 'guest-subject-hebrew': return { lens: 'subject_teacher', subject: 'hebrew' }
    case 'guest-admin': return { lens: 'admin' }
    default: return {}
  }
}

/* ── (ב) מורים אמיתיים מה-fixtures ── */
export type FixtureId = 'results' | 'analytics'
export const FIXTURE_IDS: readonly FixtureId[] = ['results', 'analytics']
const FIXTURE_FILES: Record<FixtureId, string> = {
  results: path.join(SERVER_DIR, 'src/scripts/resultsFixture.ts'),
  analytics: path.join(SERVER_DIR, 'src/scripts/analyticsFixture.ts'),
}
/* לתאימות לאחור (שם ישן) */
export const FIXTURE_FILE = FIXTURE_FILES.results

/* לאיזה fixture שייך צופה real-* */
export function fixtureOf(w: Who): FixtureId | null {
  if (isAnalyticsFixtureWho(w)) return 'analytics'
  if (isRealWho(w)) return 'results'
  return null
}

/* fixture התוצאות */
export type RealRole = 'homeroom' | 'subject' | 'unlinked' | 'admin'
export const REAL_WHO: Record<RealRole, Who> = { homeroom: 'real-homeroom', subject: 'real-subject', unlinked: 'real-unlinked', admin: 'real-admin' }
export const REAL_ROLES = Object.keys(REAL_WHO) as RealRole[]

/* fixture האנליטיקה: מפתח ב-fx.teachers + תפקיד הצוות + בית הספר */
type AnalyticsRole = { key: string; role: StaffProfile['role']; school: 'main' | 'other' | 'empty' }
export const ANALYTICS_ROLES: Partial<Record<Who, AnalyticsRole>> = {
  'real-v2-homeroom': { key: 'homeroom', role: 'teacher', school: 'main' },
  'real-v2-subject': { key: 'subject', role: 'teacher', school: 'main' },
  'real-v2-mixed': { key: 'mixed', role: 'teacher', school: 'main' },
  'real-v2-cross': { key: 'cross', role: 'teacher', school: 'main' },
  'real-v2-unspecified': { key: 'unspecified', role: 'teacher', school: 'main' },
  'real-v2-empty': { key: 'emptyHomeroom', role: 'teacher', school: 'main' },
  'real-v2-no-classes': { key: 'noClasses', role: 'teacher', school: 'main' },
  'real-v2-dual': { key: 'dual', role: 'teacher', school: 'main' },
  'real-v2-admin': { key: 'admin', role: 'admin', school: 'main' },
  'real-v2-municipal': { key: 'municipal', role: 'municipal_admin', school: 'main' },
  'real-v2-admin-small': { key: 'outsiderAdmin', role: 'admin', school: 'other' },
  'real-v2-admin-empty': { key: 'emptySchoolAdmin', role: 'admin', school: 'empty' },
}

export interface FixtureRun {
  id: FixtureId
  sessions: Partial<Record<Who, StaffSession>>
  /* פרטי כניסה — בזיכרון בלבד (אסור להדפיס או לכתוב לדיסק); קיימים רק ל-fixture האנליטיקה */
  creds: Partial<Record<Who, { email: string; password: string }>>
  issuedAt: Partial<Record<Who, number>>
  /* משתנים קבועים לצופה (מזהי כיתות/תלמידים מה-fixture) — דורסים את הגילוי */
  vars: Partial<Record<Who, Vars>>
  /* מזהים שהמבנה שה-fixture החזיר חשף (גיבוי לגילוי) */
  ids: Record<string, string | undefined>
  /* התוצאה הגולמית — לא להדפיס (מכילה טוקנים) */
  raw: unknown
  cleanup: () => Promise<void>
}

/* כינויים שבהם ה-fixture של התוצאות עשוי לקרוא למורים (סלחני) */
const ROLE_ALIASES: Record<RealRole, string[]> = {
  homeroom: ['homeroom', 'homeroomTeacher', 'teacherHomeroom', 'tHome', 'home', 'educator', 'mechanech'],
  subject: ['subject', 'subjectSame', 'subjectTeacher', 'teacherSubject', 'tSubject', 'tMath', 'math', 'professional'],
  unlinked: ['unlinked', 'unlinkedTeacher', 'outsider', 'tOut', 'out', 'other', 'otherTeacher'],
  admin: ['admin', 'adminTeacher', 'schoolAdmin', 'principal'],
}
const CONTAINERS = ['', 'teachers', 'tokens', 'auth', 'sessions', 'users', 'staff', 'logins', 'creds', 'credentials']

type Rec = Record<string, unknown>
const asRec = (v: unknown): Rec | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : null)
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined)
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

function pickStr(r: Rec | null, keys: string[]): string | undefined {
  if (!r) return undefined
  for (const k of keys) { const v = str(r[k]); if (v) return v }
  return undefined
}

/* ערך אחד (מחרוזת-טוקן או אובייקט) → session. email+password בלי טוקן → null (ננסה staff-login בנפרד) */
export function toSession(entry: unknown, role: RealRole): StaffSession | null {
  const direct = str(entry)
  const rec = asRec(entry)
  const sess = asRec(rec?.session)
  const token = direct ?? pickStr(rec, ['token', 'accessToken', 'access_token', 'jwt']) ?? pickStr(sess, ['access_token', 'accessToken', 'token'])
  if (!token) return null
  const staffRaw = asRec(rec?.staff)
  const rawRole = pickStr(staffRaw, ['role']) ?? pickStr(rec, ['role'])
  const staffRole: StaffProfile['role'] = rawRole === 'admin' || rawRole === 'municipal_admin' || rawRole === 'super_admin' ? rawRole : role === 'admin' ? 'admin' : 'teacher'
  return {
    access_token: token,
    refresh_token: pickStr(sess, ['refresh_token', 'refreshToken']) ?? pickStr(rec, ['refresh_token', 'refreshToken']) ?? '',
    expires_at: typeof sess?.expires_at === 'number' ? sess.expires_at : typeof rec?.expires_at === 'number' ? rec.expires_at : Math.floor(Date.now() / 1000) + 3000,
    staff: {
      userId: pickStr(staffRaw, ['userId', 'id']) ?? pickStr(rec, ['userId', 'id', 'teacherId']) ?? '',
      name: pickStr(staffRaw, ['name']) ?? pickStr(rec, ['name']) ?? `zz-ux-${role}`,
      role: staffRole,
      schoolId: pickStr(staffRaw, ['schoolId']) ?? pickStr(rec, ['schoolId']) ?? null,
      email: pickStr(staffRaw, ['email']) ?? pickStr(rec, ['email']) ?? '',
    },
  }
}

/* מחפש בתוצאת ה-fixture את המורה לפי תפקיד, בכל הצורות הסבירות */
export function findRoleSession(raw: unknown, role: RealRole): StaffSession | null {
  const roots: Rec[] = []
  const top = asRec(raw)
  if (!top) return null
  for (const c of CONTAINERS) {
    const r = c === '' ? top : asRec(top[c])
    if (r) roots.push(r)
  }
  for (const r of roots) {
    for (const alias of ROLE_ALIASES[role]) {
      for (const key of [alias, `${alias}Teacher`, `${alias}Token`, `t${cap(alias)}`, `${alias}Session`, `${alias}Auth`]) {
        if (key in r) { const s = toSession(r[key], role); if (s) return s }
      }
    }
  }
  /* צורה שטוחה: homeroomToken בשורש */
  for (const alias of ROLE_ALIASES[role]) {
    const t = pickStr(top, [`${alias}Token`, `${alias}_token`, `${alias}AccessToken`])
    if (t) return toSession(t, role)
  }
  return null
}

/* BFS: הערך המחרוזתי הראשון תחת אחד משמות המפתח (לגילוי מזהים שה-fixture חשף) */
export function deepFindId(raw: unknown, names: string[]): string | undefined {
  const queue: unknown[] = [raw]
  let guard = 0
  while (queue.length && guard++ < 5000) {
    const cur = queue.shift()
    const r = asRec(cur)
    if (r) {
      for (const n of names) { const v = str(r[n]); if (v) return v }
      for (const [k, v] of Object.entries(r)) {
        if (/token|password|secret|session/i.test(k)) continue
        queue.push(v)
      }
    } else if (Array.isArray(cur)) {
      for (const v of cur.slice(0, 50)) queue.push(v)
    }
  }
  return undefined
}

function firstOfArray(raw: unknown, names: string[]): string | undefined {
  const r = asRec(raw)
  if (!r) return undefined
  for (const n of names) {
    const a = r[n]
    if (Array.isArray(a)) { const f = a.find((x) => typeof x === 'string') as string | undefined; if (f) return f }
  }
  return undefined
}

export function idsFromFixture(raw: unknown): Record<string, string | undefined> {
  const top = asRec(raw)
  const subs = asRec(top?.submissions)
  const stu = asRec(top?.students)
  const sid = (k: string): string | undefined => str(asRec(stu?.[k])?.id)
  const firstStudent = sid('avi') ?? sid('beni') ?? deepFindId(raw, ['studentId', 'firstStudentId']) ?? firstOfArray(raw, ['studentIds'])
  return {
    classId: deepFindId(raw, ['homeroomClassId', 'classId']),
    /* "sci" = השליחה המדעית עם נתונים; אחרת הראשונה שנמצאת */
    submissionId: str(subs?.sci) ?? (subs ? Object.values(subs).find((v): v is string => typeof v === 'string') : undefined) ?? deepFindId(raw, ['submissionId', 'assignmentId']),
    studentId: firstStudent,
    resultsStudentId: firstStudent,
    /* "beni" ויתר על אתגרים ← "דורש תשומת לב" */
    resultsAttentionStudentId: sid('beni'),
    subject: asRec(top?.subjectIds)?.science ? 'science' : deepFindId(raw, ['subjectCode']),
  }
}

/* מסיר טוקנים/סיסמאות לפני שכותבים את תוצאת ה-seed לדיסק (ניקוי לא צריך אותם) */
function stripSecrets(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripSecrets)
  const r = asRec(v)
  if (!r) return v
  return Object.fromEntries(Object.entries(r).filter(([k]) => !/token|password|secret|session/i.test(k)).map(([k, x]) => [k, stripSecrets(x)]))
}

/* staff-login מוגבל ל-10 בדקה ל-IP: על 429 ממתינים ומנסים שוב (משמש רק לחידוש טוקן בריצה ארוכה) */
export async function staffLogin(api: string, email: string, password: string): Promise<StaffSession | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetchRetry(`${api}/api/auth/staff-login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }),
    })
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 62_000)); continue }
    if (!res.ok) return null
    const j = (await res.json()) as { session?: { access_token: string; refresh_token: string; expires_at?: number }; staff?: StaffProfile }
    if (!j.session?.access_token || !j.staff) return null
    return { access_token: j.session.access_token, refresh_token: j.session.refresh_token, expires_at: j.session.expires_at, staff: j.staff }
  }
  return null
}

/* ── תהליך-בן ── */
const MARKER = '__E2E_FIXTURE_JSON__'

function tsxCli(): string {
  for (const p of [path.join(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs'), path.join(SERVER_DIR, 'node_modules/tsx/dist/cli.mjs')]) if (existsSync(p)) return p
  throw new Error('tsx לא מותקן (npm install -D tsx בשורש)')
}

function runChild(fixture: FixtureId, mode: 'seed' | 'cleanup', argFile: string | null): Promise<{ result: unknown; log: string }> {
  return new Promise((resolve, reject) => {
    const args = [tsxCli(), path.join(E2E_DIR, 'lib/fixtureChild.ts'), mode, FIXTURE_FILES[fixture]]
    if (argFile) args.push(argFile)
    execFile(process.execPath, args, { cwd: SERVER_DIR, env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS ?? '--use-system-ca' }, maxBuffer: 64 * 1024 * 1024, timeout: 10 * 60_000 }, (err, stdout, stderr) => {
      const lines = String(stdout).split(/\r?\n/)
      const markerLine = lines.find((l) => l.startsWith(MARKER))
      const log = [...lines.filter((l) => !l.startsWith(MARKER)), ...String(stderr).split(/\r?\n/)].filter(Boolean).slice(-12).join('\n')
      if (err || !markerLine) {
        reject(new Error(`${fixture}Fixture ${mode} נכשל${err ? ` (${err.message.split('\n')[0]})` : ''}${log ? `\n${log}` : ''}`))
        return
      }
      try { resolve({ result: JSON.parse(markerLine.slice(MARKER.length)), log }) } catch (e) { reject(e as Error) }
    })
  })
}

export function fixtureExists(id: FixtureId = 'results'): boolean { return existsSync(FIXTURE_FILES[id]) }

/* ── משתנים קבועים מה-fixture של האנליטיקה ── */
function analyticsVars(raw: unknown): Partial<Record<Who, Vars>> {
  const top = asRec(raw)
  const cls = asRec(top?.classes)
  const stu = asRec(top?.students)
  const idOfClass = (k: string): string | undefined => str(asRec(cls?.[k])?.id)
  const idOf = (group: string, k: string): string | undefined => str(asRec(asRec(stu?.[group])?.[k])?.id)
  const ids = asRec(top?.ids)
  const common: Vars = {
    richClassId: idOfClass('rich'), sparseClassId: idOfClass('sparse'), emptyClassId: idOfClass('empty'), otherClassId: idOfClass('other'),
    dualAClassId: idOfClass('dualA'), dualBClassId: idOfClass('dualB'),
    /* crossDip: ירידה בשני מקצועות (התרעה חוצת-מקצועות) · steadyB: בלי ממצאים · e1: כיתה בלי נתונים · o1: בית ספר אחר (404) */
    attentionStudentId: str(ids?.attentionStudentId) ?? idOf('rich', 'crossDip'),
    calmStudentId: str(ids?.calmStudentId) ?? idOf('rich', 'steadyB'),
    emptyStudentId: str(ids?.emptyStudentId) ?? idOf('empty', 'e1'),
    sparseStudentId: idOf('sparse', 's1'), otherStudentId: idOf('other', 'o1'), sharedStudentId: idOf('dual', 'shared'),
    biasStudentId: idOf('rich', 'positionBias'), memoryStudentId: idOf('rich', 'memoryRandom'), trendUpStudentId: idOf('rich', 'trendUp'), skipperStudentId: idOf('rich', 'readingSkipper'),
  }
  const rich = common.richClassId
  const crossDip = common.attentionStudentId
  const mk = (extra: Vars): Vars => ({ ...common, ...extra })
  return {
    'real-v2-homeroom': mk({ classId: rich, studentId: crossDip, subject: 'math' }),
    'real-v2-subject': mk({ classId: rich, studentId: crossDip, subject: 'math' }),
    'real-v2-mixed': mk({ classId: rich, studentId: crossDip, subject: 'hebrew' }),
    'real-v2-cross': mk({ classId: rich, studentId: crossDip, subject: 'history' }),
    'real-v2-unspecified': mk({ classId: rich, studentId: crossDip }),
    'real-v2-empty': mk({ classId: common.emptyClassId, studentId: common.emptyStudentId }),
    'real-v2-no-classes': mk({}),
    'real-v2-dual': mk({ classId: common.dualAClassId, studentId: common.sharedStudentId }),
    'real-v2-admin': mk({}), 'real-v2-municipal': mk({}), 'real-v2-admin-small': mk({}), 'real-v2-admin-empty': mk({}),
  }
}

async function runFixtureCleanup(id: FixtureId, raw: unknown, outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true })
  const argFile = path.join(outDir, `.fixture-${id}-${process.pid}.json`)
  try {
    await writeFile(argFile, JSON.stringify(stripSecrets(raw)))
    await runChild(id, 'cleanup', argFile)
  } finally {
    await rm(argFile, { force: true })
  }
}

/* מזריע fixture אחד (אם הקובץ קיים). זורק עם הודעה ברורה אם חסר/נכשל. */
export async function seedFixture(id: FixtureId, api: string, outDir: string): Promise<FixtureRun> {
  if (!fixtureExists(id)) {
    throw new Error(`הקובץ ${path.relative(REPO_ROOT, FIXTURE_FILES[id])} לא קיים. מסכי ${id === 'results' ? 'real-*' : 'real-v2-*'} ידולגו; הריצו עם --no-real כדי להשתיק.`)
  }
  const { result: raw } = await runChild(id, 'seed', null)
  const sessions: FixtureRun['sessions'] = {}
  const creds: FixtureRun['creds'] = {}
  const issuedAt: FixtureRun['issuedAt'] = {}
  let ids: FixtureRun['ids'] = {}
  let vars: FixtureRun['vars'] = {}

  if (id === 'results') {
    for (const role of REAL_ROLES) {
      let s = findRoleSession(raw, role)
      if (!s) {
        /* אולי הוחזרו email+password */
        for (const alias of ROLE_ALIASES[role]) {
          const r = asRec(asRec(raw)?.[alias]) ?? asRec(asRec(asRec(raw)?.teachers)?.[alias])
          const email = pickStr(r, ['email']); const password = pickStr(r, ['password'])
          if (email && password) { s = await staffLogin(api, email, password); if (s) break }
        }
      }
      /* עקיפה ידנית: E2E_REAL_<ROLE>_TOKEN */
      const envTok = process.env[`E2E_REAL_${role.toUpperCase()}_TOKEN`]
      if (!s && envTok) s = toSession(envTok, role)
      if (s) { sessions[REAL_WHO[role]] = s; issuedAt[REAL_WHO[role]] = Date.now() }
    }
    ids = idsFromFixture(raw)
  } else {
    const top = asRec(raw)
    const teachers = asRec(top?.teachers)
    const schoolOf = { main: str(top?.schoolId), other: str(top?.otherSchoolId), empty: str(top?.emptySchoolId) }
    for (const [who, def] of Object.entries(ANALYTICS_ROLES) as [Who, AnalyticsRole][]) {
      const t = asRec(teachers?.[def.key])
      const token = str(t?.token)
      if (!t || !token) continue
      sessions[who] = {
        access_token: token, refresh_token: '', expires_at: Math.floor(Date.now() / 1000) + 3000,
        staff: { userId: str(t.userId) ?? '', name: str(t.name) ?? `zz-ux-v2-w8-${def.key}`, role: def.role, schoolId: schoolOf[def.school] ?? null, email: str(t.email) ?? '' },
      }
      issuedAt[who] = Date.now()
      const email = str(t.email); const password = str(t.password)
      if (email && password) creds[who] = { email, password }
    }
    vars = analyticsVars(raw)
    ids = { classId: str(asRec(asRec(top?.classes)?.rich)?.id), subject: 'math' }
  }

  let cleaned = false
  const cleanup = async (): Promise<void> => {
    if (cleaned) return
    cleaned = true
    await runFixtureCleanup(id, raw, outDir)
  }
  return { id, sessions, creds, issuedAt, vars, ids, raw, cleanup }
}

/* טוקן טרי לצופה: אם הקיים ישן מ-maxAgeMs ויש סיסמה — מתחברים מחדש (בזיכרון בלבד); אחרת מחזירים את הקיים */
export async function freshSession(run: FixtureRun, who: Who, api: string, maxAgeMs = 35 * 60_000): Promise<StaffSession | null> {
  const cur = run.sessions[who] ?? null
  const cred = run.creds[who]
  const at = run.issuedAt[who] ?? 0
  if (!cur || !cred || Date.now() - at < maxAgeMs) return cur
  const next = await staffLogin(api, cred.email, cred.password)
  if (!next) return cur
  run.sessions[who] = next
  run.issuedAt[who] = Date.now()
  return next
}

/* ניקוי-בלבד (אחרי ריצה שקרסה): קורא cleanup*Fixture() בלי ארגומנט — לכל ה-fixtures הקיימים */
export async function cleanupOnly(): Promise<void> {
  const present = FIXTURE_IDS.filter((id) => fixtureExists(id))
  if (!present.length) throw new Error('אין קבצי fixture — אין מה לנקות')
  for (const id of present) await runChild(id, 'cleanup', null)
}
