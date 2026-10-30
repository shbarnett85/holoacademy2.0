import { useMemo, useRef, useState } from 'react'
import type { Puzzle } from '../useGameEngine'
import { triggerErrorFlash } from './errorFlash'
import { presentQuizQuestion, quizOptionId, PUZZLE_READY_DELAY_MS, type PuzzleTelemetry } from '../../../shared/lib/answerTelemetry'
import { flyGem, revealEl, sounds, setMood } from '../gameFeel/engine'
import { RETRY_TEXT, retryHint } from '../gameFeel/text'

interface Props {
  puzzle: Puzzle
  /* score ו-correct לפי הניסיון הראשון בלבד (כיול ואנליטיקה). quizAttempts: לכל שאלה באיזה ניסיון הצליחו (1/2), או 0 */
  onResult: (r: { correct: boolean; score?: number; quizAttempts?: number[] }) => void
  /* טלמטריית תשובות (1B) — hook נפרד לצד onResult; אופציונלי ולעולם לא משפיע על הלוגיקה */
  tel?: PuzzleTelemetry
  /* הנקודות שנצברו עד עכשיו במבחן: הגביש מתמלא שאלה-שאלה */
  onLivePoints?: (points: number) => void
}

/* מבחן סיכום — רצף שאלות רב-ברירה אינטגרטיביות עם מד התקדמות,
   הסבר רספונסיבי לכל שאלה, ובסוף מחזיר ציון חלקי (נכונות/סה"כ).
   אחרי תשובה שגויה: האפשרות מסומנת וננעלת, ואפשר לבחור פעם נוספת אחת. אחרי שתי טעויות התשובה הנכונה מסומנת. */
