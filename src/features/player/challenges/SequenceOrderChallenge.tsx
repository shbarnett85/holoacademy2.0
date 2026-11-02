import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Puzzle } from '../useGameEngine'
import { scaleSequenceOrder } from '../../../shared/lib/difficultyScaling'
import { FailPips } from './failUi'
import { triggerErrorFlash } from './errorFlash'
import type { PuzzleTelemetry } from '../../../shared/lib/answerTelemetry'
import { prefersReducedMotion, sounds } from '../gameFeel/engine'

interface Props {
  puzzle: Puzzle
  onResult: (r: { correct: boolean; score?: number }) => void
  /* טלמטריית תשובות (1B) — hook נפרד לצד onResult; אופציונלי ולעולם לא משפיע על הלוגיקה */
  tel?: PuzzleTelemetry
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
export default function SequenceOrderChallenge({ puzzle, onResult, tel }: Props) {
  const items = useMemo(() => puzzle.items ?? [], [puzzle.items])
  const correctOrder = useMemo(() => puzzle.correctOrder ?? items.map((i) => i.id), [puzzle.correctOrder, items])
  const textById = useMemo(() => new Map(items.map((i) => [i.id, i.text])), [items])

  /* תנאי כישלון: מספר נסיונות הגשה שגויים לפי הרמה */
  const maxAttempts = scaleSequenceOrder(puzzle.difficulty ?? 5).maxAttempts
  const [order, setOrder] = useState(() => shuffledIds(items.map((i) => i.id)))
  const [draggingId, setDraggingId] = useState<string | null>(null)
  /* המקום שאליו השורה הנגררת תיפול אם יעזבו אותה עכשיו */
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [result, setResult] = useState<'correct' | 'wrong' | null>(null)
  const [finished, setFinished] = useState<'win' | 'lose' | null>(null)
  const [wrong, setWrong] = useState(0)
  /* סדר ההצגה ההתחלתי — לטלמטריה בלבד */
  useEffect(() => { tel?.setDisplay(order, -1) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* כל פריט שהמיקום שלו השתנה מחליק אליו (ושורה שנעזבה נצמדת למקומה עם overshoot קטן). תצוגה בלבד: הסדר והבדיקה לא משתנים */
  const listRef = useRef<HTMLDivElement>(null)
  const prevTops = useRef<Map<string, number>>(new Map())
  const rowTops = () => {
    const tops = new Map<string, number>()
    listRef.current?.querySelectorAll<HTMLElement>('[data-seq-id]').forEach((el) => { tops.set(el.getAttribute('data-seq-id') ?? '', el.getBoundingClientRect().top) })
    return tops
  }
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const next = rowTops()
    list.querySelectorAll<HTMLElement>('[data-seq-id]').forEach((el) => {
      const id = el.getAttribute('data-seq-id') ?? ''
      const prev = prevTops.current.get(id)
      const delta = prev === undefined ? 0 : prev - (next.get(id) ?? 0)
      if (Math.abs(delta) > 1 && !prefersReducedMotion() && typeof el.animate === 'function') {
        el.animate([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], { duration: 240, easing: 'cubic-bezier(.2,1.25,.4,1)' })
      }
    })
    prevTops.current = next
  }, [order])

  /* גרירה: השורה נצמדת לאצבע בלי רינדור (משתנה CSS), והשאר מחליקות מהדרך. הגאומטריה נמדדת פעם אחת בתחילת הגרירה,
     ולכן המקום המחושב לא "רוטט" בזמן שהשורות זזות. הסדר עצמו מתעדכן רק כשעוזבים. */
  const dragRef = useRef<{ id: string; el: HTMLElement; startY: number; target: number; top: number; height: number; minY: number; maxY: number; others: { center: number; before: boolean }[]; scroller: HTMLElement | null; scroll0: number; pointerY: number } | null>(null)
  const orderRef = useRef(order)
  useEffect(() => { orderRef.current = order }, [order])
  const [travel, setTravel] = useState(0)

  function startDrag(id: string, el: HTMLElement, y: number) {
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-seq-id]') ?? [])].map((r) => ({ id: r.getAttribute('data-seq-id') ?? '', rect: r.getBoundingClientRect() }))
    const index = rows.findIndex((r) => r.id === id)
    if (index < 0) return
    const { top, height } = rows[index].rect
    const gap = rows.length > 1 ? rows[1].rect.top - rows[0].rect.bottom : 0
    /* רשימה ארוכה מהמסך: האזור נגלל כשהאצבע מגיעה לקצה שלו */
    let scroller: HTMLElement | null = listRef.current?.parentElement ?? null
    while (scroller && !(scroller.scrollHeight > scroller.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement
    dragRef.current = {
      id, el, startY: y, target: index, top, height,
      minY: rows[0].rect.top - top,
      maxY: rows[rows.length - 1].rect.bottom - height - top,
      others: rows.flatMap((r, i) => (i === index ? [] : [{ center: r.rect.top + r.rect.height / 2, before: i < index }])),
      scroller, scroll0: scroller?.scrollTop ?? 0, pointerY: y,
    }
    el.style.setProperty('--seq-drag-y', '0px')
    setTravel(height + gap)
    setOverIndex(index)
    setDraggingId(id)
  }

  useEffect(() => {
    /* המיקומים נמדדו בתחילת הגרירה, ולכן מוסיפים את מה שהאזור נגלל מאז */
    function place(d: NonNullable<typeof dragRef.current>) {
      const scrolled = (d.scroller?.scrollTop ?? d.scroll0) - d.scroll0
      const dy = Math.max(d.minY, Math.min(d.maxY, d.pointerY - d.startY + scrolled))
      d.el.style.setProperty('--seq-drag-y', `${dy}px`)
      /* שורה מפנה מקום ברגע שקצה השורה הנגררת עובר את האמצע שלה, ולכן אפשר להגיע גם לקצוות הרשימה */
      const top = d.top + dy
      const target = d.others.filter((o) => (o.before ? o.center <= top : o.center < top + d.height)).length
      if (target !== d.target) { d.target = target; setOverIndex(target) }
    }
    let raf = 0
    function autoScroll() {
      raf = 0
      const d = dragRef.current
      if (!d?.scroller) return
      const box = d.scroller.getBoundingClientRect()
      const edge = 56
      const bottom = Math.min(box.bottom, window.innerHeight)
      const speed = d.pointerY > bottom - edge ? (d.pointerY - (bottom - edge)) / 6 : d.pointerY < box.top + edge ? (d.pointerY - (box.top + edge)) / 6 : 0
      if (!speed) return
      const before = d.scroller.scrollTop
      d.scroller.scrollTop = before + speed
      if (d.scroller.scrollTop !== before) { place(d); raf = requestAnimationFrame(autoScroll) }
    }
    function move(e: PointerEvent) {
      const d = dragRef.current
      if (!d) return
      d.pointerY = e.clientY
      place(d)
      if (!raf) raf = requestAnimationFrame(autoScroll)
    }
    function up() {
      const d = dragRef.current
      if (!d) return
      dragRef.current = null
      /* המיקום שרואים עכשיו (כולל ההזזות) הוא נקודת המוצא של ההיצמדות */
      prevTops.current = rowTops()
      const next = orderRef.current.filter((x) => x !== d.id)
      next.splice(d.target, 0, d.id)
      setOrder(next)
      setDraggingId(null)
      setOverIndex(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      cancelAnimationFrame(raf)
    }
  }, [])

  /* משך סוויפ הסדר: הדגשה מדורגת פריט-אחר-פריט (150ms ביניהם) לפני ההמשך —
     "זהו הסדר הנכון" במקום מעבר מיידי */
  const sweepMs = items.length * 150 + 900

  function check() {
    if (finished) return
    const ok = order.length === correctOrder.length && order.every((id, i) => id === correctOrder[i])
    tel?.act('submit', { order: [...order], correct: ok })
    if (ok) {
      setResult('correct')
      setFinished('win')
      /* הפריטים נדלקים אחד אחרי השני, עם צליל עולה */
      items.forEach((_, i) => { window.setTimeout(() => sounds.chain(i), i * 150) })
      setTimeout(() => onResult({ correct: true, score: 1 }), sweepMs)
      return
    }
    /* הגשה שגויה — ניקוב מד הניסיונות; כישלון רק במיצוי */
    const w = wrong + 1
    setWrong(w)
    setResult('wrong')
    triggerErrorFlash()
    if (w >= maxAttempts) {
      setFinished('lose')
      setOrder([...correctOrder]) /* חשיפת הסדר הנכון — עם אותו סוויפ מדורג (לומדים ממנו) */
      setTimeout(() => onResult({ correct: false, score: 0 }), sweepMs + 250)
    } else {
      setTimeout(() => setResult(null), 450) /* ניקוי הרעד, מאפשר ניסיון נוסף */
    }
  }

  const remaining = maxAttempts - wrong

  const hint = ORDER_HINTS[puzzle.orderType ?? ''] ?? '↕ גררו את הפריטים לרצף הנכון'

  return (
    <div className={finished ? 'mt-0' : 'mt-3'}>
      <style>{`
        @keyframes seq-wrong { 0%,100%{transform:translateX(0);} 25%{transform:translateX(-7px);} 75%{transform:translateX(7px);} }
        .seq-wrong { animation: seq-wrong 0.4s ease; }
        /* סוויפ הסדר הנכון — כל פריט נדלק בתורו (delay פר-מיקום), מלמעלה למטה */
        @keyframes seq-sweep {
          0%   { box-shadow: none; transform: translateY(0) scale(1); }
          45%  { box-shadow: 0 0 26px rgba(47,243,255,0.9), inset 0 0 14px rgba(47,243,255,0.25); transform: translateY(-3px) scale(1.02); }
          100% { box-shadow: 0 0 10px rgba(0,255,150,0.45); transform: translateY(0) scale(1); }
        }
        .seq-sweep { animation: seq-sweep 0.6s ease both; }
        @media (prefers-reduced-motion: reduce) { .seq-sweep { animation: none; box-shadow: 0 0 10px rgba(0,255,150,0.45); } }
      `}</style>

      <p data-challenge-q className="text-sm mb-1" style={{ opacity: 0.8 }}>{puzzle.question}</p>
      <p data-solution-hide className="text-xs mb-3" style={{ color: 'var(--holo-cyan)', opacity: 0.85 }}>{hint}</p>

      {/* מד נסיונות הגשה שנותרו */}
      <FailPips remaining={remaining} total={maxAttempts} label="ניסיונות" />

      {finished === 'lose' && (
        <p className="text-sm text-center mb-1" style={{ color: '#ff9bb3' }}>נגמרו הניסיונות — זהו הסדר הנכון</p>
      )}

      <div ref={listRef} className={`flex flex-col ${finished ? 'gap-1' : 'gap-1.5'} ${result === 'wrong' ? 'seq-wrong' : ''}`} style={{ touchAction: 'none' }}>
        {order.map((id, pos) => {
          const isDragging = draggingId === id
          /* המקום של השורה אם יעזבו עכשיו: קובע את המספר שלה ואת ההזזה שלה */
          const from = draggingId ? order.indexOf(draggingId) : -1
          const over = overIndex ?? from
          const shift = !draggingId || isDragging ? 0 : pos > from && pos <= over ? -1 : pos < from && pos >= over ? 1 : 0
          const shownPos = isDragging ? over : pos + shift
          return (
            <div
              key={id}
              data-seq-id={id}
              onPointerDown={(e) => { if (!finished) { e.preventDefault(); startDrag(id, e.currentTarget, e.clientY) } }}
              className={finished ? 'seq-sweep' : ''}
              style={{
                ...(finished ? { animationDelay: `${pos * 0.15}s` } : {}),
                display: 'flex',
                alignItems: 'center',
                gap: '0.7rem',
                padding: finished ? '0.2rem 0.8rem' : '0.4rem 0.9rem',
                borderRadius: '0.7rem',
                cursor: finished ? 'default' : isDragging ? 'grabbing' : 'grab',
                userSelect: 'none',
                lineHeight: finished ? 1.2 : undefined,
                position: 'relative',
                zIndex: isDragging ? 2 : undefined,
                willChange: draggingId ? 'transform' : undefined,
                background: isDragging ? 'rgba(0,136,255,0.3)' : 'rgba(5,10,25,0.7)',
                border: `1px solid ${isDragging ? 'var(--holo-cyan)' : 'rgba(0,246,255,0.25)'}`,
                boxShadow: isDragging ? '0 6px 24px rgba(0,0,0,0.5), 0 0 16px rgba(0,246,255,0.5)' : 'none',
                scale: isDragging ? '1.02' : '1',
                /* translate ולא transform לשורה הנגררת: scale חל אחרי transform ומגדיל גם את המרחק, והשורה הייתה מתרחקת מהאצבע */
                ...(finished ? {} : isDragging ? { translate: '0 var(--seq-drag-y, 0px)' } : { transform: `translateY(${shift * travel}px)` }),
                opacity: draggingId && !isDragging ? 0.75 : 1,
                /* transform עם מעבר רק בזמן גרירה ורק לשורות שמפנות מקום: השורה הנגררת צמודה לאצבע, וברגע העזיבה ההיצמדות נעשית מהמיקום שנמדד */
                transition: `background 0.15s, border 0.15s, scale 0.12s, opacity 0.15s${draggingId && !isDragging ? ', transform 0.18s cubic-bezier(.2,.8,.2,1)' : ''}`,
                color: 'var(--holo-text)',
              }}
            >
              {/* מספר המיקום הנוכחי */}
              <span
                className="shrink-0 flex items-center justify-center"
                style={{
                  width: finished ? '1.35rem' : '1.7rem', height: finished ? '1.35rem' : '1.7rem', borderRadius: '50%',
                  background: 'rgba(0,246,255,0.15)', border: '1px solid rgba(0,246,255,0.4)',
                  color: 'var(--holo-cyan)', fontWeight: 700, fontSize: '0.85rem',
                }}
              >
                {shownPos + 1}
              </span>
              <span className="flex-1 text-start">{textById.get(id) ?? id}</span>
              {!finished && <span style={{ opacity: 0.4, fontSize: '1.1rem' }} title="גררו">⣿</span>}
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
