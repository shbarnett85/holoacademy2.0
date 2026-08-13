/* ── מי יושב איפה: פאנל צדדי מול במה מרכזית ─────────────────────────────────
   הכלל הוא **סוג האינטראקציה**, לא סוג האתגר:

   · תשובה שהיא טקסט/בחירה → נשארת בפאנל. היא המשך ישיר של דברי ד"ר הולו —
     הוא שאל, התלמיד עונה, באותו מקום ובלי מעבר-מצב.
   · תשובה שהיא מניפולציה (גרירה, סידור, התאמה, פענוח) → במה מרכזית, כי היא
     דורשת מרחב ומטרות מגע נדיבות.

   השאלה שקובעת היא "מה התלמיד עושה בידיים", ולכן hangman (בחירת אותיות מתוך
   רשת) יושב בבמה למרות שהתשובה היא מילה, ו-wordCompletion (הקלדה/בחירה מבנק)
   נשאר בפאנל למרות שיש בו אינטראקציה. */
export type Placement = 'panel' | 'stage'

const STAGE_TYPES = new Set([
  'tileSwap',
  'slidingPuzzle', /* alias היסטורי ל-tileSwap */
  'sequenceOrder',
  'memory',
  'wordSearch',
  'hangman',
])

export function placementFor(type?: string): Placement {
  return type && STAGE_TYPES.has(type) ? 'stage' : 'panel'
}

export const isStagePuzzle = (type?: string) => placementFor(type) === 'stage'