export default function FinalQuizChallenge({ puzzle, onResult, tel, onLivePoints }: Props) {
  /* ערבוב אפשרויות בזמן ההצגה: options מעורבבים ו-correctIndex מוטמע מחדש, כך שהלוגיקה
     שלמטה (i === q.correctIndex) ממשיכה לעבוד ללא שינוי על הנתונים המוצגים. */
  const questions = useMemo(() => (puzzle.questions ?? []).map((q) => presentQuizQuestion(q)), [puzzle.questions])
  /* מתי השאלה הנוכחית הוצגה (לזמן תגובה פר-שאלה) */
  const shownAtRef = useRef(Date.now() + PUZZLE_READY_DELAY_MS)
  const total = questions.length
  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  /* נכונות בניסיון הראשון — זה מה שנכנס לכיול, כמו שהיה */
  const [correctCount, setCorrectCount] = useState(0)
  /* האפשרות השגויה של הניסיון הראשון בשאלה הנוכחית */
  const [firstWrong, setFirstWrong] = useState<number | null>(null)
  /* לכל שאלה שהסתיימה: באיזה ניסיון הצליחו (1/2), או 0 */
  const attemptsRef = useRef<number[]>([])
  const streakRef = useRef(0)
  const chosenRef = useRef<HTMLButtonElement | null>(null)

  const q = questions[idx]
  if (!q) return null
  const answered = picked !== null
  const isCorrect = picked === q.correctIndex
  const isLast = idx === total - 1

  function pick(i: number, el: HTMLButtonElement) {
    if (answered || i === firstWrong) return
    const secondAttempt = firstWrong !== null
    const right = i === q.correctIndex
    tel?.quizItem({
      itemIndex: idx, selectedOptionId: quizOptionId(q.order[i]), selectedPosition: i, correctPosition: q.correctIndex,
      displayedOrder: q.order.map(quizOptionId), isCorrect: right, shownAt: shownAtRef.current, answeredAt: Date.now(),
      attemptNo: secondAttempt ? 2 : 1,
    })
    chosenRef.current = el
    if (right) {
      attemptsRef.current = [...attemptsRef.current, secondAttempt ? 2 : 1]
      setPicked(i)
      if (!secondAttempt) setCorrectCount((c) => c + 1)
      /* הגביש מתמלא שאלה-שאלה. רק הצלחה בניסיון הראשון מאריכה רצף */
      streakRef.current = secondAttempt ? 0 : streakRef.current + 1
      sounds.correct(secondAttempt ? 1 : streakRef.current)
      setMood('happy')
      onLivePoints?.(attemptsRef.current.reduce((a, n) => a + (n === 1 ? 1 : n === 2 ? 0.5 : 0), 0) / Math.max(1, total))
      flyGem(el, 0.5)
      return
    }
    streakRef.current = 0
    triggerErrorFlash(el)
    if (secondAttempt) {
      attemptsRef.current = [...attemptsRef.current, 0]
      setPicked(i)
    } else {
      setFirstWrong(i)
    }
  }

  function next() {
    if (isLast) {
      const score = total > 0 ? correctCount / total : 0
      const quizAttempts = attemptsRef.current
      onResult({ correct: score >= 0.5, score, quizAttempts })
      return
    }
    shownAtRef.current = Date.now()
    setIdx((n) => n + 1)
    setPicked(null)
    setFirstWrong(null)
  }

  return (
    <div className="mt-3">
      <style>{`@keyframes fq-in{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}} .fq-anim{animation:fq-in 0.3s ease;}`}</style>

      {/* מד התקדמות */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold" style={{ color: 'var(--holo-cyan)' }}>שאלה {idx + 1} מתוך {total}</span>
        <span className="text-xs" style={{ opacity: 0.6 }}>✓ {correctCount}</span>
      </div>
      <div className="rounded-full overflow-hidden mb-4" style={{ height: '0.35rem', background: 'rgba(0,0,0,0.4)' }}>
        <div style={{ height: '100%', width: `${((idx + (answered ? 1 : 0)) / total) * 100}%`, background: 'linear-gradient(90deg, var(--holo-blue), var(--holo-cyan))', transition: 'width 0.4s ease' }} />
      </div>

      <div className="fq-anim" key={idx}>
        <h3 className="text-lg font-bold">{q.question}</h3>

        {!answered ? (
          <div className="flex flex-col gap-2 mt-4">
            {q.options.map((opt, i) => (
              <button
                key={i}
                className="holo-button"
                disabled={i === firstWrong}
                data-choice-state={i === firstWrong ? 'wrong' : undefined}
                style={i === firstWrong
                  ? { padding: '0.7rem', background: 'rgba(242,166,90,.09)', border: '1.5px solid #F2A65A', boxShadow: 'none', opacity: 0.75, color: 'var(--holo-text)' }
                  : { padding: '0.7rem' }}
                onClick={(e) => pick(i, e.currentTarget)}
              >
                {i === firstWrong ? '✗ ' : ''}{opt}
              </button>
            ))}
            {firstWrong !== null && (
              <p ref={revealEl} className="text-start text-sm leading-relaxed" data-retry-hint style={{ color: '#ffce5e', margin: 0 }}>
                {q.retryHint ?? retryHint(q.explanationIncorrect, q.options[q.correctIndex])} {RETRY_TEXT.tryAgain}
              </p>
            )}
          </div>
        ) : (
          <>
            {/* התשובות עם סימון נכון/שנבחר */}
            <div className="flex flex-col gap-2 mt-4">
              {q.options.map((opt, i) => {
                const right = i === q.correctIndex
                const wrongPick = (i === picked && !isCorrect) || i === firstWrong
                return (
                  <div
                    key={i}
                    className="rounded-lg p-2 text-start flex items-center gap-2"
                    style={{
                      border: right ? '1px solid rgba(0,255,150,0.5)' : wrongPick ? '1px solid rgba(255,120,150,0.5)' : '1px solid rgba(0,246,255,0.12)',
                      background: right ? 'rgba(0,255,150,0.08)' : wrongPick ? 'rgba(255,120,150,0.08)' : 'transparent',
                      opacity: right || wrongPick ? 1 : 0.55,
                    }}
                  >
                    <span>{right ? '✅' : wrongPick ? '❌' : '•'}</span>
                    <span>{opt}</span>
                  </div>
                )
              })}
            </div>

            {/* הסבר רספונסיבי */}
            <div
              className="rounded-xl p-3 mt-3 text-start"
              style={isCorrect
                ? { background: 'rgba(0,255,150,0.08)', border: '1px solid rgba(0,255,150,0.4)' }
                : { background: 'rgba(255,180,0,0.08)', border: '1px solid rgba(255,180,0,0.4)' }}
            >
              <div className="font-bold mb-1" style={{ color: isCorrect ? '#5fffb0' : '#ffce5e' }}>
                {isCorrect ? (firstWrong !== null ? RETRY_TEXT.secondTryHeader : '✓ נכון!') : '✗ לא בדיוק…'}
              </div>
              <p className="leading-relaxed text-sm">
                {isCorrect
                  ? (q.explanationCorrect ?? 'יפה מאוד!')
                  : (q.explanationIncorrect ?? `התשובה הנכונה: ${q.options[q.correctIndex]}`)}
              </p>
            </div>

            <div className="text-center mt-4">
              <button ref={revealEl} className="holo-button text-lg" style={{ padding: '0.6rem 2rem' }} onClick={next}>
                {isLast ? 'לתוצאה ←' : 'לשאלה הבאה ←'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
