/* ── קבלה חיה: טאב "תוצאות" (/api/results) ─────────────────────────────────────────
   רץ מול השרת המקומי (ACCEPT_API, ברירת מחדל http://localhost:3001/api) ומול ה-DB המשותף.
   יוצר פיקסצ'ר zz-ux-* (resultsFixture.ts), בודק לכל תפקיד × (רשימה / מסך הדמיה / מסך תלמיד) את ההרשאות והתוכן
   ברמת HTTP, ובסוף מנקה ומוודא שלא נשארה אף שורה zz-ux-res-*. סיסמאות אקראיות בזיכרון בלבד. בלי LLM.
   הרצה:  npm run results:accept                                                                      */
import '../env.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { FX_PREFIX, cleanupResultsFixture, leftoverResultsFixture, seedResultsFixture, type FxPrincipal, type ResultsFixture } from './resultsFixture.js'

const API = process.env.ACCEPT_API ?? 'http://localhost:3001/api'
let failed = 0
let total = 0
const check = (name: string, ok: boolean, extra = ''): void => {
  total++
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  — ' + extra : ''}`)
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function get(token: string | null, path: string): Promise<{ status: number; json: any }> {
  /* שרת הפיתוח (tsx watch) מתאתחל בכל שמירת קובץ — חיבור שנפל נבדק שוב */
  let lastErr: unknown
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const r = await fetch(API + '/results' + path, { headers: token ? { Authorization: 'Bearer ' + token } : {} })
      let json: any = {}
      try { json = await r.json() } catch { /* ריק */ }
      return { status: r.status, json }
    } catch (e) {
      lastErr = e
      await new Promise((res) => setTimeout(res, 1500))
    }
  }
  throw lastErr
}

const NIL = '00000000-0000-0000-0000-000000000000'

async function waitForRoute(token: string): Promise<boolean> {
  for (let i = 0; i < 20; i++) {
    const r = await get(token, '/submissions')
    if (r.status !== 404) return true
    await new Promise((res) => setTimeout(res, 1500))
  }
  return false
}

