import { beforeEach, describe, expect, it, vi } from 'vitest'

/* ══════════════════════════════════════════════════════════════════════════
   fetchRaw מול DB מדומה: דפדוף, אצוות, בדיקות סכמה שנכשלות סגור, הפרדת סינתטי/פיקטיבי, ראיות רק מההשלמה הראשונה, שלבי אירועי הקריאה.
   (הבדיקה החיה — קריאה בלבד — היא סקריפט האימות של W5.)
   ══════════════════════════════════════════════════════════════════════════ */
const h = await vi.hoisted(async () => {
  const { createMockDb } = await import('./dbMock.js')
  return { db: createMockDb(), flags: { syn: true, fict: true, active: false } }
})

vi.mock('../../supabase.js', () => ({ supabaseAdmin: h.db.client, supabaseAnon: {} }))
vi.mock('../../activeColumn.js', async (orig) => ({
  ...(await orig<typeof import('../../activeColumn.js')>()),
  hasSyntheticFlag: async () => h.flags.syn, hasFictitious: async () => h.flags.fict, hasIsActive: async () => h.flags.active,
}))
const SUBJ: Record<string, string> = { 'sub-math': 'math', 'sub-hist': 'history', 'sub-sci': 'science', 'sub-weird': 'not-a-subject' }
vi.mock('../../subjects.js', () => ({
  subjectById: async (id: string | null) => (id && SUBJ[id] ? { id, code: SUBJ[id], nameHe: '' } : null),
  questSubjectOut: async (r: { subject_id?: string | null }) => (r.subject_id && SUBJ[r.subject_id] ? { subject: 'x', subjectCode: SUBJ[r.subject_id] } : { subject: null, subjectCode: null }),
}))

import { ProbeUnavailableError } from '../../activeColumn.js'
import { fetchCatalogRows, fetchClassRaw, fetchSchoolClassIds, resetDetailCache } from './fetchRaw.js'
import { resetSchemaProbes } from './queryUtil.js'
import type { Row } from './dbMock.js'

const NOW = new Date('2026-03-06T10:00:00Z')
const id = (kind: string, n: number): string => `${kind}`.padEnd(8, '0').slice(0, 8) + `-0000-4000-8000-${String(n).padStart(12, '0')}`
const CLASS = id('c1a55e55', 1)
const SCHOOL = id('5c400000', 1)
const stu = (n: number): string => id('57ud0000', n)
const quest = (n: number): string => id('90e57000', n)
const ses = (n: number): string => id('5e550000', n)

function seed(): void {
  h.db.reset()
  h.flags.syn = true; h.flags.fict = true; h.flags.active = false
  resetSchemaProbes(); resetDetailCache()
  const t = h.db.tables
  t.schools = [{ id: SCHOOL, name: 'School One' }]
  t.classes = [{ id: CLASS, name: 'ז׳1', grade_label: 'ז׳1', grade_level: 7, school_id: SCHOOL, is_fictitious: false }]
  t.users = [
    { id: stu(1), name: 'דנה כהן', role: 'student', is_fictitious: false },
    { id: stu(2), name: 'רון לוי', role: 'student', is_fictitious: false },
    { id: id('7ea00000', 1), name: 'מורה', role: 'teacher', is_fictitious: false },
    { id: stu(3), name: 'דמו פיקטיבי', role: 'student', is_fictitious: true },
  ]
  t.class_members = [CLASS].flatMap((c) => [stu(1), stu(2), id('7ea00000', 1), stu(3)].map((u) => ({ class_id: c, user_id: u })))
  t.class_teachers = [{ id: 1, class_id: CLASS, subject_id: 'sub-hist' }, { id: 2, class_id: CLASS, subject_id: null }, { id: 3, class_id: CLASS, subject_id: 'sub-weird' }]
  t.quests = [{ id: quest(1), subject_id: 'sub-math', subject: null, game_data: null }, { id: quest(2), subject_id: null, subject: null, game_data: null }]
  t.sessions = [
    { id: ses(1), user_id: stu(1), quest_id: quest(1), completed_at: '2026-03-02T08:00:00Z', is_synthetic: false },
    { id: ses(2), user_id: stu(1), quest_id: quest(2), completed_at: '2026-03-03T08:00:00Z', is_synthetic: false },
    { id: ses(3), user_id: stu(2), quest_id: quest(1), completed_at: '2026-03-04T08:00:00Z', is_synthetic: true },
    { id: ses(4), user_id: stu(2), quest_id: quest(1), completed_at: null, is_synthetic: false },
  ]
  t.progress_snapshots = [
    { id: 1, session_id: ses(1), student_id: stu(1), class_id: CLASS, subject_id: null, text_level: 7, overall_success: 0.8, taken_at: '2026-03-02T08:00:01Z', is_synthetic: false },
    { id: 2, session_id: ses(3), student_id: stu(2), class_id: CLASS, subject_id: null, text_level: 6, overall_success: 0.5, taken_at: '2026-03-04T08:00:01Z', is_synthetic: true },
    { id: 3, session_id: null, student_id: stu(1), class_id: CLASS, subject_id: null, text_level: 9, overall_success: 0.9, taken_at: '2026-03-03T08:00:01Z', is_synthetic: false },
  ]
  t.events = []
  t.answers = []
}

