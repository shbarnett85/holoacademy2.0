/* ──────────────────────────────────────────────────────────────────────────
   probePage — רץ *בתוך הדף* (page.evaluate). חייב להיות עצמאי לגמרי: בלי הפניות לחוץ מלבד opts.
   (tsx/esbuild עשוי להזריק __name(...) — מוגדר כ-shim ב-init script של ההקשר, ראו browser.ts.)
   מחזיר LayoutMetrics. בודק: נכנס במסך אחד, יעדי לחיצה קטנים, גופנים, מידע שרק ב-hover, breadcrumb.
   ────────────────────────────────────────────────────────────────────────── */
import type { LayoutMetrics } from './types.ts'

export interface ProbeOptions {
  minTarget: number
  fontFlag: number
  fontBody: number
  fitTolerance: number
  maxExamples: number
}

export const INTERACTIVE_SELECTOR = [
  'a[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea', 'summary',
  '[role="button"]', '[role="tab"]', '[role="link"]', '[role="radio"]', '[role="checkbox"]',
  '[role="menuitem"]', '[role="switch"]', '[role="option"]',
].join(',')

export function probePage(opts: ProbeOptions, interactiveSelector: string): LayoutMetrics {
  const MAX = opts.maxExamples
  const vw = window.innerWidth
  const vh = window.innerHeight
  const root = document.documentElement

  const snip = (s: string | null | undefined, n = 44): string => {
    const t = (s ?? '').replace(/\s+/g, ' ').trim()
    return t.length > n ? t.slice(0, n - 1) + '…' : t
  }
  const describe = (el: Element): string => {
    let s = el.tagName.toLowerCase()
    if (el.id) s += '#' + el.id
    const tid = el.getAttribute('data-testid')
    if (tid) s += `[data-testid=${tid}]`
    else if (typeof (el as HTMLElement).className === 'string' && (el as HTMLElement).className.trim()) {
      s += '.' + (el as HTMLElement).className.trim().split(/\s+/).slice(0, 2).join('.')
    }
    const role = el.getAttribute('role')
    if (role) s += `[role=${role}]`
    return s
  }
  const visible = (el: Element): boolean => {
    const h = el as HTMLElement
    if (typeof h.checkVisibility === 'function' && !h.checkVisibility({ checkVisibilityCSS: true })) return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  /* "מוסתר חזותית": sr-only / clip / opacity 0 / מחוץ למסך */
  const visuallyHidden = (el: Element): boolean => {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    if (r.width <= 1 || r.height <= 1) return true
    if (parseFloat(cs.opacity) === 0) return true
    if (cs.clip && /rect\(\s*0(px)?[\s,]+0(px)?[\s,]+0(px)?[\s,]+0(px)?\s*\)/.test(cs.clip)) return true
    if (cs.clipPath && /inset\(\s*(50|100)%/.test(cs.clipPath)) return true
    if (r.right < -1000 || r.bottom < -1000 || r.left > vw + 5000) return true
    return false
  }
  const ex = (el: Element, extra: Partial<{ w: number; h: number; size: number; note: string }> = {}) => ({
    selector: describe(el),
    text: snip((el as HTMLElement).innerText || el.getAttribute('aria-label') || el.getAttribute('title') || (el as HTMLInputElement).value || el.textContent),
    ...extra,
  })
  const bodyText = document.body.innerText || ''

  /* ── 1. נכנס במסך אחד? ── */
  const scrollHeight = Math.max(root.scrollHeight, document.body.scrollHeight)
  const scrollWidth = Math.max(root.scrollWidth, document.body.scrollWidth)
  const fitsOneScreen = scrollHeight <= vh + opts.fitTolerance
  const overflowPx = Math.max(0, scrollHeight - vh)
  const all = Array.from(document.body.querySelectorAll('*'))

  const overflowers: { selector: string; text: string; note?: string }[] = []
  if (!fitsOneScreen) {
    const ranked: { el: Element; bottom: number }[] = []
    for (const el of all) {
      if (!visible(el)) continue
      const cs = getComputedStyle(el)
      if (cs.position === 'fixed') continue
      const bottom = el.getBoundingClientRect().bottom + window.scrollY
      /* אלמנטים שחורגים מעבר לגובה המסמך נמצאים בתוך אזור גלילה/חיתוך פנימי — לא הם שקובעים את גובה הדף */
      if (bottom <= scrollHeight + opts.fitTolerance) ranked.push({ el, bottom })
    }
    ranked.sort((a, b) => b.bottom - a.bottom)
    /* רק אלמנטים "עלים" או קרובים לעלים: מדלגים על עטיפות שגובהן בגלל ילד שכבר ברשימה */
    const seen = new Set<Element>()
    for (const r of ranked) {
      if (overflowers.length >= 3) break
      if ([...seen].some((s) => s.contains(r.el) || r.el.contains(s))) continue
      seen.add(r.el)
      overflowers.push({ ...ex(r.el), note: `תחתית ב-${Math.round(r.bottom)}px (חלון ${vh}px)` })
    }
  }

  const innerScrollers: { selector: string; overflowPx: number }[] = []
  for (const el of all) {
    const h = el as HTMLElement
    if (h.clientHeight < 40) continue
    const cs = getComputedStyle(h)
    if (cs.overflowY !== 'auto' && cs.overflowY !== 'scroll') continue
    if (h.scrollHeight > h.clientHeight + 2 && visible(h)) innerScrollers.push({ selector: describe(h), overflowPx: h.scrollHeight - h.clientHeight })
  }
  innerScrollers.sort((a, b) => b.overflowPx - a.overflowPx)
  const tallestOverflowPx = Math.max(overflowPx, innerScrollers[0]?.overflowPx ?? 0)

  /* ── 2. יעדי לחיצה קטנים מ-44×44 ── */
  const seenTargets = new Set<Element>()
  let total = 0
  let inlineExcluded = 0
  const smallExamples: ReturnType<typeof ex>[] = []
  let smallCount = 0
  for (const el of Array.from(document.querySelectorAll(interactiveSelector))) {
    if (seenTargets.has(el)) continue
    seenTargets.add(el)
    const h = el as HTMLElement
    if (h.matches('[disabled], [aria-disabled="true"]')) continue
    let box: Element = el
    if (el instanceof HTMLInputElement && ['checkbox', 'radio', 'file'].includes(el.type)) {
      /* תיבת סימון מותאמת: ה-input מוסתר והתווית היא יעד הלחיצה */
      const lab = el.closest('label') ?? (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null)
      if (lab && visible(lab) && !visuallyHidden(lab)) box = lab
    }
    if (!visible(box) || visuallyHidden(box)) continue
    total++
    const r = box.getBoundingClientRect()
    if (r.width >= opts.minTarget - 0.5 && r.height >= opts.minTarget - 0.5) continue
    /* קישור בתוך משפט (inline בתוך טקסט רציף) — פטור כמו ב-WCAG 2.5.8 */
    if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') {
      const p = el.parentElement
      const around = ((p?.textContent ?? '').length) - ((el.textContent ?? '').length)
      if (p && around > 20) { inlineExcluded++; continue }
    }
    smallCount++
    if (smallExamples.length < MAX) smallExamples.push(ex(box, { w: Math.round(r.width), h: Math.round(r.height) }))
  }

  /* ── 3. גודל גופן מינימלי (צמתי טקסט גלויים; כל אלמנט נספר פעם אחת) ── */
  const fontEls = new Map<Element, number>()
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (!(node.nodeValue ?? '').trim()) continue
    const p = node.parentElement
    if (!p || fontEls.has(p)) continue
    const tag = p.tagName
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE' || tag === 'OPTION' || tag === 'TITLE') continue
    if (!visible(p) || visuallyHidden(p)) continue
    const size = parseFloat(getComputedStyle(p).fontSize)
    if (Number.isFinite(size)) fontEls.set(p, size)
  }
  let minFont: number | null = null
  let below14 = 0
  let below16 = 0
  const fontRanked: { el: Element; size: number }[] = []
  for (const [el, size] of fontEls) {
    if (minFont === null || size < minFont) minFont = size
    if (size < opts.fontFlag) below14++
    if (size < opts.fontBody) below16++
    if (size < opts.fontBody) fontRanked.push({ el, size })
  }
  fontRanked.sort((a, b) => a.size - b.size)
  const fontExamples = fontRanked.slice(0, MAX).map(({ el, size }) => ({ ...ex(el, { size }), text: snip(Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join(' ')) }))

  /* ── 4. מידע שמופיע רק ב-hover (title) ── */
  let hoverControls = 0
  let hoverInfo = 0
  const hoverExamples: ReturnType<typeof ex>[] = []
  for (const el of Array.from(document.querySelectorAll('[title]'))) {
    const title = (el.getAttribute('title') ?? '').trim()
    if (!title || !visible(el) || visuallyHidden(el)) continue
    const text = ((el as HTMLElement).innerText ?? '').trim()
    if (el.matches(interactiveSelector)) {
      /* כפתור/קישור שה-title הוא הטקסט היחיד שלו (אייקון בלבד) */
      const ownText = text || (el instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(el.type) ? el.value : '')
      if (!ownText) {
        hoverControls++
        if (hoverExamples.length < MAX) hoverExamples.push(ex(el, { note: `title="${snip(title, 60)}" הוא הטקסט היחיד של הפקד` }))
      }
    } else if (!bodyText.includes(title) && title.length > text.length + 12) {
      /* ה-title מוסיף מידע שלא מופיע בגלוי בשום מקום בדף */
      hoverInfo++
      if (hoverExamples.length < MAX) hoverExamples.push(ex(el, { note: `מידע רק ב-hover: "${snip(title, 70)}"` }))
    }
  }

  /* ── 5. אלמנטים לחיצים בלי תפקיד סמנטי (div עם cursor:pointer) ── */
  const clickEx: ReturnType<typeof ex>[] = []
  let clickCount = 0
  for (const el of all) {
    if (el.matches(interactiveSelector) || el.closest(interactiveSelector)) continue
    if (el.tagName === 'LABEL' || el.closest('label')) continue
    const cs = getComputedStyle(el)
    if (cs.cursor !== 'pointer') continue
    const parent = el.parentElement
    if (parent && getComputedStyle(parent).cursor === 'pointer') continue
    if (!visible(el) || visuallyHidden(el)) continue
    clickCount++
    if (clickEx.length < MAX) clickEx.push(ex(el))
  }

  /* ── 6. breadcrumb ── */
  const crumbSel = '[data-breadcrumb], nav[aria-label*="breadcrumb" i], nav[aria-label*="פירורי"], nav[aria-label*="נתיב"], nav[aria-label*="מיקום"], .breadcrumb, .breadcrumbs, ol[class*="breadcrumb" i]'
  let breadcrumb: LayoutMetrics['breadcrumb'] = { present: false, via: null, text: null }
  for (const el of Array.from(document.querySelectorAll(crumbSel))) {
    if (visible(el) && !visuallyHidden(el) && ((el as HTMLElement).innerText ?? '').trim()) {
      breadcrumb = { present: true, via: 'attr', text: snip((el as HTMLElement).innerText, 100), fullText: snip((el as HTMLElement).innerText, 300) }
      break
    }
  }
  if (!breadcrumb.present) {
    /* היוריסטיקה: אלמנט גלוי בראש הדף עם ≥2 מקטעים מופרדים ב-› ‹ » « / */
    for (const el of all) {
      const r = el.getBoundingClientRect()
      if (r.top > 260 || r.height > 120 || r.width === 0) continue
      if (el.children.length > 12) continue
      const t = ((el as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim()
      if (t.length < 5 || t.length > 160) continue
      if (!/[›‹»«]/.test(t) && !/\s\/\s/.test(t)) continue
      const parts = t.split(/\s*[›‹»«]\s*|\s+\/\s+/).filter(Boolean)
      if (parts.length >= 2 && visible(el)) { breadcrumb = { present: true, via: 'heuristic', text: snip(t, 100), fullText: snip(t, 300) }; break }
    }
  }

  const h1s = Array.from(document.querySelectorAll('h1')).filter((h) => visible(h))
  return {
    innerWidth: vw, innerHeight: vh, scrollHeight, scrollWidth,
    fitsOneScreen, overflowPx,
    horizontalOverflow: scrollWidth > vw + opts.fitTolerance,
    overflowers: overflowers.map((o) => ({ selector: o.selector, text: o.text, note: o.note })),
    innerScrollers: innerScrollers.slice(0, 5),
    tallestOverflowPx,
    smallTargets: { count: smallCount, total, inlineExcluded, examples: smallExamples },
    fonts: { min: minFont, below14, below16, textElements: fontEls.size, examples: fontExamples },
    hoverOnly: { controls: hoverControls, info: hoverInfo, examples: hoverExamples },
    clickableNonSemantic: { count: clickCount, examples: clickEx },
    breadcrumb,
    headings: {
      h1: h1s.length,
      firstH1: h1s[0] ? snip((h1s[0] as HTMLElement).innerText, 80) : null,
      /* טקסט מלא של כל ה-h1 הגלויים — "השאלה שהמסך עונה עליה" בצ'קליסט */
      texts: h1s.slice(0, 5).map((h) => snip((h as HTMLElement).innerText, 300)).filter(Boolean),
    },
  }
}

/* innerText של ה-body, ללא צאצאי [data-how-we-calc] (מסתירים זמנית כדי שהחישוב יכבד את ה-CSS) */
export function bodyTextWithoutHowWeCalc(attr: string): string {
  const els = Array.from(document.querySelectorAll<HTMLElement>(`[${attr}]`))
  const saved = els.map((e) => ({ v: e.style.getPropertyValue('display'), p: e.style.getPropertyPriority('display') }))
  els.forEach((e) => e.style.setProperty('display', 'none', 'important'))
  const text = document.body.innerText || ''
  els.forEach((e, i) => {
    if (saved[i].v) e.style.setProperty('display', saved[i].v, saved[i].p)
    else e.style.removeProperty('display')
  })
  return text
}
