/* ──────────────────────────────────────────────────────────────────────────
   textFitGen — ניסוי: יצירה אמיתית (צינור מלא: בטיחות/ולידציה/קיצור-אורך/fact-check) של הדמיות חדשות
   בארבע שכבות, ושמירת ה-game_data שנוצר לקבצים — לבדיקת "כלל אורך הטקסט לתלמיד" על תוכן חדש.
   · יוצר חשבון מורה זמני (zz-textfit-*) + בית ספר, מתחבר, מייצר, ו**מנקה הכול** בסוף (כולל ההדמיות).
   · עלות אמיתית (Sonnet/Gemini + קריאות קיצור). בלי תמונות.
   הרצה:  npx tsx src/scripts/textFitGen.ts <outDir> [perBand=3] [questLength=10] [bands=g1_2,g3_4,g5_6,g7_9]
   ────────────────────────────────────────────────────────────────────────── */
import '../env.js'
import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { supabaseAdmin, supabaseAnon } from '../lib/supabase.js'

const SERVER = process.env.SERVER_URL ?? 'http://localhost:3001'
const PREFIX = 'zz-textfit-'
const OUT = process.argv[2] ?? path.resolve('textfit-out')
const PER_BAND = Number(process.argv[3] ?? 3)
const QLEN = Number(process.argv[4] ?? 10)
const BANDS = (process.argv[5] ?? 'g1_2,g3_4,g5_6,g7_9').split(',')
/* היסט בבחירת הנושאים וקבצי הפלט — להרצה נוספת בלי לחזור על אותם נושאים */
const OFFSET = Number(process.argv[6] ?? 0)
mkdirSync(OUT, { recursive: true })

/* רמת טקסט מייצגת לכל שכבה (נקודת אמצע של הטווח) + נושאים מתאימי גיל */
const SPEC: Record<string, { level: number; topics: { title: string; subject: string; curriculum: string }[] }> = {
  g1_2: { level: 4, topics: [
    { title: 'מעגל המים', subject: 'science', curriculum: 'איך המים מסתובבים בטבע: התאדות, עננים, גשם ונחלים.' },
    { title: 'חמשת החושים', subject: 'science', curriculum: 'ראייה, שמיעה, ריח, טעם ומגע — איך כל חוש עוזר לנו להכיר את העולם.' },
    { title: 'בעלי חיים ובתי הגידול שלהם', subject: 'science', curriculum: 'איפה חיים בעלי חיים שונים: יער, מדבר, ים ובית — ומה כל אחד צריך כדי לחיות.' },
    { title: 'עונות השנה', subject: 'science', curriculum: 'ארבע עונות השנה: מה משתנה בכל עונה בטבע, בלבוש ובחגים.' },
    { title: 'צורות ומספרים עד 20', subject: 'math', curriculum: 'זיהוי צורות (עיגול, ריבוע, משולש) וספירה, חיבור וחיסור פשוטים עד 20.' },
  ] },
  g3_4: { level: 8, topics: [
    { title: 'חלקי הצמח', subject: 'science', curriculum: 'שורש, גבעול, עלה ופרח — התפקיד של כל חלק בחיי הצמח והפוטוסינתזה בקצרה.' },
    { title: 'שברים פשוטים', subject: 'math', curriculum: 'חצי, שליש, רבע: מהו שבר, איך משווים שברים פשוטים ואיך מחברים שברים עם אותו מכנה.' },
    { title: 'נהרות והרים בישראל', subject: 'geography', curriculum: 'הירדן, הכנרת, הר החרמון, הנגב והחוף — מאפיינים בסיסיים של אזורי הארץ.' },
    { title: 'מחזור החיים של הפרפר', subject: 'science', curriculum: 'ביצה, זחל, גולם ופרפר — שלבי ההתפתחות ולמה כל שלב חשוב.' },
    { title: 'כפל וחילוק', subject: 'math', curriculum: 'כפל כחיבור חוזר, לוח הכפל וחילוק כחלוקה שווה — בעיות מילוליות פשוטות.' },
  ] },
  g5_6: { level: 10, topics: [
    { title: 'מצרים העתיקה', subject: 'history', curriculum: 'הנילוס, הפרעונים, הפירמידות והחיים בכפר המצרי — למה הנהר היה מקור החיים.' },
    { title: 'מערכת השמש', subject: 'science', curriculum: 'השמש, כוכבי הלכת, הירח ומסלולים — למה יש יום ולילה ועונות שנה.' },
    { title: 'אחוזים בחיי היום-יום', subject: 'math', curriculum: 'מהו אחוז, איך מחשבים הנחה ומס, ואיך ממירים בין שבר, עשרוני ואחוז.' },
    { title: 'חלקי הדיבר והמשפט', subject: 'hebrew', curriculum: 'שם עצם, פועל ותואר; נושא ונשוא במשפט — איך מזהים אותם ומה תפקידם.' },
    { title: 'יבשות ואוקיינוסים', subject: 'geography', curriculum: 'שבע היבשות, חמשת האוקיינוסים, קווי אורך ורוחב ואיך קוראים מפה.' },
  ] },
  g7_9: { level: 13, topics: [
    { title: 'המהפכה הצרפתית', subject: 'history', curriculum: 'הסיבות למהפכה, כיפת הבסטיליה, הזכויות של האדם והאזרח, הטרור והשלכות המהפכה על אירופה.' },
    { title: 'התא וחלקיו', subject: 'science', curriculum: 'גרעין, ציטופלזמה, ממברנה, מיטוכונדריה וכלורופלסט — מבנה ותפקוד, ההבדל בין תא צמחי לתא של בעל חיים.' },
    { title: 'משוואות ממעלה ראשונה', subject: 'math', curriculum: 'פתרון משוואה עם נעלם אחד, איזון משוואה, ובעיות מילוליות שמובילות למשוואה.' },
    { title: 'מלחמת העולם הראשונה', subject: 'history', curriculum: 'הסיבות לפרוץ המלחמה, בריתות, מלחמת החפירות והשלכות ההסכמים אחריה.' },
    { title: 'חוקי ניוטון', subject: 'science', curriculum: 'שלושת חוקי ניוטון: אינרציה, כוח ותאוצה, פעולה ותגובה — עם דוגמאות יום-יומיות.' },
  ] },
}

