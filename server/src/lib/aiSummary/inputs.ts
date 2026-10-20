/* ──────────────────────────────────────────────────────────────────────────
   inputs — הקרנות טהורות מחוזי האנליטיקה/התוצאות לרשימת עובדות אנונימית ל-AI (סיכום מילולי).
   · לא קוראות DB ולא מכירות ספק: מקבלות אובייקט חוזה (StudentOverview / ClassOverview / ClassSubjectView / ClassSubmissionView) ומחזירות SummaryInput.
   · allowlist: רק מה שמופיע כאן נכנס. **לעולם לא**: שם תלמיד/displayName/studentName, מזהים (ids), EntryAlert.text, alertTexts, OptionCount.students,
     gaveUpStudents, weakStudents, studentFindings, שמות מורים (senderName), תאריכים מדויקים, מספר הכיתה (רק שם השכבה). חוק 12.
   · כל עובדה בנויה ב-findingsNarrative (aiFact* / narrateFinding עם studentName:null) — אין כאן משפטים בעברית.
   ────────────────────────────────────────────────────────────────────────── */
import { createHash } from 'node:crypto'
import type { Position } from '../../../../src/shared/lib/analyticsConfig.js'
import type { SummaryCounts } from '../../../../src/shared/lib/aiSummaryRule.js'
import {
  aiFactAreas, aiFactAttentionCount, aiFactChallenge, aiFactClassAttention, aiFactClassLevel, aiFactCommonError, aiFactCompletion, aiFactError, aiFactLevel,
  aiFactMisconception, aiFactObjective, aiFactPositionSplit, aiFactSuccessBands, aiFactTrend, aiFactTrendSplit, narrateFinding,
} from '../../../../src/shared/lib/findingsNarrative.js'
import type { SummaryScope } from '../../../../src/shared/types/aiSummaryV1.js'
import type { ClassOverview, ClassSubjectView, Finding, StudentOverview } from '../../../../src/shared/types/analyticsV2.js'
import type { ClassSubmissionView } from '../../../../src/shared/types/resultsV1.js'

export type Gender = 'male' | 'female' | null
export type FactKind = 'level' | 'trend' | 'area' | 'finding' | 'error' | 'count' | 'challenge' | 'objective' | 'distribution'
export type FactTone = 'positive' | 'attention' | 'neutral'

/* עובדה אחת: משפט עברית מוכן + המספרים שבו (השומר מרשה ל-AI להזכיר רק מספרים שנמצאים בעובדות שציטט) */
export interface Fact { id: string; kind: FactKind; tone: FactTone; text: string; numbers: number[] }

export interface SummaryInput {
  scope: SummaryScope
  /* full = מחנך/מנהל-על (כל המקצועות) · subject = מורה מקצועי (מקצועו בלבד) */
  audience: 'full' | 'subject'
  gender: Gender
  /* שם השכבה בלבד ("ו׳"), בלי מספר הכיתה */
  gradeLabel: string | null
  sampleSize: number
  sampleUnit: 'sessions' | 'students'
  /* הספירות לכלל הזכאות (aiSummaryRule.summaryEligibility) */
  counts: SummaryCounts
  facts: Fact[]
}

/* מקור הנתונים שהספק טוען: אובייקט חוזה אחד לפי ההיקף */
export type SummarySource =
  | { scope: 'student'; overview: StudentOverview; gender: Gender }
  | { scope: 'class'; overview: ClassOverview }
  | { scope: 'class_subject'; view: ClassSubjectView }
  | { scope: 'submission'; view: ClassSubmissionView }

const MAX_FACTS = 30

interface Draft { kind: FactKind; tone: FactTone; text: string }

/* כל המספרים בטקסט ("42%" → 42, "8.5" → 8.5). משותף לבניית העובדות ולשומר הפלט */
export function numbersIn(text: string): number[] {
  return (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number)
}

/* כשיש יותר מ-MAX_FACTS עובדות, נשארות החשובות (ממצאים וטעויות קודם; מגמה "יציבה" אחרונה) — בסדר המקורי, כדי שמקצועות מאוחרים לא ייחתכו */
const priorityOf = (d: Draft): number => {
  if (d.kind === 'finding') return 0
  if (d.kind === 'error') return 1
  if (d.kind === 'trend') return d.tone === 'neutral' ? 4 : 2
  if (d.kind === 'area') return 3
  return 2
}

