/* הלוגו של HoloAcademy. שני קבצים ב-public, והם מוצגים כמו שהם: כאן משתנה רק הגודל.
     · full  הלוגו המלא: חוד העיפרון, היהלום והספר (holoacademy-logo.svg)
     · mark  האייקון: היהלום עם ה-H בלבד (holoacademy-mark.svg), לכל מקום שגובהו פחות מ-40 פיקסלים
   הלוגו מוצג רק על לבן או על לוונדר: לא על רקע כהה, לא על הפס הסגול ולא על תמונה.
   שטח נקי: רבע מרוחב הלוגו מכל צד. הוא ריפוד של הרכיב עצמו (index.css, .brand-logo);
   clear={false} רק כשהמכל כבר נותן את הרווח הזה (למשל האריח הלבן שבכותרת). */
import type { CSSProperties } from 'react'
import { BRAND_FILES, FULL_LOGO_MIN_HEIGHT, type BrandLogoVariant } from '../lib/brandFiles'

export default function BrandLogo({ variant = 'full', height, clear = true, alt = '', className, style }: {
  variant?: BrandLogoVariant
  /* גובה הלוגו: מספר בפיקסלים, או ערך CSS (למשל משתנה שמשתנה עם גודל המסך) */
  height: number | string
  clear?: boolean
  /* ריק כששם המותג כתוב לידו בטקסט */
  alt?: string
  className?: string
  style?: CSSProperties
}) {
  /* גובה מספרי קטן מדי ללוגו המלא: האייקון במקומו */
  const v: BrandLogoVariant = variant === 'full' && typeof height === 'number' && height < FULL_LOGO_MIN_HEIGHT ? 'mark' : variant
  const f = BRAND_FILES[v]
  const vars = { '--brand-h': typeof height === 'number' ? `${height}px` : height, '--brand-ratio': String(f.ratio) } as CSSProperties
  return (
    <span className={`brand-logo${clear ? '' : ' brand-logo--tight'}${className ? ` ${className}` : ''}`} data-brand-logo={v} style={{ ...vars, ...style }}>
      <img src={f.src} alt={alt} draggable={false} />
    </span>
  )
}
