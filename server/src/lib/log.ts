/* לוגים מדורגים — debug מושתק בפרודקשן (אלא אם DEBUG_LOGS=1), info תמיד.
   מחליף console.log ישיר בנתיבי הקוד הפטפטניים (variant/phrasing) כדי שלוגי
   הפרודקשן יישארו טלמטריה מכוונת בלבד (זמני יצירה, טוקנים, fact-check). */

const debugEnabled = process.env.NODE_ENV !== 'production' || process.env.DEBUG_LOGS === '1'

export function debug(...args: unknown[]): void {
  if (debugEnabled) console.log(...args)
}

export function info(...args: unknown[]): void {
  console.log(...args)
}