beforeEach(seed)

describe('fetchClassRaw — כיתה, חברים, מקצועות', () => {
  it('טוען כיתה, בית ספר, תלמידים בלבד (בלי מורה, בלי פיקטיביים), ומקצועות הכיתה מ-class_teachers (ללא ריקים / לא מוכרים)', async () => {
    const raw = await fetchClassRaw(CLASS, false, NOW)
    expect(raw.cls).toEqual({ id: CLASS, name: 'ז׳1', gradeLabel: 'ז׳1', gradeLevel: 7, schoolId: SCHOOL })
    expect(raw.school).toEqual({ id: SCHOOL, name: 'School One' })
    expect(raw.members.map((m) => m.id)).toEqual([stu(1), stu(2)])
    expect(raw.classSubjects).toEqual(['history'])
    expect(raw.members[0].classIds).toEqual([CLASS])
  })

  it('ארגון הדגמה (includeSynthetic) רואה גם תלמידים פיקטיביים', async () => {
    const raw = await fetchClassRaw(CLASS, true, NOW)
    expect(raw.members.map((m) => m.id)).toEqual([stu(1), stu(2), stu(3)])
  })

  it('תלמיד מושבת (is_active=false) מוחרג כשהעמודה קיימת', async () => {
    h.flags.active = true
    h.db.tables.users[1].is_active = false
    h.db.tables.users[0].is_active = true
    const raw = await fetchClassRaw(CLASS, false, NOW)
    expect(raw.members.map((m) => m.id)).toEqual([stu(1)])
  })

  it('כיתה פיקטיבית מוסתרת מצופה רגיל, גלויה לארגון הדגמה; כיתה שלא קיימת / מזהה לא תקין → ריק', async () => {
    h.db.tables.classes[0].is_fictitious = true
    expect((await fetchClassRaw(CLASS, false, NOW)).cls).toBeNull()
    expect((await fetchClassRaw(CLASS, true, NOW)).cls?.id).toBe(CLASS)
    expect((await fetchClassRaw(id('aaaaaaaa', 9), true, NOW)).cls).toBeNull()
    const callsBefore = h.db.calls.length
    expect((await fetchClassRaw('not-a-uuid', true, NOW)).cls).toBeNull()
    expect(h.db.calls.length).toBe(callsBefore)
  })

  it('חברות בכיתות נוספות נטענת (לכיתה העיקרית של תלמיד בכמה כיתות)', async () => {
    const other = id('c1a55e55', 2)
    h.db.tables.class_members.push({ class_id: other, user_id: stu(1) })
    const raw = await fetchClassRaw(CLASS, false, NOW)
    expect(raw.members.find((m) => m.id === stu(1))!.classIds).toEqual([CLASS, other].sort())
    expect(raw.members.find((m) => m.id === stu(2))!.classIds).toEqual([CLASS])
  })
})

