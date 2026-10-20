import { describe, expect, it } from 'vitest'
import { COMMON_ERROR_MIN_STUDENTS, MORAL_MIN_COMPLETED, MORAL_MIN_ROWS, REVIEW_MIN_COMPLETED } from '../../../../src/shared/lib/analyticsConfig.js'
import { countNb, detailAvailableLine } from '../../../../src/shared/lib/findingsNarrative.js'
import { ClassSubmissionViewSchema, StudentSubmissionViewSchema, SubmissionRowSchema } from '../../../../src/shared/types/resultsV1.js'
import {
  buildClassView, buildListRow, buildReviewBasis, buildStudentView, subjectOfCode,
  type CoreAnswerRow, type CoreEventRow, type CoreInput, type CoreOptionTag, type CoreSession, type CoreStudent, type CoreVariant,
} from './core.js'

/* ══════════════════════════════════════════════════════════════════════════
   תיקוני הקשחה בליבת התוצאות: גרסאות אישיות, שער הדילמה המוסרית, weakCount מול יעדי למידה, חלק הצלחה בלי תלות בסדר,
   ניסוח כנה כשלא כולם סיימו, תאריכים בשעון ישראל, ההרצה שנספרת, האתגר הקשה, הדמיות בלי אתגרים.
   ══════════════════════════════════════════════════════════════════════════ */

const NAMES = ['אבי כהן', 'בני לוי', 'גלית ברק', 'דנה רז', 'הדס שמש', 'ויקטור נחום']
const stu = (i: number): CoreStudent => ({ id: `st${i}`, name: NAMES[i] })
const STUDENTS = NAMES.map((_, i) => stu(i))
const SENT = '2026-10-10T08:00:00.000Z'

const sess = (i: number, done: boolean, id = `se${i}`, startedAt = '2026-10-11T08:00:00Z'): CoreSession =>
  ({ id, studentId: `st${i}`, startedAt, completedAt: done ? '2026-10-11T08:20:00Z' : null })
const ans = (i: number, scene: string, item: number, opt: string | null, outcome: CoreAnswerRow['outcome'], o: Partial<CoreAnswerRow> = {}): CoreAnswerRow => ({
  sessionId: `se${i}`, sceneId: scene, itemIndex: item, puzzleType: 'multipleChoice', selectedOptionId: opt,
  isCorrect: outcome === 'correct', attemptNo: 1, responseMs: 5000, outcome, ...o,
})
const pev = (i: number, scene: string, solved: boolean): CoreEventRow =>
  ({ sessionId: `se${i}`, type: solved ? 'puzzle_solved' : 'puzzle_failed', sceneId: scene, payload: { attempts: 1, solveTimeMs: 7000 } })

const mcScene = (n: number, objectiveId?: string): Record<string, unknown> => ({
  id: `m${n}`, title: `אתגר ${n}`,
  puzzle: {
    type: 'multipleChoice', question: `שאלה ${n}`, ...(objectiveId ? { objectiveId } : {}),
    choices: [{ id: 'a', text: 'נכון', isCorrect: true }, { id: 'b', text: 'שגוי', isCorrect: false }, { id: 'c', text: 'שגוי אחר', isCorrect: false }],
  },
})
const gameOf = (scenes: unknown[], objectives: { id: string; text: string }[] = []): unknown => ({ entrySceneId: 'n0', objectives, scenes: [{ id: 'n0', title: 'פתיחה', narrative: 'פתיחה' }, ...scenes] })

function input(game: unknown, over: Partial<CoreInput> = {}): CoreInput {
  return {
    submission: {
      id: 'sub1', classId: 'c1', className: 'ו׳2', sentAt: SENT, source: 'mine', senderName: null,
      quest: { id: 'q1', title: 'הדמיה', subject: subjectOfCode('science'), gameData: game, thumbUrl: null },
    },
    students: STUDENTS, sessions: [], answers: [], events: [], optionTags: [], detailAvailableFrom: null, ...over,
  }
}

/* תלמיד שסיים ופתר את האתגרים m1..m<total> שבקבוצה `solved` (פירוט מלא) */
function played(i: number, total: number, solved: ReadonlySet<number> | number, done = true): { sessions: CoreSession[]; answers: CoreAnswerRow[]; events: CoreEventRow[] } {
  const ok = (n: number): boolean => (typeof solved === 'number' ? n <= solved : solved.has(n))
  const ns = Array.from({ length: total }, (_, k) => k + 1)
  return {
    sessions: [sess(i, done)],
    answers: ns.map((n) => ans(i, `m${n}`, 0, ok(n) ? 'a' : 'b', ok(n) ? 'correct' : 'wrong')),
    events: ns.map((n) => pev(i, `m${n}`, ok(n))),
  }
}
const merge = (...ps: ReturnType<typeof played>[]): Pick<CoreInput, 'sessions' | 'answers' | 'events'> => ({
  sessions: ps.flatMap((p) => p.sessions), answers: ps.flatMap((p) => p.answers), events: ps.flatMap((p) => p.events),
})
const permutations = <T,>(a: T[]): T[][] => (a.length <= 1 ? [a] : a.flatMap((x, i) => permutations([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])))

