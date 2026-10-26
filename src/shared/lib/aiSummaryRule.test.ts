import { describe, expect, it } from 'vitest'
import { SUMMARY_SCOPES } from '../types/aiSummaryV1'
import { CLASS_SUMMARY_MIN_COMPLETED, CURRENT_LEVEL_SESSIONS } from './analyticsConfig'
import { AI_SUMMARY_RULE, summaryEligibility, summaryMinimum } from './aiSummaryRule'
import { aiSummaryNotEnough } from './findingsNarrative'
import { FORBIDDEN_UI_TERMS, forbiddenHits } from './forbiddenTerms'

describe('aiSummaryRule: מתי מותר לכתוב סיכום', () => {
  it('הספים נגזרים מהתצורה הקיימת', () => {
    expect(AI_SUMMARY_RULE.studentMinSessions).toBe(CURRENT_LEVEL_SESSIONS)
    expect(AI_SUMMARY_RULE.submissionMinCompleted).toBe(CLASS_SUMMARY_MIN_COMPLETED)
    expect(AI_SUMMARY_RULE.classMinStudentsWithData).toBe(3)
    expect(AI_SUMMARY_RULE.classSubjectMinStudentsWithData).toBe(3)
  })

  it('תלמיד/ה: פחות מ-4 שיעורים → לא; 4 ומעלה → כן', () => {
    expect(summaryEligibility('student', { sessions: 3 }).ok).toBe(false)
    expect(summaryEligibility('student', { sessions: 4 })).toEqual({ ok: true })
    expect(summaryEligibility('student', { sessions: 120 })).toEqual({ ok: true })
    expect(summaryEligibility('student', {}).ok).toBe(false)
  })

  it('כיתה ומקצוע בכיתה: פחות מ-3 תלמידים עם נתונים → לא', () => {
    for (const scope of ['class', 'class_subject'] as const) {
      expect(summaryEligibility(scope, { students: 2 }).ok, scope).toBe(false)
      expect(summaryEligibility(scope, { students: 3 }).ok, scope).toBe(true)
    }
  })

  it('הגשה: פחות מ-2 תלמידים שסיימו → לא', () => {
    expect(summaryEligibility('submission', { completed: 1 }).ok).toBe(false)
    expect(summaryEligibility('submission', { completed: 2 }).ok).toBe(true)
  })

  it('רק הספירה הרלוונטית להיקף נספרת', () => {
    expect(summaryEligibility('student', { students: 99, completed: 99 }).ok).toBe(false)
    expect(summaryEligibility('class', { sessions: 99, completed: 99 }).ok).toBe(false)
    expect(summaryEligibility('submission', { sessions: 99, students: 99 }).ok).toBe(false)
  })

  it('הסירוב מסביר במילים מה קורה ומה יקרה (מ-findingsNarrative), בלי מונחים טכניים', () => {
    for (const scope of SUMMARY_SCOPES) {
      const e = summaryEligibility(scope, {})
      expect(e.ok).toBe(false)
      if (e.ok) continue
      const { text, whatNext } = aiSummaryNotEnough(scope, summaryMinimum(scope))
      expect(e.text).toBe(text)
      expect(e.whatNext).toBe(whatNext)
      expect(text).toContain('אין מספיק')
      expect(whatNext).toContain('יהיה זמין')
      expect(whatNext).toContain(String(summaryMinimum(scope)))
      for (const s of [text, whatNext]) expect(forbiddenHits(s, FORBIDDEN_UI_TERMS), s).toEqual([])
    }
  })

  it('ניסוח יחיד (מינימום 1) תקין דקדוקית', () => {
    expect(aiSummaryNotEnough('student', 1).whatNext).toBe('הסיכום יהיה זמין אחרי שיעור אחד לפחות.')
    expect(aiSummaryNotEnough('class', 1).whatNext).toContain('תלמיד/ה אחד/ת')
    expect(aiSummaryNotEnough('submission', 1).whatNext).toContain('תלמיד/ה אחד/ת')
  })
})
