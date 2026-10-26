import { describe, expect, it } from 'vitest'
import { countNb, DONUT_TEXT, donutAriaLabel, donutLegendCount, howWeCalcObjectivesLines, narrateObjectivesSummary, narrateSubmissionsSummary, objectiveLevelText, RESULTS_TEXT } from '../../shared/lib/findingsNarrative'
import type { ClassSubmissionView, ObjectiveResult, ResultsSubject, StudentChip, SubmissionRow } from '../../shared/types/resultsV1'
import { attemptsWord, attentionTotal, byAttentionThenName, CLASS_TAB_IDS, filterSubmissions, firstStudentId, formatSeconds, groupByWeek, inTopics, newestFirst, objectiveLevelCounts, resolveTab, ROSTER_GROUP_ORDER, sortedStudents, STUDENT_TAB_IDS, studentsWord, topicsWord, validOption, visibleStudents } from './logic'
import { UI } from './text'

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
  it('קבוצות הכיתה: מי שדורש מעקב קודם, ובתוך קבוצה "לתשומת לב" לפני שאר השמות (ואז א-ב)', () => {
    expect([...ROSTER_GROUP_ORDER]).toEqual(['notStarted', 'inProgress', 'completed'])
    const names = [...ROSTER.completed].sort(byAttentionThenName).map((s) => s.name)
    expect(names).toEqual(['תמר בראון', 'אלון גולן'])
    const plain = [chip('a', 'תמר', 'completed'), chip('b', 'אלון', 'completed'), chip('c', 'דנה', 'completed', true), chip('d', 'בן', 'completed', true)]
    expect(plain.sort(byAttentionThenName).map((s) => s.name)).toEqual(['בן', 'דנה', 'אלון', 'תמר'])
  })
  it('שורת המצב בראש המסך באותו סדר כמו הקבוצות', () => {
    expect(UI.stateLine(6, 5)).toBe('5 עוד לא התחילו · 6 באמצע')
    expect(UI.stateLine(0, 2)).toBe('2 עוד לא התחילו')
    expect(UI.stateLine(0, 0)).toBe('כולם סיימו')
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

const obj = (id: string, level: ObjectiveResult['level']): ObjectiveResult => ({
  id, text: `יעד ${id}`, attempted: level ? 10 : 0, solved: level === 'strong' ? 9 : level === 'partial' ? 7 : level === 'weak' ? 3 : 0,
  level, levelText: objectiveLevelText(level), weakStudents: [],
})

describe('יעדי למידה', () => {
  it('סופר יעדים לפי רמה; total כולל גם יעדים בלי נתונים', () => {
    expect(objectiveLevelCounts([obj('a', 'strong'), obj('b', 'weak'), obj('c', 'weak'), obj('d', null)])).toEqual({ total: 4, strong: 1, partial: 0, weak: 2 })
    expect(objectiveLevelCounts([])).toEqual({ total: 0, strong: 0, partial: 0, weak: 0 })
  })
  it('המילים לרמות', () => {
    expect([objectiveLevelText('strong'), objectiveLevelText('partial'), objectiveLevelText('weak'), objectiveLevelText(null)]).toEqual(['למדו', 'למדו חלקית', 'עדיין קשה', 'אין עדיין נתונים'])
  })
  it('משפט הסיכום: מילים פשוטות, "X מתוך Y", וחוסר נתונים אומר מה יקרה', () => {
    expect(narrateObjectivesSummary({ total: 3, strong: 2, partial: 0, weak: 1 })).toBe('הכיתה למדה 2 מתוך 3 יעדים. יעד אחד עדיין קשה לכיתה.')
    expect(narrateObjectivesSummary({ total: 4, strong: 1, partial: 2, weak: 1 })).toBe('הכיתה למדה 1 מתוך 4 יעדים. 2 יעדים נלמדו חלקית. יעד אחד עדיין קשה לכיתה.')
    expect(narrateObjectivesSummary({ total: 2, strong: 0, partial: 1, weak: 1 })).toBe('עדיין אין יעד שהכיתה למדה במלואו. יעד אחד נלמד חלקית. יעד אחד עדיין קשה לכיתה.')
    expect(narrateObjectivesSummary({ total: 1, strong: 1, partial: 0, weak: 0 })).toBe('הכיתה למדה 1 מתוך 1 יעד.')
    expect(narrateObjectivesSummary({ total: 3, strong: 1, partial: 0, weak: 1 })).toContain('ליעד אחד עוד אין נתונים.')
    expect(narrateObjectivesSummary({ total: 2, strong: 0, partial: 0, weak: 0 })).toBe('עוד אין תוצאות ביעדי הלמידה. הן יופיעו כאן כשתלמידים יסיימו.')
  })
  it('איך חישבנו: הספים מגיעים מהקורא', () => {
    const lines = howWeCalcObjectivesLines({ strong: 0.8, partial: 0.6 }).join(' ')
    expect(lines).toContain('60%')
    expect(lines).toContain('80%')
    expect(howWeCalcObjectivesLines({ strong: 0.9, partial: 0.5 }).join(' ')).toContain('90%')
  })
  it('מתקשים להצגה: עד הסף, ואחרי פתיחה — כולם; לא משנה את המקור', () => {
    const list = ['א', 'ב', 'ג', 'ד', 'ה']
    expect(visibleStudents(list, false, 3)).toEqual({ shown: ['א', 'ב', 'ג'], hidden: 2 })
    expect(visibleStudents(list, true, 3)).toEqual({ shown: list, hidden: 0 })
    expect(visibleStudents(list, false, 5)).toEqual({ shown: list, hidden: 0 })
    /* אחד בלבד היה מוסתר — מציגים את כולם */
    expect(visibleStudents(list, false, 4)).toEqual({ shown: list, hidden: 0 })
    expect(visibleStudents([], false, 3)).toEqual({ shown: [], hidden: 0 })
    expect(list).toHaveLength(5)
  })
})

describe('סט הטאבים הקבוע', () => {
  it('מסך הכיתה: במבט אחד · האתגרים · יעדי הלמידה · מה עושים עם זה — תמיד, בכל שליחה', () => {
    expect([...CLASS_TAB_IDS]).toEqual(['glance', 'challenges', 'objectives', 'actions'])
    expect(UI.tabActions).toBe('מה עושים עם זה')
    expect([...STUDENT_TAB_IDS]).toEqual(['challenges', 'slides'])
    expect(UI.tabGlance).toBe('במבט אחד')
  })
  it('?tab= תקף נשאר; לא תקף או חסר → הטאב הראשון של המסך (במבט אחד בכיתה, האתגרים אצל תלמיד/ה)', () => {
    expect(resolveTab('actions', CLASS_TAB_IDS)).toBe('actions')
    /* קישורים ישנים (?tab=review / ?tab=errors) נופלים לטאב הראשון ולא שוברים את המסך */
    expect(resolveTab('review', CLASS_TAB_IDS)).toBe('glance')
    expect(resolveTab('errors', CLASS_TAB_IDS)).toBe('glance')
    expect(resolveTab('objectives', CLASS_TAB_IDS)).toBe('objectives')
    expect(resolveTab('glance', CLASS_TAB_IDS)).toBe('glance')
    expect(resolveTab('challenges', CLASS_TAB_IDS)).toBe('challenges')
    expect(resolveTab('nope', CLASS_TAB_IDS)).toBe('glance')
    expect(resolveTab(null, CLASS_TAB_IDS)).toBe('glance')
    expect(resolveTab('review', STUDENT_TAB_IDS)).toBe('challenges')
    expect(resolveTab('glance', STUDENT_TAB_IDS)).toBe('challenges')
    expect(resolveTab(null, STUDENT_TAB_IDS)).toBe('challenges')
    expect(resolveTab('slides', STUDENT_TAB_IDS)).toBe('slides')
  })
  it('מצבי הריק של הטאבים אומרים מה קורה ומה יקרה (עיקרון 9)', () => {
    for (const [title, next] of [[UI.objectivesEmpty, UI.objectivesEmptyNext], [UI.reviewEmpty, UI.reviewEmptyNext], [RESULTS_TEXT.noCommonErrors, UI.errorsEmptyNext], [UI.actionsEmpty, UI.actionsEmptyNext], [UI.liveNotActive, UI.liveUnavailable], [UI.overviewNoData, UI.overviewEmptyNext]]) {
      expect(title.length).toBeGreaterThan(10)
      expect(next.length).toBeGreaterThan(20)
    }
    expect(UI.objectivesEmpty).toBe('אין עדיין יעדים לשיעור הזה.')
  })
})

describe('טקסטי הגרפים של "במבט אחד"', () => {
  it('מצבי הריק אומרים מה קורה ומה יקרה (עיקרון 9)', () => {
    for (const [title, next] of [
      [DONUT_TEXT.completionEmpty, DONUT_TEXT.completionEmptyNext],
      [DONUT_TEXT.successEmpty, DONUT_TEXT.successEmptyNext],
      [DONUT_TEXT.successNoChallenges, DONUT_TEXT.successNoChallengesNext],
      [DONUT_TEXT.emptyDefault, DONUT_TEXT.emptyDefaultNext],
    ]) {
      expect(title.length).toBeGreaterThan(10)
      expect(next.length).toBeGreaterThan(20)
    }
    expect(DONUT_TEXT.successEmptyNext).toContain('2')
  })
  it('שורת המקרא: "X מתוך Y" קודם ואחוז בנוסף; אפס → "אף אחד"', () => {
    expect(donutLegendCount(14, 25, 56)).toBe(`${countNb(14, 25)} (56%)`)
    expect(donutLegendCount(0, 25, 0)).toBe('אף אחד')
  })
  it('תיאור לקוראי מסך: כל הספירות במילים, כולל אפס', () => {
    expect(donutAriaLabel(DONUT_TEXT.completionTitle, [{ label: 'סיימו', count: 14 }, { label: 'באמצע', count: 6 }, { label: 'עוד לא התחילו', count: 5 }], 25))
      .toBe(`מי סיים את השיעור? ${countNb(14, 25)} סיימו, ${countNb(6, 25)} באמצע, ${countNb(5, 25)} עוד לא התחילו`)
    expect(donutAriaLabel('כותרת', [{ label: 'במעט', count: 0 }], 3)).toContain(countNb(0, 3))
  })
})

describe('narrateSubmissionsSummary — משפט מעל רשימת השליחות', () => {
  it('"5 שיעורים נשלחו; ב-4 מהם יש תלמידים לתשומת לב."', () => {
    expect(narrateSubmissionsSummary(5, 4)).toBe('5 שיעורים נשלחו; ב-4 מהם יש תלמידים לתשומת לב.')
  })
  it('כולם / אחד / אף אחד / שליחה בודדת', () => {
    expect(narrateSubmissionsSummary(3, 3)).toBe('3 שיעורים נשלחו; בכולם יש תלמידים לתשומת לב.')
    expect(narrateSubmissionsSummary(5, 1)).toBe('5 שיעורים נשלחו; באחד מהם יש תלמידים לתשומת לב.')
    expect(narrateSubmissionsSummary(4, 0)).toBe('4 שיעורים נשלחו; אין בהם תלמידים לתשומת לב.')
    expect(narrateSubmissionsSummary(1, 1)).toBe('שיעור אחד נשלח; יש בו תלמידים לתשומת לב.')
    expect(narrateSubmissionsSummary(1, 0)).toBe('שיעור אחד נשלח; אין בו תלמידים לתשומת לב.')
  })
  it('אין שליחות → ריק; ספירה גדולה מהסך נחתכת לסך', () => {
    expect(narrateSubmissionsSummary(0, 0)).toBe('')
    expect(narrateSubmissionsSummary(2, 9)).toBe('2 שיעורים נשלחו; בכולם יש תלמידים לתשומת לב.')
  })
})

describe('groupByWeek — רשימה לפי שבועות', () => {
  const NOW = Date.parse('2026-10-28T10:00:00Z') /* רביעי; השבוע התחיל ב-25.10 */
  const st = (id: string, sentAt: string, state?: SubmissionRow['state']): SubmissionRow => ({ ...row(id, id, sentAt), ...(state ? { state } : {}) })
  const rows = [
    st('old', '2026-09-15T08:00:00Z'),
    st('last1', '2026-10-20T08:00:00Z'),
    st('this1', '2026-10-25T05:00:00Z'),
    st('live-last', '2026-10-19T08:00:00Z', 'active_now'),
    st('this2', '2026-10-27T08:00:00Z'),
    st('last2', '2026-10-18T05:00:00Z'),
  ]
  it('פעיל עכשיו לבד בראש (גם אם נשלח בשבוע שעבר); אחריו השבוע · שבוע שעבר · מוקדם יותר, החדש קודם בכל קבוצה', () => {
    const g = groupByWeek(rows, NOW)
    expect(g.map((x) => x.key)).toEqual(['active', 'this', 'last', 'earlier'])
    expect(g.map((x) => x.rows.map((r) => r.id))).toEqual([['live-last'], ['this2', 'this1'], ['last1', 'last2'], ['old']])
  })
  it('קבוצה ריקה לא מופיעה; אין שליחות → אין קבוצות', () => {
    expect(groupByWeek([st('a', '2026-10-27T08:00:00Z')], NOW).map((x) => x.key)).toEqual(['this'])
    expect(groupByWeek([], NOW)).toEqual([])
  })
  it('גבול השבוע לפי שעון ישראל: שבת בערב עדיין בשבוע שעבר, ראשון בבוקר כבר השבוע', () => {
    const g = groupByWeek([st('sat', '2026-10-24T18:00:00Z'), st('sun', '2026-10-24T22:30:00Z')], NOW)
    expect(g.map((x) => [x.key, x.rows.map((r) => r.id)])).toEqual([['this', ['sun']], ['last', ['sat']]])
  })
})
