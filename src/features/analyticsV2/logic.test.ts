import { describe, expect, it } from 'vitest'
import { V2_CLIENT_TEXT } from '../../shared/lib/findingsNarrative'
import type { Briefing, Roster } from '../../shared/types/analyticsV2'
import {
  BRIEF_SCOPES, SUMMARY_SCOPES, PREVIOUS_VIEW_HREF, alertsMoreClassId, briefingHasContent, canSeePreviousView, configFailureView, entryClassState, entryRoleText, feedbackHasContent, parseScopeId, previousViewPlacement, questHref,
  rosterStudentCount, rosterStudentKey, studentHeadline, summaryContextOf, uniqueRosterStudents,
} from './logic'

describe('parseScopeId — ?brief= / ?sum= בכתובת', () => {
  it('"student:s-1" → היקף ומזהה', () => {
    expect(parseScopeId('student:s-1', SUMMARY_SCOPES)).toEqual({ scope: 'student', id: 's-1' })
    expect(parseScopeId('class:c-v2', BRIEF_SCOPES)).toEqual({ scope: 'class', id: 'c-v2' })
  })
  it('מזהה עם נקודתיים נשמר שלם (רק הראשונה מפרידה)', () => {
    expect(parseScopeId('student:a:b', SUMMARY_SCOPES)).toEqual({ scope: 'student', id: 'a:b' })
  })
  it('חסר / היקף לא מוכר / בלי מזהה → null (לא נפתחת שכבה)', () => {
    for (const v of [null, '', 'student', 'student:', ':s-1', 'submission:x', 'admin:1']) expect(parseScopeId(v, SUMMARY_SCOPES), String(v)).toBeNull()
  })
})

describe('entryClassState — "עוד אין תוצאות" אינו "אין תלמידים לתשומת לב"', () => {
  it('אין תוצאות בכיתה → noResults (גם כשספירת תשומת הלב היא 0)', () => {
    expect(entryClassState({ hasResults: false, attentionCount: 0 })).toBe('noResults')
  })
  it('יש תוצאות ואין התרעות → clear; יש התרעות → attention', () => {
    expect(entryClassState({ hasResults: true, attentionCount: 0 })).toBe('clear')
    expect(entryClassState({ hasResults: true, attentionCount: 2 })).toBe('attention')
  })
})

describe('entryClassState — שדות החוזה החדשים (noOpenSubject / basisNote)', () => {
  it('שיוך בלי מקצוע פתוח → noOpenSubject (גובר על "עוד אין תוצאות": הסיבה היא שהמקצוע לא הוגדר)', () => {
    expect(entryClassState({ hasResults: false, attentionCount: 0, noOpenSubject: true })).toBe('noOpenSubject')
    expect(entryClassState({ hasResults: true, attentionCount: 0, noOpenSubject: true })).toBe('noOpenSubject')
  })
  it('יש תוצאות, אין התרעות, ויש basisNote (נבדקו מעט תלמידים) → thin — לא clear', () => {
    expect(entryClassState({ hasResults: true, attentionCount: 0, basisNote: 'נתונים על 1 מתוך 3 תלמידים — עוד מוקדם לדעת.' })).toBe('thin')
    expect(entryClassState({ hasResults: true, attentionCount: 0, basisNote: null })).toBe('clear')
  })
  it('התרעות גוברות על basisNote; בלי תוצאות — noResults גם עם basisNote', () => {
    expect(entryClassState({ hasResults: true, attentionCount: 2, basisNote: 'x' })).toBe('attention')
    expect(entryClassState({ hasResults: false, attentionCount: 0, basisNote: 'x' })).toBe('noResults')
  })
})

describe('entryRoleText — התפקיד בכרטיס הכיתה', () => {
  const sub = (code: string, nameHe: string) => ({ code, nameHe }) as never
  it('מחנך/ת: "מחנך/ת" (גם כשיש לו/ה מקצועות)', () => {
    expect(entryRoleText({ isHomeroom: true, subjects: [sub('math', 'מתמטיקה')] })).toBe('מחנך/ת')
  })
  it('מורה מקצועי: "מורה מקצוע: …" בסדר הקבוע של המערכת', () => {
    expect(entryRoleText({ isHomeroom: false, subjects: [sub('math', 'מתמטיקה')] })).toBe('מורה מקצוע: מתמטיקה')
    expect(entryRoleText({ isHomeroom: false, subjects: [sub('math', 'מתמטיקה'), sub('hebrew', 'עברית')] })).toBe('מורה מקצוע: עברית, מתמטיקה')
  })
  it('בלי מקצוע פתוח, או כיתה לא ידועה: אין תג', () => {
    expect(entryRoleText({ isHomeroom: false, subjects: [] })).toBeNull()
    expect(entryRoleText(undefined)).toBeNull()
  })
})

