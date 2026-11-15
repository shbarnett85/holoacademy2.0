/* מייצר את --page-background (רשת הפיקסלים) ב-src/styles/tokens.css מתוך הטוקנים. להריץ אחרי שינוי של צבע רקע/מכונה/הולו/אנושיות:
   npx tsx scripts/genPageBackground.ts */
import { readFileSync, writeFileSync } from 'node:fs'
import { PAGE_BG_LINE, pageBackgroundCss, paletteFromTokens } from '../src/styles/pageBackground.ts'

const file = 'src/styles/tokens.css'
const css = readFileSync(file, 'utf8')
if (!PAGE_BG_LINE.test(css)) throw new Error('--page-background line not found')
const next = css.replace(PAGE_BG_LINE, `  --page-background: ${pageBackgroundCss(paletteFromTokens(css))};`)
writeFileSync(file, next)
console.log(next === css ? 'עדכני' : 'עודכן', file)
