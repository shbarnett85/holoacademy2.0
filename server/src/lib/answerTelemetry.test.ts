import { describe, it, expect } from 'vitest'
import {
  createPuzzleTelemetry, buildPresentation, presentChoices, presentQuizQuestion, isTrueFalse, quizOptionId,
  shuffleIndices, wordCount, slideWordCount, capInteraction, MAX_INTERACTION_EVENTS, MAX_INTERACTION_BYTES,
  type FinishInput,
} from '../../../src/shared/lib/answerTelemetry.js'
import { parseAnswers, parseGateEvents, parseMoral, toAnswerRow, capJsonBytes, toGateEventRow } from './answerWriter.js'
import { simulateSession, behaviorForIndex, CLASS_BEHAVIORS } from './demoSim.js'
import { perTypeFromChallenges, calibrate, defaultProfileForGrade } from '../../../src/shared/lib/difficultyCalibration.js'

/* PRNG דטרמיניסטי */
function mulberry(seed: number) {
  let a = seed >>> 0
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

/* שעון וירטואלי + עזרי מדידה */
function session() {
  let clock = 0
  const tel = createPuzzleTelemetry(() => clock)
  tel.markReady()
  return { tel, step: (ms: number) => { clock += ms } }
}
const base = (over: Partial<FinishInput> & Pick<FinishInput, 'puzzleType'>): FinishInput => ({ sceneId: 's1', seq: 1, result: { correct: true, score: 1 }, puzzle: {}, ...over })

describe('ערבוב בזמן הצגה — נכונות נשמרת', () => {
  const choices = [
    { id: 'a', text: 'א', isCorrect: false },
    { id: 'b', text: 'ב', isCorrect: true },
    { id: 'c', text: 'ג', isCorrect: false },
    { id: 'd', text: 'ד', isCorrect: false },
  ]
  it('בכל ערבוב: הנכונה נשארת אותו option_id ו-correctPosition מצביע עליה', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const p = presentChoices(choices, { rand: mulberry(seed) })
      expect(p.choices).toHaveLength(4)
      expect(new Set(p.displayedOrder)).toEqual(new Set(['a', 'b', 'c', 'd']))
      expect(p.choices[p.correctPosition].id).toBe('b')
      /* בחירה לפי מיקום מוצג → isCorrect זהה למקורי לפי option_id */
      p.choices.forEach((c, pos) => {
        const original = choices.find((x) => x.id === p.displayedOrder[pos])!
        expect(c.isCorrect).toBe(original.isCorrect)
      })
    }
  })
  it('הערבוב באמת משנה סדר (התפלגות מיקום התשובה הנכונה אחידה בערך)', () => {
    const hits = [0, 0, 0, 0]
    const rand = mulberry(7)
    for (let i = 0; i < 2000; i++) hits[presentChoices(choices, { rand }).correctPosition]++
    for (const h of hits) expect(h).toBeGreaterThan(400)
    expect(hits[0] / 2000).toBeLessThan(0.35)
  })
  it('נכון/לא-נכון: סדר קבוע, בלי ערבוב', () => {
    const tf = [{ id: 't', text: 'נכון', isCorrect: false }, { id: 'f', text: 'לא נכון', isCorrect: true }]
    expect(isTrueFalse('trueFalse', tf)).toBe(true)
    expect(isTrueFalse(undefined, tf)).toBe(true)
    expect(isTrueFalse('multipleChoice', choices)).toBe(false)
    for (let seed = 1; seed < 50; seed++) {
      const p = presentChoices(tf, { fixed: true, rand: mulberry(seed) })
      expect(p.displayedOrder).toEqual(['t', 'f'])
      expect(p.correctPosition).toBe(1)
    }
  })
  it('מבחן סיכום: options מעורבבים, correctIndex מוטמע, option_id מקורי נשמר', () => {
    const q = { question: 'ש', options: ['x0', 'x1', 'x2', 'x3'], correctIndex: 2 }
    for (let seed = 1; seed <= 200; seed++) {
      const pq = presentQuizQuestion(q, mulberry(seed))
      expect(pq.options[pq.correctIndex]).toBe('x2')
      expect(pq.order[pq.correctIndex]).toBe(2)
      expect(pq.order.map(quizOptionId)[pq.correctIndex]).toBe('o2')
      expect([...pq.options].sort()).toEqual(['x0', 'x1', 'x2', 'x3'])
    }
  })
  it('shuffleIndices הוא פרמוטציה', () => {
    const p = shuffleIndices(9, mulberry(3))
    expect([...p].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
  })
})

