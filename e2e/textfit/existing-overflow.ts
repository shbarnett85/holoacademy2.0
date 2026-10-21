/* ──────────────────────────────────────────────────────────────────────────
   existing-overflow — כמה מהתוכן הקיים חורג מתיבת הטקסט, לכל מסך ייחוס ולכל שכבה,
   + טבלת רגישות: קיבולת (N95 במילים) כתלות במקדם גודל הגופן / ברוחב התיבה.
   משתמש ב-fitsScreen (מכויל מול Chrome, סטייה ≤ שורה) על כל הסצנות הקיימות (texts.json).
   הרצה:  npx tsx e2e/textfit/existing-overflow.ts <texts.json> [outDir]
   ────────────────────────────────────────────────────────────────────────── */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { GRADE_BANDS, REF_LAYOUTS, fitsScreen, gradeBandOfQuest, sceneDisplayText, wordCount, type GradeBand, type RefScreenKey, type SceneLayout } from '../../src/shared/lib/sceneText.ts'
import { splitUnits } from '../../src/shared/lib/scenePages.ts'

const raw = JSON.parse(readFileSync(process.argv[2], 'utf8')) as any[]
const outDir = process.argv[3] ?? path.resolve('e2e/textfit/out')
const SCREENS: RefScreenKey[] = ['laptop-620', 'laptop-768', 'tablet', 'phone-landscape']

const scenes = raw
  .filter((o) => o.kind === 'scene' || o.kind === 'ending')
  .map((o) => ({
    band: gradeBandOfQuest({ readingScale: o.lvl, gradeMin: o.gmin, gradeMax: o.gmax }) as GradeBand,
    text: sceneDisplayText({ narrative: o.narrative, drHoloDialog: o.dialog }),
    words: wordCount(o.narrative) + wordCount(o.dialog),
  }))
  .filter((s) => s.words >= 3)

const pct = (a: number, b: number) => +(100 * a / Math.max(1, b)).toFixed(1)
const out: Record<string, any> = { total: scenes.length, byScreen: {}, byBandScreen: {}, pagesDist: {} }
for (const key of SCREENS) {
  const res = scenes.map((s) => ({ s, r: fitsScreen(s.text, s.band, key) }))
  out.byScreen[key] = { overflowPct: pct(res.filter((x) => !x.r.fits).length, res.length), medianPages: res.map((x) => x.r.pages).sort((a, b) => a - b)[Math.floor(res.length / 2)], p90Pages: res.map((x) => x.r.pages).sort((a, b) => a - b)[Math.floor(res.length * 0.9)], maxLines: res[0].r.maxLines }
  for (const band of GRADE_BANDS) {
    const mine = res.filter((x) => x.s.band === band)
    out.byBandScreen[`${band}|${key}`] = { n: mine.length, overflowPct: pct(mine.filter((x) => !x.r.fits).length, mine.length) }
  }
}
for (const band of GRADE_BANDS) {
  const w = scenes.filter((s) => s.band === band).map((s) => s.words).sort((a, b) => a - b)
  out.pagesDist[band] = { n: w.length, median: w[Math.floor(w.length / 2)], p10: w[Math.floor(w.length * 0.1)], p90: w[Math.floor(w.length * 0.9)] }
}

/* ── רגישות: N95 (מילים שנכנסות ב-95% מהסצנות הסינתטיות) כתלות במקדם גופן/רוחב — מסך הייחוס הראשי ───────── */
function rng(seed: number) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const mine = raw.filter((o) => o.kind === 'scene' || o.kind === 'ending')
const sentences: string[] = []
for (const o of mine) for (const u of splitUnits(String(o.narrative ?? ''))) sentences.push(u.text)
const dialogs: string[] = []
for (const o of mine) for (const u of splitUnits(String(o.dialog ?? ''))) dialogs.push(u.text)
const dialogShare = mine.filter((o) => String(o.dialog ?? '').trim()).length / Math.max(1, mine.length)
const rand = rng(777)
const make = (n: number): string => {
  const parts: string[] = []
  let words = 0, guard = 0
  let tail = ''
  if (rand() < dialogShare && dialogs.length) { const d = dialogs[Math.floor(rand() * dialogs.length)]; tail = `\n\nד״ר הולו אומר: "${d}"`; words += wordCount(d) + 3 }
  while (words < n - 3 && guard++ < 80) {
    const s = sentences[Math.floor(rand() * sentences.length)]
    const w = wordCount(s)
    if (words + w > n) continue
    parts.push(s); words += w
  }
  return parts.join(' ') + tail
}
function n95(lay: SceneLayout): number {
  let best = 0
  for (let n = 8; n <= 120; n++) {
    let ok = 0
    for (let i = 0; i < 200; i++) if (fitsScreen(make(n), 'g5_6', lay).fits) ok++
    if (ok / 200 >= 0.95) best = n
  }
  return best
}
const base = REF_LAYOUTS['laptop-620']
const scale = (lay: SceneLayout, f: number, widthMul = 1): SceneLayout => ({ ...lay, fontPx: lay.fontPx * f, linePx: lay.linePx * f, textWidthPx: lay.textWidthPx * widthMul })
const sens: Record<string, any> = {}
for (const f of [1, 0.9, 0.8, 0.7, 0.62]) sens[`font×${f}`] = { fontPx: +(base.fontPx * f).toFixed(1), n95: n95(scale(base, f)) }
for (const wm of [1.25, 1.5, 1.75]) sens[`width×${wm}`] = { textWidthPx: +(base.textWidthPx * wm).toFixed(0), n95: n95(scale(base, 1, wm)) }
sens['width×1.5 + font×0.8'] = { fontPx: +(base.fontPx * 0.8).toFixed(1), textWidthPx: +(base.textWidthPx * 1.5).toFixed(0), n95: n95(scale(base, 0.8, 1.5)) }
out.sensitivity = sens

writeFileSync(path.join(outDir, 'existing-overflow.json'), JSON.stringify(out, null, 1))
console.log(JSON.stringify(out.byScreen), '\n', JSON.stringify(out.sensitivity, null, 1))
for (const band of GRADE_BANDS) console.log(band, out.pagesDist[band], SCREENS.map((k) => `${k}:${out.byBandScreen[`${band}|${k}`].overflowPct}%`).join(' '))
