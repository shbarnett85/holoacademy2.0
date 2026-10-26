import { describe, expect, it } from 'vitest'
import { ATTENTION_RULE, COMMON_ERROR_MIN_STUDENTS, OBJECTIVE_BANDS } from '../../../../src/shared/lib/analyticsConfig.js'
import { countNb, howWeCalcObjectivesLines, howWeCalcResultsLines, howWeCalcSuccessBandsLines, OBJECTIVE_LEVEL_TEXT, OBJECTIVE_NO_DATA_TEXT } from '../../../../src/shared/lib/findingsNarrative.js'
import { ClassSubmissionViewSchema, StudentSubmissionViewSchema, SubmissionRowSchema } from '../../../../src/shared/types/resultsV1.js'
import {
  analyzeSubmission, buildClassView, buildListRow, buildStudentView, extractChallenges, questObjectives, questThumbUrl, subjectOfCode,
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
  linkedQuest: { questId: 'q-fix', title: 'שיעור חיזוק' },
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

  it('משפט הסיכום הכיתתי אומר "עד עכשיו סיימו 3 מתוך 6" (רווחים צמודים) ומדבר רק על מי שסיימו', () => {
    const v = buildClassView(base)
    expect(v.summary).toContain(`עד עכשיו סיימו ${countNb(3, 6)}.`)
    expect(v.summary).toContain('רובם הצליחו')
    expect(v.summary).not.toContain('רוב הכיתה')
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
    expect(v.commonErrors[0]).toMatchObject({ id: 'm-solid', title: 'בלבול בין מוצק לנוזל', studentsCount: 2, studentsExposed: 4, linkedQuest: { questId: 'q-fix', title: 'שיעור חיזוק' } })
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

  it('משפט הסיכום מזכיר את המסיח השגוי הנבחר ביותר, במרכאות ("ורובם בחרו ב״…״")', () => {
    const v = buildClassView(rows(['b', 'b', 'b', 'a']))
    expect(v.summary).toContain(`האתגר הקשה ביותר: שאלת המים. ${countNb(3, 4)} לא הצליחו`)
    expect(v.summary).toContain('ורובם בחרו ב״נוזל״')
  })
})

describe('שיעורים ישנים (לפני לכידת התשובות): fallback ל-events', () => {
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

  it('דילמה מוסרית: נפתר = ניסה; התפלגות ללא שמות — ורק כשיש מספיק שורות ותלמידים שסיימו', () => {
    /* שלוש בחירות ושני תלמידים שסיימו: מתחת לסף — אין התפלגות (אחרת אפשר לזהות מי בחר מה) */
    const small = buildClassView(data).challenges.find((c) => c.type === 'moralDilemma')!
    expect(small).toMatchObject({ attempted: 2, solved: 2, gaveUp: 0 })
    expect(small.items[0].options).toBeNull()
    /* חמישה תלמידים שסיימו וחמש בחירות: מוצגת ההתפלגות, בלי שמות */
    const five = [0, 1, 2, 3, 4]
    const big = buildClassView(input({
      sessions: five.map((i) => sess(i, true)), events: five.map((i) => pev(i, 's5', true)),
      moral: [...Array(3).fill({ sceneId: 's5', optionId: 'm0' }), ...Array(2).fill({ sceneId: 's5', optionId: 'm1' })],
    }))
    const m = big.challenges.find((c) => c.type === 'moralDilemma')!
    expect(m.items[0].options!.map((o) => [o.text, o.count, o.isCorrect])).toEqual([['להחזיר', 3, false], ['לשמור', 2, false]])
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

describe('ההרצה שנספרת לכל תלמיד', () => {
  it('הרצה חדשה שנפתחה (ריקה, עוד לא הסתיימה) אינה מוחקת הרצה שהושלמה: הסטטוס נשאר "סיים" והתוצאות מההרצה שהושלמה', () => {
    const v = buildClassView(input({
      sessions: [{ ...sess(0, true, '2026-10-11T08:00:00Z'), id: 'old' }, { ...sess(0, false, '2026-10-12T08:00:00Z'), id: 'new' }],
      events: [{ sessionId: 'old', type: 'puzzle_solved', sceneId: 's1', payload: {} }],
    }))
    expect(v.head.counts).toMatchObject({ completed: 1, inProgress: 0 })
    expect(v.challenges[0]).toMatchObject({ attempted: 1, solved: 1 })
    expect(v.roster.completed.map((c) => c.id)).toEqual(['st0'])
  })

  it('סדר ה-sessions בקלט לא משנה', () => {
    const a = { ...sess(0, true, '2026-10-11T08:00:00Z'), id: 'old' }
    const b = { ...sess(0, false, '2026-10-12T08:00:00Z'), id: 'new' }
    const ev: CoreEventRow[] = [{ sessionId: 'old', type: 'puzzle_solved', sceneId: 's1', payload: {} }]
    expect(buildClassView(input({ sessions: [b, a], events: ev })).head.counts).toEqual(buildClassView(input({ sessions: [a, b], events: ev })).head.counts)
  })

  it('שתי הרצות שהושלמו: המאוחרת; שתי הרצות פתוחות: המאוחרת ("באמצע")', () => {
    const done = (id: string, at: string): CoreSession => ({ ...sess(0, true, at), id })
    const open = (id: string, at: string): CoreSession => ({ ...sess(0, false, at), id })
    const evs: CoreEventRow[] = [
      { sessionId: 'd1', type: 'puzzle_failed', sceneId: 's1', payload: {} },
      { sessionId: 'd2', type: 'puzzle_solved', sceneId: 's1', payload: {} },
    ]
    const two = buildClassView(input({ sessions: [done('d1', '2026-10-11T08:00:00Z'), done('d2', '2026-10-12T08:00:00Z')], events: evs }))
    expect(two.challenges[0]).toMatchObject({ attempted: 1, solved: 1 })
    const opens = buildClassView(input({ sessions: [open('o1', '2026-10-11T08:00:00Z'), open('o2', '2026-10-12T08:00:00Z')] }))
    expect(opens.head.counts).toMatchObject({ completed: 0, inProgress: 1 })
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
    expect(buildStudentView(data, 'st0')!.summary).toBe(`אבי פתר/ה ${countNb(5, 5)} אתגרים.`)
    expect(buildStudentView(data, 'st2')!.summary).toContain('באמצע השיעור')
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
    /* מסך הכיתה מוסיף את הסבר שני הגרפים ("במבט אחד") אחרי ההסבר הכללי */
    expect(buildClassView(data).howWeCalculated).toEqual([...howWeCalcResultsLines(), ...howWeCalcSuccessBandsLines()])
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
    expect(none.summary).toContain('התוצאות יופיעו כאן כשיסיימו')
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

/* ══════════════════════════════════════════════════════════════════════════
   יעדי למידה
   ══════════════════════════════════════════════════════════════════════════ */
describe('יעדי למידה', () => {
  type R = 'c' | 'w'
  const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T
  const withGame = (game: unknown, over: Partial<CoreInput> = {}): CoreInput => {
    const base = input(over)
    return { ...base, submission: { ...base.submission, quest: { ...base.submission.quest, gameData: game } } }
  }

  /* שלושה יעדים (+ יעד מוסר בלבד + יעד בלי אף אתגר): s1,s2 → obj_1 · s3 + שאלות 0,1 במבחן → obj_2 · שאלה 2 → obj_3 · דילמה → obj_4 */
  const tagged = (): typeof GAME => {
    const g = clone(GAME) as typeof GAME & { scenes: { puzzle?: Record<string, unknown> }[] }
    g.objectives = [
      { id: 'obj_1', text: 'יעד ראשון' }, { id: 'obj_2', text: 'יעד שני' }, { id: 'obj_3', text: 'יעד שלישי' },
      { id: 'obj_4', text: 'יעד מוסר' }, { id: 'obj_5', text: 'יעד בלי אתגרים' },
    ]
    const p = (i: number): Record<string, unknown> => g.scenes[i].puzzle as Record<string, unknown>
    p(1).objectiveId = 'obj_1'; p(2).objectiveId = 'obj_1'; p(3).objectiveId = 'obj_2'; p(5).objectiveId = 'obj_4'
    const qs = p(4).questions as Record<string, unknown>[]
    qs[0].objectiveId = 'obj_2'; qs[1].objectiveId = 'obj_2'; qs[2].objectiveId = 'obj_3'
    return g
  }

  /* תלמיד/ה שסיים/ה: תוצאה בכל אחת משש היחידות */
  interface Spec { s1: R; s2: R; s3: R; q0: R; q1: R; q2: R }
  const run = (i: number, r: Spec): { answers: CoreAnswerRow[]; events: CoreEventRow[] } => {
    const c = (x: R): boolean => x === 'c'
    const out = (x: R): CoreAnswerRow['outcome'] => (c(x) ? 'correct' : 'wrong')
    return {
      answers: [
        ans(i, 's1', 0, c(r.s1) ? 'a' : 'b', out(r.s1)),
        ans(i, 's2', 0, c(r.s2) ? 't' : 'f', out(r.s2), { puzzleType: 'trueFalse' }),
        ans(i, 's3', 0, null, out(r.s3), { puzzleType: 'memory' }),
        ans(i, 's4', 0, c(r.q0) ? 'o0' : 'o1', out(r.q0), { puzzleType: 'finalQuiz' }),
        ans(i, 's4', 1, c(r.q1) ? 'o2' : 'o0', out(r.q1), { puzzleType: 'finalQuiz' }),
        ans(i, 's4', 2, c(r.q2) ? 'o1' : 'o0', out(r.q2), { puzzleType: 'finalQuiz' }),
      ],
      events: [
        pev(i, 's1', c(r.s1)), pev(i, 's2', c(r.s2)), pev(i, 's3', c(r.s3)),
        pev(i, 's4', [r.q0, r.q1, r.q2].filter(c).length >= 2), pev(i, 's5', true),
      ],
    }
  }
  const ALL_OK: Spec = { s1: 'c', s2: 'c', s3: 'c', q0: 'c', q1: 'c', q2: 'c' }
  /* st0 הכול נכון · st1 יעד 2 בגבול (2 מתוך 3) ושאלה 2 שגויה · st2 יעד 2 חלש (1 מתוך 3) · st3 הכול שגוי · st4 הכול נכון · st5 יעד 2 חלש */
  const SPECS: Spec[] = [
    ALL_OK,
    { ...ALL_OK, s3: 'w', q2: 'w' },
    { ...ALL_OK, s3: 'w', q0: 'w' },
    { s1: 'w', s2: 'w', s3: 'w', q0: 'w', q1: 'w', q2: 'w' },
    ALL_OK,
    { ...ALL_OK, s3: 'w', q1: 'w' },
  ]
  const full = (specs: Spec[] = SPECS): CoreInput => {
    const rs = specs.map((s, i) => run(i, s))
    return withGame(tagged(), { sessions: specs.map((_, i) => sess(i, true)), answers: rs.flatMap((r) => r.answers), events: rs.flatMap((r) => r.events) })
  }
  const byId = (v: ReturnType<typeof buildClassView>, id: string) => v.objectives.find((o) => o.id === id)!

  it('אין יעדים בשיעור → מערך ריק; יעדים בלי אף אתגר מתויג → מערך ריק; ובלי שורות "יעדים" ב"איך חישבנו"', () => {
    const one = run(0, ALL_OK)
    const done = { sessions: [sess(0, true)], answers: one.answers, events: one.events }
    const none = buildClassView(withGame(clone(GAME), done))
    expect(none.objectives).toEqual([])
    expect(none.howWeCalculated).toEqual([...howWeCalcResultsLines(), ...howWeCalcSuccessBandsLines()])
    const untagged = clone(GAME)
    untagged.objectives = [{ id: 'obj_1', text: 'יעד בלי תיוג' }]
    expect(buildClassView(withGame(untagged, done)).objectives).toEqual([])
    expect(buildClassView(withGame(null)).objectives).toEqual([])
  })

  it('רמות ומספרים: "X מתוך Y" בתלמידים, רמה לפי חלק התלמידים שהצליחו, ומילה פשוטה מ-findingsNarrative', () => {
    const v = buildClassView(full())
    /* יעדי מוסר ובלי-אתגרים אינם ניתנים למדידה — לא מוצגים; הסדר כפי שהוגדר בהדמיה */
    expect(v.objectives.map((o) => o.id)).toEqual(['obj_1', 'obj_2', 'obj_3'])
    /* יעד 1: 5 מתוך 6 (st3 לא הצליח באף אחד משניים) → 83% = "למדו" */
    expect(byId(v, 'obj_1')).toMatchObject({ text: 'יעד ראשון', attempted: 6, solved: 5, level: 'strong', levelText: OBJECTIVE_LEVEL_TEXT.strong })
    /* יעד 2 (שלוש יחידות): st0,st1,st4 הצליחו לפחות ב-60% מהן → 3 מתוך 6 = 50% → "עדיין קשה" */
    expect(byId(v, 'obj_2')).toMatchObject({ attempted: 6, solved: 3, level: 'weak', levelText: OBJECTIVE_LEVEL_TEXT.weak })
    /* יעד 3 (שאלה אחת במבחן): 4 מתוך 6 = 67% → "למדו חלקית" */
    expect(byId(v, 'obj_3')).toMatchObject({ attempted: 6, solved: 4, level: 'partial', levelText: OBJECTIVE_LEVEL_TEXT.partial })
    expect(ClassSubmissionViewSchema.safeParse(v).success).toBe(true)
  })

  it('המתקשים: מי שהצליח בפחות מ-60% מיחידות היעד — לפי א-ב, עם מזהה ושם', () => {
    const v = buildClassView(full())
    expect(byId(v, 'obj_1').weakStudents).toEqual([{ id: 'st3', name: 'דנה רז' }])
    expect(byId(v, 'obj_2').weakStudents.map((s) => s.name)).toEqual(['גלית ברק', 'דנה רז', 'ויקטור נחום'])
    expect(byId(v, 'obj_3').weakStudents.map((s) => s.id)).toEqual(['st1', 'st3'])
    for (const o of v.objectives) expect(o.solved + o.weakStudents.length).toBe(o.attempted)
  })

  /* ── גבולות הספים, על הדמיה קטנה: חמישה אתגרים, כולם ביעד אחד ── */
  describe('ספים', () => {
    const mini = (): unknown => ({
      entrySceneId: 'm1', objectives: [{ id: 'o', text: 'יעד' }],
      scenes: [1, 2, 3, 4, 5].map((n) => ({ id: `m${n}`, title: `אתגר ${n}`, puzzle: { type: 'multipleChoice', question: `שאלה ${n}`, objectiveId: 'o', choices: [{ id: 'a', text: 'נכון', isCorrect: true }, { id: 'b', text: 'שגוי', isCorrect: false }] } })),
    })
    /* תלמיד שפתר correct מתוך 5 אתגרים */
    const student = (i: number, correct: number): { answers: CoreAnswerRow[]; events: CoreEventRow[] } => ({
      answers: [1, 2, 3, 4, 5].map((n) => ans(i, `m${n}`, 0, n <= correct ? 'a' : 'b', n <= correct ? 'correct' : 'wrong')),
      events: [1, 2, 3, 4, 5].map((n) => pev(i, `m${n}`, n <= correct)),
    })
    const classOf = (corrects: number[]) => {
      const rs = corrects.map((c, i) => student(i, c))
      const base = withGame(mini(), { sessions: corrects.map((_, i) => sess(i, true)), answers: rs.flatMap((r) => r.answers), events: rs.flatMap((r) => r.events) })
      return buildClassView({ ...base, students: STUDENTS.slice(0, corrects.length) }).objectives[0]
    }

    it('הספים מגיעים מ-OBJECTIVE_BANDS (80% ו-60%)', () => {
      expect(OBJECTIVE_BANDS).toEqual({ strong: 0.8, partial: 0.6 })
    })
    it('סף אישי: 3 מתוך 5 (60% בדיוק) הצליח/ה; 2 מתוך 5 מתקשה', () => {
      const o = classOf([3, 2])
      expect(o.solved).toBe(1)
      expect(o.weakStudents.map((s) => s.id)).toEqual(['st1'])
    })
    it('סף כיתתי: 4 מתוך 5 תלמידים (80% בדיוק) = למדו; 3 מתוך 5 (60% בדיוק) = למדו חלקית; 2 מתוך 5 = עדיין קשה', () => {
      expect(classOf([5, 5, 5, 5, 0])).toMatchObject({ solved: 4, attempted: 5, level: 'strong' })
      expect(classOf([5, 5, 5, 0, 0])).toMatchObject({ solved: 3, attempted: 5, level: 'partial' })
      expect(classOf([5, 5, 0, 0, 0])).toMatchObject({ solved: 2, attempted: 5, level: 'weak' })
    })
    it('תלמיד/ה אחד/ת שניסה: יש רמה; אף אחד לא סיים: אין רמה ו"אין עדיין נתונים"', () => {
      expect(classOf([5])).toMatchObject({ attempted: 1, solved: 1, level: 'strong' })
      const rs = buildClassView({ ...withGame(mini(), { sessions: [sess(0, false)] }), students: STUDENTS.slice(0, 2) })
      expect(rs.objectives[0]).toMatchObject({ attempted: 0, solved: 0, level: null, levelText: OBJECTIVE_NO_DATA_TEXT, weakStudents: [] })
      expect(ClassSubmissionViewSchema.safeParse(rs).success).toBe(true)
    })
  })

  it('מי שלא סיים או לא התחיל — לא נספר; ויתור ואתגר שלא הגיע אליו — לא נספרים כהצלחה', () => {
    const rs = [run(0, ALL_OK), run(1, ALL_OK)]
    const v = buildClassView(withGame(tagged(), {
      sessions: [sess(0, true), sess(1, true), sess(2, false)],
      answers: [...rs[0].answers, ans(1, 's1', 0, null, 'gave_up'), ans(1, 's2', 0, 't', 'correct', { puzzleType: 'trueFalse' })],
      events: [...rs[0].events, pev(1, 's1', false), pev(1, 's2', true)],
    }))
    /* st1 הגיע רק ל-s1 (ויתר) ול-s2 (נכון): 1 מתוך 2 = 50% → מתקשה ביעד 1; ביעד 2 ו-3 לא ניסה */
    expect(byId(v, 'obj_1')).toMatchObject({ attempted: 2, solved: 1 })
    expect(byId(v, 'obj_1').weakStudents.map((s) => s.id)).toEqual(['st1'])
    expect(byId(v, 'obj_2')).toMatchObject({ attempted: 1, solved: 1 })
  })

  it('דילמה מוסרית אינה נספרת ביעד (אין בה נכון/שגוי), ותיוג של יעד שלא הוגדר מתעלמים ממנו', () => {
    const g = tagged() as unknown as { scenes: { puzzle?: Record<string, unknown> }[] }
    ;(g.scenes[1].puzzle as Record<string, unknown>).objectiveId = 'obj_שלא_קיים'
    const base = full()
    const v = buildClassView(withGame(g, { sessions: base.sessions, answers: base.answers, events: base.events }))
    expect(v.objectives.map((o) => o.id)).not.toContain('obj_4')
    /* s1 כבר אינו ביעד 1: נשארה רק s2 (נכון/לא נכון) — st3 עדיין שגוי בה */
    expect(byId(v, 'obj_1')).toMatchObject({ attempted: 6, solved: 5 })
    expect(byId(v, 'obj_1').weakStudents.map((s) => s.id)).toEqual(['st3'])
  })

  it('בלי answers (שיעור ישן): אתגר שלם לפי events; שאלות מבחן מתויגות בלי פירוט אינן נספרות, אבל תיוג של המבחן כולו כן', () => {
    const rs = SPECS.map((s, i) => run(i, s))
    const events = rs.flatMap((r) => r.events)
    const sessions = SPECS.map((_, i) => sess(i, true))
    const noQuiz = buildClassView(withGame(tagged(), { sessions, events }))
    /* יעד 1 מ-events: s1,s2 → כמו עם answers */
    expect(byId(noQuiz, 'obj_1')).toMatchObject({ attempted: 6, solved: 5, level: 'strong' })
    /* יעד 2: רק s3 נספר (שאלות המבחן מתויגות פר-שאלה ואין פירוט) — נכון אצל st0 ו-st4 בלבד = 2 מתוך 6 */
    expect(byId(noQuiz, 'obj_2')).toMatchObject({ attempted: 6, solved: 2, level: 'weak' })
    /* יעד 3: אין שום יחידה שנספרת → עוד אין נתונים */
    expect(byId(noQuiz, 'obj_3')).toMatchObject({ attempted: 0, solved: 0, level: null, levelText: OBJECTIVE_NO_DATA_TEXT })
    /* תיוג ברמת המבחן כולו: נספר כאתגר אחד לפי ה-event */
    const g = tagged() as unknown as { scenes: { puzzle?: Record<string, unknown> }[] }
    delete (g.scenes[4].puzzle!.questions as Record<string, unknown>[])[2].objectiveId
    g.scenes[4].puzzle!.objectiveId = 'obj_3'
    const whole = buildClassView(withGame(g, { sessions, events }))
    /* ה-event של המבחן הוא "נפתר" כשלפחות 2 מ-3 שאלות נכונות: רק st3 (אפס נכונות) לא הצליח */
    expect(byId(whole, 'obj_3')).toMatchObject({ attempted: 6, solved: 5 })
    expect(byId(whole, 'obj_3').weakStudents.map((s) => s.id)).toEqual(['st3'])
  })

  it('שאלה במבחן בלי תיוג משלה יורשת את תיוג המבחן; תיוג פר-שאלה גובר', () => {
    const g = tagged() as unknown as { scenes: { puzzle?: Record<string, unknown> }[] }
    const quiz = g.scenes[4].puzzle!
    quiz.objectiveId = 'obj_1'
    delete (quiz.questions as Record<string, unknown>[])[1].objectiveId
    const base = full()
    const v = buildClassView(withGame(g, { sessions: base.sessions, answers: base.answers, events: base.events }))
    /* שאלה 1 עברה ליעד 1 (ירושה): יעד 1 = s1,s2,q1 — רק st3 (שגוי בכול) מתקשה */
    expect(byId(v, 'obj_1').weakStudents.map((s) => s.id)).toEqual(['st3'])
    /* שאלה 0 נשארה ביעד 2 (תיוג פר-שאלה גובר על תיוג המבחן): יעד 2 = s3,q0 — מי שטעה באחת משתיים (50%) מתקשה */
    expect(byId(v, 'obj_2')).toMatchObject({ attempted: 6, solved: 2 })
    expect(byId(v, 'obj_2').weakStudents.map((s) => s.id)).toEqual(['st1', 'st2', 'st3', 'st5'])
  })

  it('הליבה טהורה: לא משנה את הקלט, דטרמיניסטית, ושורות "איך חישבנו" ליעדים מצורפות רק כשיש יעדים', () => {
    const data = full()
    const snap = JSON.stringify(data)
    const a = JSON.stringify(buildClassView(data))
    expect(JSON.stringify(buildClassView(data))).toBe(a)
    expect(JSON.stringify(data)).toBe(snap)
    expect(buildClassView(data).howWeCalculated).toEqual([...howWeCalcResultsLines(), ...howWeCalcSuccessBandsLines(), ...howWeCalcObjectivesLines(OBJECTIVE_BANDS)])
    expect(buildStudentView(data, 'st0')!.howWeCalculated).toEqual(howWeCalcResultsLines())
  })

  it('questObjectives: מסנן רשומות פגומות וכפילויות', () => {
    expect(questObjectives({ objectives: [{ id: 'a', text: 'א' }, { id: 'a', text: 'כפול' }, { id: '', text: 'בלי מזהה' }, { id: 'b', text: '  ' }, null, { id: 'c', text: ' ג ' }] }))
      .toEqual([{ id: 'a', text: 'א' }, { id: 'c', text: 'ג' }])
    expect(questObjectives(null)).toEqual([])
    expect(questObjectives({ objectives: 'x' })).toEqual([])
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
