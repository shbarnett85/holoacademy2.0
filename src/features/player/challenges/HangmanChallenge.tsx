import { useMemo, useState } from 'react'
import type { Puzzle } from '../useGameEngine'

interface Props {
  puzzle: Puzzle
  onResult: (r: { correct: boolean; score?: number }) => void
}

/* סופיות → צורת הבסיס, כדי שניחוש אות אחת יחשוף גם את צורתה הסופית */
const FINAL_MAP: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' }
const baseLetter = (ch: string) => FINAL_MAP[ch] ?? ch
const HEB_KEYBOARD = 'אבגדהוזחטיכלמנסעפצקרשת'.split('')
const isHebLetter = (ch: string) => /[א-ת]/.test(ch)

/* זיהוי קוד / איש תלוי — ניחוש אות-אות בעברית, מד ניסיונות הולוגרפי */
export default function HangmanChallenge({ puzzle, onResult }: Props) {
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
    const next = new Set(guessed).add(letter)
    setGuessed(next)
    if (needed.has(letter)) {
      /* אות נכונה — בדיקת ניצחון */
      if ([...needed].every((l) => next.has(l))) {
        setDone('win')
        setTimeout(() => onResult({ correct: true, score: 1 }), 850)
      }
    } else {
      /* אות שגויה — רעד + ניקוב המד */
      const w = wrong + 1
      setWrong(w)
      setShakeKey((k) => k + 1)
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
      `}</style>

      <p className="text-sm mb-3" style={{ opacity: 0.85 }}>🔍 {puzzle.question}</p>

      {/* מד ניסיונות הולוגרפי — ליבת קריסטל שמתפוגגת + רסיסים */}
      <div key={shakeKey} className={`flex flex-col items-center gap-2 mb-4 ${done !== 'win' && wrong > 0 ? 'hang-shake' : ''}`}>
        <div
          style={{
            width: '4.5rem', height: '4.5rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2.6rem',
            filter: `drop-shadow(0 0 ${4 + coreLife * 16}px rgba(0,246,255,${0.3 + coreLife * 0.6}))`,
            opacity: done === 'lose' ? 0.15 : 0.35 + coreLife * 0.65,
            transform: `scale(${done === 'lose' ? 0.6 : 0.7 + coreLife * 0.3})`,
            transition: 'opacity 0.4s ease, transform 0.4s ease, filter 0.4s ease',
          }}
        >
          {done === 'lose' ? '💥' : '🔮'}
        </div>
        <div className="flex gap-1" dir="ltr">
          {Array.from({ length: maxWrong }).map((_, i) => (
            <span
              key={i}
              style={{
                fontSize: '0.9rem',
                color: i < remaining ? 'var(--holo-cyan)' : 'rgba(255,120,150,0.5)',
                textShadow: i < remaining ? '0 0 6px rgba(0,246,255,0.8)' : 'none',
                transition: 'color 0.3s',
              }}
            >
              {i < remaining ? '◆' : '◇'}
            </span>
          ))}
        </div>
        <span className="text-xs" style={{ opacity: 0.6 }}>נותרו {remaining} ניסיונות</span>
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
              className={revealed && !lostReveal ? 'slot-pop' : ''}
              style={{
                width: '2rem', height: '2.5rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderBottom: '2px solid var(--holo-cyan)',
                fontSize: '1.4rem', fontWeight: 700,
                color: lostReveal ? '#ff9bb3' : 'var(--holo-text)',
                textShadow: revealed && !lostReveal ? '0 0 10px rgba(0,246,255,0.9)' : 'none',
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
                onClick={() => guess(letter)}
                disabled={used}
                style={{
                  width: '2.1rem', height: '2.4rem',
                  borderRadius: '0.4rem',
                  fontSize: '1.05rem', fontWeight: 700,
                  cursor: used ? 'default' : 'pointer',
                  color: 'var(--holo-text)',
                  background: used ? 'rgba(5,10,25,0.5)' : 'rgba(0,136,255,0.18)',
                  border: `1px solid ${wasWrong ? 'rgba(255,120,150,0.4)' : 'rgba(0,246,255,0.3)'}`,
                  opacity: used ? 0.3 : 1,
                  transition: 'opacity 0.25s, background 0.2s',
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
