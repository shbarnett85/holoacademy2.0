import { describe, expect, it } from 'vitest'
import { ATTENTION_RULE, COMMON_ERROR_MIN_STUDENTS } from '../../../../src/shared/lib/analyticsConfig.js'
import { howWeCalcResultsLines } from '../../../../src/shared/lib/findingsNarrative.js'
import { ClassSubmissionViewSchema, StudentSubmissionViewSchema, SubmissionRowSchema } from '../../../../src/shared/types/resultsV1.js'
import {
  analyzeSubmission, buildClassView, buildListRow, buildStudentView, extractChallenges, questThumbUrl, subjectOfCode,
  type CoreAnswerRow, type CoreEventRow, type CoreInput, type CoreOptionTag, type CoreSession, type CoreStudent,
} from './core.js'

/* ── fixture: הדמיה עם MC (מסיח מתויג), נכון/לא-נכון, זיכרון, מבחן סיכום (3 שאלות) ודילמה ── */
const QUEST_ID = 'q1'
const GAME = {
  entrySceneId: 's0',
  objectives: [] as { id: string; text: string }[],
  scenes: [
    { id: 's0', title: 'פתיחה', narrative: 'מילה אחת שתיים שלוש ארבע', imageUrl: 'https://img/0.png', nextSceneId: 's1' },
    { id: 's1', title: 'שאלת המים', narrative: 'a b c', puzzle: { type: 'multipleChoice', question: 'מה מצב הצבירה של קרח?', choices: [
      { id: 'a', text: 'מוצק', isCorrect: true }, { id: 'b', text: 'נוזל', isCorrect: false }, { id: 'c', text: 'גז', isCorrect: false },
    ] } },
    { id: 's2', title: 'נכון או לא', puzzle: { type: 'trueFalse', question: 'מים רותחים ב-100 מעלות', choices: [
      { id: 't', text: 'נכון', isCorrect: true }, { id: 'f', text: 'לא נכון', isCorrect: false },
    ] } },
    { id: 's3', title: 'זיכרון', puzzle: { type: 'memory', question: 'התאימו זוגות' } },
    { id: 's4', title: 'מבחן סיכום', puzzle: { type: 'finalQuiz', question: 'סיכום', questions: [
      { question: 'שאלה ראשונה', options: ['א', 'ב', 'ג'], correctIndex: 0 },
      { question: 'שאלה שנייה', options: ['ד', 'ה', 'ו'], correctIndex: 2 },
      { question: 'שאלה שלישית', options: ['ז', 'ח', 'ט'], correctIndex: 1 },
    ] } },
    { id: 's5', title: 'דילמה', puzzle: { type: 'moralDilemma', question: 'מה תעשו?', situation: 'מצאתם ארנק', moralChoices: [{ text: 'להחזיר' }, { text: 'לשמור' }] } },
  ],
}

const SENT = '2026-10-10T08:00:00.000Z'
const names = ['אבי כהן', 'בני לוי', 'גלית ברק', 'דנה רז', 'הדס שמש', 'ויקטור נחום']
const stu = (i: number): CoreStudent => ({ id: `st${i}`, name: names[i] })
const STUDENTS = names.map((_, i) => stu(i))

const sess = (i: number, done: boolean, startedAt = '2026-10-11T08:00:00Z'): CoreSession =>
  ({ id: `se${i}`, studentId: `st${i}`, startedAt, completedAt: done ? '2026-10-11T08:20:00Z' : null })
const ans = (i: number, scene: string, item: number, opt: string | null, outcome: CoreAnswerRow['outcome'], o: Partial<CoreAnswerRow> = {}): CoreAnswerRow => ({
  sessionId: `se${i}`, sceneId: scene, itemIndex: item, puzzleType: 'multipleChoice', selectedOptionId: opt,
  isCorrect: outcome === 'correct', attemptNo: 1, responseMs: 5000, outcome, ...o,
})
const pev = (i: number, scene: string, solved: boolean, p: Record<string, unknown> = {}): CoreEventRow =>
  ({ sessionId: `se${i}`, type: solved ? 'puzzle_solved' : 'puzzle_failed', sceneId: scene, payload: { attempts: 1, solveTimeMs: 7000, ...p } })
