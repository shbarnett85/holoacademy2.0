/* צילומי דוגמאות של תוויות Space Mono (שלב 0 של העיצוב החדש). כלי בדיקה בלבד. */
import path from 'node:path'
import { chromium } from 'playwright-core'
import { findChrome, DEFAULT_API, DEFAULT_BASE } from '../lib/config.ts'
import { guestLogin } from '../lib/login.ts'

const out = process.argv[2] ?? 'reports/redesign/font'
const session = await guestLogin(DEFAULT_API)
const browser = await chromium.launch({ executablePath: findChrome(), headless: true })
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 2, locale: 'he-IL' })
await ctx.addInitScript(`(() => { try {
  sessionStorage.setItem('holo_splash_seen','1');
  localStorage.setItem('holo_staff_session', ${JSON.stringify(JSON.stringify(session))});
} catch (e) {} })()`)
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
await cdp.send('DOM.enable'); await cdp.send('CSS.enable')

async function probe(name: string, url: string, wait: string) {
  await page.goto(DEFAULT_BASE + url, { waitUntil: 'networkidle' })
  await page.waitForSelector(wait, { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(1200)
  await page.screenshot({ path: path.join(out, `${name}-full.png`) })
  const els = await page.evaluate(() => {
    const res: { i: number; text: string; rect: number[]; size: string }[] = []
    let i = 0
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent ?? '').join('').trim()
      if (!own) continue
      const cs = getComputedStyle(el)
      if (!/space mono/i.test(cs.fontFamily.split(',')[0])) continue
      const r = el.getBoundingClientRect()
      if (r.width < 4 || r.height < 4) continue
      el.setAttribute('data-mono-probe', String(i))
      res.push({ i, text: own.slice(0, 60), rect: [r.x, r.y, r.width, r.height], size: cs.fontSize })
      i++
    }
    return res
  })
  const rows: string[] = []
  for (const e of els.slice(0, 40)) {
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 })
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-mono-probe="${e.i}"]` })
    let fonts = '?'
    if (nodeId) {
      const f = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
      fonts = f.fonts.map((x) => `${x.familyName}×${x.glyphCount}`).join(', ')
    }
    rows.push(`${name}\t${e.size}\t${fonts}\t${e.text}`)
  }
  console.log(rows.join('\n'))
  return els
}

await probe('creator', '/creator', 'text=שיעור חדש')
await probe('students', '/manage/students', 'table, [role=table], text=קוד')
await probe('manage', '/manage', 'text=כיתות')
await ctx.clearCookies()
await page.evaluate(() => localStorage.removeItem('holo_staff_session'))
await probe('home', '/', 'text=התנסו')
await browser.close()
