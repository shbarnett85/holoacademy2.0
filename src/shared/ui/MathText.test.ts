import { describe, expect, it } from 'vitest'
import { splitFractions } from '../lib/fractions'

const fr = (t: string) => splitFractions(t).filter((p) => p.kind === 'fraction').map((p) => `${p.num}/${p.den}`)

describe('MathText — זיהוי שברים בטקסט של תשובה', () => {
  it('שבר פשוט ושבר בתוך משפט', () => {
    expect(fr('5/6')).toEqual(['5/6'])
    expect(fr('התשובה היא 2/5 מהעוגה')).toEqual(['2/5'])
    expect(fr('1/2 ועוד 1/3')).toEqual(['1/2', '1/3'])
  })
  it('תווי שבר של יוניקוד', () => {
    expect(fr('⅖')).toEqual(['2/5'])
    expect(fr('½ + ⅓')).toEqual(['1/2', '1/3'])
  })
  it('תאריך, יחס עם שני לוכסנים ומספר עשרוני אינם שבר', () => {
    expect(fr('12/5/2024')).toEqual([])
    expect(fr('3.5/2')).toEqual([])
    expect(fr('1/2.5')).toEqual([])
  })
  it('לוכסן בין מילים נשאר טקסט', () => {
    expect(fr('נכון/לא נכון')).toEqual([])
    expect(splitFractions('נהר')).toEqual([{ kind: 'text', text: 'נהר' }])
  })
  it('הטקסט שמסביב נשמר במלואו', () => {
    const parts = splitFractions('בערך 3/4 מהדרך')
    expect(parts.map((p) => p.text).join('')).toBe('בערך 3/4 מהדרך')
  })
})
