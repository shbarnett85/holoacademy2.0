# HoloAcademy — Runbook תפעולי

מדריך קצר למי שמתחזק את המערכת. (תיעוד פיתוח מפורט: `CLAUDE.md`.)

## ארכיטקטורה בשורה
- **פרודקשן**: Railway מגיש את `main` — **כל push ל-main הוא deploy** (~1-2 דק׳). Express מגיש גם את ה-React bundle וגם את ה-API (same-origin).
- **DB**: Supabase — **משותף לפיתוח ולפרודקשן** (אין staging). כל כתיבה מקומית נראית מיד באוויר. נתוני בדיקה: לסמן בכותרת (`__X_E2E__`) ולמחוק מיד.
- **AI**: יצירה על Sonnet, ולידציה/תיקונים על Haiku (Anthropic); תמונות Together; אחסון תמונות Supabase Storage.

## הרצה מקומית
```
npm run dev          # קליינט (5173)
npm run dev:server   # שרת (3001, tsx watch)
```
ה-Vite מפנה `/api/*` ל-3001. הסודות ב-`server/.env` (לעולם לא בקוד/צ'אט).

## משתני סביבה (שמות בלבד)
| קבוצה | משתנים |
|---|---|
| AI | `ANTHROPIC_API_KEY`, `TOGETHER_API_KEY` |
| Supabase | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` |
| מיגרציות (DDL) | `SUPABASE_DB_HOST` + `SUPABASE_DB_PASSWORD` **או** `DATABASE_URL` |
| אימות | `JWT_SECRET` (טוקן תלמידי PIN), `SUPERADMIN_EMAILS` (מופרד בפסיקים) |
| סקריפטים | `SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD` (ל-create-superadmin) |
| אורח | `GUEST_EMAIL`/`GUEST_PASSWORD` — אופציונלי; בלעדיהם נופל ל-`teacher@demo.com`/`demo1234` (לכן `guestConfigured:false` ב-health אינו תקלה) |
| אחר | `CLIENT_URL` (CORS; בפרודקשן same-origin — לא חובה), `PORT` |

## מיגרציות וזריעה
```
cd server
npm run migrate -- migrations/<file>.sql   # DDL בחיבור Postgres ישיר
npm run seed              # מורה/מנהל דמו + כיתה (idempotent)
npm run seed:analytics    # נתוני אנליטיקה לכיתת הדגמה
npm run seed:snapshots    # סדרת progress_snapshots
npm run seed:library -- --limit 1 --share  # הדמיות רשמיות (עלות אמיתית! QA אנושי לכל אצווה)
npm run create-superadmin
```
- `server/schema.sql` — DDL היסטורי שמורץ ידנית ב-SQL Editor של Supabase (סעיפים ממוספרים).
- אחרי DDL ייתכן צורך ב-`NOTIFY pgrst, 'reload schema';` + ריסטרט שרת (cache של activeColumn).
- הקוד **עמיד לפני מיגרציה** בכל מקום (בדיקות `has*` ב-`lib/activeColumn.ts`) — עמודה חסרה לא מפילה, רק מנטרלת פיצ'ר.

## בדיקות ואימות deploy
```
npx vitest run        # מהשורש — 79 בדיקות (כולל שערי האיכות)
npx tsc -b && (cd server && npx tsc --noEmit) && npx vite build
```
אחרי push ל-main:
```
curl -sk https://holoacademy.ai/api/health            # ok:true + כל ה-configured
curl -sk https://holoacademy.ai/api/quests/showcase   # 14 הדמיות רשמיות
```

## שערי איכות התוכן (איפה מה חי)
- **בטיחות תוכן** (קלט לפני יצירה + פלט חוסם): `server/src/lib/contentSafety.ts`.
- **ולידציה מבנית + עקביות תשובה/הסבר** (T/F הפוך = חוסם): `lib/questSchemas.ts` → `checkAnswerConsistency`.
- **ערבוב מיקומי תשובות** (נטרול הטיית "הנכונה ראשונה"): `shuffleAnswerPositions`, רץ בצינור אחרי הזרקת הקושי.
- **בדיקת עובדות ברקע + מתקן מרוסן**: `lib/factCheck.ts`; תקיעת `pending` נרפאת אוטומטית ב-`GET /quests/:id` (watchdog 10 דק׳).
- **שער שיתוף לספרייה הציבורית**: אזהרות פתוחות → המורה מאשר במפורש; סתירת תשובה חיה → 422.

## משפך הצמיחה
- דף הבית: מדף "התנסו עכשיו" (ללא הרשמה) + "איך זה עובד" + קישור ה-brief (`/files/holoacademy-brief.pdf`).
- קישורי `/play/:id` נפתחים עשירים בוואטסאפ (הזרקת OG בשרת, פרודקשן בלבד).
- **מדידה**: טבלת `funnel_events` (אנונימית); צפייה ב-`/admin` (פאנל "משפך ההתנסות") או `GET /api/funnel/summary`.

## תקלות נפוצות
| סימפטום | סיבה/פתרון |
|---|---|
| "בודק עובדות ברקע…" לא נגמר | ריסטרט באמצע ריצה — נרפא לבד בפתיחה הבאה של ההדמיה (watchdog) |
| יצירה נכשלה | `game_data.genError` מכיל את ההודעה; הקליינט מציג אותה ב-polling |
| ספרייה ציבורית ריקה / share מחזיר 503 | מיגרציית סעיף 9 לא רצה |
| עמודה חדשה "לא נתפסת" אחרי DDL | `NOTIFY pgrst, 'reload schema'` + ריסטרט שרת |
| עברית משובשת בכלי shell (מכונת החלונות) | לעבוד דרך סקריפט `tsx` בתוך `server/` — לא PowerShell/curl ישיר |
| `git push` נכשל ב-TLS (מכונת הפיתוח) | `git -c http.sslVerify=false push` |
