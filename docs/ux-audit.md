# ביקורת UX ונגישות (Playwright + axe)

תשתית אוטומטית שעוברת על מסכי המורה בדפדפן אמיתי (Chrome המותקן, בלי הורדת דפדפנים), מצלמת, ובודקת אותם מול
"עקרונות ממשק למסכי מורה" ב-`CLAUDE.md`. היא **לא** מחליפה בדיקה אנושית — היא תופסת את מה שאפשר למדוד.

## הרצה מהירה

דרישות: שרת (3001) וקליינט (5173) רצים (`.claude/launch.json` / `npm run dev` + `npm run dev:server`).

```
npm run e2e:ux                                   # הכול: שני viewports, ערכה בהירה, כולל מורים אמיתיים (שני ה-fixtures)
npm run e2e:ux -- --no-real                      # בלי fixture / בלי מורים אמיתיים (מהיר, לא נוגע ב-DB)
npm run e2e:ux -- --only results                 # כל מסכי "תוצאות"
npm run e2e:ux -- --only analytics-student.real-v2-homeroom --viewport 1366x768
npm run e2e:ux -- --only group:admin --dark      # קבוצה שלמה, ערכה כהה
npm run e2e:ux -- --only group:ai                # סיכום ד"ר הולו: האורח לוחץ "כתבו לי סיכום" (תבנית בלי LLM); אצל real-* אף פעם
npm run e2e:ux -- --only who:real-v2-mixed       # כל המסכים של צופה אחד
npm run e2e:ux -- --list                         # מה ירוץ (בלי להריץ)
npm run e2e:ux -- --strict                       # כשל גם על פריסה / יעדים קטנים / גופן / hover / breadcrumb / לחיצות
npm run e2e:ux -- --selftest                     # בדיקה עצמית של התשתית (דף סינתטי עם פגמים מוכרים)
npm run e2e:checklist -- --viewport 1366x768 --no-real   # הרצה + צ'קליסט פר-מסך (e2e/out/checklist.md); אותם סינונים כמו e2e:ux
```

שקול ל-`npx tsx e2e/run.ts <אפשרויות>`.

| אפשרות | משמעות |
|---|---|
| `--only a,b` | תת-מחרוזת של `<name>.<who>` (למשל `results-class`, `real-subject`), או `group:<results\|analytics\|admin\|ai\|existing>`, או `who:<צופה>` |
| `--viewport WxH` | חוזר או מופרד בפסיקים. ברירת מחדל `1366x768, 1920x1080` |
| `--dark` | ערכה כהה (ברירת מחדל: בהירה; `localStorage['holo-theme']` נקבע במפורש) |
| `--no-real` | לא מזריע fixture; כל מסכי `real-*` לא נכללים |
| `--strict` | גורם ל-exit 1 גם על כשלי "פריסה" (ראו למטה) |
| `--out <dir>` | תיקיית פלט (ברירת מחדל `e2e/out`, מתעלמת מ-git) |
| `--jobs N` | הקשרי דפדפן במקביל **למורים אמיתיים** (ברירת מחדל 3; אף פעם לא שני הקשרים של אותו משתמש בו-זמנית) |
| `--guest-jobs N` | הקשרי דפדפן במקביל לאורח (ברירת מחדל **1**: חשבון האורח משותף ומוגבל לפי IP — ראו "מכסות בקשות" למטה) |
| `--guest-pause ms` | הפסקה בין מסכי אורח (ברירת מחדל 1500) — כדי להישאר מתחת למכסת ה-IP |
| `--parallel` | להריץ במקביל את קבוצת האורח וקבוצת המורים האמיתיים. ברירת מחדל: קודם האמיתיים ואז האורח. לא מומלץ (429) |
| `--headed` | דפדפן גלוי (דיבוג) |
| `--no-screenshots` | בלי PNG |
| `--timeout ms` | timeout לפעולה (15000) |
| `--base`, `--api` | כתובות (`E2E_BASE_URL`, `E2E_API_URL`; ברירת מחדל localhost:5173 / 3001) |
| `--keep-fixture` / `--cleanup-only` | לא לנקות את ה-fixture בסוף / לנקות שרידים מריצה שקרסה |
| `--checklist` | בנוסף ל-`report.*` כותב `e2e/out/checklist.md` (זה מה ש-`npm run e2e:checklist` מוסיף) |
| `--checklist-only` | בונה מחדש את `checklist.md` מ-`report.json` קיים, בלי להריץ דפדפן |

**קוד יציאה**: `1` אם יש הפרת axe ברמת serious/critical, מילה אסורה בטקסט הגלוי, תנאי תרחיש שנכשל (כולל שגיאת ממשק בלתי צפויה במסך), או שגיאת הרצה (דף שקרס / הופנה ל-login).
המסכים "קיים היום" (`existing-*`) משמשים כ-smoke: `existing-creator` מפיל axe מאז ומתמיד, ולכן ריצה מלאה מסתיימת ב-1 עד שיתוקן (ראו "מגבלות ידועות"). בלי המסכים האלה (`--only group:results,group:analytics,group:admin,group:ai`) לא נמדדו כשלים קשיחים בשום viewport.
מסך שעוד לא נבנה (`missing`) או שלא ניתן לגלות לו מזהה (`skipped`) **אינו** כשל. עם `--strict` גם כשלי הפריסה.

## מה נבדק בכל מסך (ולכל viewport)

1. **צילום מסך** מלא: `e2e/out/<name>.<who>-<WxH>[-dark].png`.
2. **axe-core** (`wcag2a, wcag2aa, wcag21aa, best-practice`). דוח לפי impact; **כשל = serious/critical**. (moderate/minor מופיעים בפירוט בלבד.)
3. **מילים אסורות** בטקסט הגלוי (`document.body.innerText` בלבד — לא `title`/`aria-*`), *ללא* תוכן שבתוך `[data-how-we-calc]`:
   וקטור · p-value · "p מתוקן" · מובהק · BH · Benjamini · אינדקס · קורלציה · גודל אפקט · הסתברות. נתפסות גם הטיות/ריבוי (סימון גזע).
   הרשימה ב-`e2e/lib/forbidden.ts`. **חוזה:** פרטים סטטיסטיים מותרים רק בתוך אלמנט עם `data-how-we-calc` ("איך חישבנו?").
