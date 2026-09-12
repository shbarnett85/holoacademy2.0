import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { playSound } from '../../../shared/lib/sound'
import type { Puzzle } from '../useGameEngine'
import { scaleMemory } from '../../../shared/lib/difficultyScaling'
import { FailPips } from './failUi'
import { triggerErrorFlash } from './errorFlash'

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

/* ── מידות קבועות מראש ─────────────────────────────────────────────────
   הקלף לעולם לא נמדד לפי תוכנו: הרשת קובעת מידות פעם אחת (לפי מספר
   הקלפים והשטח הפנוי), והטקסט מתאים את עצמו לקלף — פונט אחיד לכל הלוח,
   שנבחר לפי הטקסט הארוך ביותר. כך ההיפוך לא משנה שום מידה והלוח לא קופץ. */
const GAP = 6
const BOARD_MAX_W = 576 /* ‎36rem — לא נותנים ללוח להשתולל על מסך רחב */
const CARD_MAX_H = 120
const RESERVE_BELOW = 72 /* כפתור הוויתור + ריפוד הפאנל מתחת ללוח */
const BASE_FONT = 15
const MIN_FONT = 10 /* מתחת לזה לא יורדים — עדיף חיתוך עם … מקלף שגדל */

/* הפונט הגדול ביותר שבו **כל** הטקסטים נכנסים לקלף (מדידת canvas, גלישת
   מילים חמדנית). לא נמצא גם במינימום → מחזירים את המינימום, וה-line-clamp
   שעל הקלף חותך עם אליפסיס במקום להרחיב. */