describe('fetchClassRaw — סשנים, מקצוע, snapshots', () => {
  it('מחזיר רק סשנים שהושלמו; מקצוע מ-quests.subject_id (לא מוכר ← null); snapshots רק עם session_id ולסשנים שנטענו', async () => {
    const raw = await fetchClassRaw(CLASS, true, NOW)
    expect(raw.sessions.map((s) => s.id).sort()).toEqual([ses(1), ses(2), ses(3)].sort())
    expect(raw.quests).toEqual(expect.arrayContaining([{ id: quest(1), subject: 'math' }, { id: quest(2), subject: null }]))
    expect(raw.snapshots.map((s) => s.sessionId).sort()).toEqual([ses(1), ses(3)].sort())
    expect(raw.snapshots.find((s) => s.sessionId === ses(1))).toMatchObject({ studentId: stu(1), classId: CLASS, level: 7, success: 0.8 })
  })

  it('הפרדת סינתטי/אמיתי: ללא ארגון הדגמה — שורות is_synthetic לא נטענות (סשנים ו-snapshots)', async () => {
    const raw = await fetchClassRaw(CLASS, false, NOW)
    expect(raw.sessions.map((s) => s.id).sort()).toEqual([ses(1), ses(2)].sort())
    expect(raw.snapshots.map((s) => s.sessionId)).toEqual([ses(1)])
  })

  it('חלון: סשן ישן מהאופק לא נטען', async () => {
    h.db.tables.sessions.push({ id: ses(9), user_id: stu(1), quest_id: quest(1), completed_at: '2024-01-01T08:00:00Z', is_synthetic: false })
    const raw = await fetchClassRaw(CLASS, true, NOW)
    expect(raw.sessions.some((s) => s.id === ses(9))).toBe(false)
  })

  it('דפדוף: מעל 1000 סשנים לתלמיד נטענים כולם (מיון יציב)', async () => {
    const quests: Row[] = []
    const sessions: Row[] = []
    for (let i = 0; i < 2300; i++) {
      quests.push({ id: quest(100 + i), subject_id: 'sub-math', subject: null })
      sessions.push({ id: ses(1000 + i), user_id: stu(1), quest_id: quest(100 + i), completed_at: `2026-02-${String(1 + (i % 27)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00:00Z`, is_synthetic: false })
    }
    h.db.tables.quests.push(...quests)
    h.db.tables.sessions.push(...sessions)
    const raw = await fetchClassRaw(CLASS, false, NOW)
    expect(new Set(raw.sessions.map((s) => s.id)).size).toBe(2302)
    expect(h.db.calls.filter((c) => c.table === 'sessions').length).toBeGreaterThanOrEqual(3)
  })

  it('אצוות: 400 תלמידים → שאילתות IN של 150 / 150 / 100', async () => {
    const users: Row[] = [], members: Row[] = []
    for (let i = 10; i < 410; i++) {
      users.push({ id: stu(i), name: `תלמיד ${i}`, role: 'student', is_fictitious: false })
      members.push({ class_id: CLASS, user_id: stu(i) })
    }
    h.db.tables.users.push(...users)
    h.db.tables.class_members.push(...members)
    await fetchClassRaw(CLASS, false, NOW)
    const lens = h.db.calls.filter((c) => c.table === 'sessions').map((c) => c.inLens.user_id).sort((a, b) => b - a)
    expect(lens).toEqual([150, 150, 100 + 2]) /* 400 + שני התלמידים הקיימים */
  })
})

describe('fetchClassRaw — בדיקות סכמה נכשלות סגור', () => {
  it('תקלה זמנית בבדיקת עמודה (בלי קוד סכמה) → ProbeUnavailableError (503), לא "אין עמודה"', async () => {
    h.db.fail.add('classes.grade_level')
    await expect(fetchClassRaw(CLASS, false, NOW)).rejects.toBeInstanceOf(ProbeUnavailableError)
    resetSchemaProbes()
    h.db.fail.clear()
    h.db.fail.add('progress_snapshots')
    await expect(fetchClassRaw(CLASS, false, NOW)).rejects.toBeInstanceOf(ProbeUnavailableError)
  })

  it('עמודה חסרה באמת (42703) → נטען בלעדיה; טבלת snapshots חסרה → אין snapshots', async () => {
    h.db.missing.add('classes.grade_level')
    h.db.tables.classes[0].grade_level = undefined
    const raw = await fetchClassRaw(CLASS, false, NOW)
    expect(raw.cls!.gradeLevel).toBeNull()
    resetSchemaProbes()
    h.db.missing.clear()
    h.db.missing.add('progress_snapshots')
    const raw2 = await fetchClassRaw(CLASS, false, NOW)
    expect(raw2.snapshots).toEqual([])
    expect(raw2.sessions.length).toBeGreaterThan(0)
  })

  it('כשל שאילתה אמיתי (לא בדיקת סכמה) נזרק — לא נבלע', async () => {
    resetSchemaProbes()
    h.db.fail.add('sessions')
    await expect(fetchClassRaw(CLASS, false, NOW)).rejects.toThrow(/connection reset/)
  })

  it('בלי דגלי הדמיה (לפני המיגרציה) לא מסננים לפי is_synthetic', async () => {
    h.flags.syn = false
    const raw = await fetchClassRaw(CLASS, false, NOW)
    expect(raw.sessions.map((s) => s.id)).toContain(ses(3))
  })
})

