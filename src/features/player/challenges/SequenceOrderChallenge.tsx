import { useEffect, useMemo, useRef, useState } from 'react'
import type { Puzzle } from '../useGameEngine'
import { scaleSequenceOrder } from '../../../shared/lib/difficultyScaling'
import { FailPips } from './failUi'

interface Props {
  puzzle: Puzzle
  onResult: (r: { correct: boolean; score?: number }) => void
}

/* ערבוב שמבטיח שהסדר ההתחלתי אינו הסדר הנכון */
function shuffledIds(ids: string[]): string[] {
  if (ids.length < 2) return [...ids]
  let arr: string[]
  do {
    arr = [...ids]
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
  } while (arr.every((v, i) => v === ids[i]))
  return arr
}

const ORDER_HINTS: Record<string, string> = {
  chronological: '🕓 סדרו מהמוקדם ביותר (למעלה) למאוחר ביותר (למטה)',
  logical: '⚙️ סדרו לפי סדר שלבי התהליך — מהראשון לאחרון',
  hierarchical: '📊 סדרו מהגדול/חשוב ביותר (למעלה) לקטן/פחות (למטה)',
}

/* חידת סדר — גרירה לסידור פריטים ברצף הנכון (רשימה אנכית, תמיכת מגע, RTL) */
export default function SequenceOrderChallenge({ puzzle, onResult }: Props) {
  const items = useMemo(() => puzzle.items ?? [], [puzzle.items])
  const correctOrder = useMemo(() => puzzle.correctOrder ?? items.map((i) => i.id), [puzzle.correctOrder, items])
  const textById = useMemo(() => new Map(items.map((i) => [i.id, i.text])), [items])

  /* תנאי כישלון: מספר נסיונות הגשה שגויים לפי הרמה */
  const maxAttempts = scaleSequenceOrder(puzzle.difficulty ?? 5).maxAttempts
  const [order, setOrder] = useState(() => shuffledIds(items.map((i) => i.id)))
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [result, setResult] = useState<'correct' | 'wrong' | null>(null)
  const [finished, setFinished] = useState<'win' | 'lose' | null>(null)
  const [wrong, setWrong] = useState(0)
  /* הגרירה מנוהלת ב-ref (מיידי, ללא תלות ב-re-render) — המאזינים תמיד מחוברים */
  const draggingRef = useRef<string | null>(null)

  function startDrag(id: string) {
    draggingRef.current = id
    setDraggingId(id)
  }

  /* גרירה חיה — מאזינים גלובליים קבועים שקוראים את ה-ref (עובד גם במגע) */
  useEffect(() => {
    function move(e: PointerEvent) {
      const dragId = draggingRef.current
      if (!dragId) return
      const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('[data-seq-id]') as HTMLElement | null
      if (!el) return
      const overId = el.getAttribute('data-seq-id')
      if (!overId || overId === dragId) return
      const rect = el.getBoundingClientRect()
      const after = e.clientY > rect.top + rect.height / 2
      setOrder((prev) => {
        const a = prev.filter((x) => x !== dragId)
        let idx = a.indexOf(overId)
        if (after) idx += 1
        a.splice(idx, 0, dragId)
        return a
      })
    }
    function up() {
      if (!draggingRef.current) return
      draggingRef.current = null
      setDraggingId(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  function check() {
    if (finished) return
    const ok = order.length === correctOrder.length && order.every((id, i) => id === correctOrder[i])
    if (ok) {
      setResult('correct')
      setFinished('win')
      setTimeout(() => onResult({ correct: true, score: 1 }), 850)
      return
    }
    /* הגשה שגויה — ניקוב מד הניסיונות; כישלון רק במיצוי */
    const w = wrong + 1
    setWrong(w)
    setResult('wrong')
    if (w >= maxAttempts) {
      setFinished('lose')
      setOrder([...correctOrder]) /* חשיפת הסדר הנכון */
      setTimeout(() => onResult({ correct: false, score: 0 }), 950)
    } else {
      setTimeout(() => setResult(null), 450) /* ניקוי הרעד, מאפשר ניסיון נוסף */
    }
  }

  const remaining = maxAttempts - wrong

  const hint = ORDER_HINTS[puzzle.orderType ?? ''] ?? '↕ גררו את הפריטים לרצף הנכון'

  return (
    <div className="mt-3">
      <style>{`
        @keyframes seq-correct { 0%,100%{box-shadow:0 0 10px rgba(0,255,150,0.4);} 50%{box-shadow:0 0 30px rgba(0,255,150,0.95);} }
        @keyframes seq-wrong { 0%,100%{transform:translateX(0);} 25%{transform:translateX(-7px);} 75%{transform:translateX(7px);} }
        .seq-correct { animation: seq-correct 0.8s ease; }
        .seq-wrong { animation: seq-wrong 0.4s ease; }
      `}</style>

      <p className="text-sm mb-1" style={{ opacity: 0.8 }}>{puzzle.question}</p>
      <p className="text-xs mb-3" style={{ color: 'var(--holo-cyan)', opacity: 0.85 }}>{hint}</p>

      {/* מד נסיונות הגשה שנותרו */}
      <FailPips remaining={remaining} total={maxAttempts} label="ניסיונות" />

      {finished === 'lose' && (
        <p className="text-sm text-center mb-2" style={{ color: '#ff9bb3' }}>💥 נגמרו הניסיונות — זהו הסדר הנכון</p>
      )}

      <div className={`flex flex-col gap-2 ${result === 'wrong' ? 'seq-wrong' : ''}`} style={{ touchAction: 'none' }}>
        {order.map((id, pos) => {
          const isDragging = draggingId === id
          return (
            <div
              key={id}
              data-seq-id={id}
              onPointerDown={(e) => { if (!finished) { e.preventDefault(); startDrag(id) } }}
              className={finished === 'win' ? 'seq-correct' : ''}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.7rem',
                padding: '0.7rem 0.9rem',
                borderRadius: '0.7rem',
                cursor: finished ? 'default' : 'grab',
                userSelect: 'none',
                background: isDragging ? 'rgba(0,136,255,0.3)' : 'rgba(5,10,25,0.7)',
                border: `1px solid ${isDragging ? 'var(--holo-cyan)' : 'rgba(0,246,255,0.25)'}`,
                boxShadow: isDragging ? '0 6px 24px rgba(0,0,0,0.5), 0 0 16px rgba(0,246,255,0.5)' : 'none',
                transform: isDragging ? 'scale(1.03)' : 'scale(1)',
                opacity: draggingId && !isDragging ? 0.7 : 1,
                transition: 'background 0.15s, border 0.15s, transform 0.12s, opacity 0.15s',
                color: 'var(--holo-text)',
              }}
            >
              {/* מספר המיקום הנוכחי */}
              <span
                className="shrink-0 flex items-center justify-center"
                style={{
                  width: '1.7rem', height: '1.7rem', borderRadius: '50%',
                  background: 'rgba(0,246,255,0.15)', border: '1px solid rgba(0,246,255,0.4)',
                  color: 'var(--holo-cyan)', fontWeight: 700, fontSize: '0.85rem',
                }}
              >
                {pos + 1}
              </span>
              <span className="flex-1 text-start">{textById.get(id) ?? id}</span>
              <span style={{ opacity: 0.4, fontSize: '1.1rem' }} title="גררו">⣿</span>
            </div>
          )
        })}
      </div>

      {!finished && (
        <div className="text-center mt-4">
          <button className="holo-button text-lg" style={{ padding: '0.6rem 2.2rem' }} onClick={check}>
            בדיקה ✓
          </button>
        </div>
      )}
    </div>
  )
}
