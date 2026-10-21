/* Supabase מדומה בזיכרון — רק מה שנתיבי ההרשמה/האישור/ההרשאות צריכים (select/insert/update/delete +
   eq/is/in/limit + single/maybeSingle, ו-auth.admin / signInWithPassword / getUser). לשימוש בבדיקות בלבד:
   מאפשר לבדוק את הנתיבים האמיתיים (express) בלי רשת ובלי לגעת ב-DB המשותף. */
import { randomUUID } from 'node:crypto'

type Row = Record<string, unknown>
type Result = { data: unknown; error: { message: string; code?: string } | null }

export interface FakeAuthUser { id: string; email: string; password: string; confirmed: boolean }

export interface FakeDb {
  tables: Record<string, Row[]>
  authUsers: Map<string, FakeAuthUser>
  /* עמודות שכאילו חסרות (מיגרציה לא הורצה): 'users.approval_status' */
  missingColumns: Set<string>
}

class Query implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private filters: ((r: Row) => boolean)[] = []
  private payload: Row | undefined
  private cols = '*'
  private returning = false
  private max = Infinity
  private mode: 'many' | 'single' | 'maybe' = 'many'

  constructor(private db: FakeDb, private table: string) {}

  select(cols = '*'): this {
    if (this.op === 'select') this.cols = cols
    else this.returning = true
    return this
  }
  insert(row: Row): this { this.op = 'insert'; this.payload = row; return this }
  update(patch: Row): this { this.op = 'update'; this.payload = patch; return this }
  delete(): this { this.op = 'delete'; return this }
  eq(col: string, val: unknown): this { this.filters.push((r) => r[col] === val); return this }
  is(col: string, val: null): this { this.filters.push((r) => (r[col] ?? null) === val); return this }
  in(col: string, vals: unknown[]): this { this.filters.push((r) => vals.includes(r[col])); return this }
  limit(n: number): this { this.max = n; return this }
  order(): this { return this }
  single(): this { this.mode = 'single'; return this }
  maybeSingle(): this { this.mode = 'maybe'; return this }

  private missing(cols: string[]): string | null {
    for (const c of cols) if (this.db.missingColumns.has(`${this.table}.${c}`)) return c
    return null
  }

  private run(): Result {
    const rows = (this.db.tables[this.table] ??= [])
    const fail = (message: string): Result => ({ data: null, error: { message } })
    let out: Row[]
    if (this.op === 'insert') {
      const bad = this.missing(Object.keys(this.payload!))
      if (bad) return fail(`column ${this.table}.${bad} does not exist`)
      const row: Row = { id: randomUUID(), created_at: new Date().toISOString(), ...(this.table === 'users' && !this.db.missingColumns.has('users.is_active') ? { is_active: true } : {}), ...this.payload }
      rows.push(row)
      out = [row]
    } else if (this.op === 'update') {
      const bad = this.missing(Object.keys(this.payload!))
      if (bad) return fail(`column ${this.table}.${bad} does not exist`)
      out = rows.filter((r) => this.filters.every((f) => f(r)))
      for (const r of out) Object.assign(r, this.payload)
    } else if (this.op === 'delete') {
      out = rows.filter((r) => this.filters.every((f) => f(r)))
      this.db.tables[this.table] = rows.filter((r) => !out.includes(r))
    } else {
      const names = this.cols.split(',').map((c) => c.trim()).filter((c) => c && c !== '*')
      const bad = this.missing(names)
      if (bad) return fail(`column ${this.table}.${bad} does not exist`)
      out = rows.filter((r) => this.filters.every((f) => f(r))).slice(0, this.max)
      if (names.length) out = out.map((r) => Object.fromEntries(names.map((n) => [n, r[n]])))
    }
    if ((this.op === 'insert' || this.op === 'update' || this.op === 'delete') && !this.returning) return { data: null, error: null }
    if (this.mode === 'single') return out.length === 1 ? { data: out[0], error: null } : fail('expected a single row')
    if (this.mode === 'maybe') return out.length > 1 ? fail('multiple rows') : { data: out[0] ?? null, error: null }
    return { data: out, error: null }
  }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, no?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.run()).then(ok, no)
  }
}

export function createFakeSupabase() {
  const db: FakeDb = { tables: { users: [], schools: [], quests: [], class_teachers: [] }, authUsers: new Map(), missingColumns: new Set() }
  const byEmail = (email: string) => [...db.authUsers.values()].find((u) => u.email.toLowerCase() === email.toLowerCase())
  const userShape = (u: FakeAuthUser) => ({ id: u.id, email: u.email, email_confirmed_at: u.confirmed ? new Date().toISOString() : null })

  const supabaseAdmin = {
    from: (table: string) => new Query(db, table),
    auth: {
      getUser: async (token: string) => {
        const u = db.authUsers.get(token.replace(/^tok:/, ''))
        return u ? { data: { user: userShape(u) }, error: null } : { data: { user: null }, error: { message: 'invalid token' } }
      },
      admin: {
        createUser: async (args: { email: string; password: string; email_confirm?: boolean }) => {
          if (byEmail(args.email)) return { data: { user: null }, error: { message: 'A user with this email address has already been registered', code: 'email_exists' } }
          const u: FakeAuthUser = { id: randomUUID(), email: args.email, password: args.password, confirmed: args.email_confirm === true }
          db.authUsers.set(u.id, u)
          return { data: { user: userShape(u) }, error: null }
        },
        deleteUser: async (id: string) => { db.authUsers.delete(id); return { data: null, error: null } },
        getUserById: async (id: string) => {
          const u = db.authUsers.get(id)
          return u ? { data: { user: userShape(u) }, error: null } : { data: { user: null }, error: { message: 'not found' } }
        },
      },
    },
  }

  const supabaseAnon = {
    auth: {
      signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
        const u = byEmail(email)
        if (!u || u.password !== password) return { data: { session: null, user: null }, error: { message: 'Invalid login credentials', code: 'invalid_credentials', status: 400 } }
        if (!u.confirmed) return { data: { session: null, user: null }, error: { message: 'Email not confirmed', code: 'email_not_confirmed', status: 400 } }
        return { data: { session: { access_token: 'tok:' + u.id, refresh_token: 'r', expires_at: 0 }, user: { id: u.id, email: u.email } }, error: null }
      },
    },
  }

  return { db, supabaseAdmin, supabaseAnon }
}

/* עוזרי זריעה לבדיקות */
export function seedSchool(db: FakeDb, name: string, extra: Row = {}): string {
  const id = randomUUID()
  db.tables.schools.push({ id, name, slug: name, ...extra })
  return id
}

export function seedStaff(db: FakeDb, opts: { role: string; schoolId: string | null; name?: string; email?: string; confirmed?: boolean; extra?: Row }): { userId: string; authId: string; token: string; email: string } {
  const authId = randomUUID()
  const email = opts.email ?? `${opts.role}-${authId.slice(0, 6)}@test.local`
  db.authUsers.set(authId, { id: authId, email, password: 'pw-' + authId.slice(0, 8), confirmed: opts.confirmed ?? true })
  const userId = randomUUID()
  db.tables.users.push({ id: userId, name: opts.name ?? opts.role, role: opts.role, school_id: opts.schoolId, auth_id: authId, is_active: true, ...opts.extra })
  return { userId, authId, token: 'tok:' + authId, email }
}
