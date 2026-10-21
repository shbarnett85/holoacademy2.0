/* ──────────────────────────────────────────────────────────────────────────
   summarize-gen — סיכום הדמיות חדשות (textFitGen): לכל שכבה — אחוז הסצנות שנכנסות בעמוד אחד
   בכל מסך ייחוס (fitsScreen), התפלגות מילים, עמידה בתקציב השאלה/אפשרויות, וסטטיסטיקת הקיצור (genMeta.fit).
   הרצה:  npx tsx e2e/textfit/summarize-gen.ts <genDir> [outJson]
   ────────────────────────────────────────────────────────────────────────── */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { GRADE_BANDS, OPTION_WORD_BUDGET, fitsScreen, questionWordBudget, sceneDisplayText, sceneWordBudget, wordCount, type GradeBand, type RefScreenKey } from '../../src/shared/lib/sceneText.ts'

const dir = process.argv[2]
const SCREENS: RefScreenKey[] = ['laptop-620', 'laptop-768', 'tablet', 'phone-landscape']
const pct = (a: number, b: number) => +(100 * a / Math.max(1, b)).toFixed(1)
const out: Record<string, any> = {}
for (const band of GRADE_BANDS) {
  const files = readdirSync(dir).filter((f) => f.startsWith(band + '-') && f.endsWith('.json')).sort()
  const fit = { quests: files.length, scenes: 0, overflow: 0, shortened: 0, split: 0, flagged: 0, questionFlags: 0 }
  const words: number[] = []
  const fits: Record<string, number> = Object.fromEntries(SCREENS.map((k) => [k, 0]))
  let qOver = 0, qTotal = 0, optOver = 0, optTotal = 0, puzzles = 0, mcWith5 = 0
  for (const f of files) {
    const j = JSON.parse(readFileSync(path.join(dir, f), 'utf8'))
    const m = j.gameData.genMeta?.fit
    if (m) for (const k of ['overflow', 'shortened', 'split', 'flagged', 'questionFlags'] as const) fit[k] += m[k] ?? 0
    for (const s of j.gameData.scenes) {
      fit.scenes++
      const t = sceneDisplayText({ narrative: s.narrative, drHoloDialog: s.drHoloDialog })
      words.push(wordCount(t))
      for (const k of SCREENS) if (fitsScreen(t, band as GradeBand, k).fits) fits[k]++
      const p = s.puzzle
      if (p && Array.isArray(p.choices)) {
        puzzles++
        qTotal++; if (wordCount(p.question) > questionWordBudget(p.choices.length)) qOver++
        if (p.choices.length >= 5) mcWith5++
        for (const c of p.choices) { optTotal++; if (wordCount(c.text) > OPTION_WORD_BUDGET) optOver++ }
      }
    }
  }
  words.sort((a, b) => a - b)
  const q = (x: number) => words[Math.min(words.length - 1, Math.floor(words.length * x))]
  out[band] = {
    ...fit, budget: sceneWordBudget(band as GradeBand),
    words: { median: q(0.5), p90: q(0.9), max: words[words.length - 1], mean: +(words.reduce((a, b) => a + b, 0) / Math.max(1, words.length)).toFixed(1) },
    fitPct: Object.fromEntries(SCREENS.map((k) => [k, pct(fits[k], fit.scenes)])),
    overBudgetPct: pct(words.filter((w) => w > sceneWordBudget(band as GradeBand)).length, words.length),
    choicePuzzles: puzzles, mc5plus: mcWith5, questionOverBudgetPct: pct(qOver, qTotal), optionOverBudgetPct: pct(optOver, optTotal),
  }
}
const all = GRADE_BANDS.map((b) => out[b])
const sum = (k: string) => all.reduce((a, x) => a + (x[k] ?? 0), 0)
out.total = { scenes: sum('scenes'), quests: sum('quests'), overflow: sum('overflow'), shortened: sum('shortened'), split: sum('split'), flagged: sum('flagged'),
  fitPct: Object.fromEntries(SCREENS.map((k) => [k, pct(all.reduce((a, x) => a + x.fitPct[k] * x.scenes / 100, 0), sum('scenes'))])) }
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(out, null, 1))
console.log(JSON.stringify(out, null, 1))
