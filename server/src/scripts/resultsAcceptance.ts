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
/* משפטי הסיכום מצמידים "X מתוך Y" ברווחים לא-שוברים (U+00A0) — בבדיקות משווים לטקסט עם רווחים רגילים */
const plain = (s: unknown): string => String(s ?? '').replace(/\u00A0/g, ' ')

/* בקשה כללית ל-API (לא רק /results): הקצאות ובסיס חזרה */
async function call(method: 'GET' | 'POST', token: string | null, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  let lastErr: unknown
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const r = await fetch(API + path, {
        method,
        headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
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
const countAsg = async (questId: string, classIds?: string[]): Promise<number> => {
  let q = supabaseAdmin.from('assignments').select('*', { count: 'exact', head: true }).eq('quest_id', questId)
  if (classIds) q = q.in('class_id', classIds)
  const { count } = await q
  return count ?? 0
}

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

    /* שלב R: ברירת המחדל של הרשימה היא "השיעורים שלי" ב-30 הימים האחרונים. מחנך/ת רואה את כל הכיתה עם view=class, והישנים עם older=1 */
    const lHome = await get(T.homeroom.token, '/submissions?view=class&older=1')
    const home = mine(lHome)
    check('מחנך: 200 ועם מעטפת data', lHome.status === 200 && Array.isArray(lHome.json.data?.submissions), `status=${lHome.status} ${lHome.status !== 200 ? JSON.stringify(lHome.json) : ''}`)
    check('מחנך: רואה את 3 השליחות של הכיתה (לא את שליחת הכיתה השנייה)', !!has(home, fx.submissions.sci) && !!has(home, fx.submissions.old) && !!has(home, fx.submissions.hist) && !has(home, fx.submissions.other))
    const order = home.map((s) => s.id)
    check('ממוין חדש→ישן (hist, sci, old)', order.join() === [fx.submissions.hist, fx.submissions.sci, fx.submissions.old].join(), order.join())
    const rSci = has(home, fx.submissions.sci)
    check('ספירות: 6 תלמידים · 4 סיימו · 1 באמצע · 1 לא התחיל (הסשן הסינתטי מוסתר)', JSON.stringify(rSci?.counts) === JSON.stringify({ total: 6, completed: 4, inProgress: 1, notStarted: 1 }), JSON.stringify(rSci?.counts))
    check('תשומת לב: 2 (ויתר על כמה אתגרים / לא התחיל אחרי מועד ההגשה)', rSci?.attentionCount === 2, `attentionCount=${rSci?.attentionCount}`)
    check('מקור "מחנך" + שם השולח (מורה אחר שלח לכיתה שלי)', rSci?.source === 'homeroom' && rSci?.senderName === T.subjectSame.name, `${rSci?.source}/${rSci?.senderName}`)
    check('משפט סיכום וכרטיס: מקצוע מדעים, כותרת, שם כיתה', typeof rSci?.summary === 'string' && rSci.summary.length > 5 && rSci?.subject?.code === 'science' && rSci?.className === `${FX_PREFIX}main` && /sci$/.test(rSci?.title ?? ''))
    check('אפשרויות סינון: הכיתה והמקצועות (מדעים + היסטוריה)', (lHome.json.data.filters.classes ?? []).some((c: any) => c.id === fx.classId) && ['science', 'history'].every((c) => (lHome.json.data.filters.subjects ?? []).some((s: any) => s.code === c)))

    const lSci = await get(T.subjectSame.token, '/submissions?older=1')
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

    const fCls = await get(T.homeroom.token, `/submissions?view=class&older=1&classId=${fx.otherClassId}`)
    check('סינון לפי כיתה אחרת: ריק', fCls.status === 200 && mine(fCls).length === 0)
    const fSub = await get(T.homeroom.token, '/submissions?view=class&older=1&subject=history')
    check('סינון לפי מקצוע history: רק hist', mine(fSub).length === 1 && mine(fSub)[0].id === fx.submissions.hist)
    const fQ = await get(T.homeroom.token, `/submissions?view=class&older=1&q=${FX_PREFIX}old`)
    check('חיפוש טקסט בכותרת: רק old', mine(fQ).length === 1 && mine(fQ)[0].id === fx.submissions.old)

    /* ───────── שלב R: מחנך/ת מול מורה מקצוע, פס שבועי, תצוגה חיה, טבלת מנהל ───────── */
    console.log('\n— סיכום שיעור: רשימה (מחנך/ת), תצוגה חיה, טבלת מנהל —')
    {
      const mineHome = await get(T.homeroom.token, '/submissions')
      check('מחנך/ת: ברירת המחדל "השיעורים שלי" — בלי שיעורים ששלחו אחרים; הבורר זמין', mineHome.json.data?.view === 'mine' && mineHome.json.data?.canToggleView === true && mine(mineHome).length === 0, JSON.stringify([mineHome.json.data?.view, mineHome.json.data?.canToggleView, mine(mineHome).length]))
      check('"כל השיעורים בכיתה שלי": פס שבועי (מספר שיעורים/מקצועות, משפט) ו-olderCount', lHome.json.data?.view === 'class' && !!lHome.json.data?.weekStrip && typeof lHome.json.data.weekStrip.sentence === 'string' && /^השבוע: /.test(lHome.json.data.weekStrip.sentence) && lHome.json.data.weekStrip.lessons >= 1, JSON.stringify(lHome.json.data?.weekStrip))
      const lSciDefault = await get(T.subjectSame.token, '/submissions?view=class')
      check('מורה מקצוע (לא מחנך): אין בורר, view=class מתעלם', lSciDefault.json.data?.canToggleView === false && lSciDefault.json.data?.view === 'mine' && lSciDefault.json.data?.weekStrip === undefined)
      const recentOnly = await get(T.subjectSame.token, '/submissions')
      check('חלון 30 הימים: השיעור הישן (400 יום) מחכה מאחורי "הצגת שיעורים ישנים יותר" (olderCount)', has(mine(recentOnly), fx.submissions.old) === undefined && recentOnly.json.data?.olderCount >= 1 && has(sciRows, fx.submissions.old) !== undefined)

      /* תצוגה חיה */
      const liveOk = await get(T.homeroom.token, `/submission/${fx.submissions.sci}/live`)
      const lv = liveOk.json.data
      check('תצוגה חיה (מחנך/ת): 200, אריח לכל תלמיד/ה, רענון 15 שניות', liveOk.status === 200 && lv?.tiles?.length === 6 && lv.refreshMs === 15000, `status=${liveOk.status}`)
      if (lv) {
        const st = (id: string): string => lv.tiles.find((t: any) => t.studentId === id)?.status
        check('סיימו (4) · באמצע בלי פעימות → לא פעיל/ה · לא התחיל (הסינתטי מוסתר)', st(fx.students.avi.id) === 'finished' && st(fx.students.dana.id) === 'finished' && st(fx.students.hadas.id) === 'inactive' && st(fx.students.viktor.id) === 'not_started', JSON.stringify(lv.counts))
        check('סיכום מילולי, וההרשאה זהה לעמוד השיעור', typeof lv.summary === 'string' && lv.summary.length > 5 && lv.head?.id === fx.submissions.sci)
      }
      check('תצוגה חיה — מורה מקצוע של המקצוע: 200; מקצוע אחר / לא מקושר: 404; מנהל: 403; בלי טוקן: 401',
        (await get(T.subjectSame.token, `/submission/${fx.submissions.sci}/live`)).status === 200
        && (await get(T.subjectOther.token, `/submission/${fx.submissions.sci}/live`)).status === 404
        && (await get(T.unlinked.token, `/submission/${fx.submissions.sci}/live`)).status === 404
        && (await get(T.admin.token, `/submission/${fx.submissions.sci}/live`)).status === 403
        && (await get(null, `/submission/${fx.submissions.sci}/live`)).status === 401)

      /* טבלת מנהל/ת */
      const ov = await get(T.admin.token, '/overview')
      const od = ov.json.data
      check('מנהל: טבלה כללית 200 — שכבה × מקצוע, החודש; בלי שמות תלמידים/כיתות/מורים בתגובה', ov.status === 200 && !!od && Array.isArray(od.cells) && !JSON.stringify(od).includes(FX_PREFIX) && !Object.values(fx.students).some((x) => JSON.stringify(od).includes(x.name)), `status=${ov.status}`)
      check('כל תא קטן (כיתה אחת / פחות מ-5 תלמידים) מוסתר — בלי מספרים', od.cells.every((cl: any) => cl.status !== 'shown'), JSON.stringify(od.cells))
      check('מנהל עירוני: 200; מורים (מחנך, מקצוע) ובלי טוקן: 403/403/401', (await get(T.municipal.token, '/overview')).status === 200 && (await get(T.homeroom.token, '/overview')).status === 403 && (await get(T.subjectSame.token, '/overview')).status === 403 && (await get(null, '/overview')).status === 401)
    }

    /* ───────── מסך הדמיה ───────── */
    console.log('\n— GET /results/submission/:id —')
    const cHome = await get(T.homeroom.token, `/submission/${fx.submissions.sci}`)
    const c = cHome.json.data
    check('מחנך: 200 (והתגובה עומדת בחוזה — האימות בשרת)', cHome.status === 200 && !!c, `status=${cHome.status} ${cHome.status !== 200 ? JSON.stringify(cHome.json) : ''}`)
    if (c) {
      check('סיכום: "עד עכשיו סיימו 4 מתוך 6" (לא "רוב הכיתה") ו"3 מתוך 4 לא הצליחו" באתגר הקשה', plain(c.summary).includes('עד עכשיו סיימו 4 מתוך 6') && !c.summary.includes('רוב הכיתה') && plain(c.summary).includes('3 מתוך 4 לא הצליחו'), c.summary)
      check('"ורובם בחרו ב״נוזל״" במסיח השגוי הנפוץ (במרכאות)', c.summary.includes('ורובם בחרו ב״נוזל״'), c.summary)
      check('פירוט קיים: hasAnswerDetail=true, בלי תאריך', c.hasAnswerDetail === true && c.detailAvailableFrom === null)
      check('רוסטר: 4 סיימו / 1 באמצע / 1 לא התחיל, ממוין א-ב', c.roster.completed.length === 4 && c.roster.inProgress.length === 1 && c.roster.notStarted.length === 1 && c.roster.completed.map((s: any) => s.name).join() === c.roster.completed.map((s: any) => s.name).sort((a: string, b: string) => a.localeCompare(b, 'he')).join())
      const beniChip = c.roster.completed.find((s: any) => s.id === fx.students.beni.id)
      check('בני: תשומת לב (ויתר על 2, והסיבה במילים); ויקטור: לא התחיל אחרי המועד', beniChip?.attention === true && beniChip.attentionReasons.join() === 'gave_up_often' && /ויתר\/ה על 2 אתגרים/.test(beniChip.reasonText ?? '') && c.roster.notStarted[0].attentionReasons.join() === 'not_started' && /אחרי מועד ההגשה/.test(c.roster.notStarted[0].reasonText ?? ''), JSON.stringify([beniChip?.attentionReasons, beniChip?.reasonText, c.roster.notStarted[0]?.reasonText]))
      check('4 אתגרים לפי הסדר (רב-ברירה, נכון/לא, זיכרון, מבחן סיכום)', c.challenges.map((x: any) => x.type).join() === 'multipleChoice,trueFalse,memory,finalQuiz' && c.challenges.map((x: any) => x.order).join() === '1,2,3,4')
      const [mc, tf, mem, fq] = c.challenges
      check('רב-ברירה: ניסו 4 · הצליחו 1', mc.attempted === 4 && mc.solved === 1)
      check('נכון/לא נכון: 3 מתוך 4 הצליחו; בני ויתר', tf.attempted === 4 && tf.solved === 3 && tf.gaveUp === 1 && tf.gaveUpStudents[0]?.id === fx.students.beni.id)
      check('זיכרון: הצליחו 3 · בני סגר בלי להשלים (ויתור)', mem.solved === 3 && mem.gaveUp === 1 && mem.items[0].options === null)
      check('מבחן סיכום: 3 פריטים; 3 הצליחו (ציון ≥ חצי)', fq.items.length === 3 && fq.attempted === 4 && fq.solved === 3 && fq.items[0].attempted === 4)
      const opts = mc.items[0].options
      const optB = opts?.find((o: any) => o.optionId === 'b')
      check('התפלגות: מסיח b = 3 תלמידים עם שמות ותגית "בלבול בין מוצק לנוזל"', optB?.count === 3 && optB.students.length === 3 && /בלבול בין מוצק לנוזל/.test(optB.errorTag?.title ?? ''))
      check('מסיח c ללא תגית; התשובה הנכונה מסומנת', opts?.find((o: any) => o.optionId === 'c')?.errorTag === null && opts?.find((o: any) => o.optionId === 'a')?.isCorrect === true && opts?.find((o: any) => o.optionId === 'a')?.count === 1)
      check('טעות נפוצה באתגר: 3 תלמידים, במשפט פשוט', mc.commonError?.count === 3 && /נוזל/.test(mc.commonError?.optionText ?? '') && plain(mc.commonError?.sentence) === '3 תלמידים בחרו ״נוזל״', JSON.stringify(mc.commonError))
      check('טעויות נפוצות בשיעור: שורה אחת — 3 מתוך 4, עם התפיסה המתויגת, שיעור ממוקד מקושר, ופרטים לפעולות (שאלה לדיון / שיעור ממוקד)', c.commonErrors.length === 1 && c.commonErrors[0].studentsCount === 3 && c.commonErrors[0].studentsExposed === 4 && c.commonErrors[0].linkedQuest?.questId === fx.quests.old && c.commonErrors[0].misconceptionId === fx.misconceptionId && c.commonErrors[0].wrongText === 'נוזל' && c.commonErrors[0].studentIds?.length === 3 && !!c.commonErrors[0].question, JSON.stringify(c.commonErrors))
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
    await caseView('מורה מדעים על hist: 404 (לא גלויה = כמו לא קיימת)', T.subjectSame, fx.submissions.hist, 404)
    await caseView('מורה היסטוריה על sci: 404 (מקצוע אחר)', T.subjectOther, fx.submissions.sci, 404)
    await caseView('מורה היסטוריה על hist: 200', T.subjectOther, fx.submissions.hist, 200)
    await caseView('שולח בלבד על hist: 200', T.senderOnly, fx.submissions.hist, 200)
    await caseView('שולח בלבד על sci: 404', T.senderOnly, fx.submissions.sci, 404)
    await caseView('מחנך על hist (מורה אחר שלח): 200', T.homeroom, fx.submissions.hist, 200)
    await caseView('מורה לא מקושר על sci: 404', T.unlinked, fx.submissions.sci, 404)
    await caseView('מורה לא מקושר על שליחת הכיתה שלו: 200', T.unlinked, fx.submissions.other, 200)
    await caseView('מנהל: 403', T.admin, fx.submissions.sci, 403)
    await caseView('מנהל עירוני: 403', T.municipal, fx.submissions.sci, 403)
    await caseView('בלי טוקן: 401', null, fx.submissions.sci, 401)
    await caseView('שליחה שאינה קיימת: 404', T.homeroom, NIL, 404)
    await caseView('מזהה לא תקין: 404', T.homeroom, 'not-a-uuid', 404)
    /* אין אורקל קיום: שליחה שקיימת אך אינה גלויה נראית בדיוק כמו שליחה שאינה קיימת (סטטוס וגוף התשובה) */
    const rMissing = await get(T.unlinked.token, `/submission/${NIL}`)
    for (const [label, tok, sub] of [['מורה לא מקושר', T.unlinked.token, fx.submissions.sci], ['מורה היסטוריה', T.subjectOther.token, fx.submissions.sci], ['שולח בלבד', T.senderOnly.token, fx.submissions.sci]] as const) {
      const r = await get(tok, `/submission/${sub}`)
      check(`${label}: שליחה לא גלויה ושליחה שאינה קיימת — אותה תשובה בדיוק (סטטוס וגוף)`, r.status === 404 && rMissing.status === 404 && JSON.stringify(r.json) === JSON.stringify(rMissing.json), JSON.stringify(r.json))
    }

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
      check('סיכום: פתר 0 מתוך 4 · ויתר על 2 · ותשומת לב במילים', plain(b.summary).includes('פתר/ה 0 מתוך 4') && b.summary.includes('ויתר/ה על 2') && b.summary.includes('לתשומת לב: ויתר/ה על 2 אתגרים'), b.summary)
      check('תשומת לב עם הסיבה (הצלחה נמוכה אינה נבדקת בשיעור עם פחות מ-5 אתגרים)', b.student.attention === true && b.student.attentionReasons.join() === 'gave_up_often')
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
    check('מורה מדעים על תלמיד שלו: 200, פתר 4 מתוך 4', sAvi.status === 200 && plain(sAvi.json.data?.summary).includes('פתר/ה 4 מתוך 4'))

    const sv = async (label: string, who: FxPrincipal | null, sub: string, stu: string, expected: number): Promise<void> => {
      const r = await get(who?.token ?? null, `/submission/${sub}/student/${stu}`)
      check(label, r.status === expected, `status=${r.status}`)
    }
    await sv('מורה היסטוריה על תלמיד בשיעור מדעים: 404', T.subjectOther, fx.submissions.sci, S.avi.id, 404)
    await sv('שולח בלבד על תלמיד בשיעור מדעים: 404', T.senderOnly, fx.submissions.sci, S.avi.id, 404)
    await sv('מורה לא מקושר: 404', T.unlinked, fx.submissions.sci, S.avi.id, 404)
    await sv('מנהל: 403', T.admin, fx.submissions.sci, S.avi.id, 403)
    await sv('מנהל עירוני: 403', T.municipal, fx.submissions.sci, S.avi.id, 403)
    await sv('בלי טוקן: 401', null, fx.submissions.sci, S.avi.id, 401)
    await sv('תלמיד מכיתה אחרת בשליחה: 404 (גם למחנך)', T.homeroom, fx.submissions.sci, S.otherClass.id, 404)
    await sv('מזהה תלמיד שאינו קיים: 404', T.homeroom, fx.submissions.sci, NIL, 404)
    await sv('מזהה תלמיד פגום: 404', T.homeroom, fx.submissions.sci, 'not-a-uuid', 404)
    {
      const foreign = await get(T.homeroom.token, `/submission/${fx.submissions.sci}/student/${S.otherClass.id}`)
      const missing = await get(T.homeroom.token, `/submission/${fx.submissions.sci}/student/${NIL}`)
      check('תלמיד מכיתה אחרת ותלמיד שאינו קיים: אותה תשובה בדיוק (בלי לחשוף מי קיים)', foreign.status === 404 && JSON.stringify(foreign.json) === JSON.stringify(missing.json))
    }
    await sv('מורה לא מקושר על התלמיד בכיתה שלו: 200', T.unlinked, fx.submissions.other, S.otherClass.id, 200)
    await sv('שולח בלבד על תלמיד בשיעור hist שלו: 200', T.senderOnly, fx.submissions.hist, S.avi.id, 200)

    /* ───────── הקצאה לכיתות: POST /api/quests/:id/assign ───────── */
    console.log('\n— POST /quests/:id/assign —')
    const mkQuest = async (title: string, by: string): Promise<string> => {
      const { data, error } = await supabaseAdmin.from('quests').insert({
        title: `${FX_PREFIX}${title}`, status: 'draft', created_by: by, subject_id: fx.subjectIds.science,
        game_data: { entrySceneId: 's0', scenes: [{ id: 's0', title: 'zz-ux-פתיחה', narrative: 'פתיחה' }] },
      }).select('id').single()
      if (error || !data) throw new Error('quest insert: ' + error?.message)
      return (data as { id: string }).id
    }
    const qMine = await mkQuest('assign-sci', T.subjectSame.userId)
    const qAttacker = await mkQuest('assign-attacker', T.unlinked.userId)
    const asg = (token: string | null, quest: string, classIds: unknown) => call('POST', token, `/quests/${quest}/assign`, { classIds })

    const atkCross = await asg(T.unlinked.token, qAttacker, [fx.classId])
    check('הקצאה לכיתה זרה (בעל השיעור אינו משויך לכיתה הראשית): 403, ושום שורה לא נוצרה', atkCross.status === 403 && (await countAsg(qAttacker)) === 0, `status=${atkCross.status}`)
    const mixed = await asg(T.unlinked.token, qAttacker, [fx.otherClassId, fx.classId])
    check('בקשה מעורבת (כיתה שלי + כיתה זרה): נדחית כולה — גם הכיתה שלי לא קיבלה', mixed.status === 403 && (await countAsg(qAttacker)) === 0, `status=${mixed.status}`)
    const unknownCls = await asg(T.unlinked.token, qAttacker, [fx.otherClassId, NIL])
    check('כיתה שאינה קיימת: אותו 403 כמו כיתה זרה (בלי לחשוף מי קיימת), ושום שורה', unknownCls.status === 403 && JSON.stringify(unknownCls.json) === JSON.stringify(atkCross.json) && (await countAsg(qAttacker)) === 0, JSON.stringify(unknownCls.json))
    check('מזהה כיתה פגום: 400', (await asg(T.unlinked.token, qAttacker, ['not-a-uuid'])).status === 400)
    check('classIds ריק / לא מערך: 400', (await asg(T.unlinked.token, qAttacker, [])).status === 400 && (await asg(T.unlinked.token, qAttacker, 'x')).status === 400)
    check('בלי טוקן: 401', (await asg(null, qAttacker, [fx.otherClassId])).status === 401)

    const own = await asg(T.unlinked.token, qAttacker, [fx.otherClassId])
    check('הקצאה לכיתה שלי: 201, שורה אחת, user_id = השולח', own.status === 201 && own.json.assignments?.length === 1 && (await countAsg(qAttacker, [fx.otherClassId])) === 1, `status=${own.status}`)
    {
      const { data } = await supabaseAdmin.from('assignments').select('user_id').eq('quest_id', qAttacker).eq('class_id', fx.otherClassId)
      check('assignments.user_id = המשתמש המחובר', ((data ?? []) as { user_id: string | null }[])[0]?.user_id === T.unlinked.userId)
    }
    const again = await asg(T.unlinked.token, qAttacker, [fx.otherClassId])
    check('הקצאה חוזרת לאותה כיתה: אין כפילות', again.status === 201 && again.json.assignments?.length === 0 && (await countAsg(qAttacker, [fx.otherClassId])) === 1)

    const byAdmin = await asg(T.admin.token, qMine, [fx.classId])
    check('מנהל בית הספר מקצה שיעור של מורה לכיתה בבית ספרו: 201', byAdmin.status === 201 && byAdmin.json.assignments?.length === 1, `status=${byAdmin.status}`)
    {
      const { data } = await supabaseAdmin.from('assignments').select('id, user_id').eq('quest_id', qMine).eq('class_id', fx.classId)
      const row = ((data ?? []) as { id: string; user_id: string | null }[])[0]
      check('השולח (user_id) הוא המנהל, לא יוצר השיעור — השולח והיוצר נפרדים', row?.user_id === T.admin.userId && row.user_id !== T.subjectSame.userId)
      const homeList = await get(T.homeroom.token, '/submissions?view=class')
      const sent = (homeList.json.data?.submissions ?? []).find((x: any) => x.id === row?.id)
      check('המחנך רואה את השליחה כ"מחנך" עם שם השולח (המנהל) — לא שם היוצר', sent?.source === 'homeroom' && sent?.senderName === T.admin.name, `${sent?.source}/${sent?.senderName}`)
    }
    /* חריג הבעלות הקיים של מנהל (ensureQuestAccess): מנהל רשאי להקצות גם שיעור של מורה אחר — אך רק לכיתות בבית ספרו (בדיקת הכיתה למעלה) */
    const adminOther = await asg(T.admin.token, qAttacker, [fx.classId])
    check('מנהל בית הספר מקצה שיעור של מורה אחר לכיתה בבית ספרו: 201 (חריג הבעלות של מנהל, נשמר)', adminOther.status === 201, `status=${adminOther.status}`)

    /* ───────── תרגול חזרה: POST /api/quests/:id/review-quest — בדיקות סירוב וחסימה בלבד (הנתיב המוצלח מפעיל מודל שפה) ───────── */
    console.log('\n— POST /quests/:id/review-quest —')
    const review = (token: string | null, quest: string, assignmentId: unknown) => call('POST', token, `/quests/${quest}/review-quest`, { assignmentId })
    const rvMissing = await review(T.subjectSame.token, fx.quests.sci, NIL)
    check('מטלה שאינה קיימת: 404', rvMissing.status === 404, `status=${rvMissing.status}`)
    const rvForeign = await review(T.unlinked.token, fx.quests.sci, fx.submissions.sci)
    check('מורה שאינו משויך לכיתה: 404 אחיד (כמו מטלה שאינה קיימת), בלי לחשוף תוצאות', rvForeign.status === 404 && JSON.stringify(rvForeign.json) === JSON.stringify(rvMissing.json), JSON.stringify(rvForeign.json))
    const rvSubjOther = await review(T.subjectOther.token, fx.quests.sci, fx.submissions.sci)
    check('מורה מקצוע אחר: 404 אחיד', rvSubjOther.status === 404 && JSON.stringify(rvSubjOther.json) === JSON.stringify(rvMissing.json))
    check('מנהל: 403', (await review(T.admin.token, fx.quests.sci, fx.submissions.sci)).status === 403)
    check('מנהל עירוני: 403', (await review(T.municipal.token, fx.quests.sci, fx.submissions.sci)).status === 403)
    check('בלי טוקן: 401', (await review(null, fx.quests.sci, fx.submissions.sci)).status === 401)
    check('assignmentId פגום: 400', (await review(T.subjectSame.token, fx.quests.sci, 'x')).status === 400)
    check('מטלה של שיעור אחר: 400', (await review(T.homeroom.token, fx.quests.hist, fx.submissions.sci)).status === 400)
    const rvNotOwner = await review(T.homeroom.token, fx.quests.sci, fx.submissions.sci)
    check('מחנך שרואה את התוצאות אך אינו יוצר השיעור: 403 (בעלות), ולא נוצר שיעור', rvNotOwner.status === 403, `status=${rvNotOwner.status}`)
    const rvFew = await review(T.subjectOther.token, fx.quests.hist, fx.submissions.hist)
    check('שליחה שעוד אף תלמיד לא סיים: 400 "אין מספיק נתונים", בלי יצירה', rvFew.status === 400 && /מספיק נתונים/.test(rvFew.json.error ?? ''), JSON.stringify(rvFew.json))
    const rvNone = await review(T.subjectSame.token, fx.quests.old, fx.submissions.old)
    check('אין תחומים חלשים (3 סיימו, 2 הצליחו): 400 "אין מושגים חלשים", בלי יצירה', rvNone.status === 400 && /מושגים חלשים/.test(rvNone.json.error ?? ''), JSON.stringify(rvNone.json))
    {
      const { count } = await supabaseAdmin.from('quests').select('*', { count: 'exact', head: true }).like('title', `${FX_PREFIX}חזרה%`)
      const { count: count2 } = await supabaseAdmin.from('quests').select('*', { count: 'exact', head: true }).like('title', 'חזרה:%').eq('created_by', T.subjectSame.userId)
      check('לא נוצר אף שיעור חזרה בבדיקות הסירוב', (count ?? 0) === 0 && (count2 ?? 0) === 0)
    }

    /* ───────── יומן גישה ───────── */
    console.log('\n— data_access_log —')
    const { data: logs } = await supabaseAdmin.from('data_access_log').select('viewer_id, student_id, scope').in('viewer_id', [T.homeroom.userId, T.subjectSame.userId, T.admin.userId, T.subjectOther.userId])
    const rows = (logs ?? []) as { viewer_id: string; student_id: string | null; scope: string }[]
    check('צפייה בתלמיד נרשמה (מחנך→בני, scope=results)', rows.some((l) => l.viewer_id === T.homeroom.userId && l.student_id === S.beni.id && l.scope === 'results'))
    check('צפייה של מורה מדעים באבי נרשמה', rows.some((l) => l.viewer_id === T.subjectSame.userId && l.student_id === S.avi.id && l.scope === 'results'))
    {
      const classRows = rows.filter((l) => l.viewer_id === T.homeroom.userId && l.scope === 'results_class')
      const rosterIds = [S.avi, S.beni, S.galit, S.dana, S.hadas, S.viktor].map((x) => x.id).sort()
      check('מסך שיעור נרשם כ-results_class: שורה לכל תלמיד ברשימה (6), בלי שורה בלי תלמיד', rosterIds.every((id) => classRows.some((l) => l.student_id === id)) && classRows.every((l) => l.student_id !== null) && !classRows.some((l) => l.student_id === S.otherClass.id))
      check('הרשימה נרשמה כשורה אחת-לבקשה בלי תלמיד (results_list)', rows.some((l) => l.viewer_id === T.homeroom.userId && l.student_id === null && l.scope === 'results_list'))
      check('בסיס חזרה נרשם (results_review, בלי תלמיד) — רק כשהגישה אושרה', rows.some((l) => l.viewer_id === T.homeroom.userId && l.student_id === null && l.scope === 'results_review') && rows.some((l) => l.viewer_id === T.subjectSame.userId && l.scope === 'results_review') && !rows.some((l) => l.viewer_id === T.admin.userId))
    }
    check('מנהל לא נרשם ביומן (נחסם לפני גישה); מורה שנדחה (היסטוריה על sci) לא נרשם על תלמיד', !rows.some((l) => l.viewer_id === T.admin.userId) && !rows.some((l) => l.viewer_id === T.subjectOther.userId && l.student_id === S.avi.id && l.scope === 'results'))
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