const enter = (i: number, scene: string, p: Record<string, unknown>): CoreEventRow => ({ sessionId: `se${i}`, type: 'scene_enter', sceneId: scene, payload: p })

const TAG: CoreOptionTag = {
  sceneId: 's1', itemIndex: 0, optionId: 'b', misconceptionId: 'm-solid', title: 'בלבול בין מוצק לנוזל', description: 'תיאור הטעות',
  linkedQuest: { questId: 'q-fix', title: 'הדמיית חיזוק' },
}

function input(over: Partial<CoreInput> = {}): CoreInput {
  return {
    submission: {
      id: 'sub1', classId: 'c1', className: 'ו׳2', sentAt: SENT, source: 'mine', senderName: null,
      quest: { id: QUEST_ID, title: 'מסע טיפת המים', subject: subjectOfCode('science'), gameData: GAME, thumbUrl: questThumbUrl(GAME) },
    },
    students: STUDENTS, sessions: [], answers: [], events: [], optionTags: [], detailAvailableFrom: null, ...over,
  }
}

/* תלמיד שפתר הכול (פירוט מלא) */
const perfect = (i: number): { answers: CoreAnswerRow[]; events: CoreEventRow[] } => ({
  answers: [
    ans(i, 's1', 0, 'a', 'correct'), ans(i, 's2', 0, 't', 'correct', { puzzleType: 'trueFalse' }),
    ans(i, 's3', 0, null, 'correct', { puzzleType: 'memory', attemptNo: 3, responseMs: 40000 }),
    ans(i, 's4', 0, 'o0', 'correct', { puzzleType: 'finalQuiz' }), ans(i, 's4', 1, 'o2', 'correct', { puzzleType: 'finalQuiz' }), ans(i, 's4', 2, 'o1', 'correct', { puzzleType: 'finalQuiz' }),
  ],
  events: ['s1', 's2', 's3', 's4', 's5'].map((s) => pev(i, s, true)),
})

describe('extractChallenges', () => {
  it('אתגרים = סצנות עם puzzle, לפי הסדר; תוויות עבריות; פריטי מבחן סיכום', () => {
    const ch = extractChallenges(GAME)
    expect(ch.map((c) => c.sceneId)).toEqual(['s1', 's2', 's3', 's4', 's5'])
    expect(ch.map((c) => c.order)).toEqual([1, 2, 3, 4, 5])
    expect(ch[0].typeLabel).toBe('שאלות בחירה מרובה')
    expect(ch[3].items).toHaveLength(3)
    expect(ch[3].items[1].options?.map((o) => o.id)).toEqual(['o0', 'o1', 'o2'])
    expect(ch[3].items[1].options?.find((o) => o.isCorrect)?.text).toBe('ו')
    expect(ch[2].items[0].options).toBeNull()
    expect(extractChallenges(null)).toEqual([])
    expect(questThumbUrl(GAME)).toBe('https://img/0.png')
  })
})

