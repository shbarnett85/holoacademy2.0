/* תוויות עבריות לסוגי חידות — mapping אחד לכל המערכת */
export const PUZZLE_TYPE_LABELS: Record<string, string> = {
  multipleChoice: 'רב-ברירה',
  trueFalse: 'נכון/לא נכון',
  itemUsage: 'שימוש במפתח',
  tileSwap: 'פאזל הזזה',
  slidingPuzzle: 'פאזל הזזה',
  wordSearch: 'חיפוש מילים',
  memory: 'זיכרון',
  wordCompletion: 'השלמת מילים',
  sequenceOrder: 'חידת סדר',
  hangman: 'זיהוי קוד',
  finalQuiz: 'מבחן סיכום',
  moralDilemma: 'שאלת מוסר',
}

export function puzzleTypeLabel(type?: string): string {
  if (!type) return 'חידה'
  return PUZZLE_TYPE_LABELS[type] ?? type
}

/* תוויות עבריות לששת הסגנונות האמנותיים הסופיים */
export const ART_STYLE_LABELS: Record<string, string> = {
  'digital-painting': 'ציור דיגיטלי',
  realistic: 'ריאליסטי',
  comic: 'קומיקס',
  storybook: 'ספר ילדים',
  anime: 'אנימה / מנגה',
  'pixar-3d': 'תלת-ממד מצויר',
}

/* סגנון שהוסר (למשל pixel-art ישן) → fallback ל"ציור דיגיטלי", לא נשבר בתצוגה */
export function artStyleLabel(key?: string): string {
  if (!key) return ART_STYLE_LABELS['digital-painting']
  return ART_STYLE_LABELS[key] ?? ART_STYLE_LABELS['digital-painting']
}
