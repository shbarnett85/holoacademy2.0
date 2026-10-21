/* ── קבלה חיה (ידנית, מחוץ ל-vitest): שירות הסיכום המילולי מול מודל אמיתי ─────────────────────────────────
   מריץ את השירות האמיתי (פרומפט + מודל לפי engineFor('summary') + שומר פלט + ניסיון חוזר + תבנית) על 8 קלטים מייצגים
   מ**עולם ההדגמה הסינתטי בלבד** (אין DB, אין נתוני אמת, אין שמות — העובדות אנונימיות כבר בהקרנה), ומדפיס:
     · שיעור מעבר השומר: בניסיון ראשון / אחרי ניסיון חוזר / נפילה לתבנית (וכמה מהנפילות הן כשל טכני של המודל)
     · הפרות שנצפו לפי סוג (בניסיון הראשון ובסך הכול) — כדי לדעת אם הפרומפט חלש או שהשומר מחמיר מדי
     · גודל הפרומפט לכל קלט
   המפתחות נקראים מ-env בלבד (server/.env) ולעולם לא מודפסים. עלות: 8 קריאות קטנות (+ ניסיונות חוזרים).
   הרצה:  npm run ai-summary:accept            (מוסיפים --show להדפסת הפסקאות שנכתבו — נתוני הדגמה בלבד)
   קוד יציאה: 0 = רץ; 2 = אין מודל זמין (אין מפתח) — לא ממציאים תוצאות.                                    */
import '../env.js'
import { demoProvider, getAnalysis } from '../lib/analyticsV2/demoProvider.js'
import { hasGeminiKey } from '../lib/gemini.js'
import { collectKnownNames, projectSource, type SummaryInput, type SummarySource } from '../lib/aiSummary/inputs.js'
import { parseAndGuard } from '../lib/aiSummary/guard.js'
import { LLM_TIMEOUT_MS, createRealLlm, type SummaryLlm, type SummaryLlmResult } from '../lib/aiSummary/llm.js'
import { buildSummaryPrompt, SUMMARY_PROMPT_VERSION } from '../lib/aiSummary/prompt.js'
import { FULL_AUDIENCE, createSummaryService } from '../lib/aiSummary/service.js'
import { createMemoryStore } from '../lib/aiSummary/store.js'
import { NOW, homeroomOf } from '../lib/aiSummary/testkit.js'
import { engineFor } from '../lib/modelRouter.js'
import { buildClassView } from '../lib/results/core.js'
import { getDemoResults } from '../lib/results/demoResults.js'
import type { SummaryTarget } from '../../../src/shared/types/aiSummaryV1.js'

const SHOW = process.argv.includes('--show')
const FALLBACK_THRESHOLD = 0.4
const CLASS_ID = 'c-v2'

/* הודעות שגיאה מודפסות רק אחרי הסרת כל מה שדומה למפתח */
const safe = (e: unknown): string => String(e instanceof Error ? `${e.name}: ${e.message}` : e).replace(/key=[^&\s]+/gi, 'key=[redacted]').replace(/(sk-ant-|sk-|AIza)[\w-]+/g, '[redacted]').slice(0, 160)

interface Attempt { system: string; user: string; text: string | null; error: string | null; model: string | null; ms: number }

/* עוטף את המודל האמיתי ומתעד כל ניסיון (טקסט גולמי או שגיאה) — כדי להעריך את השומר אחר כך ללא קריאה נוספת */
function recording(inner: SummaryLlm): { llm: SummaryLlm; attempts: Attempt[] } {
  const attempts: Attempt[] = []
  return {
    attempts,
    llm: {
      async generate(req): Promise<SummaryLlmResult> {
        const t0 = Date.now()
        try {
          const res = await inner.generate(req)
          attempts.push({ system: req.system, user: req.user, text: res.text, error: null, model: res.model, ms: Date.now() - t0 })
          return res
        } catch (e) {
          attempts.push({ system: req.system, user: req.user, text: null, error: safe(e), model: null, ms: Date.now() - t0 })
          throw e
        }
      },
    },
  }
}

