import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/* רגרסיית פרטיות (חוק 12): שם תלמיד לעולם לא נשלח ל-LLM חיצוני.
   בעבר: הסיכום הפדגוגי הישן ב-analytics.ts שלח כינוי ("תלמיד/ה 1") והחליף אותו בשם אחרי התשובה, ובדיקת מקור אכפה את הדפוס הזה.
   עכשיו הנתיב הישן הופרש (410) והקובץ analytics.ts **אינו קורא למודל בכלל** — ההבטחה חזקה יותר: אין בו מה לדלוף.
   הסיכום החדש (lib/aiSummary) נבדק ב-inputs.test.ts (canary על 631 מקורות), guard.test.ts ו-aiSummary.http.test.ts. */
const src = readFileSync(resolve(__dirname, '../routes/analytics.ts'), 'utf8')

describe('analytics.ts — אין קריאה ל-LLM ולכן אין שם תלמיד שיגיע אליו', () => {
  it('אין ייבוא של מודל (claude / gemini / modelRouter) ואין פרומפט או קריאת סיכום', () => {
    expect(src).not.toMatch(/from '\.\.\/lib\/(claude|gemini|modelRouter)\.js'/)
    expect(src).not.toMatch(/callSonnetSummary|buildPedagogicalPrompt|callGeminiText|claude\.messages/)
  })
  it('אין מנגנון כינוי→שם (STUDENT_ALIAS): הנתיב הישן לא שולח כלום', () => {
    expect(src).not.toMatch(/STUDENT_ALIAS/)
  })
  it('נתיבי /summary הישנים: POST ו-PATCH מחזירים 410, GET "אין סיכום"', () => {
    const zone = src.slice(src.indexOf('סיכום פדגוגי (נתיב ישן)'), src.indexOf('GET /api/analytics/review-suggestions'))
    expect(zone).toContain("analyticsRouter.get('/summary'")
    expect(zone).toContain("analyticsRouter.post('/summary'")
    expect(zone).toContain("analyticsRouter.patch('/summary'")
    expect(zone.match(/new AppError\(410, ERR_LEGACY_SUMMARY_MOVED\)/g)).toHaveLength(2)
  })
})
