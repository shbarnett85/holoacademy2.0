/* משפטי הצמיחה של מסך הסיום, מתוך תוצאות האתגרים. קריאה בלבד: לוגיקת האתגרים לא משתנה. */
import type { ChallengeResult } from '../useGameEngine'

/* כמה אתגרים הצליחו (נקודה מלאה), וכמה פעמים ניסו שוב והצליחו (חצי נקודה: רק בבחירה מרובה ובמבחן סיכום).
   אתגר-משחק שנפתר נספר כהצלחה, גם אם היו בו טעויות בדרך. דילמה מוסרית לא נספרת: אין בה ניסיון */
export function growthCounts(results: readonly ChallengeResult[], moralSceneIds: ReadonlySet<string>): { firstTry: number; retried: number } {
  let firstTry = 0
  let retried = 0
  for (const r of results) {
    if (moralSceneIds.has(r.sceneId)) continue
    const p = r.gemPoints ?? r.score
    if (p >= 1) firstTry++
    else if (p > 0) retried++
  }
  return { firstTry, retried }
}
