/* ──────────────────────────────────────────────────────────────────────────
   קבועים ותצורה של ביקורת ה-UX. ספים = העקרונות ב-CLAUDE.md ("עקרונות ממשק למסכי מורה").
   ────────────────────────────────────────────────────────────────────────── */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const E2E_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const REPO_ROOT = path.resolve(E2E_DIR, '..')
export const SERVER_DIR = path.join(REPO_ROOT, 'server')
export const DEFAULT_OUT = path.join(E2E_DIR, 'out')

export const DEFAULT_BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
export const DEFAULT_API = process.env.E2E_API_URL ?? 'http://localhost:3001'

export const DEFAULT_VIEWPORTS = ['1366x768', '1920x1080'] as const

/* ספי הביקורת (עקרונות 4, 7): */
export const THRESHOLDS = {
  /* אזור לחיצה מינימלי, פיקסלי CSS */
  minTarget: 44,
  /* גופן מתחת לזה = דגל; מתחת ל-16 = נספר כטקסט גוף קטן */
  fontFlag: 14,
  fontBody: 16,
  /* "נכנס במסך אחד": סבילות של 2px */
  fitTolerance: 2,
  /* מקסימום לחיצות מהטאב הראשי (עיקרון 4) */
  maxClicks: 2,
} as const

/* axe: התגיות שנבדקות. כישלון = impact serious/critical */
export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] as const

/* מילים אסורות בטקסט הגלוי (עיקרון 5). הסתר מאחורי [data-how-we-calc] מותר. */
export const HOW_WE_CALC_ATTR = 'data-how-we-calc'

const CHROME_CANDIDATES = [
  process.env.E2E_CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe') : undefined,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

/* Chrome מותקן — לא מורידים דפדפנים. E2E_CHROME דורס. */
export function findChrome(): string {
  for (const c of CHROME_CANDIDATES) if (c && existsSync(c)) return c
  throw new Error('לא נמצא Chrome מותקן. הגדירו E2E_CHROME=<נתיב ל-chrome.exe> (התשתית לא מורידה דפדפנים).')
}

export function parseViewport(v: string): { width: number; height: number } {
  const m = /^(\d{3,5})x(\d{3,5})$/i.exec(v.trim())
  if (!m) throw new Error(`viewport לא תקין: "${v}" (פורמט: 1366x768)`)
  return { width: Number(m[1]), height: Number(m[2]) }
}
