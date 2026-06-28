import { useEffect, useMemo, useRef, useState } from 'react'
import type { Puzzle } from '../useGameEngine'
import { scaleWordSearch, type WordSearchScale } from '../../../shared/lib/difficultyScaling'
import { Countdown } from './failUi'
import { triggerErrorFlash } from './errorFlash'

interface Props {
  puzzle: Puzzle
  onResult: (r: { correct: boolean; score?: number }) => void
}

const HEB = 'אבגדהוזחטיכלמנסעפצקרשת'
const randLetter = () => HEB[Math.floor(Math.random() * HEB.length)]

interface Cell { r: number; c: number }
interface Built { grid: string[][]; size: number; words: string[]; answerCells: Set<string> }

/* בניית רשת אותיות לפי כיווני הקושי: אופקי / אנכי / הפוך / אלכסונים */
function buildGrid(rawWords: string[], scale: WordSearchScale): Built {
  const words = rawWords
    .map((w) => w.replace(/[^א-ת]/g, ''))
    .filter((w) => w.length >= 2)
    .slice(0, scale.wordCount)
  const longest = words.reduce((m, w) => Math.max(m, w.length), 3)
  const size = Math.min(16, Math.max(scale.gridSize, longest + 1))
  const grid: (string | null)[][] = Array.from({ length: size }, () => Array(size).fill(null))
  const placed: string[] = []
  const answerCells = new Set<string>()

  const dirs: { dr: number; dc: number }[] = []
  if (scale.directions.includes('horizontal')) dirs.push({ dr: 0, dc: 1 })
  if (scale.directions.includes('vertical')) dirs.push({ dr: 1, dc: 0 })
  if (scale.directions.includes('diagonal')) { dirs.push({ dr: 1, dc: 1 }); dirs.push({ dr: 1, dc: -1 }) }
  if (dirs.length === 0) dirs.push({ dr: 0, dc: 1 })
  const allowReverse = scale.directions.includes('reverse')

  for (const word of words) {
    /* היפוך מותר רק ברמות שבהן 'reverse' פעיל — מקשה על האיתור */
    const letters = allowReverse && Math.random() < 0.5 ? word.split('').reverse() : word.split('')
    let ok = false
    for (let attempt = 0; attempt < 250 && !ok; attempt++) {
      const dir = dirs[Math.floor(Math.random() * dirs.length)]
      const r0 = Math.floor(Math.random() * size)
      const c0 = Math.floor(Math.random() * size)
      let fits = true
      for (let k = 0; k < letters.length; k++) {
        const r = r0 + dir.dr * k
        const c = c0 + dir.dc * k
        if (r < 0 || r >= size || c < 0 || c >= size) { fits = false; break }
        const cur = grid[r][c]
        if (cur !== null && cur !== letters[k]) { fits = false; break }
      }
      if (!fits) continue
      for (let k = 0; k < letters.length; k++) {
        const r = r0 + dir.dr * k
        const c = c0 + dir.dc * k
        grid[r][c] = letters[k]
        answerCells.add(`${r},${c}`)
      }
      placed.push(word)
      ok = true
    }
  }

  /* מילוי התאים הריקים — צפיפות אותיות מבלבלות: בהסתברות decoyBias שואבים אות
     מתוך אותיות המילים שהוסתרו (מקשה על האבחנה), אחרת אות אקראית. */
  const wordLetters = Array.from(new Set(placed.join('').split('')))
  const fillLetter = () =>
    wordLetters.length > 0 && Math.random() < scale.decoyBias
      ? wordLetters[Math.floor(Math.random() * wordLetters.length)]
      : randLetter()
  const filled = grid.map((row) => row.map((c) => c ?? fillLetter()))
  return { grid: filled, size, words: placed, answerCells }
}

