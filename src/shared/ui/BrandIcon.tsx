/* ── סט אייקוני המותג — SVG מקומי אחיד: קו 1.6, קצוות מעוגלים (כמו אייקוני
   מצב מורה/תלמיד), גיאומטריה חדה בשפת הגביש. currentColor — הצבע נקבע
   בהקשר (ציאן #2ff3ff / מג׳נטה #f241da). אפס אמוג׳י, אפס CDN. ── */

export const BRAND_PATHS = {
  /* מצפן-יהלום — "איך זה עובד" */
  compass: <><path d="M12 2L22 12L12 22L2 12Z" /><path d="M15.5 8.5L13.2 13.2L8.5 15.5L10.8 10.8Z" /></>,
  /* גביש-נגינה — "התנסו עכשיו" */
  playGem: <><path d="M12 2L20.5 7V17L12 22L3.5 17V7Z" /><path d="M10 9L15.5 12L10 15Z" /></>,
  /* מסמך */
  doc: <><path d="M6 3H14.5L19 7.5V21H6Z" /><path d="M14.5 3V7.5H19" /><path d="M9 12.5H16" /><path d="M9 16.5H13.5" /></>,
  /* הגביש (הד ללוגו) */
  crystal: <><path d="M12 3L19 8.2L16.4 20H7.6L5 8.2Z" /><path d="M5 8.2H19" /><path d="M9.8 8.2L12 20" /><path d="M14.2 8.2L12 20" /></>,
  /* תרשים עמודות */
  chart: <><path d="M4 20H20" /><path d="M7.5 20V12" /><path d="M12 20V5.5" /><path d="M16.5 20V14.5" /></>,
  /* מסמך עם חותם-יהלום */
  brief: <><path d="M6 3H14.5L19 7.5V21H6Z" /><path d="M14.5 3V7.5H19" /><path d="M12.5 10.5L15 13L12.5 15.5L10 13Z" /></>,
  /* וי חד */
  check: <path d="M5 12.5L10 17.5L19 7" />,
  /* משולש נגינה */
  play: <path d="M8.5 5.5L18 12L8.5 18.5Z" />,
  chevUp: <path d="M6 14.5L12 8.5L18 14.5" />,
  chevDown: <path d="M6 9.5L12 15.5L18 9.5" />,
  /* ניצוץ ארבע-פאות — פעולות AI ("שפר", "חלץ") */
  spark: <><path d="M12 3L14 10L21 12L14 14L12 21L10 14L3 12L10 10Z" /><path d="M18.5 3.5L19.2 5.8L21.5 6.5L19.2 7.2L18.5 9.5L17.8 7.2L15.5 6.5L17.8 5.8Z" /></>,
  /* מטרת-יהלום — יעדי למידה */
  target: <><path d="M12 2.5L21.5 12L12 21.5L2.5 12Z" /><path d="M12 7.5L16.5 12L12 16.5L7.5 12Z" /><path d="M12 11.3L12.7 12L12 12.7L11.3 12Z" /></>,
  /* מפתח-יהלום */
  key: <><path d="M17 3.5L20.5 7L17 10.5L13.5 7Z" /><path d="M15 9L5.5 18.5" /><path d="M8 16L10 18" /><path d="M5.5 18.5L7.5 20.5" /></>,
  /* דגל שיא */
  flag: <><path d="M6 21V3.5" /><path d="M6 4H17L14.5 7.5L17 11H6" /></>,
  /* אזהרה — יהלום עם סימן */
  alert: <><path d="M12 2.5L21.5 12L12 21.5L2.5 12Z" /><path d="M12 8V13" /><path d="M12 15.8L12.02 15.82" /></>,
  /* רענון */
  refresh: <><path d="M20 5V9.5H15.5" /><path d="M20 9.5A8 8 0 1 0 21 14" /></>,
  /* רמקול */
  speaker: <><path d="M4 9.5H8L13 5V19L8 14.5H4Z" /><path d="M16 9L18.5 12L16 15" /><path d="M18.5 6.5L21 12L18.5 17.5" /></>,
  speakerOff: <><path d="M4 9.5H8L13 5V19L8 14.5H4Z" /><path d="M16.5 9.5L21 14.5" /><path d="M21 9.5L16.5 14.5" /></>,
  /* שמש / ירח — מתג התאורה (גרסאות גיאומטריות חדות) */
  sun: <><path d="M12 8L16 12L12 16L8 12Z" /><path d="M12 2.5V5M12 19V21.5M2.5 12H5M19 12H21.5M5.3 5.3L7 7M17 17L18.7 18.7M5.3 18.7L7 17M17 7L18.7 5.3" /></>,
  moon: <path d="M20 13.5A8 8 0 0 1 10.5 4A8 8 0 1 0 20 13.5Z" />,
}

export type BrandIconName = keyof typeof BRAND_PATHS

export default function BrandIcon({ name, size = 18, style }: { name: BrandIconName; size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ display: 'inline-block', verticalAlign: '-0.18em', flexShrink: 0, ...style }}>
      {BRAND_PATHS[name]}
    </svg>
  )
}
