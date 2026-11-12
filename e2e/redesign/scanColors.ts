/* כלי: סורק קבצים ומדפיס שאריות של העיצוב הישן (צבע קשיח, מעבר צבע, זוהר, טוקן ישן).
   npx tsx e2e/redesign/scanColors.ts [נתיב או תיקייה ...]      ברירת מחדל: src
   npx tsx e2e/redesign/scanColors.ts --summary                   ספירה לפי קובץ בלבד
   יוצא עם קוד 1 אם נמצאו שאריות. */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { isExcluded, scanText } from '../../src/styles/colorScan.ts'

const args = process.argv.slice(2)
const summary = args.includes('--summary')
const roots = args.filter((a) => !a.startsWith('--'))
if (!roots.length) roots.push('src')

const walk = (p: string): string[] => {
  if (statSync(p).isFile()) return [p]
  return readdirSync(p, { withFileTypes: true }).flatMap((e) => {
    const f = path.join(p, e.name)
    return e.isDirectory() ? walk(f) : /\.(tsx?|css)$/.test(e.name) ? [f] : []
  })
}
let total = 0
for (const f of roots.flatMap(walk)) {
  if (isExcluded(f)) continue
  const v = scanText(readFileSync(f, 'utf8'))
  if (!v.length) continue
  total += v.length
  if (summary) { console.log(String(v.length).padStart(4), f.replace(/\\/g, '/')); continue }
  console.log(`\n${f.replace(/\\/g, '/')}  (${v.length})`)
  for (const x of v) console.log(`  ${String(x.line).padStart(4)}  [${x.rule}]  ${x.text}`)
}
console.log(`\ntotal: ${total}`)
process.exit(total ? 1 : 0)