describe('מספרים וסיכום: "X מתוך Y"', () => {
  const p = [perfect(0), perfect(1), perfect(2)]
  const base = input({
    sessions: [sess(0, true), sess(1, true), sess(2, true), sess(3, false)],
    answers: p.flatMap((x) => x.answers), events: p.flatMap((x) => x.events),
  })

  it('ספירות: סיימו / באמצע / לא התחילו, ושורת הרשימה עומדת בחוזה', () => {
    const row = buildListRow(base)
    expect(row.counts).toEqual({ total: 6, completed: 3, inProgress: 1, notStarted: 2 })
    expect(SubmissionRowSchema.safeParse(row).success).toBe(true)
    expect(row.summary.length).toBeGreaterThan(0)
    expect(row.source).toBe('mine')
    expect(row.subject).toEqual({ code: 'science', nameHe: 'מדעים' })
  })

  it('משפט הסיכום הכיתתי מכיל "3 מתוך 6 סיימו עד עכשיו"', () => {
    const v = buildClassView(base)
    expect(v.summary).toContain('3 מתוך 6 סיימו עד עכשיו')
    expect(ClassSubmissionViewSchema.safeParse(v).success).toBe(true)
  })

  it('רוסטר: מחולק לפי סטטוס, ממוין לפי א-ב', () => {
    const v = buildClassView(base)
    expect(v.roster.completed.map((c) => c.name)).toEqual(['אבי כהן', 'בני לוי', 'גלית ברק'])
    expect(v.roster.inProgress.map((c) => c.name)).toEqual(['דנה רז'])
    expect(v.roster.notStarted.map((c) => c.name)).toEqual(['הדס שמש', 'ויקטור נחום'])
  })

  it('אתגרים: "ניסו" ו"הצליחו" לפי הסדר; מבחן סיכום — פריט לכל שאלה', () => {
    const v = buildClassView(base)
    expect(v.challenges.map((c) => [c.order, c.attempted, c.solved])).toEqual([[1, 3, 3], [2, 3, 3], [3, 3, 3], [4, 3, 3], [5, 3, 3]])
    const quiz = v.challenges[3]
    expect(quiz.items.map((i) => [i.itemIndex, i.attempted, i.solved])).toEqual([[0, 3, 3], [1, 3, 3], [2, 3, 3]])
    expect(quiz.items[0].prompt).toBe('שאלה ראשונה')
  })
})

describe('תשומת לב — ATTENTION_RULE בלבד', () => {
  it('לא התחיל / ויתר על ≥2 אתגרים שונים / סיים והצליח בפחות מחצי', () => {
    expect(ATTENTION_RULE.gaveUpAtLeast).toBe(2)
    const a1 = [ans(1, 's1', 0, null, 'gave_up'), ans(1, 's2', 0, null, 'closed', { puzzleType: 'trueFalse' }), ans(1, 's3', 0, null, 'correct', { puzzleType: 'memory' })]
    const a2 = [ans(2, 's1', 0, 'b', 'wrong'), ans(2, 's2', 0, 'f', 'wrong', { puzzleType: 'trueFalse' }), ans(2, 's3', 0, null, 'wrong', { puzzleType: 'memory' }),
      ans(2, 's4', 0, 'o1', 'wrong', { puzzleType: 'finalQuiz' }), ans(2, 's4', 1, 'o0', 'wrong', { puzzleType: 'finalQuiz' }), ans(2, 's4', 2, 'o0', 'wrong', { puzzleType: 'finalQuiz' })]
    /* תלמיד 3: ויתר על אתגר אחד בלבד — לא מספיק */
    const a3 = [ans(3, 's1', 0, null, 'gave_up'), ans(3, 's2', 0, 't', 'correct', { puzzleType: 'trueFalse' })]
    const v = buildClassView(input({
      sessions: [sess(0, true), sess(1, true), sess(2, true), sess(3, true)],
      answers: [...perfect(0).answers, ...a1, ...a2, ...a3],
      events: [...perfect(0).events, ...['s1', 's2', 's3'].map((s) => pev(1, s, s === 's3')), ...['s1', 's2', 's3', 's4'].map((s) => pev(2, s, false)), pev(3, 's1', false), pev(3, 's2', true)],
    }))
    const chip = (name: string) => [...v.roster.completed, ...v.roster.inProgress, ...v.roster.notStarted].find((c) => c.name === name)!
    expect(chip('אבי כהן').attention).toBe(false)
    expect(chip('בני לוי').attentionReasons).toContain('gave_up_often')
    expect(chip('גלית ברק').attentionReasons).toContain('low_success')
    expect(chip('דנה רז').attentionReasons).not.toContain('gave_up_often')
    expect(chip('הדס שמש').attentionReasons).toEqual(['not_started'])
    const row = buildListRow(input({
      sessions: [sess(0, true), sess(1, true)], answers: [...perfect(0).answers, ...a1],
      events: [...perfect(0).events, ...['s1', 's2', 's3'].map((s) => pev(1, s, s === 's3'))],
    }))
    /* בני (ויתור) + 4 שלא התחילו */
    expect(row.attentionCount).toBe(5)
  })

  it('"ויתר" נספר רק כשיש שורות answers (בלי פירוט אי אפשר להבדיל מטעות)', () => {
    const v = buildClassView(input({
      sessions: [sess(0, true)], answers: [],
      events: ['s1', 's2', 's3', 's4', 's5'].map((s) => pev(0, s, false)),
    }))
    expect(v.roster.completed[0].attentionReasons).toEqual(['low_success'])
    expect(v.challenges[0].gaveUp).toBe(0)
  })
})

