/* ──────────────────────────────────────────────────────────────────────────
   realResults — ספק "תוצאות" אמיתי (Supabase). חוזה: src/shared/types/resultsV1.ts. ליבה: results/core.ts.
   · שליחה = שורת assignments (הדמיה × כיתה × תאריך). הצופה נגזר מ-loadViewer(req); ההרשאה נאכפת ב-authz.submissionVisible
     (השולח/היוצר בכיתה שלו, מחנך הכיתה, מורה המקצוע; מנהלים — אין תוצאות; מנהל-על — הכול).
   · שאילתות באצוות (בלי N+1 לפי תלמיד): חלוקת מזהים ל-≤150, ודפדוף 1000 שורות (תקרת PostgREST) לכל קריאה גדולה.
   · נתונים סינתטיים/פיקטיביים נראים רק לצופה בארגון הדגמה (viewer.seesSynthetic).
   · שליחה שקיימת אך אינה גלויה לצופה מחזירה אותו 404 כמו שליחה שאינה קיימת (אין "אורקל קיום"); 403 רק על תפקיד שאין לו תוצאות בכלל (מנהלים).
   · יומן גישה: מסך הדמיה רושם שורה לכל תלמיד ברשימת הכיתה (scope results_class), מסך תלמיד — שורה לתלמיד (results), הרשימה — שורה אחת
     בלי תלמיד (results_list). למנהל-על קריאת נתוני תלמיד נכשלת סגור אם אי אפשר לכתוב ליומן (authz.logAccessMany).
   · גרסאות אישיות (quest_variants): נטענות לפי answers.variant_id ומועברות לליבה; תגיות הגרסה נשארות נפרדות מתגיות הבסיס.
   · כל טקסט למשתמש נבנה ב-findingsNarrative; הקובץ הזה אינו מכיל משפטים (פרט להודעת 403 לתפקיד ללא תוצאות).
   ────────────────────────────────────────────────────────────────────────── */
import type { Request } from 'express'
import type { ClassSubmissionView, ResultsSubject, StudentSubmissionView, SubmissionList, SubmissionRow } from '../../../../src/shared/types/resultsV1.js'
import { ERR_NOT_FOUND, ERR_REVIEW_WRONG_QUEST } from '../../../../src/shared/lib/findingsNarrative.js'
import { SUBJECTS } from '../../../../src/shared/lib/subjects.js'
import { AppError } from '../../middleware/errors.js'
import { supabaseAdmin } from '../supabase.js'
import {
  hasAnswersTable, hasFictitious, hasIsActive, hasMisconceptionLinks, hasMisconceptions, hasMoralChoices, hasOptionTags,
  hasQuestSubject, hasQuestSubjectId, hasQuestVariants, hasSyntheticFlag,
} from '../activeColumn.js'
import { loadViewer, logAccess, logAccessMany, submissionVisible, canUseResults, type Viewer } from '../authz.js'
import { questSubjectOut } from '../subjects.js'
import {
  buildClassView, buildListRow, buildReviewBasis, buildStudentView, preferSession, questThumbUrl, subjectOfCode,
  type CoreAnswerRow, type CoreEventRow, type CoreInput, type CoreMoralRow, type CoreOptionTag, type CoreSession, type CoreStudent, type CoreVariant,
  type ReviewConcept,
} from './core.js'
import type { ResultsListQuery, ResultsProvider } from './provider.js'

/* מנהל / מנהל עירוני: אין תוצאות ברמת תלמיד (חוק 8) — התמונה המצטברת שלהם באנליטיקה */
export const MSG_RESULTS_NOT_FOR_ROLE = 'תוצאות ברמת תלמיד אינן זמינות לתפקיד זה — התמונה הכללית נמצאת באנליטיקה.'

const CHUNK = 150
const PAGE = 1000
const LIST_LIMIT = 60
/* תקרת סריקת השליחות ברשימה: נסרקות רק ה-300 החדשות ביותר (בכל התפקידים), כדי שמורה עם אלפי שליחות לא יטען הכול בכל כניסה.
   חיתוך (או יותר שליחות מכפי שמוצג) מדווח ב-SubmissionList.truncated. */
export const ASSIGNMENT_SCAN_CAP = 300

/* ══════════════════════════════════════════════════════════════════════════
   עזרי שאילתה
   ══════════════════════════════════════════════════════════════════════════ */
type PageResult = { data: unknown; error: { message: string } | null }

