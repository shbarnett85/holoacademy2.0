import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { countNb, DONUT_TEXT } from '../../shared/lib/findingsNarrative'
import DonutChart from './DonutChart'
import type { DonutSlice } from './DonutChart'
import { DONUT_PATTERN } from './donutPattern'

const SLICES: DonutSlice[] = [
  { key: 'completed', label: 'סיימו', count: 14, tone: 'positive', icon: 'check' },
  { key: 'inProgress', label: 'באמצע', count: 6, tone: 'accent', icon: 'half' },
  { key: 'notStarted', label: 'עוד לא התחילו', count: 5, tone: 'neutral', icon: 'circle' },
]
const ARIA = 'מי סיים את ההדמיה? 14 מתוך 25 סיימו'
const render = (over: Partial<Parameters<typeof DonutChart>[0]> = {}): string =>
  renderToStaticMarkup(<DonutChart ariaLabel={ARIA} slices={SLICES} total={25} centerNumber="25" centerLabel="תלמידים" {...over} />)

const rows = (html: string): string[] => [...html.matchAll(/<li data-donut-row="[^"]+"[\s\S]*?<\/li>/g)].map((m) => m[0])

describe('DonutChart — מקרא גלוי: אייקון, מילה, "X מתוך Y" ואחוז בנוסף', () => {
  const html = render()

  it('שורה לכל נתח, ובכל שורה "X מתוך Y" (ברווחים צמודים) ואחוז בסוגריים', () => {
    const r = rows(html)
    expect(r).toHaveLength(3)
    expect(r[0]).toContain(`${countNb(14, 25)} (56%)`)
    expect(r[1]).toContain(`${countNb(6, 25)} (24%)`)
    expect(r[2]).toContain(`${countNb(5, 25)} (20%)`)
    /* האחוז בא אחרי "X מתוך Y", לא במקומו */
    for (const row of r) expect(row.indexOf('מתוך')).toBeLessThan(row.indexOf('%'))
  })

  it('בכל שורה מילה, אייקון (svg) וסימן הנתח (svg) — המשמעות לא נשענת על הצבע', () => {
    const r = rows(html)
    expect(r[0]).toContain('סיימו')
    expect(r[1]).toContain('באמצע')
    expect(r[2]).toContain('עוד לא התחילו')
    for (const row of r) expect((row.match(/<svg/g) ?? []).length).toBe(2)
  })

  it('המרכז: מספר ומילה', () => {
    expect(html).toContain('>25<')
    expect(html).toContain('>תלמידים<')
  })

  it('האחוזים במקרא מסתכמים ל-100', () => {
    const sum = rows(html).map((r) => Number(/\((\d+)%\)/.exec(r)![1])).reduce((a, b) => a + b, 0)
    expect(sum).toBe(100)
    const thirds = render({ slices: SLICES.map((s) => ({ ...s, count: 1 })), total: 3 })
    expect(rows(thirds).map((r) => Number(/\((\d+)%\)/.exec(r)![1]))).toEqual([34, 33, 33])
  })

  it('נתח אפס: נשאר במקרא במילים "אף אחד", בלי אחוז, ואין לו קשת', () => {
    const h = render({ slices: [SLICES[0], { ...SLICES[1], count: 0 }, SLICES[2]], total: 19 })
    const r = rows(h)
    expect(r).toHaveLength(3)
    expect(r[1]).toContain(DONUT_TEXT.nobody)
    expect(r[1]).not.toContain('%')
    expect(r[1]).not.toContain('מתוך')
    expect((h.match(/data-donut-slice=/g) ?? []).length).toBe(2)
  })
})

describe('DonutChart — נגישות ועקרונות הממשק', () => {
  const html = render()

  it('role="img" עם aria-label על הגרף, ושאר ה-svg-ים (אייקונים וסימני מקרא) מוסתרים מקוראי מסך', () => {
    expect(html).toContain('role="img"')
    expect(html).toContain(`aria-label="${ARIA}"`)
    expect((html.match(/role="img"/g) ?? []).length).toBe(1)
    const svgs = [...html.matchAll(/<svg[^>]*>/g)].map((m) => m[0])
    for (const s of svgs.filter((x) => !x.includes('role="img"'))) expect(s).toContain('aria-hidden="true"')
  })

  it('אין hover, אין title, אין אנימציה', () => {
    expect(html).not.toMatch(/onmouse|onpointer|onfocus|onclick/i)
    expect(html).not.toContain('title=')
    expect(html).not.toMatch(/<animate|<set |transition|animation/i)
    expect(html).not.toContain('<title')
  })

  it('אין var() באטריביוט של SVG — הצבעים רק דרך style', () => {
    expect(html).not.toMatch(/\s(fill|stroke|stop-color|flood-color)="[^"]*var\(/)
    expect(html).toMatch(/style="[^"]*fill:var\(--t\d+\)/)
  })

  it('אין טקסט קטן מ-16px, ואין צבע מוחלט', () => {
    const sizes = [...html.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]))
    expect(sizes.length).toBeGreaterThan(0)
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16)
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/)
  })

  it('SVG בפיקסלים אמיתיים: width/height במספרים, בלי viewBox', () => {
    expect(html).toMatch(/<svg width="140" height="140" role="img"/)
    expect(html).not.toContain('viewBox="0 0 140')
  })
})