describe('טעויות נפוצות — מתגיות בלבד', () => {
  const rows = (picks: string[]): CoreInput => input({
    sessions: picks.map((_, i) => sess(i, true)),
    answers: picks.map((o, i) => ans(i, 's1', 0, o, o === 'a' ? 'correct' : 'wrong')),
    events: picks.map((o, i) => pev(i, 's1', o === 'a')),
    optionTags: [TAG],
  })

  it(`לפחות ${COMMON_ERROR_MIN_STUDENTS} תלמידים בחרו במסיח המתויג → שורה בטעויות נפוצות + commonError באתגר`, () => {
    const v = buildClassView(rows(['b', 'b', 'a', 'c']))
    expect(v.commonErrors).toHaveLength(1)
    expect(v.commonErrors[0]).toMatchObject({ id: 'm-solid', title: 'בלבול בין מוצק לנוזל', studentsCount: 2, studentsExposed: 4, linkedQuest: { questId: 'q-fix', title: 'הדמיית חיזוק' } })
    const ch = v.challenges[0]
    expect(ch.commonError).toEqual({ title: 'בלבול בין מוצק לנוזל', count: 2, optionText: 'נוזל' })
    const optB = ch.items[0].options!.find((o) => o.optionId === 'b')!
    expect(optB).toMatchObject({ count: 2, isCorrect: false, errorTag: { id: 'm-solid', title: 'בלבול בין מוצק לנוזל' } })
    expect(optB.students.map((s) => s.name)).toEqual(['אבי כהן', 'בני לוי'])
    expect(ch.items[0].options!.find((o) => o.optionId === 'c')!.errorTag).toBeNull()
    expect(ClassSubmissionViewSchema.safeParse(v).success).toBe(true)
  })

  it('בחירה במסיח לא מתויג, או תלמיד אחד בלבד במתויג — אין טעות נפוצה', () => {
    expect(buildClassView(rows(['c', 'c', 'c', 'a'])).commonErrors).toEqual([])
    const one = buildClassView(rows(['b', 'a', 'c']))
    expect(one.commonErrors).toEqual([])
    expect(one.challenges[0].commonError).toBeNull()
  })

  it('בלי תגיות בכלל → commonErrors ריק ו-commonError אפס', () => {
    const v = buildClassView({ ...rows(['b', 'b', 'b']), optionTags: [] })
    expect(v.commonErrors).toEqual([])
    expect(v.challenges[0].commonError).toBeNull()
    expect(v.challenges[0].items[0].options!.every((o) => o.errorTag === null)).toBe(true)
  })

  it('משפט הסיכום מזכיר את המסיח השגוי הנבחר ביותר ("רובם בחרו")', () => {
    const v = buildClassView(rows(['b', 'b', 'b', 'a']))
    expect(v.summary).toContain('האתגר הקשה ביותר: שאלת המים. 3 מתוך 4 טעו')
    expect(v.summary).toContain('רובם בחרו נוזל')
  })
})

