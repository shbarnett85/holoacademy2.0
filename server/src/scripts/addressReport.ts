/* ──────────────────────────────────────────────────────────────────────────
   addressReport — בדיקת "פנייה לתלמיד בלשון רבים" על הדמיות שנוצרו (textFitGen): הפרות regex לכל הדמיה,
   נתוני התיקון (genMeta.address), וציטוטים מ-N הדמיות לדגימה ידנית.
   הרצה:  npx tsx src/scripts/addressReport.ts <genDir> [sample=5]
   ────────────────────────────────────────────────────────────────────────── */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { findAddressViolations, listTextSlots } from '../lib/studentAddress.js'

const dir = process.argv[2]
const sample = Number(process.argv[3] ?? 5)
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
let total = 0, scenes = 0, slots = 0, found = 0, fixed = 0, kept = 0, remainingMeta = 0
const rows: string[] = []
const quotes: string[] = []
const typeCounts: Record<string, number> = {}
for (const f of files) {
  const j = JSON.parse(readFileSync(path.join(dir, f), 'utf8'))
  const gd = j.gameData
  const v = findAddressViolations(gd)
  total += v.length
  scenes += gd.scenes.length
  slots += listTextSlots(gd).length
  const a = gd.genMeta?.address
  if (a) { found += a.found; fixed += a.fixed; kept += a.keptCharacterSpeech ?? 0; remainingMeta += a.remaining }
  for (const s of gd.scenes) if (s.puzzle?.type) typeCounts[s.puzzle.type] = (typeCounts[s.puzzle.type] ?? 0) + 1
  rows.push(`${f.padEnd(12)} ${String(gd.scenes.length).padStart(2)} סצנות · הפרות ${v.length}${v.length ? ' · ' + v.slice(0, 3).map((x) => `${x.sceneId}/${x.field} [${x.match}] …${x.context}…`).join(' | ') : ''} · תיקון ${a ? `נמצאו ${a.found} תוקנו ${a.fixed} נותרו ${a.remaining} דמות-לדמות ${a.keptCharacterSpeech ?? 0}` : '—'}`)
}
files.slice(0, sample * 4).filter((_, i) => i % 4 === 0).slice(0, sample).forEach((f) => {
  const gd = JSON.parse(readFileSync(path.join(dir, f), 'utf8')).gameData
  const sc = gd.scenes.find((s: { puzzle?: unknown; drHoloDialog?: string }) => s.puzzle && s.drHoloDialog) ?? gd.scenes[1]
  quotes.push(`── ${f} · ${sc.id}\n  נרטיב: ${sc.narrative}\n  ד"ר הולו: ${sc.drHoloDialog ?? ''}\n  שאלה: ${sc.puzzle?.question ?? '—'}${sc.puzzle?.moralChoices ? '\n  אפשרויות דילמה: ' + sc.puzzle.moralChoices.map((c: { text: string }) => c.text).join(' | ') : ''}`)
})
console.log(rows.join('\n'))
console.log(JSON.stringify({ quests: files.length, scenes, textSlots: slots, regexViolations: total, generationFix: { found, fixed, remaining: remainingMeta, keptCharacterSpeech: kept }, puzzleTypes: typeCounts }))
console.log('\n' + quotes.join('\n\n'))
