/* ──────────────────────────────────────────────────────────────────────────
   צילומי מסך לבדיקה ויזואלית של שלב L ("שיעור", שפה חזותית של מקצועות, תאריך הגשה) ושל כרטיס השיעור (תמונה במקום אייקון):
     1. ספריית שיעורים — מורה, מצב בהיר (כרטיס שיעור: תמונה ממוזערת, מסגרת בצבע המקצוע, תגית מקצוע + שכבות; "לא סווג" אפור + שיוך למקצוע;
        שיעור בלי תמונה = משטח בצבע המקצוע עם השם)
     2. רשימת השיעורים של התלמיד — מצב כהה (אותו כרטיס + "להגשה עד …" + "שחקו")
     3. שליחה לכיתה — שדה "להגשה עד" עם ברירת מחדל (שבוע מהיום)
     4. סיכום שיעור — ראש המסך: תג מצב + מועד הגשה + "שינוי מועד הגשה" (חלונית פתוחה)
   הנתונים: התמונות/המקצועות/הכותרות מהספרייה הציבורית האמיתית (GET /api/library); רשימות "הספרייה שלי" ו"השיעורים של התלמיד" והתלמידים
   בטופס השליחה הם **סינתטיים לבדיקה בלבד** (page.route) — אין שום כתיבה ל-DB. כניסה: מורה אורח (בלי סיסמה).
   הרצה:  npx tsx e2e/lessonShots.ts [--out <dir>]      (דורש שהאפליקציה והשרת רצים: 5173/3001)
   ────────────────────────────────────────────────────────────────────────── */
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { DEFAULT_API, DEFAULT_BASE, E2E_DIR } from './lib/config.ts'
import { findChrome } from './lib/config.ts'
import { guestLogin } from './lib/login.ts'

const args = process.argv.slice(2)
const outDir = args.includes('--out') ? path.resolve(args[args.indexOf('--out') + 1]) : path.join(E2E_DIR, 'out')

