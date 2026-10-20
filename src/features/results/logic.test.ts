import { describe, expect, it } from 'vitest'
import type { ClassSubmissionView, ResultsSubject, StudentChip, SubmissionRow } from '../../shared/types/resultsV1'
import { attemptsWord, attentionTotal, filterSubmissions, firstStudentId, formatSeconds, inTopics, newestFirst, sortedStudents, studentsWord, topicsWord, validOption } from './logic'

const row = (id: string, title: string, sentAt: string, classId = 'c1', subject: string | null = 'math'): SubmissionRow => ({
  id, questId: `q-${id}`, title, thumbUrl: null, subject: subject ? ({ code: subject, nameHe: subject } as ResultsSubject) : null,
  classId, className: classId, sentAt, counts: { total: 10, completed: 5, inProgress: 2, notStarted: 3 },
  summary: 'x', attentionCount: 0, source: 'mine', senderName: null,
})
const ROWS = [
  row('a', 'מסע בארץ השברים', '2026-10-01T08:00:00Z'),
  row('b', 'צף או שוקע?', '2026-10-18T08:00:00Z', 'c2', 'science'),
  row('c', 'בעקבות השורש', '2026-10-05T08:00:00Z', 'c1', 'hebrew'),
  row('d', 'הדמיה בלי מקצוע', '2026-10-10T08:00:00Z', 'c2', null),
]

describe('filterSubmissions', () => {
  it('מסדר מהחדשה לישנה', () => {
    expect(newestFirst(ROWS).map((r) => r.id)).toEqual(['b', 'd', 'c', 'a'])
  })
  it('סינון לפי כיתה ומקצוע ושם, ביחד', () => {
    expect(filterSubmissions(ROWS, { classId: 'c1', subject: null, query: '' }).map((r) => r.id)).toEqual(['c', 'a'])
    expect(filterSubmissions(ROWS, { classId: null, subject: 'science', query: '' }).map((r) => r.id)).toEqual(['b'])
    expect(filterSubmissions(ROWS, { classId: 'c2', subject: null, query: 'בלי' }).map((r) => r.id)).toEqual(['d'])
    expect(filterSubmissions(ROWS, { classId: 'c1', subject: 'science', query: '' })).toEqual([])
  })
  it('חיפוש מתעלם מרווחים בקצוות ומאותיות גדולות/קטנות', () => {
    expect(filterSubmissions(ROWS, { classId: null, subject: null, query: '  שוקע ' }).map((r) => r.id)).toEqual(['b'])
    const latin = [row('x', 'Fractions Quest', '2026-10-02T08:00:00Z')]
    expect(filterSubmissions(latin, { classId: null, subject: null, query: 'FRACTIONS' })).toHaveLength(1)
  })
  it('שליחה בלי מקצוע ("לא סווג") מופיעה כשאין סינון מקצוע, ונעלמת כשיש', () => {
    expect(filterSubmissions(ROWS, { classId: null, subject: null, query: '' })).toHaveLength(4)
    expect(filterSubmissions(ROWS, { classId: null, subject: 'math', query: '' }).map((r) => r.id)).toEqual(['a'])
  })
  it('לא משנה את המערך המקורי', () => {
    const before = ROWS.map((r) => r.id).join()
    filterSubmissions(ROWS, { classId: null, subject: null, query: '' })
    expect(ROWS.map((r) => r.id).join()).toBe(before)
  })
})

describe('validOption', () => {
  it('ערך שאינו ברשימה נחשב "הכול"', () => {
    expect(validOption('c1', ['c1', 'c2'])).toBe('c1')
    expect(validOption('zz', ['c1', 'c2'])).toBeNull()
    expect(validOption(null, ['c1'])).toBeNull()
  })
})

const chip = (id: string, name: string, status: StudentChip['status'], attention = false): StudentChip => ({ id, name, status, attention, attentionReasons: attention ? ['low_success'] : [] })
const ROSTER: ClassSubmissionView['roster'] = {
  completed: [chip('1', 'תמר בראון', 'completed', true), chip('2', 'אלון גולן', 'completed')],
  inProgress: [chip('3', 'זהר זלמן', 'in_progress')],
  notStarted: [chip('4', 'אביגיל רוזן', 'not_started', true)],
}

describe('תלמידים', () => {
  it('מיון לפי א-ב בעברית, בלי קשר לסטטוס', () => {
    expect(sortedStudents(ROSTER).map((s) => s.name)).toEqual(['אביגיל רוזן', 'אלון גולן', 'זהר זלמן', 'תמר בראון'])
  })
  it('התלמיד/ה הראשון/ה לפי א-ב; רשימה ריקה = null', () => {
    expect(firstStudentId(ROSTER)).toBe('4')
    expect(firstStudentId({ completed: [], inProgress: [], notStarted: [] })).toBeNull()
  })
  it('סופר תלמידים לתשומת לב', () => {
    expect(attentionTotal(ROSTER)).toBe(2)
  })
})

describe('ניסוח', () => {
  it('תלמידים', () => {
    expect(studentsWord(0)).toBe('אף תלמיד/ה')
    expect(studentsWord(1)).toBe('תלמיד/ה אחד/ת')
    expect(studentsWord(5)).toBe('5 תלמידים')
  })
  it('תחומים וניסיונות', () => {
    expect(topicsWord(1)).toBe('תחום אחד')
    expect(topicsWord(3)).toBe('3 תחומים')
    expect(inTopics(1)).toBe('בתחום אחד')
    expect(inTopics(2)).toBe('ב-2 תחומים')
    expect(attemptsWord(1)).toBe('ניסיון אחד')
    expect(attemptsWord(4)).toBe('4 ניסיונות')
  })
  it('זמן בשניות ובדקות', () => {
    expect(formatSeconds(null)).toBe('אין נתון')
    expect(formatSeconds(0)).toBe('0 שניות')
    expect(formatSeconds(1)).toBe('שנייה אחת')
    expect(formatSeconds(12)).toBe('12 שניות')
    expect(formatSeconds(60)).toBe('דקה')
    expect(formatSeconds(65)).toBe('דקה ו-5 שניות')
    expect(formatSeconds(180)).toBe('3 דקות')
    expect(formatSeconds(181)).toBe('3 דקות ושנייה אחת')
  })
})
