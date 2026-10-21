/* ──────────────────────────────────────────────────────────────────────────
   anchorCheck — רגרסיה: באתגרי רב-ברירה/נכון-לא-נכון, האם עוגני העובדות של האתגר (מילות התשובה הנכונה + מספרים)
   עדיין מופיעים בטקסט שמוצג בסצנה (נרטיב + דיבור ד"ר הולו) בהדמיות שנוצרו (textFitGen).
   הרצה:  npx tsx src/scripts/anchorCheck.ts <genDir>
   ────────────────────────────────────────────────────────────────────────── */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { anchorsOf, missingAnchors } from '../lib/sceneFit.js'
import { sceneDisplayText } from '../../../src/shared/lib/sceneText.js'

const dir = process.argv[2]
let puzzles = 0, withAnchors = 0, allPresent = 0
const lost: string[] = []
for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
  const j = JSON.parse(readFileSync(path.join(dir, f), 'utf8'))
  for (const s of j.gameData.scenes) {
    if (!s.puzzle || !['multipleChoice', 'trueFalse'].includes(s.puzzle.type)) continue
    puzzles++
    const anchors = anchorsOf(s)
    if (!anchors.length) continue
    withAnchors++
    const miss = missingAnchors(anchors, sceneDisplayText(s))
    if (!miss.length) allPresent++
    else lost.push(`${f}:${s.id} חסר ${JSON.stringify(miss)}`)
  }
}
console.log(JSON.stringify({ puzzles, withAnchors, allAnchorsPresent: allPresent, pct: +(100 * allPresent / Math.max(1, withAnchors)).toFixed(1) }))
for (const l of lost) console.log(' ', l)
