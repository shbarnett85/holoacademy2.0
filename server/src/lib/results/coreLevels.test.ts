import { describe, expect, it } from 'vitest'
import { LEVEL_COMPARISON } from '../../../../src/shared/lib/analyticsConfig.js'
import { COMPARISON_NOT_ENOUGH } from '../../../../src/shared/lib/findingsNarrative.js'
import { ClassSubmissionViewSchema, StudentSubmissionViewSchema } from '../../../../src/shared/types/resultsV1.js'
import {
  buildClassView, buildListRow, buildStudentView, normalizeOptionText, subjectOfCode,
  type CoreAnswerRow, type CoreEventRow, type CoreInput, type CoreOptionTag, type CoreSession, type CoreStudent, type CoreVariant,
} from './core.js'

/* ═════════════════════════════════════════════════════════════════════════
   סיכום שיעור: דרגה בפועל, השוואה הוגנת, פירוק לטווחי דרגות, "השיעור פתוח עד…", ואיחוד טעויות נפוצות בין גרסאות
   ═════════════════════════════════════════════════════════════════════════ */
const mc = (n: number, opts: [string, string, string] = ['נכון', '⅖', 'שגוי אחר']): Record<string, unknown> => ({
  id: `m${n}`, title: `אתגר ${n}`,
  puzzle: { type: 'multipleChoice', question: `שאלה ${n}`, choices: [{ id: 'a', text: opts[0], isCorrect: true }, { id: 'b', text: opts[1], isCorrect: false }, { id: 'c', text: opts[2], isCorrect: false }] },
})
const GAME = { entrySceneId: 'n0', scenes: [{ id: 'n0', title: 'פתיחה', narrative: 'פתיחה', nextSceneId: 'm1' }, ...[1, 2, 3, 4, 5].map((n) => mc(n))] }

const SENT = '2026-10-20T08:00:00.000Z'
const students = (n: number): CoreStudent[] => Array.from({ length: n }, (_, i) => ({ id: `st${i}`, name: `תלמיד ${String.fromCharCode(0x5d0 + i)}` }))
const sess = (i: number, done = true): CoreSession => ({ id: `se${i}`, studentId: `st${i}`, startedAt: '2026-10-21T08:00:00Z', completedAt: done ? '2026-10-21T08:20:00Z' : null })
const ans = (i: number, scene: string, opt: string, ok: boolean, level: number | null, extra: Partial<CoreAnswerRow> = {}): CoreAnswerRow => ({
  sessionId: `se${i}`, sceneId: scene, itemIndex: 0, puzzleType: 'multipleChoice', selectedOptionId: opt, isCorrect: ok, attemptNo: 1, responseMs: 4000,
  outcome: ok ? 'correct' : 'wrong', levelAtPlay: level, ...extra,
})
const ev = (i: number, scene: string, solved: boolean): CoreEventRow => ({ sessionId: `se${i}`, type: solved ? 'puzzle_solved' : 'puzzle_failed', sceneId: scene, payload: { attempts: 1, solveTimeMs: 5000 } })

function input(n: number, over: Partial<CoreInput> = {}): CoreInput {
  return {
    submission: { id: 'sub1', classId: 'c1', className: 'ו׳2', sentAt: SENT, source: 'mine', senderName: null, gradeLabel: 'ו׳2', quest: { id: 'q1', title: 'שברים', subject: subjectOfCode('math'), gameData: GAME, thumbUrl: null } },
    students: students(n), sessions: [], answers: [], events: [], optionTags: [], detailAvailableFrom: null, ...over,
  }
}

/* תלמיד שפתר/נכשל לפי `plan` (sceneId → נכון?) ברמה `level` */
function play(i: number, level: number | null, plan: Record<string, boolean>, pick = 'b'): { sessions: CoreSession[]; answers: CoreAnswerRow[]; events: CoreEventRow[] } {
  const scenes = Object.keys(plan)
  return {
    sessions: [sess(i)],
    answers: scenes.map((s) => ans(i, s, plan[s] ? 'a' : pick, plan[s], level)),
    events: scenes.map((s) => ev(i, s, plan[s])),
  }
}
const all = (ok: boolean): Record<string, boolean> => ({ m1: ok, m2: ok, m3: ok, m4: ok, m5: ok })
const merge = (...ps: ReturnType<typeof play>[]): Pick<CoreInput, 'sessions' | 'answers' | 'events'> => ({
  sessions: ps.flatMap((p) => p.sessions), answers: ps.flatMap((p) => p.answers), events: ps.flatMap((p) => p.events),
})

