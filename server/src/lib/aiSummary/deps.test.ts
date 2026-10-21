import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* יחידות של החיבור לספקים: קריאת מגדר עמידה, וקהל הסיכום של תלמיד/ה. (ההרשאה בפועל — בבדיקות ה-HTTP: routes/aiSummary.http.test.ts) */
const h = vi.hoisted(() => ({
  hasGender: true,
  row: null as { gender?: unknown } | null,
  error: null as { message: string } | null,
  throws: false,
  queries: [] as string[],
}))

vi.mock('../supabase.js', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      h.queries.push(table)
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => {
          if (h.throws) throw new Error('boom')
          return { data: h.row, error: h.error }
        },
      }
      return q
    },
  },
  supabaseAnon: {},
}))
vi.mock('../activeColumn.js', async (orig) => ({ ...(await orig<typeof import('../activeColumn.js')>()), hasUserGender: async () => h.hasGender }))

import { grant, live } from '../analyticsV2/providerTestkit.js'
import { audienceOfStudent, readStudentGender } from './deps.js'

beforeEach(() => { h.hasGender = true; h.row = null; h.error = null; h.throws = false; h.queries.length = 0 })

describe('readStudentGender: רק male / female, וכל כשל = null (ניסוח ניטרלי)', () => {
  it('העמודה חסרה (פרודקשן לפני המיגרציה): null, ובלי שאילתה', async () => {
    h.hasGender = false
    expect(await readStudentGender('s1')).toBeNull()
    expect(h.queries).toEqual([])
  })

  it.each([['male', 'male'], ['female', 'female'], ['other', null], ['', null], [null, null], [undefined, null], [1, null]] as const)('ערך %j → %j', async (value, expected) => {
    h.row = { gender: value }
    expect(await readStudentGender('s1')).toBe(expected)
    expect(h.queries).toEqual(['users'])
  })

  it('אין שורה / שגיאת DB / חריגה: null (לא זורק — מגדר הוא דקדוק בלבד)', async () => {
    h.row = null
    expect(await readStudentGender('s1')).toBeNull()
    h.row = { gender: 'male' }
    h.error = { message: 'db down' }
    expect(await readStudentGender('s1')).toBeNull()
    h.error = null
    h.throws = true
    expect(await readStudentGender('s1')).toBeNull()
  })
})

describe('audienceOfStudent: הקהל נגזר מההרשאה, לא מהנתונים', () => {
  const student = { id: 's1', displayName: 'x', classId: 'c1', className: 'c', grade: 6, gradeLabel: 'ו׳' }
  it('מחנך (access=full) → full', () => {
    expect(audienceOfStudent(live([grant('c1', { homeroom: true })]), { access: 'full', student })).toBe('full')
  })
  it('מורה מקצועי → המקצועות שלו בכיתת התלמיד/ה בלבד, ממוינים; לא מקצועות בכיתה אחרת', () => {
    const v = live([grant('c1', { subjects: ['math', 'history'] }), grant('c2', { subjects: ['science'] })])
    expect(audienceOfStudent(v, { access: 'subject_only', student })).toBe('subj:history,math')
  })
  it('בלי grant בכיתת התלמיד/ה (או שיוך בלי מקצוע): קהל ריק — לעולם לא full', () => {
    expect(audienceOfStudent(live([grant('c9', { homeroom: true })]), { access: 'subject_only', student })).toBe('subj:')
    expect(audienceOfStudent(live([grant('c1', { unspecified: true })]), { access: 'subject_only', student })).toBe('subj:')
  })
})

describe('חיווט בשרת', () => {
  it('index.ts מרכיב את /api/ai-summary עם ה-deps האמיתיות ועם בחירת הספק של /api/analytics-v2 (לא "לא מחובר" ולא ספק משלו)', () => {
    const src = readFileSync(fileURLToPath(new URL('../../index.ts', import.meta.url)), 'utf8')
    expect(src).toMatch(/app\.use\('\/api\/ai-summary', registerAiSummaryRoutes\(createAiSummaryDeps\(\{ providerFor: analyticsV2ProviderFor \}\)\)\)/)
    expect(src).toMatch(/providerFor as analyticsV2ProviderFor \} from '\.\/routes\/analyticsV2\.js'/)
    expect(src).not.toMatch(/registerAiSummaryRoutes\(\)/)
  })
})