function chunks<T>(arr: T[], n = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

/* PostgREST מחזיר לכל היותר 1000 שורות — מדפדפים עד שנגמרות (השאילתה חייבת מיון יציב) */
async function paged<T>(build: (from: number, to: number) => PromiseLike<PageResult>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

async function inChunks<T>(ids: string[], run: (part: string[]) => Promise<T[]>): Promise<T[]> {
  const uniq = [...new Set(ids)]
  if (uniq.length === 0) return []
  return (await Promise.all(chunks(uniq).map(run))).flat()
}

/* ══════════════════════════════════════════════════════════════════════════
   שליחות (assignments) + הרשאה
   ══════════════════════════════════════════════════════════════════════════ */
interface AsgRow { id: string; quest_id: string; class_id: string; user_id?: string | null; created_at: string }
interface QuestLite { id: string; title: string; created_by: string | null; subject_id: string | null; subject: ResultsSubject | null }
interface ClassLite { id: string; label: string; fictitious: boolean }

interface Lite {
  asg: AsgRow
  quest: QuestLite
  cls: ClassLite
  visible: boolean
  source: SubmissionRow['source']
  senderName: string | null
}

async function questLites(ids: string[]): Promise<Map<string, QuestLite>> {
  const map = new Map<string, QuestLite>()
  const withId = await hasQuestSubjectId()
  const withText = await hasQuestSubject()
  const cols = 'id, title, created_by' + (withId ? ', subject_id' : '') + (withText ? ', subject' : '')
  const rows = await inChunks<Record<string, unknown>>(ids, async (part) => {
    const { data, error } = await supabaseAdmin.from('quests').select(cols).in('id', part)
    if (error) throw new Error(error.message)
    return (data ?? []) as unknown as Record<string, unknown>[]
  })
  for (const r of rows) {
    const out = await questSubjectOut({ subject: withId ? undefined : (r.subject as string | null | undefined), subject_id: withId ? ((r.subject_id as string | null | undefined) ?? null) : undefined })
    map.set(r.id as string, {
      id: r.id as string, title: (r.title as string) ?? '', created_by: (r.created_by as string | null) ?? null,
      subject_id: withId ? ((r.subject_id as string | null | undefined) ?? null) : null,
      subject: subjectOfCode(out.subjectCode),
    })
  }
  return map
}

async function classLites(ids: string[]): Promise<Map<string, ClassLite>> {
  const map = new Map<string, ClassLite>()
  const rows = await inChunks<Record<string, unknown>>(ids, async (part) => {
    const { data, error } = await supabaseAdmin.from('classes').select('*').in('id', part)
    if (error) throw new Error(error.message)
    return (data ?? []) as Record<string, unknown>[]
  })
  for (const r of rows) {
    map.set(r.id as string, {
      id: r.id as string,
      label: (r.grade_label as string | null) || (r.name as string | null) || '',
      fictitious: r.is_fictitious === true,
    })
  }
  return map
}

async function userNames(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const rows = await inChunks<{ id: string; name: string }>(ids, async (part) => {
    const { data, error } = await supabaseAdmin.from('users').select('id, name').in('id', part)
    if (error) throw new Error(error.message)
    return (data ?? []) as { id: string; name: string }[]
  })
  for (const r of rows) map.set(r.id, r.name)
  return map
}

async function needViewer(req: Request): Promise<Viewer> {
  const viewer = await loadViewer(req)
  if (!canUseResults(viewer)) throw new AppError(403, MSG_RESULTS_NOT_FOR_ROLE)
  return viewer
}

/* מחבר שורות assignments לטיפוס Lite (כולל החלטת ההרשאה). שליחות בלי הדמיה/כיתה — נשמטות. */
async function toLites(viewer: Viewer, asgs: AsgRow[]): Promise<Lite[]> {
  if (asgs.length === 0) return []
  const [quests, classes] = await Promise.all([
    questLites(asgs.map((a) => a.quest_id)),
    classLites(asgs.map((a) => a.class_id)),
  ])
  const names = await userNames(asgs.flatMap((a) => [a.user_id ?? '', quests.get(a.quest_id)?.created_by ?? '']).filter(Boolean))
  const hideFictitious = !viewer.seesSynthetic && (await hasFictitious())
  const out: Lite[] = []
  for (const asg of asgs) {
    const quest = quests.get(asg.quest_id)
    const cls = classes.get(asg.class_id)
    if (!quest || !cls) continue
    if (hideFictitious && cls.fictitious) continue
    const visible = submissionVisible(viewer, asg.class_id, { subject_id: quest.subject_id, created_by: quest.created_by }, asg.user_id ?? null)
    const senderId = asg.user_id ?? quest.created_by
    const grant = viewer.grants.get(asg.class_id)
    const source: SubmissionRow['source'] = senderId === viewer.userId ? 'mine' : grant?.homeroom ? 'homeroom' : 'subject'
    out.push({ asg, quest, cls, visible, source, senderName: source === 'mine' || !senderId ? null : (names.get(senderId) ?? null) })
  }
  return out
}

/* ══════════════════════════════════════════════════════════════════════════
   טעינת הנתונים הגולמיים לליבה
   ══════════════════════════════════════════════════════════════════════════ */
interface Bundle {
  games: Map<string, unknown>
  studentsByClass: Map<string, CoreStudent[]>
  /* `${questId}|${studentId}` → ההרצה שנספרת (האחרונה שהושלמה; אחרת הפתוחה האחרונה) */
  latest: Map<string, CoreSession>
  eventsBySession: Map<string, CoreEventRow[]>
  answersBySession: Map<string, CoreAnswerRow[]>
  /* תגיות הבסיס לפי הדמיה (לא כולל תגיות גרסאות אישיות) */
  tags: Map<string, CoreOptionTag[]>
  /* גרסאות אישיות ששוחקו, לפי מזהה הגרסה (מסך מפורט בלבד) */
  variants: Map<string, CoreVariant>
  moralRaw: { sceneId: string; optionId: string; classId: string; createdAt: string; questId: string; variantId: string | null }[]
  detailFrom: string | null
}

const detailCache = new Map<boolean, { value: string | null; at: number }>()
/* התאריך הראשון שבו נלכדו תשובות (בלי נתונים סינתטיים אלא אם הצופה בארגון הדגמה). מטמון: 10 דקות; "אין עדיין" — 30 שניות */
async function detailAvailableFrom(includeSynthetic: boolean): Promise<string | null> {
  if (!(await hasAnswersTable())) return null
  const hit = detailCache.get(includeSynthetic)
  if (hit && Date.now() - hit.at < (hit.value !== null ? 600_000 : 30_000)) return hit.value
  let q = supabaseAdmin.from('answers').select('created_at').order('created_at', { ascending: true }).limit(1)
  if (!includeSynthetic && (await hasSyntheticFlag())) q = q.eq('is_synthetic', false)
  const { data } = await q
  const value = ((data ?? [])[0] as { created_at?: string } | undefined)?.created_at ?? null
  detailCache.set(includeSynthetic, { value, at: Date.now() })
  return value
}

type RosterUser = { id: string; name: string; role: string; is_active?: boolean; is_fictitious?: boolean }
type RosterRow = { class_id: string; users: RosterUser | RosterUser[] | null }

async function rosterSelect(): Promise<string> {
  const withActive = await hasIsActive('users')
  const withFict = await hasFictitious()
  const cols = ['id', 'name', 'role', ...(withActive ? ['is_active'] : []), ...(withFict ? ['is_fictitious'] : [])]
  return `class_id, users(${cols.join(', ')})`
}

/* מי נחשב תלמיד ברשימת כיתה לצופה: תלמיד פעיל; פיקטיבי רק בארגון הדגמה. מקור יחיד לרשימה המלאה ולבדיקת החברות של תלמיד בודד */
function rosterStudent(viewer: Viewer, r: RosterRow): CoreStudent | null {
  const u = Array.isArray(r.users) ? r.users[0] : r.users
  if (!u || u.role !== 'student' || u.is_active === false) return null
  if (u.is_fictitious === true && !viewer.seesSynthetic) return null
  return { id: u.id, name: u.name }
}

async function loadStudents(viewer: Viewer, classIds: string[]): Promise<Map<string, CoreStudent[]>> {
  const sel = await rosterSelect()
  const rows = (await Promise.all(chunks([...new Set(classIds)]).map((part) =>
    paged<RosterRow>((f, t) => supabaseAdmin.from('class_members').select(sel).in('class_id', part).order('class_id').order('user_id').range(f, t)),
  ))).flat()
  const map = new Map<string, CoreStudent[]>()
  for (const r of rows) {
    const stu = rosterStudent(viewer, r)
    if (!stu) continue
    const list = map.get(r.class_id) ?? []
    list.push(stu)
    map.set(r.class_id, list)
  }
  return map
}

/* האם התלמיד/ה ברשימת הכיתה — שאילתה אחת זולה (שורה בודדת), לפני שטוענים את כל נתוני הכיתה */
async function studentInRoster(viewer: Viewer, classId: string, studentId: string): Promise<boolean> {
  if (!UUID_RE.test(studentId)) return false
  const sel = await rosterSelect()
  const { data, error } = await supabaseAdmin.from('class_members').select(sel).eq('class_id', classId).eq('user_id', studentId).limit(1)
  if (error) throw new Error(error.message)
  const row = ((data ?? []) as unknown as RosterRow[])[0]
  return !!row && rosterStudent(viewer, row) !== null
}

async function loadLatestSessions(viewer: Viewer, questIds: string[], studentIds: string[]): Promise<Map<string, CoreSession>> {
  const excludeSyn = !viewer.seesSynthetic && (await hasSyntheticFlag())
  const qids = [...new Set(questIds)]
  type S = { id: string; user_id: string; quest_id: string; started_at: string | null; completed_at: string | null }
  const rows = (await Promise.all(chunks([...new Set(studentIds)]).map((part) =>
    paged<S>((f, t) => {
      let q = supabaseAdmin.from('sessions').select('id, user_id, quest_id, started_at, completed_at').in('quest_id', qids).in('user_id', part)
      if (excludeSyn) q = q.eq('is_synthetic', false)
      return q.order('started_at', { ascending: false }).order('id').range(f, t)
    }),
  ))).flat()
  const map = new Map<string, CoreSession>()
  for (const s of rows) {
    const key = `${s.quest_id}|${s.user_id}`
    const cand: CoreSession = { id: s.id, studentId: s.user_id, startedAt: s.started_at, completedAt: s.completed_at }
    const cur = map.get(key)
    /* ההרצה האחרונה שהושלמה גוברת על session פתוח חדש (preferSession — אותו כלל כמו בליבה) */
    map.set(key, cur ? preferSession(cur, cand) : cand)
  }
  return map
}

async function loadEvents(sessionIds: string[], withSlides: boolean): Promise<Map<string, CoreEventRow[]>> {
  const types = withSlides ? ['puzzle_solved', 'puzzle_failed', 'scene_enter'] : ['puzzle_solved', 'puzzle_failed']
  type E = { session_id: string; type: CoreEventRow['type']; scene_id: string | null; payload: Record<string, unknown> | null }
  const rows = (await Promise.all(chunks([...new Set(sessionIds)]).map((part) =>
    paged<E>((f, t) => supabaseAdmin.from('events').select('session_id, type, scene_id, payload').in('session_id', part).in('type', types).order('id').range(f, t)),
  ))).flat()
  const map = new Map<string, CoreEventRow[]>()
  for (const e of rows) {
    const list = map.get(e.session_id) ?? []
    list.push({ sessionId: e.session_id, type: e.type, sceneId: e.scene_id, payload: e.payload ?? {} })
    map.set(e.session_id, list)
  }
  return map
}

async function loadAnswers(sessionIds: string[]): Promise<Map<string, CoreAnswerRow[]>> {
  const map = new Map<string, CoreAnswerRow[]>()
  if (sessionIds.length === 0 || !(await hasAnswersTable())) return map
  type A = {
    session_id: string; client_event_id: string | null; scene_id: string; item_index: number; puzzle_type: string
    selected_option_id: string | null; is_correct: boolean; attempt_no: number; response_ms: number | null; outcome: CoreAnswerRow['outcome']
    variant_id: string | null
  }
  const rows = (await Promise.all(chunks([...new Set(sessionIds)]).map((part) =>
    paged<A>((f, t) => supabaseAdmin.from('answers')
      .select('session_id, client_event_id, scene_id, item_index, puzzle_type, selected_option_id, is_correct, attempt_no, response_ms, outcome, variant_id')
      .in('session_id', part).order('id').range(f, t)),
  ))).flat()
  for (const a of rows) {
    const seqRaw = Number((a.client_event_id ?? '').split(':').pop())
    const list = map.get(a.session_id) ?? []
    list.push({
      sessionId: a.session_id, sceneId: a.scene_id, itemIndex: a.item_index, puzzleType: a.puzzle_type,
      selectedOptionId: a.selected_option_id, isCorrect: a.is_correct, attemptNo: a.attempt_no, responseMs: a.response_ms,
      outcome: a.outcome, seq: Number.isFinite(seqRaw) ? seqRaw : 0, variantId: a.variant_id ?? null,
    })
    map.set(a.session_id, list)
  }
  return map
}

/* תגיות מסיחים (טעויות נפוצות): option_tags × misconceptions (מאושרות בלבד — רשימה סגורה ובדוקה) × קישור להדמיה ממוקדת.
   תגיות הבסיס (variant_id IS NULL) לפי הדמיה; תגיות של גרסאות אישיות לפי מזהה הגרסה — **נפרדות**: לגרסה אישית שאלות ואפשרויות משלה, ולכן תגית שלה
   (למשל על אפשרות "b") אינה אומרת דבר על אפשרות "b" של הבסיס. */
interface LoadedTags { base: Map<string, CoreOptionTag[]>; variant: Map<string, CoreOptionTag[]> }
async function loadTags(questIds: string[], variantIds: string[]): Promise<LoadedTags> {
  const out: LoadedTags = { base: new Map(), variant: new Map() }
  if (!(await hasOptionTags()) || !(await hasMisconceptions())) return out
  type T = { quest_id: string; variant_id: string | null; scene_id: string; item_index: number; option_id: string; misconception_id: string | null }
  const cols = 'quest_id, variant_id, scene_id, item_index, option_id, misconception_id'
  const baseRows = (await Promise.all(chunks([...new Set(questIds)]).map((part) =>
    paged<T>((f, t) => supabaseAdmin.from('option_tags').select(cols).in('quest_id', part).is('variant_id', null).not('misconception_id', 'is', null).order('id').range(f, t)),
  ))).flat()
  const variantRows = variantIds.length === 0 ? [] : (await Promise.all(chunks([...new Set(variantIds)]).map((part) =>
    paged<T>((f, t) => supabaseAdmin.from('option_tags').select(cols).in('variant_id', part).not('misconception_id', 'is', null).order('id').range(f, t)),
  ))).flat()
  const tagRows = [...baseRows, ...variantRows]
  if (tagRows.length === 0) return out
  const mIds = [...new Set(tagRows.map((r) => r.misconception_id as string))]
  type M = { id: string; title_he: string; description_he: string | null; status: string }
  const ms = await inChunks<M>(mIds, async (part) => {
    const { data, error } = await supabaseAdmin.from('misconceptions').select('id, title_he, description_he, status').in('id', part)
    if (error) throw new Error(error.message)
    return (data ?? []) as M[]
  })
  const byId = new Map(ms.filter((m) => m.status === 'approved').map((m) => [m.id, m]))
  const links = new Map<string, string>()
  if (await hasMisconceptionLinks()) {
    const ls = await inChunks<{ misconception_id: string; quest_id: string }>(mIds, async (part) => {
      const { data, error } = await supabaseAdmin.from('misconception_content_links').select('misconception_id, quest_id').in('misconception_id', part)
      if (error) throw new Error(error.message)
      return (data ?? []) as { misconception_id: string; quest_id: string }[]
    })
    for (const l of ls) if (!links.has(l.misconception_id)) links.set(l.misconception_id, l.quest_id)
  }
  const linkTitles = new Map<string, string>()
  const linkIds = [...new Set(links.values())]
  if (linkIds.length > 0) {
    const qs = await inChunks<{ id: string; title: string }>(linkIds, async (part) => {
      const { data } = await supabaseAdmin.from('quests').select('id, title').in('id', part)
      return (data ?? []) as { id: string; title: string }[]
    })
    for (const q of qs) linkTitles.set(q.id, q.title)
  }
  const toTag = (r: T): CoreOptionTag | null => {
    const m = byId.get(r.misconception_id as string)
    if (!m) return null
    const lq = links.get(m.id)
    return {
      sceneId: r.scene_id, itemIndex: r.item_index, optionId: r.option_id, misconceptionId: m.id,
      title: m.title_he, description: m.description_he ?? '',
      linkedQuest: lq && linkTitles.has(lq) ? { questId: lq, title: linkTitles.get(lq)! } : null,
    }
  }
  for (const r of baseRows) {
    const tag = toTag(r)
    if (!tag) continue
    const list = out.base.get(r.quest_id) ?? []
    list.push(tag)
    out.base.set(r.quest_id, list)
  }
  for (const r of variantRows) {
    const tag = toTag(r)
    if (!tag || !r.variant_id) continue
    const list = out.variant.get(r.variant_id) ?? []
    list.push(tag)
    out.variant.set(r.variant_id, list)
  }
  return out
}

/* הגרסאות האישיות ששוחקו (לפי מזהה הגרסה שנרשם ב-answers.variant_id): game_data שלהן + התגיות שלהן. כבד — אצוות קטנות. */
async function loadVariants(variantIds: string[], tags: Map<string, CoreOptionTag[]>): Promise<Map<string, CoreVariant>> {
  const map = new Map<string, CoreVariant>()
  const uniq = [...new Set(variantIds)]
  if (uniq.length === 0 || !(await hasQuestVariants())) return map
  await Promise.all(chunks(uniq, 10).map(async (part) => {
    const { data, error } = await supabaseAdmin.from('quest_variants').select('id, student_id, game_data').in('id', part)
    if (error) throw new Error(error.message)
    for (const r of (data ?? []) as { id: string; student_id: string; game_data: unknown }[]) {
      map.set(r.id, { id: r.id, studentId: r.student_id, gameData: r.game_data, optionTags: tags.get(r.id) ?? [] })
    }
  }))
  return map
}

async function loadMoral(questIds: string[], classIds: string[]): Promise<Bundle['moralRaw']> {
  if (!(await hasMoralChoices())) return []
  type R = { quest_id: string; class_id: string | null; scene_id: string; option_id: string; created_at: string; variant_id: string | null }
  const rows = (await Promise.all(chunks([...new Set(questIds)]).map((part) =>
    paged<R>((f, t) => supabaseAdmin.from('moral_choices').select('quest_id, class_id, scene_id, option_id, created_at, variant_id').in('quest_id', part).in('class_id', classIds).order('id').range(f, t)),
  ))).flat()
  return rows.map((r) => ({ questId: r.quest_id, classId: r.class_id ?? '', sceneId: r.scene_id, optionId: r.option_id, createdAt: r.created_at, variantId: r.variant_id ?? null }))
}

async function loadGames(questIds: string[]): Promise<Map<string, unknown>> {
  const map = new Map<string, unknown>()
  const uniq = [...new Set(questIds)]
  /* game_data כבד — אצוות קטנות */
  await Promise.all(chunks(uniq, 10).map(async (part) => {
    const { data, error } = await supabaseAdmin.from('quests').select('id, game_data').in('id', part)
    if (error) throw new Error(error.message)
    for (const r of (data ?? []) as { id: string; game_data: unknown }[]) map.set(r.id, r.game_data)
  }))
  return map
}

async function loadBundle(viewer: Viewer, lites: Lite[], opts: { detail: boolean }): Promise<Bundle> {
  const questIds = lites.map((l) => l.asg.quest_id)
  const classIds = lites.map((l) => l.asg.class_id)
  const [games, studentsByClass, detailFrom] = await Promise.all([
    loadGames(questIds),
    loadStudents(viewer, classIds),
    detailAvailableFrom(viewer.seesSynthetic),
  ])
  const studentIds = [...studentsByClass.values()].flat().map((s) => s.id)
  const latest = studentIds.length > 0 ? await loadLatestSessions(viewer, questIds, studentIds) : new Map<string, CoreSession>()
  /* רק ה-sessions שנספרים (אחרונים לכל זוג הדמיה×תלמיד של הכיתות הנבחרות) */
  const wanted = new Set<string>()
  for (const l of lites) for (const s of studentsByClass.get(l.asg.class_id) ?? []) {
    const ses = latest.get(`${l.asg.quest_id}|${s.id}`)
    if (ses) wanted.add(ses.id)
  }
  const sessionIds = [...wanted]
  const [eventsBySession, answersBySession, moralRaw] = await Promise.all([
    loadEvents(sessionIds, opts.detail),
    loadAnswers(sessionIds),
    opts.detail ? loadMoral(questIds, classIds) : Promise.resolve([] as Bundle['moralRaw']),
  ])
  /* תגיות וגרסאות אישיות — רק למסך המפורט (הרשימה ובסיס החזרה צריכים ספירות, לא טקסט של אפשרויות) */
  let tags: Bundle['tags'] = new Map()
  let variants: Bundle['variants'] = new Map()
  if (opts.detail) {
    const variantIds = [...new Set([...answersBySession.values()].flat().map((a) => a.variantId).filter((v): v is string => !!v))]
    const loaded = await loadTags(questIds, variantIds)
    tags = loaded.base
    variants = await loadVariants(variantIds, loaded.variant)
  }
  return { games, studentsByClass, latest, eventsBySession, answersBySession, tags, variants, moralRaw, detailFrom }
}

function toCoreInput(l: Lite, b: Bundle): CoreInput {
  const students = b.studentsByClass.get(l.asg.class_id) ?? []
  const sessions: CoreSession[] = []
  for (const s of students) {
    const ses = b.latest.get(`${l.asg.quest_id}|${s.id}`)
    if (ses) sessions.push(ses)
  }
  const answers: CoreAnswerRow[] = []
  const events: CoreEventRow[] = []
  for (const ses of sessions) {
    answers.push(...(b.answersBySession.get(ses.id) ?? []))
    events.push(...(b.eventsBySession.get(ses.id) ?? []))
  }
  const game = b.games.get(l.asg.quest_id) ?? null
  const sentMs = Date.parse(l.asg.created_at)
  const moral: CoreMoralRow[] = b.moralRaw
    .filter((m) => m.questId === l.asg.quest_id && m.classId === l.asg.class_id && (Number.isNaN(sentMs) || Date.parse(m.createdAt) >= sentMs))
    .map((m) => ({ sceneId: m.sceneId, optionId: m.optionId, variantId: m.variantId }))
  const variantIds = new Set(answers.map((a) => a.variantId).filter((v): v is string => !!v))
  const variants = [...variantIds].map((id) => b.variants.get(id)).filter((v): v is CoreVariant => !!v)
  return {
    submission: {
      id: l.asg.id,
      quest: { id: l.quest.id, title: l.quest.title, subject: l.quest.subject, gameData: game, thumbUrl: questThumbUrl(game) },
      classId: l.asg.class_id, className: l.cls.label, sentAt: l.asg.created_at, source: l.source, senderName: l.senderName,
    },
    students, sessions, answers, events,
    optionTags: b.tags.get(l.asg.quest_id) ?? [],
    variants,
    moral,
    detailAvailableFrom: b.detailFrom,
  }
}

/* שליחה אחת לפי מזהה. **404 אחיד**: מזהה לא תקין, שליחה שאינה קיימת, וגם שליחה שקיימת אך אינה גלויה לצופה — אותה תשובה בדיוק
   (אחרת אפשר היה לגלות אילו מזהים קיימים). 403 נשמר רק לתפקיד שאין לו תוצאות בכלל (needViewer). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
async function loadOne(viewer: Viewer, submissionId: string): Promise<Lite> {
  if (!UUID_RE.test(submissionId)) throw new AppError(404, ERR_NOT_FOUND)
  const { data, error } = await supabaseAdmin.from('assignments').select('*').eq('id', submissionId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new AppError(404, ERR_NOT_FOUND)
  const [lite] = await toLites(viewer, [data as AsgRow])
  if (!lite || !lite.visible) throw new AppError(404, ERR_NOT_FOUND)
  return lite
}

/* ══════════════════════════════════════════════════════════════════════════
   בסיס הדמיית חזרה (POST /api/quests/:id/review-quest)
   · אותה הרשאה כמו מסך התוצאות: needViewer (מנהלים — 403) + loadOne (לא קיימת / לא גלויה — 404 אחיד).
   · החישוב הוא של ליבת התוצאות (reviewConceptsOf) — אותו מקור כמו review.weakCount שבמסך. בלי תלמידים בשמם: רק כמות שסיימו + תחומים.
   ══════════════════════════════════════════════════════════════════════════ */
export async function loadReviewBasis(req: Request, assignmentId: string, questId: string): Promise<{ completed: number; concepts: ReviewConcept[]; classId: string }> {
  const viewer = await needViewer(req)
  const lite = await loadOne(viewer, assignmentId)
  if (lite.asg.quest_id !== questId) throw new AppError(400, ERR_REVIEW_WRONG_QUEST)
  const bundle = await loadBundle(viewer, [lite], { detail: false })
  const basis = buildReviewBasis(toCoreInput(lite, bundle))
  await logAccess(viewer, { scope: 'results_review', endpoint: 'POST /api/quests/:id/review-quest' })
  return { ...basis, classId: lite.asg.class_id }
}

/* ══════════════════════════════════════════════════════════════════════════
   גישה לשירות הסיכום המילולי (lib/aiSummary): אותה הרשאה בדיוק כמו מסך ההדמיה (needViewer + loadOne: מנהלים — 403, לא גלויה / לא קיימת — 404 אחיד),
   אך **בלי** רישום ביומן לכל תלמיד ברשימה — שירות הסיכום רושם בעצמו שורה אחת (בלי תלמיד) לכל סיכום, והתוצאה לא חושפת שמות ל-AI.
   ההרשאה נבדקת מיד (זול: שליחה + הדמיה + כיתה); הטעינה הכבדה נדחית עד classView(), כך שבקשת GET של סיכום שמור לא טוענת את כל נתוני הכיתה.
   ══════════════════════════════════════════════════════════════════════════ */
export interface SubmissionSummaryAccess {
  /* מסך ההדמיה (אותו מבנה כמו GET /api/results/submission/:id), בלי רישום ביומן */
  classView(): Promise<ClassSubmissionView>
}

export async function openSubmissionForSummary(req: Request, submissionId: string): Promise<SubmissionSummaryAccess> {
  const viewer = await needViewer(req)
  const lite = await loadOne(viewer, submissionId)
  return {
    async classView() {
      const bundle = await loadBundle(viewer, [lite], { detail: true })
      return buildClassView(toCoreInput(lite, bundle))
    },
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   הספק
   ══════════════════════════════════════════════════════════════════════════ */
const subjectOrder =(code: string): number => SUBJECTS.findIndex((s) => s.code === code)
const newestFirst = (a: AsgRow, b: AsgRow): number => (Date.parse(b.created_at) - Date.parse(a.created_at)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

export const realResultsProvider: ResultsProvider = {
  async list(req: Request, q: ResultsListQuery): Promise<SubmissionList> {
    const viewer = await needViewer(req)

    /* סריקה מוגבלת: לכל אצוות כיתות מביאים לכל היותר ASSIGNMENT_SCAN_CAP+1 החדשות ביותר, ממזגים וחותכים. ה-+1 מאפשר לזהות שהייתה חיתוך */
    const fetchNewest = async (classIds: string[] | null): Promise<AsgRow[]> => {
      let qb = supabaseAdmin.from('assignments').select('*')
      if (classIds) qb = qb.in('class_id', classIds)
      const { data, error } = await qb.order('created_at', { ascending: false }).order('id').limit(ASSIGNMENT_SCAN_CAP + 1)
      if (error) throw new Error(error.message)
      return (data ?? []) as AsgRow[]
    }
    const scanned: AsgRow[] = viewer.role === 'teacher'
      ? (await Promise.all(chunks([...viewer.grants.keys()]).map((part) => fetchNewest(part)))).flat().sort(newestFirst)
      : await fetchNewest(null)
    const scanCapped = scanned.length > ASSIGNMENT_SCAN_CAP
    const asgs = scanned.slice(0, ASSIGNMENT_SCAN_CAP)

    const visible = (await toLites(viewer, asgs)).filter((l) => l.visible)

    /* אפשרויות הסינון — מכל מה שהצופה רואה, לפני הסינון עצמו */
    const classOpts = new Map<string, string>()
    const subjOpts = new Map<string, ResultsSubject>()
    for (const l of visible) {
      classOpts.set(l.cls.id, l.cls.label)
      if (l.quest.subject) subjOpts.set(l.quest.subject.code, l.quest.subject)
    }

    const needle = (q.q ?? '').trim().toLowerCase()
    const matching = visible
      .filter((l) => !q.classId || l.cls.id === q.classId)
      .filter((l) => !q.subject || l.quest.subject?.code === q.subject)
      .filter((l) => !needle || [l.quest.title, l.cls.label, l.quest.subject?.nameHe ?? ''].some((s) => s.toLowerCase().includes(needle)))
      .sort((a, b) => newestFirst(a.asg, b.asg))
    const shown = matching.slice(0, LIST_LIMIT)
    const truncated = scanCapped || matching.length > LIST_LIMIT

    const bundle = shown.length > 0 ? await loadBundle(viewer, shown, { detail: false }) : null
    const submissions = bundle ? shown.map((l) => buildListRow(toCoreInput(l, bundle))) : []

    await logAccess(viewer, { scope: 'results_list', endpoint: 'GET /api/results/submissions' })

    return {
      submissions,
      ...(truncated ? { truncated: true } : {}),
      filters: {
        classes: [...classOpts.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'he')),
        subjects: [...subjOpts.values()].sort((a, b) => subjectOrder(a.code) - subjectOrder(b.code)),
      },
    }
  },

  async classView(req: Request, submissionId: string): Promise<ClassSubmissionView> {
    const viewer = await needViewer(req)
    const lite = await loadOne(viewer, submissionId)
    const bundle = await loadBundle(viewer, [lite], { detail: true })
    /* מסך הדמיה חושף שמות ותוצאות של כל הכיתה — שורה ביומן לכל תלמיד ברשימה (הכנסה אחת). למנהל-על: נכשל סגור לפני שמחזירים נתונים */
    const roster = bundle.studentsByClass.get(lite.asg.class_id) ?? []
    await logAccessMany(
      viewer,
      roster.map((s) => ({ studentId: s.id, scope: 'results_class', endpoint: 'GET /api/results/submission/:id' })),
      { studentLevel: true },
    )
    return buildClassView(toCoreInput(lite, bundle))
  },

  async studentView(req: Request, submissionId: string, studentId: string): Promise<StudentSubmissionView> {
    const viewer = await needViewer(req)
    const lite = await loadOne(viewer, submissionId)
    /* בדיקת חברות זולה לפני טעינת כל נתוני הכיתה: בקשה על מזהה שאינו תלמיד בכיתה נכשלת מהר, ולא מפעילה את השאילתות הכבדות */
    if (!(await studentInRoster(viewer, lite.asg.class_id, studentId))) throw new AppError(404, ERR_NOT_FOUND)
    const bundle = await loadBundle(viewer, [lite], { detail: true })
    const view = buildStudentView(toCoreInput(lite, bundle), studentId)
    if (!view) throw new AppError(404, ERR_NOT_FOUND)
    await logAccess(viewer, { studentId, scope: 'results', endpoint: 'GET /api/results/submission/:id/student/:studentId' }, { studentLevel: true })
    return view
  },
}
