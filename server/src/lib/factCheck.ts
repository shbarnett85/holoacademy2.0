import { supabaseAdmin } from './supabase.js'
import { callHaiku } from './claudeCalls.js'
import { callGeminiText } from './gemini.js'
import { engineFor } from './modelRouter.js'
import { extractJson, checkAnswerConsistency, type FactCheckMeta, type GameData } from './questSchemas.js'
import { enforceNarrativePhrasing, applyNiqqudToGameData } from './questVariants.js'
import type { FormOfAddress } from '../prompts/questPrompt.js'
import { info, error as logError } from './log.js'

/* ── שכבה 2: בדיקת עובדות (fact-check) ── */

export interface FactError {
  sceneId?: string
  problem: string
  correction?: string
}

/* התוכן הטקסטואלי הנבדק — כותרות, נרטיבים ושאלות חידה (לא imagePrompt). sceneIds? = רק סצנות אלו. */
function factCheckContent(gameData: GameData, sceneIds?: string[]): string {
  const lines: string[] = []
  for (const s of gameData.scenes) {
    if (sceneIds && !sceneIds.includes(s.id)) continue
    lines.push(`[${s.id}] כותרת: ${s.title}`)
    if (s.narrative) lines.push(`  נרטיב: ${s.narrative}`)
    if (s.drHoloDialog) lines.push(`  דיאלוג ד"ר הולו: ${s.drHoloDialog}`)
    if (s.puzzle?.question) {
      lines.push(`  שאלה: ${s.puzzle.question}`)
      /* לנכון/לא-נכון ורב-ברירה — מצרפים את התשובה המסומנת כנכונה, כדי שהבודק
         יוכל להעריך אם היא נכונה עובדתית (בלעדיה ההיגד נבדק בחלל ריק). */
      if (s.puzzle.type === 'trueFalse' || s.puzzle.type === 'multipleChoice') {
        const marked = s.puzzle.choices?.find((c) => c.isCorrect)?.text
        if (marked) lines.push(`    התשובה המסומנת כנכונה: ${marked}`)
      }
    }
    for (const q of s.puzzle?.questions ?? []) lines.push(`  שאלת מבחן: ${q.question}`)
  }
  return lines.join('\n')
}

/* בדיקת עובדות על haiku (משימת זיהוי פשוטה — מהיר פי כמה מ-sonnet). מחזיר ok=false אם נכשלה טכנית.
   sceneIds? — לבדוק רק סצנות מסוימות (לבדיקה החוזרת אחרי תיקון). */
