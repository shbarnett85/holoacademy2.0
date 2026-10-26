import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
const h = vi.hoisted(() => {
  const db: Record<string, Row[]> = { misconceptions: [], misconception_content_links: [] }
  const flags = { links: true, mis: true, insertError: false }
  class Q {
    private f: ((r: Row) => boolean)[] = []
    private ins: Row | null = null
    private one = false
    constructor(private t: string) {}
    select() { return this }
    insert(p: Row) { this.ins = p; return this }
    eq(k: string, v: unknown) { this.f.push((r) => r[k] === v); return this }
    maybeSingle() { this.one = true; return this }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    then(ok?: any, bad?: any) {
      if (this.ins) {
        if (flags.insertError) return Promise.resolve({ data: null, error: { message: 'x' } }).then(ok, bad)
        db[this.t].push(this.ins)
        return Promise.resolve({ data: null, error: null }).then(ok, bad)
      }
      const rows = db[this.t].filter((r) => this.f.every((fn) => fn(r)))
      return Promise.resolve({ data: this.one ? (rows[0] ?? null) : rows, error: null }).then(ok, bad)
    }
  }
  return { db, flags, client: { from: (t: string) => new Q(t) } }
})
vi.mock('./supabase.js', () => ({ supabaseAdmin: h.client }))
vi.mock('./activeColumn.js', () => ({ hasMisconceptions: async () => h.flags.mis, hasMisconceptionLinks: async () => h.flags.links }))

import { linkFocusedLesson } from './focusedLink.js'

const uid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const M = uid(1), Q = uid(2), T = uid(3)

beforeEach(() => {
  h.db.misconceptions = [{ id: M, status: 'approved' }, { id: uid(9), status: 'draft' }]
  h.db.misconception_content_links = []
  Object.assign(h.flags, { links: true, mis: true, insertError: false })
})

describe('linkFocusedLesson', () => {
  it('תפיסה מאושרת: נרשם קישור (עם המורה שיצר/ה)', async () => {
    expect(await linkFocusedLesson(M, Q, T)).toBe('linked')
    expect(h.db.misconception_content_links).toEqual([{ misconception_id: M, quest_id: Q, created_by: T }])
  })
  it('כפילות: לא נרשם שוב', async () => {
    await linkFocusedLesson(M, Q, T)
    expect(await linkFocusedLesson(M, Q, T)).toBe('exists')
    expect(h.db.misconception_content_links).toHaveLength(1)
  })
  it('תפיסה שאינה קיימת או שאינה מאושרת, מזהה פגום, טבלה חסרה, כשל כתיבה — מדלגים בשקט (לא זורקים)', async () => {
    expect(await linkFocusedLesson(uid(5), Q, T)).toBe('skipped')
    expect(await linkFocusedLesson(uid(9), Q, T)).toBe('skipped')
    expect(await linkFocusedLesson('not-a-uuid', Q, T)).toBe('skipped')
    h.flags.links = false
    expect(await linkFocusedLesson(M, Q, T)).toBe('skipped')
    h.flags.links = true
    h.flags.insertError = true
    expect(await linkFocusedLesson(M, Q, T)).toBe('skipped')
    expect(h.db.misconception_content_links).toEqual([])
  })
})
