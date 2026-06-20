/* יהלום הולוגרפי (brilliant cut) — ריק / מתמלא ברסיסים / שלם וזוהר.
   פלטת "היהלומים החדשים": גוף תכלת #d6f7ff→#5fdcff→#1fb4f0 + פאות לבנות זוהרות. */

interface Props {
  fill: number /* 0..1 */
  size?: number
  justCompleted?: boolean /* פעימה קצרה ברגע ההשלמה */
}

export default function CrystalGauge({ fill, size = 26, justCompleted = false }: Props) {
  const full = fill >= 0.999
  const clipId = `gem-clip-${Math.round(fill * 1000)}-${size}`
  /* מתאר היהלום (brilliant cut) ב-viewBox 24×26: שולחן עליון, כתר, חגורה, פביליון לקודקוד */
  const OUTLINE = '6,2 18,2 22,9 12,25 2,9'

  return (
    <svg
      width={size}
      height={size * 1.18}
      viewBox="0 0 24 26"
      className={justCompleted ? 'crystal-pop' : ''}
      style={{
        filter: full
          ? 'drop-shadow(0 0 7px rgba(95,220,255,0.95))'
          : fill > 0
            ? `drop-shadow(0 0 ${2 + fill * 4}px rgba(95,220,255,${0.3 + fill * 0.5}))`
            : 'none',
      }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y={26 - 26 * fill} width="24" height={26 * fill} />
        </clipPath>
        <linearGradient id="gem-grad" x1="0" y1="0" x2="0.25" y2="1">
          <stop offset="0%" stopColor="#d6f7ff" />
          <stop offset="45%" stopColor="#5fdcff" />
          <stop offset="100%" stopColor="#1fb4f0" />
        </linearGradient>
      </defs>

      {/* מתאר — עמום כשריק */}
      <polygon points={OUTLINE} fill="rgba(95,220,255,0.05)" stroke={full ? '#bff0ff' : 'rgba(95,220,255,0.35)'} strokeWidth="1.3" strokeLinejoin="round" />

      {/* מילוי הרסיסים מלמטה למעלה */}
      {fill > 0 && (
        <g clipPath={`url(#${clipId})`}>
          <polygon points={OUTLINE} fill="url(#gem-grad)" opacity={0.55 + fill * 0.45} />
        </g>
      )}

      {/* פאות פנימיות — לבנות-זוהרות כשמלא, עמומות כשריק */}
      <path
        d="M2 9 L22 9 M6 2 L12 9 L18 2 M2 9 L12 25 M22 9 L12 25 M12 9 L12 25"
        stroke={full ? 'rgba(238,253,255,0.9)' : 'rgba(95,220,255,0.28)'}
        strokeWidth="0.7"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}