describe('buildPresentation — שורת answers לכל סוג אתגר (משחק מדומה)', () => {
  it('בחירה מרובה — נכון: אפשרות, מיקום, סדר הצגה, זמן תגובה נקי', () => {
    const { tel, step } = session()
    const choices = [{ id: 'a', text: '', isCorrect: false }, { id: 'b', text: '', isCorrect: true }, { id: 'c', text: '', isCorrect: false }]
    const p = presentChoices(choices, { rand: mulberry(5) })
    tel.setDisplay(p.displayedOrder, p.correctPosition)
    step(3200)
    tel.act('select', { optionId: 'b', position: p.correctPosition })
    const rec = buildPresentation(tel, base({ puzzleType: 'multipleChoice' }))
    expect(rec.answers).toHaveLength(1)
    const a = rec.answers[0]
    expect(a).toMatchObject({ itemIndex: 0, puzzleType: 'multipleChoice', selectedOptionId: 'b', outcome: 'correct', isCorrect: true, attemptNo: 1, responseMs: 3200 })
    expect(a.selectedPosition).toBe(p.correctPosition)
    expect(a.correctPosition).toBe(p.correctPosition)
    expect(a.displayedOrder).toEqual(p.displayedOrder)
    expect(a.localId).toBe('s1:0:1')
  })

  it('בחירה מרובה — שגוי: האפשרות שנבחרה והמיקום שלה (לא רק false)', () => {
    const { tel, step } = session()
    tel.setDisplay(['c', 'a', 'b'], 2)
    step(1800)
    tel.act('select', { optionId: 'c', position: 0 })
    const a = buildPresentation(tel, base({ puzzleType: 'multipleChoice', result: { correct: false, score: 0 } })).answers[0]
    expect(a).toMatchObject({ selectedOptionId: 'c', selectedPosition: 0, correctPosition: 2, outcome: 'wrong', isCorrect: false })
  })

  it('נכון/לא-נכון', () => {
    const { tel, step } = session()
    tel.setDisplay(['t', 'f'], 1)
    step(900)
    tel.act('select', { optionId: 't', position: 0 })
    const a = buildPresentation(tel, base({ puzzleType: 'trueFalse', result: { correct: false } })).answers[0]
    expect(a).toMatchObject({ puzzleType: 'trueFalse', selectedOptionId: 't', selectedPosition: 0, correctPosition: 1, displayedOrder: ['t', 'f'], outcome: 'wrong' })
  })

  it('SequenceOrder — הסדר שהוגש בכל ניסיון + מספר הניסיון', () => {
    const { tel, step } = session()
    tel.setDisplay(['i3', 'i1', 'i2'], -1)
    step(5000); tel.act('submit', { order: ['i3', 'i1', 'i2'], correct: false })
    step(4000); tel.act('submit', { order: ['i1', 'i3', 'i2'], correct: false })
    step(3000); tel.act('submit', { order: ['i1', 'i2', 'i3'], correct: true })
    const a = buildPresentation(tel, base({ puzzleType: 'sequenceOrder' })).answers[0]
    expect(a.attemptNo).toBe(3)
    const it = a.interaction as { attempts: { attempt: number; order: string[]; correct: boolean }[]; initialOrder: string[] }
    expect(it.attempts.map((x) => x.order.join(','))).toEqual(['i3,i1,i2', 'i1,i3,i2', 'i1,i2,i3'])
    expect(it.attempts.map((x) => x.correct)).toEqual([false, false, true])
    expect(it.initialOrder).toEqual(['i3', 'i1', 'i2'])
    expect(a.responseMs).toBe(12000)
  })

  it('TileSwap — רצף החלפות מאיפה לאן, ואילו שגויות', () => {
    const { tel, step } = session()
    step(1000); tel.act('swap', { from: 0, to: 3, tiles: [3, 0], bad: true })
    step(1000); tel.act('swap', { from: 1, to: 2, tiles: [2, 1], bad: false })
    step(1000); tel.act('swap', { from: 4, to: 5, tiles: [5, 4], bad: true })
    const a = buildPresentation(tel, base({ puzzleType: 'tileSwap', result: { correct: false } })).answers[0]
    const it = a.interaction as { swaps: { from: number; to: number; bad: boolean; t: number }[]; badSwaps: number }
    expect(it.swaps).toHaveLength(3)
    expect(it.swaps[0]).toMatchObject({ from: 0, to: 3, bad: true, t: 1000 })
    expect(it.badSwaps).toBe(2)
    expect(a.outcome).toBe('wrong')
  })

  it('TileSwap — "ויתור על האתגר" → gave_up (וב-events הישן עדיין puzzle_failed)', () => {
    const { tel, step } = session()
    step(2000); tel.act('swap', { from: 0, to: 1, tiles: [1, 0], bad: true })
    step(500); tel.act('gave_up')
    const rec = buildPresentation(tel, base({ puzzleType: 'tileSwap', result: { correct: false } }))
    expect(rec.answers[0].outcome).toBe('gave_up')
    expect(rec.answers[0].isCorrect).toBe(false)
    expect(rec.answers[0].responseMs).toBe(2500)
  })

  it('Memory — רצף היפוכים (קלף, זוג, חותמת) ועד 200 היפוכים', () => {
    const { tel, step } = session()
    tel.act('flip', { card: 0, pair: 0 }); step(800)
    tel.act('flip', { card: 3, pair: 1 }); tel.act('pair', { a: 0, b: 3, match: false })
    step(900); tel.act('flip', { card: 0, pair: 0 }); step(700); tel.act('flip', { card: 1, pair: 0 }); tel.act('pair', { a: 0, b: 1, match: true })
    const a = buildPresentation(tel, base({ puzzleType: 'memory' })).answers[0]
    const it = a.interaction as { flips: { card: number; pair: number; t: number }[]; pairs: { match: boolean }[]; mistakes: number }
    expect(it.flips.map((f) => f.card)).toEqual([0, 3, 0, 1])
    expect(it.pairs.map((p) => p.match)).toEqual([false, true])
    expect(it.mistakes).toBe(1)
    expect(a.attemptNo).toBe(2)

    /* 500 היפוכים → נחתך ל-200 ומסומן */
    const big = session()
    for (let i = 0; i < 500; i++) { big.step(100); big.tel.act('flip', { card: i % 8, pair: (i % 8) >> 1 }) }
    const b = buildPresentation(big.tel, base({ puzzleType: 'memory' })).answers[0]
    const bi = b.interaction as { flips: unknown[]; truncated?: boolean }
    expect(bi.flips.length).toBeLessThanOrEqual(MAX_INTERACTION_EVENTS)
    expect(bi.truncated).toBe(true)
    expect(JSON.stringify(b.interaction).length).toBeLessThanOrEqual(MAX_INTERACTION_BYTES)
  })

  it('FinalQuiz — שורה לכל שאלה (item_index), לא רק ציון כולל', () => {
    const { tel } = session()
    const mk = (i: number, shown: number, ans: number, pos: number, correctPos: number) => tel.quizItem({
      itemIndex: i, selectedOptionId: quizOptionId(pos), selectedPosition: pos, correctPosition: correctPos,
      displayedOrder: ['o2', 'o0', 'o1'], isCorrect: pos === correctPos, shownAt: shown, answeredAt: ans,
    })
    mk(0, 0, 4000, 0, 0)
    mk(1, 4500, 9500, 2, 1)
    mk(2, 10000, 12500, 1, 1)
    const rec = buildPresentation(tel, base({ puzzleType: 'finalQuiz', result: { correct: true, score: 2 / 3 } }))
    expect(rec.answers).toHaveLength(3)
    expect(rec.answers.map((a) => a.itemIndex)).toEqual([0, 1, 2])
    expect(rec.answers.map((a) => a.outcome)).toEqual(['correct', 'wrong', 'correct'])
    expect(rec.answers.map((a) => a.responseMs)).toEqual([4000, 5000, 2500])
    expect(new Set(rec.answers.map((a) => a.localId)).size).toBe(3)
  })

  it('WordCompletion — הערך שהוקלד בכל ניסיון', () => {
    const { tel, step } = session()
    step(3000); tel.act('attempt', { value: 'שמש', blank: 0, correct: false })
    step(2000); tel.act('attempt', { value: 'ירח', blank: 0, correct: true })
    const a = buildPresentation(tel, base({ puzzleType: 'wordCompletion' })).answers[0]
    expect(a.attemptNo).toBe(2)
    const it = a.interaction as { attempts: { value: string; correct: boolean }[] }
    expect(it.attempts.map((x) => x.value)).toEqual(['שמש', 'ירח'])
  })

  it('WordSearch — מילים שנמצאו ומתי; פקיעת טיימר → timeout', () => {
    const { tel, step } = session()
    step(8000); tel.act('word_found', { word: 'כוכב' })
    step(22000); tel.act('word_found', { word: 'ירח' })
    step(30000); tel.act('timeout')
    const a = buildPresentation(tel, base({ puzzleType: 'wordSearch', result: { correct: false } })).answers[0]
    expect(a.outcome).toBe('timeout')
    const it = a.interaction as { found: { word: string; t: number }[]; foundCount: number }
    expect(it.found.map((f) => f.word)).toEqual(['כוכב', 'ירח'])
    expect(it.found[1].t).toBe(30000)
    expect(a.responseMs).toBe(60000)
  })

  it('Hangman — האותיות לפי סדר הניחוש ומה שגוי', () => {
    const { tel, step } = session()
    step(1500); tel.act('letter', { letter: 'א', correct: true })
    step(1500); tel.act('letter', { letter: 'ק', correct: false })
    step(1500); tel.act('letter', { letter: 'ב', correct: true })
    const a = buildPresentation(tel, base({ puzzleType: 'hangman' })).answers[0]
    const it = a.interaction as { letters: { letter: string; correct: boolean }[]; wrongLetters: string[] }
    expect(it.letters.map((l) => l.letter)).toEqual(['א', 'ק', 'ב'])
    expect(it.wrongLetters).toEqual(['ק'])
  })

  it('MoralDilemma — לא נכנס ל-answers; רק moral (בלי student/session)', () => {
    const { tel, step } = session()
    step(7000); tel.act('moral_choice', { index: 2 })
    const rec = buildPresentation(tel, base({ puzzleType: 'moralDilemma' }))
    expect(rec.answers).toHaveLength(0)
    expect(rec.moral).toEqual({ sceneId: 's1', optionId: 'm2' })
  })

  it('פתיחה וסגירה בלי לענות → outcome=closed', () => {
    const { tel, step } = session()
    step(2500); tel.act('closed')
    const rec = buildPresentation(tel, base({ puzzleType: 'tileSwap', result: null }))
    expect(rec.answers[0]).toMatchObject({ outcome: 'closed', isCorrect: false, responseMs: 2500 })
  })

  it('פעולה לפני סיום האנימציה: הזמן נמדד מהפעולה (לא שלילי)', () => {
    let clock = 0
    const tel = createPuzzleTelemetry(() => clock)
    clock = 100; tel.act('select', { optionId: 'a', position: 0 })
    const a = buildPresentation(tel, base({ puzzleType: 'multipleChoice' })).answers[0]
    expect(a.responseMs).toBe(0)
  })
})