function finalize(drafts: Draft[]): Fact[] {
  let kept = drafts
  if (drafts.length > MAX_FACTS) {
    const keep = new Set(drafts.map((d, i) => ({ i, p: priorityOf(d) })).sort((a, b) => a.p - b.p || a.i - b.i).slice(0, MAX_FACTS).map((x) => x.i))
    kept = drafts.filter((_, i) => keep.has(i))
  }
  return kept.map((d, i) => ({ id: `f${i + 1}`, kind: d.kind, tone: d.tone, text: d.text, numbers: numbersIn(d.text) }))
}

/* "ו׳2" → "ו׳": שכבה בלבד, כדי שהכיתה הספציפית לא תזוהה */
export function layerOf(label: string | null | undefined): string | null {
  const l = (label ?? '').replace(/[\d\s]+$/u, '').trim()
  return l.length > 0 ? l : null
}

type ReportedFinding = Extract<Finding, { status: 'reported' }>
const reported = (fs: Finding[]): ReportedFinding[] => fs.filter((f): f is ReportedFinding => f.status === 'reported')

const positionTone = (p: Position | null): FactTone => (p === 'above' ? 'positive' : p === 'below' ? 'attention' : 'neutral')
const trendTone = (t: 'improving' | 'steady' | 'declining' | 'insufficient'): FactTone => (t === 'improving' ? 'positive' : t === 'declining' ? 'attention' : 'neutral')

/* ── תלמיד/ה: רק פאנלים גלויים (מקצוע אפור לא נכנס), ממצאים מדווחים בלבד, התרעות חוצות-מקצועות למחנך בלבד ── */
export function projectStudent(o: StudentOverview, opts: { gender: Gender }): SummaryInput {
  const drafts: Draft[] = []
  let sessions = 0
  for (const p of o.panels) {
    if (p.access !== 'visible') continue
    const subject = p.subject.nameHe
    sessions += p.sessionsCount
    if (p.currentLevel !== null) drafts.push({ kind: 'level', tone: positionTone(p.positionVsNorm), text: aiFactLevel(subject, p.currentLevel, p.positionVsNorm, p.sessionsCount) })
    if (p.trend !== 'insufficient') drafts.push({ kind: 'trend', tone: trendTone(p.trend), text: aiFactTrend(subject, p.trend) })
    if (p.areas.strong.length) drafts.push({ kind: 'area', tone: 'positive', text: aiFactAreas(subject, p.areas.strong, []) })
    if (p.areas.challenging.length) drafts.push({ kind: 'area', tone: 'attention', text: aiFactAreas(subject, [], p.areas.challenging) })
    for (const e of p.commonErrors.slice(0, 2)) drafts.push({ kind: 'error', tone: 'attention', text: aiFactError(subject, e.title, e.hits, e.exposures) })
    for (const f of reported(p.findings).slice(0, 2)) drafts.push({ kind: 'finding', tone: f.tone, text: narrateFinding(f.evidence, { studentName: null, subjectName: subject }) })
  }
  if (o.access === 'full') {
    for (const f of reported(o.crossSubject).slice(0, 2)) drafts.push({ kind: 'finding', tone: f.tone, text: narrateFinding(f.evidence, { studentName: null }) })
  }
  return {
    scope: 'student', audience: o.access === 'full' ? 'full' : 'subject', gender: opts.gender, gradeLabel: layerOf(o.student.gradeLabel),
    sampleSize: sessions, sampleUnit: 'sessions', counts: { sessions }, facts: finalize(drafts),
  }
}

