import { describe, expect, it } from 'vitest'
import type { SubmissionRow } from '../../../../src/shared/types/resultsV1.js'
import { activeFirst, buildWeekStrip, selectLessons, type LessonDesc } from './listView.js'

const NOW = Date.parse('2026-10-28T10:00:00Z') /* רביעי; השבוע התחיל ב-25.10 */
const DAY = 86_400_000
const SCI = { code: 'science', nameHe: 'מדעים' } as const
const MATH = { code: 'math', nameHe: 'מתמטיקה' } as const
const desc = (id: string, o: Partial<LessonDesc> = {}): LessonDesc => ({
  id, classId: 'c1', className: 'ו׳2', title: id, subject: SCI, sentAtMs: NOW - DAY, inMine: true, ...o,
})
const run = (items: LessonDesc[], query = {}, homeroom: string[] = []) =>
  selectLessons(items, (x) => x, { query, nowMs: NOW, homeroomClassIds: new Set(homeroom), limit: 3, olderLimit: 10 })

describe('selectLessons', () => {
  it('"שלי" מול "כיתה": רק מחנך/ת מקבל/ת בורר, וביקשו "class" בלי כיתת-חינוך — נשאר "mine"', () => {
    const items = [desc('a'), desc('b', { inMine: false }), desc('c', { classId: 'c9' })]
    expect(run(items, { view: 'class' }).view).toBe('mine')
    expect(run(items, { view: 'class' }).canToggleView).toBe(false)
    expect(run(items, { view: 'class' }).shown.map((x) => x.id)).toEqual(['a', 'c'])
    const hr = run(items, { view: 'class' }, ['c1'])
    expect(hr.canToggleView).toBe(true)
    expect(hr.view).toBe('class')
    expect(hr.shown.map((x) => x.id).sort()).toEqual(['a', 'b'])
    expect(run(items, {}, ['c1']).shown.map((x) => x.id).sort()).toEqual(['a', 'c'])
  })

  it('חלון זמן: ישן מ-30 יום מחכה; older מציג הכול; olderCount סופר רק התאמות', () => {
    const items = [desc('new'), desc('mid', { sentAtMs: NOW - 29 * DAY }), desc('old', { sentAtMs: NOW - 31 * DAY }), desc('older-math', { sentAtMs: NOW - 90 * DAY, subject: MATH })]
    expect(run(items).shown.map((x) => x.id)).toEqual(['new', 'mid'])
    expect(run(items).olderCount).toBe(2)
    expect(run(items, { older: true }).shown.map((x) => x.id)).toEqual(['new', 'mid', 'old', 'older-math'])
    expect(run(items, { subject: 'math' }).olderCount).toBe(1)
  })

  it('תקרה: overLimit כשיש יותר ממה שמוצג', () => {
    const items = ['a', 'b', 'c', 'd'].map((id, i) => desc(id, { sentAtMs: NOW - (i + 1) * DAY }))
    const r = run(items)
    expect(r.shown.map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(r.overLimit).toBe(true)
  })

  it('אפשרויות הסינון מהמאגר של המצב, לפני הסינון; מקצוע לפי סדר המקצועות הקבוע', () => {
    const items = [desc('a', { subject: SCI }), desc('b', { subject: MATH, classId: 'c2', className: 'ו׳1' })]
    const r = run(items, { subject: 'science' })
    expect(r.classOptions.map((c) => c.name)).toEqual(['ו׳1', 'ו׳2'])
    expect(r.subjectOptions.map((s) => s.code)).toEqual(['math', 'science'])
  })

  it('חיפוש חופשי בשם, בכיתה ובמקצוע', () => {
    const items = [desc('מסע המים'), desc('שברים', { subject: MATH })]
    expect(run(items, { q: 'מדעים' }).shown.map((x) => x.id)).toEqual(['מסע המים'])
    expect(run(items, { q: 'שבר' }).shown.map((x) => x.id)).toEqual(['שברים'])
    expect(run(items, { q: 'ו׳2' }).shown).toHaveLength(2)
  })

  it('שיעורי השבוע לפס: רק במצב class, מתחילת השבוע הישראלי, ללא תלות בסינון', () => {
    const items = [desc('this1', { sentAtMs: Date.parse('2026-10-25T05:00:00Z') }), desc('last', { sentAtMs: Date.parse('2026-10-24T18:00:00Z') }), desc('this2', { sentAtMs: NOW - 3_600_000, subject: MATH })]
    expect(run(items, { view: 'class', subject: 'math' }, ['c1']).weekPool.map((x) => x.id)).toEqual(['this2', 'this1'])
    expect(run(items, {}, ['c1']).weekPool).toEqual([])
  })
})

describe('activeFirst / buildWeekStrip', () => {
  const row = (id: string, state: SubmissionRow['state'], subject: typeof SCI | typeof MATH | null = SCI): SubmissionRow => ({ id, state, subject } as SubmissionRow)
  it('פעיל עכשיו קודם, השאר בסדר שהתקבל', () => {
    const out = activeFirst([{ row: row('a', 'open') }, { row: row('b', 'active_now') }, { row: row('c', 'ended') }, { row: row('d', 'active_now') }])
    expect(out.map((x) => x.row.id)).toEqual(['b', 'd', 'a', 'c'])
  })

  it('פס שבועי: מונה שיעורים ומקצועות (לא כולל "לא סווג"), ומי שלתשומת לב ביותר ממקצוע אחד', () => {
    const p = (id: string, name: string) => ({ id, name })
    const strip = buildWeekStrip([
      { row: row('l1', 'open', SCI), attention: [p('s1', 'תמר'), p('s2', 'נועם')] },
      { row: row('l2', 'open', MATH), attention: [p('s1', 'תמר')] },
      { row: row('l3', 'open', null), attention: [p('s2', 'נועם')] },
      { row: row('l4', 'open', SCI), attention: [p('s1', 'תמר')] },
    ])
    expect(strip.lessons).toBe(4)
    expect(strip.subjects).toBe(2)
    expect(strip.flagged).toEqual([{ id: 's1', name: 'תמר', subjects: ['מתמטיקה', 'מדעים'] }])
    expect(strip.flaggedLine).toBe('לתשומת לב ביותר ממקצוע אחד השבוע: תמר (מתמטיקה, מדעים)')
    expect(buildWeekStrip([]).flaggedLine).toBeNull()
  })
})
