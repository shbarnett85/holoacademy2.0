import { supabaseAdmin } from './supabase.js'
import { hasGradeLabel, hasSubjectLevels, hasLevelHistory, hasProfileLock, hasSyntheticFlag } from './activeColumn.js'
import {
  calibrate,
  normalizeProfile,
  defaultProfileForGrade,
  PROFILE_PUZZLE_TYPES,
  type ProfilePuzzleType,
  type PuzzleStat,
  type DifficultyProfile,
} from '../../../src/shared/lib/difficultyCalibration.js'

/* ── כיול הקושי בשרת (JS) — רץ אחרי כל session שהושלם ──
   כלל 60/80 פר-סוג + text_level + תיקון זמני קריאה — **הלוגיקה לא השתנתה** (calibrate).
   מה שהשתנה: מאיפה קוראים ולאן כותבים.
   · הדמיה עם מקצוע (subjectId) → student_subject_levels (+ level_history). מקצוע חדש = פרופיל חדש,
     מרמת הפתיחה לתלמיד חדש (לפי שכבת הכיתה), לא מועתק מהפרופיל הגלובלי.
   · הדמיה "לא סווג" → difficulty_profiles הגלובלי, כמו קודם.
   · teacher_locked: כשמורה נעל את הרמה, הכיול האוטומטי לא דורס אותה. */

export interface CalibrateOpts {
  subjectId?: string | null
  sessionId?: string | null
  isSynthetic?: boolean
}

async function gradeLabelOf(classId: string | null): Promise<string | null> {
  if (!classId) return null
  const sel = (await hasGradeLabel()) ? 'grade_label, name' : 'name'
  const { data: cls } = await supabaseAdmin.from('classes').select(sel).eq('id', classId).maybeSingle()
  const c = cls as { grade_label?: string | null; name?: string | null } | null
  return c?.grade_label ?? c?.name ?? null
}

/* רשומות היסטוריה לשינויי רמה (רק מימדים שהשתנו) */
function historyRows(
  studentId: string, subjectId: string | null, prev: DifficultyProfile, next: DifficultyProfile,
  trigger: 'calibration' | 'teacher' | 'seed', opts: { sessionId?: string | null; actorId?: string | null; synthetic?: boolean },
) {
  const rows: Record<string, unknown>[] = []
  const base = { student_id: studentId, subject_id: subjectId, trigger, session_id: opts.sessionId ?? null, actor_id: opts.actorId ?? null, is_synthetic: !!opts.synthetic }
  if (trigger === 'seed' || prev.textLevel !== next.textLevel) rows.push({ ...base, dimension: 'text', old_level: trigger === 'seed' ? null : prev.textLevel, new_level: next.textLevel })
  for (const t of PROFILE_PUZZLE_TYPES) {
    if (trigger === 'seed' || prev.perPuzzleLevel[t] !== next.perPuzzleLevel[t]) {
      rows.push({ ...base, dimension: t, old_level: trigger === 'seed' ? null : prev.perPuzzleLevel[t], new_level: next.perPuzzleLevel[t] })
    }
  }
  return rows
}

async function writeHistory(rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0 || !(await hasLevelHistory())) return
  await supabaseAdmin.from('level_history').insert(rows)
}

/* ── שורת רמות פר-מקצוע ── */
interface SubjectLevelRow { id: string; text_level: number; per_type: Record<string, number> | null; teacher_locked: boolean }

async function getSubjectRow(studentId: string, subjectId: string): Promise<SubjectLevelRow | null> {
  const { data } = await supabaseAdmin
    .from('student_subject_levels')
    .select('id, text_level, per_type, teacher_locked')
    .eq('student_id', studentId)
    .eq('subject_id', subjectId)
    .maybeSingle()
  return (data as SubjectLevelRow | null) ?? null
}

/* יוצר שורת פתיחה למקצוע אם חסרה (ברמת הפתיחה של תלמיד חדש לפי שכבת הכיתה). אידמפוטנטי. */
export async function ensureSubjectLevels(
  studentId: string, classId: string | null, subjectId: string, opts: { isSynthetic?: boolean } = {},
): Promise<{ profile: DifficultyProfile; created: boolean; locked: boolean }> {
  const existing = await getSubjectRow(studentId, subjectId)
  const fallback = defaultProfileForGrade(await gradeLabelOf(classId))
  if (existing) {
    return {
      profile: normalizeProfile({ textLevel: Number(existing.text_level), perPuzzleLevel: (existing.per_type ?? undefined) as Record<ProfilePuzzleType, number> | undefined }, fallback),
      created: false,
      locked: existing.teacher_locked,
    }
  }
  const { error } = await supabaseAdmin.from('student_subject_levels').insert({
    student_id: studentId, subject_id: subjectId,
    text_level: fallback.textLevel, per_type: fallback.perPuzzleLevel, teacher_locked: false,
    is_synthetic: !!opts.isSynthetic,
  })
  if (!error) {
    await writeHistory(historyRows(studentId, subjectId, fallback, fallback, 'seed', { synthetic: opts.isSynthetic }))
  }
  return { profile: fallback, created: !error, locked: false }
}

