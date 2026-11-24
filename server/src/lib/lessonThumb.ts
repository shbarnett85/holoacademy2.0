/* תמונת השיעור — מקור אחד לכל הרשימות (ספריית המורה, הספרייה הציבורית, רשימת התלמיד, הפורטל של מסך בחירת השיעורים).
   **תמונת העטיפה** של השיעור (game_data.cover, lib/lessonCover.ts), כשיש: היא מייצגת את השיעור כולו, והיא שונה מהתמונה
   שבפורטל שבתוך השיעור. שיעור בלי עטיפה (עוד לא נוצרה): הסצנה **השנייה** (עולם התוכן), לא הפתיחה, שהיא תמיד מעבדת
   ד"ר הולו. fallback: סצנת הפתיחה → כל תמונה → null. */
interface ThumbScene { id: string; imageUrl?: string | null; nextSceneId?: string | null }
interface ThumbGameData { scenes?: ThumbScene[]; entrySceneId?: string; cover?: { imageUrl?: string | null } | null }

export function lessonThumbUrl(gd: ThumbGameData | null | undefined): string | null {
  if (gd?.cover?.imageUrl) return gd.cover.imageUrl
  const scenes = gd?.scenes ?? []
  const entry = scenes.find((s) => s.id === gd?.entrySceneId) ?? scenes[0]
  if (!entry) return null
  const second = scenes.find((s) => s.id === entry.nextSceneId) ?? scenes[scenes.indexOf(entry) + 1]
  return second?.imageUrl || entry.imageUrl || scenes.find((s) => s.imageUrl)?.imageUrl || null
}
