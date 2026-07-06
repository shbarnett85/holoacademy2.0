import { supabaseAdmin } from './supabase.js'
import { callHaiku } from './claudeCalls.js'
import type { GameData } from './questSchemas.js'
import { hasContentSafetyLog } from './activeColumn.js'
import { error as logError } from './log.js'

/* ── שכבת בטיחות תוכן (נפרדת לגמרי מ-fact-check — לא בודקת נכונות עובדתית, בודקת
   שהתוכן אינו מייצר בפועל מידע מזיק). שתי נקודות בדיקה: קלט (topic-level, לפני
   Sonnet) ופלט (content-level, על ה-game_data שנוצר, לפני שמירה/חשיפה למורה). ── */

type SafetyCategory =
  | 'weapons' | 'drugs' | 'suicide_method' | 'self_harm_nonlethal'
  | 'sexual_content' | 'csam' | 'graphic_violence' | 'hateful_extremism'
  | 'terrorism_radicalization' | 'fraud_instructions' | 'manipulative_persona'

interface SafetyVerdict { blocked: boolean; category?: SafetyCategory }

/* העיקרון המנחה: ההבחנה היא בין *דיון* בנושא קשה (לגיטימי — שואה, מלחמה, גזענות
   היסטורית, נזקי סמים כבעיה חברתית, דילמות מוסריות) לבין *ייצור בפועל* של תוכן
   מזיק (חסום), גם אם "עטוף" כתוכן לימודי. חסימה לפי "נושא נשמע רגיש" תפגע בתוכן
   חינוכי לגיטימי — האיסור על "האם נוצר כאן מידע מזיק שימושי", לא "האם זה נעים". */
const SAFETY_PRINCIPLE = `אתה שכבת בטיחות תוכן בפלטפורמה חינוכית (K-12, "הדמיות" לימודיות אינטראקטיביות). תפקידך להבחין בין **דיון לגיטימי בנושא קשה** (מותר) לבין **ייצור בפועל של תוכן מזיק** (אסור) — גם אם התוכן המזיק "עטוף" כחומר לימודי לגיטימי למראה.

דוגמאות לגיטימיות מובהקות (אל תחסום): שיעור על השואה, מלחמות, גזענות היסטורית, נזקי סמים/עישון כבעיה חברתית-בריאותית, דילמות מוסריות קשות, אירועים אלימים בהיסטוריה (ברמת תיאור עובדתי, לא גרפי-מפורט).

קטגוריות חסימה (רק אם התוכן *מייצר בפועל* מידע מהסוג הזה, לא רק מזכיר את קיומו):
1. weapons — הוראות/שלבים לייצור או שימוש בנשק, חומרים כימיים/ביולוגיים/רדיולוגיים מסוכנים
2. drugs — הוראות סינתזה, מינון מדויק, או הדרכת-שימוש בסמים
3. suicide_method — שיטות/הוראות ביצוע להתאבדות
4. self_harm_nonlethal — הנחיות ספציפיות לפגיעה עצמית לא-קטלנית או הפרעות אכילה (לא תיאור התופעה כנושא לימודי)
5. sexual_content — תוכן מיני מפורש בכל גיל (לא שייך לפלטפורמת K-12 בכל מקרה)
6. csam — כל רמז לסיכון מיני לקטינים — חסימה מוחלטת ללא יוצא מן הכלל
7. graphic_violence — אלימות גרפית מתוארת בפירוט
8. hateful_extremism — שנאה/הדרה שמנציחה (בניגוד לדיון היסטורי/ביקורתי עליה)
9. terrorism_radicalization — עידוד טרור, רדיקליזציה, או אלימות פוליטית בפועל
10. fraud_instructions — הוראות ביצוע להונאה/זיוף/הנדסה חברתית
11. manipulative_persona — בדיאלוג של דמות מנחה שפונה ישירות לילד: דפוסי בידוד מילד ממבוגרים מהימנים, בניית סודיות בין הדמות לילד, טיפוח תלות רגשית

אל תחסום לפי מילת-מפתח בודדת ("סמים", "נשק", "מוות") — בדוק האם *נוצר בפועל* מידע מזיק שימושי, לא האם הנושא נשמע לא-נעים.

חשוב מאוד: השורה הראשונה בתשובתך היא ה-JSON, ותו לא — ללא הסבר/הנמקה/טקסט לפני או אחרי, גם אם אתה "רוצה" להסביר את שיקול הדעת.`

/* חילוץ JSON סובלני מתשובת בטיחות — Haiku לפעמים מוסיף הנמקה טקסטואלית אחרי ה-JSON
   למרות ההנחיה המפורשת; extractJson הרגיל (JSON.parse קשיח) היה נכשל על טקסט עוקב.
   פונקציה נפרדת ומקומית ל-safety בלבד — לא נוגעת ב-extractJson/fact-check הקיימים. */
function extractSafetyJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) throw new Error('לא נמצא JSON בתשובת הבטיחות')
  return JSON.parse(text.slice(start, end + 1))
}

