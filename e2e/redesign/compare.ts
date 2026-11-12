/* מרכיב תמונות "לפני / אחרי" זו לצד זו (JPEG) מתוך שתי תיקיות של shots.ts. כלי בדיקה בלבד.
   npx tsx e2e/redesign/compare.ts reports/redesign/before reports/redesign/after reports/redesign/compare */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'
import { findChrome } from '../lib/config.ts'

const [before, after, out] = [path.resolve(process.argv[2]), path.resolve(process.argv[3]), path.resolve(process.argv[4])]
mkdirSync(out, { recursive: true })

export const SCREENS: [string, string][] = [
  ['public-01-home', 'דף הבית'],
  ['public-05-splash', 'מסך הפתיחה (ספלאש)'],
  ['public-04-class-entry', 'כניסת כיתה'],
  ['public-02-staff-login', 'כניסת צוות'],
  ['staff-01-new-lesson', 'שיעור חדש'],
  ['staff-02-library', 'ספריית שיעורים'],
  ['student-home', 'רשימת השיעורים של התלמיד/ה'],
  ['game-01-opening-lab', 'משחק: מסך הפתיחה (המעבדה נשארה)'],
  ['game-02-page-text', 'משחק: עמוד טקסט'],
  ['game-03-challenge', 'משחק: אתגר'],
  ['game-04-wrong-first', 'משחק: משוב על טעות (ניסיון ראשון)'],
  ['game-05-correct', 'משחק: משוב על תשובה נכונה'],
  ['game-06-wrong-final', 'משחק: שתי טעויות'],
  ['end-2-gems', 'מסך סיום: 2 קריסטלים'],
  ['end-3-gems', 'מסך סיום: 3 קריסטלים'],
  ['end-5-gems', 'מסך סיום: 5 קריסטלים'],
  ['end-5-gems-reduced-motion', 'מסך סיום: תנועה מופחתת'],
  ['staff-03-lesson-summary-list', 'סיכום שיעור: רשימה'],
  ['staff-04-lesson-summary-page', 'סיכום שיעור: עמוד שיעור'],
  ['staff-06-live-view', 'סיכום שיעור: תצוגה חיה'],
  ['staff-07-progress-entry', 'התקדמות: כניסה'],
  ['staff-08-progress-class', 'התקדמות: כיתה'],
  ['staff-09-admin-lens-progress', 'מנהל/ת: התקדמות'],
  ['staff-10-admin-lens-summary', 'מנהל/ת: סיכום שיעור'],
  ['staff-12-students', 'כיתות ותלמידים'],
  ['staff-13-superadmin', 'מנהל-על'],
  ['projector-01-page-text', 'מצב כיתתי עם מקרן (1920×1080): עמוד'],
  ['projector-02-challenge', 'מצב כיתתי עם מקרן (1920×1080): אתגר'],
  ['mobile-02-page-text', 'טלפון לרוחב (740×360): עמוד'],
  ['mobile-03-challenge', 'טלפון לרוחב (740×360): אתגר'],
  ['mobile-04-correct', 'טלפון לרוחב (740×360): משוב'],
]

const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ['--allow-file-access-from-files'] })
const page = await browser.newPage({ viewport: { width: 1800, height: 600 } })
const made: string[] = []
for (const [name, label] of SCREENS) {
  const b = path.join(before, `${name}.png`), a = path.join(after, `${name}.png`)
  if (!existsSync(a)) { console.log('missing after', name); continue }
  const cell = (file: string, cap: string) => `<figure style="margin:0;flex:1;min-width:0"><figcaption style="font:700 20px Arial;padding:0 0 6px;color:#1E1830">${cap}</figcaption>${existsSync(file) ? `<img src="${pathToFileURL(file).href}" style="width:100%;display:block;border:2px solid #1E1830">` : '<div style="padding:40px;font:16px Arial">אין צילום</div>'}</figure>`
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:14px;background:#fff;direction:rtl"><div style="display:flex;gap:14px;direction:ltr">${cell(b, 'לפני')}${cell(a, 'אחרי')}</div></body>`
  const f = path.join(out, '_tmp.html')
  writeFileSync(f, html, 'utf8')
  await page.goto(pathToFileURL(f).href)
  await page.waitForTimeout(250)
  await page.screenshot({ path: path.join(out, `${name}.jpg`), type: 'jpeg', quality: 80, fullPage: true })
  made.push(name)
  void label
}
await browser.close()
console.log(made.length, 'pairs')
