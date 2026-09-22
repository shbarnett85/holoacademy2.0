/* ── Cloudflare Turnstile — אימות אנושי בלתי-נראה ────────────────────────────
   נטען רק כש-VITE_TURNSTILE_SITE_KEY מוגדר. הרנדר בלתי-נראה (widget מסוג
   invisible בלוח של Cloudflare) — למשתמש רגיל אין שום שלב גלוי: הטוקן נאסף
   ברקע ומצורף לבקשת היצירה, והשרת מאמת אותו לפני קריאת ה-AI.
   כשל/‏timeout ⇒ null — לא חוסמים אדם על תקלת צד-שלישי (השרת מכריע). */

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; callback: (t: string) => void; 'error-callback'?: () => void }) => string
      reset: (id: string) => void
      execute?: (id: string) => void
    }
  }
}

const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim()

let scriptP: Promise<void> | null = null
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  scriptP ??= new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.onload = () => res()
    s.onerror = () => rej(new Error('turnstile load failed'))
    document.head.appendChild(s)
  })
  return scriptP
}

export async function getTurnstileToken(timeoutMs = 5000): Promise<string | null> {
  if (!SITE_KEY) return null
  try {
    await loadScript()
    return await new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs)
      const host = document.createElement('div')
      host.style.cssText = 'position:fixed;left:-9999px;bottom:0'
      document.body.appendChild(host)
      const done = (t: string | null) => { clearTimeout(timer); host.remove(); resolve(t) }
      try {
        window.turnstile!.render(host, {
          sitekey: SITE_KEY,
          callback: (t) => done(t),
          'error-callback': () => done(null),
        })
      } catch { done(null) }
    })
  } catch {
    return null
  }
}
