/* סדר ההסברים באתגר התאמת זוגות. rows[שורה] = מספר הזוג שההסבר שלו מוצג בשורה הזאת */

/* ערבוב שלא משאיר אף הסבר מול המושג שלו: אחרת הזוג הזה נפתר בלי לקרוא */
export function shuffledPairOrder(count: number, random: () => number = Math.random): number[] {
  const rows = Array.from({ length: count }, (_, i) => i)
  if (count < 2) return rows
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * i)
    ;[rows[i], rows[j]] = [rows[j], rows[i]]
  }
  return rows
}

/* זוג שנפתר: ההסבר עובר לשורה של המושג, וההסבר שישב שם מתחלף איתו */
export function alignPair(rows: readonly number[], pair: number): number[] {
  const next = [...rows]
  const from = next.indexOf(pair)
  ;[next[from], next[pair]] = [next[pair], next[from]]
  return next
}
