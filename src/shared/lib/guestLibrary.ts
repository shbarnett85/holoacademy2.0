/* בידוד ספריית מורה-אורח (per-browser). כל האורחים חולקים את חשבון הדמו
   (teacher@demo.com), אז בלי זה כל אורח היה רואה/עורך/מפעיל את ההדמיות של כל
   אורח אחר. הפתרון: כשאורח יוצר הדמיה, שומרים את מזהה ההדמיה ב-cache של הדפדפן
   שלו; הספרייה במצב אורח מסננת ל-IDs האלה בלבד — כך כל אורח רואה רק את מה שיצר. */

const KEY = 'holo_guest_quest_ids'

export function getGuestQuestIds(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? (v as string[]).filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function addGuestQuestId(id: string): void {
  if (!id) return
  try {
    const ids = getGuestQuestIds()
    if (!ids.includes(id)) {
      ids.unshift(id) /* החדשה בראש */
      localStorage.setItem(KEY, JSON.stringify(ids))
    }
  } catch { /* localStorage לא זמין — נופלים בשקט */ }
}

export function removeGuestQuestId(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(getGuestQuestIds().filter((x) => x !== id)))
  } catch { /* noop */ }
}
