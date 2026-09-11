/* ── שקע קריסטל (הלוגו החדש) — תושבת עתידנית שהקריסטל נבנה בתוכה בהדרגה ──
   הגאומטריה זהה ללוגו (CrystalMark — מקור האמת), שלושה מצבים:
   1. שקע ריק — מתאר+פאות עמומים וחריצי-חיבור: "ממתין", לא "נכשלת".
   2. מילוי חלקי — מילוי אנרגיה מלמטה-למעלה **בקוונטים של 1/N** (N = מספר
      האתגרים שהוקצו לקריסטל, מהנתונים). שנתות (notches) בצד השקע מסמנות את
      המדרגות, וקצה המילוי נושק תמיד לשנת — כך 1/4 ו-2/4 נבדלים בצורה
      (גובה+שנת) ולא רק בבהירות, וזה קריא גם ב-26px.
      נבחר מילוי-מקוונטז ולא פיצול-לפאות: ללוגו מבנה 6 פאות קבוע, וחיתוכו
      ל-2/3/4/5 פאות שוות היה מחייב גאומטריה ידנית פר-מכנה ושובר את נאמנות
      המותג — המשימה מתירה במפורש את החלופה הזו.
   3. קריסטל שלם — כל הפאות דולקות וההילה (מסגרת הניאון של הלוגו) "מתעוררת".
   שתי אנימציות: תוספת-חלקית קצרה (מעבר clip ~0.35ש׳ + פולס קל) והשלמה
   מתגמלת (~0.7ש׳ — הצמדה-נעילה + התפשטות זוהר; ה-flash/צליל ב-BottomHUD).
   כישלון חינני: מצב המילוי הוא רינדור ישיר של props — בלי אנימציה (דפדפן
   ישן / prefers-reduced-motion) המצב הנוכחי מוצג נכון; האנימציה רק מקשטת.
   כישלון באתגר: המילוי לא יורד (earnedWeight רק עולה) — ירידה קיימת רק
   ב-restart מלא, ואז הסנכרון מיידי בלי אנימציה (BottomHUD). */

import { useId } from 'react'
import { CrystalDefs, CrystalBody, CRYSTAL_VB, CRYSTAL_FACETS, CRYSTAL_OUTLINE, CRYSTAL_COLORS } from '../../shared/ui/CrystalMark'

interface Props {
  fill: number /* 0..1 — ההתקדמות הרציפה של הקריסטל הזה (מהמנוע) */
  steps?: number /* N — מספר האתגרים שהוקצו לקריסטל (המכנה); ברירת מחדל 1 */
  index?: number /* אינדקס הקריסטל (0-based) — לתווית הנגישות */
  size?: number
  justCompleted?: boolean /* אנימציית ההשלמה המתגמלת */
}

const pts = (...p: [number, number][]) => p.map(([x, y]) => `${x},${y}`).join(' ')
/* טווח ה-y של הקריסטל במרחב המאסטר (לחישובי מילוי ושנתות) */
const TOP_Y = 247
const BOT_Y = 733
const SPAN = BOT_Y - TOP_Y

/* prefers-reduced-motion — נדגם פעם אחת (מדיה-קווארי לא משתנה תוך כדי משחק) */
const reduceMotion =
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* רוחב הקריסטל בגובה y (לצורך מיקום השנתות על המתאר המשופע) */
function edgeXAt(y: number): { left: number; right: number } {
  /* צלעות: כתף (326,399)→תחתית (502,733) בשמאל; קודקוד (627,247)→כתף (326,399) למעלה */
  if (y <= 399) {
    const t = (y - 247) / (399 - 247)
    return { left: 627 - t * (627 - 326), right: 627 + t * (928 - 627) }
  }
  const t = (y - 399) / (733 - 399)
  return { left: 326 + t * (502 - 326), right: 928 - t * (928 - 752) }
}

