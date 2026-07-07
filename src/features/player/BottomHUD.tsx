import { useCallback, useEffect, useRef, useState } from 'react'
import CrystalGauge from './CrystalGauge'
import { playSound } from '../../shared/lib/sound'
import { TOTAL_CRYSTALS, type CollectableItem } from './useGameEngine'

const SLOT_COUNT = 5

interface Props {
  crystalProgress: number /* 0..1 */
  shardEvent: number /* טריגר לאנימציית רסיס עף */
  inventory: CollectableItem[]
  justCollected: CollectableItem | null
  studentName: string
  onUseItem: (itemId: string) => void
  /* מצב עין — הפס מחליק החוצה מתחתית המסך */
  hidden?: boolean
}

/* שורת 5 הקריסטלים + אנימציית רסיס עף */
/* מד הקריסטלים — **המילוי נדחה לרגע הגעת הרסיסים**: ההתקדמות (prop) מתעדכנת ברגע
   הפתרון, אבל התצוגה (display) מתמלאת רק כשרסיסי ההצלחה מגיעים (אירוע
   'holo-shards-arrived' מ-successShatter), באנימציית מילוי רכה על הקריסטל הספציפי.
   קריסטל שהושלם: צליל ניצחון + פעימת crystal-pop (הקיימת) + הבזק אור מהקריסטל. */
function CrystalBar({ progress }: { progress: number; shardEvent: number }) {
  const [display, setDisplay] = useState(progress)
  const displayRef = useRef(progress)
  const pendingRef = useRef(progress)
  const [justCompletedIdx, setJustCompletedIdx] = useState<number | null>(null)
  const [flashIdx, setFlashIdx] = useState<number | null>(null)

  pendingRef.current = progress

  /* ירידה בהתקדמות (restart) — סנכרון מיידי, בלי אנימציה */
  useEffect(() => {
    if (progress < displayRef.current) {
      displayRef.current = progress
      setDisplay(progress)
    }
  }, [progress])

  /* המילוי אל היעד: קפיצת state יחידה — האנימציה החלקה עצמה היא מעבר CSS בתוך
     CrystalGauge (חסין ללשוניות רקע; RAF הוכח כמוקפא בסביבות מסוימות).
     בסיום המעבר, אם קריסטל הושלם: צליל הניצחון + פעימת crystal-pop + הבזק אור. */
  const FILL_MS = 560
  const animateTo = useCallback((target: number) => {
    const from = displayRef.current
    if (target <= from + 1e-9) return
    const prevFull = Math.floor(from * TOTAL_CRYSTALS + 1e-9)
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    displayRef.current = target
    setDisplay(target)
    const nowFull = Math.floor(target * TOTAL_CRYSTALS + 1e-9)
    if (nowFull > prevFull) {
      const idx = nowFull - 1
      window.setTimeout(() => {
        playSound('win') /* צליל הניצחון — ברגע שהקריסטל התמלא לגמרי */
        setJustCompletedIdx(idx)
        setFlashIdx(idx)
        window.setTimeout(() => setJustCompletedIdx(null), 900)
        window.setTimeout(() => setFlashIdx(null), 650)
      }, reduce ? 0 : FILL_MS)
    }
  }, [])

  /* הרסיסים הגיעו אל הקריסטל → מתחילים למלא אותו */
  useEffect(() => {
    const onArrive = () => animateTo(pendingRef.current)
    window.addEventListener('holo-shards-arrived', onArrive)
    return () => window.removeEventListener('holo-shards-arrived', onArrive)
  }, [animateTo])

  /* רשת ביטחון: התקדמות שלא לוותה ברסיסים (מסלול חריג) — מסונכרנת בשקט אחרי רגע */
  useEffect(() => {
    if (progress <= displayRef.current + 1e-9) return
    const t = setTimeout(() => animateTo(pendingRef.current), 4000)
    return () => clearTimeout(t)
  }, [progress, animateTo])

  /* הקריסטל שמתמלא כרגע — היעד שאליו הרסיסים מכוונים (נגזר מ-display, מתעדכן ברינדור) */
  const targetIdx = Math.min(TOTAL_CRYSTALS - 1, Math.floor(display * TOTAL_CRYSTALS + 1e-9))

  return (
    /* data-crystal-bar — עוגן fallback; הרסיסים מכוונים אל [data-crystal-target] הספציפי */
    <div className="relative flex items-end gap-1" dir="ltr" data-crystal-bar>
      <style>{`
        @keyframes crystal-pop-kf {
          0% { transform: scale(1); }
          40% { transform: scale(1.35); }
          100% { transform: scale(1); }
        }
        .crystal-pop { animation: crystal-pop-kf 0.7s cubic-bezier(0.3, 1.5, 0.5, 1); }
        /* הבזק אור קטן שפורץ מהקריסטל ברגע ההשלמה */
        @keyframes crystal-flash-kf {
          0%   { opacity: 0.95; transform: translate(-50%, -50%) scale(0.4); }
          100% { opacity: 0;    transform: translate(-50%, -50%) scale(2.6); }
        }
        .crystal-flash {
          position: absolute; left: 50%; top: 50%; width: 34px; height: 34px;
          border-radius: 50%; pointer-events: none; z-index: 61;
          background: radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(47,243,255,0.7) 35%, transparent 70%);
          animation: crystal-flash-kf 0.6s ease-out forwards;
        }
      `}</style>

      {Array.from({ length: TOTAL_CRYSTALS }).map((_, i) => {
        const fillFraction = Math.max(0, Math.min(1, display * TOTAL_CRYSTALS - i))
        return (
          <span key={i} className="relative" {...(i === targetIdx ? { 'data-crystal-target': '1' } : {})}>
            <CrystalGauge fill={fillFraction} justCompleted={justCompletedIdx === i} />
            {flashIdx === i && <span className="crystal-flash" />}
          </span>
        )
      })}
    </div>
  )
}

