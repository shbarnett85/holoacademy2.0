import { describe, expect, it } from 'vitest'
import { paginate, splitUnits } from './scenePages'

/* "מדידה" מדומה: נכנס אם אורך המחרוזת ≤ cap תווים */
const cap = (n: number) => (s: string) => s.length <= n

describe('splitUnits', () => {
  it('מפצל למשפטים ושומר מפרידי פסקה', () => {
    const u = splitUnits('שלום עולם. מה שלומך? טוב מאוד!\n\nד״ר הולו אומר: "תבואו." ועוד משפט.')
    expect(u.map((x) => x.text)).toEqual(['שלום עולם.', 'מה שלומך?', 'טוב מאוד!', 'ד״ר הולו אומר: "תבואו."', 'ועוד משפט.'])
    expect(u[0].sep).toBe('')
    expect(u[1].sep).toBe(' ')
    expect(u[3].sep).toBe('\n\n')
  })
  it('לא שובר מספר עשרוני או ד״ר', () => {
    const u = splitUnits('הערך הוא 3.5 ליטר. ד״ר הולו הגיע.')
    expect(u.map((x) => x.text)).toEqual(['הערך הוא 3.5 ליטר.', 'ד״ר הולו הגיע.'])
  })
})

describe('paginate', () => {
  it('טקסט שנכנס = עמוד אחד, ללא שינוי', () => {
    expect(paginate('משפט קצר.', cap(50))).toEqual(['משפט קצר.'])
  })
  it('טקסט ריק = עמוד אחד ריק', () => {
    expect(paginate('   ', cap(10))).toEqual([''])
  })
  it('מפצל בגבולות משפט ולא מאבד תוכן', () => {
    const text = 'משפט אחד כאן. משפט שני כאן. משפט שלישי כאן. משפט רביעי כאן.'
    const pages = paginate(text, cap(30))
    expect(pages.length).toBeGreaterThan(1)
    for (const p of pages) { expect(p.length).toBeLessThanOrEqual(30); expect(p.endsWith('.')).toBe(true) }
    expect(pages.join(' ')).toBe(text)
  })
  it('פסקאות: שומר את המעבר בתוך עמוד, ומחלק בין עמודים בלי לאבד מילים', () => {
    const text = 'נרטיב קצר כאן.\n\nד״ר הולו אומר: "דיבור ארוך יותר מעט כאן."'
    const pages = paginate(text, cap(50))
    expect(pages.join(' ').replace(/\s+/g, ' ')).toBe(text.replace(/\s+/g, ' '))
    expect(pages.length).toBe(2)
  })
  it('משפט ארוך מעמוד שלם מתפצל לפי מילים', () => {
    const long = 'מילה '.repeat(30).trim() + '.'
    const pages = paginate(long, cap(40))
    expect(pages.length).toBeGreaterThan(2)
    for (const p of pages) expect(p.length).toBeLessThanOrEqual(40)
    expect(pages.join(' ')).toBe(long)
  })
  it('כל עמוד נכנס (או מילה בודדת שגדולה מהעמוד)', () => {
    const text = Array.from({ length: 12 }, (_, i) => `זהו משפט מספר ${i + 1} בסצנה.`).join(' ')
    for (const n of [25, 40, 80]) for (const p of paginate(text, cap(n))) expect(p.length).toBeLessThanOrEqual(n)
  })
})
