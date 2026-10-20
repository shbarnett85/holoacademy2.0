import { describe, expect, it } from 'vitest'
import {
  AI_SUMMARY_EP, AiSummarySchema, EditSummaryRequestSchema, GenerateSummaryRequestSchema, SUMMARY_SCOPES, SummaryEligibilitySchema, SummaryStateSchema, SummaryTargetSchema,
} from './aiSummaryV1'

const ISO = '2026-10-19T09:00:00.000Z'
const summary = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: null, target: { scope: 'student', id: 's-1' }, writtenBy: 'ai', label: 'x', notice: null, paragraphs: ['א'], generatedParagraphs: ['א'], edited: false,
  basisText: 'מבוסס על 4 הדמיות', generatedAt: ISO, updatedAt: ISO, caveat: 'c', howWritten: [], ...over,
})

describe('aiSummaryV1: החוזה', () => {
  it('ארבעה היקפים; subject נדרש רק ב-class_subject', () => {
    expect([...SUMMARY_SCOPES]).toEqual(['student', 'class', 'class_subject', 'submission'])
    expect(SummaryTargetSchema.safeParse({ scope: 'student', id: 's' }).success).toBe(true)
    expect(SummaryTargetSchema.safeParse({ scope: 'class_subject', id: 'c', subject: 'math' }).success).toBe(true)
    expect(SummaryTargetSchema.safeParse({ scope: 'class_subject', id: 'c' }).success).toBe(false)
    expect(SummaryTargetSchema.safeParse({ scope: 'student', id: 's', subject: 'math' }).success).toBe(false)
    expect(SummaryTargetSchema.safeParse({ scope: 'class_subject', id: 'c', subject: 'nope' }).success).toBe(false)
    expect(SummaryTargetSchema.safeParse({ scope: 'weird', id: 's' }).success).toBe(false)
    expect(SummaryTargetSchema.safeParse({ scope: 'student', id: '' }).success).toBe(false)
    expect(SummaryTargetSchema.safeParse({ scope: 'student', id: 'x'.repeat(65) }).success).toBe(false)
  })

  it('בקשת יצירה: יעד + regenerate בוליאני אופציונלי', () => {
    expect(GenerateSummaryRequestSchema.safeParse({ scope: 'class', id: 'c' }).success).toBe(true)
    expect(GenerateSummaryRequestSchema.safeParse({ scope: 'class', id: 'c', regenerate: true }).success).toBe(true)
    expect(GenerateSummaryRequestSchema.safeParse({ scope: 'class', id: 'c', regenerate: 'yes' }).success).toBe(false)
    expect(GenerateSummaryRequestSchema.safeParse({ scope: 'class_subject', id: 'c', subject: 'math', regenerate: false }).success).toBe(true)
    expect(GenerateSummaryRequestSchema.safeParse({ scope: 'class_subject', id: 'c', regenerate: false }).success).toBe(false)
  })

  it('בקשת עריכה: טקסט עד 6000 תווים או null (חזרה למקור)', () => {
    expect(EditSummaryRequestSchema.safeParse({ editedText: null }).success).toBe(true)
    expect(EditSummaryRequestSchema.safeParse({ editedText: 'x'.repeat(6000) }).success).toBe(true)
    expect(EditSummaryRequestSchema.safeParse({ editedText: 'x'.repeat(6001) }).success).toBe(false)
    expect(EditSummaryRequestSchema.safeParse({}).success).toBe(false)
    expect(EditSummaryRequestSchema.safeParse({ editedText: 5 }).success).toBe(false)
  })

  it('סיכום: 1-4 פסקאות שנכתבו, עד 12 להצגה (עריכה חופשית), writtenBy ai/template', () => {
    expect(AiSummarySchema.safeParse(summary()).success).toBe(true)
    expect(AiSummarySchema.safeParse(summary({ writtenBy: 'template' })).success).toBe(true)
    expect(AiSummarySchema.safeParse(summary({ writtenBy: 'human' })).success).toBe(false)
    expect(AiSummarySchema.safeParse(summary({ generatedParagraphs: ['א', 'ב', 'ג', 'ד', 'ה'] })).success).toBe(false)
    expect(AiSummarySchema.safeParse(summary({ paragraphs: Array.from({ length: 12 }, () => 'א') })).success).toBe(true)
    expect(AiSummarySchema.safeParse(summary({ paragraphs: Array.from({ length: 13 }, () => 'א') })).success).toBe(false)
    expect(AiSummarySchema.safeParse(summary({ paragraphs: [] })).success).toBe(false)
    expect(AiSummarySchema.safeParse(summary({ paragraphs: [''] })).success).toBe(false)
    expect(AiSummarySchema.safeParse(summary({ id: 'abc' })).success).toBe(true)
  })

  it('זכאות: איחוד מובחן — ok או (text + whatNext)', () => {
    expect(SummaryEligibilitySchema.safeParse({ ok: true }).success).toBe(true)
    expect(SummaryEligibilitySchema.safeParse({ ok: false, text: 'א', whatNext: 'ב' }).success).toBe(true)
    expect(SummaryEligibilitySchema.safeParse({ ok: false, text: 'א' }).success).toBe(false)
    expect(SummaryEligibilitySchema.safeParse({ ok: false, text: '', whatNext: 'ב' }).success).toBe(false)
  })

  it('מצב: privacyNote חובה; summary יכול להיות null', () => {
    const state = { eligibility: { ok: true }, summary: null, demo: false, persisted: false, persistenceNote: null, privacyNote: 'p' }
    expect(SummaryStateSchema.safeParse(state).success).toBe(true)
    expect(SummaryStateSchema.safeParse({ ...state, privacyNote: '' }).success).toBe(false)
    expect(SummaryStateSchema.safeParse({ ...state, summary: summary() }).success).toBe(true)
  })

  it('מעטפות ורישום נקודות הקצה', () => {
    const state = { eligibility: { ok: true }, summary: null, demo: false, persisted: false, persistenceNote: null, privacyNote: 'p' }
    for (const ep of Object.values(AI_SUMMARY_EP)) {
      expect(ep.response.safeParse({ dataState: 'ok', data: state }).success).toBe(true)
      expect(ep.response.safeParse({ dataState: 'insufficient', data: state }).success).toBe(true)
      expect(ep.response.safeParse({ dataState: 'maybe', data: state }).success).toBe(false)
      expect(ep.response.safeParse({ data: state }).success).toBe(false)
    }
    expect(AI_SUMMARY_EP.get.method).toBe('GET')
    expect(AI_SUMMARY_EP.create.method).toBe('POST')
    expect(AI_SUMMARY_EP.edit.method).toBe('PATCH')
    expect(AI_SUMMARY_EP.edit.path).toContain(':summaryId')
  })
})
