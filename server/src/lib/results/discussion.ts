/* Discussion questions for a common mistake ("שאלה לדיון בכיתה", the results screen).
   The teacher asked for real, varied questions instead of one fixed generic question, so the questions are written by a model
   from the content itself: the question from the lesson, its correct answer, and the wrong answer several pupils chose.

   What the model gets: lesson content only. No pupil names, ids or counts ever leave the server (analytics rule 12).
   What the model may write: open questions for the class. It does not explain why pupils erred (analytics rule 1: AI never
   diagnoses a mistake), and it does not reveal the correct answer, because the screen is shown to the class.

   Every answer passes a deterministic check (checkDiscussionQuestions). A failed check gets one more attempt with the problems
   listed; after that, and whenever the model is unavailable, over quota or switched off (DISCUSSION_AI=0), the fixed varied
   questions from findingsNarrative.discussionFallback are returned. Results are cached in memory by content, so a class that
   opens the same question again, or many guests on the demo data, cost one call.

   All user-facing Hebrew lives in findingsNarrative; this file holds only the English instruction for the model. */
import { createHash } from 'node:crypto'
import { discussionFallback } from '../../../../src/shared/lib/findingsNarrative.js'
import { FORBIDDEN_CLINICAL, FORBIDDEN_JUDGMENTAL, forbiddenHits } from '../../../../src/shared/lib/forbiddenTerms.js'
import { claude } from '../claude.js'
import { scanStudentText } from '../studentAddress.js'

export interface DiscussionInput {
  question: string
  wrongText: string
  correctText: string | null
  lessonTitle?: string | null
  challengeTitle?: string | null
  subject?: string | null
  grade?: string | null
}
export interface DiscussionResult { questions: string[]; source: 'ai' | 'template' }
export interface DiscussionDeps {
  /* returns the model's raw text; throws when the model is unavailable */
  ask: (system: string, user: string) => Promise<string>
  now: () => number
}

/* maxWords is the hard limit of the check; the model is asked for 24, and a question a little over that is still fine to read */
export const DISCUSSION_LIMITS = { perUserPerMinute: 6, perDay: 600, cacheSize: 400, maxWords: 34, maxChars: 230, minChars: 12 } as const

const SYSTEM = `You help a teacher run a short class discussion after a lesson. You get one question from the lesson, its correct answer, and one wrong answer that several pupils chose. Write exactly 3 discussion questions in Hebrew that the teacher will show to the whole class.

Rules:
- Every question is about THIS content: it uses the actual numbers, terms, people or objects from the question and the answers. A question that could be asked about any other question (for example "how did they get this answer?" or "what would you say to someone who chose it?") is not allowed.
- Three different kinds, in this order: (1) a question that makes the pupils test the chosen answer with a concrete case, a drawing or an everyday example; (2) a question that compares or contrasts two things from the content; (3) a question that takes the same idea to a new case and asks what would happen there.
- Do not say which answer is correct, do not write the correct answer anywhere unless the lesson's question itself contains it, and do not say that the chosen answer is wrong. The pupils should find out by themselves while they talk.
- Everything a question states as a fact must be true. Check every number you write: which number is the numerator and which the denominator, sizes, dates, names.
- Do not say or guess why pupils chose that answer, and do not describe the pupils: no "those who were wrong", no "confused", no names.
- Address the class in the plural all the way through, every verb included (אתם, נסו, ציירו, קחו, הסבירו). Never the singular, and never slashes such as בחר/י.
- Simple Hebrew that fits the grade. Each question is one or two short sentences, at most 24 words in all, and ends with a question mark. No nikud. Write numbers and fractions the way the lesson's question writes them.

Answer with exactly 3 lines, one question on each line, numbered 1. 2. 3., and nothing else: no heading, no explanation.`

const NIQQUD = /[֑-ׇ]/g
const clean = (s: string): string => s.replace(NIQQUD, '').replace(/\s+/g, ' ').trim()
/* content words of the lesson question and the two answers: a discussion question that shares none of them is generic */
const STOP = new Set(['איזה', 'איזו', 'מהו', 'מהי', 'מה', 'מי', 'האם', 'יותר', 'פחות', 'של', 'את', 'על', 'עם', 'או', 'גם', 'זה', 'זאת', 'הוא', 'היא', 'הם', 'כל', 'לא', 'כן', 'אם', 'כי', 'אז', 'יש', 'אין', 'היה', 'היו', 'נכון', 'שאלה'])
function contentTokens(input: DiscussionInput): string[] {
  const words = clean(`${input.question} ${input.wrongText} ${input.correctText ?? ''}`).split(/[^\p{L}\p{N}¼-¾⅐-⅞%]+/u)
  const out = new Set<string>()
  for (const w of words) {
    if (!w || STOP.has(w)) continue
    /* a number or a fraction counts whatever its length; a word needs three letters, and loses a one-letter prefix (ה, ב, ל…) */
    if (/[\p{N}¼-¾⅐-⅞]/u.test(w)) out.add(w)
    else if (w.length >= 3) { out.add(w); if (w.length >= 4) out.add(w.slice(1)) }
  }
  return [...out]
}