/* HUD תחתון — קריסטלים, חפצים, שם תלמיד */
export default function BottomHUD({ crystalProgress, shardEvent, inventory, justCollected, studentName, onUseItem, hidden = false }: Props) {
  return (
    <>
      <style>{`
        @keyframes item-land {
          0% { transform: translateY(-60vh) scale(2); opacity: 0; }
          60% { transform: translateY(0) scale(1.3); opacity: 1; }
          100% { transform: translateY(0) scale(1); }
        }
        @keyframes slot-glow {
          0%, 100% { box-shadow: 0 0 6px rgba(0,246,255,0.3); }
          50% { box-shadow: 0 0 22px rgba(0,246,255,0.9); }
        }
        .item-new { animation: item-land 0.9s cubic-bezier(0.2, 0.8, 0.3, 1.1), slot-glow 1.2s ease 0.9s; }
      `}</style>

      <div
        className="fixed bottom-0 left-0 right-0 flex items-center justify-between px-4 py-2"
        style={{
          background: 'rgba(10,10,31,0.85)',
          borderTop: '1px solid rgba(0,246,255,0.25)',
          backdropFilter: 'blur(10px)',
          zIndex: 70,
          /* מצב עין — סגירה החוצה: slide-down + fade, וחזרה ב-slide-up */
          transform: hidden ? 'translateY(110%)' : 'translateY(0)',
          opacity: hidden ? 0 : 1,
          transition: 'transform 0.45s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.45s ease',
          pointerEvents: hidden ? 'none' : 'auto',
        }}
      >
        {/* ימין (ב-RTL זה הצד הראשון): קריסטלים */}
        <CrystalBar progress={crystalProgress} shardEvent={shardEvent} />

        {/* מרכז: slots של חפצים */}
        <div className="flex gap-2" dir="ltr">
          {Array.from({ length: SLOT_COUNT }).map((_, i) => {
            const item = inventory[i]
            const isNew = item && justCollected?.id === item.id
            return (
              <button
                key={i}
                onClick={() => item && onUseItem(item.id)}
                title={item?.name ?? ''}
                className={isNew ? 'item-new' : ''}
                style={{
                  width: '2.8rem',
                  height: '2.8rem',
                  borderRadius: '50%',
                  cursor: item ? 'pointer' : 'default',
                  fontSize: '1.4rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: item ? 'rgba(0,136,255,0.18)' : 'transparent',
                  border: item
                    ? '2px solid rgba(0,246,255,0.55)'
                    : '2px dashed rgba(0,246,255,0.18)',
                  boxShadow: item ? '0 0 10px rgba(0,246,255,0.25)' : 'none',
                  transition: 'transform 0.15s',
                  overflow: 'hidden',
                  padding: 0,
                }}
                onMouseEnter={(e) => item && (e.currentTarget.style.transform = 'scale(1.15)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                {item?.imageUrl ? (
                  /* תמונת החפץ העגולה — fallback לאמוג'י אם אין */
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                  />
                ) : (
                  item?.icon ?? ''
                )}
              </button>
            )
          })}
        </div>

        {/* שמאל: שם התלמיד (כפתור היציאה עבר לפס העליון TopHUD) */}
        <div className="flex items-center gap-3">
          <span className="text-sm" style={{ color: 'var(--holo-text)', opacity: 0.7 }}>
            🧑‍🚀 {studentName}
          </span>
        </div>
      </div>
    </>
  )
}