async function main(): Promise<void> {
  /* ניקוי שאריות מריצה קודמת שנקטעה */
  await cleanupResultsFixture()
  const fx: ResultsFixture = await seedResultsFixture()
  const T = fx.teachers
  try {
    if (!(await waitForRoute(T.homeroom.token))) throw new Error('/api/results אינו מוגש בשרת (404) — הפעילו מחדש את שרת הפיתוח')

    const ids = new Set(Object.values(fx.submissions))
    const mine = (r: { json: any }): any[] => (r.json.data?.submissions ?? []).filter((s: any) => ids.has(s.id))
    const has = (rows: any[], id: string): any => rows.find((s) => s.id === id)

    /* ───────── רשימה ───────── */
    console.log('\n— GET /results/submissions —')
    check('בלי טוקן: 401', (await get(null, '/submissions')).status === 401)

    const lHome = await get(T.homeroom.token, '/submissions')
    const home = mine(lHome)
    check('מחנך: 200 ועם מעטפת data', lHome.status === 200 && Array.isArray(lHome.json.data?.submissions), `status=${lHome.status} ${lHome.status !== 200 ? JSON.stringify(lHome.json) : ''}`)
    check('מחנך: רואה את 3 השליחות של הכיתה (לא את שליחת הכיתה השנייה)', !!has(home, fx.submissions.sci) && !!has(home, fx.submissions.old) && !!has(home, fx.submissions.hist) && !has(home, fx.submissions.other))
    const order = home.map((s) => s.id)
    check('ממוין חדש→ישן (hist, sci, old)', order.join() === [fx.submissions.hist, fx.submissions.sci, fx.submissions.old].join(), order.join())
    const rSci = has(home, fx.submissions.sci)
    check('ספירות: 6 תלמידים · 4 סיימו · 1 באמצע · 1 לא התחיל (הסשן הסינתטי מוסתר)', JSON.stringify(rSci?.counts) === JSON.stringify({ total: 6, completed: 4, inProgress: 1, notStarted: 1 }), JSON.stringify(rSci?.counts))
    check('תשומת לב: 2 (ויתר על כמה אתגרים / עוד לא התחיל)', rSci?.attentionCount === 2, `attentionCount=${rSci?.attentionCount}`)
    check('מקור "מחנך" + שם השולח (מורה אחר שלח לכיתה שלי)', rSci?.source === 'homeroom' && rSci?.senderName === T.subjectSame.name, `${rSci?.source}/${rSci?.senderName}`)
    check('משפט סיכום וכרטיס: מקצוע מדעים, כותרת, שם כיתה', typeof rSci?.summary === 'string' && rSci.summary.length > 5 && rSci?.subject?.code === 'science' && rSci?.className === `${FX_PREFIX}main` && /sci$/.test(rSci?.title ?? ''))
    check('אפשרויות סינון: הכיתה והמקצועות (מדעים + היסטוריה)', (lHome.json.data.filters.classes ?? []).some((c: any) => c.id === fx.classId) && ['science', 'history'].every((c) => (lHome.json.data.filters.subjects ?? []).some((s: any) => s.code === c)))

    const lSci = await get(T.subjectSame.token, '/submissions')
    const sciRows = mine(lSci)
    check('מורה מדעים (יוצר+שולח): רואה sci ו-old כ"שלי", לא את hist', lSci.status === 200 && has(sciRows, fx.submissions.sci)?.source === 'mine' && has(sciRows, fx.submissions.old)?.source === 'mine' && !has(sciRows, fx.submissions.hist) && has(sciRows, fx.submissions.sci)?.senderName === null)

    const lHist = await get(T.subjectOther.token, '/submissions')
    const histRows = mine(lHist)
    check('מורה היסטוריה (יוצר hist, לא השולח): רק hist כ"מקצוע" עם שם השולח', histRows.length === 1 && histRows[0].id === fx.submissions.hist && histRows[0].source === 'subject' && histRows[0].senderName === T.senderOnly.name, JSON.stringify(histRows.map((r) => [r.id === fx.submissions.hist, r.source, r.senderName])))

    const lSender = await get(T.senderOnly.token, '/submissions')
    const senderRows = mine(lSender)
    check('שולח בלבד: רואה רק את מה ששלח (hist, "שלי")', senderRows.length === 1 && senderRows[0].id === fx.submissions.hist && senderRows[0].source === 'mine')

    const lOut = await get(T.unlinked.token, '/submissions')
    check('מורה לא מקושר: רק שליחת הכיתה שלו, בלי אף שליחה של הכיתה הראשית', lOut.status === 200 && mine(lOut).length === 1 && mine(lOut)[0].id === fx.submissions.other && lOut.json.data.submissions.length === 1)

    check('מנהל: 403', (await get(T.admin.token, '/submissions')).status === 403)
    check('מנהל עירוני: 403', (await get(T.municipal.token, '/submissions')).status === 403)

    const fCls = await get(T.homeroom.token, `/submissions?classId=${fx.otherClassId}`)
    check('סינון לפי כיתה אחרת: ריק', fCls.status === 200 && mine(fCls).length === 0)
    const fSub = await get(T.homeroom.token, '/submissions?subject=history')
    check('סינון לפי מקצוע history: רק hist', mine(fSub).length === 1 && mine(fSub)[0].id === fx.submissions.hist)
    const fQ = await get(T.homeroom.token, `/submissions?q=${FX_PREFIX}old`)
    check('חיפוש טקסט בכותרת: רק old', mine(fQ).length === 1 && mine(fQ)[0].id === fx.submissions.old)

    /* ───────── מסך הדמיה ───────── */
    console.log('\n— GET /results/submission/:id —')
    const cHome = await get(T.homeroom.token, `/submission/${fx.submissions.sci}`)
    const c = cHome.json.data
    check('מחנך: 200 (והתגובה עומדת בחוזה — האימות בשרת)', cHome.status === 200 && !!c, `status=${cHome.status} ${cHome.status !== 200 ? JSON.stringify(cHome.json) : ''}`)
    if (c) {
      check('סיכום: "4 מתוך 6 סיימו עד עכשיו" ו"3 מתוך 4 טעו" באתגר הקשה', c.summary.includes('4 מתוך 6 סיימו עד עכשיו') && c.summary.includes('3 מתוך 4 טעו'), c.summary)
      check('"ורובם בחרו" במסיח השגוי הנפוץ', c.summary.includes('ורובם בחרו נוזל'), c.summary)
      check('פירוט קיים: hasAnswerDetail=true, בלי תאריך', c.hasAnswerDetail === true && c.detailAvailableFrom === null)
      check('רוסטר: 4 סיימו / 1 באמצע / 1 לא התחיל, ממוין א-ב', c.roster.completed.length === 4 && c.roster.inProgress.length === 1 && c.roster.notStarted.length === 1 && c.roster.completed.map((s: any) => s.name).join() === c.roster.completed.map((s: any) => s.name).sort((a: string, b: string) => a.localeCompare(b, 'he')).join())
      const beniChip = c.roster.completed.find((s: any) => s.id === fx.students.beni.id)
      check('בני: תשומת לב (ויתר על כמה + הצלחה נמוכה); ויקטור: לא התחיל', beniChip?.attention === true && beniChip.attentionReasons.includes('gave_up_often') && c.roster.notStarted[0].attentionReasons.join() === 'not_started')
      check('4 אתגרים לפי הסדר (רב-ברירה, נכון/לא, זיכרון, מבחן סיכום)', c.challenges.map((x: any) => x.type).join() === 'multipleChoice,trueFalse,memory,finalQuiz' && c.challenges.map((x: any) => x.order).join() === '1,2,3,4')
      const [mc, tf, mem, fq] = c.challenges
      check('רב-ברירה: ניסו 4 · הצליחו 1', mc.attempted === 4 && mc.solved === 1)
      check('נכון/לא נכון: 3 מתוך 4 הצליחו; בני ויתר', tf.attempted === 4 && tf.solved === 3 && tf.gaveUp === 1 && tf.gaveUpStudents[0]?.id === fx.students.beni.id)
      check('זיכרון: הצליחו 3 · בני סגר בלי להשלים (ויתור)', mem.solved === 3 && mem.gaveUp === 1 && mem.items[0].options === null)
      check('מבחן סיכום: 3 פריטים; 3 הצליחו (ציון ≥ חצי)', fq.items.length === 3 && fq.attempted === 4 && fq.solved === 3 && fq.items[0].attempted === 4)
      const opts = mc.items[0].options
      const optB = opts?.find((o: any) => o.optionId === 'b')
      check('התפלגות: מסיח b = 2 תלמידים עם שמות ותגית "בלבול בין מוצק לנוזל"', optB?.count === 2 && optB.students.length === 2 && /בלבול בין מוצק לנוזל/.test(optB.errorTag?.title ?? ''))
      check('מסיח c ללא תגית; התשובה הנכונה מסומנת', opts?.find((o: any) => o.optionId === 'c')?.errorTag === null && opts?.find((o: any) => o.optionId === 'a')?.isCorrect === true && opts?.find((o: any) => o.optionId === 'a')?.count === 1)
      check('טעות נפוצה באתגר: 2 תלמידים', mc.commonError?.count === 2 && /נוזל/.test(mc.commonError?.optionText ?? ''))
      check('טעויות נפוצות בהדמיה: שורה אחת — 2 מתוך 4, עם הדמיה ממוקדת מקושרת', c.commonErrors.length === 1 && c.commonErrors[0].studentsCount === 2 && c.commonErrors[0].studentsExposed === 4 && c.commonErrors[0].linkedQuest?.questId === fx.quests.old, JSON.stringify(c.commonErrors))
      check('הצעה לחזרה: תחום חלש אחד (רב-ברירה 1 מתוך 4)', c.review.weakCount === 1, `weakCount=${c.review.weakCount}`)
      check('"איך חישבנו?" כולל שורות', Array.isArray(c.howWeCalculated) && c.howWeCalculated.length >= 3)
      check('ראש המסך: כיתה, מקצוע, ספירות', c.head.className === `${FX_PREFIX}main` && c.head.subject?.code === 'science' && c.head.counts.total === 6)
    }

    const cOld = await get(T.homeroom.token, `/submission/${fx.submissions.old}`)
    const o = cOld.json.data
    check('שליחה ישנה (בלי answers): 200, הפירוט לא זמין + התאריך שממנו הוא זמין', cOld.status === 200 && o?.hasAnswerDetail === false && typeof o?.detailAvailableFrom === 'string', JSON.stringify([cOld.status, o?.hasAnswerDetail, o?.detailAvailableFrom]))
    check('שליחה ישנה: אין התפלגות אפשרויות, אין טעויות נפוצות, אך ספירות מ-events', o?.challenges?.[0]?.items?.[0]?.options === null && o?.commonErrors?.length === 0 && o?.challenges?.[0]?.attempted === 3 && o?.challenges?.[0]?.solved === 2 && o?.head?.counts?.completed === 3)

    const caseView = async (label: string, who: FxPrincipal | null, sub: string, expected: number): Promise<void> => {
      const r = await get(who?.token ?? null, `/submission/${sub}`)
      check(label, r.status === expected, `status=${r.status}`)
    }
    await caseView('מורה מדעים על sci: 200', T.subjectSame, fx.submissions.sci, 200)
    await caseView('מורה מדעים על hist: 403', T.subjectSame, fx.submissions.hist, 403)
    await caseView('מורה היסטוריה על sci: 403 (מקצוע אחר)', T.subjectOther, fx.submissions.sci, 403)
    await caseView('מורה היסטוריה על hist: 200', T.subjectOther, fx.submissions.hist, 200)
    await caseView('שולח בלבד על hist: 200', T.senderOnly, fx.submissions.hist, 200)
    await caseView('שולח בלבד על sci: 403', T.senderOnly, fx.submissions.sci, 403)
    await caseView('מחנך על hist (מורה אחר שלח): 200', T.homeroom, fx.submissions.hist, 200)
    await caseView('מורה לא מקושר על sci: 403', T.unlinked, fx.submissions.sci, 403)
    await caseView('מורה לא מקושר על שליחת הכיתה שלו: 200', T.unlinked, fx.submissions.other, 200)
    await caseView('מנהל: 403', T.admin, fx.submissions.sci, 403)
    await caseView('מנהל עירוני: 403', T.municipal, fx.submissions.sci, 403)
    await caseView('בלי טוקן: 401', null, fx.submissions.sci, 401)
    await caseView('שליחה שאינה קיימת: 404', T.homeroom, NIL, 404)
    await caseView('מזהה לא תקין: 404', T.homeroom, 'not-a-uuid', 404)

    /* ───────── נתונים סינתטיים: רק בארגון הדגמה ───────── */
    console.log('\n— נתונים סינתטיים —')
    const setDemo = async (on: boolean): Promise<void> => { await supabaseAdmin.from('schools').update({ demo_data_enabled: on }).eq('id', fx.schoolId) }
    await setDemo(true)
    try {
      const d = (await get(T.homeroom.token, `/submission/${fx.submissions.sci}`)).json.data
      check('ארגון הדגמה: הסשן הסינתטי של ויקטור נספר (5 סיימו, 0 לא התחילו)', d?.head?.counts?.completed === 5 && d?.head?.counts?.notStarted === 0, JSON.stringify(d?.head?.counts))
    } finally { await setDemo(false) }
    const back = (await get(T.homeroom.token, `/submission/${fx.submissions.sci}`)).json.data
    check('אחרי כיבוי ההדגמה: חוזר ל-4 סיימו ו-ויקטור לא התחיל', back?.head?.counts?.completed === 4 && back?.head?.counts?.notStarted === 1)

    /* ───────── מסך תלמיד ───────── */
    console.log('\n— GET /results/submission/:id/student/:studentId —')
    const S = fx.students
    const sBeni = await get(T.homeroom.token, `/submission/${fx.submissions.sci}/student/${S.beni.id}`)
    const b = sBeni.json.data
    check('מחנך על בני: 200', sBeni.status === 200 && !!b, `status=${sBeni.status} ${sBeni.status !== 200 ? JSON.stringify(sBeni.json) : ''}`)
    if (b) {
      const order2 = [S.avi, S.beni, S.galit, S.dana, S.hadas, S.viktor].map((x) => x.id)
      check('רשימת שמות א-ב, קודם=אבי, הבא=גלית', b.roster.map((x: any) => x.id).join() === order2.join() && b.prevId === S.avi.id && b.nextId === S.galit.id)
      check('סיכום: פתר 0 מתוך 4 · ויתר על 2', b.summary.includes('פתר/ה 0 מתוך 4') && b.summary.includes('ויתר/ה על 2'), b.summary)
      check('תשומת לב עם הסיבות', b.student.attention === true && b.student.attentionReasons.includes('gave_up_often') && b.student.attentionReasons.includes('low_success'))
      const [mc, tf, mem, fq] = b.challenges
      check('רב-ברירה: ענה "נוזל" · נכון "מוצק" · תגית', mc.outcome === 'wrong' && mc.items[0].answerText === 'נוזל' && mc.items[0].correctText === 'מוצק' && mc.items[0].isCorrect === false && /בלבול/.test(mc.items[0].errorTag?.title ?? ''))
      check('נכון/לא: ויתר · זיכרון: נסגר', tf.outcome === 'gave_up' && tf.items[0].isCorrect === false && mem.outcome === 'closed')
      check('מבחן סיכום: תרגום o<אינדקס> לטקסט ("ב" נבחר, "א" נכון)', fq.items.length === 3 && fq.items[0].answerText === 'ב' && fq.items[0].correctText === 'א' && fq.items[0].isCorrect === false && fq.items[2].isCorrect === true)
      check('זמני שהייה בשקפים: שקף 1 — 110 מילים, 4 שניות (closed_dwell_ms)', b.slides.length === 2 && b.slides[0].order === 1 && b.slides[0].words === 110 && b.slides[0].seconds === 4 && b.slides[1].seconds === 8, JSON.stringify(b.slides))
      check('hasAnswerDetail=true', b.hasAnswerDetail === true && b.detailAvailableFrom === null)
    }
    const sHadas = (await get(T.homeroom.token, `/submission/${fx.submissions.sci}/student/${S.hadas.id}`)).json.data
    check('תלמידה באמצע: סטטוס, סיכום, כל האתגרים "לא הגיעה" וללא פריטים', sHadas?.student.status === 'in_progress' && /באמצע/.test(sHadas.summary) && sHadas.challenges.every((x: any) => x.outcome === 'not_reached' && x.items.length === 0))
    const sViktor = (await get(T.homeroom.token, `/submission/${fx.submissions.sci}/student/${S.viktor.id}`)).json.data
    check('תלמיד שלא התחיל (הסינתטי מוסתר): סטטוס ותשומת לב', sViktor?.student.status === 'not_started' && sViktor.student.attentionReasons.join() === 'not_started' && /עוד לא התחיל/.test(sViktor.summary))
    const sOld = (await get(T.homeroom.token, `/submission/${fx.submissions.old}/student/${S.avi.id}`)).json.data
    check('שליחה ישנה: התלמיד מוצג בלי תשובות (null), הפירוט לא זמין', sOld?.hasAnswerDetail === false && typeof sOld.detailAvailableFrom === 'string' && sOld.challenges[0].outcome === 'correct' && sOld.challenges[0].items[0].answerText === null && sOld.challenges[0].items[0].correctText === null)
    const sAvi = await get(T.subjectSame.token, `/submission/${fx.submissions.sci}/student/${S.avi.id}`)
    check('מורה מדעים על תלמיד שלו: 200, פתר 4 מתוך 4', sAvi.status === 200 && sAvi.json.data?.summary.includes('פתר/ה 4 מתוך 4'))

    const sv = async (label: string, who: FxPrincipal | null, sub: string, stu: string, expected: number): Promise<void> => {
      const r = await get(who?.token ?? null, `/submission/${sub}/student/${stu}`)
      check(label, r.status === expected, `status=${r.status}`)
    }
    await sv('מורה היסטוריה על תלמיד בהדמיית מדעים: 403', T.subjectOther, fx.submissions.sci, S.avi.id, 403)
    await sv('שולח בלבד על תלמיד בהדמיית מדעים: 403', T.senderOnly, fx.submissions.sci, S.avi.id, 403)
    await sv('מורה לא מקושר: 403', T.unlinked, fx.submissions.sci, S.avi.id, 403)
    await sv('מנהל: 403', T.admin, fx.submissions.sci, S.avi.id, 403)
    await sv('מנהל עירוני: 403', T.municipal, fx.submissions.sci, S.avi.id, 403)
    await sv('בלי טוקן: 401', null, fx.submissions.sci, S.avi.id, 401)
    await sv('תלמיד מכיתה אחרת בשליחה: 404 (גם למחנך)', T.homeroom, fx.submissions.sci, S.otherClass.id, 404)
    await sv('מזהה תלמיד שאינו קיים: 404', T.homeroom, fx.submissions.sci, NIL, 404)
    await sv('מורה לא מקושר על התלמיד בכיתה שלו: 200', T.unlinked, fx.submissions.other, S.otherClass.id, 200)
    await sv('שולח בלבד על תלמיד בהדמיית hist שלו: 200', T.senderOnly, fx.submissions.hist, S.avi.id, 200)

    /* ───────── יומן גישה ───────── */
    console.log('\n— data_access_log —')
    const { data: logs } = await supabaseAdmin.from('data_access_log').select('viewer_id, student_id, scope').in('viewer_id', [T.homeroom.userId, T.subjectSame.userId, T.admin.userId, T.subjectOther.userId])
    const rows = (logs ?? []) as { viewer_id: string; student_id: string | null; scope: string }[]
    check('צפייה בתלמיד נרשמה (מחנך→בני, scope=results)', rows.some((l) => l.viewer_id === T.homeroom.userId && l.student_id === S.beni.id && l.scope === 'results'))
    check('צפייה של מורה מדעים באבי נרשמה', rows.some((l) => l.viewer_id === T.subjectSame.userId && l.student_id === S.avi.id && l.scope === 'results'))
    check('מסך הדמיה נרשם כ-results_class (בלי תלמיד)', rows.some((l) => l.viewer_id === T.homeroom.userId && l.student_id === null && l.scope === 'results_class'))
    check('מנהל לא נרשם ביומן (נחסם לפני גישה); מורה שנדחה (היסטוריה על sci) לא נרשם על תלמיד', !rows.some((l) => l.viewer_id === T.admin.userId) && !rows.some((l) => l.viewer_id === T.subjectOther.userId && l.student_id === S.avi.id))
  } finally {
    await cleanupResultsFixture(fx)
    const left = await leftoverResultsFixture(fx)
    const dirty = Object.entries(left).filter(([, n]) => n > 0)
    check('ניקוי: לא נשארה אף שורה zz-ux-res-*', dirty.length === 0, dirty.length ? JSON.stringify(Object.fromEntries(dirty)) : Object.entries(left).map(([k, n]) => `${k}=${n}`).join(' '))
  }
  console.log(failed === 0 ? `\nכל ${total} הבדיקות עברו` : `\n${failed} מתוך ${total} בדיקות נכשלו`)
  if (failed) process.exitCode = 1
}

main().catch(async (e) => {
  console.error('FATAL', e instanceof Error ? e.message : e)
  try { await cleanupResultsFixture(); console.error('(נוקה לפי הקידומת zz-ux-res-)') } catch { /* ignore */ }
  process.exitCode = 1
})
