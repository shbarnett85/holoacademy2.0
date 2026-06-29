/* טקסטי ה-tooltip ליוצר ההדמיות (CreationForm).
   ⚠️ למילוי ע"י המורה — כל הערכים ריקים כרגע; בועה לא מוצגת עד שיש טקסט.
   מפתח חידה/אופציה תואם ל-key במקור (creatorStore / SIM_TYPES). */

export const TT_PUZZLE: Record<string, string> = {
  multipleChoice: '',
  trueFalse: '',
  tileSwap: '',
  wordSearch: '',
  memory: '',
  wordCompletion: '',
  sequenceOrder: '',
  hangman: '',
  moralDilemma: '',
  itemUsage: '',
  finalQuiz: '',
}

export const TT_SIM: Record<string, string> = {
  adventure: '',
  tour: '',
}

export const TT_ART: Record<string, string> = {
  'digital-painting': '',
  realistic: '',
  comic: '',
  storybook: '',
  anime: '',
  'pixar-3d': '',
}

/* בקרות יחידות */
export const TT = {
  puzzleCount: '',     /* כפתורי כמות (1-5) לכל חידה */
  finalQuizCount: '',  /* כפתורי מספר שאלות (3-10) למבחן הסיכום */
  title: '',           /* שדה נושא ההדמיה */
  subject: '',         /* בורר מקצוע */
  curriculum: '',      /* שדה תוכן הלימוד */
  enhance: '',         /* כפתור שפר עם AI */
  length: '',          /* סליידר אורך ההדמיה */
  generate: '',        /* כפתור צור הדמיה */
  ageLevel: '',        /* סליידר שכבת גיל */
  difficulty: '',      /* סליידר קושי חידות */
  drHolo: '',          /* טוגל ד"ר הולו */
}