describe('ספירת מילים ושמירה על תקרות', () => {
  it('wordCount / slideWordCount', () => {
    expect(wordCount('')).toBe(0)
    expect(wordCount('  שלום   עולם  ')).toBe(2)
    expect(slideWordCount({ narrative: 'אחת שתיים שלוש', drHoloDialog: 'ארבע חמש' })).toBe(5)
    expect(slideWordCount({})).toBe(0)
  })
  it('capInteraction חותך לתקרת בתים', () => {
    const big = { events: Array.from({ length: 150 }, (_, i) => ({ k: 'flip', t: i, card: i, pad: 'x'.repeat(160) })) }
    const c = capInteraction(big) as { events: unknown[]; truncated?: boolean }
    expect(JSON.stringify(c).length).toBeLessThanOrEqual(MAX_INTERACTION_BYTES)
    expect(c.truncated).toBe(true)
    expect(c.events.length).toBeLessThan(150)
  })
})

describe('שרת — answerWriter: פרסור סובלני, subject/class מהשרת', () => {
  const good = {
    clientEventId: 'sess:s1:0:1', sceneId: 's1', itemIndex: 0, puzzleType: 'multipleChoice',
    selectedOptionId: 'b', selectedPosition: 1, correctPosition: 1, displayedOrder: ['a', 'b'],
    isCorrect: true, attemptNo: 1, responseMs: 2300, outcome: 'correct', interaction: { events: [] },
  }
  it('שורה פגומה נזרקת ולא מפילה את השאר', () => {
    const rows = parseAnswers([good, { ...good, outcome: 'שגוי' }, { nope: 1 }, null, { ...good, clientEventId: 'sess:s2:0:1', sceneId: 's2' }])
    expect(rows).toHaveLength(2)
  })
  it('תקרת שורות', () => {
    const many = Array.from({ length: 700 }, (_, i) => ({ ...good, clientEventId: 'e' + i + 'xx' }))
    expect(parseAnswers(many).length).toBe(400)
  })
  it('toAnswerRow: subject/class/student מההקשר בשרת, schema_version=1, is_correct נגזר מ-outcome', () => {
    const [a] = parseAnswers([{ ...good, isCorrect: true, outcome: 'wrong', subject_id: 'EVIL', class_id: 'EVIL', studentId: 'EVIL' }])
    const row = toAnswerRow(a, { sessionId: 'S', studentId: 'U', classId: 'C', questId: 'Q', variantId: 'V', subjectId: 'SUB' })
    expect(row).toMatchObject({ session_id: 'S', student_id: 'U', class_id: 'C', quest_id: 'Q', variant_id: 'V', subject_id: 'SUB', schema_version: 1, is_synthetic: false, is_correct: false, outcome: 'wrong' })
    expect(JSON.stringify(row)).not.toContain('EVIL')
  })
  it('capJsonBytes חותך מערכים פנימיים', () => {
    const o = { flips: Array.from({ length: 400 }, (_, i) => ({ card: i, pair: i, t: i * 100 })) }
    const c = capJsonBytes(o)!
    expect(JSON.stringify(c).length).toBeLessThanOrEqual(MAX_INTERACTION_BYTES)
    expect(c.truncated).toBe(true)
  })
  it('אירועי שערים: payload מצומצם למפתחות מותרים; moral פגום נזרק', () => {
    const g = parseGateEvents([{ type: 'item_used_wrong', sceneId: 's3', payload: { itemId: 'key1', sceneId: 'gate', evil: 'x' }, clientTs: 5 }, { type: 'nope', sceneId: null, payload: {}, clientTs: 1 }])
    expect(g).toHaveLength(1)
    const row = toGateEventRow(g[0], { session_id: 'S', user_id: 'U', quest_id: 'Q' })
    expect(row.payload).toEqual({ clientTs: 5, itemId: 'key1', sceneId: 'gate' })
    expect(parseMoral([{ sceneId: 's', optionId: 'm1' }, { bad: 1 }])).toHaveLength(1)
  })
})