describe('הדמיות ישנות (לפני לכידת התשובות): fallback ל-events', () => {
  const old = input({
    sessions: [sess(0, true), sess(1, true)],
    events: [...['s1', 's2', 's3', 's4', 's5'].map((s) => pev(0, s, true)), ...['s1', 's2', 's3', 's4', 's5'].map((s) => pev(1, s, s === 's1', { solveTimeMs: 12000 }))],
    detailAvailableFrom: '2026-10-15T00:00:00Z',
  })

  it('options=null, hasAnswerDetail=false ו-detailAvailableFrom מועבר', () => {
    const v = buildClassView(old)
    expect(v.hasAnswerDetail).toBe(false)
    expect(v.detailAvailableFrom).toBe('2026-10-15T00:00:00Z')
    expect(v.challenges[0]).toMatchObject({ attempted: 2, solved: 2, gaveUp: 0 })
    expect(v.challenges[1]).toMatchObject({ attempted: 2, solved: 1 })
    expect(v.challenges.every((c) => c.items.every((i) => i.options === null))).toBe(true)
    /* מבחן סיכום בלי פירוט שאלות: אין פריטים (ולא "0 מתוך 0" פר-שאלה) */
    expect(v.challenges.find((c) => c.type === 'finalQuiz')).toMatchObject({ attempted: 2, items: [] })
    expect(ClassSubmissionViewSchema.safeParse(v).success).toBe(true)
  })

  it('שליחה שנשלחה אחרי תחילת הלכידה, בלי תשובות עדיין: יש פירוט (אין מה להסתיר)', () => {
    const v = buildClassView({ ...old, detailAvailableFrom: '2026-10-01T00:00:00Z', events: [], sessions: [] })
    expect(v.hasAnswerDetail).toBe(true)
    expect(v.detailAvailableFrom).toBeNull()
  })

  it('אין לכידה בכלל במערכת (null): hasAnswerDetail=false ו-detailAvailableFrom=null', () => {
    const v = buildClassView({ ...old, detailAvailableFrom: null })
    expect(v.hasAnswerDetail).toBe(false)
    expect(v.detailAvailableFrom).toBeNull()
  })

  it('תלמיד: תשובה/נכון=null, זמן מ-solveTimeMs, ללא דילוג על אתגר', () => {
    const sv = buildStudentView(old, 'st1')!
    const c1 = sv.challenges[0]
    expect(c1).toMatchObject({ outcome: 'correct', attempts: 1, seconds: 12 })
    expect(c1.items[0]).toMatchObject({ answerText: null, correctText: null, isCorrect: true })
    expect(sv.challenges[1].outcome).toBe('wrong')
    expect(sv.hasAnswerDetail).toBe(false)
    expect(StudentSubmissionViewSchema.safeParse(sv).success).toBe(true)
  })
})

