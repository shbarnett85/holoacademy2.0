import { useState } from 'react'
import type { Puzzle } from '../useGameEngine'

interface Props {
  puzzle: Puzzle
  onResult: (r: { correct: boolean; score?: number }) => void
}

/* מבחן סיכום — רצף שאלות רב-ברירה אינטגרטיביות עם מד התקדמות,
   הסבר רספונסיבי לכל שאלה, ובסוף מחזיר ציון חלקי (נכונות/סה"כ). */
export default function FinalQuizChallenge({ puzzle, onResult }: Props) {
  const questions = puzzle.questions ?? []
  const total = questions.length
  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [correctCount, setCorrectCount] = useState(0)

  const q = questions[idx]
  if (!q) return null
  const answered = picked !== null
  const isCorrect = picked === q.correctIndex
  const isLast = idx === total - 1

  function pick(i: number) {
    if (answered) return
    setPicked(i)
    if (i === q.correctIndex) setCorrectCount((c) => c + 1)
  }

  function next() {
    if (isLast) {
      const score = total > 0 ? correctCount / total : 0
      onResult({ correct: score >= 0.5, score })
      return
    }
    setIdx((n) => n + 1)
    setPicked(null)
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
              <button key={i} className="holo-button" style={{ padding: '0.7rem' }} onClick={() => pick(i)}>
                {opt}
              </button>
            ))}
          </div>
        ) : (
          <>
            {/* התשובות עם סימון נכון/שנבחר */}
            <div className="flex flex-col gap-2 mt-4">
              {q.options.map((opt, i) => {
                const right = i === q.correctIndex
                const wrongPick = i === picked && !isCorrect
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
                {isCorrect ? '✓ נכון!' : '✗ לא בדיוק…'}
              </div>
              <p className="leading-relaxed text-sm">
                {isCorrect
                  ? (q.explanationCorrect ?? 'יפה מאוד!')
                  : (q.explanationIncorrect ?? `התשובה הנכונה: ${q.options[q.correctIndex]}`)}
              </p>
            </div>

            <div className="text-center mt-4">
              <button className="holo-button text-lg" style={{ padding: '0.6rem 2rem' }} onClick={next}>
                {isLast ? 'לתוצאה ←' : 'לשאלה הבאה ←'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
