/* ──────────────────────────────────────────────────────────────────────────
   budgets — גוזר תקציב מילים לכל שכבה מהמדידה.
   · קורפוס: משפטים אמיתיים מהסצנות הקיימות, לפי שכבה (כולל טקסט מנוקד בשכבות הצעירות).
   · לכל מספר מילים N: 400 סצנות סינתטיות (נרטיב + בשיעור הקורפוס גם "ד״ר הולו אומר: …") ב-[N-3, N] מילים,
     ושיעור ההכנסה במסכי הייחוס (fitsScreen, מכויל מול Chrome). N95 = ה-N הגדול ביותר ששיעור ההכנסה שלו ≥95%.
   · תקציב = min(תקרה, ⌊0.85 × N95 במסך הראשי⌋)  (מרווח ביטחון ~15%).
   הרצה:  npx tsx e2e/textfit/budgets.ts <texts.json> [outDir]
   ────────────────────────────────────────────────────────────────────────── */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { GRADE_BANDS, SCENE_WORD_CAP, fitsScreen, gradeBandOfQuest, wordCount, type GradeBand, type RefScreenKey } from '../../src/shared/lib/sceneText.ts'
import { splitUnits } from '../../src/shared/lib/scenePages.ts'

const raw = JSON.parse(readFileSync(process.argv[2], 'utf8')) as any[]
const outDir = process.argv[3] ?? path.resolve('e2e/textfit/out')

function rng(seed: number) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

const SCREENS: RefScreenKey[] = ['laptop-620', 'laptop-768', 'tablet', 'phone-landscape']
const result: Record<string, any> = {}
for (const band of GRADE_BANDS) {
  const mine = raw.filter((o) => (o.kind === 'scene' || o.kind === 'ending') && gradeBandOfQuest({ readingScale: o.lvl, gradeMin: o.gmin, gradeMax: o.gmax }) === band)
  const narr: string[] = [], dial: string[] = []
  for (const o of mine) {
    for (const u of splitUnits(String(o.narrative ?? ''))) narr.push(u.text)
    for (const u of splitUnits(String(o.dialog ?? ''))) dial.push(u.text)
  }
  const dialogShare = mine.filter((o) => (o.dialog ?? '').trim()).length / Math.max(1, mine.length)
  const rand = rng(1234 + band.length)
  const pick = (arr: string[]) => arr[Math.floor(rand() * arr.length)]
  const make = (n: number): string => {
    const withDialog = rand() < dialogShare && dial.length > 0
    const parts: string[] = []
    let words = 0
    if (withDialog) { const d = pick(dial); parts.push(`ד״ר הולו אומר: "${d}"`); words += wordCount(d) }
    const nar: string[] = []
    let guard = 0
    while (words < n - 3 && guard++ < 60) {
      const s = pick(narr)
      const w = wordCount(s)
      if (words + w > n) continue
      nar.push(s); words += w
    }
    return [nar.join(' '), ...parts].filter(Boolean).join('\n\n')
  }
  const perScreen: Record<string, any> = {}
  for (const key of SCREENS) {
    const curve: Record<number, number> = {}
    let n95 = 0
    for (let n = 10; n <= 90; n += 1) {
      let ok = 0
      const trials = 300
      for (let i = 0; i < trials; i++) if (fitsScreen(make(n), band, key).fits) ok++
      curve[n] = +(ok / trials).toFixed(3)
      if (ok / trials >= 0.95) n95 = n
    }
    perScreen[key] = { n95, curve }
  }
  const budget = Math.min(SCENE_WORD_CAP[band], Math.floor(perScreen['laptop-620'].n95 * 0.85))
  /* תקציב משני לכל מסך (למסך הייחוס המשני — כמה מילים ללא עמוד נוסף) */
  const perScreenBudget = Object.fromEntries(SCREENS.map((k) => [k, Math.floor(perScreen[k].n95 * 0.85)]))
  result[band] = { corpusScenes: mine.length, sentencesNarr: narr.length, dialogShare: +dialogShare.toFixed(2), n95: Object.fromEntries(SCREENS.map((k) => [k, perScreen[k].n95])), perScreenBudget, cap: SCENE_WORD_CAP[band], budget, fitRateAtBudget: perScreen['laptop-620'].curve[budget] }
  console.log(band, JSON.stringify({ n: mine.length, dialogShare: result[band].dialogShare, n95: result[band].n95, perScreenBudget, cap: SCENE_WORD_CAP[band], budget, fitAtBudget: result[band].fitRateAtBudget }))
}
writeFileSync(path.join(outDir, 'budgets.json'), JSON.stringify(result, null, 1))