/* ══════════════════════════════════════════════════════════════════════════
   10. חלק ההצלחה הכיתתי: מספרים שלמים — סדר השמות לא משנה את המשפט בגבולות 0.5 / 0.75
   ══════════════════════════════════════════════════════════════════════════ */
describe('חלק ההצלחה הכיתתי אינו תלוי בסדר התלמידים', () => {
  /* שלושה אתגרים, ארבעה תלמידים: סכום הפתרונות / 12 = בדיוק הגבול. בממוצע עשרוני (סכום של x/3) התוצאה תלויה בסדר החיבור */
  const summariesFor = (counts: number[]): string[] => permutations([0, 1, 2, 3]).map((perm) => {
    const ps = [0, 1, 2, 3].map((i) => played(i, 3, counts[perm[i]]))
    return buildClassView({ ...input(gameOf([1, 2, 3].map((n) => mcScene(n)))), ...merge(...ps), students: STUDENTS.slice(0, 4) }).summary
  })

  it('בדיוק 0.5 → "חלק מהכיתה התקשה", בכל 24 הסדרים', () => {
    const all = new Set(summariesFor([0, 1, 2, 3]))
    expect(all.size).toBe(1)
    expect([...all][0]).toContain('חלק מהכיתה התקשה.')
  })

  it('בדיוק 0.75 → "רוב הכיתה הצליחה", בכל 24 הסדרים', () => {
    const all = new Set(summariesFor([1, 2, 3, 3]))
    expect(all.size).toBe(1)
    expect([...all][0]).toContain('רוב הכיתה הצליחה.')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   8. גרסאות אישיות
   ══════════════════════════════════════════════════════════════════════════ */
describe('תלמיד ששיחק בגרסה אישית: הפרומפט, האפשרויות, התשובה הנכונה והתגיות מהגרסה — לא מהבסיס', () => {
  const BASE = gameOf([{
    id: 's1', title: 'מצב הצבירה',
    puzzle: { type: 'multipleChoice', question: 'מה מצב הצבירה של קרח?', choices: [
      { id: 'a', text: 'מוצק', isCorrect: true }, { id: 'b', text: 'נוזל', isCorrect: false }, { id: 'c', text: 'גז', isCorrect: false },
    ] },
  }])
  /* גרסה שבה החידה נוצרה מחדש: שאלה אחרת, ארבע אפשרויות, התשובה הנכונה היא "b" (מוצק) ו-"d" אינו קיים בבסיס */
  const REGEN = gameOf([{
    id: 's1', title: 'מצב הצבירה',
    puzzle: { type: 'multipleChoice', question: 'מה קורה למים כשהם קופאים?', choices: [
      { id: 'a', text: 'גז', isCorrect: false }, { id: 'b', text: 'מוצק', isCorrect: true }, { id: 'c', text: 'נוזל', isCorrect: false }, { id: 'd', text: 'פלזמה', isCorrect: false },
    ] },
  }])
  /* גרסה זהה לבסיס בשאלה ובטקסטים, עם מזהי אפשרויות אחרים (x/y/z) */
  const SAME_TEXT = gameOf([{
    id: 's1', title: 'מצב הצבירה',
    puzzle: { type: 'multipleChoice', question: 'מה מצב הצבירה של קרח?', choices: [
      { id: 'x', text: 'גז', isCorrect: false }, { id: 'y', text: 'מוצק', isCorrect: true }, { id: 'z', text: 'נוזל', isCorrect: false },
    ] },
  }])
  const TAG: CoreOptionTag = { sceneId: 's1', itemIndex: 0, optionId: 'b', misconceptionId: 'm-liquid', title: 'בלבול בין מוצק לנוזל', description: '', linkedQuest: null }
  const VARIANT_TAG: CoreOptionTag = { sceneId: 's1', itemIndex: 0, optionId: 'd', misconceptionId: 'm-plasma', title: 'בלבול עם פלזמה', description: '', linkedQuest: null }

  /* st0,st3: בסיס, בחרו "b" (נוזל, שגוי, מתויג) · st4: בסיס, "a" (נכון) · st1: גרסה v1, בחר "d" (פלזמה — לא קיים בבסיס) ·
     st2: גרסה v2, בחר "b" (מוצק — נכון בגרסה; בבסיס "b" הוא "נוזל" השגוי!) · st5: גרסה v3 (אותם טקסטים), בחר "z" (נוזל) */
  const rows: CoreAnswerRow[] = [
    ans(0, 's1', 0, 'b', 'wrong'), ans(3, 's1', 0, 'b', 'wrong'), ans(4, 's1', 0, 'a', 'correct'),
    ans(1, 's1', 0, 'd', 'wrong', { variantId: 'v1' }), ans(2, 's1', 0, 'b', 'correct', { variantId: 'v2' }), ans(5, 's1', 0, 'z', 'wrong', { variantId: 'v3' }),
  ]
  const variants: CoreVariant[] = [
    { id: 'v1', studentId: 'st1', gameData: REGEN, optionTags: [VARIANT_TAG] },
    { id: 'v2', studentId: 'st2', gameData: REGEN },
    { id: 'v3', studentId: 'st5', gameData: SAME_TEXT },
  ]
  const data = (over: Partial<CoreInput> = {}): CoreInput =>
    input(BASE, {
      sessions: [0, 1, 2, 3, 4, 5].map((i) => sess(i, true)), answers: rows, events: [0, 1, 2, 3, 4, 5].map((i) => pev(i, 's1', i === 2 || i === 4)),
      optionTags: [TAG], variants, ...over,
    })

  it('מסך התלמיד: שאלה, מה ענה ומהי התשובה הנכונה — מהגרסה (גם כשהמזהה "d" אינו בבסיס)', () => {
    const v = buildStudentView(data(), 'st1')!
    expect(v.challenges[0].items[0]).toMatchObject({
      prompt: 'מה קורה למים כשהם קופאים?', answerText: 'פלזמה', correctText: 'מוצק', isCorrect: false, errorTag: { id: 'm-plasma', title: 'בלבול עם פלזמה' },
    })
    expect(StudentSubmissionViewSchema.safeParse(v).success).toBe(true)
  })

  it('מסך התלמיד: מזהה אפשרות שקיים גם בבסיס ("b") מתפרש לפי הגרסה — "מוצק" הנכון, בלי תגית הבסיס', () => {
    const it2 = buildStudentView(data(), 'st2')!.challenges[0].items[0]
    expect(it2).toMatchObject({ answerText: 'מוצק', correctText: 'מוצק', isCorrect: true, errorTag: null })
  })

  it('תלמיד בבסיס נשאר כמו קודם', () => {
    expect(buildStudentView(data(), 'st0')!.challenges[0].items[0]).toMatchObject({
      prompt: 'מה מצב הצבירה של קרח?', answerText: 'נוזל', correctText: 'מוצק', isCorrect: false, errorTag: { id: 'm-liquid' },
    })
  })

  it('התפלגות כיתתית: ניסו/הצליחו כוללים את כולם; בחירה בגרסה נספרת רק כשהשאלה והטקסט זהים לבסיס', () => {
    const ch = buildClassView(data()).challenges[0]
    expect([ch.attempted, ch.solved]).toEqual([6, 2])
    const opts = ch.items[0].options!
    const count = (id: string) => opts.find((o) => o.optionId === id)!
    /* "נוזל": st0, st3 (בסיס) + st5 (גרסה באותם טקסטים) — ולא st2 ש"b" שלו הוא "מוצק" בגרסה */
    expect(count('b').students.map((s) => s.id).sort()).toEqual(['st0', 'st3', 'st5'])
    expect(count('a').students.map((s) => s.id)).toEqual(['st4'])
    expect(count('c').count).toBe(0)
    /* st1 בחר "פלזמה" — אינה אפשרות בבסיס ולכן אינה בהתפלגות */
    expect(opts.flatMap((o) => o.students.map((s) => s.id))).not.toContain('st1')
    /* st2 שענה נכון בגרסה שונה (שאלה אחרת): נספר כהצלחה, אך לא כבחירה ב"מוצק" של הבסיס */
    expect(count('a').count).toBe(1)
  })

  it('טעות נפוצה: מחושבת רק מבחירות שניתן לשייך לבסיס, ותגית הגרסה לא נכנסת לתגיות הבסיס', () => {
    const v = buildClassView(data())
    expect(v.commonErrors).toHaveLength(1)
    expect(v.commonErrors[0]).toMatchObject({ id: 'm-liquid', studentsCount: 3, studentsExposed: 4 })
    expect(v.commonErrors.map((e) => e.id)).not.toContain('m-plasma')
    expect(v.challenges[0].items[0].options!.every((o) => o.errorTag?.id !== 'm-plasma')).toBe(true)
    /* בלי st5: רק st0 ו-st3 בחרו ב"נוזל". st2 שענה "b" בגרסה (מוצק, נכון) אינו נספר כבוחר בטעות של הבסיס (בקוד הישן נספר: 3) */
    const without5 = buildClassView(data({ sessions: [0, 1, 2, 3, 4].map((i) => sess(i, true)), answers: rows.filter((r) => r.sessionId !== 'se5') }))
    expect(without5.commonErrors[0]).toMatchObject({ studentsCount: 2, studentsExposed: 3 })
  })

  it('גרסה שלא נטענה (variantId קיים, אין תוכן): הבחירה לא נספרת בהתפלגות, ובמסך התלמיד אין טקסט תשובה — ולא מנחשים מהבסיס', () => {
    const d = data({ variants: [] })
    const ch = buildClassView(d).challenges[0]
    expect([ch.attempted, ch.solved]).toEqual([6, 2])
    expect(ch.items[0].options!.find((o) => o.optionId === 'b')!.students.map((s) => s.id).sort()).toEqual(['st0', 'st3'])
    const sv = buildStudentView(d, 'st2')!.challenges[0].items[0]
    expect(sv).toMatchObject({ answerText: null, correctText: null, isCorrect: true, errorTag: null })
  })

  it('גרסה ששייכת לתלמיד אחר אינה מיושמת', () => {
    const d = data({ variants: [{ id: 'v1', studentId: 'st0', gameData: REGEN }, ...variants.slice(1)] })
    const sv = buildStudentView(d, 'st1')!.challenges[0].items[0]
    expect(sv.answerText).toBeNull()
  })

  it('הליבה לא משנה את הקלט', () => {
    const d = data()
    const snap = JSON.stringify(d)
    buildClassView(d)
    buildStudentView(d, 'st1')
    expect(JSON.stringify(d)).toBe(snap)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   3. התפלגות הדילמה המוסרית: מוצגת רק עם מספיק שורות ותלמידים שסיימו
   ══════════════════════════════════════════════════════════════════════════ */
describe('דילמה מוסרית: סף אנונימיות', () => {
  const MORAL = gameOf([{ id: 'd1', title: 'דילמה', puzzle: { type: 'moralDilemma', question: 'מה תעשו?', situation: 'מצאתם ארנק', moralChoices: [{ text: 'להחזיר' }, { text: 'לשמור' }] } }])
  const run = (completed: number, moralRows: number, variantRows = 0) => {
    const ids = Array.from({ length: completed }, (_, i) => i)
    const moral = [
      ...Array.from({ length: moralRows }, (_, k) => ({ sceneId: 'd1', optionId: k % 2 ? 'm1' : 'm0' })),
      ...Array.from({ length: variantRows }, () => ({ sceneId: 'd1', optionId: 'm0', variantId: 'v9' })),
    ]
    const v = buildClassView(input(MORAL, { sessions: ids.map((i) => sess(i, true)), events: ids.map((i) => pev(i, 'd1', true)), moral }))
    return v.challenges[0].items[0].options
  }

  it('הספים הם MIN_CELL_SIZE', () => {
    expect([MORAL_MIN_ROWS, MORAL_MIN_COMPLETED]).toEqual([5, 5])
  })
  it('מספיק שורות ותלמידים (5 ו-5): ההתפלגות מוצגת', () => {
    expect(run(5, 5)).not.toBeNull()
  })
  it('תלמיד אחד שסיים ושחזר הרבה פעמים (הרבה שורות): אין התפלגות', () => {
    expect(run(1, 20)).toBeNull()
    expect(run(4, 20)).toBeNull()
  })
  it('הרבה תלמידים שסיימו אך מעט שורות (4): אין התפלגות', () => {
    expect(run(6, 4)).toBeNull()
  })
  it('בחירות בגרסה אישית אינן נספרות לשורות', () => {
    expect(run(6, 3, 10)).toBeNull()
    const opts = run(6, 5, 10)!
    expect(opts.reduce((n, o) => n + o.count, 0)).toBe(5)
  })
  it('אין שורות בכלל: null', () => {
    expect(run(6, 0)).toBeNull()
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   9. review.weakCount מסכים עם פאנל יעדי הלמידה
   ══════════════════════════════════════════════════════════════════════════ */
describe('הצעה לתרגול חזרה (weakCount)', () => {
  const OBJ = [{ id: 'obj_1', text: 'יעד ראשון' }, { id: 'obj_2', text: 'יעד שני' }]
  /* חמישה אתגרים ביעד 1 ושניים ביעד 2 */
  const game = gameOf([...[1, 2, 3, 4, 5].map((n) => mcScene(n, 'obj_1')), ...[6, 7].map((n) => mcScene(n, 'obj_2'))], OBJ)
  const wholeClass = (specs: (ReadonlySet<number> | number)[]) => {
    const ps = specs.map((s, i) => played(i, 7, s))
    return { ...input(game), ...merge(...ps) }
  }
  const SOLVE_ALL = new Set([1, 2, 3, 4, 5, 6, 7])
  const ONLY_TWO = new Set([1, 2, 6, 7])

  it('יעד "עדיין קשה" בפאנל → weakCount > 0 (גם כשסכום האירועים הגולמי נראה בסדר: חצי מהתלמידים הצליחו הכול, חצי הצליחו 2 מ-5)', () => {
    const v = buildClassView(wholeClass([SOLVE_ALL, SOLVE_ALL, ONLY_TWO, ONLY_TWO]))
    const weak = v.objectives.filter((o) => o.level === 'weak')
    expect(weak.map((o) => o.id)).toEqual(['obj_1'])
    expect(v.review.weakCount).toBe(weak.length)
    expect(v.review.weakCount).toBeGreaterThan(0)
  })

  it('weakCount = מספר היעדים ברמה "עדיין קשה" — בדיוק', () => {
    const v = buildClassView(wholeClass([new Set(), new Set(), new Set()]))
    expect(v.objectives.map((o) => o.level)).toEqual(['weak', 'weak'])
    expect(v.review.weakCount).toBe(2)
  })

  it('אין יעד חלש בפאנל → weakCount = 0', () => {
    const v = buildClassView(wholeClass([SOLVE_ALL, SOLVE_ALL, SOLVE_ALL]))
    expect(v.objectives.every((o) => o.level === 'strong')).toBe(true)
    expect(v.review.weakCount).toBe(0)
  })

  it('יעדים שהוגדרו אך אף אתגר לא תויג בהם (אין פאנל): נופלים לחישוב לפי אתגרים', () => {
    const untagged = gameOf([1, 2].map((n) => mcScene(n)), [{ id: 'obj_1', text: 'יעד' }])
    const ps = [0, 1].map((i) => played(i, 2, new Set<number>()))
    const v = buildClassView({ ...input(untagged), ...merge(...ps) })
    expect(v.objectives).toEqual([])
    expect(v.review.weakCount).toBe(2)
  })

  it('בלי יעדים: מבחן סיכום נספר לפי שאלה (שאלה אחת חלשה במבחן שבכללותו עבר = תחום חלש אחד); דילמה מוסרית לא נספרת', () => {
    const quiz = gameOf([
      { id: 'q', title: 'מבחן', puzzle: { type: 'finalQuiz', question: 'סיכום', questions: [
        { question: 'שאלה ראשונה', options: ['א', 'ב'], correctIndex: 0 }, { question: 'שאלה שנייה', options: ['ג', 'ד'], correctIndex: 0 }, { question: 'שאלה שלישית', options: ['ה', 'ו'], correctIndex: 0 },
      ] } },
      { id: 'd', title: 'דילמה', puzzle: { type: 'moralDilemma', question: 'מה?', situation: 'מצב', moralChoices: [{ text: 'א' }, { text: 'ב' }] } },
    ])
    /* שאלה 0 שגויה אצל 3 מ-4; שאלות 1,2 נכונות אצל כולם → המבחן כולו "נפתר" (≥ חצי) לכולם */
    const wrongOnQ0 = (i: number, correct: boolean): ReturnType<typeof played> => ({
      sessions: [sess(i, true)],
      answers: [ans(i, 'q', 0, correct ? 'o0' : 'o1', correct ? 'correct' : 'wrong', { puzzleType: 'finalQuiz' }), ans(i, 'q', 1, 'o0', 'correct', { puzzleType: 'finalQuiz' }), ans(i, 'q', 2, 'o0', 'correct', { puzzleType: 'finalQuiz' })],
      events: [pev(i, 'q', true), pev(i, 'd', true)],
    })
    const v = buildClassView({ ...input(quiz), ...merge(wrongOnQ0(0, true), wrongOnQ0(1, false), wrongOnQ0(2, false), wrongOnQ0(3, false)), students: STUDENTS.slice(0, 4) })
    expect(v.challenges.find((c) => c.type === 'finalQuiz')).toMatchObject({ attempted: 4, solved: 4 })
    expect(v.review.weakCount).toBe(1)
    const basis = buildReviewBasis({ ...input(quiz), ...merge(wrongOnQ0(0, true), wrongOnQ0(1, false), wrongOnQ0(2, false), wrongOnQ0(3, false)), students: STUDENTS.slice(0, 4) })
    expect(basis.concepts[0]).toMatchObject({ objectiveId: null, text: 'שאלה ראשונה', units: [{ sceneId: 'q', itemIndex: 0 }] })
  })

  it(`מתחת ל-${REVIEW_MIN_COMPLETED} תלמידים שסיימו אין הצעה (לא בונים הדמיה מביצועי תלמיד/ה בודד/ת)`, () => {
    const one = { ...input(game), ...merge(played(0, 7, new Set<number>())) }
    expect(buildClassView(one).objectives.map((o) => o.level)).toEqual(['weak', 'weak'])
    expect(buildClassView(one).review.weakCount).toBe(0)
    expect(buildReviewBasis(one)).toMatchObject({ completed: 1, concepts: [] })
    const two = { ...input(game), ...merge(played(0, 7, new Set<number>()), played(1, 7, new Set<number>())) }
    expect(buildReviewBasis(two)).toMatchObject({ completed: REVIEW_MIN_COMPLETED })
    expect(buildReviewBasis(two).concepts.map((c) => c.objectiveId)).toEqual(['obj_1', 'obj_2'])
  })

  it('בסיס החזרה = אותה ספירה כמו weakCount, ויחידות המדידה של כל יעד', () => {
    const d = wholeClass([SOLVE_ALL, SOLVE_ALL, ONLY_TWO, ONLY_TWO])
    const basis = buildReviewBasis(d)
    expect(basis.concepts).toHaveLength(buildClassView(d).review.weakCount)
    expect(basis.concepts[0]).toMatchObject({ objectiveId: 'obj_1', text: 'יעד ראשון', successRate: 0.5 })
    expect(basis.concepts[0].units.map((u) => u.sceneId)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5'])
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   11. ניסוח כנה כשלא כולם סיימו
   ══════════════════════════════════════════════════════════════════════════ */
describe('משפט הסיכום לא מכליל מעבר למי שסיימו', () => {
  const game = gameOf([1, 2, 3].map((n) => mcScene(n)))
  const students30: CoreStudent[] = Array.from({ length: 30 }, (_, i) => ({ id: `st${i}`, name: `תלמיד ${String(i).padStart(2, '0')}` }))
  const withDone = (n: number, solved: number): CoreInput => {
    const ps = Array.from({ length: n }, (_, i) => played(i, 3, solved))
    return { ...input(game), ...merge(...ps), students: students30 }
  }

  it('1 מתוך 30 סיימו: אין "רוב הכיתה הצליחה" — רק כמה סיימו, ושעוד אין מספיק לסכם', () => {
    const v = buildClassView(withDone(1, 3))
    expect(v.summary).toBe(`עד עכשיו סיימו ${countNb(1, 30)}. עוד אין מספיק תוצאות כדי לסכם את הכיתה.`)
    const row = buildListRow(withDone(1, 3))
    expect(row.summary).toBe(`עד עכשיו סיימו ${countNb(1, 30)}.`)
    expect(SubmissionRowSchema.safeParse(row).success).toBe(true)
  })

  it('כמה סיימו אך לא כולם: הסיכום מדבר רק עליהם, ושורת הרשימה נושאת את אותו סייג', () => {
    const d = withDone(12, 3)
    expect(buildClassView(d).summary).toBe(`עד עכשיו סיימו ${countNb(12, 30)}. רובם הצליחו.`)
    expect(buildListRow(d).summary).toBe('רוב מי שסיימו עד עכשיו הצליחו.')
    const low = withDone(12, 0)
    expect(buildClassView(low).summary).toContain('הם התקשו בהדמיה.')
    expect(buildListRow(low).summary).toContain('מי שסיימו עד עכשיו התקשו בהדמיה.')
  })

  it('כולם סיימו: הניסוח הכיתתי הרגיל', () => {
    const all = { ...input(game), ...merge(...[0, 1, 2, 3, 4, 5].map((i) => played(i, 3, 3))) }
    expect(buildClassView(all).summary).toContain('רוב הכיתה הצליחה.')
    expect(buildListRow(all).summary).toContain('רוב הכיתה הצליחה.')
  })

  it('"X מתוך Y" צמוד ברווחים לא-שוברים (U+00A0) בכל משפטי הסיכום', () => {
    const v = buildClassView(withDone(12, 3))
    expect(v.summary).toContain('12\u00A0מתוך\u00A030')
    expect(v.summary).not.toMatch(/\d מתוך \d/)
  })

  it('תלמיד/ה שסימנו לו תשומת לב: הסיבה במילים בסוף המשפט; בלי תשומת לב — בלי סיבה', () => {
    const gaveUp: ReturnType<typeof played> = {
      sessions: [sess(1, true)],
      answers: [ans(1, 'm1', 0, null, 'gave_up'), ans(1, 'm2', 0, null, 'closed'), ans(1, 'm3', 0, 'a', 'correct')],
      events: [pev(1, 'm1', false), pev(1, 'm2', false), pev(1, 'm3', true)],
    }
    const d = { ...input(game), ...merge(played(0, 3, 3), gaveUp) }
    const flagged = buildStudentView(d, 'st1')!
    expect(flagged.student.attentionReasons).toContain('gave_up_often')
    expect(flagged.summary).toBe(`בני פתר/ה ${countNb(1, 3)} אתגרים. ויתר/ה על 2. לתשומת לב: ויתר/ה על כמה אתגרים, הצליח/ה בפחות מחצי מהאתגרים.`)
    const fine = buildStudentView(d, 'st0')!
    expect(fine.summary).toBe(`אבי פתר/ה ${countNb(3, 3)} אתגרים.`)
    /* מי שלא התחיל: הסיבה כבר במשפט עצמו, בלי כפילות */
    const notStarted = buildStudentView(d, 'st4')!
    expect(notStarted.summary).toBe('הדס עוד לא התחיל/ה את ההדמיה. התוצאות יופיעו כאן כשיסיימו.')
  })

  it('אותו משפט "מה יקרה" בכיתה, ברשימה ובתלמיד/ה שעוד לא התחילו', () => {
    const none = input(game)
    expect(buildClassView(none).summary).toContain('התוצאות יופיעו כאן כשיסיימו.')
    expect(buildListRow(none).summary).toContain('התוצאות יופיעו כאן כשיסיימו.')
    expect(buildStudentView(none, 'st0')!.summary).toContain('התוצאות יופיעו כאן כשיסיימו.')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   12. תאריכים בשעון ישראל
   ══════════════════════════════════════════════════════════════════════════ */
describe('"פירוט התשובות זמין" — יום ישראלי, ולא רגע UTC', () => {
  /* 19 באוקטובר 22:30Z = 20 באוקטובר 01:30 בישראל (UTC+3) */
  const FIRST_CAPTURE = '2026-10-19T22:30:00.000Z'
  const withSent = (sentAt: string, over: Partial<CoreInput> = {}): CoreInput => {
    const base = input(gameOf([mcScene(1)]), { detailAvailableFrom: FIRST_CAPTURE, ...over })
    return { ...base, submission: { ...base.submission, sentAt } }
  }

  it('נשלחה באותו יום ישראלי כמו התשובה הראשונה שנלכדה (אך רגע מוקדם יותר): יש פירוט, והטקסט והשער מסכימים', () => {
    /* 19 באוקטובר 21:00Z = 20 באוקטובר 00:00 בישראל — לפני רגע הלכידה, אבל באותו יום */
    const sent = '2026-10-19T21:00:00.000Z'
    expect(Date.parse(sent)).toBeLessThan(Date.parse(FIRST_CAPTURE))
    const c = buildClassView(withSent(sent))
    expect(c.hasAnswerDetail).toBe(true)
    expect(c.detailAvailableFrom).toBeNull()
    const s = buildStudentView(withSent(sent), 'st0')!
    expect(s.hasAnswerDetail).toBe(true)
    expect(s.detailAvailableFrom).toBeNull()
  })

  it('נשלחה ביום ישראלי קודם: אין פירוט, והתאריך המוצג הוא היום הישראלי של הלכידה (20 באוקטובר), לא היום ב-UTC', () => {
    /* 19 באוקטובר 20:30Z = 19 באוקטובר 23:30 בישראל */
    const c = buildClassView(withSent('2026-10-19T20:30:00.000Z'))
    expect(c.hasAnswerDetail).toBe(false)
    expect(c.detailAvailableFrom).toBe(FIRST_CAPTURE)
    expect(detailAvailableLine(c.detailAvailableFrom!)).toBe('פירוט התשובות זמין להדמיות שנשלחו מ-20 באוקטובר 2026')
  })

  it('הגבול ביום הבא: נשלחה ב-20 באוקטובר בבוקר → יש פירוט', () => {
    expect(buildClassView(withSent('2026-10-20T05:00:00.000Z')).hasAnswerDetail).toBe(true)
  })

  it('שעון חורף (UTC+2): 25 באוקטובר 22:30Z כבר 26 בחודש בישראל', () => {
    const from = '2026-10-25T22:30:00.000Z'
    const base = input(gameOf([mcScene(1)]), { detailAvailableFrom: from })
    const sameDay = { ...base, submission: { ...base.submission, sentAt: '2026-10-25T22:00:00.000Z' } }
    const dayBefore = { ...base, submission: { ...base.submission, sentAt: '2026-10-25T21:59:00.000Z' } }
    expect(buildClassView(sameDay).hasAnswerDetail).toBe(true)
    expect(buildClassView(dayBefore).hasAnswerDetail).toBe(false)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   14. האתגר הקשה ביותר כולל ויתור
   ══════════════════════════════════════════════════════════════════════════ */
describe('האתגר הקשה ביותר: מי שלא הצליחו (טעו, ויתרו, נגמר הזמן)', () => {
  it('אתגר שכולם ויתרו עליו הוא הקשה ביותר, גם מול אתגר שחצי טעו בו', () => {
    const game = gameOf([1, 2].map((n) => mcScene(n)))
    const student = (i: number, m2Correct: boolean): ReturnType<typeof played> => ({
      sessions: [sess(i, true)],
      answers: [ans(i, 'm1', 0, null, 'gave_up'), ans(i, 'm2', 0, m2Correct ? 'a' : 'b', m2Correct ? 'correct' : 'wrong')],
      events: [pev(i, 'm1', false), pev(i, 'm2', m2Correct)],
    })
    const d = { ...input(game), ...merge(student(0, true), student(1, true), student(2, false), student(3, false)), students: STUDENTS.slice(0, 4) }
    const v = buildClassView(d)
    expect(v.summary).toContain('האתגר הקשה ביותר: אתגר 1.')
    expect(v.summary).toContain(`${countNb(4, 4)} לא הצליחו`)
    expect(v.summary).not.toContain('טעו')
    expect(buildListRow(d).summary).toContain('הקשה ביותר: אתגר 1.')
  })

  it('שוויון בשיעור: יותר תלמידים שלא הצליחו; ובלי תלות בסדר האתגרים (השוואה במספרים שלמים)', () => {
    /* אתגר 1: 1 מתוך 2 · אתגר 2: 2 מתוך 4 — אותו שיעור, האחרון עם יותר תלמידים */
    const game = gameOf([1, 2].map((n) => mcScene(n)))
    const st = (i: number, m1: boolean | null, m2: boolean): ReturnType<typeof played> => ({
      sessions: [sess(i, true)],
      answers: [...(m1 === null ? [] : [ans(i, 'm1', 0, m1 ? 'a' : 'b', m1 ? 'correct' : 'wrong')]), ans(i, 'm2', 0, m2 ? 'a' : 'b', m2 ? 'correct' : 'wrong')],
      events: [...(m1 === null ? [] : [pev(i, 'm1', m1)]), pev(i, 'm2', m2)],
    })
    const d = { ...input(game), ...merge(st(0, true, true), st(1, false, true), st(2, null, false), st(3, null, false)), students: STUDENTS.slice(0, 4) }
    expect(buildClassView(d).summary).toContain('האתגר הקשה ביותר: אתגר 2.')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   15. הדמיות בלי אתגרים, ואתגר יחיד
   ══════════════════════════════════════════════════════════════════════════ */
describe('הדמיה בלי סצנות עם אתגר', () => {
  const noPuzzles = gameOf([{ id: 'n1', title: 'סצנה', narrative: 'טקסט' }])
  const done = (n: number): CoreInput => ({ ...input(noPuzzles), sessions: Array.from({ length: n }, (_, i) => sess(i, true)) })

  it('סיכום כיתה ורשימה: "X מתוך Y סיימו את ההדמיה; אין בה אתגרים שאפשר למדוד" — לא "עוד אף תלמיד לא התחיל"', () => {
    const v = buildClassView(done(3))
    expect(v.summary).toBe(`${countNb(3, 6)} סיימו את ההדמיה; אין בה אתגרים שאפשר למדוד.`)
    expect(v.summary).not.toContain('עוד אף תלמיד')
    expect(buildListRow(done(3)).summary).toBe(`${countNb(3, 6)} סיימו את ההדמיה.`)
    expect(v.challenges).toEqual([])
    expect(ClassSubmissionViewSchema.safeParse(v).success).toBe(true)
  })

  it('תלמיד/ה שסיים/ה: בלי "פתר/ה 0 מתוך 0"', () => {
    const s = buildStudentView(done(1), 'st0')!
    expect(s.summary).toBe('אבי סיים/ה את ההדמיה; אין בה אתגרים שאפשר למדוד.')
    expect(s.student.attentionReasons).toEqual([])
  })

  it('אף אחד לא סיים: ההודעה הרגילה', () => {
    expect(buildClassView(input(noPuzzles)).summary).toContain('עוד אף תלמיד לא התחיל')
  })
})

describe('אתגר יחיד: ביחיד', () => {
  it('"פתר/ה 1 מתוך 1 אתגר" (לא "אתגרים")', () => {
    const d = { ...input(gameOf([mcScene(1)])), ...merge(played(0, 1, 1), played(1, 1, 0)) }
    expect(buildStudentView(d, 'st0')!.summary).toBe(`אבי פתר/ה ${countNb(1, 1)} אתגר.`)
    expect(buildStudentView(d, 'st1')!.summary).toContain(`${countNb(0, 1)} אתגר.`)
  })
})

describe('מספר המינימום לסיכום מתוך הקונפיג', () => {
  it('הסף אינו נכתב בקוד: מדלגים על ההכללה מתחת ל-COMMON_ERROR_MIN_STUDENTS', () => {
    expect(COMMON_ERROR_MIN_STUDENTS).toBe(2)
  })
})