export async function runFactCheck(gameData: GameData, sceneIds?: string[]): Promise<{ ok: boolean; errors: FactError[] }> {
  const content = factCheckContent(gameData, sceneIds)
  if (!content.trim()) return { ok: true, errors: [] }
  const instruction = `אתה בודק עובדות **ותקניות-לשון** בכלי חינוכי לילדי בית ספר יסודי. עבור על התוכן הבא וזהה שמונה סוגי בעיות (בעברית עכשווית, לא סגנון ספרותי):

1. **שגיאות עובדתיות/היסטוריות/אנכרוניזמים** — דמות בתקופה הלא נכונה, מבנה שטרם נבנה או כבר נהרס, טכנולוגיה שטרם הומצאה, נתון/תאריך/קשר שגוי.
2. **ביטויים מדעיים/לוגיים חסרי-משמעות או מטעים** — ניסוח שנשמע "מדעי" אך אין לו פשר אמיתי או שמטעה תפיסתית (למשל "גביש של אוויר", "אנרגיה שלילית של חום"), **גם אם הרעיון הכללי מאחוריו נכון**. דגל את הביטוי והצע ניסוח מדעי תקין.
3. **כפל-תרגום בשם לועזי** — מילת-תפקיד עברית לפני שם לועזי שכבר מכיל אותה (למשל "כנסיית ווסטמינסטר אביי" = כנסייה+Abbey, "נהר התמזה ריבר", "מדבר הסהרה" = מדבר+صحراء). דגל והצע את השם המקובל בעברית.
4. **בלבולי מילים דומות-צליל (החמורה שבטעויות הלשון)** — מילה שנשמעת דומה אך שונה לגמרי במשמעות, "נשמעת נכון" לילד שרוכש קריאה. דוגמאות (חפש גם דפוסים דומים שלא ברשימה): חשוב/קשוב, ניכר/ניגר, מסוגל/מסוגר, נדמה/נרדם, מְשַׁדֵּךְ (=matchmaking)/מְשַׁגֵּר-מְשַׁנֵּעַ-מַעֲבִיר, **צָדוּ** (=hunted, מ"לצוד")/**צִיְּידוּ** (=equipped, מ"לצייד") — במיוחד בהקשר ציד ("יצאו לציד ואז _ צבי" → צָדוּ). כל מקרה שמילה נשמעת "כמעט נכון" בהקשר אך משמעותה שונה — דגל.
5. **התאמות דקדוקיות שגויות** — (א) **מין**: שם עצם נקבה/זכר עם פועל-תואר-מילת-שאלה בגוף הלא-נכון (למשל "כמה שוקל הגלקסיה"→"שוקלת", "איזו אור"→"איזה", "המים זורמת"→"זורמים"), במיוחד בשמות עצם לא-אינטואיטיביים (שמיים=זכר רבים, דלת=נקבה, שולחן=זכר). (ב) **מספר**: יחיד/רבים (למשל "הילדים הולך"→"הולכים"), במיוחד שמות עצם שנראים יחיד אך הם רבים (מים, שמיים, חיים) ולהפך. (ג) **זמן פועל**: קפיצה לא-מוסברת בין עבר להווה בתוך אותה פסקה/משפט. (ד) **סמיכות מאולצת**: "לב ביסקוויט" במקום "הלב של ביסקוויט" — סמיכות ספרותית לא-טבעית לילדים. (ה) **צורת פועל מומצאת/שגויה**, במיוחד בגוף שני רבים בעבר — למשל "תודיתם" (לא מילה; הנכון "הודיתם" מהפועל להודות), "ברכתם" שמנוקד כשם עצם. דגל רק אי-התאמה **חד-משמעית ובטוחה** (לא שם עצם דו-מיני/צורת-רבים חריגה שנויה-במחלוקת).
6. **משפטים שבורים או חסרי נושא** — משפט שנראה כתוצר של דחיסה/עריכה חלקית: חסר נושא ברור, פועל תלוי-באוויר, או צירוף מילים שלא מרכיב משפט תקין דקדוקית. אם אי-אפשר לזהות "מי עושה מה" בקריאה ראשונה — דגל.
7. **בחירת-מילה שגויה סמנטית וצירוף מתורגם-מילולית** — (א) פועל/שם-עצם שלא מתאים סמנטית להקשר גם אם דקדוקית תקין (למשל "דגם לו לאיזה כיוון ללכת" — "דגם"=יצר-דגם, הכוונה "הצביע/רמז"). (ב) צירוף מתורגם-מילולית מאנגלית שאינו עברית טבעית (למשל "סביב אתכם"=around you, התקני "סְבִיבְכֶם"). (ג) עברית "מתורגמת"/גבוהה-מדי שמרגישה מאולצת בפי ילד — העדף "ה-X של Y" על סמיכות ספרותית ומשפטים קצרים (עד כ-15 מילה) על פסוקיות מרובות. **התעלם מהניקוד** — הוא תקין; בדוק בחירת-מילה ותחביר בלבד.
8. **תשובה שגויה בחידת נכון/לא-נכון (חמור)** — כשמופיעה שורת "התשובה המסומנת כנכונה", הערך בעצמך אם ההיגד שבשאלה הוא **אמת או שקר במציאות**, והשווה לתשובה המסומנת. אם היגד **נכון עובדתית** מסומן "לא נכון", או היגד **שקרי** מסומן "נכון" — זו שגיאה חמורה (התלמיד נכשל על תשובה נכונה, או לומד עובדה שגויה). דגל רק כשאתה **בטוח לחלוטין** בערך-האמת של ההיגד (עובדה מוכרת וחד-משמעית), לא בהיגד מעורפל/שנוי-במחלוקת. ב-correction ציין את ערך-האמת הנכון של ההיגד.

אל תדגל סגנון, ניסוח ספרותי תקין, העדפה אישית או מילים נדירות-אך-תקינות — רק שגיאות מהסוגים למעלה, חד-משמעיות ובטוחות.
**סף ביטחון גבוה (קריטי)**: אם יש לך ספק כלשהו אם משהו הוא באמת שגיאה — **אל תדגל**. עדיף להחמיץ טעות מלדגל טעות-שווא, כי כל דיגול גורר שכתוב אוטומטי שעלול לשבש טקסט תקין. דגל רק כשאתה בטוח לחלוטין שזו שגיאה אמיתית.
החזר JSON תקין בלבד, ללא טקסט נוסף, במבנה:
{ "hasErrors": boolean, "errors": [{ "sceneId": "מזהה הסצנה", "problem": "תיאור השגיאה בעברית", "correction": "התיקון הנכון בעברית" }] }
אם אין שגיאות עובדתיות החזר { "hasErrors": false, "errors": [] }.`
  try {
    const uc = `${instruction}\n\nהתוכן לבדיקה:\n${content}`
    /* תקציב Gemini גדול מ-maxTokens של haiku: ה-thinking של 2.5 נצרך מתוך maxOutputTokens */
    const text = engineFor('factcheck') === 'gemini' ? await callGeminiText(uc, 16000, true) : await callHaiku([{ role: 'user', content: uc }], 2000)
    const json = extractJson(text) as { hasErrors?: boolean; errors?: FactError[] }
    const errors = Array.isArray(json.errors) ? json.errors.filter((e) => e && e.problem) : []
    return { ok: true, errors: json.hasErrors ? errors : [] }
  } catch (err) {
    logError('[fact-check] נכשל טכנית:', err instanceof Error ? err.message : err)
    return { ok: false, errors: [] }
  }
}

