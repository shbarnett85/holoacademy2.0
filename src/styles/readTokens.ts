/* לבדיקות ולכלים בלבד: קורא את `tokens.css` ומחזיר את הטוקנים שערכם הוא צבע hex.
   כך בדיקות הניגודיות מחשבות מהמקור עצמו, בלי להעתיק ערכים. */
import css from './tokens.css?raw'

export const TOKENS_CSS: string = css

export function readHexTokens(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2].toLowerCase()
  return out
}
