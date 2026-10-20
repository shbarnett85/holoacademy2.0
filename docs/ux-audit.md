# ביקורת UX ונגישות (Playwright + axe)

תשתית אוטומטית שעוברת על מסכי המורה בדפדפן אמיתי (Chrome המותקן, בלי הורדת דפדפנים), מצלמת, ובודקת אותם מול
"עקרונות ממשק למסכי מורה" ב-`CLAUDE.md`. היא **לא** מחליפה בדיקה אנושית — היא תופסת את מה שאפשר למדוד.

## הרצה מהירה

דרישות: שרת (3001) וקליינט (5173) רצים (`.claude/launch.json` / `npm run dev` + `npm run dev:server`).

```
npm run e2e:ux                                   # הכול: שני viewports, ערכה בהירה, כולל מורים אמיתיים (fixture)
npm run e2e:ux -- --no-real                      # בלי fixture / בלי מורים אמיתיים (מהיר, לא נוגע ב-DB)
npm run e2e:ux -- --only results                 # כל מסכי "תוצאות"
npm run e2e:ux -- --only analytics-student.real-homeroom --viewport 1366x768
npm run e2e:ux -- --only group:admin --dark      # קבוצה שלמה, ערכה כהה
npm run e2e:ux -- --list                         # מה ירוץ (בלי להריץ)
npm run e2e:ux -- --strict                       # כשל גם על פריסה / יעדים קטנים / גופן / hover / breadcrumb / לחיצות
npm run e2e:ux -- --selftest                     # בדיקה עצמית של התשתית (דף סינתטי עם פגמים מוכרים)
npm run e2e:checklist -- --viewport 1366x768 --no-real   # הרצה + צ'קליסט פר-מסך (e2e/out/checklist.md); אותם סינונים כמו e2e:ux
```

שקול ל-`npx tsx e2e/run.ts <אפשרויות>`.

| אפשרות | משמעות |
|---|---|
| `--only a,b` | תת-מחרוזת של `<name>.<who>` (למשל `results-class`, `real-subject`), או `group:<results\|analytics\|admin\|existing>`, או `who:<צופה>` |
| `--viewport WxH` | חוזר או מופרד בפסיקים. ברירת מחדל `1366x768, 1920x1080` |
| `--dark` | ערכה כהה (ברירת מחדל: בהירה; `localStorage['holo-theme']` נקבע במפורש) |
| `--no-real` | לא מזריע fixture; כל מסכי `real-*` לא נכללים |
| `--strict` | גורם ל-exit 1 גם על כשלי "פריסה" (ראו למטה) |
| `--out <dir>` | תיקיית פלט (ברירת מחדל `e2e/out`, מתעלמת מ-git) |
| `--jobs N` | הקשרי דפדפן במקביל (ברירת מחדל 3) |
| `--headed` | דפדפן גלוי (דיבוג) |
| `--no-screenshots` | בלי PNG |
| `--timeout ms` | timeout לפעולה (15000) |
| `--base`, `--api` | כתובות (`E2E_BASE_URL`, `E2E_API_URL`; ברירת מחדל localhost:5173 / 3001) |
| `--keep-fixture` / `--cleanup-only` | לא לנקות את ה-fixture בסוף / לנקות שרידים מריצה שקרסה |
| `--checklist` | בנוסף ל-`report.*` כותב `e2e/out/checklist.md` (זה מה ש-`npm run e2e:checklist` מוסיף) |
| `--checklist-only` | בונה מחדש את `checklist.md` מ-`report.json` קיים, בלי להריץ דפדפן |

