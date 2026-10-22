/* ──────────────────────────────────────────────────────────────────────────
   dbMock — Supabase מדומה בזיכרון לבדיקות הטעינה החיה (לא נטען בייצור, ואינו קובץ בדיקה).
   תומך בשרשרת שהקוד החי משתמש בה: select · eq · neq · in · is · not (כולל נתיב json 'payload->>x') · gte · order · range · limit · maybeSingle,
   join מוטמע של class_members→users, עמודות / טבלאות חסרות (קודי סכמה), כשל זמני (בלי קוד סכמה) ותקרת 1000 שורות לקריאה כמו PostgREST.
   ────────────────────────────────────────────────────────────────────────── */
export type Row = Record<string, unknown>

export interface MockDb {
  tables: Record<string, Row[]>
  /* 'table' או 'table.column' → שגיאת סכמה חסרה (42P01 / 42703) */
  missing: Set<string>
  /* 'table' או 'table.column' → כשל זמני (בלי קוד סכמה) */
  fail: Set<string>
  /* יומן קריאות: טבלה + אורך מסנני IN + האם הייתה כתיבה */
  calls: { table: string; cols: string; inLens: Record<string, number>; filters: string[] }[]
  client: { from: (t: string) => unknown }
  reset(): void
}

function pathGet(row: Row, key: string): unknown {
  if (!key.includes('->')) return row[key]
  const [col, path] = key.split(/->>?/)
  const obj = row[col] as Row | null | undefined
  return obj ? obj[path] : undefined
}

export function createMockDb(): MockDb {
  const db: MockDb = {
    tables: {}, missing: new Set(), fail: new Set(), calls: [],
    client: { from: (t: string) => new Query(db, t) },
    reset() { this.tables = {}; this.missing.clear(); this.fail.clear(); this.calls.length = 0 },
  }
  return db
}

class Query {
  private filters: { desc: string; fn: (r: Row) => boolean }[] = []
  private orders: { col: string; asc: boolean }[] = []
  private lim: number | null = null
  private rng: [number, number] | null = null
  private single = false
  private cols = '*'
  private inLens: Record<string, number> = {}
  constructor(private db: MockDb, private t: string) {}
  select(c = '*') { this.cols = c; return this }
  eq(k: string, v: unknown) { this.filters.push({ desc: `eq:${k}`, fn: (r) => pathGet(r, k) === v }); return this }
  neq(k: string, v: unknown) { this.filters.push({ desc: `neq:${k}`, fn: (r) => pathGet(r, k) !== v }); return this }
  in(k: string, a: unknown[]) { this.inLens[k] = a.length; this.filters.push({ desc: `in:${k}`, fn: (r) => a.includes(pathGet(r, k)) }); return this }
  is(k: string, v: unknown) { this.filters.push({ desc: `is:${k}`, fn: (r) => (pathGet(r, k) ?? null) === v }); return this }
  not(k: string, op: string, v: unknown) {
    if (op === 'is') this.filters.push({ desc: `not-is:${k}`, fn: (r) => (pathGet(r, k) ?? null) !== v })
    else this.filters.push({ desc: `not:${k}`, fn: (r) => pathGet(r, k) !== v })
    return this
  }
  gte(k: string, v: unknown) { this.filters.push({ desc: `gte:${k}`, fn: (r) => { const x = pathGet(r, k) as string | number | null | undefined; return x != null && x >= (v as string | number) } }); return this }
  order(col: string, o?: { ascending?: boolean }) { this.orders.push({ col, asc: o?.ascending !== false }); return this }
  limit(n: number) { this.lim = n; return this }
  range(a: number, b: number) { this.rng = [a, b]; return this }
  maybeSingle() { this.single = true; return this }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  then(ok?: any, bad?: any) {
    const res = this.run()
    return Promise.resolve(res).then(ok, bad)
  }

  private run(): { data: unknown; error: { message: string; code?: string } | null } {
    const { db, t } = this
    db.calls.push({ table: t, cols: this.cols, inLens: this.inLens, filters: this.filters.map((f) => f.desc) })
    const colsList = this.cols === '*' ? [] : this.cols.replace(/users\([^)]*\)/g, '').split(',').map((c) => c.trim().split('->')[0]).filter(Boolean)
    if (db.fail.has(t) || colsList.some((c) => db.fail.has(`${t}.${c}`))) return { data: null, error: { message: 'connection reset' } }
    if (db.missing.has(t)) return { data: null, error: { message: `relation "${t}" does not exist`, code: '42P01' } }
    for (const c of colsList) if (db.missing.has(`${t}.${c}`)) return { data: null, error: { message: `column ${t}.${c} does not exist`, code: '42703' } }
    const tbl = db.tables[t]
    if (!tbl) return { data: null, error: { message: `relation "${t}" does not exist`, code: '42P01' } }
    let rows = tbl.filter((r) => this.filters.every((f) => f.fn(r)))
    for (const { col, asc } of [...this.orders].reverse()) {
      rows = [...rows].sort((a, b) => {
        const x = pathGet(a, col) as string | number | null | undefined, y = pathGet(b, col) as string | number | null | undefined
        if (x == null && y == null) return 0
        if (x == null) return 1
        if (y == null) return -1
        return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1)
      })
    }
    if (this.rng) rows = rows.slice(this.rng[0], this.rng[1] + 1)
    rows = rows.slice(0, this.lim ?? 1000) /* תקרת PostgREST */
    if (t === 'class_members' && /users\(/.test(this.cols)) {
      rows = rows.map((r) => ({ class_id: r.class_id, users: (db.tables.users ?? []).find((u) => u.id === r.user_id) ?? null }))
    }
    return { data: this.single ? (rows[0] ?? null) : rows, error: null }
  }
}
