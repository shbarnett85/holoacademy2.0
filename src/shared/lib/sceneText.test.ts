import { describe, expect, it } from 'vitest'
import {
  GRADE_BANDS, OPTION_WORD_BUDGET, PRIMARY_SCREEN, QUESTION_WORD_BUDGET, REF_LAYOUTS, SCENE_WORD_BUDGET, SCENE_WORD_CAP,
  fitsScreen, fontScaleForBand, gradeBandOfGrade, gradeBandOfLevel, gradeBandOfQuest, measureLines, questionWordBudget, sceneDisplayText, sceneWordBudget, wordCount,
} from './sceneText'
import { GOLDEN } from './sceneText.golden'

describe('שכבות', () => {
  it('רמת טקסט ← שכבה', () => {
    expect([1, 6, 7, 8, 9, 10, 11, 20].map(gradeBandOfLevel)).toEqual(['g1_2', 'g1_2', 'g3_4', 'g3_4', 'g5_6', 'g5_6', 'g7_9', 'g7_9'])
    expect(gradeBandOfLevel(null)).toBe('g5_6')
    expect(gradeBandOfGrade(2)).toBe('g1_2')
    expect(gradeBandOfGrade(9)).toBe('g7_9')
  })
  it('הדמיה ישנה בלי רמה: לפי טווח השכבות; בלי כלום — ה׳–ו׳', () => {
    expect(gradeBandOfQuest({ readingScale: 13 })).toBe('g7_9')
    expect(gradeBandOfQuest({ gradeMin: 1, gradeMax: 2 })).toBe('g1_2')
    expect(gradeBandOfQuest({})).toBe('g5_6')
  })
})

describe('תקציבים', () => {
  it('התקציב נגזר מהמדידה ואינו חורג מהתקרה; מרווח ביטחון ≥15% מקיבולת ה-95%', () => {
    for (const b of GRADE_BANDS) {
      expect(SCENE_WORD_BUDGET[b]).toBeLessThanOrEqual(SCENE_WORD_CAP[b])
      expect(sceneWordBudget(b)).toBe(Math.min(SCENE_WORD_CAP[b], SCENE_WORD_BUDGET[b]))
    }
    expect(SCENE_WORD_CAP).toEqual({ g1_2: 30, g3_4: 45, g5_6: 60, g7_9: 75 })
  })
  it('שאלה ואפשרויות', () => {
    expect(questionWordBudget(3)).toBe(QUESTION_WORD_BUDGET.upTo4Options)
    expect(questionWordBudget(4)).toBe(QUESTION_WORD_BUDGET.upTo4Options)
    expect(questionWordBudget(5)).toBe(QUESTION_WORD_BUDGET.fiveOrSixOptions)
    expect(OPTION_WORD_BUDGET).toBeGreaterThan(0)
  })
  it('הגופן לעולם לא מוקטן: מקדם 1 לכל השכבות', () => {
    for (const b of GRADE_BANDS) expect(fontScaleForBand(b)).toBe(1)
  })
})

describe('measureLines', () => {
  const lay = REF_LAYOUTS['laptop-620']
  it('טקסט ריק/קצר = שורה', () => {
    expect(measureLines('שלום.', lay.textWidthPx, lay.fontPx)).toBe(1)
  })
  it('פסקה ריקה בין פסקאות = שורה ריקה', () => {
    const a = measureLines('אחת\nשתיים', lay.textWidthPx, lay.fontPx)
    const b = measureLines('אחת\n\nשתיים', lay.textWidthPx, lay.fontPx)
    expect(b).toBe(a + 1)
  })
  it('מונוטוני ברוחב: צר יותר = לא פחות שורות', () => {
    const text = 'זהו משפט ארוך יחסית שנועד לבדוק שבירת שורות ברוחבים שונים של תיבת הטקסט בנגן של התלמיד.'
    const w = [400, 300, 200, 150].map((px) => measureLines(text, px, lay.fontPx))
    expect(w).toEqual([...w].sort((x, y) => x - y))
  })
  it('ניקוד לא מרחיב שורה', () => {
    const plain = 'הילד הלך לבית הספר בבוקר וראה ציפור'
    const niq = 'הַיֶּלֶד הָלַךְ לְבֵית הַסֵּפֶר בַּבֹּקֶר וְרָאָה צִפּוֹר'
    expect(measureLines(niq, 200, lay.fontPx)).toBe(measureLines(plain, 200, lay.fontPx))
  })
})

describe('fitsScreen', () => {
  it('סצנה קצרה נכנסת, ארוכה לא, וספירת העמודים עקבית', () => {
    const short = 'בפתח המעבדה עומד גבר בגלימה. "ד״ר הולו שלח לקרוא לך," הוא אומר.'
    expect(fitsScreen(short, 'g5_6', PRIMARY_SCREEN).fits).toBe(true)
    const long = 'משפט שלם ומלא. '.repeat(30).trim()
    const r = fitsScreen(long, 'g5_6', PRIMARY_SCREEN)
    expect(r.fits).toBe(false)
    expect(r.pages).toBeGreaterThan(1)
  })
  it('מסך גבוה יותר מכיל יותר; שורת פעולות נוספת מקטינה', () => {
    const t = 'זהו משפט בינוני באורכו. '.repeat(10).trim()
    const a = fitsScreen(t, 'g5_6', 'laptop-620')
    const b = fitsScreen(t, 'g5_6', 'laptop-768')
    expect(b.maxLines).toBeGreaterThan(a.maxLines)
    expect(fitsScreen(t, 'g5_6', 'laptop-768', { actionRows: 2 }).maxLines).toBeLessThan(b.maxLines)
  })
  it('תקציב השכבה (במדידה) נכנס במסך הייחוס — בטקסט אופייני', () => {
    const b = 'g5_6' as const
    const budget = SCENE_WORD_BUDGET[b]
    const sentence = 'אתה יוצא מהפורטל אל האגורה ההומה.'
    const text = Array.from({ length: Math.ceil(budget / wordCount(sentence)) }, () => sentence).join(' ')
    expect(fitsScreen(text, b, PRIMARY_SCREEN).fits).toBe(true)
  })
  it('sceneDisplayText זהה לטקסט שהנגן מציג', () => {
    expect(sceneDisplayText({ narrative: 'נרטיב.', drHoloDialog: 'דיבור.' })).toBe('נרטיב.\n\nד״ר הולו אומר: "דיבור."')
    expect(sceneDisplayText({ narrative: 'נרטיב.' })).toBe('נרטיב.')
    expect(sceneDisplayText({})).toBe('')
  })
})

/* כיול מול Chrome אמיתי: טקסטים אמיתיים ומספר השורות שנמדד בדפדפן בכל מסך ייחוס (e2e/textfit/calibrate.ts).
   סטייה מותרת עד שורה אחת. */
describe('כיול מול מדידת דפדפן', () => {
  for (const key of ['laptop-620', 'laptop-768', 'tablet', 'phone-landscape'] as const) {
    it(`${key}: כל ${GOLDEN.length} הטקסטים בסטייה ≤ שורה, ורובם מדויקים`, () => {
      const lay = REF_LAYOUTS[key]
      let exact = 0
      for (const g of GOLDEN) {
        const sim = measureLines(g.text, lay.textWidthPx, lay.fontPx)
        const dom = g.lines[key]
        expect(Math.abs(sim - dom), `${key}: ${g.text.slice(0, 30)}`).toBeLessThanOrEqual(1)
        if (sim === dom) exact++
      }
      expect(exact / GOLDEN.length).toBeGreaterThanOrEqual(0.9)
    })
  }
})
