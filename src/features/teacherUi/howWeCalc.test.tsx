import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HowWeCalcButton } from './HowWeCalc'

const LINES = ['שורה ראשונה של הסבר.', 'שורה שנייה של הסבר.']

describe('HowWeCalcButton — "איך חישבנו?" כחריץ אחד קבוע', () => {
  it('סגור: רק כפתור אחד עם מילה; אין חלון ואין תוכן טכני ב-DOM', () => {
    const html = renderToStaticMarkup(<HowWeCalcButton lines={LINES} />)
    expect(html).toContain('איך חישבנו?')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('data-how-we-calc-button')
    expect(html).not.toContain('role="dialog"')
    expect(html).not.toMatch(/data-how-we-calc(=|s|>)/)
    expect(html).not.toContain(LINES[0])
  })

  it('פתוח: חלון (dialog) עם התוכן, תווית, וכפתור "סגירה" גלוי; התוכן מסומן data-how-we-calc לביקורת', () => {
    const html = renderToStaticMarkup(<HowWeCalcButton lines={LINES} defaultOpen />)
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-label="איך חישבנו?"')
    expect(html).toContain('aria-expanded="true"')
    expect(html).toMatch(/data-how-we-calc(=|s|>)/)
    expect(html).toContain('סגירה')
    for (const l of LINES) expect(html).toContain(l)
  })

  it('החלון הוא שכבה מעל התוכן (position absolute) — לא דוחף נתונים — ואין בו title/hover', () => {
    const html = renderToStaticMarkup(<HowWeCalcButton lines={LINES} defaultOpen />)
    expect(html).toContain('position:absolute')
    expect(html).not.toContain('title=')
  })

  it('children מוצגים בתוך החלון, אחרי השורות', () => {
    const html = renderToStaticMarkup(<HowWeCalcButton lines={LINES} defaultOpen><p>שורת ראיה נוספת</p></HowWeCalcButton>)
    expect(html.indexOf(LINES[1])).toBeLessThan(html.indexOf('שורת ראיה נוספת'))
  })
})
