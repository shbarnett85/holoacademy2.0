import { useEffect, useRef, useState } from 'react'
import CrystalGauge from './CrystalGauge'
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
function CrystalBar({ progress, shardEvent }: { progress: number; shardEvent: number }) {
  const [flyingShard, setFlyingShard] = useState(false)
  const [justCompletedIdx, setJustCompletedIdx] = useState<number | null>(null)
  const prevFull = useRef(0)
  const prevShard = useRef(shardEvent)

  const fullCount = Math.floor(progress * TOTAL_CRYSTALS + 1e-9)

  /* רסיס עף בכל הצלחה — במקביל לפאנל ההסבר, לא מעכב אותו */
  useEffect(() => {
    if (shardEvent === prevShard.current) return
    prevShard.current = shardEvent
    setFlyingShard(true)
    const t = setTimeout(() => setFlyingShard(false), 900)
    return () => clearTimeout(t)
  }, [shardEvent])

  /* פעימה כשקריסטל מושלם */
  useEffect(() => {
    if (fullCount > prevFull.current) {
      setJustCompletedIdx(fullCount - 1)
      const t = setTimeout(() => setJustCompletedIdx(null), 900)
      prevFull.current = fullCount
      return () => clearTimeout(t)
    }
    prevFull.current = fullCount
  }, [fullCount])

  return (
    <div className="relative flex items-end gap-1" dir="ltr">
      <style>{`
        @keyframes crystal-pop-kf {
          0% { transform: scale(1); }
          40% { transform: scale(1.35); }
          100% { transform: scale(1); }
        }
        .crystal-pop { animation: crystal-pop-kf 0.7s cubic-bezier(0.3, 1.5, 0.5, 1); }
        @keyframes shard-fly {
          0% { transform: translate(40vw, -45vh) scale(1.6) rotate(0deg); opacity: 1; }
          70% { opacity: 1; }
          100% { transform: translate(0, 0) scale(0.5) rotate(360deg); opacity: 0; }
        }
        .shard-flying {
          animation: shard-fly 0.85s cubic-bezier(0.4, 0, 0.6, 1) forwards;
          position: absolute; left: 50%; top: 0;
          pointer-events: none; z-index: 60;
        }
      `}</style>

      {Array.from({ length: TOTAL_CRYSTALS }).map((_, i) => {
        const fillFraction = Math.max(0, Math.min(1, progress * TOTAL_CRYSTALS - i))
        return (
          <CrystalGauge
            key={i}
            fill={fillFraction}
            justCompleted={justCompletedIdx === i}
          />
        )
      })}

      {flyingShard && (
        <span className="shard-flying" style={{ filter: 'drop-shadow(0 0 6px rgba(47,243,255,0.9))' }}>
          {/* רסיס עף — צורת קריסטל HoloAcademy (מעוין+H), לא היהלום הישן */}
          <svg width="16" height="16" viewBox="0 0 340 340">
            <polygon points="170,0 340,170 170,340 0,170" fill="none" stroke="#2ff3ff" strokeWidth="16" strokeLinejoin="round" />
            <g stroke="#2ff3ff" strokeWidth="20" strokeLinecap="round">
              <line x1="85" y1="85" x2="85" y2="255" />
              <line x1="255" y1="85" x2="255" y2="255" />
              <line x1="85" y1="170" x2="255" y2="170" />
            </g>
          </svg>
        </span>
      )}
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