/* ── כיתה (סקירת מחנך): שורת מקצוע → רמה ממוצעת, מגמה, תחומים, מספר תלמידים לתשומת לב. בלי alertTexts (שמות) ── */
export function projectClass(o: ClassOverview): SummaryInput {
  const drafts: Draft[] = []
  const students = o.class.studentCount
  let hasData = false
  for (const r of o.rows) {
    const subject = r.subject.nameHe
    if (r.level !== null) {
      hasData = true
      drafts.push({ kind: 'level', tone: positionTone(r.positionVsNorm), text: aiFactClassLevel(subject, r.level, r.positionVsNorm, students) })
    }
    if (r.trend !== 'insufficient') drafts.push({ kind: 'trend', tone: trendTone(r.trend), text: aiFactTrend(subject, r.trend, true) })
    if (r.strongAreas.length) drafts.push({ kind: 'area', tone: 'positive', text: aiFactAreas(subject, r.strongAreas, []) })
    if (r.challengingAreas.length) drafts.push({ kind: 'area', tone: 'attention', text: aiFactAreas(subject, [], r.challengingAreas) })
    if (r.alerts > 0) drafts.push({ kind: 'count', tone: 'attention', text: aiFactClassAttention(subject, r.alerts, students) })
  }
  /* אין שדה "תלמידים עם נתונים" בחוזה הסקירה: אם יש רמה לפחות במקצוע אחד, נחשב את כל תלמידי הכיתה */
  const withData = hasData ? students : 0
  return {
    scope: 'class', audience: 'full', gender: null, gradeLabel: layerOf(o.class.gradeLabel),
    sampleSize: withData, sampleUnit: 'students', counts: { students: withData }, facts: finalize(drafts),
  }
}

/* ── מקצוע בכיתה: התפלגות מיקום/מגמה (ספירות בלבד), טעויות נפוצות, ממצאי כיתה. בלי studentFindings ובלי summary.recent (שמות) ── */
export function projectClassSubject(v: ClassSubjectView): SummaryInput {
  const drafts: Draft[] = []
  const subject = v.subject.nameHe
  const withLevel = v.students.filter((s) => s.level !== null)
  const norm = v.classLevel.ageNorm
  const mean = v.classLevel.mean
  const classPosition: Position | null = mean === null ? null : mean > norm.high ? 'above' : mean < norm.low ? 'below' : 'within'
  if (mean !== null) drafts.push({ kind: 'level', tone: positionTone(classPosition), text: aiFactClassLevel(subject, mean, classPosition, withLevel.length) })

  const pos = { above: 0, within: 0, below: 0 }
  for (const s of v.students) if (s.positionVsNorm) pos[s.positionVsNorm]++
  const placed = pos.above + pos.within + pos.below
  if (placed > 0) drafts.push({ kind: 'distribution', tone: 'neutral', text: aiFactPositionSplit(subject, pos.above, pos.within, pos.below, placed) })

  if (v.trend !== 'insufficient') drafts.push({ kind: 'trend', tone: trendTone(v.trend), text: aiFactTrend(subject, v.trend, true) })
  const tr = { improving: 0, steady: 0, declining: 0 }
  for (const s of v.students) if (s.trend !== 'insufficient') tr[s.trend]++
  const trended = tr.improving + tr.steady + tr.declining
  if (trended > 0) drafts.push({ kind: 'distribution', tone: 'neutral', text: aiFactTrendSplit(subject, tr.improving, tr.steady, tr.declining, trended) })

  for (const m of v.misconceptions.filter((x) => x.status === 'reported').slice(0, 3)) {
    drafts.push({ kind: 'error', tone: 'attention', text: aiFactMisconception(subject, m.titleHe, m.countText) })
  }
  for (const f of reported(v.classFindings).slice(0, 3)) drafts.push({ kind: 'finding', tone: f.tone, text: narrateFinding(f.evidence, { studentName: null, subjectName: subject }) })

  return {
    scope: 'class_subject', audience: 'full', gender: null, gradeLabel: layerOf(v.class.gradeLabel),
    sampleSize: withLevel.length, sampleUnit: 'students', counts: { students: withLevel.length }, facts: finalize(drafts),
  }
}

/* חלק הצלחה בדונאט "כמה אתגרים הצליחו" — נוסף לחוזה התוצאות; נקרא בזהירות כדי שההקרנה תעבוד גם לפני שהשדה קיים */
interface SuccessBandsLike { basis: number; low: number; mid: number; high: number; enough: boolean }
const successBandsOf = (v: ClassSubmissionView): SuccessBandsLike | null => (v as { successBands?: SuccessBandsLike }).successBands ?? null