describe('alertsMoreClassId — לאן מובילה "ועוד N תלמידים בכיתה"', () => {
  it('כיתה אחת עם תלמידים לתשומת לב → היא; כמה כיתות, או אף אחת → אין יעד אחד', () => {
    expect(alertsMoreClassId([{ id: 'a', attentionCount: 0 }, { id: 'b', attentionCount: 3 }])).toBe('b')
    expect(alertsMoreClassId([{ id: 'a', attentionCount: 1 }, { id: 'b', attentionCount: 3 }])).toBeNull()
    expect(alertsMoreClassId([{ id: 'a', attentionCount: 0 }])).toBeNull()
    expect(alertsMoreClassId([])).toBeNull()
  })
})

describe('previousViewPlacement — איפה "התצוגה הקודמת" במסך הכניסה', () => {
  it('יש כיתות וכולן בלי תוצאות → למעלה (שם היא המקום היחיד שיש בו מה לראות)', () => {
    expect(previousViewPlacement([{ hasResults: false }, { hasResults: false }])).toBe('top')
  })
  it('לפחות כיתה אחת עם תוצאות → למטה; בלי כיתות בכלל → למטה (המצב הריק הוא הראשי)', () => {
    expect(previousViewPlacement([{ hasResults: false }, { hasResults: true }])).toBe('bottom')
    expect(previousViewPlacement([{ hasResults: true }])).toBe('bottom')
    expect(previousViewPlacement([])).toBe('bottom')
  })
})

describe('canSeePreviousView — "התצוגה הקודמת" רק למורה אמיתי', () => {
  it('מורה אמיתי: כן', () => expect(canSeePreviousView({ role: 'teacher', isGuest: false })).toBe(true))
  it('אורח: לא', () => expect(canSeePreviousView({ role: 'teacher', isGuest: true })).toBe(false))
  it('מנהל/ת, מנהל/ת עירוני, מנהל-על, ללא התחברות: לא', () => {
    for (const role of ['admin', 'municipal_admin', 'super_admin', null]) expect(canSeePreviousView({ role, isGuest: false }), String(role)).toBe(false)
  })
  it('הכתובת של התצוגה הקודמת', () => expect(PREVIOUS_VIEW_HREF).toBe('/analytics?view=previous'))
})

describe('configFailureView — כשל בטעינת התצורה (GET /config)', () => {
  it('מורה אמיתי: נופל לתצוגה הקודמת על אין חיבור (0), עומס (429), 5xx והמתנה ממושכת (503)', () => {
    for (const status of [0, 429, 500, 502, 503, 504]) expect(configFailureView({ role: 'teacher', isGuest: false, status }), String(status)).toBe('legacy')
  })
  it('מורה אמיתי: גם 400/403/404 לא משאירים אותו עם מסך ריק — הוא יכול להמשיך בתצוגה הקודמת', () => {
    for (const status of [400, 403, 404]) expect(configFailureView({ role: 'teacher', isGuest: false, status }), String(status)).toBe('legacy')
  })
  it('401: ההתחברות פגה — בלוק שגיאה (התצוגה הקודמת הייתה נכשלת באותה סיבה)', () => {
    expect(configFailureView({ role: 'teacher', isGuest: false, status: 401 })).toBe('error')
  })
  it('אורח, מנהל/ת, מנהל/ת עירוני, מנהל-על: תמיד בלוק שגיאה, בכל סטטוס', () => {
    const who: { role: string | null; isGuest: boolean }[] = [{ role: 'teacher', isGuest: true }, { role: 'admin', isGuest: false }, { role: 'municipal_admin', isGuest: false }, { role: 'super_admin', isGuest: false }, { role: null, isGuest: false }]
    for (const p of who) for (const status of [0, 429, 503]) expect(configFailureView({ ...p, status }), `${p.role}/${p.isGuest}/${status}`).toBe('error')
  })
  it('ההחלטה זהה להרשאה לתצוגה הקודמת (אותו קהל), פרט ל-401', () => {
    for (const role of ['teacher', 'admin', 'municipal_admin', 'super_admin', null]) {
      for (const isGuest of [false, true]) {
        expect(configFailureView({ role, isGuest, status: 503 }) === 'legacy').toBe(canSeePreviousView({ role, isGuest }))
      }
    }
  })
})

