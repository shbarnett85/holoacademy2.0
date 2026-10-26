import { describe, expect, it } from 'vitest'
import { MIN_FRAME_CONTRAST, SUBJECTS, SUBJECT_SURFACES, SUBJECT_VISUAL, UNCLASSIFIED_CODE, subjectVisual } from './subjects'
import { subjectStyle } from './subjectStyle'

/* WCAG 2.x — יחס ניגודיות בין שני צבעי hex */
const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
const lum = ([r, g, b]: [number, number, number]): number => {
  const c = [r, g, b].map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
export const contrast = (a: string, b: string): number => {
  const x = lum(rgb(a)), y = lum(rgb(b))
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/* מרחק צבע פשוט (RGB אוקלידי) — רק כדי לדווח אילו זוגות קרובים ונשענים על הסמל */
const dist = (a: string, b: string): number => { const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b); return Math.hypot(r1 - r2, g1 - g2, b1 - b2) }

const ALL = [...SUBJECTS.map((s) => s.code), UNCLASSIFIED_CODE] as const

describe('שפה חזותית של מקצועות — פלטה אחת', () => {
  it('לכל אחד מ-15 המקצועות יש צבע בהיר, צבע כהה וסמל; ויש אפור ל"לא סווג"', () => {
    expect(Object.keys(SUBJECT_VISUAL).sort()).toEqual([...ALL].sort())
    for (const code of ALL) {
      const v = SUBJECT_VISUAL[code]
      expect(v.light).toMatch(/^#[0-9a-f]{6}$/)
      expect(v.dark).toMatch(/^#[0-9a-f]{6}$/)
      expect(v.glyph.length).toBeGreaterThan(0)
    }
  })

  it('הסמלים ייחודיים — כששני מקצועות דומים בגוון, הסמל מבדיל ביניהם', () => {
    const glyphs = ALL.map((c) => SUBJECT_VISUAL[c].glyph)
    expect(new Set(glyphs).size).toBe(glyphs.length)
  })

  it('"לא סווג" אפור באמת (רוויה נמוכה), בשני הווריאנטים', () => {
    for (const mode of ['light', 'dark'] as const) {
      const [r, g, b] = rgb(SUBJECT_VISUAL[UNCLASSIFIED_CODE][mode])
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(32)
    }
  })

  it.each(ALL.map((c) => [c] as const))('%s: מסגרת ≥3:1 מול כל הרקעים — בהיר (מורה) וכהה (תלמיד)', (code) => {
    const v = SUBJECT_VISUAL[code]
    for (const bg of SUBJECT_SURFACES.light) expect(contrast(v.light, bg), `${code} light on ${bg}`).toBeGreaterThanOrEqual(MIN_FRAME_CONTRAST)
    for (const bg of SUBJECT_SURFACES.dark) expect(contrast(v.dark, bg), `${code} dark on ${bg}`).toBeGreaterThanOrEqual(MIN_FRAME_CONTRAST)
  })

  it('אף צבע לא זהה לצבע אחר באותו מצב (גם הקרובים — מובחנים לפחות במעט — והסמל משלים)', () => {
    for (const mode of ['light', 'dark'] as const) {
      const colors = ALL.map((c) => SUBJECT_VISUAL[c][mode])
      expect(new Set(colors).size).toBe(colors.length)
      for (let i = 0; i < colors.length; i++) for (let j = i + 1; j < colors.length; j++) {
        expect(dist(colors[i], colors[j]), `${ALL[i]} / ${ALL[j]} (${mode})`).toBeGreaterThan(20)
      }
    }
  })
})

describe('subjectVisual / subjectStyle', () => {
  it('קוד מוכר → הצבע והסמל שלו; null / לא מוכר → "לא סווג" אפור', () => {
    expect(subjectVisual('math', 'light')).toMatchObject({ code: 'math', color: SUBJECT_VISUAL.math.light, glyph: SUBJECT_VISUAL.math.glyph, label: 'מתמטיקה' })
    expect(subjectVisual('math', 'dark').color).toBe(SUBJECT_VISUAL.math.dark)
    for (const bad of [null, undefined, '', 'physics']) {
      expect(subjectVisual(bad, 'light')).toMatchObject({ code: UNCLASSIFIED_CODE, color: SUBJECT_VISUAL[UNCLASSIFIED_CODE].light, label: 'לא סווג' })
    }
  })
  it('subjectStyle (תלמיד: mode מפורש) מחזיר אותו צבע וסמל מאותו מקור', () => {
    const s = subjectStyle('science', 'dark')
    expect(s.color).toBe(SUBJECT_VISUAL.science.dark)
    expect(s.icon).toBe(SUBJECT_VISUAL.science.glyph)
    expect(s.label).toBe('מדעים')
  })
})
