import { useMemo, useState } from 'react'
import { sounds } from '../gameFeel/engine'
import type { Puzzle } from '../useGameEngine'
import { triggerErrorFlash } from './errorFlash'
import type { PuzzleTelemetry } from '../../../shared/lib/answerTelemetry'

interface Props {
  puzzle: Puzzle
  onResult: (r: { correct: boolean; score?: number }) => void
  /* טלמטריית תשובות (1B) — hook נפרד לצד onResult; אופציונלי ולעולם לא משפיע על הלוגיקה */
  tel?: PuzzleTelemetry
}

/* סופיות → צורת הבסיס, כדי שניחוש אות אחת יחשוף גם את צורתה הסופית */
const FINAL_MAP: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' }
const baseLetter = (ch: string) => FINAL_MAP[ch] ?? ch
const HEB_KEYBOARD = 'אבגדהוזחטיכלמנסעפצקרשת'.split('')
const isHebLetter = (ch: string) => /[א-ת]/.test(ch)

/* זיהוי קוד / איש תלוי — ניחוש אות-אות בעברית, עם מד ניסיונות */
export default function HangmanChallenge({ puzzle, onResult, tel }: Props) {
  const answer = (puzzle.answer ?? '').trim()
  const maxWrong = Math.max(3, Math.min(10, puzzle.maxWrong ?? 6))

  /* אותיות הבסיס הייחודיות שיש לנחש */
  const needed = useMemo(() => {
    const set = new Set<string>()
    for (const ch of answer) if (isHebLetter(ch)) set.add(baseLetter(ch))
    return set
  }, [answer])

  const [guessed, setGuessed] = useState<Set<string>>(new Set())
  const [wrong, setWrong] = useState(0)
  const [shakeKey, setShakeKey] = useState(0)
  const [done, setDone] = useState<'win' | 'lose' | null>(null)

  const remaining = maxWrong - wrong

  function guess(letter: string) {
    if (done || guessed.has(letter)) return
    tel?.act('letter', { letter, correct: needed.has(letter) })
    const next = new Set(guessed).add(letter)
    setGuessed(next)
    if (needed.has(letter)) {
      /* אות נכונה — בדיקת ניצחון */
      if ([...needed].every((l) => next.has(l))) {
        setDone('win')
        /* הנורות נדלקות בשרשרת */
        ;[...answer].forEach((_, i) => { if (i < 8) window.setTimeout(() => sounds.chain(i), i * 70) })
        setTimeout(() => onResult({ correct: true, score: 1 }), 850) /* win בסיום */
      } else {
        sounds.step() /* אות נכונה (צעד-ביניים) */
      }
    } else {
      /* אות שגויה — רעד + ניקוב המד */
      const w = wrong + 1
      setWrong(w)
      setShakeKey((k) => k + 1)
      triggerErrorFlash()
      if (w >= maxWrong) {
        setDone('lose')
        setTimeout(() => onResult({ correct: false, score: 0 }), 900)
      }
    }
  }

  /* שקיפות/קנה־מידה של הליבה ההולוגרפית לפי הניסיונות שנותרו */
  const coreLife = remaining / maxWrong

  return (
    <div className="mt-3">
      <style>{`
        @keyframes hang-shake { 0%,100%{transform:translateX(0);} 25%{transform:translateX(-7px);} 75%{transform:translateX(7px);} }
        .hang-shake { animation: hang-shake 0.4s ease; }
        @keyframes slot-pop { 0%{transform:scale(0.5);opacity:0;} 100%{transform:scale(1);opacity:1;} }
        .slot-pop { animation: slot-pop 0.25s ease; }
        @keyframes slot-chain { 0%, 100% { transform: translateY(0); } 45% { transform: translateY(-3px); } }
        .slot-chain { animation: slot-chain .5s ease-out both; }
        @media (prefers-reduced-motion: reduce) { .slot-pop, .slot-chain { animation: none; } }
        /* אות שכבר נוחשה: נכון / לא נכון מסומנים גם בסימן בפינה, לא רק בצבע */
        .hang-key { position: relative; }
        .hang-key.is-correct::after, .hang-key.is-wrong::after { position: absolute; top: 1px; inset-inline-end: 3px; font-size: .55rem; line-height: 1; font-weight: 700; }
        .hang-key.is-correct::after { content: '✓'; }
        .hang-key.is-wrong::after { content: '✗'; }
      `}</style>

      <p data-challenge-q className="text-sm mb-3" style={{ opacity: 0.85 }}>🔍 {puzzle.question}</p>

      {/* מד ניסיונות — ליבת קריסטל שמתפוגגת + רסיסים */}
      <div key={shakeKey} data-solution-hide className={`flex flex-col items-center gap-2 mb-4 ${done !== 'win' && wrong > 0 ? 'hang-shake' : ''}`}>
        <div
          style={{
            width: '4.5rem', height: '4.5rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2.6rem',
            opacity: done === 'lose' ? 0.15 : 0.35 + coreLife * 0.65,
            transform: `scale(${done === 'lose' ? 0.6 : 0.7 + coreLife * 0.3})`,
            transition: 'opacity 0.4s ease, transform 0.4s ease',
          }}
        >
          🔮
        </div>
        <div className="flex gap-1" dir="ltr">
          {Array.from({ length: maxWrong }).map((_, i) => (
            <span
              key={i}
              style={{
                fontSize: '0.9rem',
                color: 'var(--color-ink)',
              }}
            >
              {i < remaining ? '◆' : '◇'}
            </span>
          ))}
        </div>
        <span className="text-xs" style={{ color: 'var(--color-muted)' }}>נותרו {remaining} ניסיונות</span>
      </div>

      {/* שלד המילה — RTL: אות ראשונה מימין */}
      <div className="flex flex-wrap gap-1.5 justify-center mb-5" dir="rtl">
        {[...answer].map((ch, i) => {
          if (!isHebLetter(ch)) {
            /* רווח/תו אחר — מסומן כמרווח */
            return <span key={i} style={{ width: ch === ' ' ? '1rem' : 'auto', alignSelf: 'flex-end', opacity: 0.5 }}>{ch === ' ' ? '' : ch}</span>
          }
          const revealed = guessed.has(baseLetter(ch)) || done === 'lose'
          const lostReveal = done === 'lose' && !guessed.has(baseLetter(ch))
          return (
            <span
              key={i}
              className={done === 'win' ? 'slot-chain' : revealed && !lostReveal ? 'slot-pop' : ''}
              data-hang-slot
              style={{
                animationDelay: done === 'win' ? `${i * 0.07}s` : undefined,
                width: '2rem', height: '2.5rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                /* אות שנחשפה רק בסוף (לא נוחשה): צבע wrong וגם קו מקווקו, לא צבע לבד */
                borderBottom: lostReveal ? '2px dashed var(--color-wrong)' : '2px solid var(--color-ink)',
                fontSize: '1.4rem', fontWeight: 700,
                color: lostReveal ? 'var(--color-wrong)' : 'var(--color-ink)',
              }}
            >
              {revealed ? ch : ''}
            </span>
          )
        })}
      </div>

      {/* מקלדת עברית RTL */}
      {!done && (
        <div className="flex flex-wrap gap-1.5 justify-center" dir="rtl" style={{ maxWidth: '24rem', margin: '0 auto' }}>
          {HEB_KEYBOARD.map((letter) => {
            const used = guessed.has(letter)
            const wasWrong = used && !needed.has(letter)
            return (
              <button
                key={letter}
                className={`hang-key holo-button holo-button--sm${used ? (wasWrong ? ' is-wrong' : ' is-correct') : ''}`}
                onClick={() => guess(letter)}
                disabled={used}
                aria-label={used ? `${letter} (${wasWrong ? 'לא נכון' : 'נכון'})` : undefined}
                style={{
                  width: '2.1rem', height: '2.4rem',
                  padding: 0,
                  borderRadius: '0.4rem',
                  fontSize: '1.05rem', fontWeight: 700,
                }}
              >
                {letter}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
