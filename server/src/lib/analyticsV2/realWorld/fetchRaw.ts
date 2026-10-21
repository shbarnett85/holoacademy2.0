/* ──────────────────────────────────────────────────────────────────────────
   fetchRaw — טעינת הנתונים הגולמיים של כיתה אחת מ-Supabase (**I/O בלבד**, קריאה בלבד). ההרכבה לעולם ב-assemble (טהור).
   · יחידת הטעינה = כיתה אחת (classId + includeSynthetic), בחלון אופק של LIVE_HORIZON_SCHOOL_DAYS ימי לימוד אחורה.
   · דפדוף 1000 עם מיון יציב; מזהים באצוות של 150; הפרדת סינתטי/פיקטיבי בכל שאילתה (הצופה שאינו בארגון הדגמה לא רואה שורות כאלה).
   · בדיקות הסכמה נכשלות סגור (queryUtil.schemaHas + hasSyntheticFlag / hasFictitious / hasIsActive): תקלה זמנית ← 503, לא "אין דגל".
   · ראיות ברמת פריט (אירועי קריאה, תשובות, זיכרון) נטענות רק להשלמה הראשונה לכל (תלמיד, הדמיה) שיש להן מקצוע — אחרת שינון מנפח N.
   · אירועי קריאה: שלב א' טוען רק scene_enter שיש בהם word_count (1B); אירועי האתגרים נטענים רק אם נמצא כזה (היום: אפס ← אפס עלות).
   · הנתונים הכבדים (game_data) נטענים רק להדמיות שיש בהן משחקי זיכרון, לספירת הקלפים.
   · מה שמתמלא רק אחרי נתונים / מיגרציה עתידיים (לא מורצים כאן; הקוד עמיד לחסרונם):
       - סיווג מקצוע להדמיות (quests.subject_id) — בלעדיו כל המשחקים מוחרגים (coverage.unclassifiedSessions).
       - קוד 1B ב-prod (answers, word_count / closed_dwell_ms ב-scene_enter) — הטיית מיקום, זיכרון, התמדה וקריאה.
       - concepts.vector + צינור תיוג ואישור (concepts / misconceptions / option_tags / curriculum_*) — וקטורי תוכן, טעויות נפוצות,
         שיפור במושג, יעדי תוכנית ו-linkedQuest.
       - קנה מידה: session_facts (או progress_snapshots.facts) במקום סריקת events; אינדקסים answers(session_id) ו-option_tags(variant_id).
   ────────────────────────────────────────────────────────────────────────── */
import { isSubjectCode, type SubjectCode } from '../../../../../src/shared/lib/subjects.js'
import { hasFictitious, hasIsActive, hasSyntheticFlag } from '../../activeColumn.js'
import { supabaseAdmin } from '../../supabase.js'
import { questSubjectOut, subjectById } from '../../subjects.js'
import { buildSchoolDays, dayIndexOf } from '../schoolCalendar.js'
import { firstCompletionIds, PERSISTENCE_TYPES, POSITION_BIAS_TYPES } from './assemble.js'
import type { CatalogRows } from './catalog.js'
import { emptyCatalogRows } from './catalog.js'
import { UUID_RE, chunks, inChunks, paged, schemaHas } from './queryUtil.js'
import {
  LIVE_HORIZON_SCHOOL_DAYS, emptyRaw, type AnswerOutcome, type RawAnswer, type RawClassData, type RawMember, type RawMemoryFlip, type RawMemoryGame,
  type RawPuzzleScene, type RawQuest, type RawSceneEnter, type RawSession, type RawSnapshot,
} from './rawTypes.js'

/* ראיות מפורטות נטענות רק לסוגי האתגר שהמנוע צורך (בחירה מרובה · זיכרון · התמדה); trueFalse / דילמה מוסרית אינם נחוצים */
const ANSWER_TYPES: string[] = [...new Set([...POSITION_BIAS_TYPES, ...PERSISTENCE_TYPES])]
const OUTCOMES: ReadonlySet<string> = new Set(['correct', 'wrong', 'timeout', 'gave_up', 'closed'])
const MEMORY_PAIRS_BATCH = 10 /* game_data כבד */
const WINDOW_MARGIN_MS = 36 * 3_600_000 /* יום ישראלי ≠ יום UTC: שוליים בחיתוך החלון */

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}
const asSubject = (code: string | null | undefined): SubjectCode | null => (code && isSubjectCode(code) ? code : null)
async function subjectCodeOfId(id: string | null | undefined): Promise<SubjectCode | null> {
  if (!id) return null
  const row = await subjectById(id, { strict: true }) /* כשל חולף בטבלת המקצועות ← 503, לא "אין מקצוע" שנשמר במטמון הניתוח */
  return asSubject(row?.code)
}

