import { beforeEach, describe, expect, it } from 'vitest'
import { setSession } from '../../shared/lib/staffSession'
import type { StaffSession } from '../../shared/lib/staffSession'
import { guestLensParams, lensToParams, readGuestLens, withGuestLens, writeGuestLens } from './guestLens'

const session = (isGuest: boolean): StaffSession => ({
  access_token: 't', refresh_token: 'r',
  staff: { userId: 'u', name: 'מורה', role: 'teacher', schoolId: null, email: 'a@b.c', isGuest },
})

/* סביבת הבדיקה היא node — אין sessionStorage, ולכן זה גם מבחן העמידות: האחסון חסום והערך נשמר בזיכרון */
describe('lensToParams', () => {
  it('מקצוע נשלח רק בעדשת מורה מקצועי', () => {
    expect(lensToParams('homeroom', 'math')).toEqual({ lens: 'homeroom' })
    expect(lensToParams('admin', 'math')).toEqual({ lens: 'admin' })
    expect(lensToParams('subject_teacher', 'math')).toEqual({ lens: 'subject_teacher', subject: 'math' })
    expect(lensToParams('subject_teacher', null)).toEqual({ lens: 'subject_teacher' })
  })
})

describe('מאגר העדשה (אחסון חסום → זיכרון)', () => {
  beforeEach(() => { setSession(null) })

  it('כתיבה וקריאה; אותו אובייקט כל עוד הערך לא השתנה', () => {
    writeGuestLens({ lens: 'subject_teacher', subject: 'hebrew' })
    const a = readGuestLens()
    expect(a).toEqual({ lens: 'subject_teacher', subject: 'hebrew' })
    writeGuestLens({ lens: 'subject_teacher', subject: 'hebrew' })
    expect(readGuestLens()).toBe(a)
  })

  it('המקצוע האחרון נשמר גם כשהעדשה אחרת', () => {
    writeGuestLens({ lens: 'subject_teacher', subject: 'math' })
    writeGuestLens({ lens: 'admin', subject: 'math' })
    expect(readGuestLens()).toEqual({ lens: 'admin', subject: 'math' })
  })
})

describe('guestLensParams / withGuestLens', () => {
  beforeEach(() => { writeGuestLens({ lens: 'subject_teacher', subject: 'math' }) })

  it('משתמש שאינו אורח (או לא מחובר): ריק — הכתובת לא משתנה', () => {
    setSession(null)
    expect(guestLensParams()).toEqual({})
    expect(withGuestLens('/results')).toBe('/results')
    setSession(session(false))
    expect(guestLensParams()).toEqual({})
    expect(withGuestLens('/api/results/submissions?x=1')).toBe('/api/results/submissions?x=1')
  })

  it('אורח: הפרמטרים מהמאגר מצורפים לנתיב, עם או בלי שאילתה קיימת, ובלי לדרוס עדשה מפורשת', () => {
    setSession(session(true))
    expect(guestLensParams()).toEqual({ lens: 'subject_teacher', subject: 'math' })
    expect(withGuestLens('/results')).toBe('/results?lens=subject_teacher&subject=math')
    expect(withGuestLens('/api/x?a=1#frag')).toBe('/api/x?a=1&lens=subject_teacher&subject=math#frag')
    expect(withGuestLens('/analytics?lens=admin')).toBe('/analytics?lens=admin')
    expect(guestLensParams({ lens: 'homeroom', subject: 'math' })).toEqual({ lens: 'homeroom' })
    expect(guestLensParams(null)).toEqual({})
  })
})
