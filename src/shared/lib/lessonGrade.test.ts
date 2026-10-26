import { describe, expect, it } from 'vitest'
import { gradeLayersLabel, lessonGradeRange } from './lessonGrade'

describe('שכבות השיעור (תגית השכבות בכרטיס)', () => {
  it('מטא שכבות (שיעורי הספרייה הרשמית) הוא הטווח כמו שהוא', () => {
    expect(lessonGradeRange({ grade_min: 5, grade_max: 6 })).toEqual({ gradeMin: 5, gradeMax: 6 })
    expect(lessonGradeRange({ grade_min: 7, grade_max: 7, difficulty_settings: { writingLevel: 15 } })).toEqual({ gradeMin: 7, gradeMax: 7 })
  })

  it('חסר צד אחד — שכבה יחידה; טווח הפוך מתוקן', () => {
    expect(lessonGradeRange({ grade_min: 4, grade_max: null })).toEqual({ gradeMin: 4, gradeMax: 4 })
    expect(lessonGradeRange({ grade_min: 9, grade_max: 8 })).toEqual({ gradeMin: 8, gradeMax: 9 })
  })

  it('בלי מטא: שכבת היעד שהמורה בחר ביצירה — רמת כתיבה 1–20 פחות 4 (א׳ = רמה 5, י״ב = רמה 16)', () => {
    expect(lessonGradeRange({ difficulty_settings: { writingLevel: 5 } })).toEqual({ gradeMin: 1, gradeMax: 1 })
    expect(lessonGradeRange({ difficulty_settings: { writingLevel: 11 } })).toEqual({ gradeMin: 7, gradeMax: 7 })
    expect(lessonGradeRange({ difficulty_settings: { writingLevel: 16 } })).toEqual({ gradeMin: 12, gradeMax: 12 })
  })

  it('גן, תואר, ערך חסר או לא תקין — אין תגית (לא ממציאים שכבה)', () => {
    expect(lessonGradeRange({ difficulty_settings: { writingLevel: 4 } })).toBeNull()
    expect(lessonGradeRange({ difficulty_settings: { writingLevel: 17 } })).toBeNull()
    expect(lessonGradeRange({ difficulty_settings: {} })).toBeNull()
    expect(lessonGradeRange({ difficulty_settings: null })).toBeNull()
    expect(lessonGradeRange({ grade_min: 0, grade_max: 13 })).toBeNull()
    expect(lessonGradeRange({})).toBeNull()
  })

  it('הניסוח: שכבה אחת / טווח; בלי נתון — null', () => {
    expect(gradeLayersLabel(7, 7)).toBe('שכבה ז׳')
    expect(gradeLayersLabel(5, 6)).toBe('שכבות ה׳–ו׳')
    expect(gradeLayersLabel(11, 12)).toBe('שכבות י״א–י״ב')
    expect(gradeLayersLabel(8, null)).toBe('שכבה ח׳')
    expect(gradeLayersLabel(null, null)).toBeNull()
    expect(gradeLayersLabel(undefined, 99)).toBeNull()
  })
})