describe('דרגה בפועל, השוואה הוגנת ופירוק לטווחים', () => {
  /* תלמיד/ה (st0) בדרגה 14 נכשל/ה באתגר 1; שמונה תלמידים בדרגה 6 הצליחו בו */
  const base = (): CoreInput => input(9, merge(play(0, 14, { ...all(true), m1: false }), ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => play(i, 6, all(true)))))

  it('המקרה הקריטי: בדרגה 14 נכשל — מול כיתה בדרגה 6 שהצליחה. אין השוואה, ולא מוצג/ת כחלש/ה מהם', () => {
    const sv = buildStudentView(base(), 'st0')!
    const m1 = sv.challenges.find((c) => c.sceneId === 'm1')!
    expect(m1.level).toBe(14)
    expect(m1.outcome).toBe('wrong')
    expect(m1.comparison).toEqual({ kind: 'not_enough', sentence: COMPARISON_NOT_ENOUGH })
    /* ואין שום משפט שמזכיר "פחות מהכיתה" / שיעור הצלחה של הכיתה בהשוואה אליו/ה */
    expect(JSON.stringify(m1)).not.toContain('הצליחו באתגר הזה')
    expect(StudentSubmissionViewSchema.safeParse(sv).success).toBe(true)
  })

  it('תלמיד בדרגה 6 מושווה לשבעת העמיתים בדרגה 6 — והתלמיד בדרגה 14 אינו נכלל בהשוואה', () => {
    const m1 = buildStudentView(base(), 'st1')!.challenges.find((c) => c.sceneId === 'm1')!
    expect(m1.level).toBe(6)
    expect(m1.comparison).toMatchObject({ kind: 'compared', peers: 7, solved: 7, levelFrom: 6, levelTo: 6 })
    expect((m1.comparison as { sentence: string }).sentence).toContain('דרגה 6')
  })

  it('פירוק לטווחי דרגות באתגר: 6–10 הצליחו כולם, 11–15 נכשל', () => {
    const v = buildClassView(base())
    const m1 = v.challenges.find((c) => c.sceneId === 'm1')!
    expect(m1.attempted).toBe(9)
    expect(m1.solved).toBe(8)
    expect(m1.levelBands).toEqual([{ from: 6, to: 10, attempted: 8, solved: 8 }, { from: 11, to: 15, attempted: 1, solved: 0 }])
    expect(v.head.hasLevelData).toBe(true)
    expect(ClassSubmissionViewSchema.safeParse(v).success).toBe(true)
  })

  it('התלמיד בדרגה 14 לא מסומן "תשומת לב" בגלל הכישלון הבודד; "תשומת לב" נקבעת לפי הכלל האישי בלבד', () => {
    const v = buildClassView(base())
    expect(v.roster.completed.find((c) => c.id === 'st0')!.attention).toBe(false)
  })

  it('גבול ההשוואה: עד maxGap דרגות — כן; maxGap+1 — לא', () => {
    const g = LEVEL_COMPARISON.maxGap
    const d = input(5, merge(play(0, 10, all(false)), play(1, 10 + g, all(true)), play(2, 10 - g, all(true)), play(3, 10 + g, all(true)), play(4, 10 + g + 1, all(true))))
    const m = buildStudentView(d, 'st0')!.challenges[0]
    expect(m.comparison).toMatchObject({ kind: 'compared', peers: 3, solved: 3, levelFrom: 10 - g, levelTo: 10 + g })
  })

  it('בלי נתון רמה (שיעור ישן): אין השוואה ואין פירוק; הודעה "אין נתון רמה לשיעורים שנשלחו לפני…" כשידוע מתי התחלנו לשמור', () => {
    const d = input(4, { ...merge(...[0, 1, 2, 3].map((i) => play(i, null, all(i !== 0)))), levelAvailableFrom: '2026-10-25T00:00:00.000Z' })
    const v = buildClassView(d)
    expect(v.head.hasLevelData).toBe(false)
    expect(v.head.levelNotice).toBe('אין נתון רמה לשיעורים שנשלחו לפני 25 באוקטובר 2026')
    expect(v.challenges.every((c) => (c.levelBands ?? []).length === 0)).toBe(true)
    const sv = buildStudentView(d, 'st0')!
    expect(sv.challenges[0]).toMatchObject({ level: null, comparison: { kind: 'no_level' } })
    /* שיעור שנשלח אחרי שהתחלנו לשמור רמה, אבל בלי רמה בתשובות: אין הודעה (לא נכון לומר "נשלח לפני") */
    expect(buildClassView({ ...d, levelAvailableFrom: '2026-10-01T00:00:00.000Z' }).head.levelNotice).toBeNull()
  })

  it('אתגר שהתלמיד/ה לא הגיע/ה אליו: אין השוואה', () => {
    const partial = play(0, 8, { m1: true, m2: true })
    const d = input(4, merge(partial, play(1, 8, all(true)), play(2, 8, all(true)), play(3, 8, all(true))))
    const m5 = buildStudentView(d, 'st0')!.challenges.find((c) => c.sceneId === 'm5')!
    expect(m5.outcome).toBe('not_reached')
    expect(m5.comparison).toBeUndefined()
  })
})

