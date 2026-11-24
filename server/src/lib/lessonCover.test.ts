import { describe, expect, it } from 'vitest'
import { coverBrief, lintCoverPrompt } from './lessonCover.js'

describe('coverBrief — מה שהמודל מקבל כדי לכתוב את הפרומפט של תמונת העטיפה', () => {
  const gameData = {
    entrySceneId: 'lab',
    isHistorical: true,
    scenes: [
      { id: 'lab', title: 'המעבדה', narrative: 'ד״ר הולו מחכה במעבדה.' },
      { id: 'a', title: 'הסדנה בפירנצה', narrative: 'לֵאוֹנַרְדּוֹ מצייר.', imagePrompt: 'A wide empty Renaissance workshop in Florence' },
      { id: 'b', title: 'מכונת התעופה', narrative: 'x'.repeat(400) },
    ],
  }
  const brief = coverBrief({ title: 'לאונרדו דה וינצ׳י — איש הרנסאנס', gameData })

  it('שם השיעור, העמודים שאחרי מסך הפתיחה, והעובדה שהוא מתרחש בעבר', () => {
    expect(brief).toContain('לאונרדו דה וינצ׳י')
    expect(brief).toContain('- הסדנה בפירנצה')
    expect(brief).toContain('- מכונת התעופה')
    expect(brief).toContain('takes place in the past')
    expect(brief).not.toContain('המעבדה')
  })
  it('הפרומפט של התמונה שאחרי הפתיחה מצורף, כדי שהעטיפה תהיה שונה ממנה', () => {
    expect(brief).toContain('do not repeat it): A wide empty Renaissance workshop in Florence')
  })
  it('בלי ניקוד, וטקסט ארוך מקוצר', () => {
    expect(brief).toContain('לאונרדו מצייר.')
    expect(brief).not.toMatch(/[֑-ׇ]/)
    expect(brief).not.toContain('x'.repeat(200))
  })
  it('שיעור שיש בו רק מסך הפתיחה: העמוד שלו נשלח', () => {
    expect(coverBrief({ title: 'שיעור', gameData: { scenes: [{ id: 'lab', title: 'פתיחה', narrative: 'טקסט' }] } })).toContain('- פתיחה: טקסט')
  })
})

describe('lintCoverPrompt — הפרות בפרומפט שהופכות לטעות בתמונה', () => {
  it('פרומפט תקין לכל סוג נושא עובר', () => {
    expect(lintCoverPrompt('A', 'An old master with a long grey beard stands in the centre of a wide studio. On the left, a framed portrait of a dark-haired woman on an easel. Above, a wooden glider with canvas wings hangs from the ceiling.')).toEqual([])
    expect(lintCoverPrompt('B', 'Saturn floats alone in black space, a pale golden globe with wide flat rings, small stars behind it.')).toEqual([])
    expect(lintCoverPrompt('C', 'A friendly baker at a market stall holds a round pie cut into four equal parts, one part already on a plate, piles of coins of different heights beside it.')).toEqual([])
  })
  it('מדע: כמה גופים, מסלולים, וגוף ש"תלוי"', () => {
    expect(lintCoverPrompt('B', 'The Sun in the centre, Earth on the left and the Moon on the right.').join(' ')).toContain('several celestial bodies (sun, moon, earth)')
    expect(lintCoverPrompt('B', 'Saturn with the other planets on their orbits.').length).toBe(1)
    expect(lintCoverPrompt('B', 'Earth hangs in the darkness.').join(' ')).toContain('hooks and chains')
  })
  it('מתמטיקה: ספרות, אחוזים, תוויות ושלטים', () => {
    expect(lintCoverPrompt('C', 'A shirt with a tag showing 25% beside it.').length).toBe(2)
    expect(lintCoverPrompt('C', 'A cashier in a mall holding a price tag.').length).toBe(1)
  })
  it('אנשים וסיפור: "ענק" מצויר כמפלצת', () => {
    expect(lintCoverPrompt('A', 'A shepherd boy faces a massive armored giant.').join(' ')).toContain('very tall, strong man')
    expect(lintCoverPrompt('A', 'A shepherd boy faces a very tall, strong warrior in bronze armor.')).toEqual([])
  })
  it('לכל סוג: חפץ עם כתב, ילדים, וטקסט מצוטט', () => {
    expect(lintCoverPrompt('A', 'He holds an unfurled parchment.').length).toBe(1)
    expect(lintCoverPrompt('A', 'A warm scene for children.').length).toBe(1)
    expect(lintCoverPrompt('A', 'A sign that says "open".').length).toBe(1)
  })
})