interface Case { label: string; target: SummaryTarget; source: SummarySource }

async function buildCases(): Promise<Case[]> {
  const a = getAnalysis(NOW)
  const hr = homeroomOf(CLASS_ID)
  const cases: Case[] = []
  for (const [cast, label] of [['tamar', 'student: decline in several subjects'], ['alon', 'student: decline in one subject'], ['maya', 'student: improving'], ['noa', 'student: high in one subject, low in another']] as const) {
    const st = a.world.students.find((s) => s.cast === cast)
    if (!st) throw new Error(`persona ${cast} missing from the demo world`)
    const overview = (await demoProvider.student(hr, st.id)).data
    cases.push({ label, target: { scope: 'student', id: st.id }, source: { scope: 'student', overview, gender: st.gender } })
  }
  cases.push({ label: 'class: overview of the homeroom class', target: { scope: 'class', id: CLASS_ID }, source: { scope: 'class', overview: (await demoProvider.classOverview(hr, CLASS_ID)).data } })
  cases.push({ label: 'class_subject: math in the homeroom class', target: { scope: 'class_subject', id: CLASS_ID, subject: 'math' }, source: { scope: 'class_subject', view: (await demoProvider.classSubject(hr, CLASS_ID, 'math')).data } })
  /* שתי הגשות של הכיתה, ממקצועות שונים, עם הכי הרבה תלמידים שסיימו */
  const subs = getDemoResults(NOW).submissions.filter((s) => s.def.classId === CLASS_ID)
    .map((s) => ({ s, view: buildClassView(s.input) }))
    .sort((x, y) => y.view.head.counts.completed - x.view.head.counts.completed)
  const seenSubjects = new Set<string>()
  for (const { s, view } of subs) {
    if (seenSubjects.has(s.quest.subject) || cases.filter((c) => c.target.scope === 'submission').length >= 2) continue
    seenSubjects.add(s.quest.subject)
    cases.push({ label: `submission: ${s.quest.subject} (${view.head.counts.completed} completed)`, target: { scope: 'submission', id: s.def.id }, source: { scope: 'submission', view } })
  }
  return cases
}

const codeOf = (v: { code: string; detail: string }): string => (v.detail && !/^\d+(\.\d+)?$/.test(v.detail) ? `${v.code}(${v.detail})` : v.code)
const tally = (xs: string[]): Record<string, number> => xs.reduce<Record<string, number>>((m, x) => { m[x] = (m[x] ?? 0) + 1; return m }, {})
const pct = (n: number, d: number): string => (d === 0 ? '-' : `${Math.round((n / d) * 100)}%`)

