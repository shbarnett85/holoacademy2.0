import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { sounds } from '../gameFeel/engine'
import type { Puzzle } from '../useGameEngine'
import { scaleMatchPairs } from '../../../shared/lib/difficultyScaling'
import { FailPips } from './failUi'
import { triggerErrorFlash } from './errorFlash'
import type { PuzzleTelemetry } from '../../../shared/lib/answerTelemetry'
import { alignPair, shuffledPairOrder } from './matchPairs'

interface Props {
  puzzle: Puzzle
  onResult: (r: { correct: boolean; score?: number }) => void
  tel?: PuzzleTelemetry
}

const prefersReduced = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* התאמת זוגות: הכול גלוי כל הזמן, ולכן זו בדיקה של ידע ולא של זיכרון מיקום.
   מושגים בעמודה אחת, הסברים באחרת. לוחצים על אחד מכל עמודה, בכל סדר. זוג נכון מתיישר לאותה שורה וננעל. */
export default function MatchPairsChallenge({ puzzle, onResult, tel }: Props) {
  const pairs = useMemo(() => puzzle.pairs ?? [], [puzzle.pairs])
  const mistakeBudget = scaleMatchPairs(puzzle.difficulty ?? 5).maxMistakes
  const [rowsB, setRowsB] = useState(() => shuffledPairOrder(pairs.length))
  const [matched, setMatched] = useState<ReadonlySet<number>>(new Set())
  const [picked, setPicked] = useState<{ side: 'a' | 'b'; pair: number } | null>(null)
  const [wrong, setWrong] = useState<readonly number[]>([])
  const [mistakes, setMistakes] = useState(0)
  const [over, setOver] = useState<'win' | 'lose' | null>(null)
  const [gaveUp, setGaveUp] = useState(false)

  /* ההסבר נוסע לשורה של המושג, ולא קופץ */
  const grid = useRef<HTMLDivElement>(null)
  const lastTop = useRef(new Map<string, number>())
  useLayoutEffect(() => {
    const items = [...(grid.current?.querySelectorAll<HTMLElement>('[data-pair-b]') ?? [])]
    for (const el of items) {
      const id = el.dataset.pairB!
      const top = el.getBoundingClientRect().top
      const was = lastTop.current.get(id)
      if (was !== undefined && Math.abs(was - top) > 12 && !prefersReduced()) {
        el.animate([{ transform: `translateY(${was - top}px)` }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.3,.8,.4,1)' })
      }
      lastTop.current.set(id, top)
    }
  }, [rowsB])

  function revealAll() {
    setOver('lose')
    setPicked(null)
    setRowsB(pairs.map((_, i) => i))
    setMatched(new Set(pairs.map((_, i) => i)))
  }

  function pick(side: 'a' | 'b', pair: number) {
    if (over || matched.has(pair)) return
    if (!picked || picked.side === side) {
      setPicked(picked?.side === side && picked.pair === pair ? null : { side, pair })
      return
    }
    const a = side === 'a' ? pair : picked.pair
    const b = side === 'b' ? pair : picked.pair
    setPicked(null)
    const match = a === b
    tel?.act('pair', { a, b, match })
    if (match) {
      const m = new Set(matched).add(a)
      setMatched(m)
      setRowsB((rows) => alignPair(rows, a))
      setWrong([])
      if (m.size === pairs.length) {
        setOver('win')
        setTimeout(() => onResult({ correct: true, score: 1 }), 600)
      } else {
        sounds.step()
      }
      return
    }
    const next = mistakes + 1
    setMistakes(next)
    setWrong([a, b])
    triggerErrorFlash()
    setTimeout(() => setWrong([]), 420)
    if (next >= mistakeBudget) {
      revealAll()
      setTimeout(() => onResult({ correct: false }), 900)
    }
  }

  const cell = (side: 'a' | 'b', pair: number, text: string) => {
    const isMatched = matched.has(pair)
    const isPicked = picked?.side === side && picked.pair === pair
    const isWrong = wrong.length > 0 && wrong[side === 'a' ? 0 : 1] === pair
    return (
      <button
        key={`${side}${pair}`}
        type="button"
        data-pair-a={side === 'a' ? pair : undefined}
        data-pair-b={side === 'b' ? pair : undefined}
        data-pair-state={isMatched ? 'matched' : isPicked ? 'picked' : 'open'}
        aria-pressed={isPicked}
        disabled={isMatched || !!over}
        onClick={() => pick(side, pair)}
        className={`mp-cell ${isWrong ? 'mp-wrong' : ''}`}
        style={{
          background: isMatched ? 'rgba(0,255,150,0.12)' : isPicked ? 'rgba(0,136,255,0.34)' : 'rgba(5,10,25,0.62)',
          border: `1px solid ${isMatched ? 'rgba(0,255,150,0.5)' : isPicked ? 'var(--holo-cyan)' : 'rgba(0,246,255,0.22)'}`,
          boxShadow: isPicked ? '0 0 12px rgba(0,246,255,0.45)' : 'none',
          cursor: isMatched || over ? 'default' : 'pointer',
          fontWeight: side === 'a' ? 700 : 500,
        }}
      >
        {side === 'a' && isMatched && <span aria-hidden style={{ color: '#7dffc4', marginInlineEnd: 6 }}>✓</span>}
        {text}
      </button>
    )
  }

  return (
    <div style={{ width: 'min(470px, 52vw)', maxWidth: '100%', marginInline: 'auto' }}>
      <style>{`
        .mp-grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 3fr); grid-auto-rows: minmax(40px, auto); gap: 4px 10px; }
        .mp-cell { min-height: 40px; padding: 4px 10px; border-radius: .6rem; color: var(--holo-text); font-size: 15px; line-height: 1.25; text-align: start; transition: background .15s, border-color .15s; }
        @keyframes mp-nudge { 0%,100% { transform: translateX(0) } 30% { transform: translateX(-4px) } 70% { transform: translateX(4px) } }
        .mp-wrong { animation: mp-nudge .34s ease; }
        @media (prefers-reduced-motion: reduce) { .mp-wrong { animation: none; } }
      `}</style>
      <p data-challenge-q className="text-sm mb-2" style={{ opacity: 0.75 }}>{puzzle.question}</p>
      <FailPips remaining={mistakeBudget - mistakes} total={mistakeBudget} label="טעויות" />
      {over === 'lose' && (
        <p className="text-sm text-center" style={{ color: '#ff9bb3', margin: '0 0 6px' }}>
          {gaveUp ? 'אלו הזוגות הנכונים' : 'נגמרו הטעויות — אלו הזוגות הנכונים'}
        </p>
      )}
      {/* רשת אחת ולא שתי עמודות נפרדות: מושג והסבר באותה שורה תמיד באותו גובה */}
      <div className="mp-grid" ref={grid}>
        {pairs.map((p, row) => [cell('a', row, p.a), cell('b', rowsB[row], pairs[rowsB[row]].b)])}
      </div>
      {!over && (
        <div className="flex justify-center mt-2">
          <button
            className="text-sm cursor-pointer rounded-md px-3 py-1"
            style={{ background: 'transparent', border: '1px solid rgba(255,120,150,0.4)', color: '#ff9bb3' }}
            onClick={() => {
              tel?.act('gave_up')
              setGaveUp(true)
              revealAll()
              onResult({ correct: false })
            }}
          >
            ויתור על האתגר 🏳️
          </button>
        </div>
      )}
    </div>
  )
}
