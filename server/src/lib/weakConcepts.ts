import { supabaseAdmin } from './supabase.js'

/* ── חישוב המושגים החלשים של כיתה בהדמיה — הבסיס להדמיית החזרה ──
   נשען על אותם events מסוכמים של האנליטיקה (puzzle_solved/failed, session אחרון
   פר-תלמיד). קיבוץ לפי **יעד למידה** כשההדמיה מתויגת (איכות גבוהה), אחרת לפי סצנה.
   סף חולשה = הצלחה כיתתית מתחת ל-60% עם 2 ניסיונות לפחות (עקבי עם ספי הכיול). */

const WEAK_RATE = 0.6
const MIN_ATTEMPTS = 2

export interface WeakConcept {
  /* קיים רק כשההדמיה מתויגת ביעדים */
  objectiveId?: string
  /* ניסוח המושג/היעד לחיזוק */
  text: string
  /* אחוז ההצלחה הכיתתי שנמדד */
  successRate: number
  /* השאלות שנשאלו והתשובות הנכונות — מזינות את הפרומפט ("מזווית חדשה") */
  details: string[]
}

interface SceneLite {
  id: string
  title?: string
  narrative?: string
  puzzle?: {
    type?: string
    question?: string
    objectiveId?: string | null
    choices?: { text: string; isCorrect: boolean }[]
    answer?: string
    answers?: string[]
  }
}

/* תמצית האתגר: השאלה + התשובה הנכונה אם ניתנת לחילוץ */
function challengeDetail(scene: SceneLite): string | null {
  const p = scene.puzzle
  if (!p?.question) return null
  const correct =
    p.choices?.find((c) => c.isCorrect)?.text ??
    (p.answers && p.answers.length > 0 ? p.answers.join(', ') : p.answer)
  return correct ? `נשאל: "${p.question}" · התשובה הנכונה: "${correct}"` : `נשאל: "${p.question}"`
}