4. **מדדי פריסה** (`e2e/lib/pageProbe.ts`):
   - **נכנס במסך אחד** — `scrollHeight <= innerHeight + 2`; כשלא: כמה פיקסלים חורג, אילו אלמנטים מגיעים הכי נמוך, ואזורי גלילה פנימיים (`overflow-y:auto` עם תוכן חורג).
   - **יעדי לחיצה < 44×44px** (`a[href]`, `button`, `input`, `select`, `textarea`, `summary`, `[role=button|tab|link|radio|checkbox|menuitem|switch|option]`). מוסתרים חזותית (sr-only, opacity 0, חיתוך) לא נספרים; ב-checkbox/radio מותאם נמדדת ה-label; קישור בתוך משפט פטור (נספר בנפרד כ-"inlineExcluded").
   - **גודל גופן מינימלי** בין צמתי הטקסט הגלויים; דגל מתחת ל-14px, ונספרים אלמנטים מתחת ל-16px.
   - **מידע רק ב-hover**: פקד (כפתור/קישור) שה-`title` הוא הטקסט היחיד שלו, או אלמנט עם `title` שמוסיף מידע שלא מופיע בגלוי בשום מקום בדף.
   - **breadcrumb גלוי בעמוד פנימי** (`inner: true` בתרחיש). **חוזה לזיהוי מדויק:** תנו לרכיב `data-breadcrumb` (או `<nav aria-label="…נתיב…|breadcrumb">`); בלעדיו יש יוריסטיקה של `›` בראש הדף.
   - **h1 גלוי** (השאלה שהמסך עונה עליה), לחיצים בלי תפקיד סמנטי (`cursor:pointer` על `div`), שגיאות קונסול ובקשות שנכשלו.
   - **לחיצות מהטאב הראשי** — כפי שהוצהר בתרחיש (`clicksFromMainTab`) או כמספר צעדי ה-`click`; מעל 2 מסומן.
5. **תנאי תרחיש** (אחרי שהמסך מוכן; `e2e/lib/runner.ts → checkExpectations`): (א) **שגיאה בלתי צפויה** — `[data-v2-error]` גלוי במסך שלא סימן `allowError` (תופס 403/404/429/5xx שנשארו בממשק);
   (ב) `expect`/`expectBy` — `present` חייב להיות גלוי, `absent` אסור שיהיה גלוי (כפתור שמנהל/ת לא רואה, טאב נעול אצל מורה מקצועי…). כשל = כשל קשיח. תרחיש עם `knownIssue` מדווח אותם כ"בעיה ידועה" בלי להפיל.