interface PublicQ { id: string; title: string; subject: string | null; subjectCode: string | null; sceneCount: number; thumbUrl: string | null; gradeMin?: number | null; gradeMax?: number | null }

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true })
  const session = await guestLogin(DEFAULT_API)
  const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ['--no-first-run'] })

  const mk = async (theme: 'light' | 'dark', init?: string) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 2, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', reducedMotion: 'reduce', colorScheme: theme })
    await ctx.addInitScript(`(() => { try { localStorage.setItem('holo-theme', '${theme}'); sessionStorage.setItem('holo_splash_seen', '1'); ${init ?? ''} } catch (e) {} })()`)
    return ctx
  }

  /* ספרייה ציבורית אמיתית — מקור לתמונות/מקצועות/כותרות */
  const libRes = await fetch(`${DEFAULT_API}/api/library`, { headers: { Authorization: `Bearer ${session.access_token}` } })
  const lib = ((await libRes.json()) as { quests: PublicQ[] }).quests
  /* שיעורים מכל מקצוע שיש בו תמונה — מגוון צבעים */
  const bySubject = new Map<string, PublicQ>()
  for (const q of lib) if (q.thumbUrl && q.subjectCode && !bySubject.has(q.subjectCode)) bySubject.set(q.subjectCode, q)
  const picks = [...bySubject.values()].slice(0, 8)
  console.log('מקצועות בצילום:', picks.map((p) => p.subjectCode).join(', '))

  /* ── 1. ספריית מורה (בהיר) ── */
  {
    /* isGuest=false בצד הלקוח בלבד — כפתור "שתף" מנוטרל למורה אורח; כל נתוני הרשימה והתלמידים מוחלפים ב-page.route (אין כתיבה ל-DB) */
    const ctx = await mk('light', `localStorage.setItem('holo_staff_session', ${JSON.stringify(JSON.stringify({ ...session, staff: { ...session.staff, isGuest: false } }))});`)
    const page = await ctx.newPage()
    await page.route('**/api/quests', async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      const quests = picks.map((q, i) => ({
        id: q.id, title: q.title, created_at: new Date(Date.UTC(2026, 9, 26 - i)).toISOString(), is_published: i % 2 === 0, is_public: i === 1, is_review: i === 3,
        sceneCount: q.sceneCount, longSceneCount: 0, thumbUrl: i === 4 ? null : q.thumbUrl, gradeMin: q.gradeMin ?? 7 + (i % 3), gradeMax: q.gradeMax ?? 8 + (i % 3),
        /* שני שיעורים "לא סווג" — לצילום האפור ושיוך המקצוע */
        subject: i === 5 || i === 6 ? null : q.subject, subjectCode: i === 5 || i === 6 ? null : q.subjectCode,
      }))
      await route.fulfill({ json: { quests, permissions: { canShare: true } } })
    })
    await page.goto(`${DEFAULT_BASE}/creator/library`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-lesson-card]')
    await page.waitForTimeout(1200)
    await page.screenshot({ path: path.join(outDir, 'lesson-library-teacher-light.png') })
    /* גלילה לשיעורים ה"לא סווג" */
    const unclassified = page.locator('[data-lesson-thumb][data-subject="unclassified"]').first()
    await unclassified.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(outDir, 'lesson-library-teacher-light-unclassified.png') })

    /* ── 3. שליחה לכיתה: שדה מועד הגשה ── */
    await page.route('**/api/staff/students', (route) => route.fulfill({ json: { students: [
      { id: 's1', name: 'תלמיד לדוגמה א', classId: 'c1', class: 'ו׳2', classCode: 'demo-6b', isActive: true },
      { id: 's2', name: 'תלמיד לדוגמה ב', classId: 'c1', class: 'ו׳2', classCode: 'demo-6b', isActive: true },
      { id: 's3', name: 'תלמיד לדוגמה ג', classId: 'c2', class: 'ו׳3', classCode: 'demo-6c', isActive: true },
    ] } }))
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.locator('[data-lesson-thumb]').first().scrollIntoViewIfNeeded()
    await page.getByRole('button', { name: /^שתף$/ }).first().click({ force: true }).catch(() => undefined)
    await page.getByText('תלמידים', { exact: true }).first().click().catch(() => undefined)
    await page.waitForSelector('[data-send-due]', { timeout: 8000 }).catch(() => undefined)
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(outDir, 'lesson-send-with-due-date.png') })
    await ctx.close()
  }

  /* ── 2. רשימת תלמיד (כהה) ── */
  {
    const fakeJwt = `x.${Buffer.from(JSON.stringify({ userId: 'stu-demo', role: 'student', classId: 'c1', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64')}.y`
    const ctx = await mk('dark', `sessionStorage.setItem('holo_token', '${fakeJwt}'); sessionStorage.setItem('holo_student_name', 'תלמיד לדוגמה');`)
    const page = await ctx.newPage()
    const now = Date.now()
    const day = 86_400_000
    await page.route('**/api/sessions/assigned', (route) => route.fulfill({ json: { quests: picks.slice(0, 6).map((q, i) => ({
      id: q.id, title: q.title, sceneCount: q.sceneCount, artStyle: 'digital-painting', subject: q.subject, subjectCode: i === 5 ? null : q.subjectCode, teacherName: 'המורה רון',
      assignedAt: new Date(now - (i + 1) * day).toISOString(), entryImageUrl: i === 4 ? null : q.thumbUrl, thumbUrl: i === 4 ? null : q.thumbUrl, gradeMin: q.gradeMin ?? 7 + (i % 3), gradeMax: q.gradeMax ?? 8 + (i % 3),
      dueAt: new Date(now + (i === 2 ? -2 : 3 + i) * day).toISOString(), state: i === 2 ? 'ended' : 'open', late: i === 4,
      sessionStatus: i === 3 ? 'completed' : i === 4 ? 'completed' : i === 1 ? 'in_progress' : null, crystals: i === 3 ? 4 : i === 4 ? 2 : null, maxScore: 5, isReview: i === 1,
    })) } }))
    await page.goto(`${DEFAULT_BASE}/student`, { waitUntil: 'networkidle' }).catch(() => undefined)
    await page.waitForSelector('[data-lesson-card]', { timeout: 10_000 }).catch(() => console.log('לא נמצא כרטיס תלמיד — כתובת /student אינה נכונה?', page.url()))
    await page.waitForTimeout(800)
    await page.screenshot({ path: path.join(outDir, 'lesson-student-list-dark.png') })
    await ctx.close()
  }

  /* ── 4. סיכום שיעור: ראש המסך (הדגמה) ── */
  {
    const ctx = await mk('light', `localStorage.setItem('holo_staff_session', ${JSON.stringify(JSON.stringify({ ...session, staff: { ...session.staff, isGuest: false } }))});`)
    const page = await ctx.newPage()
    /* שיעורי ההדגמה אין להם תמונות סצנה; לצילום — תמונות ממוזערות אמיתיות מהספרייה (שורה אחת נשארת בלי תמונה) */
    await page.route('**/api/results/submissions*', async (route) => {
      const res = await route.fetch()
      const body = (await res.json()) as { data?: { submissions?: { thumbUrl: string | null }[] } }
      body.data?.submissions?.forEach((r, i) => { r.thumbUrl = i === 1 ? null : (picks[i % picks.length]?.thumbUrl ?? null) })
      await route.fulfill({ response: res, json: body })
    })
    await page.goto(`${DEFAULT_BASE}/results`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-submission-row]')
    await page.waitForTimeout(800)
    await page.screenshot({ path: path.join(outDir, 'lesson-results-list.png') })
    await page.locator('[data-submission-row]').first().click()
    await page.waitForSelector('[data-head-strip]')
    await page.waitForTimeout(600)
    /* נכנס במסך אחד (עיקרון 3)? גובה המסמך מול החלון + אזורי גלילה פנימיים */
    const fit = await page.evaluate(() => ({
      doc: document.documentElement.scrollHeight, win: window.innerHeight,
      inner: [...document.querySelectorAll<HTMLElement>('*')].filter((e) => { const o = getComputedStyle(e).overflowY; return (o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight + 2 }).map((e) => e.getAttribute('data-people-panel') ?? e.className.toString().slice(0, 30)),
    }))
    console.log('התאמה למסך אחד:', JSON.stringify(fit))
    await page.locator('[data-due-edit]').click()
    await page.waitForSelector('[role="dialog"] input[type="date"]')
    await page.screenshot({ path: path.join(outDir, 'lesson-results-head-due.png') })
    await ctx.close()
  }

  await browser.close()
  console.log('נשמרו ב-' + outDir)
}
main().catch((e) => { console.error(e); process.exit(1) })