export async function computeWeakConcepts(
  questId: string,
  classId: string,
  gameData: unknown,
): Promise<WeakConcept[]> {
  const gd = gameData as {
    scenes?: SceneLite[]
    objectives?: { id: string; text: string }[]
  } | null
  const scenes = Array.isArray(gd?.scenes) ? gd.scenes : []
  if (scenes.length === 0) return []

  /* תלמידי הכיתה → ה-session האחרון של כל אחד בהדמיה */
  const { data: members } = await supabaseAdmin
    .from('class_members')
    .select('user_id')
    .eq('class_id', classId)
  const studentIds = (members ?? []).map((m: { user_id: string }) => m.user_id)
  if (studentIds.length === 0) return []

  const { data: sessRows } = await supabaseAdmin
    .from('sessions')
    .select('id, user_id, started_at')
    .eq('quest_id', questId)
    .in('user_id', studentIds)
    .order('started_at', { ascending: false })
  const latestByStudent = new Map<string, string>()
  for (const s of (sessRows ?? []) as { id: string; user_id: string }[]) {
    if (!latestByStudent.has(s.user_id)) latestByStudent.set(s.user_id, s.id)
  }
  const sessionIds = [...latestByStudent.values()]
  if (sessionIds.length === 0) return []

  /* תוצאות פר-סצנה */
  const { data: events } = await supabaseAdmin
    .from('events')
    .select('scene_id, type')
    .in('session_id', sessionIds)
    .in('type', ['puzzle_solved', 'puzzle_failed'])
  const perScene = new Map<string, { solved: number; failed: number }>()
  for (const e of (events ?? []) as { scene_id: string | null; type: string }[]) {
    if (!e.scene_id) continue
    const cur = perScene.get(e.scene_id) ?? { solved: 0, failed: 0 }
    if (e.type === 'puzzle_solved') cur.solved++
    else cur.failed++
    perScene.set(e.scene_id, cur)
  }

  const sceneById = new Map(scenes.map((s) => [s.id, s]))
  const objectives = Array.isArray(gd?.objectives) ? gd.objectives.filter((o) => o?.id && o?.text) : []

  /* ── מסלול יעדים: קיבוץ התוצאות לפי היעד שהאתגר בוחן ── */
  if (objectives.length > 0) {
    const perObjective = new Map<string, { solved: number; failed: number; sceneIds: string[] }>()
    for (const [sceneId, st] of perScene) {
      const objectiveId = sceneById.get(sceneId)?.puzzle?.objectiveId
      if (!objectiveId) continue
      const cur = perObjective.get(objectiveId) ?? { solved: 0, failed: 0, sceneIds: [] }
      cur.solved += st.solved
      cur.failed += st.failed
      cur.sceneIds.push(sceneId)
      perObjective.set(objectiveId, cur)
    }
    const weak: WeakConcept[] = []
    for (const o of objectives) {
      const st = perObjective.get(o.id)
      if (!st) continue
      const attempts = st.solved + st.failed
      const rate = attempts > 0 ? st.solved / attempts : 1
      if (attempts < MIN_ATTEMPTS || rate >= WEAK_RATE) continue
      const details = st.sceneIds
        .map((id) => challengeDetail(sceneById.get(id)!))
        .filter((d): d is string => !!d)
      weak.push({ objectiveId: o.id, text: o.text, successRate: rate, details })
    }
    return weak.sort((a, b) => a.successRate - b.successRate)
  }

  /* ── מסלול סצנות (הדמיות ללא יעדים): כל אתגר חלש הוא "מושג" ── */
  const weak: WeakConcept[] = []
  for (const [sceneId, st] of perScene) {
    const attempts = st.solved + st.failed
    const rate = attempts > 0 ? st.solved / attempts : 1
    if (attempts < MIN_ATTEMPTS || rate >= WEAK_RATE) continue
    const scene = sceneById.get(sceneId)
    if (!scene) continue
    const detail = challengeDetail(scene)
    weak.push({
      text: scene.title ?? sceneId,
      successRate: rate,
      details: detail ? [detail] : [],
    })
  }
  return weak.sort((a, b) => a.successRate - b.successRate)
}

/* בלוק הפרומפט של החזרה — המושגים + כלל "זווית חדשה" */
export function reviewContextBlock(baseTitle: string, concepts: WeakConcept[]): string {
  const list = concepts
    .map((c, i) => {
      const lines = [`### מושג ${i + 1}: ${c.text} (הצלחה כיתתית: ${Math.round(c.successRate * 100)}%)`]
      for (const d of c.details) lines.push(`- ${d}`)
      return lines.join('\n')
    })
    .join('\n')
  return `זוהי **הדמיית חזרה** — הרפתקת המשך קצרה לחיזוק מושגים שהכיתה התקשתה בהם בהדמיה "${baseTitle}".

המושגים לחיזוק (לפי ביצועי הכיתה בפועל):
${list}

כללים מחייבים להדמיית חזרה:
1. **כל אתגר בוחן מושג אחד מהרשימה — מזווית חדשה.** אסור לשחזר שאלה שכבר נשאלה (מצורפת למעלה); נסח שאלה שונה על אותו רעיון, או בחן אותו דרך הקשר/דוגמה אחרים.
2. הנרטיב הוא **הרפתקת המשך עצמאית וקצרה** — ד"ר הולו מזמין את התלמידים למשימת חיזוק חדשה. אל תספר מחדש את עלילת ההדמיה המקורית.
3. לפני כל אתגר, הנרטיב מסביר את הרעיון בקצרה מזווית רעננה (הזדמנות שנייה ללמוד, לא רק להיבחן).
4. שמור על טון מעודד — התלמידים שיקבלו את ההדמיה הזו התקשו בחומר; המטרה היא הצלחה בונת-ביטחון, לא מבחן נוסף.`
}
