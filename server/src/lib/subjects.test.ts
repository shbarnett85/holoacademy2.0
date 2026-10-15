import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SUBJECTS, legacySubjectToCode, LEGACY_SUBJECT_MAP, isSubjectCode, subjectName, UNCLASSIFIED_LABEL } from '../../../src/shared/lib/subjects.js'

const migration = readFileSync(resolve(__dirname, '../../migrations/analytics_foundations.sql'), 'utf8')

describe('רשימת המקצועות — מקור יחיד', () => {
  it('15 מקצועות, קודים ייחודיים', () => {
    expect(SUBJECTS).toHaveLength(15)
    expect(new Set(SUBJECTS.map((s) => s.code)).size).toBe(15)
  })
  it('זהה לשורות ה-seed שבמיגרציה (קוד + שם + סדר)', () => {
    SUBJECTS.forEach((s, i) => {
      expect(migration).toContain(`('${s.code}'`)
      expect(migration).toContain(`'${s.nameHe}'`)
      expect(migration).toMatch(new RegExp(`\\('${s.code}',\\s+'[^']+',\\s+${i + 1}\\)`))
    })
  })
  it('מיפוי המחרוזות ההיסטוריות זהה לטבלת subject_legacy_map במיגרציה', () => {
    for (const [legacy, code] of Object.entries(LEGACY_SUBJECT_MAP)) {
      expect(migration).toContain(`('${legacy}', '${code}')`)
    }
  })
})

describe('מיפוי מחרוזות היסטוריות', () => {
  it('מחרוזות מוכרות ממופות', () => {
    expect(legacySubjectToCode('מדעים')).toBe('science')
    expect(legacySubjectToCode('תנ״ך')).toBe('bible')
    expect(legacySubjectToCode('תנ"ך')).toBe('bible')
    expect(legacySubjectToCode('  חינוך גופני ')).toBe('pe')
  })
  it('מחרוזת לא מוכרת או ריקה → null (לא מנחשים)', () => {
    expect(legacySubjectToCode('פיזיקה')).toBeNull()
    expect(legacySubjectToCode('')).toBeNull()
    expect(legacySubjectToCode(null)).toBeNull()
    expect(legacySubjectToCode('חינוך')).toBeNull()
  })
  it('subjectName / isSubjectCode', () => {
    expect(isSubjectCode('math')).toBe(true)
    expect(isSubjectCode('physics')).toBe(false)
    expect(subjectName('math')).toBe('מתמטיקה')
    expect(subjectName(null)).toBe(UNCLASSIFIED_LABEL)
  })
})
