import { supabaseAdmin } from './supabase.js'
import { hasGradeLabel } from './activeColumn.js'
import {
  calibrate,
  normalizeProfile,
  defaultProfileForGrade,
  type ProfilePuzzleType,
  type PuzzleStat,
  type DifficultyProfile,
} from '../../../src/shared/lib/difficultyCalibration.js'

/* ── כיול הקושי בשרת (JS) — רץ אחרי כל session שהושלם, מחליף את ה-RPC הישן ──
   טוען את הפרופיל הקיים (או ברירת מחדל לפי שכבת הכיתה), מחיל את כלל 60/80
   פר-סוג + text_level + תיקון זמני קריאה, ושומר את הפרופיל החדש. */
export async function recalibrateProfile(
  userId: string,
  classId: string | null,
  perType: Partial<Record<ProfilePuzzleType, PuzzleStat>>,
  avgSceneMs: number,
): Promise<{ skipping: boolean; profile: DifficultyProfile } | null> {
  /* ברירת מחדל לפי שכבת הכיתה (grade_label) */
  let gradeLabel: string | null = null
  if (classId) {
    const sel = (await hasGradeLabel()) ? 'grade_label, name' : 'name'
    const { data: cls } = await supabaseAdmin.from('classes').select(sel).eq('id', classId).maybeSingle()
    const c = cls as { grade_label?: string | null; name?: string | null } | null
    gradeLabel = c?.grade_label ?? c?.name ?? null
  }
  const fallback = defaultProfileForGrade(gradeLabel)

  /* פרופיל קודם (אם קיים) */
  const { data: row } = await supabaseAdmin
    .from('difficulty_profiles')
    .select('id, text_level, per_puzzle_level, sessions_count')
    .eq('user_id', userId)
    .maybeSingle()
  const r = row as {
    id?: string
    text_level?: number | null
    per_puzzle_level?: Record<string, number> | null
    sessions_count?: number | null
  } | null
  const prev = normalizeProfile(
    r ? { textLevel: r.text_level ?? undefined, perPuzzleLevel: (r.per_puzzle_level as Record<ProfilePuzzleType, number>) ?? undefined } : null,
    fallback,
  )

  const result = calibrate(prev, { perType, avgSceneMs })

  /* היסטוריית שיעורי הצלחה אחרונים פר סוג */
  const lastRates: Record<string, number> = {}
  for (const [t, s] of Object.entries(perType)) {
    if (s && s.total > 0) lastRates[t] = Math.round((s.solved / s.total) * 100) / 100
  }

  const profilePatch: Record<string, unknown> = {
    text_level: result.profile.textLevel,
    per_puzzle_level: result.profile.perPuzzleLevel,
    last_success_rates: lastRates,
    last_avg_scene_ms: Math.round(avgSceneMs),
    sessions_count: (r?.sessions_count ?? 0) + 1,
    last_updated: new Date().toISOString(),
  }
  if (r?.id) {
    await supabaseAdmin.from('difficulty_profiles').update(profilePatch).eq('id', r.id)
  } else {
    await supabaseAdmin.from('difficulty_profiles').insert({ user_id: userId, ...profilePatch })
  }

  return { skipping: result.skipping, profile: result.profile }
}
