/* לוח משחק הזיכרון: ריבוע (4×4, 6×6), ואם מספר הקלפים לא מאפשר — המלבן השלם הקרוב ביותר לריבוע (3×4).
   הצד הארוך הוא העמודות, חוץ מחלון שגבוה יותר מרוחבו */
export function memoryGrid(cards: number, boxW = 1, boxH = 0): { cols: number; rows: number } {
  let short = 1
  for (let d = 1; d * d <= cards; d++) if (cards % d === 0) short = d
  const long = cards / short
  return boxH > boxW ? { cols: short, rows: long } : { cols: long, rows: short }
}
