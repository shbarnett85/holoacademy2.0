import { useState } from 'react'
import type { Puzzle } from '../useGameEngine'
import { scaleWordCompletion } from '../../../shared/lib/difficultyScaling'
import { FailPips } from './failUi'

interface Props {
  puzzle: Puzzle
  onResult: (r: { correct: boolean; score?: number }) => void
}

/* נירמול להשוואה — הסרת רווחים מיותרים וסימני פיסוק בקצוות */
function norm(s: string): string {
  return s.trim().replace(/\s+/g, ' ').replace(/[.,;:!?"'׳״]+$/g, '')
}

/* השלמת מילים — משפט עם חלל אחד או יותר (___). הקלדה או בחירה מבנק מילים.
   מספר החללים, גודל הבנק ומספר הניסיונות נקבעים לפי הרמה (scaleWordCompletion). */
export default function WordCompletionChallenge({ puzzle, onResult }: Props) {
  const sentence = puzzle.sentence ?? puzzle.question
  /* רשימת התשובות לפי סדר החללים — answers (רב-חללי) או answer בודד (תאימות לאחור) */
  const answers = puzzle.answers && puzzle.answers.length > 0
    ? puzzle.answers
    : puzzle.answer ? [puzzle.answer] : ['']
  const parts = sentence.split('___')
  const blankCount = Math.max(1, parts.length - 1)
  const bank = puzzle.wordBank

  const maxAttempts = scaleWordCompletion(puzzle.difficulty ?? 5).maxAttempts
  const [values, setValues] = useState<string[]>(() => Array(blankCount).fill(''))
  const [locked, setLocked] = useState(false)
  const [wrong, setWrong] = useState(0)
  const [shake, setShake] = useState(0)

  const remaining = maxAttempts - wrong
  const activeIdx = values.findIndex((v) => !v.trim())
  const allFilled = values.every((v) => v.trim())

  function setBlank(idx: number, value: string) {
    setValues((prev) => prev.map((v, i) => (i === idx ? value : v)))
  }

  /* בחירה מבנק — ממלא את החלל הפעיל (הראשון הריק) */
  function pickFromBank(word: string) {
    if (locked) return
    const idx = activeIdx === -1 ? blankCount - 1 : activeIdx
    setBlank(idx, word)
  }

  function submit() {
    if (locked || !allFilled) return
    const correct = values.every((v, i) => norm(v) === norm(answers[i] ?? ''))
    if (correct) {
      setLocked(true)
      setTimeout(() => onResult({ correct: true, score: 1 }), 350)
      return
    }
    /* תשובה שגויה — ניקוב מד הניסיונות; כישלון רק במיצוי */
    const w = wrong + 1
    setWrong(w)
    setShake((k) => k + 1)
    setValues(Array(blankCount).fill(''))
    if (w >= maxAttempts) {
      setLocked(true)
      setTimeout(() => onResult({ correct: false, score: 0 }), 600)
    }
  }

  return (
    <div className="mt-4">
      <style>{`
        @keyframes wc-shake { 0%,100%{transform:translateX(0);} 25%{transform:translateX(-7px);} 75%{transform:translateX(7px);} }
        .wc-shake { animation: wc-shake 0.4s ease; }
      `}</style>
      <p className="text-sm mb-3" style={{ opacity: 0.6 }}>{puzzle.question}</p>

      {/* מד ניסיונות שנותרו */}
      <FailPips remaining={remaining} total={maxAttempts} label="ניסיונות" />

      {wrong > 0 && !locked && (
        <p className="text-sm text-center mb-2" style={{ color: '#ff9bb3' }}>✗ לא נכון — נסו שוב</p>
      )}

      {/* המשפט עם החללים — לחיצה על חלל מנקה אותו */}
      <div key={shake} className={`holo-panel text-lg leading-loose ${wrong > 0 ? 'wc-shake' : ''}`} style={{ padding: '1rem', background: 'rgba(0,136,255,0.06)' }}>
        {parts.map((seg, i) => (
          <span key={i}>
            {seg}
            {i < blankCount && (
              <span
                onClick={() => { if (!locked && values[i]) setBlank(i, '') }}
                style={{
                  display: 'inline-block',
                  minWidth: '5rem',
                  margin: '0 0.3rem',
                  padding: '0 0.5rem',
                  borderBottom: `2px solid ${i === activeIdx ? 'var(--holo-cyan)' : 'rgba(0,246,255,0.4)'}`,
                  color: 'var(--holo-cyan)',
                  fontWeight: 700,
                  textAlign: 'center',
                  cursor: !locked && values[i] ? 'pointer' : 'default',
                  background: i === activeIdx ? 'rgba(0,246,255,0.08)' : 'transparent',
                }}
              >
                {values[i] || ' '}
              </span>
            )}
          </span>
        ))}
      </div>

      {/* בנק מילים, או הקלדה חופשית לכל חלל */}
      {bank && bank.length > 0 ? (
        <div className="flex flex-wrap gap-2 justify-center mt-4">
          {bank.map((w, i) => (
            <button
              key={i}
              className="holo-button"
              style={{ padding: '0.5rem 1rem', opacity: locked ? 0.5 : 1 }}
              disabled={locked}
              onClick={() => pickFromBank(w)}
            >
              {w}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 mt-4 justify-center">
          {values.map((v, i) => (
            <input
              key={i}
              value={v}
              onChange={(e) => setBlank(i, e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              disabled={locked}
              placeholder={blankCount > 1 ? `חלל ${i + 1}` : 'המילה החסרה…'}
              className="rounded-lg p-2 text-center"
              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,246,255,0.3)', color: 'var(--holo-text)', minWidth: '9rem' }}
            />
          ))}
        </div>
      )}

      <div className="flex justify-center mt-4">
        <button
          className="holo-button"
          style={{ padding: '0.5rem 1.6rem', opacity: locked || !allFilled ? 0.5 : 1 }}
          disabled={locked || !allFilled}
          onClick={submit}
        >
          בדיקה
        </button>
      </div>
    </div>
  )
}