const secs = (t: number) => Math.round((Date.now() - t) / 1000)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main(): Promise<void> {
  const authIds: string[] = []
  const questIds: string[] = []
  let schoolId = ''
  let userId = ''
  const tag = randomBytes(3).toString('hex')
  try {
    const { data: school, error: se } = await supabaseAdmin.from('schools').insert({ name: `${PREFIX}school-${tag}`, slug: `${PREFIX}school-${tag}` }).select('id').single()
    if (se || !school) throw new Error('school: ' + se?.message)
    schoolId = school.id
    const email = `${PREFIX}${tag}@example.com`
    const password = randomBytes(18).toString('base64url')
    const { data: au, error: ae } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true })
    if (ae || !au.user) throw new Error('createUser: ' + ae?.message)
    authIds.push(au.user.id)
    const { data: u, error: ue } = await supabaseAdmin.from('users').insert({ name: `${PREFIX}teacher-${tag}`, role: 'teacher', school_id: schoolId, auth_id: au.user.id }).select('id').single()
    if (ue || !u) throw new Error('user: ' + ue?.message)
    userId = u.id
    const { data: sess, error: le } = await supabaseAnon.auth.signInWithPassword({ email, password })
    if (le || !sess.session) throw new Error('signIn: ' + le?.message)
    const token = sess.session.access_token
    console.log('תשתית זמנית נוצרה; מייצר…')

    for (const band of BANDS) {
      const spec = SPEC[band]
      if (!spec) continue
      for (let i = 0; i < PER_BAND; i++) {
        const n = i + 1 + OFFSET
        const topic = spec.topics[(i + OFFSET) % spec.topics.length]
        const t0 = Date.now()
        const title = `${PREFIX}${tag}-${band}-${n}-${topic.title}`
        const gen = await fetch(`${SERVER}/api/quests/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            title, curriculum: topic.curriculum, subjectCode: topic.subject, questLength: QLEN,
            puzzlePreferences: { types: { multipleChoice: true, trueFalse: true } },
            difficultySettings: { writingLevel: spec.level, puzzleDifficulty: spec.level },
            includeDrHolo: true, artStyle: 'digital-painting',
          }),
        })
        const body = await gen.json().catch(() => null)
        if (gen.status !== 201) { console.log(`✗ ${band}#${n}: נדחתה ${body?.error ?? gen.status}`); continue }
        const id = body.quest.id as string
        questIds.push(id)
        let gd: any = null
        const deadline = Date.now() + 600_000
        while (Date.now() < deadline) {
          await sleep(5000)
          const r = await fetch(`${SERVER}/api/quests/${id}`)
          if (!r.ok) continue
          const q = (await r.json()).quest
          if (q?.game_data?.genError) { console.log(`✗ ${band}#${n}: ${q.game_data.genError}`); break }
          if (Array.isArray(q?.game_data?.scenes) && q.game_data.scenes.length) { gd = q.game_data; break }
        }
        if (!gd) continue
        writeFileSync(path.join(OUT, `${band}-${n}.json`), JSON.stringify({ band, level: spec.level, title, subject: topic.subject, gameData: gd }, null, 1))
        console.log(`✓ ${band}#${n} ${topic.title}: ${gd.scenes.length} סצנות, ${secs(t0)}ש׳, fit=${JSON.stringify(gd.genMeta?.fit ?? null)}`)
      }
    }
  } finally {
    /* ניקוי מלא — הדמיות, משתמש, auth, בית ספר */
    try {
      if (questIds.length) {
        await supabaseAdmin.from('assignments').delete().in('quest_id', questIds)
        await supabaseAdmin.from('quests').delete().in('id', questIds)
      }
      const { data: stray } = await supabaseAdmin.from('quests').select('id').like('title', `${PREFIX}${tag}-%`)
      const strayIds = (stray ?? []).map((q) => q.id as string)
      if (strayIds.length) await supabaseAdmin.from('quests').delete().in('id', strayIds)
      if (userId) await supabaseAdmin.from('users').delete().eq('id', userId)
      for (const a of authIds) await supabaseAdmin.auth.admin.deleteUser(a).catch(() => {})
      if (schoolId) await supabaseAdmin.from('schools').delete().eq('id', schoolId)
      const { count } = await supabaseAdmin.from('quests').select('id', { count: 'exact', head: true }).like('title', `${PREFIX}${tag}-%`)
      console.log(`ניקוי הושלם. שאריות הדמיות zz-textfit: ${count ?? 0}`)
    } catch (e) { console.error('ניקוי נכשל:', e instanceof Error ? e.message : e) }
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
