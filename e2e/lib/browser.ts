/* ──────────────────────────────────────────────────────────────────────────
   Chrome (מותקן) דרך playwright-core + הקשר דפדפן לפי (מי × viewport × ערכה).
   ────────────────────────────────────────────────────────────────────────── */
import { chromium, type Browser, type BrowserContext } from 'playwright-core'
import { findChrome } from './config.ts'
import type { StaffSession } from './login.ts'

export async function launchBrowser(headed: boolean): Promise<Browser> {
  return chromium.launch({
    executablePath: findChrome(),
    headless: !headed,
    args: ['--disable-features=Translate', '--no-first-run', '--no-default-browser-check'],
  })
}

export interface ContextOptions {
  viewport: { width: number; height: number }
  theme: 'light' | 'dark'
  session: StaffSession | null
}

/* init script (רץ לפני כל סקריפט בכל ניווט):
   · __name — tsx/esbuild מזריק __name(fn,"x") לפונקציות שמסריאלזים ל-page.evaluate; ללא shim זו ReferenceError.
   · holo-theme — ערכה מפורשת (בהירה כברירת מחדל בביקורת; --dark לכהה).
   · holo_splash_seen — מדלג על ספלאש הפתיחה.
   · holo_staff_session — כניסת הצוות (אותו פורמט כמו shared/lib/staffSession.ts). */
function initScript(o: ContextOptions): string {
  const session = o.session ? JSON.stringify(o.session) : 'null'
  return `(() => {
  if (!window.__name) window.__name = (f) => f;
  try {
    localStorage.setItem('holo-theme', ${JSON.stringify(o.theme)});
    sessionStorage.setItem('holo_splash_seen', '1');
    var s = ${JSON.stringify(session)};
    if (s && s !== 'null') localStorage.setItem('holo_staff_session', s);
  } catch (e) {}
})()`
}

export async function newContext(browser: Browser, o: ContextOptions): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: o.viewport,
    screen: o.viewport,
    deviceScaleFactor: 1,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    reducedMotion: 'reduce',
    colorScheme: o.theme,
    ignoreHTTPSErrors: true,
  })
  await ctx.addInitScript(initScript(o))
  return ctx
}
