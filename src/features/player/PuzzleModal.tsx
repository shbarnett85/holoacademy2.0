import { useRef, useState } from 'react'
import { puzzleTypeLabel } from '../../shared/lib/labels'
import type { Puzzle } from './useGameEngine'
import TileSwapChallenge from './challenges/TileSwapChallenge'
import WordSearchChallenge from './challenges/WordSearchChallenge'
import MemoryChallenge from './challenges/MemoryChallenge'
import WordCompletionChallenge from './challenges/WordCompletionChallenge'
import SequenceOrderChallenge from './challenges/SequenceOrderChallenge'
import HangmanChallenge from './challenges/HangmanChallenge'
import FinalQuizChallenge from './challenges/FinalQuizChallenge'
import MoralDilemmaChallenge from './challenges/MoralDilemmaChallenge'
import { triggerErrorFlash } from './challenges/errorFlash'

interface Props {
  puzzle: Puzzle
  /* תמונת הסצנה — לפאזל ההזזה */
  imageUrl?: string
  onSolve: (correct: boolean, score?: number) => void
  onClose: () => void
  /* "המשך ←" אחרי ההסבר — הדרך היחידה להתקדם */
  onContinue: () => void
  /* אם האתגר מסתיים באיסוף מפתח — מחליפים את "המשך" בכפתור איסוף ישיר (פישוט התהליך) */
  onCollect?: () => void
  collectLabel?: string
}

interface Result { correct: boolean; score: number }

/* רוחב המודאל לפי סוג האתגר — חלקם דורשים שטח רחב יותר */
function maxWidthFor(type?: string): string {
  switch (type) {
    case 'tileSwap':
    case 'slidingPuzzle':
    case 'wordSearch':
    case 'memory':
    case 'sequenceOrder':
    case 'hangman':
    case 'finalQuiz':
    case 'moralDilemma':
      return '34rem'
    default:
      return '28rem'
  }
}