/* a request to one pupil in the middle of a question ("קחו דף וצייר קטע"): the verbs a discussion question asks for, in the
   singular, at the start of a sentence or after "ו". Only verbs that are not also a common noun or a past tense */
const SINGULAR_REQUEST = /(^|[.!?,:;]\s*|\sו)(צייר|קח|נסה|דמיין|תאר|השווה)(?=\s|$)/u

/* The model answers with one question per line. Lines, and not JSON: Hebrew text is full of quotation marks (ס"מ, ד"ר), and
   they broke the JSON. A JSON answer is still read, for a model that sends one anyway. Numbering and bullets are dropped,
   and a line without Hebrew letters is not a question */
function parseQuestions(raw: string): string[] {
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}')
  if (a >= 0 && b > a) {
    try {
      const list = (JSON.parse(raw.slice(a, b + 1)) as { questions?: unknown }).questions
      if (Array.isArray(list)) return list.filter((q): q is string => typeof q === 'string').map(clean).filter(Boolean)
    } catch { /* not JSON after all: read the lines */ }
  }
  return raw.split(/\r?\n/).map((line) => clean(line.replace(/^\s*(?:[-*•·]|\(?\d+[.)\]:]?)\s*/, '').replace(/^["'״“”]+|["'״“”]+$/g, ''))).filter((line) => /[א-ת]/.test(line))
}

/* does the list of words hold this run of words, in order and next to each other */
function containsRun(words: string[], run: string[]): boolean {
  for (let i = 0; i + run.length <= words.length; i++) if (run.every((w, j) => words[i + j] === w)) return true
  return false
}

const pieces = (t: string): string[] => clean(t).split(/[^\p{L}\p{N}¼-¾⅐-⅞⁰-₟⁄%]+/u).filter(Boolean)
/* is the correct answer already written in the lesson's question or in the chosen answer */
function shownInQuestion(input: DiscussionInput): boolean {
  const correct = input.correctText ? pieces(input.correctText) : []
  return correct.length > 0 && containsRun(pieces(`${input.question} ${input.wrongText}`), correct)
}

/* The checked questions (3), or the list of problems. Pure: no model, no clock. */
export function checkDiscussionQuestions(raw: string, input: DiscussionInput): { ok: true; questions: string[] } | { ok: false; problems: string[] } {
  const questions = [...new Set(parseQuestions(raw))].slice(0, 3)
  const problems: string[] = []
  if (questions.length < 3) problems.push('There must be exactly 3 different questions.')
  const tokens = contentTokens(input)
  let specific = 0
  /* the correct answer may appear only when the lesson's question itself shows it ("which is larger, ⅛ or ¼?") */
  const correct = input.correctText ? pieces(input.correctText) : []
  const shown = shownInQuestion(input)
  const reveals = (q: string): boolean => correct.length > 0 && !shown && containsRun(pieces(q), correct)
  questions.forEach((q, i) => {
    const n = i + 1
    if (q.length < DISCUSSION_LIMITS.minChars || q.length > DISCUSSION_LIMITS.maxChars || q.split(' ').length > DISCUSSION_LIMITS.maxWords) problems.push(`Question ${n} is too long or too short (at most 24 words).`)
    if (!q.includes('?')) problems.push(`Question ${n} is not a question: it has no question mark.`)
    /* words that describe pupils clinically or judge them. The list of statistics words that the teacher screens ban is not
       applied here: a lesson's own content can be about a ריבוע or a וקטור */
    const bad = [...forbiddenHits(q, FORBIDDEN_CLINICAL), ...forbiddenHits(q, FORBIDDEN_JUDGMENTAL)]
    if (bad.length) problems.push(`Question ${n} uses a word that is not allowed here: ${bad.join(', ')}.`)
    if (reveals(q)) problems.push(`Question ${n} writes the correct answer. Do not write it.`)
    if (scanStudentText(q).length || SINGULAR_REQUEST.test(q)) problems.push(`Question ${n} does not address the class in the plural all the way through.`)
    if (tokens.some((t) => q.includes(t))) specific++
  })
  /* at least two of the three must mention something from the content; with no usable tokens (a question of symbols only) this is skipped */
  if (tokens.length > 0 && questions.length >= 2 && specific < 2) problems.push('The questions are generic: they must use the numbers, terms or objects of this question.')
  return problems.length ? { ok: false, problems } : { ok: true, questions }
}

const userMessage = (input: DiscussionInput, avoid: string[]): string => [
  input.subject ? `Subject: ${input.subject}` : '',
  input.grade ? `Grade: ${input.grade}` : '',
  input.lessonTitle ? `Lesson: ${clean(input.lessonTitle).slice(0, 120)}` : '',
  input.challengeTitle ? `Part of the lesson: ${clean(input.challengeTitle).slice(0, 120)}` : '',
  `Question from the lesson: ${clean(input.question).slice(0, 500)}`,
  input.correctText ? `Correct answer: ${clean(input.correctText).slice(0, 200)}` : '',
  `Answer that several pupils chose: ${clean(input.wrongText).slice(0, 200)}`,
  !shownInQuestion(input) && input.correctText ? `Never write this in a question, in any form: ${clean(input.correctText).slice(0, 200)}` : '',
  avoid.length ? `The teacher already saw these and wants different ones:\n${avoid.map((q) => `- ${q}`).join('\n')}` : '',
].filter(Boolean).join('\n')

const defaultDeps: DiscussionDeps = {
  now: () => Date.now(),
  ask: async (system, user) => {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('no model key')
    /* Sonnet: short Hebrew that a class reads aloud. 20 seconds, then the fixed questions */
    const res = await claude.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 500, system, messages: [{ role: 'user', content: user }] }, { signal: AbortSignal.timeout(20_000) })
    const block = res.content.find((b) => b.type === 'text')
    return block && block.type === 'text' ? block.text : ''
  },
}

