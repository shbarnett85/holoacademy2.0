/* ──────────────────────────────────────────────────────────────────────────
   measure-metrics — מודד ב-Chrome אמיתי:
   (1) רוחב התווים של Heebo (טבלה ל-fitsScreen — הערכת גובה בלי דפדפן),
   (2) הגיאומטריה של תיבת הטקסט בכל מסכי הייחוס (רוחב/גובה/גופן/שורה/גובה שורת פעולה).
   כותב JSON שממנו נגזרים הקבועים ב-src/shared/lib/sceneTextMetrics.ts.
   ────────────────────────────────────────────────────────────────────────── */
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { REF_SCREENS, launch, newCtx, openLabScene, measureBox } from './lab.ts'

const OUT = process.argv[2] ?? path.resolve('e2e/textfit/out')
mkdirSync(OUT, { recursive: true })

const browser = await launch()

/* ── (2) גיאומטריה פר מסך ייחוס, פר מספר שורות פעולה (1..4) ── */
const layouts: Record<string, unknown> = {}
for (const s of REF_SCREENS) {
  const byRows: Record<number, unknown> = {}
  for (const rows of [1, 2, 3, 4]) {
    const ctx = await newCtx(browser, s)
    const choices = rows > 1 ? Array.from({ length: rows }, (_, i) => ({ id: `c${i}`, text: `בחירה ${i + 1}`, nextSceneId: 's2' })) : undefined
    const page = await openLabScene(ctx, { narrative: 'טקסט קצר לבדיקה.', choices }, 2000)
    const m = await measureBox(page)
    byRows[rows] = { areaW: m.areaClient?.clientW, areaH: m.areaClient?.clientH, padX: m.areaPad?.x, padY: m.areaPad?.y, actionsH: m.actions?.h, font: m.fontPx, line: m.linePx, root: m.rootFontPx, panelH: m.panel?.h, panelW: m.panel?.w }
    await ctx.close()
  }
  layouts[s.key] = { label: s.label, width: s.width, height: s.height, byRows }
}

/* ── (1) רוחב תווים ── */
const ctx0 = await newCtx(browser, REF_SCREENS[0])
const page0 = await openLabScene(ctx0, { narrative: 'אבגד.' }, 1500)
const widths = await page0.evaluate(async () => {
  const p = document.querySelector<HTMLElement>('.holo-text-area p.text-lg:not([aria-hidden])')!
  const cs = getComputedStyle(p)
  const weight = cs.fontWeight
  await document.fonts.load(`${weight} 1000px Heebo`)
  await document.fonts.load(`${weight} 1000px Heebo`, 'אבג')
  const c = document.createElement('canvas').getContext('2d')!
  c.font = `${weight} 1000px ${cs.fontFamily}`
  const w = (ch: string) => Math.round(c.measureText(ch).width)
  const out: Record<string, number> = {}
  const add = (chars: string) => { for (const ch of chars) out[ch] = w(ch) }
  add('אבגדהוזחטיכךלמםנןסעפףצץקרשת')               /* אותיות עבריות + סופיות */
  add(' .,?!:;"\'״׳־-–—…()[]/%+=*&#@_')            /* פיסוק + רווח */
  add('0123456789')
  add('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ')
  for (let cp = 0x05b0; cp <= 0x05c7; cp++) out[String.fromCodePoint(cp)] = w(String.fromCodePoint(cp)) /* ניקוד/טעמים */
  /* ברירת מחדל לתו לא ידוע: ממוצע האותיות העבריות */
  const heb = 'אבגדהוזחטיכךלמםנןסעפףצץקרשת'.split('').map((ch) => out[ch])
  out['__default'] = Math.round(heb.reduce((a, b) => a + b, 0) / heb.length)
  return { weight, family: cs.fontFamily, widths: out, fontLoaded: document.fonts.check(`${weight} 20px Heebo`) }
})
await ctx0.close()
await browser.close()

writeFileSync(path.join(OUT, 'layouts.json'), JSON.stringify(layouts, null, 1))
writeFileSync(path.join(OUT, 'charwidths.json'), JSON.stringify(widths, null, 1))
console.log('weight', widths.weight, 'fontLoaded', widths.fontLoaded, 'chars', Object.keys(widths.widths).length, 'default', widths.widths['__default'])
for (const [k, v] of Object.entries(layouts) as any) console.log(k, JSON.stringify(v.byRows[1]), '| rows4 areaH', v.byRows[4].areaH)
