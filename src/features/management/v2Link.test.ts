import { describe, expect, it } from 'vitest'
import { V2_ROSTER_LINK_TEXT } from '../../shared/lib/findingsNarrative'
import { classSummaryNote, rosterAnalyticsLinks } from './v2Link'

describe('rosterAnalyticsLinks — כפתורי "התקדמות" ו"סיכום פדגוגי" ברוסטר', () => {
  it('מורה אמיתי / אורח (השרת: v2Linked=true): מציגים, בלי משפט', () => {
    expect(rosterAnalyticsLinks({ role: 'teacher', link: { v2Linked: true, v2UnlinkedReason: null } })).toEqual({ show: true, note: null })
  })

  it('שדה חסר (שרת ישן / עוד לא נטען): כמו שהיה — מציגים', () => {
    expect(rosterAnalyticsLinks({ role: 'teacher', link: {} })).toEqual({ show: true, note: null })
    expect(rosterAnalyticsLinks({ role: null, link: {} })).toEqual({ show: true, note: null })
  })

  it('ארגון הדגמה (v2Linked=false, demo_org): מסתירים ואומרים למה — לא מנווטים ל"לא נמצא"', () => {
    const r = rosterAnalyticsLinks({ role: 'teacher', link: { v2Linked: false, v2UnlinkedReason: 'demo_org' } })
    expect(r).toEqual({ show: false, note: V2_ROSTER_LINK_TEXT.student.demo_org })
    expect(r.note).toMatch(/הדגמה/)
  })

  it('אין מסך כרגע (unavailable), וגם סיבה חסרה/לא מוכרת: מסתירים עם המשפט הכללי', () => {
    const expected = { show: false, note: V2_ROSTER_LINK_TEXT.student.unavailable }
    expect(rosterAnalyticsLinks({ role: 'teacher', link: { v2Linked: false, v2UnlinkedReason: 'unavailable' } })).toEqual(expected)
    expect(rosterAnalyticsLinks({ role: 'teacher', link: { v2Linked: false, v2UnlinkedReason: null } })).toEqual(expected)
    expect(rosterAnalyticsLinks({ role: 'teacher', link: { v2Linked: false } })).toEqual(expected)
  })

  it('מנהל / מנהל עירוני (אגרגטים בלבד): מוסתר לפי התפקיד, בלי משפט — בכל מצב של הדגל', () => {
    for (const role of ['admin', 'municipal_admin']) {
      for (const link of [{}, { v2Linked: true }, { v2Linked: false, v2UnlinkedReason: 'demo_org' as const }, { v2Linked: false, v2UnlinkedReason: 'unavailable' as const }]) {
        expect(rosterAnalyticsLinks({ role, link })).toEqual({ show: false, note: null })
      }
    }
  })

  it('המשפטים: עברית פשוטה, בלי אימוג׳י ובלי ז׳רגון, וכל אחד אומר מה קורה', () => {
    for (const s of [...Object.values(V2_ROSTER_LINK_TEXT.student), ...Object.values(V2_ROSTER_LINK_TEXT.cls)]) {
      expect(s).not.toMatch(/\p{Extended_Pictographic}/u)
      expect(s).not.toMatch(/וקטור|מובהק|אינדקס|קורלצי|\bBH\b|\bp\b|404|HTTP/i)
      expect(s.length).toBeGreaterThan(20)
    }
  })
})

describe('classSummaryNote — סיכום הכיתה בניהול הכיתה', () => {
  it('יש מסך (או שדה חסר): אין משפט, הכפתור מוצג', () => {
    expect(classSummaryNote({})).toBeNull()
    expect(classSummaryNote({ v2Linked: true, v2UnlinkedReason: null })).toBeNull()
  })

  it('ארגון הדגמה: המשפט מחליף את הכפתור', () => {
    expect(classSummaryNote({ v2Linked: false, v2UnlinkedReason: 'demo_org' })).toBe(V2_ROSTER_LINK_TEXT.cls.demo_org)
  })

  it('אין מסך כרגע: המשפט הכללי', () => {
    expect(classSummaryNote({ v2Linked: false, v2UnlinkedReason: 'unavailable' })).toBe(V2_ROSTER_LINK_TEXT.cls.unavailable)
    expect(classSummaryNote({ v2Linked: false })).toBe(V2_ROSTER_LINK_TEXT.cls.unavailable)
  })
})
