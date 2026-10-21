import { describe, expect, it } from 'vitest'
import {
  ERR_ANALYSIS_WARMING, ERR_V2_BAD_REQUEST, ERR_V2_FORBIDDEN, ERR_V2_GENERIC, ERR_V2_NOT_FOUND, ERR_V2_RATE_LIMIT, ERR_V2_UNAUTHORIZED, ERR_V2_UNAVAILABLE,
} from '../../shared/lib/findingsNarrative'
import { isRetryable, toV2Error, V2Error, v2ErrorMessage } from './errors'

describe('v2ErrorMessage — עברית פשוטה לפי הסטטוס', () => {
  it('400/401/404/429: הודעה קבועה, גם כשהשרת שלח טקסט אחר', () => {
    expect(v2ErrorMessage(400, 'bad')).toBe(ERR_V2_BAD_REQUEST)
    expect(v2ErrorMessage(401, 'Unauthorized')).toBe(ERR_V2_UNAUTHORIZED)
    expect(v2ErrorMessage(404, 'לא נמצא')).toBe(ERR_V2_NOT_FOUND)
    expect(v2ErrorMessage(429, 'יותר מדי ניסיונות — נסו שוב בעוד דקה')).toBe(ERR_V2_RATE_LIMIT)
  })

  it('403: ההסבר של השרת כשהוא בעברית; אחרת הודעה קבועה', () => {
    expect(v2ErrorMessage(403, 'אין הרשאה לצפות בנתון זה')).toBe('אין הרשאה לצפות בנתון זה')
    expect(v2ErrorMessage(403, 'Forbidden')).toBe(ERR_V2_FORBIDDEN)
    expect(v2ErrorMessage(403)).toBe(ERR_V2_FORBIDDEN)
  })

  it('503: ההודעה של השרת כפי שהיא ("אנחנו מרכזים…"), ובלעדיה — "השירות אינו זמין"', () => {
    expect(v2ErrorMessage(503, ERR_ANALYSIS_WARMING)).toBe(ERR_ANALYSIS_WARMING)
    expect(v2ErrorMessage(503, 'upstream down')).toBe(ERR_V2_UNAVAILABLE)
    expect(v2ErrorMessage(503)).toBe(ERR_V2_UNAVAILABLE)
  })

  it('500, אין חיבור (0) וכל סטטוס אחר: הודעה כללית; טקסט טכני מהשרת אינו מוצג', () => {
    expect(v2ErrorMessage(500, 'תגובת אנליטיקה אינה עומדת בחוזה')).toBe(ERR_V2_GENERIC)
    expect(v2ErrorMessage(0)).toBe(ERR_V2_GENERIC)
    expect(v2ErrorMessage(502, 'Bad gateway')).toBe(ERR_V2_GENERIC)
  })

  it('אין ז׳רגון בהודעות ואין אימוג׳י', () => {
    for (const m of [ERR_V2_BAD_REQUEST, ERR_V2_UNAUTHORIZED, ERR_V2_FORBIDDEN, ERR_V2_NOT_FOUND, ERR_V2_RATE_LIMIT, ERR_V2_GENERIC, ERR_V2_UNAVAILABLE]) {
      expect(m).not.toMatch(/וקטור|מובהק|אינדקס|קורלצי|\bBH\b|\bp\b|HTTP|שגיאה \d/i)
      expect(m).not.toMatch(/\p{Extended_Pictographic}/u)
      expect(m.length).toBeGreaterThan(10)
    }
  })
})

describe('isRetryable — "נסו שוב" רק כשיש טעם', () => {
  it('תקלה זמנית / עומס / אין חיבור: כן', () => {
    for (const s of [0, 429, 500, 502, 503, 504]) expect(isRetryable(s), String(s)).toBe(true)
  })
  it('בקשה לא תקינה / התחברות / הרשאה / לא נמצא: לא (נסיון חוזר לא יתקן)', () => {
    for (const s of [400, 401, 403, 404]) expect(isRetryable(s), String(s)).toBe(false)
  })
})

describe('V2Error', () => {
  it('נושא סטטוס והודעה, וניתן לזיהוי', () => {
    const e = new V2Error(503, 'x')
    expect(e).toBeInstanceOf(Error)
    expect(e.status).toBe(503)
    expect(e.message).toBe('x')
    expect(toV2Error(e)).toBe(e)
  })
  it('כל דבר אחר הופך לשגיאת "אין חיבור" (0) — לא נזרק הלאה כטקסט גולמי', () => {
    expect(toV2Error(new TypeError('Failed to fetch')).status).toBe(0)
    expect(toV2Error('boom').status).toBe(0)
  })
})
