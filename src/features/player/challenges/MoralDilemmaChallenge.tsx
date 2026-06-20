import { useState } from 'react'
import type { Puzzle } from '../useGameEngine'

interface Props {
  puzzle: Puzzle
  /* נקרא פעם אחת ברגע הבחירה — מזכה ברסיסי הקריסטל (אין כישלון, score מלא) */
  onResolve: () => void
  /* מעבר לסצנה הבאה אחרי קריאת ההשלכה */
  onContinue: () => void
}

/* ── שאלת מוסר (moralDilemma) ── דילמה ערכית ללא תשובה נכונה.
   שתי פאזות: בחירה → השלכה. כל בחירה מתקבלת ומזכה בקריסטלים. עיצוב "דילמה"
   (סגול/ענבר) שונה ויזואלית מחידת ידע ("מבחן" כחול-ציאן). */
export default function MoralDilemmaChallenge({ puzzle, onResolve, onContinue }: Props) {
  const situation = puzzle.situation ?? puzzle.question
  const choices = puzzle.moralChoices ?? []
  const [chosen, setChosen] = useState<number | null>(null)

  function choose(i: number) {
    if (chosen !== null) return
    setChosen(i)
    onResolve() /* רסיסי הקריסטל מוענקים מיד — כל בחירה מתקבלת */
  }

  const DILEMMA = 'var(--holo-magenta, #c861ff)'

  return (
    <div className="mt-2 text-start">
      <style>{`
        @keyframes md-in { from{opacity:0;transform:translateY(8px);} to{opacity:1;transform:translateY(0);} }
        .md-in { animation: md-in 0.4s ease; }
      `}</style>

      {/* כותרת הדילמה */}
      <div
        className="rounded-xl p-4 mb-4"
        style={{ background: 'rgba(150,60,220,0.10)', border: `1px solid ${DILEMMA}55`, boxShadow: `0 0 22px ${DILEMMA}22` }}
      >
        <div className="text-xs font-bold mb-2" style={{ color: DILEMMA, letterSpacing: '0.05em' }}>⚖️ דילמה — אין תשובה נכונה</div>
        <p className="leading-relaxed" style={{ color: 'var(--holo-text)' }}>{situation}</p>
      </div>

      {chosen === null ? (
        /* פאזת הבחירה */
        <div className="flex flex-col gap-3">
          {choices.map((c, i) => (
            <button
              key={i}
              onClick={() => choose(i)}
              className="text-start"
              style={{
                padding: '0.85rem 1.1rem',
                borderRadius: '0.7rem',
                background: 'rgba(150,60,220,0.08)',
                border: `1px solid ${DILEMMA}44`,
                color: 'var(--holo-text)',
                cursor: 'pointer',
                transition: 'background 0.15s, border 0.15s, transform 0.1s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(150,60,220,0.2)'; e.currentTarget.style.borderColor = DILEMMA }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(150,60,220,0.08)'; e.currentTarget.style.borderColor = `${DILEMMA}44` }}
            >
              {c.text}
            </button>
          ))}
        </div>
      ) : (
        /* פאזת ההשלכה — מתארת את תוצאת הבחירה שנבחרה */
        <div className="md-in">
          <div
            className="rounded-xl p-4"
            style={{ background: 'rgba(150,60,220,0.12)', border: `1px solid ${DILEMMA}66` }}
          >
            <div className="text-sm mb-2" style={{ opacity: 0.7 }}>בחרת: <b style={{ color: DILEMMA }}>{choices[chosen]?.text}</b></div>
            <div className="font-bold mb-1" style={{ color: DILEMMA }}>מה שקרה בעקבות הבחירה:</div>
            <p className="leading-relaxed" style={{ color: 'var(--holo-text)' }}>{choices[chosen]?.consequence}</p>
          </div>
          <div className="text-center mt-4">
            <button className="holo-button text-lg" style={{ padding: '0.7rem 2.5rem' }} onClick={onContinue}>
              המשך ←
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