describe('fetchClassRaw — ראיות ברמת פריט', () => {
  const ans = (n: number, sessionId: string, over: Row = {}): Row => ({
    id: n, session_id: sessionId, student_id: stu(1), scene_id: 'sc', item_index: 0, puzzle_type: 'multipleChoice', selected_position: 1, correct_position: 0,
    displayed_order: ['a', 'b', 'c'], outcome: 'wrong', created_at: '2026-03-02T08:00:05Z', is_synthetic: false, ...over,
  })

  it('תשובות / אירועים נטענים רק להשלמה הראשונה לכל (תלמיד, הדמיה) שיש לה מקצוע', async () => {
    h.db.tables.sessions.push({ id: ses(5), user_id: stu(1), quest_id: quest(1), completed_at: '2026-03-04T08:00:00Z', is_synthetic: false }) /* ריפליי של ses(1) */
    h.db.tables.progress_snapshots.push({ id: 9, session_id: ses(5), student_id: stu(1), class_id: CLASS, subject_id: null, text_level: 8, overall_success: 0.9, taken_at: '2026-03-04T08:00:01Z', is_synthetic: false })
    h.db.tables.answers = [
      ans(1, ses(1)), ans(2, ses(5)), ans(3, ses(2)) /* הדמיה בלי מקצוע */, ans(4, ses(1), { puzzle_type: 'trueFalse' }), ans(5, ses(1), { outcome: 'bogus' }),
      ans(6, ses(1), { puzzle_type: 'tileSwap', outcome: 'gave_up', displayed_order: null }),
    ]
    h.db.tables.events = [
      { id: 1, session_id: ses(1), type: 'scene_enter', scene_id: 'a', payload: { word_count: 30, closed_dwell_ms: 5000 }, is_synthetic: false },
      { id: 2, session_id: ses(5), type: 'scene_enter', scene_id: 'a', payload: { word_count: 30, closed_dwell_ms: 5000 }, is_synthetic: false },
      { id: 3, session_id: ses(1), type: 'scene_enter', scene_id: 'old', payload: { dwellMs: 4000 }, is_synthetic: false },
      { id: 4, session_id: ses(1), type: 'puzzle_solved', scene_id: 'sc', payload: {}, is_synthetic: false },
      { id: 5, session_id: ses(5), type: 'puzzle_solved', scene_id: 'sc', payload: {}, is_synthetic: false },
    ]
    const raw = await fetchClassRaw(CLASS, false, NOW)
    expect(raw.answers.map((a) => `${a.sessionId}|${a.puzzleType}|${a.outcome}`).sort()).toEqual([`${ses(1)}|multipleChoice|wrong`, `${ses(1)}|tileSwap|gave_up`].sort())
    expect(raw.answers.find((a) => a.puzzleType === 'multipleChoice')).toMatchObject({ displayedCount: 3, selectedPosition: 1, correctPosition: 0 })
    expect(raw.sceneEnters).toEqual([{ sessionId: ses(1), sceneId: 'a', wordCount: 30, closedMs: 5000 }]) /* בלי word_count לא נטען; בלי הריפליי */
    expect(raw.puzzleScenes).toEqual([{ sessionId: ses(1), sceneId: 'sc' }])
  })

  it('שלב א\' בלי אירועי קריאה (היום ב-prod) → אין שאילתת אירועי אתגרים בכלל', async () => {
    h.db.tables.events = [{ id: 1, session_id: ses(1), type: 'scene_enter', scene_id: 'old', payload: { dwellMs: 4000 }, is_synthetic: false }, { id: 2, session_id: ses(1), type: 'puzzle_solved', scene_id: 'sc', payload: {}, is_synthetic: false }]
    const raw = await fetchClassRaw(CLASS, false, NOW)
    expect(raw.sceneEnters).toEqual([])
    expect(raw.puzzleScenes).toEqual([])
    expect(h.db.calls.filter((c) => c.table === 'events')).toHaveLength(1)
  })

  it('הפרדת סינתטי בתשובות ובאירועים; טבלת answers חסרה → בלי תשובות ובלי זיכרון', async () => {
    h.db.tables.answers = [ans(1, ses(1)), ans(2, ses(1), { is_synthetic: true, item_index: 1 })]
    expect((await fetchClassRaw(CLASS, false, NOW)).answers).toHaveLength(1)
    resetSchemaProbes()
    expect((await fetchClassRaw(CLASS, true, NOW)).answers).toHaveLength(2)
    resetSchemaProbes()
    h.db.missing.add('answers')
    const raw = await fetchClassRaw(CLASS, true, NOW)
    expect(raw.answers).toEqual([])
    expect(raw.memory).toEqual([])
    expect(raw.detailAvailableFrom).toBeNull()
  })

  it('זיכרון: היפוכים מ-interaction, מספר קלפים מ-game_data; גרסה אישית ← null; interaction חתוך ← בלי היפוכים', async () => {
    const mem = (n: number, over: Row): Row => ({ id: n, session_id: ses(1), student_id: stu(1), quest_id: quest(1), variant_id: null, scene_id: 'm', item_index: 0, puzzle_type: 'memory', outcome: 'correct', selected_position: null, correct_position: null, displayed_order: null, created_at: '2026-03-02T08:00:05Z', is_synthetic: false, interaction: { flips: [{ card: 0, pair: 0, t: 1 }, { card: 1, pair: 0, t: 2 }, { card: 'x', pair: 1, t: 3 }] }, ...over })
    h.db.tables.answers = [mem(1, {}), mem(2, { scene_id: 'm2', variant_id: 'var-1' }), mem(3, { scene_id: 'm3', interaction: { truncated: true } })]
    h.db.tables.quests[0].game_data = { scenes: [{ id: 'm', puzzle: { type: 'memory', pairs: [{}, {}, {}, {}, {}] } }, { id: 'other', puzzle: { type: 'multipleChoice' } }] }
    const raw = await fetchClassRaw(CLASS, false, NOW)
    expect(raw.memory).toHaveLength(3)
    expect(raw.memory.find((g) => g.sceneId === 'm')).toMatchObject({ totalCards: 10, flips: [{ card: 0, pair: 0, t: 1 }, { card: 1, pair: 0, t: 2 }] })
    expect(raw.memory.find((g) => g.sceneId === 'm2')!.totalCards).toBeNull()
    expect(raw.memory.find((g) => g.sceneId === 'm3')!.flips).toEqual([])
  })

  it('התאריך הראשון של תשובות: הכי מוקדם (בלי סינתטי אלא לארגון הדגמה), ומתמסמך', async () => {
    h.db.tables.answers = [ans(1, ses(1), { created_at: '2026-03-02T09:00:00Z' }), ans(2, ses(1), { created_at: '2026-01-05T09:00:00Z', is_synthetic: true, item_index: 1 })]
    expect((await fetchClassRaw(CLASS, false, NOW)).detailAvailableFrom).toBe('2026-03-02T09:00:00Z')
    expect((await fetchClassRaw(CLASS, true, NOW)).detailAvailableFrom).toBe('2026-01-05T09:00:00Z')
    h.db.tables.answers = []
    expect((await fetchClassRaw(CLASS, false, NOW)).detailAvailableFrom).toBe('2026-03-02T09:00:00Z') /* מהמטמון */
  })
})

