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

import type { SubjectCode } from '../../../../src/shared/lib/subjects.js'
import { analyze } from '../analyticsV2/engine.js'
import { createProvider } from '../analyticsV2/providerCore.js'
import { CA, CB, ceiling, decliner, fakeSource, grant, ids, live, world, type Stu } from '../analyticsV2/providerTestkit.js'
import { audienceOfStudent, readStudentGender } from './deps.js'

beforeEach(() => { h.hasGender = true; h.row = null; h.error = null; h.throws = false; h.queries.length = 0 })

describe('readStudentGender: deprecated — מגדר התלמיד לא נקרא יותר (לשון רבים אחידה), תמיד null (ניסוח ניטרלי)', () => {
  it('תמיד null, בלי שאילתה — גם כשהעמודה קיימת ויש בה ערך', async () => {
    h.hasGender = true
    h.row = { gender: 'male' }
    expect(await readStudentGender('s1')).toBeNull()
    h.row = { gender: 'female' }
    expect(await readStudentGender('s1')).toBeNull()
    expect(h.queries).toEqual([])
  })
})

describe('audienceOfStudent: הקהל נגזר מהמקצועות הגלויים בפועל (איחוד ההרשאות על כל כיתות התלמיד/ה)', () => {
  const panel = (code: string, access: 'visible' | 'greyed') => ({ access, subject: { code, nameHe: code } })
  const o = (access: 'full' | 'subject_only', ...panels: ReturnType<typeof panel>[]) => ({ access, panels }) as unknown as Parameters<typeof audienceOfStudent>[1]
  it('מחנך (access=full) → full', () => {
    expect(audienceOfStudent(live([grant('c1', { homeroom: true })]), o('full'))).toBe('full')
  })
  it('מורה מקצועי → המקצועות הגלויים בלבד, ממוינים וייחודיים; מקצוע אפור לא נכנס', () => {
    expect(audienceOfStudent(live([]), o('subject_only', panel('math', 'visible'), panel('history', 'visible'), panel('science', 'greyed')))).toBe('subj:history,math')
  })
  it('אין מקצוע גלוי: קהל ריק — לעולם לא full', () => {
    expect(audienceOfStudent(live([]), o('subject_only'))).toBe('subj:')
    expect(audienceOfStudent(live([]), o('subject_only', panel('math', 'greyed')))).toBe('subj:')
  })

  /* R1#2 / R4#7: תלמיד בשתי כיתות. מורה עם היסטוריה בא׳ ומתמטיקה בב׳ רואה את שני המקצועות — והמפתח חייב לכלול את שניהם, אחרת הסיכום
     נשמר תחת 'subj:history' וממשיך להיות מוצג (עם תוכן מתמטיקה) אחרי שההרשאה במתמטיקה בוטלה */
  describe('תלמיד/ה בשתי כיתות (הקוד האמיתי של הספק)', () => {
    const decl = (sub: SubjectCode) => (sub === 'math' ? decliner() : ceiling())
    const students: Stu[] = [
      ...ids('a', 3).map((id) => ({ id: `${id}-only`, classId: CA.id })),
      ...ids('b', 3).map((id) => ({ id: `${id}-only`, classId: CB.id })),
      { id: 'shared', classId: CA.id, sessions: decl },
    ]
    const w = world([CA, CB], students)
    w.classes = w.classes.map((c) => ({ ...c, studentIds: [...new Set([...c.studentIds, 'shared'])] }))
    const P = createProvider(fakeSource(analyze(w)))
    const keyFor = async (v: ReturnType<typeof live>): Promise<string> => audienceOfStudent(v, (await P.student(v, 'shared')).data)

    it('היסטוריה@א׳ + מתמטיקה@ב׳ → שני המקצועות; הסרת מתמטיקה@ב׳ מחליפה מפתח (הסיכום הישן לא מוצג)', async () => {
      const both = live([grant(CA.id, { subjects: ['history'] }), grant(CB.id, { subjects: ['math'] })])
      const onlyHistory = live([grant(CA.id, { subjects: ['history'] })])
      expect(await keyFor(both)).toBe('subj:history,math')
      expect(await keyFor(onlyHistory)).toBe('subj:history')
      expect(await keyFor(both)).not.toBe(await keyFor(onlyHistory))
    })
    it('מחנך באחת (full) לא תלוי בהרשאות המקצוע', async () => {
      expect(await keyFor(live([grant(CA.id, { homeroom: true }), grant(CB.id, { subjects: ['math'] })]))).toBe('full')
    })
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
