import { Router } from 'express'
import { z } from 'zod'
import { claude } from '../lib/claude.js'
import { AppError } from '../middleware/errors.js'

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

    const response = await claude.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      messages: [{ role: 'user', content: buildEnhancePrompt(parsed.data) }],
    })

    const block = response.content.find((b) => b.type === 'text')
    const enhanced = block && block.type === 'text' ? block.text.trim() : ''
    if (!enhanced) throw new AppError(502, 'תשובה ריקה מ-Claude')

    res.json({ enhanced })
  } catch (err) {
    next(err)
  }
})
