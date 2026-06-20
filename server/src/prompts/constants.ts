/* תיאור הזהות הקבועה של ד"ר הולו — מאפיינים יציבים בלבד (גיל, זקן, שיער, פנים, משקפיים, חלוק).
   בלי הבעת פנים! ההבעה משתנה לפי טון הסצנה (drHoloExpression) ומצורפת בנפרד בעת יצירת התמונה. */
export const DR_HOLO_DESCRIPTION =
  'a man in his early 50s with a thick full white beard and short white hair, a round face, thick glowing cyan square-rimmed glasses, wearing a translucent sapphire blue lab coat with glowing blue-cyan circuit patterns over a dark navy shirt'

/* הבעת ברירת מחדל כשהסצנה לא ציינה אחת — נייטרלית-חמה, לא קובעת מצב רוח חזק */
export const DR_HOLO_DEFAULT_EXPRESSION = 'a calm, attentive expression'

/* בניית תיאור מלא של ד"ר הולו: הזהות הקבועה + ההבעה המשתנה של הסצנה */
export function drHoloWithExpression(expression?: string | null): string {
  const expr = expression?.trim() || DR_HOLO_DEFAULT_EXPRESSION
  return `${DR_HOLO_DESCRIPTION}, his face showing ${expr}`
}

/* ה-placeholder שה-AI כותב ב-imagePrompt — מוחלף בתיאור הקבוע לפני יצירת התמונה */
export const DR_HOLO_PLACEHOLDER = '{DR_HOLO}'
