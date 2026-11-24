import { describe, expect, it } from 'vitest'
import { coverBrief } from './lessonCover.js'

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