/* ══════════════════════════════════════════════════════════════════════════
   התאריך הראשון שבו נלכדו תשובות (פירוט תשובות זמין ממנו). מטמון: 10 דקות; "אין עדיין" — 30 שניות
   ══════════════════════════════════════════════════════════════════════════ */
const detailCache = new Map<boolean, { value: string | null; at: number }>()
export function resetDetailCache(): void { detailCache.clear() }
async function detailAvailableFrom(includeSynthetic: boolean, excludeSyn: boolean): Promise<string | null> {
  if (!(await schemaHas('answers'))) return null
  const hit = detailCache.get(includeSynthetic)
  if (hit && Date.now() - hit.at < (hit.value !== null ? 600_000 : 30_000)) return hit.value
  let q = supabaseAdmin.from('answers').select('created_at').order('created_at', { ascending: true }).limit(1)
  if (excludeSyn) q = q.eq('is_synthetic', false)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  const value = ((data ?? [])[0] as { created_at?: string } | undefined)?.created_at ?? null
  detailCache.set(includeSynthetic, { value, at: Date.now() })
  return value
}

/* ══════════════════════════════════════════════════════════════════════════
   כיתה אחת
   ══════════════════════════════════════════════════════════════════════════ */
type MemberUser = { id: string; name: string; role: string; is_active?: boolean; is_fictitious?: boolean }
type MemberRow = { class_id: string; users: MemberUser | MemberUser[] | null }

