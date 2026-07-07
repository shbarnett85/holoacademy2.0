/* התפוגגות פאנל ההצלחה לרסיסי תכלת שעפים אל מד הקריסטלים (BottomHUD, [data-crystal-bar]).
   WAAPI על overlay קבוע — בלי re-render-ים, בלי ספריות. הפאנל דוהה מהר והרסיסים
   "יורשים" אותו במסלולי קשת מדורגים; בהגעה — פעימת crystal-pop על המד.
   prefers-reduced-motion → דילוג ישיר ל-onDone. onDone נקרא פעם אחת בדיוק. */

const SHARD_COLORS = ['#2ff3ff', '#7ef6ff', '#9b8cff', '#bffcff']
const SHARD_COUNT = 18

export function shatterToCrystals(panel: HTMLElement, onDone: () => void): void {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (reduce || !panel.isConnected || typeof panel.animate !== 'function') {
    onDone()
    return
  }

  let called = false
  const finish = () => {
    if (called) return
    called = true
    overlay.remove()
    /* פעימת "קליטה" על מד הקריסטלים */
    const bar = document.querySelector('[data-crystal-bar]') as HTMLElement | null
    if (bar) {
      bar.classList.remove('crystal-pop')
      void bar.offsetWidth /* איפוס האנימציה */
      bar.classList.add('crystal-pop')
    }
    onDone()
  }

  const rect = panel.getBoundingClientRect()
  const barRect = (document.querySelector('[data-crystal-bar]') as HTMLElement | null)?.getBoundingClientRect()
  const target = barRect
    ? { x: barRect.left + barRect.width / 2, y: barRect.top + barRect.height / 2 }
    : { x: window.innerWidth / 2, y: window.innerHeight - 48 }

  const overlay = document.createElement('div')
  overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:80;'
  document.body.appendChild(overlay)

  /* הפאנל דוהה מהר — הרסיסים תופסים את מקומו */
  panel.animate(
    [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.95)' }],
    { duration: 240, easing: 'ease-out', fill: 'forwards' },
  )

  let finished = 0
  for (let i = 0; i < SHARD_COUNT; i++) {
    const size = 6 + Math.random() * 9
    const x0 = rect.left + Math.random() * rect.width
    const y0 = rect.top + Math.random() * rect.height
    const color = SHARD_COLORS[i % SHARD_COLORS.length]
    const shard = document.createElement('div')
    shard.style.cssText =
      `position:fixed;left:0;top:0;width:${size}px;height:${size}px;background:${color};` +
      `border-radius:2px;box-shadow:0 0 ${size}px ${color};opacity:0.95;will-change:transform,opacity;`
    overlay.appendChild(shard)

    /* נקודת ביניים מוגבהת ומוסטת — מסלול קשת עדין, לא קו ישר */
    const midX = (x0 + target.x) / 2 + (Math.random() - 0.5) * 130
    const midY = Math.min(y0, target.y) - 30 - Math.random() * 70
    const anim = shard.animate(
      [
        { transform: `translate(${x0}px,${y0}px) rotate(45deg) scale(1)`, opacity: 0.95 },
        { transform: `translate(${midX}px,${midY}px) rotate(160deg) scale(0.85)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${target.x}px,${target.y}px) rotate(310deg) scale(0.3)`, opacity: 0.15 },
      ],
      {
        duration: 620 + Math.random() * 240,
        delay: i * 16 + Math.random() * 110,
        easing: 'cubic-bezier(0.25,0.6,0.3,1)',
        fill: 'forwards',
      },
    )
    anim.onfinish = () => { if (++finished === SHARD_COUNT) finish() }
  }

  /* רשת ביטחון — גם אם onfinish לא ירה (לשונית ברקע וכו') ההמשך לא נתקע */
  window.setTimeout(finish, 1500)
}