const cache = new Map<string, string[]>()
const inFlight = new Map<string, Promise<string[] | null>>()
const perUser = new Map<string, number[]>()
let day = { key: '', count: 0 }

/* true when this user and this day may still start a generation; counts it */
function takeQuota(userKey: string, now: number): boolean {
  const dayKey = new Date(now).toISOString().slice(0, 10)
  if (day.key !== dayKey) day = { key: dayKey, count: 0 }
  const recent = (perUser.get(userKey) ?? []).filter((t) => now - t < 60_000)
  if (day.count >= DISCUSSION_LIMITS.perDay || recent.length >= DISCUSSION_LIMITS.perUserPerMinute) { perUser.set(userKey, recent); return false }
  recent.push(now)
  perUser.set(userKey, recent)
  day.count++
  return true
}

async function generate(input: DiscussionInput, avoid: string[], deps: DiscussionDeps): Promise<string[] | null> {
  const user = userMessage(input, avoid)
  try {
    const first = checkDiscussionQuestions(await deps.ask(SYSTEM, user), input)
    if (first.ok) return first.questions
    console.log('[discussion] the questions failed the check, one more attempt:', first.problems.join(' | '))
    const second = checkDiscussionQuestions(await deps.ask(SYSTEM, `${user}\n\nYour previous answer broke these rules:\n${first.problems.map((p) => `- ${p}`).join('\n')}\nWrite the 3 questions again.`), input)
    if (second.ok) return second.questions
    console.log('[discussion] still failing, using the fixed questions:', second.problems.join(' | '))
  } catch (err) {
    console.log('[discussion] the model call failed, using the fixed questions:', err instanceof Error ? err.message : String(err))
  }
  return null
}

/* fresh: the teacher asked for other questions; the cached ones are passed to the model as "already seen" and replaced */
export async function discussionQuestions(input: DiscussionInput, opts: { userKey: string; fresh?: boolean }, deps: DiscussionDeps = defaultDeps): Promise<DiscussionResult> {
  const fallback: DiscussionResult = { questions: discussionFallback(input), source: 'template' }
  if (process.env.DISCUSSION_AI === '0') return fallback
  const key = createHash('sha1').update(JSON.stringify([input.question, input.wrongText, input.correctText, input.subject ?? '', input.grade ?? ''])).digest('hex')
  const cached = cache.get(key)
  if (cached && !opts.fresh) return { questions: cached, source: 'ai' }
  const running = inFlight.get(key)
  let job = running
  if (!job) {
    if (!takeQuota(opts.userKey, deps.now())) return cached ? { questions: cached, source: 'ai' } : fallback
    job = generate(input, opts.fresh && cached ? cached : [], deps).finally(() => inFlight.delete(key))
    inFlight.set(key, job)
  }
  const questions = await job
  if (!questions) return cached ? { questions: cached, source: 'ai' } : fallback
  cache.delete(key)
  cache.set(key, questions)
  if (cache.size > DISCUSSION_LIMITS.cacheSize) cache.delete(cache.keys().next().value as string)
  return { questions, source: 'ai' }
}

/* tests only */
export function resetDiscussionState(): void { cache.clear(); inFlight.clear(); perUser.clear(); day = { key: '', count: 0 } }
