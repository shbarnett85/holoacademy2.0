/* גופן הסיפור: טקסט העלילה בלבד עובר לגופן Frank Ruhl Libre, מרמת טקסט STORY_FONT_MIN_LEVEL ומעלה (סולם 1 עד 20).
   מתחת לסף, או בשיעור בלי רמת טקסט שמורה: הגופן הנקי הקיים. כותרות, כפתורים, HUD וכל שאר הממשק לא משתנים.
   הרמה היא רמת הטקסט של מה שהתלמיד קורא בפועל (game_data.readingScale: רמת המורה בבסיס, רמת התלמיד בגרסה אישית).
   לשינוי הסף: משנים את המספר כאן בלבד. */
export const STORY_FONT_MIN_LEVEL = 8

export const STORY_FONT_FAMILY = 'Frank Ruhl Libre'

export function usesStoryFont(level: number | null | undefined): boolean {
  if (level == null) return false
  const n = Number(level)
  return Number.isFinite(n) && n >= STORY_FONT_MIN_LEVEL
}