**קוד יציאה**: `1` אם יש הפרת axe ברמת serious/critical, מילה אסורה בטקסט הגלוי, או שגיאת הרצה (דף שקרס / הופנה ל-login).
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
5. **דוחות**: `e2e/out/report.md` (טבלה קריאה + פירוט כשלים) ו-`e2e/out/report.json` (מלא, לצריכה ע"י כלים).
   לכל מסך ב-`report.json` (גם `missing`/`skipped`/`error`, אז השדות `null`) יש שדה `checklist`:
   `h1` (טקסט מלא = השאלה שהמסך עונה עליה) · `breadcrumb` (טקסט מלא) · `clicksFromMainTab` (מהתרחיש) · `fitsOneScreen`/`overflowPx` ·
   `fitsAt1366x768` (true/false רק לתוצאה שנמדדה ב-1366×768, אחרת `null`) · `screenshot` · `urlPattern` · `viewport` · `h1Count`.

עמודות הדוח: Screen · Viewport · Status (`ok`/`MISSING`/`SKIPPED`/`ERROR`) · Fits 1 screen · Axe serious+critical (מספר כללים) ·
Small targets (קטנים/סה"כ) · Min font · Forbidden words · Breadcrumb · Clicks from main tab.

**כשלים קשיחים (exit 1)**: axe חמור/קריטי, מילים אסורות, שגיאת הרצה. **strict**: לא נכנס במסך אחד, גלילה אופקית, יעדים קטנים,
גופן < 14px, מידע רק ב-hover, אין breadcrumb בעמוד פנימי, אין h1, יותר מ-2 לחיצות. הספים ב-`e2e/lib/config.ts` (`THRESHOLDS`).

## מי צופה (`who`)

| `who` | איך נכנסים | העדשה |
|---|---|---|
| `guest-homeroom` | `POST /api/auth/guest-login` → `localStorage['holo_staff_session']` | `?lens=homeroom` (מתווסף אוטומטית ל-URL ולקריאות הגילוי) |
| `guest-subject-math` / `guest-subject-hebrew` | כנ"ל | `?lens=subject_teacher&subject=math\|hebrew` |
| `guest-admin` | כנ"ל | `?lens=admin` |
| `real-homeroom` / `real-subject` / `real-unlinked` / `real-admin` | מורים זמניים מ-`server/src/scripts/resultsFixture.ts` (`seedResultsFixture()`): `teachers.homeroom` / `subjectSame` / `unlinked` / `admin` | התפקיד האמיתי |

מורי ה-`real-*` נוצרים **בבסיס הנתונים המשותף עם הפרודקשן**, כל שורה עם הקידומת `zz-ux-`.
**אל תריצו שני דברים שמשתמשים ב-fixture במקביל** (שתי ריצות e2e, או ריצה + `resultsAcceptance`): הניקוי הוא לפי הקידומת, ולכן ניקוי של אחד מוחק את המשתמשים של השני —
הסימפטום: מסכי `real-*` נכשלים באמצע ריצה עם "הופנה ל-/staff/login — ה-session נדחה". ה-runner מזריע בתחילה (רק אם נבחר מסך `real-*`),
ומנקה ב-`finally` (גם ב-Ctrl+C). לאימות שלא נשאר דבר: `leftoverResultsFixture()` מ-`resultsFixture.ts` (כל המונים 0).
אחרי קריסה קשה: `npm run e2e:ux -- --cleanup-only`.

ה-fixture רץ בתהליך-בן (`e2e/lib/fixtureChild.ts`, cwd=`server/`) כדי ש-`.env` ו-`node_modules` של השרת ייטענו; הטוקנים מועברים בזיכרון בלבד (לא מודפסים, לא נכתבים לדיסק).
**צורת ה-fixture שהתשתית מצפה לה** (סלחנית — `e2e/lib/login.ts → findRoleSession`): `fx.teachers.<role> = { userId, name, token }` עם `homeroom | subjectSame | unlinked | admin`,
ו-`fx.classId`, `fx.submissions.sci`, `fx.students.<avi|beni>.id` (גיבוי לגילוי מזהים). אם הקובץ חסר או לא מחזיר טוקן לתפקיד — מסכי אותו `real-*` מדווחים `SKIPPED` עם הסיבה (לא כשל).
עקיפה ידנית לתפקיד: `E2E_REAL_<ROLE>_TOKEN`.

## קובץ התרחישים (`e2e/scenarios.ts`)

רשימת אובייקטים; מורחבת ל-"מסך לכל צופה" (`<name>.<who>`). כל מזהה **מתגלה בזמן ריצה** (אין מזהים קשיחים).

```ts
{
  name: 'results-student',                 // ייחודי; a-z 0-9 -   (שם הקובץ + --only)
  group: 'results',                        // 'results' | 'analytics' | 'admin' | 'existing'
  who: ['guest-homeroom', 'real-homeroom'],// צופה או מערך צופים
  url: '/results/{submissionId}/student/{resultsStudentId}',  // {placeholders} מתגלים; לאורח מתווסף ?lens=…
  steps: [ { click: { role: 'tab', name: 'טעויות נפוצות' } } ],  // אופציונלי; click|fill|waitFor|wait|press
  ready: 'h1',                             // אופציונלי: אלמנט "המסך מוכן"; חסר → "route/element missing"
  inner: true,                             // עמוד פנימי → breadcrumb נדרש (strict)
  clicksFromMainTab: 2,                    // אופציונלי; ברירת מחדל = מספר צעדי ה-click
  note: 'טקסט חופשי לדוח',
}
```

- **target** של צעד/`ready`: מחרוזת (CSS / `text=…` / `role=…` של Playwright) או `{ text, exact? }` או `{ role, name?, exact? }`. אפשר `{placeholders}` בתוכו.
- **placeholders** (`e2e/lib/discover.ts`): `{submissionId}` `{resultsStudentId}` `{resultsAttentionStudentId}` (מ-`GET /api/results/submissions` ו-`/submission/:id`),
  `{classId}` `{studentId}` `{subject}` `{subjectName}` `{className}` (מ-`/api/analytics-v2/config|roster`; לצופי `real-*` גיבוי מה-fixture).
  מזהה שלא נמצא → המסך `SKIPPED` ("לא ניתן לגלות …" + הסיבה). להוספת משתנה חדש: הרחיבו `discoverResults`/`discoverAnalytics`.
- **צעדי click כמסלול מהטאב הראשי**: כדי למדוד לחיצות באמת (ולא רק להצהיר), כתבו `url` של הטאב הראשי ו-`steps` של הלחיצות; המדד = מספר ה-click.
- מסך שלא נבנה (דף ריק / הפניה / אלמנט חסר / timeout בניווט) → `MISSING`, לא קריסה. ריצה חוזרת אוטומטית (HMR של Vite שמרענן את הדף באמצע מדידה; דף ריק רגעי).
- **`ready` = סימן שהנתונים הגיעו** (המתנה עד 20ש׳, אחרי הצעדים). בלעדיו, צילום שנלקח בזמן "טוען…" נראה כמסך תקין. הסימנים בשימוש:
  `[data-submission-row], [data-empty-state]` (רשימת תוצאות), `[data-people-panel]` (מסכי הדמיה/תלמיד בתוצאות), `[data-class-id]` (כניסה לאנליטיקה — הכרטיסים,
  כולל קיצורי המקצועות, מופיעים רק אחרי ששתי הקריאות חזרו), `[role="tablist"]` (מסכי כיתה/תלמיד באנליטיקה).
  מסך שקיים רק במצב הדגמה (אנליטיקה v2) מדווח אצל צופה `real-*` כ-`MISSING` עם הסיבה — וזה נכון: מורה אמיתי רואה היום את האנליטיקה הקיימת (`analytics-entry-real`).
- הרצה במקביל ל-DB המשותף עלולה להאט את התשובות; תרחיש שנכשל ב-`ready` בלי שינוי בקוד — הריצו אותו שוב לבד (`--only <name>.<who> --jobs 1`) לפני שמסיקים שהוא שבור.

### התרחישים הנוכחיים

| קבוצה | תרחיש | מה בודק |
|---|---|---|
| results | `results-list` | הרשימה: משפט סיכום אחד, סינון, שורות קומפקטיות; `real-unlinked` = מצב ריק |
| results | `results-class` · `results-student` · `results-student-attention` | מסך ההדמיה (כל הכיתה / לפי תלמיד/ה) |
| results | `results-class-objectives` · `-errors` · `-review` | שלושת הטאבים האחרים — **סט הטאבים קבוע**: עם נתונים הרשימה, בלעדיהם מצב ריק מסביר |
| results | `results-student-slides` | תלמיד/ה › זמן בשקפים |
| results | `results-class-how-we-calc` | "איך חישבנו?" פתוח: חלון מעל התוכן עם כפתור "סגירה" |
| analytics | `analytics-entry` | "איזו כיתה תרצו לראות?" (אורח) |
| analytics | `analytics-entry-real` | האנליטיקה הקיימת למורה אמיתי (התקדמות + סוגי אתגרים) |
| analytics | `analytics-class-overview` · `-summary` · `-errors` · `-progress` · `-students` · `analytics-student` | מסכי הכיתה והתלמיד/ה |
| admin | `admin-overview` · `-grades` · `-subjects` · `-errors` | מסכי המנהל/ת |

## מצב המסכים אחרי תיקוני ה-UI (F2) — מדידות

מורה אורח (נתוני הדגמה), ערכה בהירה אלא אם צוין. הריצה: `npm run e2e:checklist -- --no-real --viewport <WxH> --only group:results,group:analytics,group:admin`.

| viewport | מסכים נמדדו | נכנסים במסך אחד | גלילה פנימית (אזורי `overflow:auto` עם תוכן חורג) | axe חמור/קריטי | מילים אסורות | יעדי לחיצה < 44px | גופן מינימלי |
|---|---|---|---|---|---|---|---|
| 1366×768 | 48 (20 מסכים מובחנים) | 48/48 | **0** | 0 | 0 | 0 | 14px (רק תוויות צירים בגרפים) |
| 1920×1080 | 48 | 48/48 | **0** | 0 | 0 | 0 | 14px (כנ״ל) |
| 1366×768, כהה | 48 | 48/48 | 0 | 0 | 0 | 0 | 14px (כנ״ל) |
| 1366×768, **מורים אמיתיים** (fixture; מסכי תוצאות, 18 מסכים) | 18 | 18/18 | 0 | 0 | 0 | 0 | 16px |

(ריצת ה-fixture המלאה: 84 מסכים, 0 כשלים קשיחים; 11 `MISSING` = מסכי אנליטיקה v2 למורה אמיתי שעדיין לא קיימים (ועוד `MISSING` חולף אחד של אורח, "דף ריק" בזמן ריצה במקביל, שעבר בריצה חוזרת); 7 כשלי strict — כולם באנליטיקה הקיימת, ראו "מגבלות ידועות".
ה-fixture נוקה ואומת: כל המונים של `leftoverResultsFixture()` = 0.)

הערות:
- לפני התיקון: מסך ההדמיה (כיתה) גלל פנימית עד +316px (רשימת התלמידים) ועד +287px (האתגרים); מסך התלמיד/ה עד +1124px. עכשיו הכול נכנס בלי גלילה פנימית עבור נתוני ההדגמה
  (כיתה של 25 תלמידים, 6 אתגרים). כיתה גדולה בהרבה, שם ארוך במיוחד, או פירוט פתוח של אתגר — עדיין גוללים בתוך **אזור אחד** (הרשימה/הטאב), לא בעמוד.
- גוף הטקסט הוא 16px בכל מקום. 14px נשאר **רק** בתוויות הצירים והמספרים הקטנים בתוך הגרפים (גודל ה-SVG נקבע בפיקסלים אמיתיים; ראו `teacherUi/ChartFrame`) — מוגדר ב-`charts.tsx`.
- "איך חישבנו?" הוא כפתור אחד בקצה שורת הכותרת בכל מסך (ScreenShell, prop `howWeCalc`); החלון נפתח מעל התוכן ולא דוחף אותו. כשהוא סגור אין ב-DOM שום תוכן סטטיסטי.
- שורת בורר העדשות של האורח היא שורה אחת של 48px (משפט הסבר קצר + מתג צפוף + בורר מקצוע באותה שורה); אצל מורה אמיתי אין אותה בכלל.

### מגבלות ידועות (לא תוקנו כאן)
- **האנליטיקה הקיימת למורה אמיתי** (`analytics-entry-real`, וגם מסכי המנהל האמיתי `admin-*.real-admin` שמציגים אותה): `ProgressLens` ו-`LegacyAnalyticsPanel` (`src/features/analytics/index.tsx`,
  `ProgressLens.tsx`) עדיין עם גופנים של 9–13px ויעדי לחיצה < 44px. הקבצים האלה מחוץ לתחום התיקון הזה; רק `ChallengeTypesPanel` תוקן (סדר מקצועות). נמדד: עד 16 יעדים קטנים ועד 26 אלמנטים בגופן < 14px.
- **`/creator` (אולפן היצירה)**: 3 הפרות axe (`button-name`, `label`, `select-name`), 18 יעדים קטנים, גופן 9.5px; **`/creator/library`**: גופן 9px ו-63 יעדים קטנים. מסכי "קיים היום" משמשים רק כ-smoke של התשתית.
- מסכי אנליטיקה v2 למורה אמיתי לא קיימים עד שהספק האמיתי מוכן — הם מדווחים `MISSING` עם הסיבה.

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
e2e/lib/login.ts      אורח + fixture (תהליך-בן)     e2e/lib/discover.ts   גילוי מזהים
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
- **מקביליות עם עריכות**: כשסוכנים אחרים שומרים קבצים, ה-HMR/`tsx watch` מאתחלים; לכן יש ניסיונות חוזרים ב-API וב-ניווט. כשל חולף → הריצו שוב.
- **ביצועים**: 48 מסכי אורח × viewport ≈ 2.5 דקות (3 הקשרים במקביל); עם מורים אמיתיים (fixture, 84 מסכים) ≈ 6–7 דקות. ריצה במקביל לסוכנים אחרים: `--out <תיקייה פרטית>`, כדי שלא יידרסו קבצי `e2e/out`.
- **פלט**: `e2e/out/` מתעלם מ-git (`e2e/out/.gitignore`). ריצה עם `--only` לא מוחקת צילומים ישנים של מסכים אחרים; ריצה מלאה מנקה את כל ה-PNG.
- Chrome נמצא ב-`C:\Program Files\Google\Chrome\Application\chrome.exe` (או `E2E_CHROME=<נתיב>`).
