import { Router } from 'express'
import { z } from 'zod'
import { claude } from '../lib/claude.js'
import { AppError } from '../middleware/errors.js'
import { requireStaff } from '../middleware/staffAuth.js'
import { callHaiku } from '../lib/claudeCalls.js'
import { extractJson } from '../lib/questSchemas.js'
import { useGeminiForFacts, callGeminiText } from '../lib/gemini.js'
import { engineFor } from '../lib/modelRouter.js'
import { warn } from '../lib/log.js'

export const aiRouter = Router()

const enhanceSchema = z.object({
  title: z.string().optional(),
  content: z.string(),
  writingLevel: z.number().int().min(1).max(16).optional(),
  questType: z.string().optional(),
})

/* תרגום סקלת רמת הכתיבה 1-16 לשכבת גיל + הנחיית עומק */
function ageTierGuidance(level: number): string {
  if (level <= 3)
    return 'כיתות א-ג (גיל 6-9): מושגים בסיסיים מאוד, שפה פשוטה וקצרה, דוגמאות מוחשיות מעולמם של ילדים צעירים, ללא הפשטה כלל.'
  if (level <= 6)
    return 'כיתות ד-ו (גיל 9-12): מושגי יסוד עם הסבר, סיפוריות, והתחלה של חשיבה סיבתית (סיבה ותוצאה).'
  if (level <= 9)
    return 'חטיבת ביניים (גיל 12-15): מושגים מורכבים יותר, הקשר היסטורי/מדעי, וחשיבה ביקורתית בסיסית.'
  if (level <= 12)
    return 'תיכון (גיל 15-18): עומק אנליטי, מושגים מופשטים, ניתוח רב-ממדי, ומונחים מקצועיים מדויקים.'
  return 'רמה על-תיכונית/מתקדמת (גיל 18+): עומק אקדמי, מורכבות מושגית גבוהה, ניואנסים, חשיבה מערכתית ומופשטת, ופרספקטיבות מגוונות.'
}

/* הנחיית זווית ההעשרה לפי סוג ההדמיה */
function questTypeGuidance(type?: string): string {
  if (type === 'tour')
    return 'סוג ההדמיה הוא **סיור** (tour): הדגש נקודות עניין, פלא וגילוי, תופעות מסקרנות וזוויות חזותיות שמזמינות חקירה חופשית — ללא בעיה מרכזית לפתרון.'
  return 'סוג ההדמיה הוא **הרפתקה** (adventure): הדגש זוויות דרמטיות, מתחים, קונפליקטים ודילמות — חומר שיכול להפוך למשימה מרכזית עם מתח עלילתי ורגע הכרעה.'
}

function buildEnhancePrompt(p: { title?: string; content: string; writingLevel?: number; questType?: string }): string {
  const level = p.writingLevel ?? 7
  return `אתה עוזר פדגוגי המסייע למורה להעשיר תיאור של חומר לימוד, כבסיס ליצירת משחק לומדה אינטראקטיבי בעברית.

## הקשר
- כותרת ההדמיה: ${p.title?.trim() || '(ללא כותרת — הסק מהתוכן)'}
- התיאור הגולמי שהמורה כתב: ${p.content.trim() || '(ריק — הסק נושא לימודי סביר מהכותרת)'}

## רמת הכתיבה (קריטי!)
התאם את עומק התוכן, אוצר המילים והמורכבות המושגית במדויק ל:
${ageTierGuidance(level)}

## זווית ההעשרה
${questTypeGuidance(p.questType)}

## דיוק עובדתי (קריטי — גובר על "זווית ההעשרה")
אם הנושא הוא דמות, מקום או אירוע היסטורי/אמיתי ספציפי — השתמש **אך ורק בעובדות שאתה בטוח בהן**. אם אינך מכיר בוודאות את הדמות/הנושא הספציפי הזה — **אל תמציא ביוגרפיה, דמות, תאריכים, מקומות או סיפור**. במקרה כזה העשר בזהירות רק במה שבטוח, או הישאר כללי — **עדיף העשרה דלה ונכונה מאשר סיפור מומצא**. לעולם אל תבדה שמות, שנים, מקצועות, מקומות או אירועים כדי "למלא" תוכן, וזאת גם כשמבוקש להדגיש דרמה ומתח. **אל תשנה את תחום העיסוק/הפעילות המרכזי של הדמות** (פעיל שוק-חופשי אינו פעיל סביבתי; כלכלן אינו אמן) — הצג אותה בעיסוקה האמיתי גם אם תחום אחר "דרמטי" יותר.

## הפלט — בעברית בלבד, בדיוק במבנה הבא וללא שום הקדמה או טקסט נוסף:
1. שורה ראשונה: 5-8 מילות מפתח / מושגי ליבה שההדמיה צריכה לכסות, מופרדות בפסיקים (רק המילים, בשורה אחת, ללא כותרת).
2. שורה ריקה.
3. פסקה לימודית מפורטת שמרחיבה את הנושא — הקשר רחב, נקודות עניין, עובדות מסקרנות וזוויות פדגוגיות — **מותאמת לרמת הכתיבה ולסוג ההדמיה שלמעלה** (גם בעומק וגם באוצר המילים).
אל תוסיף כותרות, מספור, סימני רשימה או טקסט מעבר לשני החלקים האלה.`
}

