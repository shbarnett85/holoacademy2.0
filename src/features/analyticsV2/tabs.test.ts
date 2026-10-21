import { describe, expect, it } from 'vitest'
import type { SubjectRef } from '../../shared/types/analyticsV2'
import { bySubjectOrder, bySubjectOrderOf } from '../teacherUi'
import { LOCKED_OVERVIEW_TEXT } from './labels'
import { classSubjectAccess, overviewTabItem, resolveClassTab } from './tabs'

describe('overviewTabItem — "סקירה" קיימת אצל כולם', () => {
  it('מחנך/ת: טאב רגיל פעיל', () => {
    const t = overviewTabItem(true)
    expect(t.label).toBe('סקירה')
    expect(t.locked).toBeUndefined()
    expect(t.lockedReason).toBeUndefined()
  })
  it('מורה מקצועי: אותו טאב, חסום, עם הסיבה גלויה (מנעול + "זמין למחנך/ת הכיתה")', () => {
    const t = overviewTabItem(false)
    expect(t.id).toBe(overviewTabItem(true).id)
    expect(t.label).toBe(overviewTabItem(true).label)
    expect(t.locked).toBe(true)
    expect(t.lockedReason).toBe(LOCKED_OVERVIEW_TEXT)
    expect(LOCKED_OVERVIEW_TEXT).toBe('זמין למחנך/ת הכיתה')
  })
})

describe('סדר מקצועות אחיד (shared/lib/subjects)', () => {
  const unordered = [{ code: 'science' }, { code: 'hebrew' }, { code: 'math' }, { code: 'history' }, { code: 'english' }]
  const expected = ['hebrew', 'history', 'math', 'english', 'science']
  it('bySubjectOrder', () => {
    expect(bySubjectOrder(unordered).map((s) => s.code)).toEqual(expected)
  })
  it('bySubjectOrderOf לפריטים שהקוד שלהם בתוך שדה אחר (שורות סקירה, תאי מנהל)', () => {
    const rows = unordered.map((s) => ({ subject: s, n: 1 }))
    expect(bySubjectOrderOf(rows, (r) => r.subject.code).map((r) => r.subject.code)).toEqual(expected)
  })
  it('קוד לא מוכר בסוף, ויציב: לא מערבב מקצועות שווים ולא משנה את הקלט', () => {
    const input = [{ code: 'zzz', i: 1 }, { code: 'math', i: 2 }, { code: 'zzz', i: 3 }, { code: 'hebrew', i: 4 }]
    const before = JSON.stringify(input)
    expect(bySubjectOrder(input).map((s) => s.i)).toEqual([4, 2, 1, 3])
    expect(JSON.stringify(input)).toBe(before)
  })
})

describe('resolveClassTab — הטאב הפעיל לפי הכיתה (isHomeroom), לא לפי העדשה', () => {
  const open = ['math', 'science']
  it('מחנך/ת הכיתה: ברירת מחדל "סקירה"; tab=overview נשאר; מקצוע פתוח נבחר', () => {
    expect(resolveClassTab({ tabParam: null, homeroom: true, openCodes: open })).toEqual({ tab: 'overview', kind: 'overview' })
    expect(resolveClassTab({ tabParam: 'overview', homeroom: true, openCodes: open })).toEqual({ tab: 'overview', kind: 'overview' })
    expect(resolveClassTab({ tabParam: 'science', homeroom: true, openCodes: open })).toEqual({ tab: 'science', kind: 'subject' })
  })
  it('מורה מקצועי בכיתה זו: tab=overview נדחה, והמקצוע הראשון שלו נבחר; מקצוע נעול או לא מוכר — גם כן', () => {
    expect(resolveClassTab({ tabParam: 'overview', homeroom: false, openCodes: open })).toEqual({ tab: 'math', kind: 'subject' })
    expect(resolveClassTab({ tabParam: null, homeroom: false, openCodes: open })).toEqual({ tab: 'math', kind: 'subject' })
    expect(resolveClassTab({ tabParam: 'history', homeroom: false, openCodes: open })).toEqual({ tab: 'math', kind: 'subject' })
  })
  it('מחנך/ת בלי אף מקצוע פתוח: "סקירה" (היא מסבירה בעצמה שעוד אין נתונים)', () => {
    expect(resolveClassTab({ tabParam: 'math', homeroom: true, openCodes: [] })).toEqual({ tab: 'overview', kind: 'overview' })
  })
  it('מורה מקצועי בלי מקצוע פתוח: kind=none — מצב ריק במילים, לא "אין הרשאה"', () => {
    expect(resolveClassTab({ tabParam: null, homeroom: false, openCodes: [] })).toEqual({ tab: 'overview', kind: 'none' })
    expect(resolveClassTab({ tabParam: 'overview', homeroom: false, openCodes: [] })).toEqual({ tab: 'overview', kind: 'none' })
  })
  it('מורה מעורב (מחנך בכיתה אחת, מקצועי באחרת): כל כיתה נבחנת לפי ה-grant שלה', () => {
    const classA = { homeroom: true, openCodes: ['math', 'history'] }
    const classB = { homeroom: false, openCodes: ['history'] }
    expect(resolveClassTab({ tabParam: 'overview', ...classA }).kind).toBe('overview')
    expect(resolveClassTab({ tabParam: 'overview', ...classB })).toEqual({ tab: 'history', kind: 'subject' })
  })
})