const sec = (id: Briefing['sections'][number]['id'], n: number): Briefing['sections'][number] => ({
  id, title: id, items: Array.from({ length: n }, (_, i) => ({ text: `t${i}`, subjectCode: null, evidence: [] })),
})

describe('briefingHasContent — לא פותחים מסמך ריק', () => {
  it('רק שורות ההסבר הקבועות (מגבלות הראיות, הערת השיטה) → אין תוכן', () => {
    expect(briefingHasContent({ sections: [sec('strengths', 0), sec('difficulties', 0), sec('trend', 0), sec('recommendations', 0), sec('unknowns', 1), sec('evidence_basis', 0), sec('how_we_calculated', 1)] })).toBe(false)
  })
  it('פריט באחד מסעיפי התוכן → יש תוכן', () => {
    for (const id of ['strengths', 'difficulties', 'trend', 'recommendations', 'evidence_basis'] as const) {
      expect(briefingHasContent({ sections: [sec(id, 1), sec('unknowns', 1)] }), id).toBe(true)
    }
  })
  it('בלי סעיפים בכלל → אין תוכן', () => expect(briefingHasContent({ sections: [] })).toBe(false))
})

describe('feedbackHasContent', () => {
  it('בלי פריטים → אין משוב להציג', () => {
    expect(feedbackHasContent({ items: [] })).toBe(false)
    expect(feedbackHasContent({ items: [{ subject: { code: 'math', nameHe: 'מתמטיקה' }, kind: 'next_step', text: 'x' }] })).toBe(true)
  })
})

describe('studentHeadline — "אין עדיין תוצאות" אינו "אין דבר חריג"', () => {
  it('dataState=insufficient: המשפט אומר שעוד אין תוצאות ומה יקרה, ולא את משפט השרת', () => {
    const t = studentHeadline('insufficient', 'נועה', 'נועה: אין כרגע דבר חריג לדווח.')
    expect(t).toBe(V2_CLIENT_TEXT.studentNoResults('נועה'))
    expect(t).toContain('עוד אין תוצאות')
    expect(t).not.toContain('אין כרגע דבר חריג')
  })
  it('ok / ללא מידע: משפט השרת כפי שהוא', () => {
    expect(studentHeadline('ok', 'נועה', 'נועה: נצפתה התקדמות.')).toBe('נועה: נצפתה התקדמות.')
    expect(studentHeadline(null, 'נועה', 'x')).toBe('x')
  })
})

describe('questHref — "פתיחה בספרייה" מגיעה להדמיה האמיתית כשאפשר', () => {
  it('מזהה אמיתי (uuid) → עמוד ההדמיה', () => {
    expect(questHref('3f2b8c1e-9d4a-4c1b-8e7a-1a2b3c4d5e6f')).toBe('/creator/quest/3f2b8c1e-9d4a-4c1b-8e7a-1a2b3c4d5e6f')
  })
  it('מזהה של הדגמה (לא קיים בבסיס הנתונים) → הספרייה, לא עמוד ריק', () => {
    expect(questHref('demo-q-fractions-add')).toBe('/creator/library')
  })
})

