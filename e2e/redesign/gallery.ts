/* בונה דף גלריה (index.html) להשוואת "לפני / אחרי" מתוך התמונות ש-compare.ts יצר. כלי בדיקה בלבד.
   npx tsx e2e/redesign/gallery.ts reports/redesign/compare */
import { existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const dir = path.resolve(process.argv[2])
const GROUPS: [string, [string, string][]][] = [
  ['כניסה ודף הבית', [['public-01-home', 'דף הבית'], ['public-05-splash', 'מסך הפתיחה'], ['public-04-class-entry', 'כניסת כיתה'], ['public-02-staff-login', 'כניסת צוות']]],
  ['מסכי התלמיד', [['student-home', 'רשימת השיעורים'], ['game-01-opening-lab', 'מסך הפתיחה של שיעור (המעבדה נשארה כמו שהיא)'], ['game-02-page-text', 'עמוד טקסט'], ['game-03-challenge', 'אתגר'], ['game-04-wrong-first', 'משוב על טעות, ניסיון ראשון'], ['game-05-correct', 'משוב על תשובה נכונה'], ['game-06-wrong-final', 'שתי טעויות']]],
  ['מסך הסיום והקריסטלים', [['end-2-gems', '2 קריסטלים'], ['end-3-gems', '3 קריסטלים'], ['end-5-gems', '5 קריסטלים'], ['end-5-gems-reduced-motion', 'תנועה מופחתת']]],
  ['מקרן וטלפון', [['projector-01-page-text', 'מצב כיתתי עם מקרן, 1920×1080: עמוד'], ['projector-02-challenge', 'מצב כיתתי עם מקרן: אתגר'], ['mobile-02-page-text', 'טלפון לרוחב, 740×360: עמוד'], ['mobile-03-challenge', 'טלפון לרוחב: אתגר'], ['mobile-04-correct', 'טלפון לרוחב: משוב']]],
  ['מסכי המורה', [['staff-01-new-lesson', 'שיעור חדש'], ['staff-02-library', 'ספריית שיעורים'], ['staff-03-lesson-summary-list', 'סיכום שיעור: רשימה'], ['staff-04-lesson-summary-page', 'סיכום שיעור: עמוד שיעור'], ['staff-06-live-view', 'סיכום שיעור: תצוגה חיה'], ['staff-07-progress-entry', 'התקדמות: כניסה'], ['staff-08-progress-class', 'התקדמות: כיתה'], ['staff-12-students', 'כיתות ותלמידים']]],
  ['מסכי המנהל', [['staff-09-admin-lens-progress', 'מנהל/ת: התקדמות'], ['staff-10-admin-lens-summary', 'מנהל/ת: סיכום שיעור'], ['staff-13-superadmin', 'מנהל-על (בצילום "לפני" הופיע מסך שגיאה בגלל נתוני הבדיקה)']]],
]
const slug = (i: number) => `part-${i + 1}`
const body = GROUPS.map(([title, items], i) => `<section id="${slug(i)}"><h2>${title}</h2>${items.filter(([n]) => existsSync(path.join(dir, `${n}.jpg`))).map(([n, cap]) => `<figure><figcaption>${cap}</figcaption><img src="${n}.jpg" alt="${cap}: לפני מימין לשמאל ואחרי" loading="lazy"></figure>`).join('')}</section>`).join('\n')
const html = `<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>HoloAcademy לפני ואחרי</title>
<style>
:root{--bg:#D9D2EC;--ink:#1E1830;--surface:#FFFFFF;--deep:#6A3FB5;--action:#B3E4FF;--muted:#4F4866}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:Heebo,Arial,sans-serif;line-height:1.5}
header{padding:28px 16px 8px;max-width:1500px;margin:0 auto}
h1{margin:0 0 6px;font-size:30px;color:var(--deep);text-wrap:balance}
header p{margin:0;font-size:17px;color:var(--muted);max-width:70ch}
nav{position:sticky;top:0;z-index:2;background:var(--bg);border-bottom:2px solid var(--ink);padding:10px 16px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
nav a{color:var(--ink);font-weight:700;text-decoration:none;background:var(--action);border:2px solid var(--ink);border-radius:12px;box-shadow:3px 3px 0 var(--ink);padding:6px 14px;font-size:15px}
nav a:active{box-shadow:none;transform:translate(3px,3px)}
nav a:focus-visible{outline:3px solid var(--deep);outline-offset:2px}
main{max-width:1500px;margin:0 auto;padding:0 16px 60px}
h2{font-size:24px;color:var(--deep);margin:34px 0 12px;scroll-margin-top:70px}
section{scroll-margin-top:70px}
figure{margin:0 0 22px;background:var(--surface);border:2px solid var(--ink);border-radius:12px;box-shadow:3px 3px 0 var(--ink);padding:12px;overflow-x:auto}
figcaption{font-weight:700;font-size:18px;margin-bottom:8px}
img{display:block;width:100%;min-width:720px;height:auto;border-radius:6px}
</style></head><body>
<header><h1>השפה החזותית החדשה: לפני ואחרי</h1><p>חלק א׳ של העיצוב החדש. בכל תמונה: משמאל המסך לפני השינוי, מימין אחריו. מסכי המעבדה ודוקטור הולו נשארו כמו שהם, עד שהנכסים החדשים יהיו מוכנים.</p></header>
<nav aria-label="חלקי הדף">${GROUPS.map(([t], i) => `<a href="#${slug(i)}">${t}</a>`).join('')}</nav>
<main>${body}</main>
</body></html>`
writeFileSync(path.join(dir, 'index.html'), html, 'utf8')
console.log('ok', GROUPS.reduce((n, g) => n + g[1].length, 0))