describe('מבחן סיכום, פתרון טקסט האפשרויות, ודילמה', () => {
  const data = input({
    sessions: [sess(0, true), sess(1, true)],
    answers: [
      ans(0, 's1', 0, 'b', 'wrong'),
      ans(0, 's4', 0, 'o0', 'correct', { puzzleType: 'finalQuiz' }), ans(0, 's4', 1, 'o1', 'wrong', { puzzleType: 'finalQuiz', responseMs: 8000 }), ans(0, 's4', 2, 'o1', 'correct', { puzzleType: 'finalQuiz' }),
      ans(1, 's4', 0, 'o1', 'wrong', { puzzleType: 'finalQuiz' }), ans(1, 's4', 1, 'o2', 'correct', { puzzleType: 'finalQuiz' }), ans(1, 's4', 2, 'o0', 'wrong', { puzzleType: 'finalQuiz' }),
    ],
    events: [pev(0, 's1', false), pev(0, 's4', true), pev(0, 's5', true), pev(1, 's4', false), pev(1, 's5', true)],
    moral: [{ sceneId: 's5', optionId: 'm0' }, { sceneId: 's5', optionId: 'm0' }, { sceneId: 's5', optionId: 'm1' }],
    optionTags: [{ ...TAG, sceneId: 's4', itemIndex: 0, optionId: 'o1', misconceptionId: 'm-quiz', title: 'טעות במבחן' }],
  })

  it('התפלגות לפי שאלה, מזהה אפשרות o<אינדקס> מתורגם לטקסט, ותגית פר-אפשרות', () => {
    const v = buildClassView(data)
    const quiz = v.challenges.find((c) => c.type === 'finalQuiz')!
    expect(quiz).toMatchObject({ attempted: 2, solved: 1 })
    const q2 = quiz.items[1].options!
    expect(q2.map((o) => [o.optionId, o.text, o.count])).toEqual([['o0', 'ד', 0], ['o1', 'ה', 1], ['o2', 'ו', 1]])
    expect(q2.find((o) => o.isCorrect)!.text).toBe('ו')
    expect(quiz.items[0].options![1]).toMatchObject({ count: 1, errorTag: { id: 'm-quiz' } })
    /* רק תלמיד אחד בחר במסיח המתויג — מתחת לסף */
    expect(quiz.commonError).toBeNull()
  })

  it('תלמיד: answerText/correctText נפתרים מ-o<idx> ומ-choice id', () => {
    const sv = buildStudentView(data, 'st0')!
    const mc = sv.challenges[0].items[0]
    expect(mc).toMatchObject({ answerText: 'נוזל', correctText: 'מוצק', isCorrect: false })
    const quiz = sv.challenges.find((c) => c.type === 'finalQuiz')!
    expect(quiz.items.map((i) => [i.answerText, i.correctText, i.isCorrect])).toEqual([['א', 'א', true], ['ה', 'ו', false], ['ח', 'ח', true]])
    expect(quiz.items[1].seconds).toBe(8)
    expect(quiz.items[0].errorTag).toBeNull()
    expect(sv.hasAnswerDetail).toBe(true)
  })

  it('תגית על האפשרות שנבחרה מופיעה בתלמיד', () => {
    const sv = buildStudentView(data, 'st1')!
    const quiz = sv.challenges.find((c) => c.type === 'finalQuiz')!
    expect(quiz.items[0].errorTag).toEqual({ id: 'm-quiz', title: 'טעות במבחן' })
  })

  it('דילמה מוסרית: נפתר = ניסה; התפלגות ללא שמות', () => {
    const v = buildClassView(data)
    const m = v.challenges.find((c) => c.type === 'moralDilemma')!
    expect(m).toMatchObject({ attempted: 2, solved: 2, gaveUp: 0 })
    expect(m.items[0].options!.map((o) => [o.text, o.count, o.isCorrect])).toEqual([['להחזיר', 2, false], ['לשמור', 1, false]])
    expect(m.items[0].options!.every((o) => o.students.length === 0)).toBe(true)
    const sv = buildStudentView(data, 'st0')!
    const ms = sv.challenges.find((c) => c.type === 'moralDilemma')!
    expect(ms.outcome).toBe('correct')
    expect(ms.items[0]).toMatchObject({ answerText: null, correctText: null, isCorrect: null })
  })

  it('אתגרים שהתלמיד לא הגיע אליהם: not_reached וללא פריטים', () => {
    const sv = buildStudentView(data, 'st1')!
    expect(sv.challenges.find((c) => c.sceneId === 's2')).toMatchObject({ outcome: 'not_reached', attempts: 0, seconds: null, items: [] })
  })
})

