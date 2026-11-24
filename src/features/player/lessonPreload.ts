/* טעינת שיעור לפני הכניסה אליו (לבקשת המשתמש): כל מה שהנגן צריך כדי להתחיל נטען כשהתלמיד עוד במסך בחירת השיעורים,
   מתחת לכיתוב "טוען", ורק אחר כך הצלילה לפורטל. כך אחרי הצלילה המשחק מתחיל מיד, בלי מסך טעינה.
   נטענים: הקוד של הנגן, השיעור עצמו, התחלת ה-session (לתלמיד מחובר; לאורח ולמבקר אין), והתמונה הראשונה.
   מה שנטען נשמר כאן לזמן קצר, והנגן לוקח אותו בכניסה (index.tsx, usePlaySession). כשל בטעינה לא עוצר את הכניסה:
   הנגן טוען בעצמו, כמו בכניסה מקישור ישיר. */
import { apiFetch } from '../../shared/lib/api'
import { preloadPlayer } from '../../shared/lib/playerChunk'
import { startSession, type SessionStart } from './sessionTracker'

export interface PreloadedLesson {
  questId: string
  /* מה ש-GET /api/quests/:id מחזיר ב-quest */
  quest: { id: string; title: string; game_data: { scenes?: { imageUrl?: string | null }[] } & Record<string, unknown> }
  session: SessionStart | null
  at: number
}

/* כמה זמן מה שנטען תקף: מספיק לצלילה, ולא יותר (כניסה מאוחרת יותר טוענת מחדש) */
const FRESH_MS = 20_000
/* התמונה הראשונה לא מעכבת את הכניסה יותר מזה */
const IMAGE_WAIT_MS = 2500
const ready = new Map<string, PreloadedLesson>()

const warmImage = (url: string | null | undefined): Promise<void> => new Promise((resolve) => {
  if (!url) { resolve(); return }
  const img = new Image()
  /* באותה צורת בקשה כמו ההולוגרמה שבפורטל (crossOrigin), כדי שהדפדפן ישתמש באותו עותק */
  img.crossOrigin = 'anonymous'
  img.onload = img.onerror = () => resolve()
  img.src = url
  window.setTimeout(resolve, IMAGE_WAIT_MS)
})

/* raw: המזהה שבכתובת (/play/:raw): מזהה של שיעור, או השם של שיעור הדמו */
export async function preloadLesson(raw: string): Promise<void> {
  const chunk = preloadPlayer().catch(() => undefined)
  let questId = raw
  if (!/^[0-9a-f-]{36}$/i.test(raw)) {
    const res = await fetch('/api/quests/demo')
    if (!res.ok) throw new Error('demo')
    questId = ((await res.json()) as { id: string }).id
  }
  const [quest, session] = await Promise.all([
    apiFetch(`/api/quests/${questId}`).then(async (res) => { if (!res.ok) throw new Error('quest'); return ((await res.json()) as { quest: PreloadedLesson['quest'] }).quest }),
    startSession(questId),
  ])
  const data = (session?.variantGameData as PreloadedLesson['quest']['game_data'] | undefined) ?? quest.game_data
  /* בפורטל של מסך הפתיחה מוצגת התמונה של העמוד שאחרי המעבדה; אחריה התמונה של העמוד הראשון */
  await Promise.all([chunk, warmImage(data?.scenes?.[1]?.imageUrl), warmImage(data?.scenes?.[0]?.imageUrl)])
  ready.set(raw, { questId, quest, session, at: Date.now() })
}

/* מה שנטען לכתובת הזאת, אם הוא טרי. לא נמחק בקריאה (React קורא לאתחול פעמיים בפיתוח); הנגן מוחק אחרי שהתחיל */
export function preloadedLesson(raw: string | undefined): PreloadedLesson | undefined {
  const p = raw ? ready.get(raw) : undefined
  return p && Date.now() - p.at < FRESH_MS ? p : undefined
}
export function clearPreloadedLesson(raw: string | undefined): void { if (raw) ready.delete(raw) }
