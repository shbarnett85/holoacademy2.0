import type { ReactNode } from 'react'

/* ערכת אייקוני קו אחידה (Claude Design — "HoloAcademy Icons") שמחליפה את האימוג׳ים:
   סוגי הדמיה (סיור/הרפתקה), ד״ר הולו, וששת הסגנונות האמנותיים.
   קו 1.6px, פינות מעוגלות, יורש currentColor (הצבע/הזוהר נקבעים ע"י ההורה). */

export type HoloIconName =
  | 'tour' | 'adventure' | 'drholo'
  | 'comic' | 'realistic' | 'digital-painting' | 'pixar-3d' | 'anime' | 'storybook'

const PATHS: Record<HoloIconName, ReactNode> = {
  /* סיור — טלסקופ (מחליף 🔭) */
  tour: (
    <>
      <path d="m10.065 12.493-6.18 1.318a.934.934 0 0 1-1.108-.702l-.537-2.15a1.07 1.07 0 0 1 .691-1.265l13.504-4.44" />
      <path d="m13.56 11.747 4.332-.924" />
      <path d="m16 21-3.105-6.21" />
      <path d="M16.485 5.94a2 2 0 0 1 1.455-2.425l1.09-.272a1 1 0 0 1 1.212.727l1.515 6.06a1 1 0 0 1-.727 1.213l-1.09.272a2 2 0 0 1-2.425-1.455z" />
      <path d="m6.158 8.633 1.114 4.456" />
      <path d="m8 21 3.105-6.21" />
      <circle cx="12" cy="13" r="2" />
    </>
  ),
  /* הרפתקה — חרבות שלובות (מחליף ⚔️) */
  adventure: (
    <>
      <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
      <line x1="13" x2="19" y1="19" y2="13" />
      <line x1="16" x2="20" y1="16" y2="20" />
      <line x1="19" x2="21" y1="21" y2="19" />
      <polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5" />
      <line x1="5" x2="9" y1="14" y2="18" />
      <line x1="7" x2="4" y1="17" y2="20" />
      <line x1="3" x2="5" y1="19" y2="21" />
    </>
  ),
  /* ד״ר הולו — דמות מנחה הולוגרפית */
  drholo: (
    <>
      <path d="M5 10a7 7 0 0 1 14 0" />
      <circle cx="8.7" cy="11" r="2.3" />
      <circle cx="15.3" cy="11" r="2.3" />
      <path d="M11 11h2" />
      <path d="M5.4 10.6 6.4 11" />
      <path d="M18.6 10.6 17.6 11" />
      <path d="M6.2 13c0 5 2.6 8 5.8 8s5.8-3 5.8-8" />
      <path d="M9.6 15.5c1.6 1.1 3.2 1.1 4.8 0" />
    </>
  ),
  /* קומיקס — נצנוץ פעולה (מחליף 💥) */
  comic: <path d="M22,12 L15.33,13.38 L19.07,19.07 L13.38,15.33 L12,22 L10.62,15.33 L4.93,19.07 L8.67,13.38 L2,12 L8.67,10.62 L4.93,4.93 L10.62,8.67 L12,2 L13.38,8.67 L19.07,4.93 L15.33,10.62 Z" />,
  /* ריאליסטי — מצלמה (מחליף 📷) */
  realistic: (
    <>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
      <circle cx="12" cy="13" r="3" />
    </>
  ),
  /* ציור דיגיטלי — פלטת צבעים (מחליף 🎨) */
  'digital-painting': (
    <>
      <path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" />
      <circle cx="13.5" cy="6.5" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="10.5" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="6.5" cy="12.5" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="7.5" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  /* תלת-ממד מצויר — קובייה (מחליף 🧸) */
  'pixar-3d': (
    <>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </>
  ),
  /* אנימה / מנגה — עין נוצצת (מחליף 🌸) */
  anime: (
    <>
      <path d="M2.5 12.5a1 1 0 0 1 0-0.9 10 9 0 0 1 17.5-1.2" />
      <path d="M21.5 11.5a1 1 0 0 1 0 0.9 10.5 10.5 0 0 1-18.2 2.4" />
      <circle cx="12" cy="12" r="3.4" />
      <circle cx="13.1" cy="10.9" r="0.9" fill="currentColor" stroke="none" />
      <path d="M19 4.4l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z" fill="currentColor" stroke="none" />
    </>
  ),
  /* ספר ילדים — ספר פתוח (מחליף 📖) */
  storybook: (
    <>
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
    </>
  ),
}

export default function HoloIcon({ name, size = 24, strokeWidth = 1.6, style }: { name: HoloIconName; size?: number; strokeWidth?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden>
      {PATHS[name]}
    </svg>
  )
}