describe('demoSim → answers באותה סכמה + דפוסי התנהגות', () => {
  const gd = {
    scenes: [
      { id: 's0', narrative: 'a b c d e f g h i j', puzzle: undefined },
      ...Array.from({ length: 6 }, (_, i) => ({ id: 'm' + i, narrative: 'מילים רבות כדי לבדוק ספירה', puzzle: { type: 'multipleChoice', difficulty: 5, choices: ['a', 'b', 'c', 'd'].map((id, k) => ({ id, text: id, isCorrect: k === 1 })) } })),
      { id: 'mem', puzzle: { type: 'memory', difficulty: 5, pairs: Array.from({ length: 5 }, (_, k) => ({ a: 'a' + k, b: 'b' + k })) } },
      { id: 'q', puzzle: { type: 'finalQuiz', difficulty: 5, questions: [0, 1, 2].map(() => ({ question: 'q', options: ['x', 'y', 'z'], correctIndex: 0 })) } },
    ],
  }
  const sim = (studentId: string, behavior?: 'position_bias' | 'random_memory' | 'skipper' | 'improver', tier: 'strong' | 'medium' | 'struggling' = 'medium', progress?: number) =>
    simulateSession({ studentId, questId: 'q1', tier, gameData: gd, questIndex: 0, behavior, progress })

  it('כל חידה → שורת answers; מבחן סיכום → שורה לכל שאלה; מזהים ייחודיים', () => {
    const s = sim('stu-a')
    expect(s.answers.filter((a) => a.puzzleType === 'finalQuiz')).toHaveLength(3)
    expect(new Set(s.answers.map((a) => a.localId)).size).toBe(s.answers.length)
    for (const a of s.answers) {
      expect(['correct', 'wrong', 'timeout', 'gave_up', 'closed']).toContain(a.outcome)
      expect(a.isCorrect).toBe(a.outcome === 'correct')
    }
    const mc = s.answers.find((a) => a.puzzleType === 'multipleChoice' && a.outcome !== 'closed')!
    expect(mc.displayedOrder).toHaveLength(4)
    expect(mc.selectedPosition).not.toBeNull()
    expect(mc.displayedOrder![mc.correctPosition!]).toBe('b')
  })
  it('דטרמיניסטי: אותו תלמיד+שיעור → אותן שורות', () => {
    expect(JSON.stringify(sim('stu-x').answers)).toBe(JSON.stringify(sim('stu-x').answers))
  })
  it('התנהגות אינה משנה את תוצאות הליבה (challenges) — רק שורות answers וזמנים', () => {
    const a = sim('stu-y')
    const b = sim('stu-y', 'position_bias')
    expect(JSON.stringify(a.challenges)).toBe(JSON.stringify(b.challenges))
  })
  it('הטיית מיקום: בטעויות תמיד המיקום הראשון', () => {
    let wrong = 0, atZero = 0
    for (let i = 0; i < 40; i++) {
      for (const a of sim('bias-' + i, 'position_bias', 'struggling').answers) {
        if (a.puzzleType === 'multipleChoice' && a.outcome === 'wrong') { wrong++; if (a.selectedPosition === 0 || (a.correctPosition === 0 && a.selectedPosition === 1)) atZero++ }
      }
    }
    expect(wrong).toBeGreaterThan(20)
    expect(atZero / wrong).toBeGreaterThan(0.95)
  })
  it('משחק זיכרון באקראי: היפוכים מהירים ופסילות רבות גם בהצלחה', () => {
    const randomMem = sim('mem-1', 'random_memory').answers.find((a) => a.puzzleType === 'memory' && a.outcome !== 'closed')!
    const normal = sim('mem-1').answers.find((a) => a.puzzleType === 'memory' && a.outcome !== 'closed')!
    const gap = (a: typeof randomMem) => {
      const f = (a.interaction as { flips: { t: number }[] }).flips
      return f.length > 1 ? (f[f.length - 1].t - f[0].t) / (f.length - 1) : 9e9
    }
    expect(gap(randomMem)).toBeLessThan(gap(normal))
    expect((randomMem.interaction as { mistakes: number }).mistakes).toBeGreaterThanOrEqual(10)
  })
  it('מדלג על קריאה: שהייה סגורה זעירה ביחס למספר המילים, ודגל skipping', () => {
    const s = sim('skip-1', 'skipper', 'struggling')
    const long = s.sceneTimes.filter((t) => t.wordCount >= 4)
    expect(long.length).toBeGreaterThan(0)
    for (const t of long) expect(t.closedDwellMs / t.wordCount).toBeLessThan(400) // < 0.4ש׳ למילה
    expect(s.summary!.avgSceneMs).toBeLessThan(3000)
  })
  it('משתפר: ההצלחה עולה עם ההתקדמות בציר הזמן', () => {
    const rate = (progress: number) => {
      let sum = 0
      for (let i = 0; i < 30; i++) sum += sim('imp-' + i, 'improver', 'medium', progress).summary!.successRate
      return sum / 30
    }
    expect(rate(1)).toBeGreaterThan(rate(0) + 0.25)
  })
  it('התנהגויות מוגדרות לכיתה של 12', () => {
    expect(Object.values(CLASS_BEHAVIORS).sort()).toEqual(['improver', 'position_bias', 'random_memory', 'skipper'])
    expect(behaviorForIndex(6)).toBe('position_bias')
    expect(behaviorForIndex(0)).toBeUndefined()
  })
})