async function main(): Promise<void> {
  const engine = engineFor('summary')
  const haveKey = engine === 'gemini' ? hasGeminiKey() : !!process.env.ANTHROPIC_API_KEY?.trim()
  console.log(`ai-summary acceptance  engine=${engine}  key=${haveKey ? 'present' : 'MISSING'}  prompt=${SUMMARY_PROMPT_VERSION}  timeout=${LLM_TIMEOUT_MS / 1000}s  data=synthetic demo world only`)
  if (!haveKey) {
    console.log('NO_LLM: no API key for the selected engine in server/.env - nothing was run (no results are fabricated).')
    process.exitCode = 2
    return
  }

  const cases = await buildCases()
  const rows: { label: string; outcome: string; attempts: number; promptChars: number; facts: number; first: string[]; second: string[]; cited: number[]; model: string | null; seconds: number }[] = []
  const allViolations: string[] = []
  const firstViolations: string[] = []

  for (const c of cases) {
    const input: SummaryInput = projectSource(c.source)
    const names = collectKnownNames(c.source)
    const { llm, attempts } = recording(createRealLlm())
    const logs: string[] = []
    const service = createSummaryService({ llm, store: createMemoryStore(), dailyCap: 1000, regenerateCooldownMs: 0, demoLlm: false, log: (m) => logs.push(m) })
    const res = await service.generate({ viewer: { userId: 'accept', demo: false }, target: c.target, audienceKey: FULL_AUDIENCE, load: async () => c.source })
    const summary = res.data.summary
    const violationsOf = (a: Attempt | undefined): string[] => (a?.text ? parseAndGuard(a.text, input, { knownNames: names }).violations.map(codeOf) : [])
    const [a1, a2] = attempts
    const cited = a1?.text ? parseAndGuard(a1.text, input, { knownNames: names }).cited.map((ids) => ids.length) : []
    const first = violationsOf(a1)
    const second = violationsOf(a2)
    firstViolations.push(...first)
    allViolations.push(...first, ...second)
    const outcome = !summary ? `no_summary(${res.data.eligibility.ok ? 'unexpected' : 'not_eligible'})`
      : summary.writtenBy === 'ai' ? (attempts.length === 1 ? 'first_try' : 'after_retry')
        : attempts.some((a) => a.error) ? 'fallback_llm_error' : 'fallback_guard'
    const { system, user } = buildSummaryPrompt(input)
    rows.push({ label: c.label, outcome, attempts: attempts.length, promptChars: system.length + user.length, facts: input.facts.length, first, second, cited, model: a1?.model ?? null, seconds: Math.round(attempts.reduce((t, a) => t + a.ms, 0) / 100) / 10 })
    if (a1?.error) console.log(`  llm error (attempt 1): ${a1.error}`)
    if (SHOW && summary) console.log(`  [${summary.writtenBy}] ${summary.paragraphs.join('\n  ')}`)
  }

  console.log('\ncase                                              outcome              tries  prompt-chars  facts  cited(try1)  seconds  violations(try1) -> (try2)')
  for (const r of rows) {
    console.log(`${r.label.padEnd(49)} ${r.outcome.padEnd(20)} ${String(r.attempts).padStart(5)}  ${String(r.promptChars).padStart(12)}  ${String(r.facts).padStart(5)}  ${(r.cited.join('/') || '-').padStart(11)}  ${String(r.seconds).padStart(7)}  ${r.first.join(',') || '-'}${r.attempts > 1 ? ' -> ' + (r.second.join(',') || '-') : ''}`)
  }

  const n = rows.length
  const count = (o: string): number => rows.filter((r) => r.outcome === o).length
  const fallbacks = rows.filter((r) => r.outcome.startsWith('fallback')).length
  console.log(`\nguard pass rate over ${n} inputs`)
  console.log(`  first try        : ${count('first_try')}/${n} (${pct(count('first_try'), n)})`)
  console.log(`  after retry      : ${count('after_retry')}/${n} (${pct(count('after_retry'), n)})`)
  console.log(`  fallback template: ${fallbacks}/${n} (${pct(fallbacks, n)})  [guard rejection: ${count('fallback_guard')}, model/technical failure: ${count('fallback_llm_error')}]`)
  console.log(`  other            : ${n - count('first_try') - count('after_retry') - fallbacks}`)
  console.log(`violations seen on the first try: ${JSON.stringify(tally(firstViolations))}`)
  console.log(`violations seen on all tries    : ${JSON.stringify(tally(allViolations))}`)
  const chars = rows.map((r) => r.promptChars)
  console.log(`prompt size (system+user chars): min ${Math.min(...chars)}, max ${Math.max(...chars)}, avg ${Math.round(chars.reduce((s, x) => s + x, 0) / n)}; model: ${[...new Set(rows.map((r) => r.model).filter(Boolean))].join(', ') || '-'}`)
  const verdict = fallbacks / n > FALLBACK_THRESHOLD ? `FALLBACK RATE ABOVE ${FALLBACK_THRESHOLD * 100}% - analyze the violations above (prompt.ts or the guard)` : `fallback rate within ${FALLBACK_THRESHOLD * 100}%`
  console.log(`verdict: ${verdict}`)
}

main().catch((e) => { console.error('ai-summary acceptance crashed:', safe(e)); process.exitCode = 1 })