/* תיקון ממוקד על haiku — מתקן רק את שדות הטקסט של הסצנות שבהן זוהו שגיאות (כותרת/נרטיב/שאלה/הסברים),
   בלי לגעת ב-id, בחידות (choices/answer/isCorrect), במפתחות או במבנה.
   **שומר-סף דטרמיניסטי**: אחרי כל תיקון, אם הוא הפך חידת נכון/לא-נכון לבלתי-עקבית (התשובה
   המסומנת כבר לא תואמת את ההסבר — בדיוק הבאג שהתיקון האוטומטי יצר בעבר), הסצנה **משוחזרת**
   ומדווחת ב-reverted במקום לפרסם תשובה הפוכה. מחזיר את המזהים שתוקנו ואת אלה ששוחזרו. */
export async function scopedFactFix(gameData: GameData, errors: FactError[]): Promise<{ corrected: string[]; reverted: string[] }> {
  const ids = [...new Set(errors.map((e) => e.sceneId).filter((x): x is string => !!x))]
  const scenes = gameData.scenes.filter((s) => ids.includes(s.id))
  if (scenes.length === 0) return { corrected: [], reverted: [] }

  const blocks = scenes.map((s) => {
    const errs = errors.filter((e) => e.sceneId === s.id)
    const fields: string[] = [`title: ${s.title}`]
    if (s.narrative) fields.push(`narrative: ${s.narrative}`)
    if (s.drHoloDialog) fields.push(`drHoloDialog: ${s.drHoloDialog}`)
    if (s.puzzle?.question) fields.push(`question: ${s.puzzle.question}`)
    if (s.puzzle?.explanationCorrect) fields.push(`explanationCorrect: ${s.puzzle.explanationCorrect}`)
    if (s.puzzle?.explanationIncorrect) fields.push(`explanationIncorrect: ${s.puzzle.explanationIncorrect}`)
    return `סצנה "${s.id}":\n${fields.join('\n')}\nשגיאות לתיקון:\n${errs.map((e) => `- ${e.problem}${e.correction ? ` → ${e.correction}` : ''}`).join('\n')}`
  }).join('\n\n')

  const instruction = `תקן אך ורק את השגיאות העובדתיות והלשוניות שסומנו (בלבול מילים דומות-צליל / אי-התאמת מין-מספר-זמן / סמיכות מאולצת / משפט שבור-חסר-נושא / בחירת-מילה שגויה / צירוף מתורגם-מילולית) בשדות הטקסט של הסצנות הבאות. **המטרה: הטקסט המתוקן חייב להביע בדיוק את מה שהטקסט המקורי ניסה להביע — רק בעברית תקינה** — שנה אך ורק את מקור הטעות עצמה, אל תשנה את המשמעות, העלילה, האורך או הסגנון. **שמר על הניקוד אם קיים** (הוא תקין). אל תיגע במבנה, בחידות, בתשובות או במזהים.
החזר JSON תקין בלבד במבנה: { "<sceneId>": { "title"?, "narrative"?, "drHoloDialog"?, "question"?, "explanationCorrect"?, "explanationIncorrect"? } } — כלול אך ורק שדות שבאמת השתנו.

${blocks}`

  const text = engineFor('factcheck') === 'gemini' ? await callGeminiText(instruction, 16000, true) : await callHaiku([{ role: 'user', content: instruction }], 4000)
  const fixes = extractJson(text) as Record<string, Record<string, unknown>>
  const corrected: string[] = []
  const reverted: string[] = []
  for (const s of scenes) {
    const fix = fixes?.[s.id]
    if (!fix || typeof fix !== 'object') continue
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
    /* snapshot לפני — לשחזור אם התיקון יצר סתירה תשובה/הסבר */
    const snap = { title: s.title, narrative: s.narrative, drHoloDialog: s.drHoloDialog,
      question: s.puzzle?.question, ec: s.puzzle?.explanationCorrect, ei: s.puzzle?.explanationIncorrect }
    let changed = false
    const t = str(fix.title); if (t) { s.title = t; changed = true }
    const n = str(fix.narrative); if (n && s.narrative !== undefined) { s.narrative = n; changed = true }
    const d = str(fix.drHoloDialog); if (d && s.drHoloDialog !== undefined) { s.drHoloDialog = d; changed = true }
    if (s.puzzle) {
      const q = str(fix.question); if (q) { s.puzzle.question = q; changed = true }
      const ec = str(fix.explanationCorrect); if (ec) { s.puzzle.explanationCorrect = ec; changed = true }
      const ei = str(fix.explanationIncorrect); if (ei) { s.puzzle.explanationIncorrect = ei; changed = true }
    }
    if (!changed) continue
    /* שומר-סף דטרמיניסטי: אם התיקון הפך את החידה לבלתי-עקבית (נכון/לא-נכון הפוך) — שחזר */
    const nowInconsistent = checkAnswerConsistency({ scenes: [s], entrySceneId: s.id } as GameData).blocking.length > 0
    if (nowInconsistent) {
      s.title = snap.title
      if (s.narrative !== undefined) s.narrative = snap.narrative as typeof s.narrative
      if (s.drHoloDialog !== undefined) s.drHoloDialog = snap.drHoloDialog as typeof s.drHoloDialog
      if (s.puzzle) {
        if (snap.question !== undefined) s.puzzle.question = snap.question
        if (snap.ec !== undefined) s.puzzle.explanationCorrect = snap.ec
        if (snap.ei !== undefined) s.puzzle.explanationIncorrect = snap.ei
      }
      reverted.push(s.id)
    } else {
      corrected.push(s.id)
    }
  }
  return { corrected, reverted }
}