describe('כיול 60/80 — לא זז (לפני/אחרי על אותו סשן)', () => {
  /* ה-payload של challenges ושל summary זהה בין ישן לחדש; הכיול מקבל רק אותם. בדיקה שהוספת
     שדות הטלמטריה לא משנה את הרמות שיוצאות מאותו קלט. */
  const challenges = [
    { puzzleType: 'multipleChoice', correct: true }, { puzzleType: 'multipleChoice', correct: true }, { puzzleType: 'multipleChoice', correct: true },
    { puzzleType: 'trueFalse', correct: false }, { puzzleType: 'trueFalse', correct: false },
    { puzzleType: 'memory', correct: true }, { puzzleType: 'sequenceOrder', correct: false }, { puzzleType: 'finalQuiz', correct: true },
  ]
  it('רמות זהות עם ובלי answers/closedDwell/word_count', () => {
    const prev = defaultProfileForGrade('ז׳3')
    const perType = perTypeFromChallenges(challenges)
    const before = calibrate(prev, { perType, avgSceneMs: 14000 })
    /* "אחרי": אותו קלט, כשה-payload נושא גם טלמטריה — הכיול לא קורא אותה */
    const withTelemetry = challenges.map((c) => ({ ...c, answers: [{ outcome: c.correct ? 'correct' : 'wrong' }], interaction: { events: [] } }))
    const after = calibrate(prev, { perType: perTypeFromChallenges(withTelemetry), avgSceneMs: 14000 })
    expect(after).toEqual(before)
    expect(before.profile.perPuzzleLevel.multipleChoice).toBe(prev.perPuzzleLevel.multipleChoice + 1)
    expect(before.profile.perPuzzleLevel.trueFalse).toBe(prev.perPuzzleLevel.trueFalse - 1)
  })
})
