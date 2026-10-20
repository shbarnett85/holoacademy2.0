/* ──────────────────────────────────────────────────────────────────────────
   כניסה: (א) מורה אורח; (ב) מורים אמיתיים מה-fixture של שלב התוצאות
   (server/src/scripts/resultsFixture.ts — נכתב ע"י סוכן אחר; כאן נצרך בהגנה).
   · ה-session נכתב ל-localStorage['holo_staff_session'] (init script ב-browser.ts) באותו פורמט כמו
     src/shared/lib/staffSession.ts: { access_token, refresh_token, expires_at, staff }.
   · ה-fixture רץ בתהליך-בן (cwd=server, כדי שה-.env ו-node_modules של השרת יטענו נכון) ומחזיר JSON.
     אסור להדפיס טוקנים; שורת התוצאה (שמכילה טוקנים) לא מועברת ל-stdout.
   ────────────────────────────────────────────────────────────────────────── */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { E2E_DIR, REPO_ROOT, SERVER_DIR } from './config.ts'
import type { Who } from './types.ts'

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

/* ── (ב) מורים אמיתיים מה-fixture ── */
export type RealRole = 'homeroom' | 'subject' | 'unlinked' | 'admin'
export const REAL_WHO: Record<RealRole, Who> = { homeroom: 'real-homeroom', subject: 'real-subject', unlinked: 'real-unlinked', admin: 'real-admin' }
export const REAL_ROLES = Object.keys(REAL_WHO) as RealRole[]

export interface RealFixture {
  sessions: Partial<Record<RealRole, StaffSession>>
  /* מזהים שהמבנה שה-fixture החזיר חשף (לשימוש גילוי כגיבוי) */
  ids: Record<string, string | undefined>
  /* התוצאה הגולמית — לא להדפיס (מכילה טוקנים) */
  raw: unknown
  cleanup: () => Promise<void>
}

/* כינויים שבהם ה-fixture עשוי לקרוא למורים (A1 עוד לא סיים — לכן סלחני) */
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

async function staffLogin(api: string, email: string, password: string): Promise<StaffSession | null> {
  const res = await fetchRetry(`${api}/api/auth/staff-login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }),
  })
  if (!res.ok) return null
  const j = (await res.json()) as { session?: { access_token: string; refresh_token: string; expires_at?: number }; staff?: StaffProfile }
  if (!j.session?.access_token || !j.staff) return null
  return { access_token: j.session.access_token, refresh_token: j.session.refresh_token, expires_at: j.session.expires_at, staff: j.staff }
}

/* ── תהליך-בן ── */
const MARKER = '__E2E_FIXTURE_JSON__'

function tsxCli(): string {
  for (const p of [path.join(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs'), path.join(SERVER_DIR, 'node_modules/tsx/dist/cli.mjs')]) if (existsSync(p)) return p
  throw new Error('tsx לא מותקן (npm install -D tsx בשורש)')
}

export const FIXTURE_FILE = path.join(SERVER_DIR, 'src/scripts/resultsFixture.ts')

function runChild(mode: 'seed' | 'cleanup', argFile: string | null): Promise<{ result: unknown; log: string }> {
  return new Promise((resolve, reject) => {
    const args = [tsxCli(), path.join(E2E_DIR, 'lib/fixtureChild.ts'), mode, FIXTURE_FILE]
    if (argFile) args.push(argFile)
    execFile(process.execPath, args, { cwd: SERVER_DIR, env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS ?? '--use-system-ca' }, maxBuffer: 64 * 1024 * 1024, timeout: 10 * 60_000 }, (err, stdout, stderr) => {
      const lines = String(stdout).split(/\r?\n/)
      const markerLine = lines.find((l) => l.startsWith(MARKER))
      const log = [...lines.filter((l) => !l.startsWith(MARKER)), ...String(stderr).split(/\r?\n/)].filter(Boolean).slice(-12).join('\n')
      if (err || !markerLine) {
        reject(new Error(`resultsFixture ${mode} נכשל${err ? ` (${err.message.split('\n')[0]})` : ''}${log ? `\n${log}` : ''}`))
        return
      }
      try { resolve({ result: JSON.parse(markerLine.slice(MARKER.length)), log }) } catch (e) { reject(e as Error) }
    })
  })
}

export function fixtureExists(): boolean { return existsSync(FIXTURE_FILE) }

/* מזריע fixture (אם הקובץ קיים), בונה sessions לשלושת התפקידים. זורק עם הודעה ברורה אם חסר/נכשל. */
export async function seedRealFixture(api: string, outDir: string): Promise<RealFixture> {
  if (!fixtureExists()) {
    throw new Error(`הקובץ ${path.relative(REPO_ROOT, FIXTURE_FILE)} עוד לא קיים (נכתב ע"י סוכן A1). מסכי real-* ידולגו; הריצו עם --no-real כדי להשתיק.`)
  }
  const { result: raw } = await runChild('seed', null)
  const sessions: RealFixture['sessions'] = {}
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
    if (s) sessions[role] = s
  }
  const ids = idsFromFixture(raw)
  let cleaned = false
  const cleanup = async (): Promise<void> => {
    if (cleaned) return
    cleaned = true
    await mkdir(outDir, { recursive: true })
    const argFile = path.join(outDir, `.fixture-${process.pid}.json`)
    try {
      await writeFile(argFile, JSON.stringify(stripSecrets(raw)))
      await runChild('cleanup', argFile)
    } finally {
      await rm(argFile, { force: true })
    }
  }
  return { sessions, ids, raw, cleanup }
}

/* ניקוי-בלבד (אחרי ריצה שקרסה): קורא cleanupResultsFixture() בלי ארגומנט */
export async function cleanupOnly(): Promise<void> {
  if (!fixtureExists()) throw new Error('resultsFixture.ts לא קיים — אין מה לנקות')
  await runChild('cleanup', null)
}