/* ניסוח אזהרה למורה */
export function factWarning(e: FactError): string {
  return `ד"ר הולו ממליץ לבדוק: ${e.problem}${e.correction ? ` (תיקון מוצע: ${e.correction})` : ''}`
}

/* מטא בדיקת העובדות (FactCheckMeta) מוגדר ב-questSchemas.ts (מודול pure, נבדק ביחידה)
   יחד עם healStaleFactCheck — ה-watchdog לריצה שנקטעה. מיוצא מכאן לתאימות. */
export type { FactCheckMeta } from './questSchemas.js'

/* בדיקת העובדות המלאה (זיהוי → תיקון ממוקד → בדיקה חוזרת) — רצה ברקע ומעדכנת את ה-DB.
   best-effort: כל כשל נבלע, ה-status תמיד מסומן 'done' בסוף כדי שהקליינט יפסיק לחכות. */
export async function factCheckInBackground(questId: string, gameData: GameData, baseWarnings: string[], level: number, form: FormOfAddress): Promise<void> {
  const t = Date.now()
  const meta = gameData as unknown as { factCheck?: FactCheckMeta }
  let warnings = [...baseWarnings]
  let correctedSceneIds: string[] = []
  let detected = 0
  /* ולידציית ניסוח — מפשט מקטעים שיצאו מורכבים מדי לרמה (לא פוגע ב-time-to-teacher; רקעי) */
  try {
    await enforceNarrativePhrasing(gameData, level, form)
  } catch (err) {
    logError('[phrasing:enforce] רקע נכשל:', err instanceof Error ? err.message : err)
  }
  /* ניקוד Dicta לרמות נמוכות (≤6) — הועבר לכאן מהנתיב החוסם: (1) חוסך את זמן ה-Dicta
     מ-time-to-teacher; (2) רץ אחרי שכתובי הניסוח, כך שהם לא מוחקים את הניקוד.
     ה-scopedFactFix בהמשך מונחה לשמר ניקוד. best-effort. */
  if (level <= 6) {
    try {
      const t0 = Date.now()
      const n = await applyNiqqudToGameData(gameData)
      info(`[niqqud] רקע: ${n} מקטעים · ${((Date.now() - t0) / 1000).toFixed(1)} שניות`)
    } catch (err) {
      logError('[niqqud] רקע נכשל:', err instanceof Error ? err.message : err)
    }
  }
  try {
    const fc = await runFactCheck(gameData)
    detected = fc.errors.length
    if (fc.ok && fc.errors.length > 0) {
      try {
        const fix = await scopedFactFix(gameData, fc.errors)
        correctedSceneIds = fix.corrected
        /* בדיקה חוזרת רק על הסצנות שתוקנו */
        if (fix.corrected.length > 0) {
          const recheck = await runFactCheck(gameData, fix.corrected)
          if (recheck.ok && recheck.errors.length > 0) warnings = [...warnings, ...recheck.errors.map(factWarning)]
        }
        /* שגיאות בסצנות שלא תוקנו אוטומטית (חידות, או תיקון ששוחזר) → אזהרה למורה לבדיקה ידנית */
        const unfixed = fc.errors.filter((e) => !e.sceneId || !fix.corrected.includes(e.sceneId))
        if (unfixed.length > 0) warnings = [...warnings, ...unfixed.map(factWarning)]
        if (fix.reverted.length > 0) info(`[fact-check] ${fix.reverted.length} תיקונים שוחזרו (היו יוצרים סתירת תשובה/הסבר): ${fix.reverted.join(',')}`)
      } catch (err) {
        logError('[fact-check] תיקון ברקע נכשל:', err instanceof Error ? err.message : err)
        warnings = [...warnings, ...fc.errors.map(factWarning)]
      }
    }
    meta.factCheck = { status: 'done', warnings, correctedSceneIds }
    info(`[fact-check] רקע: ${((Date.now() - t) / 1000).toFixed(1)} שניות (${detected} זוהו · ${correctedSceneIds.length} תוקנו · ${warnings.length} אזהרות)`)
  } catch (err) {
    logError('[fact-check] רקע נכשל טכנית:', err instanceof Error ? err.message : err)
    meta.factCheck = { status: 'done', warnings, correctedSceneIds, error: true }
  }
  const { error } = await supabaseAdmin.from('quests').update({ game_data: gameData }).eq('id', questId)
  if (error) logError('[fact-check] שמירת תיקוני הרקע נכשלה:', error.message)
}
