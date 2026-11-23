import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import BrandLogo from './BrandLogo'
import { BRAND_FILES, FULL_LOGO_MIN_HEIGHT } from '../lib/brandFiles'

const html = (el: React.ReactElement) => renderToStaticMarkup(el)
/* הקבצים שב-public, כטקסט ובשמות בלבד (בלי Node: הבדיקה רצה בסביבת הלקוח) */
const SVG = import.meta.glob('/public/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const PUBLIC = Object.keys(import.meta.glob(['/public/*', '/public/holo-mono/**'], { query: '?url', import: 'default' }))
const existsSync = (p: string) => PUBLIC.some((k) => k === `/${p}` || k.startsWith(`/${p}/`))
const viewBox = (file: string) => /viewBox="([^"]+)"/.exec(SVG[`/public${file}`])![1].split(/\s+/).map(Number)

describe('BrandLogo', () => {
  it('הלוגו המלא והאייקון מוצגים מהקבצים שב-public, כמו שהם', () => {
    expect(html(<BrandLogo height={64} />)).toContain('src="/holoacademy-logo.svg"')
    expect(html(<BrandLogo variant="mark" height={26} />)).toContain('src="/holoacademy-mark.svg"')
    for (const f of Object.values(BRAND_FILES)) expect(existsSync(`public${f.src}`), f.src).toBe(true)
  })
  it('היחס שבקוד הוא היחס של ה-viewBox שבקובץ (הפרופורציות לא משתנות)', () => {
    for (const f of Object.values(BRAND_FILES)) {
      const [, , w, h] = viewBox(f.src)
      expect(f.ratio).toBeCloseTo(w / h, 6)
    }
  })
  it('מתחת ל-40 פיקסלים מוצג האייקון ולא הלוגו המלא', () => {
    expect(FULL_LOGO_MIN_HEIGHT).toBe(40)
    expect(html(<BrandLogo height={39} />)).toContain('data-brand-logo="mark"')
    expect(html(<BrandLogo height={40} />)).toContain('data-brand-logo="full"')
  })
  it('השטח הנקי הוא ברירת המחדל; clear={false} רק כשהמכל נותן אותו', () => {
    expect(html(<BrandLogo height={64} />)).not.toContain('brand-logo--tight')
    expect(html(<BrandLogo variant="mark" height={26} clear={false} />)).toContain('brand-logo--tight')
  })
  it('קובצי הלוגו הישנים נמחקו', () => {
    for (const old of ['holoacademy-logo.png', 'holo-transparent-for-light-backgrounds.svg', 'holo-mono']) expect(existsSync(`public/${old}`), old).toBe(false)
  })
})
