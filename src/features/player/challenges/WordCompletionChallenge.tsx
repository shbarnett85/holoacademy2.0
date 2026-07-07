import { useState } from 'react'
import type { Puzzle } from '../useGameEngine'
import { playSound } from '../../../shared/lib/sound'
import { scaleWordCompletion } from '../../../shared/lib/difficultyScaling'
import { FailPips } from './failUi'
import { triggerErrorFlash } from './errorFlash'

interface Props {
  puzzle: Puzzle
  onResult: (r: { correct: boolean; score?: number }) => void
}

/* נירמול להשוואה — הסרת רווחים מיותרים וסימני פיסוק בקצוות */
function norm(s: string): string {
  return s.trim().replace(/\s+/g, ' ').replace(/[.,;:!?"'׳״]+$/g, '')
}

/* השלמת מילים — משפט עם חלל אחד או יותר (___).
   **מצב בנק מילים**: לחיצה על מילה היא ניסיון השלמה מיידי על החלל הפעיל (הראשון
   הריק) — נכונה מתמלאת וננעלת ועוברים לחלל הבא; שגויה מנקבת את מד הניסיונות.
   אין כפתור בדיקה. **מצב הקלדה** (רמות גבוהות, ללא בנק): נשאר עם שדות + בדיקה.
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
  const bankMode = !!bank && bank.length > 0

  const maxAttempts = scaleWordCompletion(puzzle.difficulty ?? 5).maxAttempts
  const [values, setValues] = useState<string[]>(() => Array(blankCount).fill(''))
  const [usedBankIdx, setUsedBankIdx] = useState<Set<number>>(new Set()) /* מילים שנצרכו (מולאו נכון) */
  const [locked, setLocked] = useState(false)
  const [failed, setFailed] = useState(false) /* מיצוי ניסיונות → חשיפת התשובות ללמידה */
  const [wrong, setWrong] = useState(0)
  const [shake, setShake] = useState(0)

  const remaining = maxAttempts - wrong
  const activeIdx = values.findIndex((v) => !v.trim())

  function setBlank(idx: number, value: string) {
    setValues((prev) => prev.map((v, i) => (i === idx ? value : v)))
  }

  function fail() {
    setLocked(true)
    setFailed(true)
    /* חשיפת התשובות הנכונות בחללים — התלמיד לומד גם בכישלון */
    setValues(answers.map((a) => a))
    setTimeout(() => onResult({ correct: false, score: 0 }), 1600)
  }

  /* מצב בנק: לחיצה על מילה = ניסיון השלמה מיידי על החלל הפעיל */
  function attemptFromBank(word: string, bankIdx: number) {
    if (locked || usedBankIdx.has(bankIdx)) return
    const idx = activeIdx
    if (idx === -1) return
    if (norm(word) === norm(answers[idx] ?? '')) {
      /* נכון — החלל מתמלא וננעל, עוברים לחלל הבא */
      setBlank(idx, word)
      setUsedBankIdx((prev) => new Set(prev).add(bankIdx))
      const done = values.filter((v) => v.trim()).length + 1 === blankCount
      if (done) {
        setLocked(true)
        setTimeout(() => onResult({ correct: true, score: 1 }), 450)
      } else {
        playSound('good') /* צעד-ביניים — חלל הושלם, ממשיכים לבא */
      }
    } else {
      /* שגוי — ניקוב מד הניסיונות; כישלון רק במיצוי */
      const w = wrong + 1
      setWrong(w)
      setShake((k) => k + 1)
      triggerErrorFlash()
      if (w >= maxAttempts) fail()
    }
  }

  /* מצב הקלדה (ללא בנק): בדיקה של כל החללים יחד */
  const allFilled = values.every((v) => v.trim())
  function submitTyped() {
    if (locked || !allFilled) return
    const correct = values.every((v, i) => norm(v) === norm(answers[i] ?? ''))
    if (correct) {
      setLocked(true)
      setTimeout(() => onResult({ correct: true, score: 1 }), 350)
      return
    }
    const w = wrong + 1
    setWrong(w)
    setShake((k) => k + 1)
    triggerErrorFlash()
    if (w >= maxAttempts) { fail(); return }
    setValues(Array(blankCount).fill(''))
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

      {failed && (
        <p className="text-sm text-center mb-2" style={{ color: '#ff9bb3' }}>💥 נגמרו הניסיונות — אלו התשובות הנכונות</p>
      )}
      {wrong > 0 && !locked && (
        <p className="text-sm text-center mb-2" style={{ color: '#ff9bb3' }}>✗ לא נכון — נסו מילה אחרת</p>
      )}

      {/* המשפט עם החללים — החלל הפעיל מודגש; חללים מלאים נעולים (נכונים תמיד) */}
      <div key={shake} className={`holo-panel text-lg leading-loose ${wrong > 0 && !locked ? 'wc-shake' : ''}`} style={{ padding: '1rem', background: 'rgba(0,136,255,0.06)' }}>
        {parts.map((seg, i) => (
          <span key={i}>
            {seg}
            {i < blankCount && (
              <span
                style={{
                  display: 'inline-block',
                  minWidth: '5rem',
                  margin: '0 0.3rem',
                  padding: '0 0.5rem',
                  borderBottom: `2px solid ${failed ? 'rgba(0,255,150,0.6)' : i === activeIdx ? 'var(--holo-cyan)' : 'rgba(0,246,255,0.4)'}`,
                  color: failed ? '#7dffc4' : values[i] ? '#7dffc4' : 'var(--holo-cyan)',
                  fontWeight: 700,
                  textAlign: 'center',
                  background: i === activeIdx && !locked ? 'rgba(0,246,255,0.08)' : 'transparent',
                }}
              >
                {values[i] || ' '}
              </span>
            )}
          </span>
        ))}
      </div>

      {/* בנק מילים (לחיצה = ניסיון), או הקלדה חופשית לכל חלל */}
      {bankMode ? (
        <div className="flex flex-wrap gap-2 justify-center mt-4">
          {bank!.map((w, i) => {
            const used = usedBankIdx.has(i)
            return (
              <button
                key={i}
                className="holo-button"
                style={{
                  padding: '0.5rem 1rem',
                  opacity: locked || used ? 0.35 : 1,
                  ...(used ? { borderColor: 'rgba(0,255,150,0.5)', color: '#7dffc4' } : {}),
                }}
                disabled={locked || used}
                onClick={() => attemptFromBank(w, i)}
              >
                {used ? `✓ ${w}` : w}
              </button>
            )
          })}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mt-4 justify-center">
            {values.map((v, i) => (
              <input
                key={i}
                value={v}
                onChange={(e) => setBlank(i, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitTyped()}
                disabled={locked}
                placeholder={blankCount > 1 ? `חלל ${i + 1}` : 'המילה החסרה…'}
                className="rounded-lg p-2 text-center"
                style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,246,255,0.3)', color: 'var(--holo-text)', minWidth: '9rem' }}
              />
            ))}
          </div>
          <div className="flex justify-center mt-4">
            <button
              className="holo-button"
              style={{ padding: '0.5rem 1.6rem', opacity: locked || !allFilled ? 0.5 : 1 }}
              disabled={locked || !allFilled}
              onClick={submitTyped}
            >
              בדיקה
            </button>
          </div>
        </>
      )}
    </div>
  )
}