function fitFontSize(texts: string[], innerW: number, innerH: number, family: string): number {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx || innerW <= 0 || innerH <= 0) return MIN_FONT
  for (let f = BASE_FONT; f >= MIN_FONT; f -= 0.5) {
    ctx.font = `600 ${f}px ${family}`
    const lineH = f * 1.25
    const space = ctx.measureText(' ').width
    const fits = texts.every((t) => {
      let lines = 1
      let cur = 0
      for (const w of t.split(/\s+/).filter(Boolean)) {
        const ww = ctx.measureText(w).width
        if (ww > innerW) lines += Math.ceil(ww / innerW) - 1 /* מילה ארוכה מרוחב הקלף — נשברת */
        if (cur > 0 && cur + space + ww > innerW) { lines++; cur = Math.min(ww, innerW) }
        else cur += (cur ? space : 0) + Math.min(ww, innerW)
      }
      return lines * lineH <= innerH
    })
    if (fits) return f
  }
  return MIN_FONT
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
        setTimeout(() => onResult({ correct: true, score: 1 }), 600) /* win יושמע בסיום */
      } else {
        playSound('good') /* זוג שהותאם (צעד-ביניים) */
      }
    } else {
      /* טעות — הופכים בחזרה אחרי השהיה */
      const newMistakes = mistakes + 1
      setMistakes(newMistakes)
      triggerErrorFlash()
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

  /* ── מדידת השטח הפנוי ללוח (רוחב העטיפה + הגובה שנותר עד תחתית המסך) ──
     נמדד בטעינה, אחרי אנימציית הכניסה, ובכל שינוי גודל — לעולם לא בהיפוך. */
  const wrapRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      const h = Math.max(150, window.innerHeight - el.getBoundingClientRect().top - RESERVE_BELOW)
      setBox((p) => (p && Math.abs(p.w - w) < 2 && Math.abs(p.h - h) < 2 ? p : { w, h }))
    }
    measure()
    const t = setTimeout(measure, 500) /* אחרי שאנימציית הכניסה (scale) מתייצבת */
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => { clearTimeout(t); ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [])

  /* ── הרשת: עמודות = מחלק של מספר הקלפים (מלבן שלם), הזוג שנבחר הוא זה
     שמצמיד את יחס הקלף ל-1.55~ בשטח הנתון — מסך רחב-ונמוך (מובייל רוחבי)
     מקבל אוטומטית יותר עמודות ופחות שורות. המידות קבועות: הן לא תלויות
     בתוכן ולא משתנות בהיפוך. ── */
  const layout = useMemo(() => {
    const N = deck.length
    const w = Math.min(box?.w ?? 480, BOARD_MAX_W)
    const h = box?.h ?? 320
    let cols = 2
    let bestScore = Infinity
    for (let c = 2; c <= 8; c++) {
      if (N % c !== 0) continue
      const rows = N / c
      const cw = (w - GAP * (c - 1)) / c
      const ch = Math.min((h - GAP * (rows - 1)) / rows, CARD_MAX_H)
      const score = Math.abs(cw / ch - 1.55) + (cw < 56 ? 10 : 0) /* קנס לקלף צר מקריא */
      if (score < bestScore) { bestScore = score; cols = c }
    }
    const rows = N / cols
    const cardW = Math.floor((w - GAP * (cols - 1)) / cols)
    const cardH = Math.min(Math.floor((h - GAP * (rows - 1)) / rows), CARD_MAX_H)
    return { cols, cardW, cardH, boardW: w }
  }, [deck.length, box])

  /* פונט אחיד לכל הלוח — נקבע פעם אחת לפי הטקסט הארוך ביותר במידות הקלף */
  const font = useMemo(() => {
    const family = wrapRef.current ? getComputedStyle(wrapRef.current).fontFamily : 'Rubik, sans-serif'
    const size = fitFontSize(deck.map((c) => c.text), layout.cardW - 12, layout.cardH - 8, family)
    return { size, clampLines: Math.max(1, Math.floor((layout.cardH - 8) / (size * 1.25))) }
  }, [deck, layout])

  return (
    <div className="mt-4">
      <style>{`
        @keyframes mem-in { from{transform:rotateY(90deg);opacity:0;} to{transform:rotateY(0);opacity:1;} }
        .mem-face { animation: mem-in 0.3s ease; }
      `}</style>
      <p className="text-sm mb-2" style={{ opacity: 0.75 }}>{puzzle.question}</p>

      {/* מד פסילות שנותרו */}
      <FailPips remaining={mistakeBudget - mistakes} total={mistakeBudget} label="פסילות" />

      {/* חריץ קבוע להודעת הכישלון — כך הופעתה לא מזיזה את הלוח */}
      <p className="text-sm text-center" style={{ color: '#ff9bb3', minHeight: 20, margin: '0 0 6px', visibility: over && mistakes >= mistakeBudget ? 'visible' : 'hidden' }}>
        💥 נגמרו הפסילות — אלו הזוגות הנכונים
      </p>

      <div ref={wrapRef}>
        {box && (
          <div
            className="mx-auto"
            style={{ display: 'grid', gridTemplateColumns: `repeat(${layout.cols}, 1fr)`, gridAutoRows: `${layout.cardH}px`, gap: GAP, width: layout.boardW }}
          >
            {deck.map((card, idx) => {
              const isUp = revealAll || matched.has(idx) || flipped.includes(idx)
              const isMatched = matched.has(idx)
              return (
                <button
                  key={card.id}
                  onClick={() => flip(idx)}
                  style={{
                    /* מידות קבועות — שני צידי הקלף זהים, התוכן לעולם לא מרחיב */
                    height: '100%',
                    minWidth: 0,
                    overflow: 'hidden',
                    borderRadius: '0.6rem',
                    cursor: isUp || over ? 'default' : 'pointer',
                    padding: '4px 6px',
                    fontSize: font.size,
                    lineHeight: 1.25,
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
                  {isUp ? (
                    /* line-clamp = רשת ביטחון: טקסט שגם בפונט המינימלי לא נכנס נחתך עם … */
                    <span className="mem-face" style={{ display: '-webkit-box', WebkitLineClamp: font.clampLines, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {card.text}
                    </span>
                  ) : (
                    <span style={{ fontSize: Math.min(22, layout.cardH - 12), opacity: 0.5 }}>❔</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
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
