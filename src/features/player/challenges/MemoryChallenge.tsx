import { useMemo, useState } from 'react'
import type { Puzzle } from '../useGameEngine'
import { scaleMemory } from '../../../shared/lib/difficultyScaling'
import { FailPips } from './failUi'

interface Props {
  puzzle: Puzzle
  onResult: (r: { correct: boolean; score?: number }) => void
}

interface Card {
  id: number
  pairId: number
  text: string
}

function buildDeck(pairs: { a: string; b: string }[]): Card[] {
  const cards: Card[] = []
  pairs.forEach((p, i) => {
    cards.push({ id: i * 2, pairId: i, text: p.a })
    cards.push({ id: i * 2 + 1, pairId: i, text: p.b })
  })
  /* ערבוב */
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }
  return cards
}

/* משחק זיכרון — התאמת זוגות (מושג↔הגדרה). תקציב טעויות מוגבל = אתגר אמיתי */
export default function MemoryChallenge({ puzzle, onResult }: Props) {
  const deck = useMemo(() => buildDeck(puzzle.pairs ?? []), [puzzle.pairs])
  /* תקציב הפסילות נקבע לפי רמת הקושי של אתגר הזיכרון (per_puzzle_level.memory) */
  const mistakeBudget = scaleMemory(puzzle.difficulty ?? 5).maxMistakes

  const [flipped, setFlipped] = useState<number[]>([]) /* אינדקסים בחפיסה */
  const [matched, setMatched] = useState<Set<number>>(new Set())
  const [mistakes, setMistakes] = useState(0)
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [revealAll, setRevealAll] = useState(false) /* כישלון → חשיפת כל הזוגות ללמידה */

  function flip(idx: number) {
    if (over || busy) return
    if (matched.has(idx) || flipped.includes(idx)) return
    const next = [...flipped, idx]
    setFlipped(next)
    if (next.length < 2) return

    const [aIdx, bIdx] = next
    if (deck[aIdx].pairId === deck[bIdx].pairId) {
      /* התאמה */
      const m = new Set(matched).add(aIdx).add(bIdx)
      setMatched(m)
      setFlipped([])
      if (m.size === deck.length) {
        setOver(true)
        setTimeout(() => onResult({ correct: true, score: 1 }), 600)
      }
    } else {
      /* טעות — הופכים בחזרה אחרי השהיה */
      const newMistakes = mistakes + 1
      setMistakes(newMistakes)
      setBusy(true)
      setTimeout(() => {
        setFlipped([])
        setBusy(false)
        /* מיצוי תקציב הפסילות = כישלון → חושפים את כל הזוגות ללמידה לפני המעבר */
        if (newMistakes >= mistakeBudget) {
          setOver(true)
          setRevealAll(true)
          setTimeout(() => onResult({ correct: false }), 1800)
        }
      }, 850)
    }
  }

  /* יותר עמודות לחפיסות גדולות (עד 12 זוגות = 24 קלפים) כדי לשמור על פריסה קומפקטית */
  const cols = deck.length <= 6 ? 3 : deck.length <= 16 ? 4 : deck.length <= 24 ? 5 : 6
  const cardMinHeight = deck.length <= 12 ? '4.5rem' : deck.length <= 20 ? '3.6rem' : '3rem'

  return (
    <div className="mt-4">
      <style>{`
        @keyframes mem-in { from{transform:rotateY(90deg);opacity:0;} to{transform:rotateY(0);opacity:1;} }
        .mem-face { animation: mem-in 0.3s ease; }
      `}</style>
      <p className="text-sm mb-2" style={{ opacity: 0.75 }}>{puzzle.question}</p>

      {/* מד פסילות שנותרו */}
      <FailPips remaining={mistakeBudget - mistakes} total={mistakeBudget} label="פסילות" />

      {over && mistakes >= mistakeBudget && (
        <p className="text-sm text-center mb-2" style={{ color: '#ff9bb3' }}>💥 נגמרו הפסילות — אלו הזוגות הנכונים</p>
      )}

      <div
        className="mx-auto"
        style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '0.4rem', maxWidth: '30rem' }}
      >
        {deck.map((card, idx) => {
          const isUp = revealAll || matched.has(idx) || flipped.includes(idx)
          const isMatched = matched.has(idx)
          return (
            <button
              key={card.id}
              onClick={() => flip(idx)}
              style={{
                minHeight: cardMinHeight,
                borderRadius: '0.6rem',
                cursor: isUp || over ? 'default' : 'pointer',
                padding: '0.4rem',
                fontSize: '0.8rem',
                lineHeight: 1.2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                color: 'var(--holo-text)',
                background: isMatched
                  ? 'rgba(0,255,150,0.12)'
                  : isUp
                    ? 'rgba(0,136,255,0.22)'
                    : 'rgba(5,10,25,0.7)',
                border: isMatched
                  ? '1px solid rgba(0,255,150,0.5)'
                  : isUp
                    ? '1px solid var(--holo-cyan)'
                    : '1px solid rgba(0,246,255,0.2)',
                boxShadow: isUp ? '0 0 12px rgba(0,246,255,0.3)' : 'none',
                transition: 'background 0.2s, border 0.2s',
              }}
            >
              {isUp ? <span className="mem-face">{card.text}</span> : <span style={{ fontSize: '1.4rem', opacity: 0.5 }}>❔</span>}
            </button>
          )
        })}
      </div>

      {!over && (
        <div className="flex justify-center mt-4">
          <button
            className="text-sm cursor-pointer rounded-md px-3 py-1"
            style={{ background: 'transparent', border: '1px solid rgba(255,120,150,0.4)', color: '#ff9bb3' }}
            onClick={() => onResult({ correct: false })}
          >
            אני מוותר/ת 🏳️
          </button>
        </div>
      )}
    </div>
  )
}
