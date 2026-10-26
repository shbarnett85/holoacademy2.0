/* תמונה ממוזערת של שיעור — מקור אחד לכל הרשימות (ספריית המורה, הספרייה הציבורית, רשימת התלמיד, מדף "התנסו עכשיו").
   הסצנה **השנייה** (עולם התוכן), לא הפתיחה: סצנת הפתיחה היא תמיד מעבדת ד"ר הולו, וכל הכרטיסים נראו זהים.
   fallback: סצנת הפתיחה → כל תמונה → null. */
interface ThumbScene { id: string; imageUrl?: string | null; nextSceneId?: string | null }
interface ThumbGameData { scenes?: ThumbScene[]; entrySceneId?: string }

export function lessonThumbUrl(gd: ThumbGameData | null | undefined): string | null {
  const scenes = gd?.scenes ?? []
  const entry = scenes.find((s) => s.id === gd?.entrySceneId) ?? scenes[0]
  if (!entry) return null
  const second = scenes.find((s) => s.id === entry.nextSceneId) ?? scenes[scenes.indexOf(entry) + 1]
  return second?.imageUrl || entry.imageUrl || scenes.find((s) => s.imageUrl)?.imageUrl || null
}
