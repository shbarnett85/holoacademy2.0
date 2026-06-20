import { useState } from 'react'
import type { Puzzle } from '../useGameEngine'
import { scaleTileSwap } from '../../../shared/lib/difficultyScaling'
import { FailPips } from './failUi'

interface Props {
  puzzle: Puzzle
  imageUrl?: string
  onResult: (r: { correct: boolean; score?: number }) => void
}

/* ערבוב Fisher-Yates שמבטיח שהמצב ההתחלתי אינו פתור */
function shuffled(count: number): number[] {
  let arr: number[]
  do {
    arr = Array.from({ length: count }, (_, i) => i)
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
  } while (arr.every((v, i) => v === i))
  return arr
}

/* פאזל הזזה — התמונה מחולקת לרשת מעורבבת; מחליפים אריחים עד שהתמונה שלמה */
export default function TileSwapChallenge({ puzzle, imageUrl, onResult }: Props) {
  /* גודל הרשת נקבע לפי רמת הקושי (2x2 → 5x5); נפילה ל-gridSize מהנתונים אם אין difficulty */
  const scale = puzzle.difficulty != null ? scaleTileSwap(puzzle.difficulty) : null
  const n = scale ? scale.gridSize : Math.min(5, Math.max(2, puzzle.gridSize ?? 3))
  const count = n * n
  /* תקציב "החלפות גרועות" (שני האריחים נשארו לא במקומם) לפי הרמה */
  const maxBadSwaps = scale ? scale.maxBadSwaps : Math.max(3, count)
  const [order, setOrder] = useState(() => shuffled(count))
  const [selected, setSelected] = useState<number | null>(null)
  const [badSwaps, setBadSwaps] = useState(0)
  const [done, setDone] = useState<'win' | 'lose' | null>(null)

  function clickTile(pos: number) {
    if (done) return
    if (selected === null) {
      setSelected(pos)
      return
    }
    if (selected === pos) {
      setSelected(null)
      return
    }
    const next = [...order]
    ;[next[selected], next[pos]] = [next[pos], next[selected]]
    setSelected(null)
    setOrder(next)
    if (next.every((v, i) => v === i)) {
      setDone('win')
      setTimeout(() => onResult({ correct: true, score: 1 }), 650)
      return
    }
    /* "החלפה גרועה" — אף אחד משני האריחים שהוחלפו לא נחת במקומו הסופי */
    const landedHome = next[selected] === selected || next[pos] === pos
    if (!landedHome) {
      const b = badSwaps + 1
      setBadSwaps(b)
      if (b >= maxBadSwaps) {
        setDone('lose')
        setOrder(Array.from({ length: count }, (_, i) => i)) /* חשיפת התמונה הפתורה */
        setTimeout(() => onResult({ correct: false, score: 0 }), 1100)
      }
    }
  }

  const remaining = maxBadSwaps - badSwaps

  return (
    <div className="mt-4">
      <style>{`
        @keyframes tileswap-solved { 0%,100%{box-shadow:0 0 12px rgba(0,246,255,0.4);} 50%{box-shadow:0 0 36px rgba(0,246,255,1);} }
        .tileswap-grid.solved { animation: tileswap-solved 0.8s ease; }
      `}</style>
      <p className="text-sm mb-3" style={{ opacity: 0.75 }}>{puzzle.question}</p>

      {/* מד החלפות גרועות שנותרו */}
      <FailPips remaining={remaining} total={maxBadSwaps} label="החלפות" />

      {done === 'lose' && (
        <p className="text-sm mb-3" style={{ color: '#ff9bb3' }}>💥 נגמרו ההחלפות — זו התמונה השלמה</p>
      )}

      {/* dir="ltr" מפורש: לוגיקת האינדקסים (col = value % n, אינדקס 0 = שמאל) מניחה LTR.
          בלי זה הקונטיינר יורש rtl מהמערכת והתמונה הפתורה מתהפכת אופקית. */}
      <div
        dir="ltr"
        className={`tileswap-grid mx-auto ${done === 'win' ? 'solved' : ''}`}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${n}, 1fr)`,
          gap: '3px',
          width: 'min(78vw, 300px)',
          aspectRatio: '1 / 1',
          borderRadius: '0.6rem',
          overflow: 'hidden',
          border: '1px solid rgba(0,246,255,0.3)',
        }}
      >
        {order.map((value, pos) => {
          const row = Math.floor(value / n)
          const col = value % n
          const isSel = selected === pos
          return (
            <button
              key={pos}
              onClick={() => clickTile(pos)}
              style={{
                position: 'relative',
                aspectRatio: '1 / 1',
                cursor: done ? 'default' : 'pointer',
                padding: 0,
                border: isSel ? '2px solid var(--holo-cyan)' : '1px solid rgba(0,246,255,0.15)',
                outline: 'none',
                transform: isSel ? 'scale(0.94)' : 'scale(1)',
                transition: 'transform 0.15s, background-position 0.25s ease',
                backgroundColor: 'rgba(0,40,70,0.6)',
                backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
                backgroundSize: `${n * 100}% ${n * 100}%`,
                backgroundPosition: `${(col / (n - 1)) * 100}% ${(row / (n - 1)) * 100}%`,
                color: 'var(--holo-text)',
                fontSize: '1.1rem',
                fontWeight: 700,
                boxShadow: isSel ? '0 0 14px rgba(0,246,255,0.7)' : 'none',
              }}
            >
              {/* fallback למספרים אם אין תמונת סצנה */}
              {!imageUrl && value + 1}
            </button>
          )
        })}
      </div>

      <div className="flex justify-center gap-3 mt-4">
        {!done && (
          <button
            className="text-sm cursor-pointer rounded-md px-3 py-1"
            style={{ background: 'transparent', border: '1px solid rgba(255,120,150,0.4)', color: '#ff9bb3' }}
            onClick={() => onResult({ correct: false })}
          >
            אני מוותר/ת 🏳️
          </button>
        )}
      </div>
    </div>
  )
}
