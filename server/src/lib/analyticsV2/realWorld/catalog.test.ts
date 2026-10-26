import { describe, expect, it } from 'vitest'
import { EMPTY_CATALOG } from '../catalog.js'
import { analyze } from '../engine.js'
import { assembleWorld } from './assemble.js'
import { buildCatalog, emptyCatalogRows, type CatalogRows } from './catalog.js'
import { emptyClassRaw } from './testkit.js'

const rows = (over: Partial<CatalogRows> = {}): CatalogRows => ({ ...emptyCatalogRows(), ...over })
const concept = (over = {}) => ({ id: 'c1', key: 'math.fractions.add', titleHe: 'חיבור שברים', subject: 'math' as const, vector: 'concept_understanding', status: 'approved', ...over })

describe('buildCatalog (חי)', () => {
  it('טבלאות ריקות ← EMPTY_CATALOG (תקין: אין וקטורי תוכן ואין טעויות נפוצות)', () => {
    expect(buildCatalog(emptyCatalogRows())).toBe(EMPTY_CATALOG)
  })

  it('חוק 2: רק מושגים approved עם וקטור תקין ובמרחב השמות של המקצוע', () => {
    const cat = buildCatalog(rows({
      concepts: [
        concept(),
        concept({ id: 'c2', key: 'math.draft', status: 'draft' }),
        concept({ id: 'c3', key: 'math.novec', vector: null }),
        concept({ id: 'c4', key: 'math.badvec', vector: 'made_up' }),
        concept({ id: 'c5', key: 'history.wrong_ns', subject: 'math' }),
        concept({ id: 'c6', key: 'x.nosubject', subject: null }),
        concept({ id: 'c7', key: 'history.causes', titleHe: 'סיבות', subject: 'history', vector: 'sequence_causality' }),
      ],
    }))
    expect(cat.concepts.map((c) => c.key)).toEqual(['history.causes', 'math.fractions.add'])
    expect(cat.conceptByKey('math.fractions.add')).toMatchObject({ titleHe: 'חיבור שברים', vector: 'concept_understanding', goalId: null })
    expect(cat.conceptsOfSubject('history').map((c) => c.key)).toEqual(['history.causes'])
  })

  it('יעדי תוכנית: צומת approved בלבד; official רק עם source_version', () => {
    const cat = buildCatalog(rows({
      concepts: [concept(), concept({ id: 'c2', key: 'math.second' }), concept({ id: 'c3', key: 'math.third' })],
      nodes: [
        { id: 'n1', titleHe: 'שברים', gradeFrom: 5, gradeTo: 6, status: 'approved', sourceVersion: '2024-v1' },
        { id: 'n2', titleHe: 'ללא גרסה', gradeFrom: 3, gradeTo: 4, status: 'approved', sourceVersion: '  ' },
        { id: 'n3', titleHe: 'טיוטה', gradeFrom: 1, gradeTo: 2, status: 'draft', sourceVersion: 'v' },
      ],
      conceptLinks: [{ conceptId: 'c1', nodeId: 'n1' }, { conceptId: 'c2', nodeId: 'n2' }, { conceptId: 'c3', nodeId: 'n3' }],
    }))
    expect(cat.goals.map((g) => [g.id, g.mappingStatus, g.gradeFrom, g.gradeTo]).sort()).toEqual([['n1', 'official', 5, 6], ['n2', 'sample', 3, 4]])
    expect(cat.conceptByKey('math.fractions.add')!.goalId).toBe('n1')
    expect(cat.conceptByKey('math.second')!.goalId).toBe('n2')
    expect(cat.conceptByKey('math.third')!.goalId).toBeNull()
    expect(cat.goalById('n1')).toMatchObject({ title: 'שברים', subject: 'math' })
  })

  it('תפיסות: approved עם מושג בקטלוג; שכבות מצומת התוכנית (אין צומת ← כל השכבות); קישור להדמיה', () => {
    const m = (over = {}) => ({ id: 'm1', code: 'math.a', titleHe: 'טעות א', descriptionHe: 'תיאור', subject: 'math' as const, conceptId: 'c1', status: 'approved', ...over })
    const cat = buildCatalog(rows({
      concepts: [concept(), concept({ id: 'c2', key: 'math.second' })],
      nodes: [{ id: 'n1', titleHe: 'שברים', gradeFrom: 5, gradeTo: 6, status: 'approved', sourceVersion: 'v' }],
      conceptLinks: [{ conceptId: 'c1', nodeId: 'n1' }],
      misconceptions: [
        m(), m({ id: 'm2', code: 'math.b', conceptId: 'c2', descriptionHe: null }),
        m({ id: 'm3', code: 'math.c', status: 'draft' }), m({ id: 'm4', code: 'math.d', conceptId: null }), m({ id: 'm5', code: 'math.e', conceptId: 'ghost' }),
      ],
      misconceptionLinks: [{ misconceptionId: 'm1', questId: 'q-1' }],
      questTitles: new Map([['q-1', 'שיעור שברים']]),
    }))
    expect(cat.misconceptions.map((x) => x.id)).toEqual(['m1', 'm2'])
    const [m1, m2] = cat.misconceptions
    expect(m1).toMatchObject({ conceptKey: 'math.fractions.add', grades: { from: 5, to: 6 }, linkedQuest: { questId: 'q-1', title: 'שיעור שברים' }, prevalence: {} })
    expect(m2).toMatchObject({ grades: null, linkedQuest: null, descriptionHe: '' })
    expect(cat.misconceptionAppliesTo(m1, 6)).toBe(true)
    expect(cat.misconceptionAppliesTo(m1, 7)).toBe(false)
    expect(cat.misconceptionAppliesTo(m2, 9)).toBe(true)
  })

  it('קטלוג חי עם מושגים: המנוע מציג וקטורי תוכן במקצוע (אבל "אין עדיין מספיק נתונים" בלי תיוג של פריטים)', () => {
    const cat = buildCatalog(rows({ concepts: [concept()] }))
    const raw = emptyClassRaw('c1')
    raw.members.push({ id: 's1', name: 'דנה', classIds: ['c1'] })
    raw.quests.push({ id: 'q', subject: 'math' })
    raw.sessions.push({ id: 'x', studentId: 's1', questId: 'q', completedAt: '2026-03-04T08:00:00Z' })
    raw.snapshots.push({ sessionId: 'x', studentId: 's1', classId: 'c1', subject: 'math', level: 8, success: 0.7 })
    const a = analyze(assembleWorld(raw, new Date('2026-03-06T10:00:00Z')), cat)
    const vectors = a.ss.get('s1|math')!.contentVectors
    expect(vectors.map((v) => v.key)).toEqual(['concept_understanding'])
    expect(vectors[0]).toMatchObject({ level: null, status: 'insufficient', n: 0 })
  })
})
