import type { CollectableItem } from './useGameEngine'

const SLOT_COUNT = 5

/* תאי החפצים — מוצגים ברצועת ה-HUD העליונה. חייבים להישאר גלויים ולחיצים:
   הדמיות עם מפתחות/מנעולים (מבנה Hub) בלתי-פתירות בלעדיהם. */
export function ItemSlots({ inventory, justCollected, onUseItem }: { inventory: CollectableItem[]; justCollected: CollectableItem | null; onUseItem: (itemId: string) => void }) {
  return (
    <>
      <style>{`
        @keyframes item-land {
          0% { transform: translateY(-60dvh) scale(2); opacity: 0; }
          60% { transform: translateY(0) scale(1.3); opacity: 1; }
          100% { transform: translateY(0) scale(1); }
        }
        @keyframes slot-glow {
          0%, 100% { box-shadow: 0 0 6px rgba(0,246,255,0.3); }
          50% { box-shadow: 0 0 22px rgba(0,246,255,0.9); }
        }
        .item-new { animation: item-land 0.9s cubic-bezier(0.2, 0.8, 0.3, 1.1), slot-glow 1.2s ease 0.9s; }
        @media (prefers-reduced-motion: reduce) { .item-new { animation: none; } }
      `}</style>
      <div className="flex" style={{ gap: 'var(--hud-slot-gap, 0.5rem)' }} dir="ltr">
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
                width: 'var(--hud-slot, 2.8rem)',
                height: 'var(--hud-slot, 2.8rem)',
                flexShrink: 0,
                borderRadius: '50%',
                cursor: item ? 'pointer' : 'default',
                fontSize: 'var(--hud-slot-font, 1.4rem)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: item ? 'rgba(0,136,255,0.18)' : 'transparent',
                border: item ? '2px solid rgba(0,246,255,0.55)' : '2px dashed rgba(0,246,255,0.18)',
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
                <img src={item.imageUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
              ) : (
                item?.icon ?? ''
              )}
            </button>
          )
        })}
      </div>
    </>
  )
}
