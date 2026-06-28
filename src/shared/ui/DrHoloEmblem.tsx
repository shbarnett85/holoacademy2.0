/* אמבלם ד"ר הולו — פנים הולוגרפיות זוהרות עם משקפיים עגולים (מחליף את אמוג'י הרובוט).
   צבע ציאן עם זוהר, line-art נקי. size = קוטר בפיקסלים. */
export default function DrHoloEmblem({ size = 48 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="var(--holo-cyan, #2ff3ff)"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ filter: 'drop-shadow(0 0 6px rgba(47,243,255,0.7))', display: 'block' }}
      aria-label="ד״ר הולו"
      role="img"
    >
      {/* קו השיער / מצח */}
      <path d="M16 21c2-7 9-11 16-11s14 4 16 11" />
      {/* אוזניים */}
      <path d="M14 30c-2 0-3 2-3 4s1 4 3 4" />
      <path d="M50 30c2 0 3 2 3 4s-1 4-3 4" />
      {/* קו הלסת / פנים */}
      <path d="M15 28c0 13 7 24 17 24s17-11 17-24" />
      {/* משקפיים עגולים */}
      <circle cx="24" cy="31" r="6.5" />
      <circle cx="40" cy="31" r="6.5" />
      <path d="M30.5 31h3" />
      {/* גשר המשקפיים אל הרקות */}
      <path d="M17.5 30l-2.5-1.5" />
      <path d="M46.5 30l2.5-1.5" />
      {/* אישונים */}
      <circle cx="24" cy="31" r="1.4" fill="var(--holo-cyan, #2ff3ff)" stroke="none" />
      <circle cx="40" cy="31" r="1.4" fill="var(--holo-cyan, #2ff3ff)" stroke="none" />
      {/* חיוך */}
      <path d="M26 43c2 2.5 10 2.5 12 0" />
      {/* זקן קצר */}
      <path d="M27 49c1.6 1.4 8.4 1.4 10 0" />
    </svg>
  )
}
