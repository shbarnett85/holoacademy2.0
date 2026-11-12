import { describe, expect, it } from 'vitest'
import { isExcluded, scanText, SCAN_EXCLUDE } from './colorScan'

/* אין ערך צבע קשיח מחוץ לקובץ הטוקנים, ואין שאריות של השפה הישנה (מעבר צבע, זוהר, טשטוש רקע, טוקנים ישנים).
   הסריקה סטטית, על כל קובצי המקור של הלקוח. חריגה מוצדקת: הערת `redesign-allow: <סיבה>` באותה שורה או בשורה שמעליה. */
const RAW = import.meta.glob(['/src/**/*.ts', '/src/**/*.tsx', '/src/**/*.css'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('הסורק עצמו', () => {
  it('תופס צבע קשיח, מעבר צבע, זוהר וטוקן ישן', () => {
    const bad = [
      "color: '#2ff3ff'", "background: 'rgba(4,9,18,.5)'", "const rgb = '47,243,255'", "background: 'linear-gradient(120deg, a, b)'",
      "boxShadow: '0 0 20px var(--color-ink)'", "textShadow: '0 1px 3px x'", "backdropFilter: 'blur(8px)'", "color: 'var(--holo-cyan)'",
      "border: '1px solid white'", "fill: 'var(--t15)'",
    ]
    for (const line of bad) expect(scanText(line).length, line).toBeGreaterThan(0)
  })
  it('לא מתריע על טוקנים, על צל קשיח ועל טבעת', () => {
    const ok = [
      "color: 'var(--color-ink)'", "boxShadow: 'var(--shadow-student)'", "boxShadow: '3px 3px 0 var(--color-ink)'", "boxShadow: 'inset 0 -4px 0 var(--color-ink)'",
      "background: 'color-mix(in srgb, var(--color-ink) 12%, transparent)'", "backdropFilter: 'none'", "const href = '#holo-gem'", "// color: '#fff' בהערה",
      "width: 100, height: 200, zIndex: 3",
    ]
    for (const line of ok) expect(scanText(line), line).toEqual([])
  })
})

describe('אין צבע קשיח ואין שאריות של העיצוב הישן בקוד הלקוח', () => {
  const files = Object.keys(RAW).filter((f) => !isExcluded(f))
  it('הסריקה מכסה את קובצי המקור (לא עוברת כי ה-glob ריק)', () => {
    expect(files.length).toBeGreaterThan(150)
    expect(RAW['/src/index.css'].length, 'index.css נקרא כטקסט').toBeGreaterThan(1000)
    expect(SCAN_EXCLUDE.length).toBeLessThan(10)
  })
  it.each(files.map((f) => [f] as const))('%s', (f) => {
    const v = scanText(RAW[f])
    expect(v.map((x) => `${x.line} [${x.rule}] ${x.text}`), `${v.length} שאריות ב-${f}`).toEqual([])
  })
})