export default function CrystalGauge({ fill, steps = 1, index, size = 26, justCompleted = false }: Props) {
  const N = Math.max(1, Math.min(5, Math.round(steps)))
  const full = fill >= 0.999
  /* קוונטיזציה למדרגות 1/N: כמה מדרגות הושלמו (floor — מדרגה נדלקת רק כשנצברה) */
  const stepsDone = full ? N : Math.min(N - 1, Math.floor(fill * N + 1e-6))
  const q = stepsDone / N /* גובה המילוי המקוונטז */
  const fillTopY = BOT_Y - SPAN * q

  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const clipId = `cfill-${uid}`

  const label = `קריסטל ${index != null ? index + 1 : ''}: ${full ? 'הושלם' : `${stepsDone} מתוך ${N}`}`.replace('  ', ' ')

  return (
    <svg
      width={size}
      height={size}
      viewBox={`${CRYSTAL_VB.x} ${CRYSTAL_VB.y} ${CRYSTAL_VB.w} ${CRYSTAL_VB.h}`}
      role="img"
      aria-label={label}
      className={justCompleted && !reduceMotion ? 'crystal-lock' : ''}
      style={{
        overflow: 'visible',
        filter: full
          ? 'drop-shadow(0 0 6px rgba(0,245,255,0.85)) drop-shadow(0 0 10px rgba(255,0,231,0.4))'
          : stepsDone > 0
            ? `drop-shadow(0 0 ${2 + q * 4}px rgba(0,245,255,${0.25 + q * 0.45}))`
            : 'none',
      }}
    >
      {/* שתי האנימציות — transform/opacity בלבד (זול ל-GPU):
         crystal-lock = ההשלמה המתגמלת (~0.7ש׳): "הצמדה" פנימה ואז נעילה עם overshoot;
         crystal-halo-wake = ההילה מתפשטת מנקודת החיבור התחתונה של השקע. */}
      <style>{`
        @keyframes crystal-lock-kf {
          0%   { transform: scale(1); }
          25%  { transform: scale(0.92); }
          60%  { transform: scale(1.22); }
          100% { transform: scale(1); }
        }
        .crystal-lock { animation: crystal-lock-kf 0.7s cubic-bezier(0.3, 1.4, 0.5, 1); }
        @keyframes crystal-halo-wake-kf {
          0%   { opacity: 0; transform: scale(0.9); }
          40%  { opacity: 1; }
          100% { opacity: 1; transform: scale(1); }
        }
        .crystal-halo-wake { animation: crystal-halo-wake-kf 0.7s ease-out both; transform-origin: 627px 733px; transform-box: view-box; }
      `}</style>
      <CrystalDefs uid={uid} />
      <defs>
        {/* מילוי מלמטה-למעלה — מעבר CSS על y/height הוא אנימציית התוספת-החלקית
           עצמה (חסין ללשוניות רקע); ב-reduced-motion אין מעבר — קפיצה למצב הנכון */}
        <clipPath id={clipId}>
          <rect
            x={CRYSTAL_VB.x}
            y={fillTopY}
            width={CRYSTAL_VB.w}
            /* ה-bleed (+20) מכסה את עובי קו-המתאר התחתון — רק כשיש מילוי בפועל */
            height={stepsDone > 0 ? BOT_Y - fillTopY + 20 : 0}
            style={reduceMotion ? undefined : { transition: 'y 0.35s cubic-bezier(0.3,0.7,0.3,1), height 0.35s cubic-bezier(0.3,0.7,0.3,1)' }}
          />
        </clipPath>
      </defs>

      {/* ── השקע הריק (התושבת): פאות כבויות + מתאר עמום + חריצי חיבור ── */}
      <g>
        {Object.values(CRYSTAL_FACETS).map((f, i) => (
          <polygon key={i} points={pts(...(f as [number, number][]))} fill="#141a29" />
        ))}
        <polygon points={pts(...CRYSTAL_OUTLINE)} fill="none" stroke={CRYSTAL_COLORS.empty} strokeWidth={26} strokeLinejoin="round" />
        {/* חריצי החיבור הפנימיים — רמז לצורת הקריסטל שממתין */}
        <g fill="none" stroke={CRYSTAL_COLORS.empty} strokeWidth={16} opacity={0.55} strokeLinejoin="miter">
          <polyline points="627,247 480,416 502,733" />
          <polyline points="627,247 774,416 752,733" />
          <polyline points="326,399 480,416 774,416 928,399" />
        </g>
      </g>

      {/* ── הקריסטל הצבעוני — נחשף מלמטה-למעלה עד גובה המדרגה ── */}
      <g clipPath={`url(#${clipId})`}>
        <CrystalBody uid={uid} railWidth={22} />
      </g>

      {/* קצה המילוי — קו אנרגיה בגובה המדרגה הנוכחית (רק במצב חלקי) */}
      {stepsDone > 0 && !full && (() => {
        const { left, right } = edgeXAt(fillTopY)
        return (
          <line x1={left + 8} y1={fillTopY} x2={right - 8} y2={fillTopY} stroke="#7ef6ff" strokeWidth={10} opacity={0.9} />
        )
      })()}

      {/* ── שנתות המדרגות על צדי השקע — המכנה קריא בצורה, לא רק בזוהר ──
         שנת שהמילוי עבר אותה נדלקת; העתידיות נשארות עמומות */}
      {N > 1 &&
        Array.from({ length: N - 1 }).map((_, k) => {
          const yy = BOT_Y - (SPAN * (k + 1)) / N
          const { left, right } = edgeXAt(yy)
          const lit = stepsDone >= k + 1
          return (
            <g key={k} stroke={lit ? '#7ef6ff' : '#3a4458'} strokeWidth={14} strokeLinecap="round">
              <line x1={left - 26} y1={yy} x2={left + 4} y2={yy} />
              <line x1={right - 4} y1={yy} x2={right + 26} y2={yy} />
            </g>
          )
        })}

      {/* ── התעוררות השקע בהשלמה: ההילה נדלקת סביב נקודות החיבור ── */}
      {full && (
        <polygon
          points={pts(...CRYSTAL_OUTLINE)}
          fill="none"
          stroke={`url(#hl-${uid})`}
          strokeWidth={30}
          strokeLinejoin="round"
          className={justCompleted && !reduceMotion ? 'crystal-halo-wake' : ''}
        />
      )}
    </svg>
  )
}