/* מודאל אתגר הולוגרפי — אתגר אינטראקטיבי → פאנל תוצאה/הסבר → המשך */
export default function PuzzleModal({ puzzle, imageUrl, onSolve, onClose, onContinue, onCollect, collectLabel }: Props) {
  const [result, setResult] = useState<Result | null>(null)
  /* הגנה מלחיצה כפולה — ה-state אסינכרוני, ה-ref מיידי */
  const lockedRef = useRef(false)

  function handleResult(r: { correct: boolean; score?: number }) {
    if (lockedRef.current) return
    lockedRef.current = true
    const score = r.score ?? (r.correct ? 1 : 0)
    setResult({ correct: r.correct, score })
    onSolve(r.correct, score)
  }

  const type = puzzle.type
  const correctChoiceText = puzzle.choices?.find((c) => c.isCorrect)?.text

  /* ── פאנל התוצאה: הסבר מעמיק / סיכום מבחן / הצלחה-כישלון ── */
  function renderResult(res: Result) {
    let header: string
    let body: string
    const good = res.correct

    if (type === 'finalQuiz') {
      const n = puzzle.questions?.length ?? 0
      const correctCount = Math.round(res.score * n)
      header = `ענית נכון על ${correctCount} מתוך ${n}`
      body =
        res.score === 1
          ? 'מבחן מושלם! שליטה מלאה בחומר! 🌟'
          : res.score >= 0.5
            ? 'כל הכבוד — תפסת את עיקרי החומר!'
            : 'שווה לחזור על החומר ולנסות שוב במסע הבא.'
    } else if (type === 'multipleChoice' || type === 'trueFalse' || type === 'wordCompletion' || !type) {
      header = good ? '✓ תשובה נכונה! 💎' : '✗ לא בדיוק…'
      /* בכישלון מציגים את התשובה הנכונה: השלמת מילים → ה-answer; רב-ברירה → הבחירה הנכונה */
      const wcAnswer = puzzle.answers && puzzle.answers.length > 0 ? puzzle.answers.join(', ') : puzzle.answer
      const correctText = type === 'wordCompletion' ? wcAnswer : correctChoiceText
      body = good
        ? (puzzle.explanationCorrect ?? 'נכון מאוד!')
        : (puzzle.explanationIncorrect ??
          (correctText ? `התשובה הנכונה היא: ${correctText}` : 'נסו לזכור להבא!'))
    } else {
      /* אתגרים אינטראקטיביים (פאזל/חיפוש/זיכרון) */
      header = good ? '✓ כל הכבוד! פתרת את האתגר 💎' : '✗ האתגר לא הושלם'
      body = good ? 'הרסיסים שלך! 💠' : 'לא נורא — אפשר לנסות שוב במסע הבא.'
    }

    return (
      <div
        className="rounded-xl p-4 mt-4 text-start"
        style={good
          ? { background: 'rgba(0,255,150,0.08)', border: '1px solid rgba(0,255,150,0.45)' }
          : { background: 'rgba(255,180,0,0.08)', border: '1px solid rgba(255,180,0,0.45)' }}
      >
        <div className="font-bold mb-2" style={{ color: good ? '#5fffb0' : '#ffce5e' }}>{header}</div>
        <p className="leading-relaxed" style={{ color: 'var(--holo-text)' }}>{body}</p>
        <div className="text-center mt-4">
          {onCollect ? (
            /* האתגר הסתיים עם מפתח לאיסוף — כפתור איסוף ישיר במקום "המשך" (פחות לחיצות) */
            <button
              className="holo-button text-lg"
              style={{ padding: '0.7rem 2rem', background: 'linear-gradient(135deg, #6633cc, #0062cc)' }}
              onClick={onCollect}
            >
              {collectLabel ?? 'אספו את המפתח 🔑'}
            </button>
          ) : (
            <button className="holo-button text-lg" style={{ padding: '0.7rem 2.5rem' }} onClick={onContinue}>
              המשך ←
            </button>
          )}
        </div>
      </div>
    )
  }

  /* ── ניתוב לאתגר המתאים ── */
  function renderChallenge() {
    switch (type) {
      case 'tileSwap':
      case 'slidingPuzzle':
        return <TileSwapChallenge puzzle={puzzle} imageUrl={imageUrl} onResult={handleResult} />
      case 'wordSearch':
        return <WordSearchChallenge puzzle={puzzle} onResult={handleResult} />
      case 'memory':
        return <MemoryChallenge puzzle={puzzle} onResult={handleResult} />
      case 'wordCompletion':
        return <WordCompletionChallenge puzzle={puzzle} onResult={handleResult} />
      case 'sequenceOrder':
        return <SequenceOrderChallenge puzzle={puzzle} onResult={handleResult} />
      case 'hangman':
        return <HangmanChallenge puzzle={puzzle} onResult={handleResult} />
      case 'finalQuiz':
        return <FinalQuizChallenge puzzle={puzzle} onResult={handleResult} />
      default:
        /* multipleChoice / trueFalse / ברירת מחדל — שאלה + תשובות */
        if (puzzle.choices && puzzle.choices.length > 0) {
          return (
            <>
              <h3 className="text-xl font-bold mt-4">{puzzle.question}</h3>
              <div className="flex flex-col gap-3 mt-5">
                {puzzle.choices.map((c) => (
                  <button key={c.id} className="holo-button" style={{ padding: '0.8rem' }} onClick={() => { if (!c.isCorrect) triggerErrorFlash(); handleResult({ correct: c.isCorrect }) }}>
                    {c.text}
                  </button>
                ))}
              </div>
            </>
          )
        }
        /* חידה ללא נתונים תקינים — דילוג בטוח */
        return (
          <>
            <h3 className="text-xl font-bold mt-4">{puzzle.question}</h3>
            <p className="mt-3" style={{ opacity: 0.6 }}>לא ניתן להציג אתגר זה.</p>
            <button className="holo-button mt-4" onClick={() => handleResult({ correct: true })}>המשך ←</button>
          </>
        )
    }
  }

  return (
    /* פאנל inline — מוצג *במקום* הנרטיב בתוך זרימת הסצנה (לא מודאל צף, אין שכבת כיסוי).
       הקריאוּת מובטחת ע"י רקע ה-holo-panel עצמו. */
    <div
      className="holo-panel w-full text-center mx-auto"
      style={{ maxWidth: maxWidthFor(type), boxShadow: 'var(--holo-glow)', maxHeight: 'calc(100vh - 12rem)', overflowY: 'auto' }}
    >
        <span className="text-xs rounded-full px-3 py-1" style={{ background: 'rgba(0,136,255,0.2)', border: '1px solid rgba(0,136,255,0.4)' }}>
          {type === 'finalQuiz' ? '📝' : '🧩'} {puzzleTypeLabel(type)}
        </span>

        {type === 'moralDilemma' ? (
          /* שאלת מוסר — מנהלת בעצמה בחירה→השלכה→המשך; כל בחירה מזכה בקריסטלים, אין כישלון */
          <MoralDilemmaChallenge puzzle={puzzle} onResolve={() => onSolve(true, 1)} onContinue={onCollect ?? onContinue} />
        ) : result === null ? (
          <>
            {renderChallenge()}
            {/* יציאה זמינה רק לפני מתן תשובה, ובאתגרים שאינם רצף שאלות */}
            {type !== 'finalQuiz' && (
              <button
                className="text-sm mt-4 cursor-pointer block mx-auto"
                style={{ background: 'none', border: 'none', color: 'var(--holo-text)', opacity: 0.5 }}
                onClick={onClose}
              >
                סגירה
              </button>
            )}
          </>
        ) : (
          renderResult(result)
        )}
    </div>
  )
}
