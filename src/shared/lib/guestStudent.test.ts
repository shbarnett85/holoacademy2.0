import { beforeEach, describe, expect, it } from 'vitest'
import { enterGuestStudent, guestProgress, isGuestStudent, leaveGuestStudent, recordGuestResult } from './guestStudent'
import { homePathForRole } from './homePath'

/* הבדיקות רצות ב-node: אחסון מינימלי במקום זה של הדפדפן */
function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() { return m.size },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => { m.delete(k) },
    setItem: (k: string, v: string) => { m.set(k, String(v)) },
  }
}

describe('תלמיד אורח (בדפדפן בלבד)', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'sessionStorage', { value: memoryStorage(), configurable: true })
    Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage(), configurable: true })
  })

  it('כניסה: מסומן כאורח, עם שם לתצוגה, ובלי טוקן', () => {
    expect(isGuestStudent()).toBe(false)
    enterGuestStudent('אורחים')
    expect(isGuestStudent()).toBe(true)
    expect(sessionStorage.getItem('holo_student_name')).toBe('אורחים')
    expect(sessionStorage.getItem('holo_token')).toBeNull()
  })

  it('הבית של אורח הוא הבית של התלמיד; בלי כניסה: עמוד הפתיחה', () => {
    expect(homePathForRole()).toBe('/')
    enterGuestStudent('אורחים')
    expect(homePathForRole()).toBe('/student')
  })

  it('תלמיד שמחובר עם טוקן אמיתי הוא לא אורח, גם אם הדגל נשאר', () => {
    enterGuestStudent('אורחים')
    sessionStorage.setItem('holo_token', 'x.y.z')
    expect(isGuestStudent()).toBe(false)
    /* ותוצאה של תלמיד אמיתי לא נרשמת כהתקדמות של אורח */
    recordGuestResult('q1', 5)
    expect(guestProgress()).toEqual({})
  })

  it('תוצאה נשמרת בלשונית בלבד, והטובה ביותר נשארת', () => {
    recordGuestResult('q1', 3)
    expect(guestProgress()).toEqual({}) /* לא אורח: לא נשמר */
    enterGuestStudent('אורחים')
    recordGuestResult('q1', 3)
    recordGuestResult('q1', 2)
    recordGuestResult('q2', 5)
    expect(guestProgress()).toEqual({ q1: 3, q2: 5 })
    expect(localStorage.length).toBe(0)
  })

  it('יציאה מוחקת את הדגל, את השם ואת ההתקדמות', () => {
    enterGuestStudent('אורחים')
    recordGuestResult('q1', 4)
    leaveGuestStudent()
    expect(isGuestStudent()).toBe(false)
    expect(guestProgress()).toEqual({})
    expect(sessionStorage.getItem('holo_student_name')).toBeNull()
  })

  it('התקדמות פגומה באחסון לא מפילה כלום', () => {
    enterGuestStudent('אורחים')
    sessionStorage.setItem('holo_guest_progress', '{not json')
    expect(guestProgress()).toEqual({})
    sessionStorage.setItem('holo_guest_progress', JSON.stringify({ a: 'x', b: 2 }))
    expect(guestProgress()).toEqual({ b: 2 })
  })
})
