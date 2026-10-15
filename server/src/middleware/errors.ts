import { error as logError } from '../lib/log.js'
import type { Request, Response, NextFunction } from 'express'

/* שגיאת אפליקציה עם סטטוס HTTP */
export class AppError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message)
  }
}

/* error handler מרכזי — חייב 4 פרמטרים כדי ש-Express יזהה אותו */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    res.status(err.status).json(err.code ? { error: err.message, code: err.code } : { error: err.message })
    return
  }
  logError('שגיאה לא צפויה:', err)
  res.status(500).json({ error: 'שגיאת שרת פנימית' })
}