/* בדיקת קלט — על הנושא/התוכן שהמורה הזין, לפני שהוא מגיע ל-Sonnet ליצירה */
export async function runInputSafetyCheck(title: string, curriculum: string): Promise<SafetyVerdict> {
  const system = `${SAFETY_PRINCIPLE}\n\nהמשימה: קיבלת נושא/בקשה של מורה ליצירת הדמיה לימודית, *לפני* שנוצר ממנה תוכן. שפוט על סמך הבקשה עצמה — האם היא *מכוונת* לייצור תוכן מאחת הקטגוריות (גם אם מנוסחת כ"שיעור על..."), או שהיא בקשה לגיטימית (גם אם בנושא קשה).
החזר JSON תקין בלבד: { "blocked": boolean, "category"?: "אחת מ: weapons|drugs|suicide_method|self_harm_nonlethal|sexual_content|csam|graphic_violence|hateful_extremism|terrorism_radicalization|fraud_instructions|manipulative_persona" }`
  const user = `נושא ההדמיה: ${title}\n\nתוכן הלימוד שהמורה תיאר:\n${curriculum || '(לא סופק)'}`
  try {
    const text = await callHaiku([{ role: 'user', content: user }], 200, system)
    const json = extractSafetyJson(text) as { blocked?: boolean; category?: string }
    return { blocked: !!json.blocked, category: json.category as SafetyCategory | undefined }
  } catch (err) {
    logError('[safety:input] נכשל טכנית — לא חוסמים על כשל טכני:', err instanceof Error ? err.message : err)
    return { blocked: false } /* כשל טכני בבדיקה עצמה לא חוסם יצירה לגיטימית */
  }
}

/* טקסט רחב לבדיקת פלט — כולל גם תשובות/הסברים/דיאלוגים, לא רק נרטיב (תוכן מזיק יכול
   להסתתר בכל שדה טקסט, כולל בתוך חידה) */
function safetyCheckContent(gameData: GameData): string {
  const lines: string[] = []
  for (const s of gameData.scenes) {
    lines.push(`[${s.id}] כותרת: ${s.title}`)
    if (s.narrative) lines.push(`  נרטיב: ${s.narrative}`)
    if (s.drHoloDialog) lines.push(`  דיאלוג ד"ר הולו: ${s.drHoloDialog}`)
    const p = s.puzzle
    if (p?.question) lines.push(`  שאלה: ${p.question}`)
    for (const c of p?.choices ?? []) lines.push(`  תשובה: ${c.text}`)
    if (p?.explanationCorrect) lines.push(`  הסבר: ${p.explanationCorrect}`)
    if (p?.explanationIncorrect) lines.push(`  הסבר: ${p.explanationIncorrect}`)
    if (p?.answer) lines.push(`  תשובה: ${p.answer}`)
    for (const a of p?.answers ?? []) lines.push(`  תשובה: ${a}`)
    if (p?.situation) lines.push(`  דילמה: ${p.situation}`)
    for (const mc of p?.moralChoices ?? []) { lines.push(`  בחירה: ${mc.text}`); lines.push(`  השלכה: ${mc.consequence}`) }
    for (const q of p?.questions ?? []) {
      lines.push(`  שאלת מבחן: ${q.question}`)
      for (const o of q.options ?? []) lines.push(`    אפשרות: ${o}`)
    }
  }
  return lines.join('\n')
}

/* בדיקת פלט — על ה-game_data שנוצר בפועל. חוסמת (רשת ביטחון) גם אם הבקשה עברה
   את בדיקת הקלט — עקיפה מוצלחת יכולה להניב פלט בעייתי גם מבקשה תמימה-למראה. */
export async function runOutputSafetyCheck(gameData: GameData): Promise<SafetyVerdict & { excerpt?: string }> {
  const content = safetyCheckContent(gameData)
  if (!content.trim()) return { blocked: false }
  const system = `${SAFETY_PRINCIPLE}\n\nהמשימה: קיבלת תוכן הדמיה לימודית שכבר *נוצר בפועל*. בדוק אם התוכן עצמו (לא הכוונה מאחוריו) מכיל מידע מאחת הקטגוריות.
החזר JSON תקין בלבד: { "blocked": boolean, "category"?: "<קטגוריה>", "excerpt"?: "ציטוט קצר (עד 200 תווים) מהקטע הבעייתי, לצורך ביקורת אנושית בלבד" }

חשוב מאוד: השורה הראשונה בתשובתך היא ה-JSON, ותו לא — ללא הסבר/הנמקה לפני או אחרי.`
  try {
    const text = await callHaiku([{ role: 'user', content }], 400, system)
    const json = extractSafetyJson(text) as { blocked?: boolean; category?: string; excerpt?: string }
    return {
      blocked: !!json.blocked,
      category: json.category as SafetyCategory | undefined,
      excerpt: json.excerpt?.slice(0, 200),
    }
  } catch (err) {
    logError('[safety:output] נכשל טכנית — לא חוסמים על כשל טכני:', err instanceof Error ? err.message : err)
    return { blocked: false }
  }
}

/* לוג חסימות — best-effort, לעולם לא זורק (כשל בלוג לא אמור להפיל את הבקשה).
   עמיד לפני המיגרציה דרך hasContentSafetyLog. */
export async function logContentSafety(entry: {
  teacherId?: string
  questId?: string
  stage: 'input' | 'output'
  category?: string
  title?: string
  excerpt?: string
}): Promise<void> {
  try {
    if (!(await hasContentSafetyLog())) return
    await supabaseAdmin.from('content_safety_log').insert({
      teacher_id: entry.teacherId ?? null,
      quest_id: entry.questId ?? null,
      stage: entry.stage,
      category: entry.category ?? 'unknown',
      input_title: entry.title ?? null,
      input_excerpt: entry.excerpt ?? null,
    })
  } catch (err) {
    logError('[safety:log] כתיבת לוג נכשלה (לא חוסם):', err instanceof Error ? err.message : err)
  }
}

/* הודעה כללית למורה — לא טכנית, לא חושפת את מנגנון הבדיקה או הקטגוריה שזוהתה */
export const SAFETY_BLOCK_MESSAGE = 'לא ניתן היה ליצור הדמיה עבור הבקשה הזו. נסו לנסח את נושא ההדמיה או תוכן הלימוד באופן אחר.'