describe('הצגות חוזרות והכרעה', () => {
  it('נסגר ואז נענה נכון: נספר כהצלחה; נסגר בלבד: ויתור; ספירה לפי ההצגה האחרונה שנענתה', () => {
    const v = buildClassView(input({
      sessions: [sess(0, true), sess(1, true)],
      answers: [
        ans(0, 's1', 0, null, 'closed', { seq: 1 }), ans(0, 's1', 0, 'a', 'correct', { seq: 2 }),
        ans(1, 's1', 0, null, 'closed', { seq: 1 }), ans(1, 's1', 0, 'c', 'wrong', { seq: 2 }), ans(1, 's2', 0, null, 'closed', { puzzleType: 'trueFalse' }),
      ],
      events: [pev(0, 's1', true), pev(1, 's1', false)],
    }))
    expect(v.challenges[0]).toMatchObject({ attempted: 2, solved: 1, gaveUp: 0 })
    expect(v.challenges[1]).toMatchObject({ attempted: 1, solved: 0, gaveUp: 1 })
    expect(v.challenges[1].gaveUpStudents.map((s) => s.name)).toEqual(['בני לוי'])
  })
})

describe('session אחרון לכל תלמיד', () => {
  it('שני sessions: נספר המאוחר (גם אם הקודם הושלם והמאוחר באמצע)', () => {
    const v = buildClassView(input({
      sessions: [{ ...sess(0, true, '2026-10-11T08:00:00Z'), id: 'old' }, { ...sess(0, false, '2026-10-12T08:00:00Z'), id: 'new' }],
      events: [{ sessionId: 'old', type: 'puzzle_solved', sceneId: 's1', payload: {} }],
    }))
    expect(v.head.counts).toMatchObject({ completed: 0, inProgress: 1 })
    expect(v.challenges[0].attempted).toBe(0)
  })
})

describe('תלמיד: רשימה א-ב, הקודם/הבא, סיכום ושקפים', () => {
  const data = input({
    sessions: [sess(0, true), sess(1, true), sess(2, false)],
    answers: [...perfect(0).answers, ...perfect(1).answers], events: [
      ...perfect(0).events, ...perfect(1).events,
      enter(0, 's0', { dwellMs: 20000, word_count: 110, closed_dwell_ms: 4000 }),
      enter(0, 's1', { dwellMs: 9000 }),
      enter(1, 's0', { dwellMs: 3000 }),
    ],
  })

  it('סדר א-ב (עברית) וקודם/הבא', () => {
    const mid = buildStudentView(data, 'st2')!
    expect(mid.roster.map((c) => c.name)).toEqual(names.slice().sort((a, b) => a.localeCompare(b, 'he')))
    expect([mid.prevId, mid.nextId]).toEqual(['st1', 'st3'])
    expect(buildStudentView(data, 'st0')!.prevId).toBeNull()
    expect(buildStudentView(data, 'st5')!.nextId).toBeNull()
    expect(buildStudentView(data, 'nope')).toBeNull()
  })

  it('סיכום תלמיד מ-findingsNarrative: סיים / באמצע / לא התחיל', () => {
    expect(buildStudentView(data, 'st0')!.summary).toBe('אבי פתר/ה 5 מתוך 5 אתגרים.')
    expect(buildStudentView(data, 'st2')!.summary).toContain('באמצע ההדמיה')
    expect(buildStudentView(data, 'st4')!.summary).toContain('עוד לא התחיל/ה')
  })

  it('עובדות קריאה: closed_dwell_ms עדיף על dwellMs; מילים מה-payload, אחרת מהסצנה', () => {
    const sv = buildStudentView(data, 'st0')!
    expect(sv.slides).toEqual([
      { order: 1, title: 'פתיחה', words: 110, seconds: 4 },
      { order: 2, title: 'שאלת המים', words: 3, seconds: 9 },
    ])
    expect(buildStudentView(data, 'st1')!.slides).toEqual([{ order: 1, title: 'פתיחה', words: 5, seconds: 3 }])
    expect(buildStudentView(data, 'st4')!.slides).toEqual([])
  })

  it('איך חישבנו: השורות מ-findingsNarrative', () => {
    expect(buildStudentView(data, 'st0')!.howWeCalculated).toEqual(howWeCalcResultsLines())
    expect(buildClassView(data).howWeCalculated).toEqual(howWeCalcResultsLines())
  })

  it('פירוט במבט תלמיד שסיים: לפי השורות שלו; מי שלא סיים — יורש את מצב השליחה', () => {
    const mixed = { ...data, detailAvailableFrom: '2026-10-09T00:00:00Z', answers: perfect(0).answers }
    expect(buildStudentView(mixed, 'st0')!.hasAnswerDetail).toBe(true)
    const noRows = buildStudentView(mixed, 'st1')!
    expect(noRows.hasAnswerDetail).toBe(false)
    expect(noRows.detailAvailableFrom).toBe('2026-10-09T00:00:00Z')
    expect(buildStudentView(mixed, 'st4')!.hasAnswerDetail).toBe(true)
  })
})

