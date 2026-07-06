import { describe, it, expect } from 'vitest'
import { nextLockState, lockDurationMs, LOCK_BASE_MS, LOCK_MAX_MS, type LockState } from './rateLimit'

const MAX = 5
const T0 = 1_000_000

/* מריץ n כשלים רצופים מאותו רגע */
function fail(times: number, start: LockState | null, now: number): LockState {
  let s = start
  for (let i = 0; i < times; i++) s = nextLockState(s, MAX, now)
  return s!
}

describe('נעילת-מזהה מדורגת (nextLockState)', () => {
  it('מתחת לסף — לא נעול', () => {
    const s = fail(MAX - 1, null, T0)
    expect(s.lockedUntil).toBe(0)
    expect(s.fails).toBe(MAX - 1)
  })

  it('בסף — נעילה ראשונה למשך הבסיס (דקה)', () => {
    const s = fail(MAX, null, T0)
    expect(s.lockedUntil).toBe(T0 + LOCK_BASE_MS)
    expect(s.lockLevel).toBe(1)
  })

  it('נעילה שנייה ארוכה פי-3, שלישית פי-9', () => {
    let s = fail(MAX, null, T0)
    /* אחרי שהנעילה הראשונה פגה — עוד סבב כשלים */
    const t1 = s.lockedUntil + 1
    s = fail(MAX, s, t1)
    expect(s.lockedUntil).toBe(t1 + LOCK_BASE_MS * 3)
    const t2 = s.lockedUntil + 1
    s = fail(MAX, s, t2)
    expect(s.lockedUntil).toBe(t2 + LOCK_BASE_MS * 9)
  })

  it('משך הנעילה מוגבל בתקרה (30 דקות)', () => {
    expect(lockDurationMs(0)).toBe(LOCK_BASE_MS)
    expect(lockDurationMs(10)).toBe(LOCK_MAX_MS)
  })

  it('כשלים בחלונות נפרדים (הפרש מעל דקה) לא מצטברים', () => {
    let s: LockState | null = null
    for (let i = 0; i < 20; i++) {
      /* כשל אחד כל 2 דקות — החלון (דקה) פג בין כשל לכשל */
      s = nextLockState(s, MAX, T0 + i * 120_000)
    }
    expect(s!.lockedUntil).toBe(0)
  })

  it('state ישן לגמרי (חלון פג, לא נעול, בלי היסטוריה) מאופס', () => {
    const stale: LockState = { fails: 3, windowEnd: T0 - 1, lockedUntil: 0, lockLevel: 0 }
    const s = nextLockState(stale, MAX, T0)
    expect(s.fails).toBe(1)
  })

  it('רמת הנעילה נשמרת בין נעילות (ההסלמה לא מתאפסת מיד)', () => {
    let s = fail(MAX, null, T0)
    const t1 = s.lockedUntil + 1
    s = fail(MAX, s, t1)
    expect(s.lockLevel).toBe(2)
  })
})
