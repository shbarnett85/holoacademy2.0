/* ── שכבת מודל אחידה: בחירת מנוע (Gemini/Claude) פר-רכיב, עם feature-flags לנסיגה ──
   כל אתר-קריאה שואל engineFor(role) ומנתב בהתאם. קוד Claude נשאר כ-else-branch (ארכוב,
   לא מחיקה) → נסיגה מיידית ע"י שינוי env, בלי deploy.

   flags (env):
     CONTENT_GEMINI=1        — master: כל תפקידי התוכן (לא-בטיחות) → Gemini
     SAFETY_GEMINI=1         — **עצמאי**: בטיחות → Gemini (בלי לגעת בשאר; ראו הערת #3)
     CONTENT_CLAUDE_ROLES=a,b — נסיגה פר-רכיב: תפקידים אלה נשארים Claude גם כש-master דלוק
   כולם דורשים GEMINI_API_KEY; בהיעדרו — הכול נשאר Claude (כמו GROUNDING).
   ברירת מחדל (בלי env): Claude בכל מקום — התנהגות היום, בטוח. */
import { hasGeminiKey } from './gemini.js'

export type Role =
  | 'generation' | 'variantPuzzles' | 'factcheck' | 'objectives'
  | 'variantText' | 'phrasing' | 'rephrase' | 'summary' | 'recover' | 'imageprompt'
  | 'safety'

const on = (v: string | undefined) => {
  const f = (v ?? '').trim().toLowerCase()
  return f === '1' || f === 'true' || f === 'on' || f === 'yes'
}

export function engineFor(role: Role): 'gemini' | 'claude' {
  if (!hasGeminiKey()) return 'claude'
  if (role === 'safety') return on(process.env.SAFETY_GEMINI) ? 'gemini' : 'claude'
  if (!on(process.env.CONTENT_GEMINI)) return 'claude'
  /* ברירת מחדל כשה-env לא מוגדר: fact-check נשאר Claude/Haiku — Gemini החזיר JSON שבור
     ב-~50% מריצות הבדיקה (אימות-מול-המקור, קטגוריה 9, עובד על שני המנועים). לדרוס:
     CONTENT_CLAUDE_ROLES=none (או כל רשימה בלי factcheck) → הכול Gemini. */
  const keep = (process.env.CONTENT_CLAUDE_ROLES ?? 'factcheck').split(',').map((s) => s.trim()).filter(Boolean)
  return keep.includes(role) ? 'claude' : 'gemini'
}

export const isGemini = (role: Role) => engineFor(role) === 'gemini'
