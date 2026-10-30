/* ניסיון שני בבחירה מרובה ובמבחן סיכום (שלב J): הכיול והאנליטיקה רואים רק את הניסיון הראשון.
   · השורות: ניסיון ראשון attempt_no=1, ניסיון שני attempt_no=2, ו-localId שהמספר האחרון בו נשאר מספר ההצגה.
   · כיול 60/80: אותו סשן מדומה לפני השינוי ואחריו יוצא באותן רמות. בלי הניסיון השני ועם ניסיון שני מוצלח — זהה. */
import { describe, expect, it } from 'vitest'
import { buildPresentation, createPuzzleTelemetry, isRetryRow, presentChoices } from '../../../src/shared/lib/answerTelemetry.js'
import { calibrate, defaultProfileForGrade, perTypeFromChallenges } from '../../../src/shared/lib/difficultyCalibration.js'
import { challengePoints, wholeGems } from '../../../src/shared/lib/gemModel.js'

const clock = () => { let t = 1000; return () => (t += 500) }
const CHOICES = [{ id: 'a', text: 'א', isCorrect: true }, { id: 'b', text: 'ב', isCorrect: false }, { id: 'c', text: 'ג', isCorrect: false }]

function playMc(picks: string[]) {
  const tel = createPuzzleTelemetry(clock())
  const shown = presentChoices(CHOICES, { rand: () => 0 })
  tel.setDisplay(shown.displayedOrder, shown.correctPosition)
  tel.markReady()
  for (const id of picks) {
    tel.act('select', { optionId: id, position: shown.displayedOrder.indexOf(id), correct: id === 'a' })
  }
  /* correct של הכיול = הניסיון הראשון */
  const firstRight = picks[0] === 'a'
  return buildPresentation(tel, { sceneId: 's1', puzzleType: 'multipleChoice', seq: 3, result: { correct: firstRight, score: firstRight ? 1 : 0 }, puzzle: { choices: CHOICES } })
}

describe('שורות answers', () => {
  it('תשובה נכונה מיד: שורה אחת', () => {
    const r = playMc(['a'])
    expect(r.answers).toHaveLength(1)
    expect(r.answers[0]).toMatchObject({ attemptNo: 1, isCorrect: true, outcome: 'correct' })
  })
  it('טעות ואז הצלחה: שתי שורות, הראשונה נספרת', () => {
    const r = playMc(['b', 'a'])
    expect(r.answers.map((a) => [a.attemptNo, a.isCorrect, a.selectedOptionId])).toEqual([[1, false, 'b'], [2, true, 'a']])
    expect(r.answers.map((a) => a.localId)).toEqual(['s1:0:3', 's1:0:a2:3'])
    /* המזהה ייחודי, והמספר האחרון הוא מספר ההצגה */
    expect(r.answers.map((a) => a.localId.split(':').pop())).toEqual(['3', '3'])
  })
  it('שתי טעויות: שתי שורות שגויות', () => {
    const r = playMc(['b', 'c'])
    expect(r.answers.map((a) => [a.attemptNo, a.isCorrect])).toEqual([[1, false], [2, false]])
  })
  it('isRetryRow: רק ניסיון שני של בחירה מרובה / מבחן סיכום', () => {
    expect(isRetryRow('multipleChoice', 2)).toBe(true)
    expect(isRetryRow('finalQuiz', 2)).toBe(true)
    expect(isRetryRow('multipleChoice', 1)).toBe(false)
    expect(isRetryRow('multipleChoice', null)).toBe(false)
    /* בסוגים אחרים attempt_no הוא מספר הניסיונות באותה שורה, והיא נספרת */
    expect(isRetryRow('sequenceOrder', 3)).toBe(false)
    expect(isRetryRow('memory', 5)).toBe(false)
  })
})

describe('כיול 60/80: אותו סשן מדומה לפני ואחרי', () => {
  /* סשן: בכל אתגר — מה קרה בניסיון הראשון, ומה קרה בניסיון השני (לפני השינוי לא היה ניסיון שני) */
  const SESSION = [
    { puzzleType: 'multipleChoice', first: true, second: null },
    { puzzleType: 'multipleChoice', first: false, second: true },
    { puzzleType: 'multipleChoice', first: false, second: false },
    { puzzleType: 'multipleChoice', first: false, second: true },
    { puzzleType: 'multipleChoice', first: true, second: null },
    { puzzleType: 'finalQuiz', first: false, second: true },
    { puzzleType: 'trueFalse', first: true, second: null },
    { puzzleType: 'memory', first: true, second: null },
  ] as const
  const prev = defaultProfileForGrade('ו׳')

  /* לפני: אתגר נכשל = correct:false, ואין ניסיון נוסף */
  const before = SESSION.map((c) => ({ puzzleType: c.puzzleType, correct: c.first }))
  /* אחרי: מה שהנגן שולח — correct הוא הניסיון הראשון; ההצלחה בניסיון השני נכנסת רק לשכבת המשחק */
  const after = SESSION.map((c) => ({
    puzzleType: c.puzzleType,
    correct: c.first,
    gemPoints: challengePoints({ type: c.puzzleType, solved: c.first || c.second === true, solvedOnAttempt: c.first ? 1 : 2 }),
  }))

  it('הרמות זהות', () => {
    const a = calibrate(prev, { perType: perTypeFromChallenges(before), avgSceneMs: 12000 })
    const b = calibrate(prev, { perType: perTypeFromChallenges(after), avgSceneMs: 12000 })
    expect(b).toEqual(a)
  })
  it('בקרה: אילו הניסיון השני היה נספר, הרמות היו יוצאות אחרת (הבדיקה באמת מבחינה)', () => {
    const wrong = SESSION.map((c) => ({ puzzleType: c.puzzleType, correct: c.first || c.second === true }))
    const a = calibrate(prev, { perType: perTypeFromChallenges(before), avgSceneMs: 12000 })
    const b = calibrate(prev, { perType: perTypeFromChallenges(wrong), avgSceneMs: 12000 })
    expect(b.profile).not.toEqual(a.profile)
  })
  it('שכבת המשחק כן רואה את הניסיון השני', () => {
    const points = after.reduce((s, c) => s + c.gemPoints, 0)
    expect(points).toBe(5.5)
    expect(wholeGems(points, after.length)).toBe(3)
    expect(wholeGems(before.filter((c) => c.correct).length, before.length)).toBe(2)
  })
})