describe('fetchSchoolClassIds', () => {
  it('כל כיתות בית הספר; פיקטיביות רק לארגון הדגמה', async () => {
    const c2 = id('c1a55e55', 2)
    h.db.tables.classes.push({ id: c2, name: 'ז׳2', school_id: SCHOOL, is_fictitious: true }, { id: id('c1a55e55', 3), name: 'אחר', school_id: id('5c400000', 2), is_fictitious: false })
    expect(await fetchSchoolClassIds(SCHOOL, false)).toEqual([CLASS])
    expect((await fetchSchoolClassIds(SCHOOL, true)).sort()).toEqual([CLASS, c2].sort())
    expect(await fetchSchoolClassIds('nope', true)).toEqual([])
  })

  it('כיתה מושבתת (is_active=false) מוחרגת כשהעמודה קיימת; בלי העמודה — נכללת', async () => {
    const c2 = id('c1a55e55', 2)
    h.db.tables.classes[0].is_active = true
    h.db.tables.classes.push({ id: c2, name: 'ז׳2', school_id: SCHOOL, is_fictitious: false, is_active: false })
    expect(await fetchSchoolClassIds(SCHOOL, false)).toEqual([CLASS])
    resetSchemaProbes()
    h.db.missing.add('classes.is_active')
    delete h.db.tables.classes[0].is_active
    delete h.db.tables.classes[1].is_active
    expect((await fetchSchoolClassIds(SCHOOL, false)).sort()).toEqual([CLASS, c2].sort())
  })
})