describe('אין תוצאות עדיין', () => {
  it('אף אחד לא התחיל / יש באמצע — משפט שמסביר מה יקרה', () => {
    const none = buildClassView(input())
    expect(none.summary).toContain('התוצאות יופיעו כאן כשתלמידים יסיימו')
    expect(none.summary).toContain('עוד אף תלמיד לא התחיל')
    expect(none.head.counts).toEqual({ total: 6, completed: 0, inProgress: 0, notStarted: 6 })
    expect(none.challenges.every((c) => c.attempted === 0)).toBe(true)
    expect(none.review.weakCount).toBe(0)
    const mid = buildClassView(input({ sessions: [sess(0, false), sess(1, false)] }))
    expect(mid.summary).toContain('2 תלמידים באמצע')
    expect(buildListRow(input()).summary).toContain('עוד לא התחילו')
    expect(ClassSubmissionViewSchema.safeParse(none).success).toBe(true)
  })

  it('כיתה בלי תלמידים — לא קורס', () => {
    const v = buildClassView(input({ students: [] }))
    expect(v.head.counts.total).toBe(0)
    expect(v.roster.completed).toEqual([])
  })
})

describe('הצעה לחזרה (weakCount)', () => {
  it('אתגר שפחות מ-60% הצליחו בו (≥2 ניסו) נספר כתחום חלש', () => {
    const wrongOnS1 = [0, 1, 2].map((i) => pev(i, 's1', false))
    const v = buildClassView(input({ sessions: [sess(0, true), sess(1, true), sess(2, true)], events: wrongOnS1 }))
    expect(v.review.weakCount).toBe(1)
  })
  it('עם יעדי למידה: מקבצים לפי היעד', () => {
    const game = JSON.parse(JSON.stringify(GAME))
    game.objectives = [{ id: 'obj_1', text: 'יעד' }]
    game.scenes[1].puzzle.objectiveId = 'obj_1'
    game.scenes[2].puzzle.objectiveId = 'obj_1'
    const base = input()
    const v = buildClassView({
      ...base, submission: { ...base.submission, quest: { ...base.submission.quest, gameData: game } },
      sessions: [sess(0, true), sess(1, true)],
      events: [pev(0, 's1', false), pev(1, 's1', false), pev(0, 's2', true), pev(1, 's2', true)],
    })
    /* 2 הצליחו מתוך 4 = 50% < 60% → יעד אחד חלש (ולא שני אתגרים) */
    expect(v.review.weakCount).toBe(1)
  })
})

describe('טהרות', () => {
  it('analyzeSubmission דטרמיניסטי ולא משנה את הקלט', () => {
    const data = input({ sessions: [sess(0, true)], answers: perfect(0).answers, events: perfect(0).events })
    const snap = JSON.stringify(data)
    const a = JSON.stringify(buildClassView(data))
    expect(JSON.stringify(buildClassView(data))).toBe(a)
    expect(JSON.stringify(data)).toBe(snap)
    expect(analyzeSubmission(data).challenges).toHaveLength(5)
  })
})
