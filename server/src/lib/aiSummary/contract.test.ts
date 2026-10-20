import { describe, expect, it } from 'vitest'
import { AI_SUMMARY_EP, type SummaryTarget } from '../../../../src/shared/types/aiSummaryV1.js'
import { projectSource, type SummarySource } from './inputs.js'
import { createSummaryService } from './service.js'
import { createMemoryStore } from './store.js'
import { NOW, demoSources, fakeLlm, goodResponse } from './testkit.js'

/* AI_SUMMARY_EP מול התגובות האמיתיות של השירות על כל מקורות עולם ההדגמה: יצירה (AI ותבנית), אורח, get, ואין-מספיק-נתונים */
const targetOf = (s: SummarySource, i: number): SummaryTarget => {
  switch (s.scope) {
    case 'student': return { scope: 'student', id: s.overview.student.id }
    case 'class': return { scope: 'class', id: s.overview.class.id }
    case 'class_subject': return { scope: 'class_subject', id: s.view.class.id, subject: s.view.subject.code }
    case 'submission': return { scope: 'submission', id: `a-${i}` }
  }
}

describe('חוזה AI_SUMMARY_EP מול השירות', () => {
  it('כל מקור: create (AI), create (אורח/תבנית), get — כולם עומדים בסכמה', async () => {
    const sources = await demoSources()
    let ai = 0, template = 0, insufficient = 0
    for (const [i, { source }] of sources.entries()) {
      const target = targetOf(source, i)
      const input = projectSource(source)
      const mk = () => createSummaryService({ llm: fakeLlm([input.facts.length ? goodResponse(input) : '{}']), store: createMemoryStore(), now: () => NOW })
      const base = { target, audienceKey: 'full', load: async () => source }

      const real = mk()
      const created = await real.generate({ ...base, viewer: { userId: 'u-1', demo: false } })
      expect(AI_SUMMARY_EP.create.response.safeParse(created).success, `create ${target.scope}`).toBe(true)
      const fetched = await real.get({ ...base, viewer: { userId: 'u-1', demo: false } })
      expect(AI_SUMMARY_EP.get.response.safeParse(fetched).success, `get ${target.scope}`).toBe(true)
      if (created.data.summary?.writtenBy === 'ai') ai++
      if (created.data.summary?.writtenBy === 'template') template++
      if (!created.data.eligibility.ok) insufficient++

      const guest = await mk().generate({ ...base, viewer: { userId: 'guest', demo: true } })
      expect(AI_SUMMARY_EP.create.response.safeParse(guest).success, `demo ${target.scope}`).toBe(true)
      expect(guest.data.demo).toBe(true)
      expect(guest.data.summary === null || guest.data.summary.id === null).toBe(true)
    }
    /* הבדיקה לא עוברת סתם: רוב המקורות נכתבים ב-AI המזויף, ויש גם מקרים של "אין מספיק נתונים" */
    expect(ai).toBeGreaterThan(sources.length * 0.5)
    expect(ai + template + insufficient).toBe(sources.length)
  })

  it('רישום ה-EP: שיטה ונתיב', () => {
    expect(Object.fromEntries(Object.entries(AI_SUMMARY_EP).map(([k, v]) => [k, `${v.method} ${v.path}`]))).toEqual({
      get: 'GET /api/ai-summary', create: 'POST /api/ai-summary', edit: 'PATCH /api/ai-summary/:summaryId',
    })
  })
})