export default function WordSearchChallenge({ puzzle, onResult }: Props) {
  const scale = useMemo(() => scaleWordSearch(puzzle.difficulty ?? 5), [puzzle.difficulty])
  const built = useMemo(() => buildGrid(puzzle.words ?? [], scale), [puzzle.words, scale])
  const { grid, size, words, answerCells } = built

  const [path, setPath] = useState<Cell[]>([])
  const [foundCells, setFoundCells] = useState<Set<string>>(new Set())
  const [foundWords, setFoundWords] = useState<Set<string>>(new Set())
  const [done, setDone] = useState<'win' | 'lose' | null>(null)
  const selecting = useRef(false)

  /* תום הזמן לפני מציאת כל המילים = כישלון; חושפים את כל מיקומי המילים */
  function onTimeout() {
    if (done) return
    setDone('lose')
    triggerErrorFlash()
    setFoundCells(new Set(answerCells))
    setFoundWords(new Set(words))
    setTimeout(() => onResult({ correct: false, score: 0 }), 1200)
  }
  const startRef = useRef<Cell | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const key = (r: number, c: number) => `${r},${c}`

  /* קו ישר מ-start ל-end: אופקי (אותה שורה), אנכי (אותה עמודה), או אלכסוני (כל השאר) */
  function lineFrom(start: Cell, end: Cell): Cell[] {
    const dr = end.r - start.r
    const dc = end.c - start.c
    const cells: Cell[] = []
    if (dr === 0 && dc === 0) return [start]
    if (dr === 0) {
      const step = dc > 0 ? 1 : -1
      for (let k = 0; k <= Math.abs(dc); k++) cells.push({ r: start.r, c: start.c + step * k })
    } else if (dc === 0) {
      const step = dr > 0 ? 1 : -1
      for (let k = 0; k <= Math.abs(dr); k++) cells.push({ r: start.r + step * k, c: start.c })
    } else {
      /* אלכסון — אורך הקו הוא המינימום בין ההפרשים (נשאר על הרשת) */
      const len = Math.min(Math.abs(dr), Math.abs(dc))
      const sr = dr > 0 ? 1 : -1
      const sc = dc > 0 ? 1 : -1
      for (let k = 0; k <= len; k++) cells.push({ r: start.r + sr * k, c: start.c + sc * k })
    }
    return cells
  }

  function cellAt(clientX: number, clientY: number): Cell | null {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null
    const r = el?.getAttribute?.('data-r')
    const c = el?.getAttribute?.('data-c')
    if (r == null || c == null) return null
    return { r: Number(r), c: Number(c) }
  }

  function begin(cell: Cell) {
    selecting.current = true
    startRef.current = cell
    setPath([cell])
  }

  useEffect(() => {
    function move(e: PointerEvent) {
      if (!selecting.current || !startRef.current) return
      const cell = cellAt(e.clientX, e.clientY)
      if (cell) setPath(lineFrom(startRef.current, cell))
    }
    function up() {
      if (!selecting.current) return
      selecting.current = false
      const cells = path
      startRef.current = null
      setPath([])
      if (done || cells.length < 2) return
      const letters = cells.map((c) => grid[c.r][c.c]).join('')
      const rev = letters.split('').reverse().join('')
      const hit = words.find((w) => !foundWords.has(w) && (w === letters || w === rev))
      if (hit) {
        const nf = new Set(foundWords).add(hit)
        setFoundWords(nf)
        setFoundCells((prev) => {
          const s = new Set(prev)
          cells.forEach((c) => s.add(key(c.r, c.c)))
          return s
        })
        if (nf.size === words.length) {
          setDone('win')
          setTimeout(() => onResult({ correct: true, score: 1 }), 500)
        }
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [path, grid, words, foundWords, onResult, done])

  const inPath = new Set(path.map((c) => key(c.r, c.c)))

  return (
    <div className="mt-3">
      <p className="text-sm mb-3" style={{ opacity: 0.7 }}>{puzzle.question}</p>

      {/* טיימר ספירה-לאחור — תום הזמן = כישלון */}
      <Countdown seconds={scale.timeSec} running={done === null} onExpire={onTimeout} />

      {done === 'lose' && (
        <p className="text-sm text-center mb-3" style={{ color: '#ff9bb3' }}>⏳ נגמר הזמן — המילים מסומנות ברשת</p>
      )}

      <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start justify-center">
        {/* רשת האותיות — RTL */}
        <div
          ref={gridRef}
          dir="rtl"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${size}, 1fr)`,
            gap: '2px',
            touchAction: 'none',
            userSelect: 'none',
            width: 'min(82vw, 22rem)',
          }}
        >
          {grid.map((row, r) =>
            row.map((ch, c) => {
              const k = key(r, c)
              const isFound = foundCells.has(k)
              const isSel = inPath.has(k)
              return (
                <div
                  key={k}
                  data-r={r}
                  data-c={c}
                  onPointerDown={(e) => { if (done) return; e.preventDefault(); begin({ r, c }) }}
                  style={{
                    aspectRatio: '1 / 1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 'clamp(0.7rem, 3.5vw, 1rem)',
                    fontWeight: 700,
                    borderRadius: '0.3rem',
                    cursor: 'pointer',
                    color: isFound ? '#5fffb0' : 'var(--holo-text)',
                    background: isSel ? 'rgba(0,246,255,0.45)' : isFound ? 'rgba(0,255,150,0.15)' : 'rgba(5,10,25,0.6)',
                    border: `1px solid ${isSel ? 'var(--holo-cyan)' : isFound ? 'rgba(0,255,150,0.5)' : 'rgba(0,246,255,0.15)'}`,
                    transition: 'background 0.1s',
                  }}
                >
                  {ch}
                </div>
              )
            }),
          )}
        </div>

        {/* רשימת המילים למצוא */}
        <div className="text-start" style={{ minWidth: '7rem' }}>
          <div className="text-xs font-bold mb-2" style={{ color: 'var(--holo-cyan)' }}>מצאו:</div>
          <ul className="flex flex-row flex-wrap sm:flex-col gap-x-3 gap-y-1">
            {words.map((w) => {
              const done = foundWords.has(w)
              return (
                <li
                  key={w}
                  style={{
                    fontSize: '0.9rem',
                    color: done ? '#5fffb0' : 'var(--holo-text)',
                    textDecoration: done ? 'line-through' : 'none',
                    opacity: done ? 0.7 : 1,
                  }}
                >
                  {done ? '✓ ' : '• '}{w}
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      {done === null && (
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
