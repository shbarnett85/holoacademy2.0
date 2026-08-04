/* בונה מחדש את מחרוזת LIGHT ב-public/theme.js מתוך פלטת DARK שבאותו קובץ.
   DARK מחזיקה את הערכים המקוריים, ולכן היא מקור-האמת — אפשר לכייל את כללי
   המיפוי ולהריץ שוב בלי לגעת ב-JSX ובלי לשנות מספור טוקנים.
   הרצה: node relight.mjs <path-to-theme.js> */
import { readFileSync, writeFileSync } from 'node:fs'

const P = process.argv[2]
let src = readFileSync(P, 'utf8')

const m = src.match(/var DARK = ("(?:[^"\\]|\\.)*")/)
if (!m) { console.error('DARK not found'); process.exit(1) }
const DARK = JSON.parse(m[1])

function parseColor(c) {
  let x
  if ((x = c.match(/^#([0-9a-fA-F]{3,8})$/))) {
    let h = x[1]
    if (h.length === 3 || h.length === 4) h = h.split('').map((y) => y + y).join('')
    return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16),
             a: h.length >= 8 ? parseInt(h.slice(6,8),16)/255 : 1 }
  }
  if ((x = c.match(/^rgba?\(([^)]+)\)$/))) {
    const p = x[1].split(',').map((s) => parseFloat(s.trim()))
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
  }
  return null
}
function rgbToHsl(r,g,b){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b);let h=0,s=0;const l=(mx+mn)/2;
  if(mx!==mn){const d=mx-mn;s=l>.5?d/(2-mx-mn):d/(mx+mn);
    if(mx===r)h=(g-b)/d+(g<b?6:0);else if(mx===g)h=(b-r)/d+2;else h=(r-g)/d+4;h*=60}
  return {h:Math.round(h),s:s*100,l:l*100}}
const round=(n,d=1)=>Math.round(n*10**d)/10**d
const clampA=(a)=>Math.max(0,Math.min(1,a))
const hsl=(h,s,l,a)=>a>=.999?`hsl(${h} ${round(s)}% ${round(l)}%)`:`hsl(${h} ${round(s)}% ${round(l)}% / ${round(a,3)})`

const INK='hsl(214 42% 15%)', MIDGREY='hsl(212 24% 42%)'
/* כיול: ציאן/ירוק בהירים מטבעם, ולכן L=30% לא הגיע ל-4.5:1 על לבן (נמדד 3.4-3.6).
   L נמוך יותר למבטאים שמשמשים כטקסט; זוהר/מסגרות נשארים בהירים (לא טקסט). */
const L_ACCENT_OPAQUE = 24
const L_ACCENT_TEXT   = 21
const L_ACCENT_GLOW   = 36

function toLight(color) {
  const p = parseColor(color); if (!p) return null
  const { h, s, l } = rgbToHsl(p.r, p.g, p.b)
  const a = p.a
  const chroma = (Math.max(p.r,p.g,p.b) - Math.min(p.r,p.g,p.b)) / 255
  const colorful = chroma >= 0.22

  if (l < 22) {
    if (a < 1) return `hsl(0 0% 100% / ${round(clampA(a*1.18),3)})`
    return hsl(h, Math.min(s,12), 96.5, 1)
  }
  if (colorful) {
    if (a < 1) {
      return a >= 0.5 ? hsl(h, Math.max(s,60), L_ACCENT_TEXT, clampA(a*1.3))
                      : hsl(h, Math.max(s,55), L_ACCENT_GLOW, clampA(a*1.45))
    }
    return hsl(h, Math.max(s,62), L_ACCENT_OPAQUE, 1)
  }
  if (a < 1) return hsl(214, 30, 22, clampA(a*1.1))
  if (l >= 78) return INK
  return MIDGREY
}

const out = []
for (const pair of DARK.split(';')) {
  const i = pair.indexOf(':')
  const name = pair.slice(0, i), val = pair.slice(i + 1)
  out.push(`${name}:${toLight(val) ?? val}`)
}
src = src.replace(/var LIGHT = ("(?:[^"\\]|\\.)*")/, 'var LIGHT = ' + JSON.stringify(out.join(';')))
writeFileSync(P, src, 'utf8')
console.log('LIGHT rebuilt from DARK:', out.length, 'tokens')