/* ── הגשה: ספירות סטטוס, התפלגות הצלחה, אתגרים (X מתוך Y), טעויות נפוצות, יעדי למידה. בלי roster/שמות ובלי gaveUpStudents/weakStudents ── */
export function projectSubmission(v: ClassSubmissionView): SummaryInput {
  const drafts: Draft[] = []
  const c = v.head.counts
  if (c.total > 0) drafts.push({ kind: 'count', tone: 'neutral', text: aiFactCompletion(c.total, c.completed, c.inProgress, c.notStarted) })
  const sb = successBandsOf(v)
  if (sb && sb.enough && sb.basis > 0) drafts.push({ kind: 'distribution', tone: 'neutral', text: aiFactSuccessBands(sb.basis, sb.high, sb.mid, sb.low) })
  const chips = [...v.roster.completed, ...v.roster.inProgress, ...v.roster.notStarted]
  const attention = chips.filter((s) => s.attention).length
  if (attention > 0) drafts.push({ kind: 'count', tone: 'attention', text: aiFactAttentionCount(attention, c.total) })

  for (const ch of v.challenges.filter((x) => x.attempted > 0).slice(0, 12)) {
    const share = ch.solved / ch.attempted
    drafts.push({ kind: 'challenge', tone: share < 0.5 ? 'attention' : share >= 0.75 ? 'positive' : 'neutral', text: aiFactChallenge(ch.order, ch.typeLabel, ch.title, ch.attempted, ch.solved, ch.gaveUp) })
  }
  for (const e of v.commonErrors.slice(0, 3)) drafts.push({ kind: 'error', tone: 'attention', text: aiFactCommonError(e.title, e.studentsCount, e.studentsExposed) })
  for (const o of v.objectives.filter((x) => x.level !== null).slice(0, 6)) {
    drafts.push({ kind: 'objective', tone: o.level === 'strong' ? 'positive' : o.level === 'weak' ? 'attention' : 'neutral', text: aiFactObjective(o.text, o.levelText, o.solved, o.attempted) })
  }
  return {
    scope: 'submission', audience: 'full', gender: null, gradeLabel: null,
    sampleSize: c.completed, sampleUnit: 'students', counts: { completed: c.completed }, facts: finalize(drafts),
  }
}

export function projectSource(s: SummarySource): SummaryInput {
  switch (s.scope) {
    case 'student': return projectStudent(s.overview, { gender: s.gender })
    case 'class': return projectClass(s.overview)
    case 'class_subject': return projectClassSubject(s.view)
    case 'submission': return projectSubmission(s.view)
  }
}

/* שמות שהשומר מחפש בפלט כרשת ביטחון (ה-AI לא קיבל אותם, ולכן הופעתם = המצאה/הד של טקסט שבא מבחוץ). לא נשלחים לשום מקום. */
export function collectKnownNames(s: SummarySource): string[] {
  const names = new Set<string>()
  const add = (n: string | null | undefined): void => { const t = (n ?? '').trim(); if (t.length >= 2) names.add(t) }
  switch (s.scope) {
    case 'student': add(s.overview.student.displayName); break
    case 'class_subject':
      for (const st of s.view.students) add(st.displayName)
      for (const f of s.view.studentFindings) add(f.studentName)
      break
    case 'submission': {
      const v = s.view
      for (const st of [...v.roster.completed, ...v.roster.inProgress, ...v.roster.notStarted]) add(st.name)
      for (const ch of v.challenges) {
        for (const g of ch.gaveUpStudents) add(g.name)
        for (const it of ch.items) for (const op of it.options ?? []) for (const st of op.students) add(st.name)
      }
      for (const o of v.objectives) for (const w of o.weakStudents) add(w.name)
      break
    }
    case 'class': break
  }
  return [...names]
}

/* חותמת קלט: משתנה כשהעובדות או גרסת ההנחיה משתנות */
export function inputHash(input: SummaryInput, promptVersion: string): string {
  const payload = JSON.stringify({ v: promptVersion, s: input.scope, a: input.audience, g: input.gender, l: input.gradeLabel, f: input.facts.map((f) => f.text) })
  return createHash('sha256').update(payload).digest('hex')
}
