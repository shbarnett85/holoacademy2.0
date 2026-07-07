/* קריסטל HoloAcademy (צורת המעוין+H של הלוגו) — ריק (אפור) / מתמלא ברסיסים / שלם וזוהר.
   הצורה הריקה: מהקובץ holoacademy-crystal-empty (אפור #2e3647). המילוי חושף מלמטה-למעלה
   את גרסת הצבע (ציאן/מגנטה + פאות לבנות) — זהה ללוגו. */

import { useId } from 'react'

interface Props {
  fill: number /* 0..1 */
  size?: number
  justCompleted?: boolean /* פעימה קצרה ברגע ההשלמה */
}

const EMPTY = '#2e3647'

export default function CrystalGauge({ fill, size = 26, justCompleted = false }: Props) {
  const full = fill >= 0.999
  /* מזהים יציבים פר-מופע (useId) — לא נגזרים מ-fill, כדי שמעבר ה-CSS על מלבן
     המילוי לא יתאפס בכל שינוי ערך (זה מה שמאפשר אנימציית מילוי חלקה) */
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const diaId = `dia-${uid}`
  const fillId = `fill-${uid}`
  const cyId = `cy-${uid}`
  const mgId = `mg-${uid}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 340 340"
      className={justCompleted ? 'crystal-pop' : ''}
      style={{
        filter: full
          ? 'drop-shadow(0 0 7px rgba(47,243,255,0.9))'
          : fill > 0
            ? `drop-shadow(0 0 ${2 + fill * 4}px rgba(47,243,255,${0.25 + fill * 0.5}))`
            : 'none',
      }}
    >
      <defs>
        <clipPath id={diaId}><polygon points="170,0 340,170 170,340 0,170" /></clipPath>
        {/* מילוי מלמטה-למעלה לפי fill — מעבר CSS על y/height = אנימציית המילוי עצמה
           (חסין ללשוניות רקע, בניגוד ל-RAF) */}
        <clipPath id={fillId}>
          <rect x="0" y={340 - 340 * fill} width="340" height={340 * fill} style={{ transition: 'y 0.55s cubic-bezier(0.3,0.7,0.3,1), height 0.55s cubic-bezier(0.3,0.7,0.3,1)' }} />
        </clipPath>
        <linearGradient id={cyId} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2ff3ff" /><stop offset="1" stopColor="#1fd8e6" /></linearGradient>
        <linearGradient id={mgId} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f241da" /><stop offset="1" stopColor="#d92fc0" /></linearGradient>
      </defs>

      {/* ── בסיס ריק (אפור) ── */}
      <g transform="translate(170,170)">
        <rect x="-85" y="-91" width="170" height="12" fill={EMPTY} />
        <rect x="-85" y="79" width="170" height="12" fill={EMPTY} />
      </g>
      <g clipPath={`url(#${diaId})`}>
        <rect x="85" y="0" width="34" height="340" fill={EMPTY} />
        <rect x="221" y="0" width="34" height="340" fill={EMPTY} />
      </g>
      <g transform="translate(170,170)">
        <rect x="-85" y="-16" width="170" height="32" fill={EMPTY} />
        <g stroke={EMPTY} strokeWidth="14" strokeLinecap="round" fill="none">
          <line x1="-170" y1="0" x2="0" y2="-170" /><line x1="0" y1="-170" x2="170" y2="0" />
          <line x1="170" y1="0" x2="0" y2="170" /><line x1="0" y1="170" x2="-170" y2="0" />
        </g>
        <rect x="-170" y="-6" width="85" height="12" rx="6" fill={EMPTY} />
        <rect x="85" y="-6" width="85" height="12" rx="6" fill={EMPTY} />
      </g>

      {/* ── מילוי צבעוני (נחשף מלמטה-למעלה) ──
         מרונדר תמיד (גם ב-fill=0, אז ה-clip מסתיר) — כדי שמעבר ה-CSS ירוץ מ-ריק */}
      {(
        <g clipPath={`url(#${fillId})`}>
          {/* מילוי ציאן מלא (מסגרת המעוין + פסים + נאבים) */}
          <g transform="translate(170,170)">
            <rect x="-85" y="-91" width="170" height="12" fill="#2ff3ff" />
            <rect x="-85" y="79" width="170" height="12" fill="#2ff3ff" />
          </g>
          {/* פסי ה-H — ציאן (הכול ציאן) */}
          <g clipPath={`url(#${diaId})`}>
            <rect x="85" y="0" width="34" height="340" fill="#2ff3ff" />
            <rect x="221" y="0" width="34" height="340" fill="#2ff3ff" />
          </g>
          <g transform="translate(170,170)">
            <rect x="-85" y="-16" width="170" height="32" fill="#2ff3ff" />
            <line x1="-170" y1="0" x2="0" y2="-170" stroke={`url(#${cyId})`} strokeWidth="12" strokeLinecap="round" />
            <line x1="0" y1="-170" x2="170" y2="0" stroke={`url(#${cyId})`} strokeWidth="12" strokeLinecap="round" />
            <line x1="170" y1="0" x2="0" y2="170" stroke={`url(#${cyId})`} strokeWidth="12" strokeLinecap="round" />
            <line x1="0" y1="170" x2="-170" y2="0" stroke={`url(#${cyId})`} strokeWidth="12" strokeLinecap="round" />
            <rect x="-170" y="-6" width="85" height="12" rx="6" fill="#2ff3ff" />
            <rect x="85" y="-6" width="85" height="12" rx="6" fill="#2ff3ff" />
          </g>
        </g>
      )}
    </svg>
  )
}
