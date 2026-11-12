import { describe, expect, it } from 'vitest'
import { SUBJECTS, SUBJECT_VISUAL, UNCLASSIFIED_CODE, contrastRatio, subjectTagColors, subjectVisual } from './subjects'
import { subjectStyle } from './subjectStyle'
import { readHexTokens } from '../../styles/readTokens'

/* הצבעים עצמם נמצאים רק בקובץ הטוקנים; הבדיקות מחשבות ממנו */
const TOKENS = readHexTokens()
const hexOf = (cssVar: string): string => {
  const name = cssVar.replace(/^var\(/, '').replace(/\)$/, '')
  const v = TOKENS[name]
  if (!v) throw new Error(`טוקן חסר ב-tokens.css: ${name}`)
  return v
}

const ALL = [...SUBJECTS.map((s) => s.code), UNCLASSIFIED_CODE] as const

describe('שפה חזותית של מקצועות — פלטה אחת, מקובץ הטוקנים', () => {
  it('לכל אחד מ-15 המקצועות יש טוקן צבע וסמל; ויש אפור ל"לא סווג"', () => {
    expect(Object.keys(SUBJECT_VISUAL).sort()).toEqual([...ALL].sort())
    for (const code of ALL) {
      const v = SUBJECT_VISUAL[code]
      expect(v.token).toBe(`--subject-${code}`)
      expect(TOKENS[v.token], `${v.token} מוגדר ב-tokens.css`).toMatch(/^#[0-9a-f]{6}$/)
      expect(v.glyph.length).toBeGreaterThan(0)
    }
  })

  it('הסמלים ייחודיים — כששני מקצועות דומים בגוון, הסמל והשם מבדילים ביניהם', () => {
    const glyphs = ALL.map((c) => SUBJECT_VISUAL[c].glyph)
    expect(new Set(glyphs).size).toBe(glyphs.length)
  })

  it('"אחר" ו"לא סווג" אפורים באמת (רוויה נמוכה)', () => {
    for (const code of ['other', UNCLASSIFIED_CODE] as const) {
      const hex = TOKENS[SUBJECT_VISUAL[code].token]
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(32)
    }
  })

  it('אין צבע מקצוע זהה לאחר (חוץ מ"אחר" ו"לא סווג", שחולקים אפור אחד)', () => {
    const colors = ALL.filter((c) => c !== UNCLASSIFIED_CODE).map((c) => TOKENS[SUBJECT_VISUAL[c].token])
    expect(new Set(colors).size).toBe(colors.length)
    expect(TOKENS['--subject-unclassified']).toBe(TOKENS['--subject-other'])
  })

  it('אין צבע מקצוע בתכלת של הכפתורים או של דוקטור הולו', () => {
    for (const code of ALL) {
      const hex = TOKENS[SUBJECT_VISUAL[code].token]
      expect(hex).not.toBe(TOKENS['--color-action'])
      expect(hex).not.toBe(TOKENS['--color-holo'])
    }
  })
})

describe('subjectVisual / subjectStyle', () => {
  it('קוד מוכר → הטוקן והסמל שלו; null / לא מוכר → "לא סווג" אפור', () => {
    expect(subjectVisual('math')).toMatchObject({ code: 'math', color: 'var(--subject-math)', glyph: SUBJECT_VISUAL.math.glyph, label: 'מתמטיקה' })
    for (const bad of [null, undefined, '', 'physics']) {
      expect(subjectVisual(bad)).toMatchObject({ code: UNCLASSIFIED_CODE, color: 'var(--subject-unclassified)', label: 'לא סווג' })
    }
  })
  it('הפרמטר mode נשאר לתאימות ואינו משנה את הצבע (פלטה אחת)', () => {
    expect(subjectVisual('math', 'dark').color).toBe(subjectVisual('math', 'light').color)
  })
  it('subjectStyle מחזיר אותו צבע וסמל מאותו מקור', () => {
    const s = subjectStyle('science')
    expect(s.color).toBe('var(--subject-science)')
    expect(s.icon).toBe(SUBJECT_VISUAL.science.glyph)
    expect(s.label).toBe('מדעים')
  })
})

describe('תגית מקצוע — שם המקצוע על הצבע', () => {
  it('הטקסט על התגית עומד ב-AA (4.5:1 לפחות) לכל 16 הצבעים', () => {
    for (const code of ALL) {
      const t = subjectTagColors(code)
      expect(t.bg, code).toBe(`var(--subject-${code})`)
      expect(contrastRatio(hexOf(t.bg), hexOf(t.fg)), `${code}: ${t.fg} על ${t.bg}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('התווית היא שם המקצוע; "לא סווג" אפור עם המילים "לא סווג"', () => {
    expect(subjectTagColors('history').label).toBe('היסטוריה')
    expect(subjectTagColors('pe').label).toBe('חינוך גופני')
    expect(subjectTagColors(null).label).toBe('לא סווג')
    expect(subjectTagColors('nope').code).toBe(UNCLASSIFIED_CODE)
    expect(subjectTagColors(null).bg).toBe('var(--subject-unclassified)')
  })

  it('כל שמות המקצועות נכנסים בתגית בלי להתחלק (נקראים בשורה אחת)', () => {
    for (const s of SUBJECTS) expect(s.nameHe.length).toBeLessThanOrEqual(12)
  })
})
