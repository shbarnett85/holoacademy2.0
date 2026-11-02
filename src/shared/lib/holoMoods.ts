/* מצבי הרוח של ד"ר הולו במסכי המעבדה: רשימה סגורה, משותפת ללקוח ולשרת. לכל מצב רוח קטע וידאו ותמונה (public/dr-holo).
   יצירת התוכן בוחרת שניים: פתיחה וסיפור שנסגר. ערך שלא ברשימה הופך ל"רגיל".
   סיפור שנשאר פתוח: תמיד "עצוב", מבט למטה ואכזבה קלה שמזמינה לנסות שוב, ולכן מה ששמור בשיעור לא קובע.
   לשיעור בלי השדה יש ברירות מחדל: פתיחה רגיל, נסגר שמח. */
export const HOLO_MOODS = ['neutral', 'happy', 'celebrating', 'amused', 'surprised', 'thinking', 'sad', 'angry', 'scared'] as const
export type HoloMood = (typeof HOLO_MOODS)[number]

export const HOLO_MOOD_LABELS: Record<HoloMood, string> = {
  neutral: 'רגיל', happy: 'שמח', celebrating: 'חוגג', amused: 'משועשע', surprised: 'מופתע', thinking: 'חושב', sad: 'עצוב', angry: 'כועס', scared: 'מפוחד',
}

export interface LabMoods { opening: HoloMood; closed: HoloMood; open: HoloMood }
export const DEFAULT_LAB_MOODS: LabMoods = { opening: 'neutral', closed: 'happy', open: 'sad' }

/* מקבל גם את השם בעברית, כי המודל עלול להחזיר אותו */
export function normalizeHoloMood(value: unknown): HoloMood {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if ((HOLO_MOODS as readonly string[]).includes(v)) return v as HoloMood
  return HOLO_MOODS.find((m) => HOLO_MOOD_LABELS[m] === v) ?? 'neutral'
}

/* השדה חסר: ברירות המחדל. השדה קיים: כל ערך נבדק לבד, ומה שלא ברשימה הופך ל"רגיל" */
export function labMoodsOf(holoMoods: unknown): LabMoods {
  if (!holoMoods || typeof holoMoods !== 'object') return DEFAULT_LAB_MOODS
  const m = holoMoods as Record<string, unknown>
  return { opening: normalizeHoloMood(m.opening), closed: normalizeHoloMood(m.closed), open: DEFAULT_LAB_MOODS.open }
}