describe('"השיעור פתוח עד…" בראש עמוד השיעור', () => {
  const due = '2026-11-01T21:59:00.000Z' /* 23:59 שעון ישראל, 1.11 */
  const withDue = (n: number, done: number, nowMs: number): CoreInput => ({
    ...input(n, merge(...Array.from({ length: done }, (_, i) => play(i, 6, all(true))))),
    submission: { ...input(n).submission, dueAt: due }, nowMs,
  })

  it('כל עוד פתוח ויש מי שלא סיים: המשפט המדויק', () => {
    expect(buildClassView(withDue(10, 2, Date.parse('2026-10-28T10:00:00Z'))).head.openNote)
      .toBe('השיעור פתוח עד 1.11. 8 תלמידים עוד לא סיימו, ולכן התמונה עדיין חלקית.')
    expect(buildClassView(withDue(10, 9, Date.parse('2026-10-28T10:00:00Z'))).head.openNote)
      .toBe('השיעור פתוח עד 1.11. תלמיד אחד עוד לא סיים, ולכן התמונה עדיין חלקית.')
  })

  it('כולם סיימו, או שהמועד עבר, או שאין מועד — אין שורה', () => {
    expect(buildClassView(withDue(4, 4, Date.parse('2026-10-28T10:00:00Z'))).head.openNote).toBeNull()
    expect(buildClassView(withDue(10, 2, Date.parse('2026-11-05T10:00:00Z'))).head.openNote).toBeNull()
    const noDue = { ...withDue(10, 2, Date.parse('2026-10-28T10:00:00Z')) }
    noDue.submission = { ...noDue.submission, dueAt: null }
    expect(buildClassView(noDue).head.openNote).toBeNull()
  })
})