/* POST /api/ai/enhance-content — העשרת תוכן הלימוד הגולמי, מותאם לרמה ולסוג ההדמיה */
aiRouter.post('/enhance-content', async (req, res, next) => {
  try {
    const parsed = enhanceSchema.safeParse(req.body)
    if (!parsed.success) throw new AppError(400, 'בקשה לא תקינה')
    const prompt = buildEnhancePrompt(parsed.data)

    /* "שפר עם AI" מבקש "עובדות מסקרנות" על הנושא — ולכן על נושא אזוטרי Claude יבדה
       (כמו ביצירה). כשהעיגון מופעל (GROUNDING=1) — Gemini מעשיר (כיסוי זנב-ארוך);
       כבוי/כשל → Claude Sonnet כרגיל (fallback graceful, לא שובר את הפיצ'ר). */
    let enhanced = ''
    if (useGeminiForFacts()) {
      try { enhanced = (await callGeminiText(prompt, 8000)).trim() } catch (e) {
        warn('[enhance] Gemini נכשל → Claude:', e instanceof Error ? e.message : e)
      }
    }
    if (!enhanced) {
      const response = await claude.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      })
      const block = response.content.find((b) => b.type === 'text')
      enhanced = block && block.type === 'text' ? block.text.trim() : ''
    }
    if (!enhanced) throw new AppError(502, 'תשובה ריקה')

    res.json({ enhanced })
  } catch (err) {
    next(err)
  }
})

/* POST /api/ai/extract-objectives — חילוץ 3-5 יעדי למידה מנוסחים ממוקד-תלמיד מתוך
   הנושא ותוכן הלימוד (haiku — משימת חילוץ זולה). משמש את כפתור "חלץ אוטומטית"
   בטופס היצירה; המורה עורך את התוצאה לפני היצירה. */
const extractObjectivesSchema = z.object({
  title: z.string().optional(),
  curriculum: z.string().default(''),
})

aiRouter.post('/extract-objectives', requireStaff, async (req, res, next) => {
  try {
    const parsed = extractObjectivesSchema.safeParse(req.body)
    if (!parsed.success) throw new AppError(400, 'בקשה לא תקינה')
    const { title, curriculum } = parsed.data
    if (!title?.trim() && !curriculum.trim()) throw new AppError(400, 'נדרש נושא או תוכן לימוד')

    const instruction = `אתה יועץ פדגוגי. חלץ מהנושא ותוכן הלימוד הבאים 3-5 יעדי למידה מדידים.

כללים:
- כל יעד במשפט אחד קצר בעברית, מנוסח כיכולת של התלמיד ("התלמיד יסביר/יזהה/ישווה/ימיין...").
- יעדים נבדלים זה מזה — לא ניסוחים שונים של אותו רעיון.
- ברמת הליבה של החומר (לא טריוויה שולית).
- החזר JSON תקין בלבד: { "objectives": ["יעד 1", "יעד 2", ...] } — ללא טקסט נוסף.

נושא: ${title?.trim() || '(לא סופק)'}
תוכן הלימוד:
${curriculum.trim() || '(לא סופק — הסק מהנושא)'}`

    const text = engineFor('objectives') === 'gemini' ? await callGeminiText(instruction, 4000, true) : await callHaiku([{ role: 'user', content: instruction }], 800)
    const json = extractJson(text) as { objectives?: unknown }
    const objectives = (Array.isArray(json.objectives) ? json.objectives : [])
      .filter((o): o is string => typeof o === 'string' && o.trim().length > 0)
      .map((o) => o.trim())
      .slice(0, 5)
    if (objectives.length === 0) throw new AppError(502, 'לא הצלחתי לחלץ יעדים — נסו להרחיב את תוכן הלימוד')
    res.json({ objectives })
  } catch (err) {
    next(err)
  }
})
