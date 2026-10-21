/* ──────────────────────────────────────────────────────────────────────────
   ייצוא והדפסה של הסיכום המילולי. מסמך HTML עם dir=rtl ש-Word פותח כ-.doc (בלי תלות חיצונית), ואותו מסמך מודפס מ-iframe נסתר.
   · הצבעים במסמך הם **ערכים הקסדצימליים ליטרליים**. ב-Word (וב-iframe) אין משתני CSS של האתר: var(--tN) לא היה מתורגם והצבעים אבדו.
   · הכותרת (שם התלמיד/ה/הכיתה/ההדמיה) מגיעה מהמסך — לעולם לא מהבינה המלאכותית. כל טקסט עובר escape.
   · המיוצא הוא הטקסט שמוצג: אחרי עריכת המורה. שורת "נוצר בעזרת בינה מלאכותית (ונערך על ידי המורה)" לפי מי כתב ואם נערך.
   · הטקסטים: findingsNarrative (AI_SUMMARY_TEXT / AI_SUMMARY_PANEL_TEXT).
   ────────────────────────────────────────────────────────────────────────── */
import { AI_SUMMARY_PANEL_TEXT, AI_SUMMARY_TEXT } from '../../shared/lib/findingsNarrative'
import type { SummaryScope } from '../../shared/types/aiSummaryV1'

export interface SummaryDocInput {
  scope: SummaryScope
  /** שם התלמיד/ה, הכיתה או ההדמיה — מהמסך. ריק: הכותרת היא שם ההיקף בלבד */
  name: string
  /** הפסקאות המוצגות (אחרי עריכה) */
  paragraphs: readonly string[]
  writtenBy: 'ai' | 'template'
  edited: boolean
  demo: boolean
  basisText: string
  caveat: string
  /** ברירת מחדל: עכשיו */
  date?: Date
}

/* צבעי המסמך — ליטרליים בכוונה (ראו למעלה) */
export const DOC_COLORS = { text: '#1a2433', heading: '#14213d', soft: '#5b677a', rule: '#c7d0dc' } as const

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
/* סימן סדר-בתים (UTF-8): כדי ש-Word יזהה את הקידוד */
const BOM = String.fromCharCode(0xfeff)

export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c])

export const formatDocDate = (d: Date): string => d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })

/** התאריך המוצג בפאנל ("נכתב ב-…"), מחותמת זמן של השרת */
export function formatSummaryDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : formatDocDate(d)
}

/** שורת הייצוא לפי מי כתב ואם נערך: הדגמה / תבנית / ב-AI / ב-AI ונערך */
export function exportLineOf(i: Pick<SummaryDocInput, 'writtenBy' | 'edited' | 'demo'>): string {
  const L = AI_SUMMARY_TEXT.exportLine
  if (i.demo) return L.demo
  if (i.writtenBy === 'template') return L.template
  return i.edited ? L.aiEdited : L.ai
}

export const docTitleOf = (i: Pick<SummaryDocInput, 'scope' | 'name'>): string =>
  AI_SUMMARY_PANEL_TEXT.doc.title(AI_SUMMARY_TEXT.headingByScope[i.scope], i.name.trim())

/** שם הקובץ: "סיכום מילולי - <שם>" בלי תווים שאסורים בשמות קבצים. השם בלי ההיקף: הלוכסן ב"התלמיד/ה" היה נמחק והמילה הייתה הופכת לצורת נקבה */
export const summaryFileName = (i: Pick<SummaryDocInput, 'name'>): string =>
  `${[AI_SUMMARY_TEXT.heading, i.name.trim()].filter(Boolean).join(' - ').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim()}.doc`

export function buildSummaryDocument(i: SummaryDocInput): string {
  const title = docTitleOf(i)
  const date = formatDocDate(i.date ?? new Date())
  const C = DOC_COLORS
  const paras = i.paragraphs.map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`).join('\n')
  return `<!DOCTYPE html>
<html dir="rtl" lang="he" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
body { font-family: Arial, 'Segoe UI', sans-serif; direction: rtl; text-align: right; color: ${C.text}; margin: 40px; }
.brand { font-size: 10pt; color: ${C.soft}; margin: 0 0 4pt 0; }
h1 { font-size: 18pt; color: ${C.heading}; margin: 0 0 4pt 0; }
.meta { font-size: 10pt; color: ${C.soft}; margin: 0 0 14pt 0; padding-bottom: 8pt; border-bottom: 1px solid ${C.rule}; }
p { font-size: 12pt; line-height: 1.7; margin: 0 0 10pt 0; color: ${C.text}; }
.foot { font-size: 10pt; color: ${C.soft}; margin-top: 16pt; padding-top: 8pt; border-top: 1px solid ${C.rule}; }
.foot p { font-size: 10pt; line-height: 1.5; color: ${C.soft}; margin: 0 0 4pt 0; }
</style>
</head>
<body>
<p class="brand">${escapeHtml(AI_SUMMARY_PANEL_TEXT.doc.brand)}</p>
<h1>${escapeHtml(title)}</h1>
<p class="meta">${escapeHtml(AI_SUMMARY_PANEL_TEXT.doc.createdOn(date))} · ${escapeHtml(exportLineOf(i))} · ${escapeHtml(i.basisText)}</p>
${paras}
<div class="foot"><p>${escapeHtml(i.caveat)}</p></div>
</body>
</html>`
}

/** הורדת .doc (Blob מסוג application/msword, עם BOM כדי ש-Word יזהה UTF-8) */
export function exportSummaryToWord(i: SummaryDocInput): void {
  const blob = new Blob([BOM, buildSummaryDocument(i)], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = summaryFileName(i)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** הדפסה של אותו מסמך (בערכה בהירה, בלי שאר המסך) מ-iframe נסתר */
export function printSummary(i: SummaryDocInput): void {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  frame.style.cssText = 'position:fixed;inset-inline-end:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  const cleanup = (): void => { setTimeout(() => frame.remove(), 500) }
  frame.onload = () => {
    const w = frame.contentWindow
    if (!w) { cleanup(); return }
    w.addEventListener('afterprint', cleanup)
    w.focus()
    w.print()
    /* אם הדפדפן לא מדווח afterprint — מנקים בכל מקרה */
    setTimeout(cleanup, 60_000)
  }
  frame.srcdoc = buildSummaryDocument(i)
  document.body.appendChild(frame)
}