/* הפרופיל האפקטיבי לבחירת קושי בתחילת הדמיה (קריאה בלבד — לא יוצר שורות):
   מקצוע → שורת המקצוע, ואם אין — רמת הפתיחה; ללא מקצוע → הפרופיל הגלובלי, ואם אין — רמת הפתיחה. */
export async function loadEffectiveProfile(
  studentId: string, classId: string | null, subjectId: string | null,
): Promise<{ profile: DifficultyProfile; source: 'subject' | 'global' | 'default' }> {
  const fallback = defaultProfileForGrade(await gradeLabelOf(classId))
  if (subjectId && (await hasSubjectLevels())) {
    const row = await getSubjectRow(studentId, subjectId)
    if (row) {
      return {
        profile: normalizeProfile({ textLevel: Number(row.text_level), perPuzzleLevel: (row.per_type ?? undefined) as Record<ProfilePuzzleType, number> | undefined }, fallback),
        source: 'subject',
      }
    }
    return { profile: fallback, source: 'default' }
  }
  const { data } = await supabaseAdmin
    .from('difficulty_profiles').select('text_level, per_puzzle_level').eq('user_id', studentId).maybeSingle()
  const r = data as { text_level?: number | null; per_puzzle_level?: Record<string, number> | null } | null
  if (r && (typeof r.text_level === 'number' || r.per_puzzle_level)) {
    return {
      profile: normalizeProfile({ textLevel: r.text_level ?? undefined, perPuzzleLevel: (r.per_puzzle_level ?? undefined) as Record<ProfilePuzzleType, number> | undefined }, fallback),
      source: 'global',
    }
  }
  return { profile: fallback, source: 'default' }
}

export async function recalibrateProfile(
  userId: string,
  classId: string | null,
  perType: Partial<Record<ProfilePuzzleType, PuzzleStat>>,
  avgSceneMs: number,
  opts: CalibrateOpts = {},
): Promise<{ skipping: boolean; profile: DifficultyProfile } | null> {
  const synthetic = !!opts.isSynthetic

  /* ── מסלול פר-מקצוע ── */
  if (opts.subjectId && (await hasSubjectLevels())) {
    const { profile: prev, locked } = await ensureSubjectLevels(userId, classId, opts.subjectId, { isSynthetic: synthetic })
    const result = calibrate(prev, { perType, avgSceneMs })
    if (locked) {
      /* הרמה נעולה ע"י מורה: לא דורסים. דגל הדילוג עדיין מדווח. */
      return { skipping: result.skipping, profile: prev }
    }
    await supabaseAdmin
      .from('student_subject_levels')
      .update({ text_level: result.profile.textLevel, per_type: result.profile.perPuzzleLevel, updated_at: new Date().toISOString() })
      .eq('student_id', userId)
      .eq('subject_id', opts.subjectId)
    await writeHistory(historyRows(userId, opts.subjectId, prev, result.profile, 'calibration', { sessionId: opts.sessionId, synthetic }))
    return { skipping: result.skipping, profile: result.profile }
  }

  /* ── מסלול גלובלי (הדמיה ללא מקצוע) — כמו קודם ── */
  const fallback = defaultProfileForGrade(await gradeLabelOf(classId))
  const lockCol = (await hasProfileLock()) ? ', teacher_locked' : ''
  const { data: row } = await supabaseAdmin
    .from('difficulty_profiles')
    .select('id, text_level, per_puzzle_level, sessions_count' + lockCol)
    .eq('user_id', userId)
    .maybeSingle()
  const r = row as unknown as {
    id?: string
    text_level?: number | null
    per_puzzle_level?: Record<string, number> | null
    sessions_count?: number | null
    teacher_locked?: boolean
  } | null
  const prev = normalizeProfile(
    r ? { textLevel: r.text_level ?? undefined, perPuzzleLevel: (r.per_puzzle_level as Record<ProfilePuzzleType, number>) ?? undefined } : null,
    fallback,
  )

  const result = calibrate(prev, { perType, avgSceneMs })
  const next = r?.teacher_locked ? prev : result.profile

  /* היסטוריית שיעורי הצלחה אחרונים פר סוג */
  const lastRates: Record<string, number> = {}
  for (const [t, s] of Object.entries(perType)) {
    if (s && s.total > 0) lastRates[t] = Math.round((s.solved / s.total) * 100) / 100
  }

  const profilePatch: Record<string, unknown> = {
    text_level: next.textLevel,
    per_puzzle_level: next.perPuzzleLevel,
    last_success_rates: lastRates,
    last_avg_scene_ms: Math.round(avgSceneMs),
    sessions_count: (r?.sessions_count ?? 0) + 1,
    last_updated: new Date().toISOString(),
  }
  if (r?.id) {
    await supabaseAdmin.from('difficulty_profiles').update(profilePatch).eq('id', r.id)
  } else {
    const insert: Record<string, unknown> = { user_id: userId, ...profilePatch }
    if (synthetic && (await hasSyntheticFlag())) insert.is_synthetic = true
    await supabaseAdmin.from('difficulty_profiles').insert(insert)
  }
  if (!r?.teacher_locked) await writeHistory(historyRows(userId, null, prev, next, 'calibration', { sessionId: opts.sessionId, synthetic }))

  return { skipping: result.skipping, profile: next }
}