describe('DonutChart — כל נתח נבדל גם בדוגמה', () => {
  it('חמישה טונים = חמש דוגמאות שונות', () => {
    expect(new Set(Object.values(DONUT_PATTERN)).size).toBe(5)
  })

  it('הנתחים מצוירים בדוגמאות שונות ולא רק בצבעים שונים: מלא · פסים · נקודות', () => {
    const html = render({
      slices: [
        { key: 'a', label: 'א', count: 5, tone: 'positive', icon: 'check' },
        { key: 'b', label: 'ב', count: 5, tone: 'attention', icon: 'alert' },
        { key: 'c', label: 'ג', count: 5, tone: 'neutral', icon: 'circle' },
        { key: 'd', label: 'ד', count: 5, tone: 'accent', icon: 'half' },
      ],
      total: 20,
    })
    expect((html.match(/<pattern /g) ?? []).length).toBe(3)
    const fills = [...html.matchAll(/<path data-donut-slice="([a-d])"[^>]*style="[^"]*?fill:([^;"]+)/g)].map((m) => ({ key: m[1], fill: m[2] }))
    expect(fills).toHaveLength(4)
    expect(new Set(fills.map((f) => f.fill)).size).toBe(4)
    expect(fills.find((f) => f.key === 'a')!.fill).toMatch(/^var\(--t\d+\)$/)
    for (const f of fills.filter((x) => x.key !== 'a')) expect(f.fill).toMatch(/^url\(#donut-[^)]+\)$/)
    /* הדוגמאות שונות זו מזו: אלכסוני (מסובב), נקודות (עיגול), אופקי (בלי סיבוב ובלי עיגול) */
    expect(html).toContain('patternTransform="rotate(45)"')
    expect(html).toContain('<circle')
  })

  it('כל מזהה דוגמה מוגדר ב-defs ומופיע ב-fill (אין הפניה לדוגמה שלא קיימת) — גם לנתח ריק', () => {
    const html = render({ slices: [SLICES[0], { ...SLICES[1], count: 0 }, SLICES[2]], total: 19 })
    const defined = new Set([...html.matchAll(/<pattern id="([^"]+)"/g)].map((m) => m[1]))
    const used = [...html.matchAll(/fill:url\(#([^)]+)\)/g)].map((m) => m[1])
    expect(used.length).toBeGreaterThan(0)
    for (const id of used) expect(defined.has(id), id).toBe(true)
  })

  it('שני גרפים באותו עמוד לא חולקים מזהי דוגמה', () => {
    const both = renderToStaticMarkup(<><DonutChart ariaLabel="א" slices={SLICES} total={25} centerNumber="1" centerLabel="x" /><DonutChart ariaLabel="ב" slices={SLICES} total={25} centerNumber="2" centerLabel="y" /></>)
    const ids = [...both.matchAll(/<pattern id="([^"]+)"/g)].map((m) => m[1])
    expect(ids.length).toBeGreaterThan(2)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('DonutChart — מקרי קצה', () => {
  it('נתח יחיד של 100%: טבעת שלמה (evenodd), בלי מפרידים', () => {
    const h = render({ slices: [{ ...SLICES[0], count: 25 }, { ...SLICES[1], count: 0 }, { ...SLICES[2], count: 0 }] })
    expect((h.match(/data-donut-slice=/g) ?? []).length).toBe(1)
    expect(h).toContain('fill-rule:evenodd')
    expect(h).not.toContain('<line')
    expect(rows(h)[0]).toContain(`${countNb(25, 25)} (100%)`)
  })

  it('כמה נתחים: מפריד בין כל נתח לקודמו', () => {
    expect((render().match(/<line/g) ?? []).length).toBe(3)
  })

  it('total = 0 → מצב ריק כללי שאומר מה יקרה, בלי גרף', () => {
    const h = render({ total: 0, slices: SLICES.map((s) => ({ ...s, count: 0 })) })
    expect(h).toContain('data-empty-state')
    expect(h).toContain(DONUT_TEXT.emptyDefault)
    expect(h).toContain(DONUT_TEXT.emptyDefaultNext)
    expect(h).not.toContain('role="img"')
    expect(h).not.toContain('data-donut-legend')
  })

  it('empty מפורש גובר גם כשיש נתונים: הכותרת וה"מה יקרה" שלו מוצגות', () => {
    const h = render({ empty: { title: DONUT_TEXT.successEmpty, whatNext: DONUT_TEXT.successEmptyNext } })
    expect(h).toContain('data-empty-state')
    expect(h).toContain(DONUT_TEXT.successEmpty)
    expect(h).toContain(DONUT_TEXT.successEmptyNext)
    expect(h).not.toContain('data-donut-slice')
  })

  it('גודל מותאם: ה-svg והמרכז בגודל שהתבקש', () => {
    const h = render({ size: 120 })
    expect(h).toMatch(/<svg width="120" height="120" role="img"/)
    expect(h).toContain('width:120px;height:120px')
  })
})