6. **דוחות**: `e2e/out/report.md` (טבלה קריאה + פירוט כשלים) ו-`e2e/out/report.json` (מלא, לצריכה ע"י כלים).
   לכל מסך ב-`report.json` (גם `missing`/`skipped`/`error`, אז השדות `null`) יש שדה `checklist`:
   `h1` (טקסט מלא = השאלה שהמסך עונה עליה) · `breadcrumb` (טקסט מלא) · `clicksFromMainTab` (מהתרחיש) · `fitsOneScreen`/`overflowPx` ·
   `fitsAt1366x768` (true/false רק לתוצאה שנמדדה ב-1366×768, אחרת `null`) · `screenshot` · `urlPattern` · `viewport` · `h1Count`.

עמודות הדוח: Screen · Viewport · Status (`ok`/`MISSING`/`SKIPPED`/`ERROR`) · Fits 1 screen · Axe serious+critical (מספר כללים) ·
Small targets (קטנים/סה"כ) · Min font · Forbidden words · Breadcrumb · Clicks from main tab.

**כשלים קשיחים (exit 1)**: axe חמור/קריטי, מילים אסורות, **תנאי תרחיש שנכשל (כולל שגיאת ממשק בלתי צפויה)**, שגיאת הרצה. **strict**: לא נכנס במסך אחד, גלילה אופקית, יעדים קטנים,
גופן < 14px, מידע רק ב-hover, אין breadcrumb בעמוד פנימי, אין h1, יותר מ-2 לחיצות. הספים ב-`e2e/lib/config.ts` (`THRESHOLDS`).

## מי צופה (`who`)

| `who` | איך נכנסים | מה רואים |
|---|---|---|
| `guest-homeroom` | `POST /api/auth/guest-login` → `localStorage['holo_staff_session']` | `?lens=homeroom` (מתווסף אוטומטית ל-URL ולקריאות הגילוי) — ספק ההדגמה |
| `guest-subject-math` / `guest-subject-hebrew` | כנ"ל | `?lens=subject_teacher&subject=math\|hebrew` |
| `guest-admin` | כנ"ל | `?lens=admin` |
| `real-homeroom` / `real-subject` / `real-unlinked` / `real-admin` | מורים זמניים מ-`server/src/scripts/resultsFixture.ts` (`seedResultsFixture()`): `teachers.homeroom` / `subjectSame` / `unlinked` / `admin` | **מסכי התוצאות** (שליחות, sessions, answers) |
| `real-v2-homeroom` | `server/src/scripts/analyticsFixture.ts` (`seedAnalyticsFixture()`): `teachers.homeroom` | מחנך/ת של כיתה **עשירה** (ו׳1: 14 תלמידים, ~420 משחקים, 5 מקצועות) — ספק חי |
| `real-v2-subject` | `teachers.subject` | מורה מתמטיקה בעשירה (מקצועות אחרים והסקירה נעולים) |
| `real-v2-mixed` | `teachers.mixed` | מחנך/ת בכיתה **דלה** (3 תלמידים, 2 משחקים כל אחד) + מורה עברית בעשירה (סקירה נעולה בעשירה) |
| `real-v2-cross` | `teachers.cross` | מתמטיקה בדלה + היסטוריה בעשירה (בעשירה: היסטוריה בלי נתונים, מתמטיקה נעולה — מלכודת "מכפלה קרטזית" של הרשאות) |
| `real-v2-unspecified` | `teachers.unspecified` | שיוך לעשירה בלי מקצוע ובלי מחנכות: אין מקצוע פתוח, הכול נעול |
| `real-v2-empty` | `teachers.emptyHomeroom` | מחנך/ת של כיתה בלי אף תוצאה (ה׳1, 6 תלמידים) |
| `real-v2-no-classes` | `teachers.noClasses` | מורה בלי כיתות (מצב ריק מלא) |
| `real-v2-dual` | `teachers.dual` | מחנך/ת בכיתה אחת + מורה תנ"ך בשנייה; תלמיד/ה משותף/ת לשתיהן |
| `real-v2-admin` | `teachers.admin` | מנהל/ת בית הספר (אגרגטים בלבד; תאים מוצגים ומוסתרים) |
| `real-v2-municipal` | `teachers.municipal` | מנהל/ת עירוני |
| `real-v2-admin-small` | `teachers.outsiderAdmin` | מנהל/ת בית ספר שני (כיתה אחת, 2 תלמידים: הכול מוסתר) |
| `real-v2-admin-empty` | `teachers.emptySchoolAdmin` | מנהל/ת בית ספר שלישי בלי אף כיתה |

מורי ה-`real-*` נוצרים **בבסיס הנתונים המשותף עם הפרודקשן**. כל fixture בקידומת משלו, ולכן אפשר להזריע את שניהם באותה ריצה:
`zz-ux-res-` (תוצאות) ו-`zz-ux-v2-w8-` (אנליטיקה); כל שורה — שם / כותרת / קוד / אימייל — נושאת את הקידומת. ה-runner מזריע רק fixture שנבחר מסך של צופה שלו
(`fixtureOf(who)` ב-`e2e/lib/login.ts`), ומנקה ב-`finally` (גם ב-Ctrl+C). הניקוי מגלה מזהים לפי הקידומת **המלאה** של ה-fixture בלבד ומוחק לפי מזהים (לעולם לא `LIKE 'zz-ux-%'`).
**אל תריצו שני דברים שמשתמשים באותו fixture במקביל** (שתי ריצות e2e, או ריצה + קבלה חיה): ניקוי של אחד מוחק את המשתמשים של השני —
הסימפטום: מסכי `real-*` נכשלים באמצע ריצה עם "הופנה ל-/staff/login — ה-session נדחה". אחרי קריסה קשה: `npm run e2e:ux -- --cleanup-only` (מנקה את שניהם).
לאימות שלא נשאר דבר: `cd server && npm run fixture:v2 -- leftover` (אנליטיקה; "נקי: 0 שורות") ו-`leftoverResultsFixture()` מ-`resultsFixture.ts` (תוצאות; כל המונים 0).

ה-fixtures רצים בתהליך-בן (`e2e/lib/fixtureChild.ts`, cwd=`server/`) כדי ש-`.env` ו-`node_modules` של השרת ייטענו; הטוקנים והסיסמאות מועברים בזיכרון בלבד (לא מודפסים, לא נכתבים לדיסק).
**טוקן מתחדש**: טוקן Supabase חי כשעה ו-`expires_at` בדפדפן 50 דקות; ל-fixture האנליטיקה יש סיסמאות בזיכרון, ולכן לפני יצירת הקשר דפדפן חדש טוקן ישן מ-35 דקות מוחלף בכניסה מחדש
(`freshSession`; `staff-login` מוגבל ל-10 בדקה — על 429 ממתינים). ל-fixture התוצאות אין סיסמאות (הריצה שלו קצרה).
**צורת ה-fixture של התוצאות** (סלחנית — `findRoleSession`): `fx.teachers.<role> = { userId, name, token }` עם `homeroom | subjectSame | unlinked | admin`,
ו-`fx.classId`, `fx.submissions.sci`, `fx.students.<avi|beni>.id` (גיבוי לגילוי מזהים).
**צורת ה-fixture של האנליטיקה**: `fx.teachers.<key> = { userId, name, email, password, token }`, `fx.classes.{rich,sparse,empty,other,dualA,dualB}.id`, `fx.students.<קבוצה>.<מפתח>.id`, `fx.ids.*` —
ממנו נגזרים משתני ה-URL הקבועים (`analyticsVars` ב-`login.ts`; ראו "תרחישים"). אם הקובץ חסר או לא מחזיר טוקן לתפקיד — מסכי אותו `real-*` מדווחים `SKIPPED` עם הסיבה (לא כשל).
עקיפה ידנית לתפקיד בתוצאות: `E2E_REAL_<ROLE>_TOKEN`.

## קובץ התרחישים (`e2e/scenarios.ts`)

רשימת אובייקטים; מורחבת ל-"מסך לכל צופה" (`<name>.<who>`). כל מזהה **מתגלה בזמן ריצה** או נקבע ע"י ה-fixture (אין מזהים קשיחים).

```ts
{
  name: 'analytics-student',               // ייחודי; a-z 0-9 -   (שם הקובץ + --only)
  group: 'analytics',                      // 'results' | 'analytics' | 'admin' | 'ai' | 'existing'
  who: ['guest-homeroom', 'real-v2-homeroom'], // צופה או מערך צופים
  url: '/analytics/student/{studentId}?class={classId}',  // {placeholders}; לאורח מתווסף ?lens=…
  steps: [ { click: { role: 'tab', name: 'עברית' } } ],   // אופציונלי; click|fill|waitFor|wait|press
  ready: '[data-v2-ready], [data-empty-state], [data-v2-error]', // "המסך מוכן"; חסר → "route/element missing"
  inner: true,                             // עמוד פנימי → breadcrumb נדרש (strict)
  clicksFromMainTab: 2,                    // אופציונלי; ברירת מחדל = מספר צעדי ה-click
  expect: { present: [...], absent: [...] },          // תנאים אחרי שהמסך מוכן (לכל הצופים) — כשל = כשל קשיח
  expectBy: { 'real-v2-subject': { present: ['[role="tab"][aria-disabled="true"]'] } }, // תנאים לצופה מסוים
  allowError: false,                       // true רק במסך שמטרתו להציג שגיאה (403/404)
  knownIssue: 'באג מוצר מתועד…',           // כשלי התנאים מדווחים כ"בעיה ידועה" ואינם מפילים את הריצה
  note: 'טקסט חופשי לדוח',
}
```

- **target** של צעד/`ready`/תנאי: מחרוזת (CSS / `text=…` / `role=…` של Playwright) או `{ text, exact? }` או `{ role, name?, exact? }`. אפשר `{placeholders}` בתוכו.
- **placeholders**:
  - מתגלים מה-API (`e2e/lib/discover.ts`): `{submissionId}` `{resultsStudentId}` `{resultsAttentionStudentId}` (מ-`GET /api/results/submissions` ו-`/submission/:id`),
    `{classId}` `{studentId}` `{subject}` `{subjectName}` `{className}` (מ-`/api/analytics-v2/config|roster`).
  - נקבעים ע"י ה-fixture של האנליטיקה, לצופי `real-v2-*` בלבד (`analyticsVars` ב-`e2e/lib/login.ts`; דורסים את הגילוי): כיתות — `{richClassId}` `{sparseClassId}` `{emptyClassId}` `{dualAClassId}` `{dualBClassId}` `{otherClassId}`;
    תלמידים — `{attentionStudentId}` (ירידה בשני מקצועות) `{calmStudentId}` `{biasStudentId}` `{memoryStudentId}` `{trendUpStudentId}` `{skipperStudentId}` `{emptyStudentId}` `{sparseStudentId}` `{sharedStudentId}` (בשתי כיתות) `{otherStudentId}` (בית ספר אחר — ל-404).
    בנוסף, לכל צופה `{classId}` / `{studentId}` / `{subject}` מצביעים על הכיתה/תלמיד/מקצוע ה"עיקריים" שלו (למשל `real-v2-mixed`: מקצוע `hebrew`, כי בעשירה הוא מורה עברית).
  מזהה שלא נמצא → המסך `SKIPPED` ("לא ניתן לגלות …" + הסיבה). להוספת משתנה: `discoverResults`/`discoverAnalytics` (גילוי) או `analyticsVars` (fixture). הבדיקה העצמית (`--selftest`) מוודאת שכל `{…}` מוכר ושאורח לא משתמש במשתני fixture.
- **צעדי click כמסלול מהטאב הראשי**: כדי למדוד לחיצות באמת (ולא רק להצהיר), כתבו `url` של הטאב הראשי ו-`steps` של הלחיצות; המדד = מספר ה-click.
- מסך שלא נבנה (דף ריק / הפניה / אלמנט חסר / timeout בניווט) → `MISSING`, לא קריסה. ריצה חוזרת אוטומטית: HMR של Vite שמרענן את הדף באמצע מדידה, דף ריק רגעי, `page.goto` שלא חזר ב-45ש׳ (שרת הפיתוח עמוס רגעית), ו**שגיאת ממשק חולפת** (429/502/503/504 שמסך הציג — ממתינים 15ש׳ ומנסים שוב; אם נשארה אחרי הניסיונות זה כשל קשיח).
- **`ready` = סימן שהנתונים הגיעו** (המתנה עד 20ש׳, אחרי הצעדים). בלעדיו, צילום שנלקח בזמן "טוען…" נראה כמסך תקין. הסימנים בשימוש:
  `[data-submission-row], [data-empty-state]` (רשימת תוצאות), `[data-people-panel]` (מסכי הדמיה/תלמיד בתוצאות), `[data-glance]` (טאב "במבט אחד"),
  **`V2_READY` = `[data-v2-ready], [data-empty-state], [data-v2-error]`** (כל מסכי האנליטיקה: תוכן מוכן, מצב ריק מסביר, או בלוק שגיאה — שגיאה בלתי צפויה נתפסת בנפרד), `[role="dialog"] h1, [role="dialog"] [data-empty-state], …` (תדריך/משוב),
  `[data-ai-overlay] [data-ai-summary]:not([data-ai-state="loading"])` ו-`…[data-ai-state="ready"]` (שכבת הסיכום). מצבי הפאנל: `data-ai-state` = `loading | loadError | ineligible | none | writing | ready | editing`; `data-ai-label` = `ai | template | demo`.
- **שגיאה בלתי צפויה במסך** (`[data-v2-error]` גלוי במסך שלא סימן `allowError`) = כשל קשיח בכל תרחיש — כך 429/403/500 שנשארו בממשק לא "עוברים" כמסך תקין.
- **`expect` / `expectBy`**: `present` = חייב להיות גלוי (ממתינים עד 4ש׳); `absent` = אסור שאף התאמה תהיה גלויה (למשל כפתור הסיכום אצל מנהל/ת). כשל = כשל קשיח ("תנאי תרחיש" בדוח).
- **`knownIssue`**: תרחיש שחושף באג מוצר מתועד. כשלי התנאים שלו מדווחים כ"בעיה ידועה" (בדוח ובצ'קליסט) ואינם מפילים את הריצה; כשהבאג מתוקן הדוח אומר "ייתכן שתוקנה — הסירו knownIssue".
- **מכסות בקשות**: חשבון האורח משותף ולכן מוגבל **לפי IP** (`rateLimitByUser` → מפתח IP); תנועה של מורים אמיתיים מאותו IP צורכת את אותה מכסה (ראו "בעיות מוצר שנמצאו"). לכן האורח רץ בהקשר אחד בכל פעם (`--guest-jobs 1`) ורק אחרי המורים האמיתיים.
  `POST /api/ai-summary` מוגבל ל-6 בדקה: ב-`group:ai` יש לכל היותר 3 לחיצות "כתבו לי סיכום" לאותו צופה ברצף, ו**אצל real-* לעולם לא לוחצים** (זה היה קורא ל-LLM אמיתי).
- הרצה במקביל ל-DB המשותף עלולה להאט את התשובות; תרחיש שנכשל ב-`ready` בלי שינוי בקוד — הריצו אותו שוב לבד (`--only <name>.<who> --jobs 1`) לפני שמסיקים שהוא שבור.

### התרחישים הנוכחיים

| קבוצה | תרחיש | צופים | מה בודק |
|---|---|---|---|
| results | `results-list` | מורים + `real-unlinked` | הרשימה: משפט סיכום אחד, סינון, שורות קומפקטיות; `real-unlinked` = מצב ריק |
| results | `results-class` · `results-student` · `results-student-attention` | מורים | מסך ההדמיה (כל הכיתה / לפי תלמיד/ה) |
| results | `results-class-glance` | מורים | טאב **"במבט אחד"** (ראשון בשורה, ברירת המחדל): שני גרפי עוגה + כרטיס הסיכום של ד"ר הולו (`[data-ai-summary]` חייב להופיע). נכנס במסך אחד |
| results | `results-class-challenges` · `-objectives` · `-errors` · `-review` | מורים | ארבעת הטאבים האחרים — **סט הטאבים קבוע**: במצב "כל הכיתה": **במבט אחד \| האתגרים \| יעדי הלמידה \| טעויות נפוצות \| תרגול חזרה** (במצב תלמיד/ה: האתגרים \| זמן בשקפים); עם נתונים הרשימה, בלעדיהם מצב ריק מסביר |
| results | `results-student-slides` | מורים | תלמיד/ה › זמן בשקפים |
| results | `results-class-how-we-calc` | מחנך | "איך חישבנו?" פתוח: חלון מעל התוכן עם כפתור "סגירה" |
| analytics | `analytics-entry` | אורח ×3 · `real-v2-homeroom/subject/mixed/cross` | "איזו כיתה תרצו לראות?": רצועת התרעות, הערת כיסוי (הדמיות בלי מקצוע) עם כפתור שיוך, "התצוגה הקודמת" (אצל אמיתי בלבד) |
| analytics | `analytics-entry-states` | `real-v2-empty/no-classes/unspecified/dual` | כיתה בלי תוצאות ("עוד אין תוצאות", לא "הכול בסדר"), מורה בלי כיתות (מצב ריק מלא), שיוך בלי מקצוע, שתי כיתות |
| analytics | `analytics-entry-previous` | `real-v2-homeroom/subject` | "התצוגה הקודמת": לחיצה אחת מהכניסה אל גרף ההתקדמות הכללי, עם נתיב חזרה |
| analytics | `analytics-previous-blocked` | `guest-homeroom` · `real-v2-admin` | `?view=previous` נשאר חסום לאורח ולמנהל/ת |
| analytics | `analytics-class-overview` · `-sparse` · `-empty` · `-dual` | מחנכים (עשירה / דלה / בלי תוצאות / כיתה עם תלמיד/ה משותף/ת) | סקירת כיתה (+ כפתור סיכום מד״ר הולו למחנך בלבד, ואין טאבים נעולים) |
| analytics | `analytics-class-locked` · `-cross-open` · `-no-open-subject` | `real-v2-cross` · `real-v2-unspecified` | **הרשאות פר-כיתה**: היסטוריה בעשירה + מתמטיקה בדלה (בעשירה המתמטיקה נעולה, גם דרך הכתובת); שיוך בלי מקצוע = אין מקצוע פתוח, הכול נעול |
| analytics | `analytics-class-summary` · `-errors` · `-progress` · `-students` | אורח ×3 · `real-v2-homeroom/subject/mixed` | טאב מקצוע בכיתה (מחנך: הכול פתוח; מורה מקצועי: סקירה ושאר המקצועות נעולים) |
| analytics | `analytics-class-hebrew` · `-hebrew-students` · `-science` · `-history-empty` | `real-v2-homeroom` | מקצועות שונים בעשירה: עברית (ירידות, זיכרון אקראי), מדעים (N קטן), היסטוריה (מקצוע-כיתה בלי נתונים) |
| analytics | `analytics-class-notfound` | `real-v2-homeroom/subject` | כיתה של בית ספר אחר: "לא מצאנו את הכיתה" (404 אחיד) |
| analytics | `analytics-student` | אורח ×3 · `real-v2-homeroom/subject/mixed/cross` | כל המקצועות זה לצד זה (מחנך) / מקצוע אחד + אפור (מורה מקצועי); כפתור סיכום מד״ר הולו |
| analytics | `analytics-student-subject` · `-calm` · `-bias` · `-memory` · `-trend-up` · `-sparse` · `-empty` · `-dual` | `real-v2-*` | תלמידים לפי סיפור: ירידה, יציב (בלי ממצאים), הטיית מיקום, זיכרון אקראי, מגמה חיובית, כיתה דלה, בלי נתונים, בשתי כיתות |
| analytics | `analytics-student-notfound` · `analytics-student-admin-blocked` | מורים · מנהלים | 404 אחיד (תלמיד של בית ספר אחר) ו-403 למנהל/ת מול נקודת תלמיד — בלוק שגיאה בעברית פשוטה |
| analytics | `analytics-briefing-student` · `-class` · `-empty` · `-class-no-subjects` · `analytics-feedback` · `-feedback-empty` | מורים | שכבות-על: תדריך לישיבה (להדפסה), "כך התלמיד/ה רואה"; תדריך/משוב ריקים = הסבר במילים. `-class-no-subjects` = **בעיה ידועה** (ראו למטה) |
| admin | `admin-overview` | `guest-admin` · `real-v2-admin/municipal/admin-small/admin-empty` | מסך המנהל/ת: אגרגטים בלבד; עשיר / עירוני / בית ספר קטן (הכול מוסתר) / בית ספר בלי כיתות; אין כפתור/כרטיס סיכום AI |
| admin | `admin-grades` · `-subjects` · `-errors` | `guest-admin` · `real-v2-admin` | שאר טאבי המנהל/ת |
| ai | `ai-glance-write` | אורח ×2 | none ← "כתבו לי סיכום" ← ready (תווית "סיכום הדגמה"): תבנית דטרמיניסטית בלי LLM |
| ai | `ai-student-overlay` · `ai-class-overlay` | אורח + `real-v2-*` | שכבת הסיכום במצב פתיחה (בלי ללחוץ כתיבה) |
| ai | `ai-student-overlay-write` · `ai-class-overlay-write` | אורח | כתיבה (תבנית); נמדד: 3 לחיצות ממסך הכניסה |
| ai | `ai-class-overlay-denied` | `real-v2-subject` | מורה מקצועי שפותח סיכום כיתה דרך הכתובת — השרת מסרב, ההודעה במילים |
| ai | `ai-admin-hidden` | `guest-admin` · `real-v2-admin` | מנהל/ת לא רואה שכבה/כרטיס/כפתור סיכום גם עם `?sum=` בכתובת |
| existing | `existing-creator` · `existing-library` | אורח | smoke של התשתית |

## מצב המסכים — מדידות (אנליטיקה v2 לכל המורים, על נתוני אמת)

ריצה מלאה אחת (`npm run e2e:checklist`, ערכה בהירה, שני ה-viewports, שני ה-fixtures): **326 הרצות מסך = 163 לכל viewport** (71 אורח · 70 `real-v2-*` · 22 `real-*` של התוצאות), 61 מסכים מובחנים, כ-25 דקות.
המורים האמיתיים רצים קודם (3 הקשרים במקביל), ואז האורח (הקשר אחד, הפסקה של 1.5ש׳ בין מסכים — ראו "מכסות בקשות").

| viewport | מסכים | `ok` | `MISSING`/`SKIPPED`/`ERROR` | נכנסים במסך אחד | axe חמור/קריטי | מילים אסורות | יעדי לחיצה < 44px | גופן מינימלי | נתיב חזרה בעמוד פנימי | יותר מ-2 לחיצות |
|---|---|---|---|---|---|---|---|---|---|---|
| 1366×768 | 163 | 163 | 0 / 0 / 0 | 160/163 | 3 (רק `/creator`) | 0 | 0 במסכי v2 והתוצאות · 24 ב"תצוגה הקודמת" | 14px (תוויות צירים בגרפים) | כל העמודים הפנימיים | 3 תרחישי סיכום AI (ראו למטה) |
| 1920×1080 | 163 | 163 | 0 / 0 / 0 | 162/163 | 3 (רק `/creator`) | 0 | כנ"ל | כנ"ל | כנ"ל | כנ"ל |
| 1366×768, **כהה** (אנליטיקה + מנהל + AI; 108 מסכים) | 108 | 108 | 0 / 0 / 0 | 107/108 | **0** | 0 | 24 ב"תצוגה הקודמת" | 14px (כנ"ל) | כל העמודים הפנימיים | כנ"ל |

- **כשלים קשיחים בריצה: 2** — שניהם `existing-creator` (אולפן היצירה הקיים, מסך smoke מחוץ לתחום): 3 הפרות axe (`button-name`, `label`, `select-name`) בכל viewport. בכל מסכי התוצאות, האנליטיקה, המנהל וה-AI: **axe חמור/קריטי = 0**, מילים אסורות = 0, אפס שגיאות קונסול, אפס מידע-רק-ב-hover.
- **תנאי תרחיש (`expect`/`expectBy`/שגיאת ממשק בלתי צפויה): 0 כשלים** — כולל: מנהל/ת לא רואה כרטיס/כפתור/שכבת סיכום (גם עם `?sum=` בכתובת, גם בארגון בלי כיתות וגם בבית ספר קטן); "התצוגה הקודמת" חסומה לאורח ולמנהל/ת ופתוחה למורה אמיתי; כפתור סיכום כיתה רק למחנך/ת; טאבים נעולים אצל מורה מקצועי/מעורב/צולב ולא אצל מחנך; 404 אחיד (כיתה/תלמיד/ה של בית ספר אחר) ו-403 למנהל/ת מול נקודת תלמיד; כרטיס הסיכום מופיע ב"במבט אחד" אצל כל המורים.
- **ניסיונות חוזרים**: 2 מסכי אורח נתקלו ב-429 חולף (מכסת ה-IP) והצליחו בניסיון השני (בריצה הכהה — 4). 429 שנשאר אחרי הניסיונות הוא כשל קשיח; לא היו כאלה.
- **נכנסים במסך אחד**: כל מסכי האנליטיקה, המנהל, התוצאות והסיכום (כל התפקידים, כולל כיתה עשירה של 14 תלמידים ו-5 מקצועות). היוצאים מן הכלל: `analytics-entry-previous` (הפאנל הקודם; +280px אצל המחנך העשיר ב-1366×768),
  `existing-creator` (+11px) ו-`existing-library` (+3620px) — כולם מחוץ לתחום.
- **גלילה פנימית** (אזור `overflow:auto` עם תוכן חורג) — רק במה שמכוון להיות מסמך/אזור גולל: תדריך לישיבה (מסמך להדפסה; עד +1152px), "איך חישבנו?" פתוח (+129px), וסיכום AI אחרי שנכתב (עד +486px בכרטיס המוטמע, עד +106px בשכבה). כל מסך אחר: 0.
- **לחיצות מהטאב הראשי**: כל המסכים ≤ 2 מלבד כתיבת סיכום AI (`ai-student-overlay`, `ai-student-overlay-write`, `ai-class-overlay-write`): מסך הכניסה › תלמיד/ה › "סיכום מד״ר הולו" › "כתבו לי סיכום" = **3** (נמדד, מסומן strict). הצגת הסיכום עצמו (במבט אחד, בתוצאות) — 2.
- **גופן**: גוף הטקסט 16px בכל מקום; 14px נשאר רק בתוויות הצירים והמספרים הקטנים בגרפים (`class-progress`, מסכי תלמיד/ה, `admin-subjects`, תדריך תלמיד/ה); 9–9.5px רק ב"תצוגה הקודמת" וב-`/creator`, `/creator/library`.

הערות:
- לפני תיקוני F2: מסך ההדמיה (כיתה) גלל פנימית עד +316px, מסך התלמיד/ה עד +1124px. כיום הכול נכנס עבור נתוני ההדגמה והנתונים האמיתיים (כיתה של 14–25 תלמידים). כיתה גדולה בהרבה, שם ארוך במיוחד, או פירוט פתוח של אתגר — עדיין גוללים בתוך **אזור אחד** (הרשימה/הטאב), לא בעמוד.
- "איך חישבנו?" הוא כפתור אחד בקצה שורת הכותרת בכל מסך (ScreenShell, prop `howWeCalc`); החלון נפתח מעל התוכן ולא דוחף אותו. כשהוא סגור אין ב-DOM שום תוכן סטטיסטי.
- שורת בורר העדשות של האורח היא שורה אחת של 48px; אצל מורה אמיתי אין אותה בכלל.
- בנתוני האמת של ה-fixture שמות התלמידים/כיתות נושאים את הקידומת `zz-ux-v2-w8-` (סימון ודאי לניקוי) — היא תופיע בצילומים.
- נתוני התיוג (תחומים / טעויות נפוצות / שיפור במושג) ריקים במכוון — הטבלאות ריקות גם בפרודקשן — ולכן מסכי "טעויות נפוצות" על נתוני אמת הם מצב ריק מסביר ("עוד אין טעויות נפוצות… יופיעו כשיצטברו מספיק תשובות").

### מכסות בקשות (למה האורח רץ לבד)
`rateLimitByIp('analytics-v2', 600)` ו-`rateLimitByUser('analytics-v2', 120)` רצים בזה אחר זה על כל בקשה. עבור מורה רגיל המפתחות שונים (`ip:…` / `user:…<id>`), אבל **לאורח** `rateLimitByUser` מחשב מפתח לפי IP (`rateLimit.ts:58`) — בדיוק המפתח של `rateLimitByIp` —
ולכן כל בקשה של האורח נספרת פעמיים באותו מונה, והמכסה האפקטיבית היא ~60 בדקה, ותנועה של מורים אמיתיים מאותו IP צורכת אותה גם כן. בפועל: אורח במקביל לעוד הקשר (או למורים אמיתיים) → 429. לכן: האורח רץ בהקשר אחד (`--guest-jobs 1`), בהפסקה (`--guest-pause`), ואחרי המורים האמיתיים;
429 חולף שהמסך מציג מנוסה שוב אוטומטית (15ש׳). (זו גם תצפית מוצר — ראו להלן.)

### בעיות מוצר שנמצאו (לא תוקנו כאן — לא בבעלות ה-e2e)
1. **תדריך כיתה למחנך/ת של כיתה בלי מקצועות עדיין → 403 "אין הרשאה לצפות בנתון זה"** במקום מצב ריק מסביר: `server/src/lib/analyticsV2/providerCore.ts:657` (`if (!subjects.length) denied()` בענף הכיתה של `briefing`).
   שחזור: מחנך/ת של כיתה שרק הוא/היא משויך/ת אליה, ופתיחת `/analytics/class/<id>?tab=overview&brief=class:<id>`. נגיש רק דרך כתובת (אין כפתור תדריך כיתה במסך כיתה בלי מקצועות). התרחיש `analytics-briefing-class-no-subjects` מסומן `knownIssue`; כשיתוקן יופיע בדוח "ייתכן שתוקנה".
2. **מכסת בקשות האורח: התנגשות מפתחות** (`server/src/middleware/rateLimit.ts:55-62` + `server/src/routes/analyticsV2.ts:33-35`): ראו למעלה. מסקנה מעשית: אורח אחד מקבל ~60 בקשות בדקה (לא 120), והן מתחלקות עם כל מורה אמיתי מאותו IP (למשל רשת בית ספר אחת מאחורי NAT; גם `perIp: 600` משותף לכל מורי בית הספר). אותו דפוס ב-`/api/ai-summary` (`rateLimitByIp('ai-summary')` + `rateLimitByUser`).
3. **כתיבת סיכום AI על תלמיד/ה או כיתה היא 3 לחיצות מהטאב הראשי** (כניסה › תלמיד/ה/כיתה › "סיכום מד״ר הולו" › "כתבו לי סיכום") — מעל עיקרון 4 (עד 2). אפשרות: כפתור כתיבה ישירות מהכפתור במסך (או כתיבה אוטומטית בפתיחת השכבה כשיש מספיק נתונים).
4. בשכבות-על (סיכום/תדריך/משוב) יש שני `h1` בדף (כותרת המסך שמתחת, שמושבתת ב-`inert`, וכותרת השכבה). אין הפרת axe, אך קורא מסך עלול להקריא שניים.

### מגבלות ידועות (לא תוקנו כאן)
- **"התצוגה הקודמת"** (`analytics-entry-previous`; גרף ההתקדמות הכללי — `ProgressLens`/`LegacyAnalyticsPanel`, `src/features/analytics/index.tsx`, `ProgressLens.tsx`): גופנים של 9–13px (42–58 אלמנטים < 14px), 24 יעדי לחיצה < 44px, ואצל מחנך עם כיתה עשירה גם +280px מעבר למסך אחד ב-1366×768. הפאנל מושאר בכוונה כ-fallback וכיעד של כפתור משני.
- **`/creator` (אולפן היצירה)**: 3 הפרות axe (`button-name`, `label`, `select-name`), 18 יעדים קטנים, גופן 9.5px, +11px; **`/creator/library`**: גופן 9px, 63 יעדים קטנים, +3620px. מסכי "קיים היום" משמשים רק כ-smoke של התשתית (וגורמים ל-exit 1 בגלל axe, כמו קודם).
- **לא נבדק ב-e2e**: קריאת LLM אמיתית (אצל `real-*` אף פעם לא לוחצים "כתבו לי סיכום"; האורח מקבל תבנית דטרמיניסטית), מצב `persisted:true` של הסיכום (טבלת `ai_summaries` עוד לא הורצה — עד אז העריכה לא נשמרת), מתגי כיבוי (`ANALYTICS_V2=0` / `ANALYTICS_V2_LIVE=0`), 429 מאולץ, מנהל-על (מנותב ל-`/admin`), ארגון הדגמה (`demo_data_enabled`), ו-`/manage/students`/`/manage/classes` אצל מורה אמיתי (כפתורי הניווט ל-v2).

## צ'קליסט פר-מסך (`npm run e2e:checklist`)

`e2e/out/checklist.md` — מסמך עברי לבדיקה אנושית מהירה: **שורה אחת לכל מסך מובחן**, לא שורה לכל צופה/viewport.
"מסך מובחן" = תרחיש אחד (`scenario.name`); אותו מסך אצל מחנך, מורה מקצועי ומנהל מאוחד לשורה אחת, וה-viewports נאספים לתוכו.
הטבלה נמדדת ב-**1366×768**; אם הריצה לא כללה אותו (למשל `--viewport 1920x1080`), השורה נמדדת בגודל שנכלל וזה כתוב בעמודת "נכנס במסך אחד".

| עמודה | מה זה | איך מאחדים כמה תפקידים |
|---|---|---|
| מסך | שם התרחיש + קבוצה | — |
| תפקידים שנבדקו | תוויות בעברית; "לא נמדדו (MISSING/SKIPPED/ERROR)" נרשם בנפרד | רשימה |
| על איזו שאלה הוא עונה | ה-h1 הגלוי (טקסט מלא). h1 שונה בין תפקידים (שם כיתה/תלמיד) מוצג עם התפקיד; `✗ אין h1`; `~ יותר מ-h1 אחד` | כל הווריאציות |
| נתיב חזרה | דוגמה אחת + "ועוד N וריאציות"; **תפקיד בלי נתיב בעמוד פנימי מסומן בשמו** (`✗ אין נתיב חזרה — …`) | דוגמה + מי חסר |
| נכנס במסך אחד ב-1366×768 | `✓` או `✗ +Npx` (ואילו תפקידים חורגים); `~ גלילה פנימית עד +Npx` כשיש אזור גלילה פנימי; `✗ גלילה אופקית` | הגרוע |
| לחיצות מהטאב הראשי | כפי שהוצהר בתרחיש; `✗` מעל 2 | — |
| axe חמור/קריטי | מספר הכללים שנכשלו ושמותיהם | איחוד |
| יעדי לחיצה קטנים | "X מתוך Y" (קטנים מ-44px מתוך הגלויים) | הגרוע |
| גופן מינימלי | `✓`/`~` (מתחת ל-16px)/`✗` (מתחת ל-14px) + כמה אלמנטים מתחת ל-16 | המינימום |
| מילים אסורות | מספר ושמות | איחוד |
| צילומים | קישור לכל תפקיד | — |

ב"בקצרה": ספירת מסכים שנכשלו בתנאי תרחיש, ומסכים עם "בעיה ידועה" (באג מוצר מתועד — `knownIssue`). בפירוט לפי מסך: "תנאי נכשל" / "בעיה ידועה (באג מוצר)" לצד הכשלים האחרים.

מתחת לטבלה — "בקצרה" (X מתוך Y מסכים נכנסים במסך אחד, ללא h1, עם הפרות) ו"פירוט לפי מסך": כל תפקיד × viewport, צילומים, ומי שהפר —
האלמנטים שמגיעים הכי נמוך, אזורי גלילה פנימיים, יעדים קטנים (דוגמאות), הפרות axe, והקשר של מילה אסורה.

הרשומה `checklist` שנכתבת ל-`report.json` נגזרת ב-`e2e/lib/checklist.ts` (`screenChecklist`), ושם גם האיחוד והטבלה (פונקציות pure, נבדקות ב-`--selftest`).
קוד היציאה זהה ל-`e2e:ux` (1 על הפרת axe חמורה/מילה אסורה/שגיאת הרצה; עם `--strict` גם פריסה).

## סריקה סטטית של הקוד — `src/features/uxCopy.test.ts`

מקבילה בלי דפדפן לבדיקת המילים האסורות: `npx vitest run src/features/uxCopy.test.ts` (גם בתוך `npm test`).
עוברת על כל מחרוזת-ליטרל (כולל תבניות) וטקסט JSX בקבצי `.ts/.tsx` של `src/features/{results,analyticsV2,teacherUi}` (בלי בדיקות)
ועל `src/shared/lib/findingsNarrative.ts`, ונכשלת עם `קובץ:שורה «מילה» …הקשר…` אם נמצאה אחת מהמילים/הגזעים:
וקטור · p-value · "p מתוקן" · מובהק · BH · Benjamini · אינדקס · קורלציה · גודל אפקט · הסתברות (אותה רשימה כמו `e2e/lib/forbidden.ts`; מבחן נפרד מוודא שהן זהות).
הסריקה היא על מחרוזות בלבד — לא על הערות, שמות משתנים או טיפוסי-מחרוזת (`type X = 'a' | 'b'`), שאינם מוצגים למשתמש.

**רשימת החריגים (`ALLOW` בראש הקובץ) מכוונת-קטנה**, ושום דבר מלבדה לא מותר:
1. תת-עץ JSX של `<HowWeCalc>` או של אלמנט עם האטריביוט `data-how-we-calc` (כולל ילדיו ואטריביוטיו, אבל לא אחיו).
2. בקובץ `findingsNarrative.ts` בלבד: ההצהרות העליונות `HOW_WE_CALC` ו-`evidenceLinesTechnical`.

לכן טקסט טכני שמועבר ל-`<HowWeCalc>` דרך משתנה שהוגדר מחוץ לחריגים ייתפס — הגדירו אותו בתוך `HOW_WE_CALC` או כתבו אותו בתוך האלמנט.
הבדיקה כוללת בדיקה עצמית שמשתילה מחרוזות אסורות (רגילה, JSX, תבנית, אטריביוט) ומוודאת שהסורק תופס אותן ושהחריגים לא "דולפים" לאחים/לקבצים אחרים,
ובדיקת כיסוי (מספר קבצים ומספר מחרוזות עבריות שנסרקו) כדי שה-glob הריק לא יעבור בשקט.

## מבנה הקבצים

```
e2e/run.ts            CLI        e2e/scenarios.ts   רשימת המסכים (נתונים)    e2e/selftest.ts   בדיקה עצמית
e2e/lib/login.ts      אורח + שני fixtures (תהליך-בן)  e2e/lib/discover.ts   גילוי מזהים (+ משתני fixture קבועים)
e2e/lib/fixtureChild.ts   מריץ seed/cleanup של fixture בתהליך-בן (cwd=server)
server/src/scripts/resultsFixture.ts   zz-ux-res-   |   analyticsFixture.ts   zz-ux-v2-w8-   (+ `npm run fixture:v2 -- cleanup|leftover`)
e2e/lib/audit.ts      צילום + axe + מילים אסורות + פסיקה   e2e/lib/pageProbe.ts   מדדי פריסה (רץ בתוך הדף)
e2e/lib/runner.ts     ניווט/צעדים/סבילות             e2e/lib/report.ts   report.json / report.md
e2e/lib/forbidden.ts  רשימת המילים האסורות            e2e/lib/config.ts   ספים, נתיב Chrome
e2e/lib/checklist.ts  checklist.md + רשומת checklist ב-report.json
src/features/uxCopy.test.ts   סריקה סטטית של מילים אסורות בקוד (vitest)
```

בדיקת טיפוסים: `npx tsc -p e2e/tsconfig.json`. (`tsc -b` של השורש אינו כולל את `e2e/`.)

## הערות והמלצות

- **הערכה**: ברירת המחדל בהירה (מסכי מורה, עיקרון 12). `--dark` מריץ את אותו הדבר בכהה — צילומים עם סיומת `-dark`.
- **תנועה**: `prefers-reduced-motion: reduce` מופעל; ספלאש הפתיחה מדולג (`sessionStorage.holo_splash_seen`).
- **viewport מול מחשב נייד אמיתי**: 1366×768 הוא גודל חלון הדפדפן; במחשב אמיתי שורת הכתובת והטאבים לוקחים ~120px, כך שאותו מסך יהיה נמוך יותר.
  לבדיקה מחמירה: `--viewport 1366x650`.
- **מקביליות עם עריכות**: כשסוכנים אחרים שומרים קבצים, ה-HMR/`tsx watch` מאתחלים; לכן יש ניסיונות חוזרים ב-API וב-ניווט (ובמסך שהציג 429/503 חולף, ובדף שחזר ל"טוען…" בזמן המדידה — Vite שמרענן אחרי גילוי תלות חדשה). כשל חולף → הריצו שוב.
- **ביצועים**: ריצה מלאה (326 הרצות, שני viewports, שני fixtures) ≈ 25 דקות; תת-קבוצה כהה (108 מסכים) ≈ 10 דקות. מורים אמיתיים — 3 הקשרים במקביל; האורח — הקשר אחד. ריצה במקביל לסוכנים אחרים: `--out <תיקייה פרטית>`, כדי שלא יידרסו קבצי `e2e/out`.
  **אסור להריץ שתי ריצות e2e במקביל** (אותו fixture — הניקוי של אחת מוחק את משתמשי השנייה) וגם לא ריצה + `v2:accept`/`authz:accept`/`results:accept`.
- **ריצה כהה**: `npx tsx e2e/run.ts --dark --viewport 1366x768 --only group:analytics,group:admin,group:ai --out <תיקייה>` (הקבצים נושאים `-dark`; `--out` נפרד כדי לא לדרוס את `report.json` של הריצה הבהירה).
- **פלט**: `e2e/out/` מתעלם מ-git (`e2e/out/.gitignore`). ריצה עם `--only` לא מוחקת צילומים ישנים של מסכים אחרים; ריצה מלאה מנקה את כל ה-PNG.
- Chrome נמצא ב-`C:\Program Files\Google\Chrome\Application\chrome.exe` (או `E2E_CHROME=<נתיב>`).