describe('fetchCatalogRows', () => {
  it('טבלאות ריקות / עמודת vector חסרה → שורות ריקות (קטלוג ריק)', async () => {
    h.db.tables.concepts = []
    expect((await fetchCatalogRows()).concepts).toEqual([])
    resetSchemaProbes()
    h.db.missing.add('concepts.vector')
    h.db.tables.concepts = [{ id: 'c', key: 'math.x', title_he: 'x', subject_id: 'sub-math', status: 'approved' }]
    expect((await fetchCatalogRows()).concepts).toEqual([])
    resetSchemaProbes()
    h.db.missing.clear()
    h.db.missing.add('concepts')
    expect((await fetchCatalogRows()).concepts).toEqual([])
  })

  it('רק approved; קישורי מושג→צומת (approved), תפיסות וקישור להדמיה', async () => {
    h.db.tables.concepts = [
      { id: 'c1', key: 'math.fractions', title_he: 'שברים', subject_id: 'sub-math', status: 'approved', vector: 'factual' },
      { id: 'c2', key: 'math.draft', title_he: 'טיוטה', subject_id: 'sub-math', status: 'draft', vector: 'factual' },
    ]
    h.db.tables.curriculum_links = [{ entity_type: 'concept', entity_id: 'c1', node_id: 'n1' }, { entity_type: 'objective', entity_id: 'x', node_id: 'n2' }]
    h.db.tables.curriculum_nodes = [{ id: 'n1', title_he: 'שברים בכיתה ו׳', grade_from: 5, grade_to: 6, status: 'approved', source_version: 'v1' }, { id: 'n2', title_he: 'טיוטה', status: 'draft' }]
    h.db.tables.misconceptions = [
      { id: 'm1', code: 'math.a', title_he: 'טעות', description_he: 'תיאור', subject_id: 'sub-math', concept_id: 'c1', status: 'approved' },
      { id: 'm2', code: 'math.b', title_he: 'טיוטה', description_he: null, subject_id: 'sub-math', concept_id: 'c1', status: 'draft' },
    ]
    h.db.tables.misconception_content_links = [{ misconception_id: 'm1', quest_id: quest(1) }]
    h.db.tables.quests[0].title = 'שיעור לדוגמה'
    const rows = await fetchCatalogRows()
    expect(rows.concepts.map((c) => c.id)).toEqual(['c1'])
    expect(rows.conceptLinks).toEqual([{ conceptId: 'c1', nodeId: 'n1' }])
    expect(rows.nodes.map((n) => n.id)).toEqual(['n1'])
    expect(rows.misconceptions.map((m) => m.id)).toEqual(['m1'])
    expect(rows.misconceptionLinks).toEqual([{ misconceptionId: 'm1', questId: quest(1) }])
    expect(rows.questTitles.get(quest(1))).toBe('שיעור לדוגמה')
  })
})