/* ── עקיפת מורה: כותבת עם teacher_locked=true ושומרת ביומן. unlock=true משחרר. ── */
export async function applyTeacherLevels(opts: {
  studentId: string
  classId: string | null
  subjectId: string | null
  actorId: string
  textLevel?: number
  perPuzzleLevel?: Record<string, number>
  unlock?: boolean
}): Promise<{ profile: DifficultyProfile; locked: boolean }> {
  const { studentId, subjectId, actorId } = opts
  const clamp = (n: number) => Math.max(1, Math.min(20, Math.round(n)))

  if (subjectId && (await hasSubjectLevels())) {
    const { profile: prev } = await ensureSubjectLevels(studentId, opts.classId, subjectId)
    const next: DifficultyProfile = { textLevel: prev.textLevel, perPuzzleLevel: { ...prev.perPuzzleLevel } }
    if (typeof opts.textLevel === 'number') next.textLevel = clamp(opts.textLevel)
    for (const t of PROFILE_PUZZLE_TYPES) {
      const v = opts.perPuzzleLevel?.[t]
      if (typeof v === 'number') next.perPuzzleLevel[t] = clamp(v)
    }
    const locked = opts.unlock ? false : true
    await supabaseAdmin
      .from('student_subject_levels')
      .update({ text_level: next.textLevel, per_type: next.perPuzzleLevel, teacher_locked: locked, updated_at: new Date().toISOString() })
      .eq('student_id', studentId)
      .eq('subject_id', subjectId)
    await writeHistory(historyRows(studentId, subjectId, prev, next, 'teacher', { actorId }))
    return { profile: next, locked }
  }

  /* גלובלי (הדמיות ללא מקצוע) */
  const fallback = defaultProfileForGrade(await gradeLabelOf(opts.classId))
  const lockCol = (await hasProfileLock()) ? ', teacher_locked' : ''
  const { data: row } = await supabaseAdmin
    .from('difficulty_profiles').select('id, text_level, per_puzzle_level' + lockCol).eq('user_id', studentId).maybeSingle()
  const r = row as unknown as { id?: string; text_level?: number | null; per_puzzle_level?: Record<string, number> | null } | null
  const prev = normalizeProfile(
    r ? { textLevel: r.text_level ?? undefined, perPuzzleLevel: (r.per_puzzle_level as Record<ProfilePuzzleType, number>) ?? undefined } : null,
    fallback,
  )
  const next: DifficultyProfile = { textLevel: prev.textLevel, perPuzzleLevel: { ...prev.perPuzzleLevel } }
  if (typeof opts.textLevel === 'number') next.textLevel = clamp(opts.textLevel)
  for (const t of PROFILE_PUZZLE_TYPES) {
    const v = opts.perPuzzleLevel?.[t]
    if (typeof v === 'number') next.perPuzzleLevel[t] = clamp(v)
  }
  const lockable = await hasProfileLock()
  const patch: Record<string, unknown> = { text_level: next.textLevel, per_puzzle_level: next.perPuzzleLevel, last_updated: new Date().toISOString() }
  if (lockable) patch.teacher_locked = !opts.unlock
  if (r?.id) await supabaseAdmin.from('difficulty_profiles').update(patch).eq('id', r.id)
  else await supabaseAdmin.from('difficulty_profiles').insert({ user_id: studentId, ...patch })
  await writeHistory(historyRows(studentId, null, prev, next, 'teacher', { actorId }))
  return { profile: next, locked: lockable && !opts.unlock }
}
