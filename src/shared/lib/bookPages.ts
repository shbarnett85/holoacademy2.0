/* הספרייה ההולוגרפית: התלמיד רואה "עמוד" (בקוד ובמסד: scene).
   מספר העמוד הוא המקום של העמוד בספר (1 = העמוד הראשון), ולא כמה עמודים כבר נקראו: בספר עם צומת
   הקריאה קופצת בין עמודים, והמספר נשאר של העמוד עצמו. אותו חישוב ב-HUD ("עמוד 3 מתוך 6") ובסימנייה שבמדף ("עמוד 3"). */
export function pageNumberOf(scenes: readonly { id: string }[] | null | undefined, sceneId: string | null | undefined): number | null {
  if (!scenes?.length || !sceneId) return null
  const i = scenes.findIndex((s) => s.id === sceneId)
  return i >= 0 ? i + 1 : null
}

/* הסימנייה של שיעור שנעצר באמצע: העמוד שבו נמצאת הקריאה הפתוחה האחרונה (sessions.live.sceneId, מהדופק החי).
   בלי קריאה פתוחה, בלי דופק או עם עמוד שלא קיים בספר: אין מספר (במדף מוצג "בקריאה" בלי עמוד). */
export interface OpenReading { completed_at?: string | null; last_seen_at?: string | null; live?: { sceneId?: unknown } | null }
export function bookmarkPage(scenes: readonly { id: string }[] | null | undefined, sessions: readonly OpenReading[]): number | null {
  const open = sessions
    .filter((s) => !s.completed_at && typeof s.live?.sceneId === 'string')
    .sort((a, b) => String(b.last_seen_at ?? '').localeCompare(String(a.last_seen_at ?? '')))[0]
  return open ? pageNumberOf(scenes, open.live!.sceneId as string) : null
}
