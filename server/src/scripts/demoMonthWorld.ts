/* בונה מחדש את העולם החודשי של ארגון הדגמה (lib/demoMonth.ts): שתי כיתות ח׳, 20 תלמידים פיקטיביים ו-15 שיעורים
   על פני שלושה חודשים שהאחרון בהם הוא החודש הקודם. מוחק קודם את הכיתות והתוצאות הפיקטיביות של הארגון בלבד.
   הרצה:  npm run demo:world -- --org "Nesher Demo"            בנייה
          npm run demo:world -- --org "Nesher Demo" --roll     רק גלגול לחודש הנוכחי (מה שהשרת עושה בעצמו)
          npm run demo:world -- --org "Nesher Demo" --roll-to 2026-12-05   בדיקה: כאילו נכנסים בתאריך הזה */
import '../env.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { buildDemoWorld, rollDemoWorld } from '../lib/demoMonth.js'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf('--' + name)
  if (i < 0) return undefined
  const parts: string[] = []
  for (let j = i + 1; j < process.argv.length && !process.argv[j].startsWith('--'); j++) parts.push(process.argv[j])
  return parts.length ? parts.join(' ') : undefined
}

const org = arg('org') ?? 'Nesher Demo'
const { data: school } = await supabaseAdmin.from('schools').select('id, name, demo_data_enabled').eq('name', org).maybeSingle()
if (!school) throw new Error('הארגון לא נמצא: ' + org)
if (!school.demo_data_enabled) throw new Error('הארגון אינו ארגון הדגמה')
const t0 = Date.now()
if (arg('roll-to')) {
  /* בדיקה ידנית: כאילו נכנסים בתאריך אחר (גם אחורה), למשל --roll-to 2026-12-05 */
  console.log(JSON.stringify(await rollDemoWorld(school.id, new Date(arg('roll-to') + 'T10:00:00Z'), { allowBack: true })))
} else if (process.argv.includes('--roll')) {
  console.log(JSON.stringify(await rollDemoWorld(school.id)))
} else {
  const r = await buildDemoWorld(school.id, new Date(), (s) => console.log('  ' + s))
  console.log(`נבנה: ${r.classes} כיתות, ${r.students} תלמידים, ${r.lessons} שיעורים, ${r.sessions} משחקים. החודש האחרון: ${r.anchor.month1}/${r.anchor.year}. ${Math.round((Date.now() - t0) / 1000)} שניות`)
}
process.exit(0)