describe('איחוד טעויות נפוצות בין גרסאות אישיות', () => {
  const variantOf = (id: string, studentId: string, wrongText: string, tags: CoreOptionTag[] = []): CoreVariant => ({
    id, studentId, optionTags: tags,
    gameData: { entrySceneId: 'n0', scenes: [{ id: 'n0', title: 'פתיחה' }, { id: 'm1', title: 'אתגר 1', puzzle: { type: 'multipleChoice', question: 'שאלה 1 (גרסה)', choices: [{ id: 'a', text: 'נכון', isCorrect: true }, { id: 'b', text: wrongText, isCorrect: false }, { id: 'c', text: 'אחר', isCorrect: false }] } }] },
  })
  const variantAnswers = (i: number, vid: string): CoreAnswerRow => ({ ...ans(i, 'm1', 'b', false, 8), variantId: vid })

  it('שלושה תלמידים בגרסאות שונות של השאלה בוחרים אותה תשובה (נוסח זהה אחרי נרמול: ⅖ = 2/5) → טעות נפוצה אחת', () => {
    const d = input(3, {
      sessions: [0, 1, 2].map((i) => sess(i)),
      answers: [variantAnswers(0, 'v0'), variantAnswers(1, 'v1'), variantAnswers(2, 'v2')],
      events: [0, 1, 2].map((i) => ev(i, 'm1', false)),
      variants: [variantOf('v0', 'st0', '⅖'), variantOf('v1', 'st1', '2/5'), variantOf('v2', 'st2', ' ⅖ ')],
    })
    const v = buildClassView(d)
    expect(v.commonErrors).toHaveLength(1)
    expect(v.commonErrors[0]).toMatchObject({ studentsCount: 3, sceneId: 'm1', question: 'שאלה 1', misconceptionId: null })
    expect(v.challenges[0].commonError?.sentence).toMatch(/^3 תלמידים בחרו ״.+״$/)
  })

  it('נוסחים שונים אחרי נרמול — לא מאחדים (אין "התאמה אמינה")', () => {
    const d = input(3, {
      sessions: [0, 1, 2].map((i) => sess(i)),
      answers: [variantAnswers(0, 'v0'), variantAnswers(1, 'v1'), variantAnswers(2, 'v2')],
      events: [0, 1, 2].map((i) => ev(i, 'm1', false)),
      variants: [variantOf('v0', 'st0', '⅖'), variantOf('v1', 'st1', '⅗'), variantOf('v2', 'st2', 'שליש')],
    })
    expect(buildClassView(d).commonErrors).toEqual([])
  })

  it('אותה תפיסה שגויה (misconception_id) בנוסחים שונים בגרסאות שונות → מאוחדת לפי התגית', () => {
    const tag = (optionId: string): CoreOptionTag => ({ sceneId: 'm1', itemIndex: 0, optionId, misconceptionId: 'mc-add', title: 'חיבור מונים ומכנים', description: '', linkedQuest: null })
    const d = input(3, {
      sessions: [0, 1, 2].map((i) => sess(i)),
      answers: [variantAnswers(0, 'v0'), variantAnswers(1, 'v1'), variantAnswers(2, 'v2')],
      events: [0, 1, 2].map((i) => ev(i, 'm1', false)),
      variants: [variantOf('v0', 'st0', '⅖', [tag('b')]), variantOf('v1', 'st1', 'שני חמישים', [tag('b')]), variantOf('v2', 'st2', 'שתי חמישיות', [tag('b')])],
    })
    const v = buildClassView(d)
    expect(v.commonErrors).toHaveLength(1)
    expect(v.commonErrors[0]).toMatchObject({ misconceptionId: 'mc-add', title: 'חיבור מונים ומכנים', studentsCount: 3 })
  })

  it('אותו נוסח מתויג בשתי תגיות שונות (עמום) — בחירה בלי תגית לא מצטרפת לאף אחת', () => {
    const tag = (optionId: string, id: string): CoreOptionTag => ({ sceneId: 'm1', itemIndex: 0, optionId, misconceptionId: id, title: id, description: '', linkedQuest: null })
    const d = input(5, {
      sessions: [0, 1, 2, 3, 4].map((i) => sess(i)),
      answers: [variantAnswers(0, 'v0'), variantAnswers(1, 'v1'), variantAnswers(2, 'v2'), variantAnswers(3, 'v3'), variantAnswers(4, 'v4')],
      events: [0, 1, 2, 3, 4].map((i) => ev(i, 'm1', false)),
      variants: [variantOf('v0', 'st0', '⅖', [tag('b', 'mc-1')]), variantOf('v1', 'st1', '⅖', [tag('b', 'mc-2')]), variantOf('v2', 'st2', '⅖'), variantOf('v3', 'st3', '⅖'), variantOf('v4', 'st4', '⅖')],
    })
    const v = buildClassView(d)
    /* שני מתויגים (mc-1, mc-2) + שלושה בלי תגית בנוסח זהה: הנוסח עמום → הלא-מתויגים מתאחדים ביניהם לפי הנוסח (3) */
    expect(v.commonErrors).toHaveLength(1)
    expect(v.commonErrors[0]).toMatchObject({ misconceptionId: null, studentsCount: 3 })
  })
})

describe('normalizeOptionText', () => {
  it('ניקוד, גרשיים, פיסוק ושבר מתאחדים; ריק נשאר ריק', () => {
    expect(normalizeOptionText(' ⅖ ')).toBe(normalizeOptionText('2/5'))
    expect(normalizeOptionText('״הפרתנון״.')).toBe(normalizeOptionText('הפרתנון'))
    expect(normalizeOptionText('מַלְכוּת')).toBe(normalizeOptionText('מלכות'))
    expect(normalizeOptionText('  .. ')).toBe('')
    expect(normalizeOptionText('2/5')).not.toBe(normalizeOptionText('3/5'))
  })
})

describe('שורת הרשימה', () => {
  it('נושאת את תווית השכבה/הכיתה', () => {
    expect(buildListRow(input(3)).gradeLabel).toBe('ו׳2')
  })
})