export async function fetchClassRaw(classId: string, includeSynthetic: boolean, now: Date = new Date()): Promise<RawClassData> {
  const out = emptyRaw(includeSynthetic)
  if (!UUID_RE.test(classId)) return out

  const [withSyn, withFict, withActive] = await Promise.all([hasSyntheticFlag(), hasFictitious(), hasIsActive('users')])
  const excludeSyn = !includeSynthetic && withSyn
  const hideFict = !includeSynthetic && withFict

  /* ── הכיתה ── */
  const [withLevel, withLabel] = await Promise.all([schemaHas('classes', 'grade_level'), schemaHas('classes', 'grade_label')])
  const classCols = ['id', 'name', 'school_id', ...(withLevel ? ['grade_level'] : []), ...(withLabel ? ['grade_label'] : []), ...(withFict ? ['is_fictitious'] : [])]
  const { data: clsData, error: clsErr } = await supabaseAdmin.from('classes').select(classCols.join(', ')).eq('id', classId).maybeSingle()
  if (clsErr) throw new Error(clsErr.message)
  const c = clsData as unknown as Record<string, unknown> | null
  if (!c || (hideFict && c.is_fictitious === true)) return out
  out.cls = {
    id: c.id as string, name: (c.name as string | null) ?? null, gradeLabel: (c.grade_label as string | null | undefined) ?? null,
    gradeLevel: num(c.grade_level), schoolId: (c.school_id as string | null) ?? null,
  }

  /* ── בית הספר · חברי הכיתה · מקצועות הכיתה (במקביל) ── */
  const userCols = ['id', 'name', 'role', ...(withActive ? ['is_active'] : []), ...(withFict ? ['is_fictitious'] : [])].join(', ')
  const [schoolRes, memberRows, ctSubjects, detailFrom] = await Promise.all([
    out.cls.schoolId
      ? supabaseAdmin.from('schools').select('id, name').eq('id', out.cls.schoolId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    paged<MemberRow>((f, t) => supabaseAdmin.from('class_members').select(`class_id, users(${userCols})`).eq('class_id', classId).order('user_id').range(f, t)),
    (async (): Promise<SubjectCode[]> => {
      if (!(await schemaHas('class_teachers', 'subject_id'))) return []
      const rows = await paged<{ subject_id: string | null }>((f, t) => supabaseAdmin.from('class_teachers').select('subject_id').eq('class_id', classId).not('subject_id', 'is', null).order('id').range(f, t))
      const codes: SubjectCode[] = []
      for (const id of new Set(rows.map((r) => r.subject_id).filter((x): x is string => !!x))) {
        const code = await subjectCodeOfId(id)
        if (code) codes.push(code)
      }
      return codes
    })(),
    detailAvailableFrom(includeSynthetic, excludeSyn),
  ])
  if (schoolRes.error) throw new Error(schoolRes.error.message)
  const school = schoolRes.data as { id: string; name: string } | null
  out.school = school ? { id: school.id, name: school.name ?? '' } : null
  out.classSubjects = ctSubjects
  out.detailAvailableFrom = detailFrom

  const students: { id: string; name: string }[] = []
  for (const r of memberRows) {
    const u = Array.isArray(r.users) ? r.users[0] : r.users
    if (!u || u.role !== 'student' || u.is_active === false) continue
    if (u.is_fictitious === true && hideFict) continue
    students.push({ id: u.id, name: u.name })
  }
  const memberIds = [...new Set(students.map((s) => s.id))]
  if (memberIds.length === 0) return out

  /* ── חברויות בכיתות נוספות (לכיתה העיקרית של תלמיד בכמה כיתות) ── */
  const memberships = await inChunks(memberIds, (part) =>
    paged<{ user_id: string; class_id: string }>((f, t) => supabaseAdmin.from('class_members').select('user_id, class_id').in('user_id', part).order('user_id').order('class_id').range(f, t)))
  const classesOf = new Map<string, Set<string>>()
  for (const m of memberships) classesOf.set(m.user_id, (classesOf.get(m.user_id) ?? new Set<string>()).add(m.class_id))
  const memberList: RawMember[] = students.map((s) => ({ id: s.id, name: s.name, classIds: [...new Set([...(classesOf.get(s.id) ?? []), classId])].sort() }))
  out.members = memberList

  /* ── חלון הנתונים ── */
  const days = buildSchoolDays(now, LIVE_HORIZON_SCHOOL_DAYS, 0)
  const cutoff = new Date(Date.parse(days[days.length - 1]) - WINDOW_MARGIN_MS).toISOString()

  /* ── סשנים שהושלמו ── */
  const sessionRows = await inChunks(memberIds, (part) =>
    paged<{ id: string; user_id: string; quest_id: string; completed_at: string }>((f, t) => {
      let q = supabaseAdmin.from('sessions').select('id, user_id, quest_id, completed_at').in('user_id', part).gte('completed_at', cutoff)
      if (excludeSyn) q = q.eq('is_synthetic', false)
      return q.order('completed_at').order('id').range(f, t)
    }))
  const sessions: RawSession[] = sessionRows
    .filter((s) => s.completed_at && s.quest_id)
    .map((s) => ({ id: s.id, studentId: s.user_id, questId: s.quest_id, completedAt: s.completed_at }))
  out.sessions = sessions
  if (sessions.length === 0) return out

  /* ── מקצוע ההדמיה ── */
  const withQuestId = await schemaHas('quests', 'subject_id')
  const withQuestText = await schemaHas('quests', 'subject')
  const questCols = ['id', ...(withQuestId ? ['subject_id'] : []), ...(withQuestText ? ['subject'] : [])].join(', ')
  const questRows = await inChunks(sessions.map((s) => s.questId), async (part) => {
    const { data, error } = await supabaseAdmin.from('quests').select(questCols).in('id', part)
    if (error) throw new Error(error.message)
    return (data ?? []) as unknown as { id: string; subject_id?: string | null; subject?: string | null }[]
  })
  const quests: RawQuest[] = []
  for (const q of questRows) {
    const s = await questSubjectOut({ subject: withQuestId ? undefined : q.subject, subject_id: withQuestId ? (q.subject_id ?? null) : undefined }, { strict: true })
    quests.push({ id: q.id, subject: asSubject(s.subjectCode) })
  }
  out.quests = quests

  /* ── progress_snapshots: הרמה אחרי הכיול וההצלחה של כל סשן שנספר ── */
  const snapshots: RawSnapshot[] = []
  if (await schemaHas('progress_snapshots')) {
    const withSnapSubject = await schemaHas('progress_snapshots', 'subject_id')
    const snapCols = ['session_id', 'student_id', 'class_id', 'text_level', 'overall_success', ...(withSnapSubject ? ['subject_id'] : [])].join(', ')
    const mine = new Set(sessions.map((s) => s.id))
    const rows = await inChunks(memberIds, (part) =>
      paged<Record<string, unknown>>((f, t) => {
        let q = supabaseAdmin.from('progress_snapshots').select(snapCols).in('student_id', part).gte('taken_at', cutoff).not('session_id', 'is', null)
        if (excludeSyn) q = q.eq('is_synthetic', false)
        return q.order('taken_at').order('id').range(f, t)
      }))
    for (const r of rows) {
      const sid = r.session_id as string
      if (!mine.has(sid)) continue
      snapshots.push({
        sessionId: sid, studentId: r.student_id as string, classId: (r.class_id as string | null) ?? null,
        subject: await subjectCodeOfId(r.subject_id as string | null | undefined), level: num(r.text_level), success: num(r.overall_success),
      })
    }
  }
  out.snapshots = snapshots

  /* ── ראיות ברמת פריט: רק ההשלמה הראשונה לכל (תלמיד, הדמיה) שיש לה מקצוע ── */
  const subjectOfQuest = new Map(quests.map((q) => [q.id, q.subject]))
  const snapSubject = new Map(snapshots.map((s) => [s.sessionId, s.subject]))
  const inHorizon = sessions.filter((s) => dayIndexOf(days, s.completedAt) !== null)
  const sessionById = new Map(sessions.map((s) => [s.id, s]))
  const evidenceIds = new Set([...firstCompletionIds(inHorizon)].filter((id) => (subjectOfQuest.get(sessionById.get(id)!.questId) ?? snapSubject.get(id) ?? null) !== null))
  if (evidenceIds.size === 0) return out
  const evidenceList = [...evidenceIds]

  /* אירועי קריאה (1B): scene_enter עם word_count; אירועי האתגרים רק אם נמצאו */
  out.sceneEnters = await fetchSceneEnters(evidenceList, excludeSyn)
  if (out.sceneEnters.length > 0) out.puzzleScenes = await fetchPuzzleScenes([...new Set(out.sceneEnters.map((e) => e.sessionId))], excludeSyn)

  /* תשובות (1B) */
  if (await schemaHas('answers')) {
    const answerRows = await inChunks(memberIds, (part) =>
      paged<Record<string, unknown>>((f, t) => {
        let q = supabaseAdmin.from('answers')
          .select('session_id, scene_id, item_index, puzzle_type, selected_position, correct_position, displayed_order, outcome')
          .in('student_id', part).gte('created_at', cutoff).in('puzzle_type', ANSWER_TYPES)
        if (excludeSyn) q = q.eq('is_synthetic', false)
        return q.order('created_at').order('id').range(f, t)
      }))
    out.answers = answerRows.filter((r) => evidenceIds.has(r.session_id as string) && OUTCOMES.has(r.outcome as string)).map(toRawAnswer)

    const memoryRows = await inChunks(memberIds, (part) =>
      paged<Record<string, unknown>>((f, t) => {
        let q = supabaseAdmin.from('answers')
          .select('session_id, quest_id, variant_id, scene_id, item_index, interaction')
          .in('student_id', part).gte('created_at', cutoff).eq('puzzle_type', 'memory')
        if (excludeSyn) q = q.eq('is_synthetic', false)
        return q.order('created_at').order('id').range(f, t)
      }))
    const mine = memoryRows.filter((r) => evidenceIds.has(r.session_id as string))
    const cardCounts = await memoryCardCounts([...new Set(mine.filter((r) => !r.variant_id).map((r) => r.quest_id as string))])
    out.memory = mine.map((r): RawMemoryGame => ({
      sessionId: r.session_id as string, sceneId: r.scene_id as string, itemIndex: Number(r.item_index) || 0,
      flips: flipsOf(r.interaction),
      totalCards: r.variant_id ? null : (cardCounts.get(`${r.quest_id as string}|${r.scene_id as string}`) ?? null),
    }))
  }
  return out
}

function toRawAnswer(r: Record<string, unknown>): RawAnswer {
  const order = r.displayed_order
  return {
    sessionId: r.session_id as string, sceneId: r.scene_id as string, itemIndex: Number(r.item_index) || 0, puzzleType: r.puzzle_type as string,
    selectedPosition: num(r.selected_position), correctPosition: num(r.correct_position),
    displayedCount: Array.isArray(order) ? order.length : null, outcome: r.outcome as AnswerOutcome,
  }
}

/* interaction.flips: [{card, pair, t}] (נחתך בכתיבה ל-200 ראשונים; truncated בלי flips ← ריק) */
function flipsOf(interaction: unknown): RawMemoryFlip[] {
  const flips = (interaction as { flips?: unknown } | null)?.flips
  if (!Array.isArray(flips)) return []
  const out: RawMemoryFlip[] = []
  for (const f of flips as Record<string, unknown>[]) {
    const card = num(f?.card), pair = num(f?.pair), t = num(f?.t)
    if (card !== null && pair !== null && t !== null) out.push({ card, pair, t })
  }
  return out
}

async function fetchSceneEnters(sessionIds: string[], excludeSyn: boolean): Promise<RawSceneEnter[]> {
  const rows = await inChunks(sessionIds, (part) =>
    paged<{ session_id: string; scene_id: string | null; payload: Record<string, unknown> | null }>((f, t) => {
      let q = supabaseAdmin.from('events').select('session_id, scene_id, payload').in('session_id', part).eq('type', 'scene_enter').not('payload->>word_count', 'is', null)
      if (excludeSyn) q = q.eq('is_synthetic', false)
      return q.order('id').range(f, t)
    }))
  return rows.map((r) => ({ sessionId: r.session_id, sceneId: r.scene_id, wordCount: num(r.payload?.word_count), closedMs: num(r.payload?.closed_dwell_ms) }))
}

async function fetchPuzzleScenes(sessionIds: string[], excludeSyn: boolean): Promise<RawPuzzleScene[]> {
  const rows = await inChunks(sessionIds, (part) =>
    paged<{ session_id: string; scene_id: string | null }>((f, t) => {
      let q = supabaseAdmin.from('events').select('session_id, scene_id').in('session_id', part).in('type', ['puzzle_solved', 'puzzle_failed'])
      if (excludeSyn) q = q.eq('is_synthetic', false)
      return q.order('id').range(f, t)
    }))
  return rows.filter((r) => !!r.scene_id).map((r) => ({ sessionId: r.session_id, sceneId: r.scene_id as string }))
}

/* מספר הקלפים בכל סצנת זיכרון של ההדמיה (2 × זוגות), ממפתח `${questId}|${sceneId}` */
async function memoryCardCounts(questIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  await Promise.all(chunks(questIds, MEMORY_PAIRS_BATCH).map(async (part) => {
    const { data, error } = await supabaseAdmin.from('quests').select('id, game_data').in('id', part)
    if (error) throw new Error(error.message)
    for (const q of (data ?? []) as { id: string; game_data: unknown }[]) {
      const scenes = ((q.game_data as { scenes?: { id?: string; puzzle?: { type?: string; pairs?: unknown[] } }[] } | null)?.scenes ?? [])
      for (const s of scenes) {
        if (s.id && s.puzzle?.type === 'memory' && Array.isArray(s.puzzle.pairs) && s.puzzle.pairs.length > 0) out.set(`${q.id}|${s.id}`, s.puzzle.pairs.length * 2)
      }
    }
  }))
  return out
}

/* ══════════════════════════════════════════════════════════════════════════
   כיתות בית הספר (למנהל)
   ══════════════════════════════════════════════════════════════════════════ */
export async function fetchSchoolClassIds(schoolId: string, includeSynthetic: boolean): Promise<string[]> {
  if (!UUID_RE.test(schoolId)) return []
  const [withFict, withActive] = await Promise.all([hasFictitious(), schemaHas('classes', 'is_active')])
  const hideFict = !includeSynthetic && withFict
  const cols = ['id', ...(withFict ? ['is_fictitious'] : []), ...(withActive ? ['is_active'] : [])].join(', ')
  const rows = await paged<{ id: string; is_fictitious?: boolean; is_active?: boolean }>((f, t) =>
    supabaseAdmin.from('classes').select(cols).eq('school_id', schoolId).order('id').range(f, t))
  /* כיתה מושבתת אינה חלק מהתמונה של בית הספר */
  return rows.filter((r) => !(hideFict && r.is_fictitious === true) && r.is_active !== false).map((r) => r.id)
}

/* ══════════════════════════════════════════════════════════════════════════
   קטלוג מאושר (מושגים · טעויות נפוצות · צמתי תוכנית לימודים). טבלאות ריקות / חסרות ← שורות ריקות.
   ══════════════════════════════════════════════════════════════════════════ */
export async function fetchCatalogRows(): Promise<CatalogRows> {
  const rows = emptyCatalogRows()
  /* בלי העמודה concepts.vector אין מושג שאפשר למקם בווקטור תוכן ← אין קטלוג (ותפיסות תלויות במושג) */
  if (!(await schemaHas('concepts', 'id')) || !(await schemaHas('concepts', 'vector'))) return rows

  const conceptRows = await paged<Record<string, unknown>>((f, t) =>
    supabaseAdmin.from('concepts').select('id, key, title_he, subject_id, status, vector').eq('status', 'approved').order('id').range(f, t))
  for (const r of conceptRows) {
    rows.concepts.push({
      id: r.id as string, key: r.key as string, titleHe: r.title_he as string, subject: await subjectCodeOfId(r.subject_id as string | null),
      vector: (r.vector as string | null) ?? null, status: r.status as string,
    })
  }
  if (rows.concepts.length === 0) return rows
  const conceptIds = rows.concepts.map((c) => c.id)

  if (await schemaHas('curriculum_links', 'node_id')) {
    const links = await inChunks(conceptIds, (part) =>
      paged<{ entity_id: string; node_id: string }>((f, t) =>
        supabaseAdmin.from('curriculum_links').select('entity_id, node_id').eq('entity_type', 'concept').in('entity_id', part).order('entity_id').order('node_id').range(f, t)))
    rows.conceptLinks = links.map((l) => ({ conceptId: l.entity_id, nodeId: l.node_id }))
    if (await schemaHas('curriculum_nodes', 'id')) {
      const nodes = await inChunks(rows.conceptLinks.map((l) => l.nodeId), async (part) => {
        const { data, error } = await supabaseAdmin.from('curriculum_nodes').select('id, title_he, grade_from, grade_to, status, source_version').in('id', part).eq('status', 'approved')
        if (error) throw new Error(error.message)
        return (data ?? []) as { id: string; title_he: string; grade_from: number | null; grade_to: number | null; status: string; source_version: string | null }[]
      })
      rows.nodes = nodes.map((n) => ({ id: n.id, titleHe: n.title_he, gradeFrom: num(n.grade_from), gradeTo: num(n.grade_to), status: n.status, sourceVersion: n.source_version ?? null }))
    }
  }

  if (await schemaHas('misconceptions', 'id')) {
    const ms = await inChunks(conceptIds, (part) =>
      paged<Record<string, unknown>>((f, t) =>
        supabaseAdmin.from('misconceptions').select('id, code, title_he, description_he, subject_id, concept_id, status').eq('status', 'approved').in('concept_id', part).order('id').range(f, t)))
    for (const m of ms) {
      rows.misconceptions.push({
        id: m.id as string, code: m.code as string, titleHe: m.title_he as string, descriptionHe: (m.description_he as string | null) ?? null,
        subject: await subjectCodeOfId(m.subject_id as string | null), conceptId: (m.concept_id as string | null) ?? null, status: m.status as string,
      })
    }
    if (rows.misconceptions.length > 0 && (await schemaHas('misconception_content_links', 'quest_id'))) {
      const links = await inChunks(rows.misconceptions.map((m) => m.id), (part) =>
        paged<{ misconception_id: string; quest_id: string }>((f, t) =>
          supabaseAdmin.from('misconception_content_links').select('misconception_id, quest_id').in('misconception_id', part).order('misconception_id').order('quest_id').range(f, t)))
      rows.misconceptionLinks = links.map((l) => ({ misconceptionId: l.misconception_id, questId: l.quest_id }))
      const titles = await inChunks(rows.misconceptionLinks.map((l) => l.questId), async (part) => {
        const { data, error } = await supabaseAdmin.from('quests').select('id, title').in('id', part)
        if (error) throw new Error(error.message)
        return (data ?? []) as { id: string; title: string }[]
      })
      rows.questTitles = new Map(titles.map((q) => [q.id, q.title]))
    }
  }
  return rows
}

