/* ── סוויטת רגרסיה לוולידציה הלשונית (מקבילת ה-smoke של הבטיחות) ──────────
   כל כשל אמיתי שנצפה בשטח חי כאן כמקרה קבוע, לצד מקרי-בקרה נקיים (מדידת
   false-positives). להריץ אחרי כל שינוי בפרומפט הבדיקה / מודל / הנחיות:
     npm run smoke:lang               ← המנוע לפי ה-env הנוכחי
     FACTCHECK_GEMINI=1 npm run smoke:lang  ← על Gemini (flash/pro לפי GEMINI_FACTS_MODEL)
   קריטריון מעבר: כל מקרי-הכשל נתפסים (AI או לינט) + אפס דיגול על מקרי-הבקרה.
   הוספת מקרה חדש = רשומה ב-CASES (ולרוב גם שורה ברשימה דטרמיניסטית + Vitest). */
import 'dotenv/config'
import { runFactCheck } from '../lib/factCheck.js'
import { lintHighRegister, lintKnownErrors, lintRepetition, lintDetachedClitics, type GameData } from '../lib/questSchemas.js'
import { engineFor } from '../lib/modelRouter.js'

interface Case {
  id: string
  kind: 'fail' | 'control'
  label: string
  narrative?: string
  drHoloDialog?: string
}

/* ── המקרים המצטברים ── */
const CASES: Case[] = [
  /* 1. גזירה מורפולוגית — שורש נכון, משקל/בניין שגוי (שתי המילים תקינות במילון) */
  { id: 'morph_person_tool', kind: 'fail', label: 'גזירה: אדם↔כלי (מחשבים→הוגים)',
    narrative: 'בכנס אתם פוגשים מחשבים כמו פרידריך האייק, שהאמינו שהשוק החופשי מתקן את עצמו.' },
  { id: 'morph_active_passive', kind: 'fail', label: 'גזירה: אקטיבי↔פסיבי (בחרו→נבחרו)',
    narrative: 'פקידים שלא בחרו אנשים קיבלו כוח עצום על חיי האזרחים.' },
  /* 2. משלב גבוה מדי לגיל */
  { id: 'register_literary', kind: 'fail', label: 'משלב: שוקטת→שקטה',
    narrative: 'המעבדה שוקטת כמו תמיד. ד"ר הולו בודק את המכשירים לפני המסע.' },
  /* 3. פסאודו-ארכאית שבורה בדיאלוג מצוטט */
  { id: 'archaic_broken', kind: 'fail', label: 'פסאודו-ארכאית: וולא / אחת אבן / משפט לא-מובן',
    narrative: 'דוד אומר: "ידעתי שאל תהיה נגדי נגיעה בטרם שחרר הידית. וולא יש הגנה מפני הקלע. אחת אבן הספיקה לי."' },
  /* 4. חזרתיות — נבדק בזוג הסצנות repeat_a/repeat_b */
  { id: 'repeat_a', kind: 'control', label: 'ביטוי-חתימה, מופע ראשון (לגיטימי)',
    narrative: 'אתם מגיעים אל שער העיר.', drHoloDialog: 'תנו לי להסביר את זה בעברית פשוטה: העיר מוקפת חומה כדי להגן על התושבים.' },
  { id: 'repeat_b', kind: 'fail', label: 'חזרתיות: אותו פתיח-חתימה פעם שנייה',
    narrative: 'בשוק אתם רואים דוכנים.', drHoloDialog: 'תנו לי להסביר את זה בעברית פשוטה: בשוק החליפו סחורה בסחורה עוד לפני הכסף.' },
  /* היסטוריים (נתפסו בעבר — לוודא שלא נסוגים) */
  { id: 'clitic_detached', kind: 'fail', label: 'סיומת תלושה (ליד כם)',
    narrative: 'המפה מונחת ליד כם על השולחן.' },
  { id: 'soundalike', kind: 'fail', label: 'דומות-צליל (משדך→משגר)',
    narrative: 'הפורטל משדך אתכם היישר אל שדה הקרב.' },
  /* ── בקרות: טקסט תקין שאסור לדגל ── */
  { id: 'ctrl_rich', kind: 'control', label: 'עברית עשירה תקינה (מטפורה לגיטימית)',
    narrative: 'הכוורת היא כמו עיר קטנה: לכל דבורה תפקיד ברור, וכולן יחד פועלות כמו גוף אחד.' },
  { id: 'ctrl_quote', kind: 'control', label: 'ציטוט מקור אמיתי (פסוק) — מותר',
    narrative: 'דוד קורא אל גלית: "אתה בא אלי בחרב ובחנית ובכידון, ואנוכי בא אליך בשם ה׳ צבאות."' },
  { id: 'ctrl_terms', kind: 'control', label: 'מונחי תוכן נחוצים + החל מ (צירוף תקין)',
    narrative: 'החל מ-1789 התכנסה האסיפה הלאומית. המונח "פיאודליזם" מתאר שיטה שבה האצילים החזיקו באדמות.' },
  { id: 'ctrl_everyday', kind: 'control', label: 'שימוש לגיטימי במילים דו-משמעיות',
    narrative: 'המחשבים במעבדה עובדים מהר. הבהלה בשוק הייתה גדולה, אבל אבן אחת לא זזה מהחומה.' },
]

/* ── בניית ההדמיה הסינתטית והרצה ── */
const gd = {
  entrySceneId: CASES[0].id,
  scenes: CASES.map((c) => ({ id: c.id, title: c.label, narrative: c.narrative, drHoloDialog: c.drHoloDialog })),
} as unknown as GameData

console.log(`▶ רגרסיה לשונית · מנוע: ${engineFor('factcheck')}`)
const t0 = Date.now()
const fc = await runFactCheck(gd)
const secs = ((Date.now() - t0) / 1000).toFixed(1)
if (!fc.ok) { console.error('‼ runFactCheck נכשל טכנית — הרגרסיה לא רצה'); process.exit(2) }
const lints = [...lintHighRegister(gd, 13), ...lintKnownErrors(gd), ...lintRepetition(gd), ...lintDetachedClitics(gd)]

const flaggedBy = (id: string) => ({
  ai: fc.errors.some((e) => e.sceneId === id),
  lint: lints.some((e) => e.sceneId === id),
})

let missed = 0
let falsePos = 0
console.log('')
for (const c of CASES) {
  const f = flaggedBy(c.id)
  const caught = f.ai || f.lint
  const via = [f.ai ? 'AI' : '', f.lint ? 'lint' : ''].filter(Boolean).join('+') || '—'
  if (c.kind === 'fail') {
    if (!caught) missed++
    console.log(`${caught ? '✓' : '✗ פוספס'}  [${via}] ${c.label}`)
  } else {
    if (caught) {
      falsePos++
      const why = [...fc.errors, ...lints].filter((e) => e.sceneId === c.id).map((e) => e.problem.slice(0, 90))
      console.log(`✗ FP  [${via}] ${c.label} — ${why.join(' | ')}`)
    } else console.log(`✓ נקי [בקרה] ${c.label}`)
  }
}

const fails = CASES.filter((c) => c.kind === 'fail').length
const ctrls = CASES.length - fails
console.log(`\n── תפיסה ${fails - missed}/${fails} · בקרות נקיות ${ctrls - falsePos}/${ctrls} · ${secs}ש׳ ──`)
process.exit(missed + falsePos > 0 ? 1 : 0)
