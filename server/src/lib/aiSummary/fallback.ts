/* ──────────────────────────────────────────────────────────────────────────
   fallback — תבנית דטרמיניסטית לסיכום: בלי AI, מאותן עובדות. משמשת (1) חשבון הדגמה/אורח, (2) כשהמודל נכשל או הפלט נפסל בשומר.
   אותו קלט תמיד נותן אותו טקסט. כל הניסוח מגיע מ-findingsNarrative (AI_SUMMARY_TEXT.template) ומטקסט העובדות — אין כאן משפטים.
   מבנה: פסקת פתיח (גודל המדגם + העובדות המרכזיות), "מה שבולט לטובה", "מה כדאי לבדוק" + צעד אחד.
   ────────────────────────────────────────────────────────────────────────── */
import { AI_SUMMARY_TEXT, aiTemplateOpening } from '../../../../src/shared/lib/findingsNarrative.js'
import type { Fact, FactKind, SummaryInput } from './inputs.js'

const OVERVIEW_KINDS: ReadonlySet<FactKind> = new Set<FactKind>(['level', 'count', 'distribution'])
const PER_PARAGRAPH = 3
const MAX_CHARS = 900

const join = (lead: string, facts: Fact[], tail = ''): string => [lead, ...facts.map((f) => f.text), tail].filter((s) => s.length > 0).join(' ')

/* מקצץ עובדות מהסוף עד שהפסקה נכנסת במגבלה (דטרמיניסטי) */
function fit(lead: string, facts: Fact[], tail = ''): string {
  let n = facts.length
  let text = join(lead, facts.slice(0, n), tail)
  while (text.length > MAX_CHARS && n > 1) { n--; text = join(lead, facts.slice(0, n), tail) }
  return text
}

export function templateParagraphs(input: SummaryInput): string[] {
  const T = AI_SUMMARY_TEXT.template
  const opening = aiTemplateOpening(input.scope, input.sampleUnit, input.sampleSize)
  const overview = input.facts.filter((f) => OVERVIEW_KINDS.has(f.kind)).slice(0, PER_PARAGRAPH)
  const used = new Set(overview.map((f) => f.id))
  const rest = input.facts.filter((f) => !used.has(f.id))
  const positive = rest.filter((f) => f.tone === 'positive').slice(0, PER_PARAGRAPH)
  const attention = rest.filter((f) => f.tone === 'attention').slice(0, PER_PARAGRAPH)

  const out: string[] = [fit(opening, overview)]
  if (positive.length) out.push(fit(T.strengthsLead, positive))
  out.push(attention.length ? fit(T.attentionLead, attention, T.step[input.scope]) : `${T.nothingToCheck} ${T.step[input.scope]}`)
  return out
}
