/* ──────────────────────────────────────────────────────────────────────────
   shortenExisting — רגרסיה על תוכן קיים (לקריאה בלבד): סצנות ארוכות עם אתגר רב-ברירה / נכון-לא-נכון מהדמיות
   שבמסד עוברות את זרימת "קצר טקסט" של העורך (proposeSceneShortening — קריאת מודל אמיתית, **בלי שמירה**).
   נמדד: כמה קיצורים התקבלו, האם עוגני העובדות של האתגר נשמרו בטקסט המקוצר, האם הטקסט נכנס בעמוד אחד,
   וכמה אזהרות דקדוק/עובדות נתפסו. כך מוודאים שהאתגר עדיין נשען על הטקסט המוצג אחרי הקיצור.
   הרצה:  NODE_OPTIONS=--use-system-ca npx tsx src/scripts/shortenExisting.ts <outJson> [n=24]
   ────────────────────────────────────────────────────────────────────────── */
import '../env.js'
import { writeFileSync } from 'node:fs'
import { supabaseAdmin } from '../lib/supabase.js'
import { analyzeScene, anchorsOf, bandOfGameData, missingAnchors } from '../lib/sceneFit.js'
import { proposeSceneShortening } from '../lib/sceneShorten.js'
import { runFactCheck } from '../lib/factCheck.js'
import { sceneDisplayText } from '../../../src/shared/lib/sceneText.js'

const OUT = process.argv[2]
const N = Number(process.argv[3] ?? 24)

function rng(seed: number) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

type Scene = Parameters<typeof analyzeScene>[0]
const { data, error } = await supabaseAdmin.from('quests').select('id, title, game_data').not('game_data', 'is', null).limit(300)
if (error) throw new Error(error.message)

const candidates: { quest: string; level: number; scene: Scene }[] = []
for (const q of data ?? []) {
  const gd = q.game_data as { scenes?: Scene[]; readingScale?: number }
  const band = bandOfGameData(gd as never)
  const level = gd.readingScale ?? 10
  const perQuest: typeof candidates = []
  for (const s of gd.scenes ?? []) {
    const t = s.puzzle?.type
    if (t !== 'multipleChoice' && t !== 'trueFalse') continue
    if (!analyzeScene(s, band).overflow) continue
    if (!anchorsOf(s).length) continue /* רק סצנות שהאתגר שלהן נשען על טקסט הסצנה — אלה שהקיצור יכול לשבור */
    perQuest.push({ quest: q.id as string, level, scene: s })
  }
  candidates.push(...perQuest.slice(0, 2))
}
const rand = rng(4242)
const picked = candidates.map((c) => ({ c, r: rand() })).sort((a, b) => a.r - b.r).slice(0, N).map((x) => x.c)
console.log(`מועמדות: ${candidates.length} סצנות עם אתגר מעוגן שחורגות; נבדקות: ${picked.length}`)

const rows: Record<string, unknown>[] = []
let idx = 0
async function worker(): Promise<void> {
  while (idx < picked.length) {
    const my = picked[idx++]
    const anchors = anchorsOf(my.scene)
    const r = await proposeSceneShortening(my.scene, { level: my.level })
    if (!r.before) continue
    const before = r.before
    const baseFacts = await runFactCheck({ scenes: [{ ...my.scene, nextSceneId: null }], entrySceneId: my.scene.id } as never).then((x) => x.errors.map((e) => e.problem)).catch(() => [] as string[])
    const afterText = r.after ? sceneDisplayText({ narrative: r.after.narrative, drHoloDialog: r.after.drHoloDialog }) : null
    const missing = afterText ? missingAnchors(anchors, afterText) : null
    rows.push({
      quest: my.quest, scene: my.scene.id, puzzle: my.scene.puzzle?.type, anchors: anchors.length,
      ok: r.ok, reasons: r.reasons, beforeWords: before.words, beforePages: before.pages,
      afterWords: r.after?.words ?? null, afterPages: r.after?.pages ?? null, anchorsMissingAfter: missing?.length ?? null,
      grammarFlags: r.checks?.grammar.length ?? null, factFlags: r.checks?.facts.length ?? null, factFlagsBaseline: baseFacts.length, factTexts: r.checks?.facts.slice(0, 3),
      sample: rows.length < 3 && r.after ? { before: `${before.narrative} | ${before.drHoloDialog}`, after: `${r.after.narrative} | ${r.after.drHoloDialog}` } : undefined,
    })
    console.log(`${rows.length}/${picked.length} ${r.ok ? '✓' : '✗'} ${before.words}→${r.after?.words ?? '-'} מילים, עמודים ${before.pages}→${r.after?.pages ?? '-'}${r.ok ? '' : ' — ' + r.reasons.join('; ')}`)
  }
}
await Promise.all([worker(), worker(), worker()])

const ok = rows.filter((r) => r.ok)
const summary = {
  tested: rows.length, accepted: ok.length, rejected: rows.length - ok.length,
  acceptedFitOnePage: ok.filter((r) => r.afterPages === 1).length,
  acceptedAllAnchorsKept: ok.filter((r) => r.anchorsMissingAfter === 0).length,
  acceptedWithGrammarFlags: ok.filter((r) => (r.grammarFlags as number) > 0).length,
  acceptedWithFactFlags: ok.filter((r) => (r.factFlags as number) > 0).length,
  medianWordsBefore: rows.map((r) => r.beforeWords as number).sort((a, b) => a - b)[Math.floor(rows.length / 2)],
  medianWordsAfter: ok.map((r) => r.afterWords as number).sort((a, b) => a - b)[Math.floor(ok.length / 2)],
}
writeFileSync(OUT, JSON.stringify({ summary, rows }, null, 1))
console.log(JSON.stringify(summary))
process.exit(0)
