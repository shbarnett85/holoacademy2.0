/* ──────────────────────────────────────────────────────────────────────────
   story-font — האם טקסט בגופן הסיפור (Frank Ruhl Libre, מרמת טקסט 8) תופס יותר שורות מאותו טקסט בגופן הקיים (Heebo)?
   מודל האורך (sceneText.fitsScreen) והתקציבים נמדדו על Heebo. אם גופן הסיפור אף פעם לא מוסיף שורה, כל מה שנכנס
   ב-Heebo נכנס גם בו, והתקציבים נשארים תקפים. מודדים בנגן האמיתי, בכל מסכי הייחוס, על 200 טקסטים אמיתיים.
   הרצה:  npx tsx e2e/textfit/story-font.ts [texts.json]
   ────────────────────────────────────────────────────────────────────────── */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { REF_SCREENS, launch, newCtx, openLabScene } from './lab.ts'
import { REF_LAYOUTS, sceneDisplayText, wordCount, type RefScreenKey } from '../../src/shared/lib/sceneText.ts'
import { STORY_FONT_MIN_LEVEL } from '../../src/shared/lib/storyFont.ts'

const textsFile = process.argv[2] ?? path.resolve('e2e/textfit/out/golden-texts.json')
const all = (JSON.parse(readFileSync(textsFile, 'utf8')) as { narrative?: string; dialog?: string }[])
  .map((o) => ({ text: sceneDisplayText({ narrative: o.narrative, drHoloDialog: o.dialog }), words: wordCount(o.narrative ?? '') + wordCount(o.dialog ?? '') }))
  .filter((o) => o.words >= 3)
all.sort((a, b) => a.words - b.words)
const SAMPLE = Math.min(200, all.length)
const sample = Array.from({ length: SAMPLE }, (_, i) => all[Math.floor((i + 0.5) * all.length / SAMPLE)])

const browser = await launch()
let worse = 0
for (const s of REF_SCREENS) {
  const key = s.key as RefScreenKey
  const lay = REF_LAYOUTS[key]
  const maxLines = Math.floor((lay.textHeightPx - 2) / lay.linePx)
  const lines: Record<string, { font: string; size: string; line: string; counts: number[] }> = {}
  for (const [name, level] of [['clean', STORY_FONT_MIN_LEVEL - 1], ['story', STORY_FONT_MIN_LEVEL]] as const) {
    const ctx = await newCtx(browser, s)
    const page = await openLabScene(ctx, { narrative: 'בדיקה.', textLevel: level }, 1500)
    await page.evaluate(() => document.fonts.ready)
    lines[name] = await page.evaluate(async ({ texts }) => {
      const area = document.querySelector<HTMLElement>('.holo-text-area')!
      /* אותו אלמנט מדידה כמו useScenePages: פסקה בתוך התיבה, בזרימה, באותן מחלקות */
      const probe = document.createElement('p')
      probe.className = 'text-lg leading-relaxed'
      Object.assign(probe.style, { display: 'block', visibility: 'hidden', margin: '0', padding: '0', whiteSpace: 'pre-line' })
      area.appendChild(probe)
      const cs = getComputedStyle(probe)
      const font = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim()
      await document.fonts.load(`${cs.fontWeight} ${cs.fontSize} '${font}'`, 'אבגדהוזחטיכלמנסעפצקרשת')
      const line = parseFloat(cs.lineHeight)
      const size = cs.fontSize
      const counts = texts.map((t) => { probe.textContent = t; return Math.round(probe.getBoundingClientRect().height / line) })
      probe.remove()
      return { font, size, line: `${line}px`, counts }
    }, { texts: sample.map((x) => x.text) })
    await ctx.close()
  }
  const a = lines.clean.counts
  const b = lines.story.counts
  const more = b.filter((n, i) => n > a[i]).length
  const fewer = b.filter((n, i) => n < a[i]).length
  const overA = a.filter((n) => n > maxLines).length
  const overB = b.filter((n) => n > maxLines).length
  const newOverflow = b.filter((n, i) => n > maxLines && a[i] <= maxLines).length
  worse += more
  console.log(`${key} (${maxLines} שורות בתיבה): ${lines.clean.font} ${lines.clean.size}/${lines.clean.line} מול ${lines.story.font} ${lines.story.size}/${lines.story.line}`)
  console.log(`   יותר שורות בגופן הסיפור: ${more} מתוך ${SAMPLE}; פחות שורות: ${fewer}; חורגים מהתיבה: ${overA} בגופן הקיים, ${overB} בגופן הסיפור; חריגה חדשה: ${newOverflow}`)
}
await browser.close()
console.log(worse === 0 ? '\n✓ גופן הסיפור לא מוסיף שורה באף טקסט ובאף מסך: מודל האורך והתקציבים נשארים תקפים' : `\n✗ ב-${worse} מקרים גופן הסיפור מוסיף שורה`)
process.exit(worse === 0 ? 0 : 1)