/* ── רשימת הכיתות והתלמידים: תלמיד/ה בשתי כיתות ── */
const sub = (code: string, nameHe: string) => ({ code, nameHe }) as never
const ROSTER: Roster = {
  classes: [
    { id: 'a', name: 'ו׳1', gradeLabel: 'ו׳', grade: 6, studentCount: 3, isHomeroom: true, subjects: [], lockedSubjects: [] },
    { id: 'b', name: 'ו׳2', gradeLabel: 'ו׳', grade: 6, studentCount: 2, isHomeroom: false, subjects: [sub('bible', 'תנ״ך')], lockedSubjects: [] },
    { id: 'c', name: 'ה׳1', gradeLabel: 'ה׳', grade: 5, studentCount: 1, isHomeroom: false, subjects: [sub('math', 'מתמטיקה')], lockedSubjects: [] },
  ],
  students: [
    { id: 's1', displayName: 'נועה כהן', classId: 'a', attention: 0, positive: 0, earlyWarning: false },
    { id: 's2', displayName: 'דן לוי', classId: 'a', attention: 0, positive: 0, earlyWarning: false },
    /* משותפת: חברה בכיתה א׳ (מחנכת) וגם ב׳ (מורה מקצועי) */
    { id: 'shared', displayName: 'מיכל בר', classId: 'a', attention: 0, positive: 0, earlyWarning: false },
    { id: 'shared', displayName: 'מיכל בר', classId: 'b', attention: 0, positive: 0, earlyWarning: false },
    { id: 'only-b', displayName: 'יואב שמש', classId: 'b', attention: 0, positive: 0, earlyWarning: false },
    { id: 'only-c', displayName: 'תמר גיל', classId: 'c', attention: 0, positive: 0, earlyWarning: false },
  ],
}

describe('רשימת התלמידים: תלמיד/ה בשתי כיתות מופיע/ה פעם לכל כיתה', () => {
  it('מפתח הרשימה הוא id+classId — ייחודי לכל השורות (אין אזהרת key כפולה)', () => {
    const keys = ROSTER.students.map(rosterStudentKey)
    expect(new Set(keys).size).toBe(keys.length)
    expect(new Set(ROSTER.students.map((s) => s.id)).size).toBeLessThan(keys.length)
  })

  it('ספירה ורשימה לפי תלמיד/ה: כל אחד/ת פעם אחת, בסדר המקורי', () => {
    expect(ROSTER.students).toHaveLength(6)
    expect(rosterStudentCount(ROSTER.students)).toBe(5)
    expect(uniqueRosterStudents(ROSTER.students).map((s) => s.id)).toEqual(['s1', 's2', 'shared', 'only-b', 'only-c'])
    expect(rosterStudentCount([])).toBe(0)
  })
})

describe('summaryContextOf — שם לכותרת/ייצוא של הסיכום ואם הצופה רואה את כל המקצועות', () => {
  it('תלמיד/ה בכיתה שבה הצופה מחנך/ת: השם, כל המקצועות', () => {
    expect(summaryContextOf(ROSTER, 'student', 's1')).toEqual({ name: 'נועה כהן', subjectOnly: false })
  })
  it('תלמיד/ה רק בכיתה שבה הצופה מורה מקצועי: הסיכום מתייחס רק למקצועותיו', () => {
    expect(summaryContextOf(ROSTER, 'student', 'only-b')).toEqual({ name: 'יואב שמש', subjectOnly: true })
    expect(summaryContextOf(ROSTER, 'student', 'only-c')).toEqual({ name: 'תמר גיל', subjectOnly: true })
  })
  it('תלמיד/ה בשתי כיתות, באחת מהן הצופה מחנך/ת: רואה את כל המקצועות (ההרשאה היא איחוד, כמו בשרת)', () => {
    expect(summaryContextOf(ROSTER, 'student', 'shared')).toEqual({ name: 'מיכל בר', subjectOnly: false })
  })
  it('כיתה: "כיתה <שם>", תמיד כל המקצועות (הסיכום לכיתה הוא למחנך/ת בלבד)', () => {
    expect(summaryContextOf(ROSTER, 'class', 'a')).toEqual({ name: 'כיתה ו׳1', subjectOnly: false })
  })
  it('הרשימה עוד לא נטענה / היעד לא ברשימה: בלי שם, בלי הערה (הכותרת היא שם ההיקף בלבד)', () => {
    expect(summaryContextOf(null, 'student', 's1')).toEqual({ name: '', subjectOnly: false })
    expect(summaryContextOf(ROSTER, 'student', 'nobody')).toEqual({ name: '', subjectOnly: false })
    expect(summaryContextOf(ROSTER, 'class', 'zzz')).toEqual({ name: '', subjectOnly: false })
  })
})
