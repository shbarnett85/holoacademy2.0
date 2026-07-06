import { format } from 'node:util'
import { pino } from 'pino'

/* לוגר מובנה (pino) לכל השרת — מחליף console.* ישיר.
   - dev: פלט קריא (pino-pretty, צבעים, שעה) — חוויית הקריאה של לוגי היצירה נשמרת.
   - production: שורות JSON מובנות (level/time/msg) — נוחות לחיפוש ב-Railway.
   - רמה: LOG_LEVEL מפורש > DEBUG_LOGS=1 (תאימות לאחור) > prod=info / dev=debug.
   ה-API שומר חתימת console (ריבוי ארגומנטים) דרך util.format — כל אתרי הקריאה
   הקיימים (עברית, אובייקטים, מספרים) עובדים כמו שהם. */

const level =
  process.env.LOG_LEVEL ??
  (process.env.DEBUG_LOGS === '1' ? 'debug' : process.env.NODE_ENV === 'production' ? 'info' : 'debug')

export const logger = pino({
  level,
  ...(process.env.NODE_ENV !== 'production'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : {}),
})

export function debug(...args: unknown[]): void {
  logger.debug(format(...args))
}

export function info(...args: unknown[]): void {
  logger.info(format(...args))
}

export function warn(...args: unknown[]): void {
  logger.warn(format(...args))
}

export function error(...args: unknown[]): void {
  logger.error(format(...args))
}