describe('classSubjectAccess — הרשאה פר-כיתה, לא איחוד ההרשאות (מורה "cross")', () => {
  const math = { code: 'math', nameHe: 'מתמטיקה' } as SubjectRef
  const history = { code: 'history', nameHe: 'היסטוריה' } as SubjectRef
  const hebrew = { code: 'hebrew', nameHe: 'עברית' } as SubjectRef
  /* מורה שמלמד מתמטיקה בכיתה הדלה והיסטוריה בכיתה העשירה: config.subjects הוא האיחוד (היסטוריה + מתמטיקה), אבל לכל כיתה הרשאה משלה */
  const sparse = { id: 'sparse', isHomeroom: false, subjects: [math], lockedSubjects: [history, hebrew] }
  const rich = { id: 'rich', isHomeroom: false, subjects: [history], lockedSubjects: [math, hebrew] }
  const configUnion = bySubjectOrder([math, history]).map((s) => s.code)

  it('בכיתה העשירה המתמטיקה נעולה (ההיסטוריה פתוחה); בדלה — להפך', () => {
    const r = classSubjectAccess(rich)
    expect(r.open.map((s) => s.code)).toEqual(['history'])
    expect(r.isOpen('math')).toBe(false)
    expect(r.isOpen('history')).toBe(true)
    expect(r.locked.map((s) => s.code)).toContain('math')
    const s = classSubjectAccess(sparse)
    expect(s.open.map((x) => x.code)).toEqual(['math'])
    expect(s.isOpen('history')).toBe(false)
  })

  it('האיחוד (config.subjects) הוא בדיוק מה שהיה פותח מתמטיקה בעשירה — לכן הוא לא משמש לטאבים', () => {
    expect(configUnion).toEqual(['history', 'math'])
    const wrongOpenInRich = configUnion.filter((c) => !classSubjectAccess(rich).isOpen(c))
    expect(wrongOpenInRich).toEqual(['math'])
  })

  it('כל המקצועות לטאבים: פתוחים ונעולים יחד בסדר הקבוע, בלי כפילות; מקצוע שפתוח אינו מופיע גם כנעול', () => {
    const r = classSubjectAccess({ ...rich, lockedSubjects: [math, history, hebrew] })
    expect(r.all.map((s) => s.code)).toEqual(['hebrew', 'history', 'math'])
    expect(r.locked.map((s) => s.code)).toEqual(['hebrew', 'math'])
    expect(new Set(r.all.map((s) => s.code)).size).toBe(r.all.length)
  })

  it('מחנך/ת: isHomeroom נשמר ולא נגזר מהמקצועות; מורה מקצועי בלי מקצוע פתוח: open ריק', () => {
    expect(classSubjectAccess({ isHomeroom: true, subjects: [math, history], lockedSubjects: [] }).homeroom).toBe(true)
    const none = classSubjectAccess({ isHomeroom: false, subjects: [], lockedSubjects: [math] })
    expect(none.open).toEqual([])
    expect(resolveClassTab({ tabParam: null, homeroom: none.homeroom, openCodes: none.open.map((s) => s.code) }).kind).toBe('none')
  })

  it('הטאב הפעיל בכל כיתה נגזר מההרשאה שלה: tab=math בעשירה נדחה והיסטוריה נבחרת', () => {
    expect(resolveClassTab({ tabParam: 'math', homeroom: rich.isHomeroom, openCodes: classSubjectAccess(rich).open.map((s) => s.code) })).toEqual({ tab: 'history', kind: 'subject' })
    expect(resolveClassTab({ tabParam: 'math', homeroom: sparse.isHomeroom, openCodes: classSubjectAccess(sparse).open.map((s) => s.code) })).toEqual({ tab: 'math', kind: 'subject' })
  })
})
