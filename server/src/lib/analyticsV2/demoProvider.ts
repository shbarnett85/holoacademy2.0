/* ──────────────────────────────────────────────────────────────────────────
   demoProvider — ספק ההדגמה של האנליטיקה החדשה. מממש את חוזה analyticsV2 על עולם הדמו (demoWorld+engine).
   · ההרשאות נאכפות כאן, לפי ה-V2Viewer, ולא במסכים: מנהל לעולם לא מקבל שם/מזהה תלמיד;
     מורה מקצועי לא מקבל נתוני מקצוע אחר; מחנך מקבל הכול כולל התרעות חוצות-מקצועות.
   · כל טקסט בשפה טבעית מגיע מ-findingsNarrative (אין מחרוזות ממצא כאן; נאכף ב-noHardcodedText.test.ts).
   · החישובים הטהורים (מגמה, תחומים, ציר זמן, התרעות) ב-derive.ts — משותפים לספק האמיתי העתידי.
   ────────────────────────────────────────────────────────────────────────── */
import {
  AREA_MIN_DELTA, ENTRY_MAX_ALERTS, MISCONCEPTION_RULE, OVERVIEW_ALERT_TEXTS_MAX, PROGRESS_EVENTS_MAX, SUMMARY_RECENT_MAX, contentVectorLabel, type Position,
} from '../../../../src/shared/lib/analyticsConfig.js'
import {
  BRIEFING_SECTION_TITLES, ERR_NOT_FOUND, ERR_NO_ACCESS, HOW_WE_CALC, ADMIN_HIDDEN_CELL_TEXT, briefingSubtitleClass, briefingSubtitleStudent,
  briefingTitleClass, briefingTitleStudent, exposuresLine, needMoreLine, normBandLine,
  CAVEAT_AGE_NORM, CAVEAT_CROSS_SUBJECT, CAVEAT_TREND, NOTICE_CURRICULUM_SAMPLE, NOTICE_DEMO_DATA, EVIDENCE_LIMITS_NOTE,
  basedOnChallenges, basedOnSessions, basisLine, basisWhat, groupTrendText, narrateAdminGradeSummary, narrateAdminMisconception, narrateAdminPosition,
  narrateAdminSchool, narrateAdminSubjectSummary, narrateDifficultyBelow, narrateDifficultyFromTrend, narrateEvidenceWindow, narrateFeedbackGrowth,
  narrateFeedbackHeadline, narrateFeedbackNextStep, narrateFeedbackStreak, narrateMisconceptionInsufficient, narrateOverviewSummary, narrateRecommendation,
  narrateRecommendationFromFinding, narrateShort, narrateStrengthAbove, narrateStudentHeadline, narrateSubjectHeadline, narrateVectorGap,
  narrateVectorStrength, joinSubjectNames, positionText, studentsCountText, trendText,
} from '../../../../src/shared/lib/findingsNarrative.js'
import { subjectName, type SubjectCode } from '../../../../src/shared/lib/subjects.js'
import type {
  AdminCell, AdminOverview, AnalyticsConfig, Briefing, ClassOverview, ClassSubjectView, Entry, Envelope, Finding, MisconceptionRow, Roster,
  StudentFeedback, StudentOverview, SubjectPanel, SubjectRef,
} from '../../../../src/shared/types/analyticsV2.js'
import { AppError } from '../../middleware/errors.js'
import {
  DEMO_SUBJECT_PERSONAS, canSeeCrossSubject, canViewClassOverview, canViewClassSubject, canViewStudent, canViewSubject, cellVisible, requireNotAdmin, type V2Viewer,
} from './access.js'
import { CONCEPTS, MISCONCEPTIONS, conceptByKey, goalById, type MisconceptionDef } from './catalog.js'
import {
  classAreaKeys, classMonthlySeries, commonErrorsOf, compareAlert, eventDate, groupTrend, isAttention, isReported, positionOf, studentAreaKeys,
  studentTrend, trendOfDelta, type ReportedFinding,
} from './derive.js'
import { skey, getWorld, type WorldClass } from './demoWorld.js'
import { analyze, type Analysis, type MisStat, type SubjectAnalysis } from './engine.js'
import type { AnalyticsV2Provider } from './provider.js'
import { mean } from './stats.js'

const ok = <T>(data: T): Envelope<T> => ({ dataState: 'ok', data })
const sref = (code: SubjectCode): SubjectRef => ({ code, nameHe: subjectName(code) })
const CAVEATS = { ageNorm: CAVEAT_AGE_NORM, crossSubject: CAVEAT_CROSS_SUBJECT, trend: CAVEAT_TREND }
const round1 = (v: number): number => Math.round(v * 10) / 10
/* בתדריך של תלמיד/ה: כמה תחומים חזקים / מאתגרים בולטים מוצגים (מכל המקצועות יחד) */
const BRIEFING_MAX_AREAS = 2

/* ניתוח לפי יום (נתוני העולם זהים בכל יום; התאריכים זזים) */
const ANALYSIS_CACHE = new Map<string, Analysis>()
export function getAnalysis(now: Date = new Date()): Analysis {
  const key = now.toISOString().slice(0, 10)
  let a = ANALYSIS_CACHE.get(key)
  if (!a) { a = analyze(getWorld(now)); ANALYSIS_CACHE.clear(); ANALYSIS_CACHE.set(key, a) }
  return a
}

const notFound = (): never => { throw new AppError(404, ERR_NOT_FOUND) }
const denied = (): never => { throw new AppError(403, ERR_NO_ACCESS) }

/* ממצאים מדווחים לפי טון */
const countTone = (fs: Finding[], tone: 'attention' | 'positive'): number => fs.filter((f) => f.status === 'reported' && f.tone === tone).length

/* ── שורות מקצוע ── */
/* רמת הייחוס לתחומים של תלמיד/ה: ממוצע הרמה בחלון שבו נמדדים התחומים (60 ימי הלימוד האחרונים); אם אין — הרמה הנוכחית */
const areaReference = (sa: SubjectAnalysis): number | null => sa.level60 ?? sa.currentLevel
function panelOf(v: V2Viewer, a: Analysis, sa: SubjectAnalysis): SubjectPanel {
  if (!canViewSubject(v, sa.subject)) return { access: 'greyed', subject: sref(sa.subject) }
  const trend = studentTrend(sa)
  const areas = studentAreaKeys(sa.contentVectors, areaReference(sa))
  return {
    access: 'visible', subject: sref(sa.subject), currentLevel: sa.currentLevel, levelSeries: sa.levelSeries,
    ageNorm: sa.ageNorm, positionVsNorm: sa.positionVsNorm, positionText: positionText(sa.positionVsNorm),
    trend, trendText: trendText(trend),
    areas: { strong: areas.strong.map(contentVectorLabel), challenging: areas.challenging.map(contentVectorLabel) },
    commonErrors: commonErrorsOf(a, sa.studentId, sa.subject),
    sessionsCount: sa.sessionsCount,
    contentVectors: sa.contentVectors, behaviorVectors: sa.behaviorVectors, findings: sa.findings,
  }
}

function misRow(a: Analysis, m: MisconceptionDef, stat: MisStat, showStudents: boolean): MisconceptionRow {
  const concept = conceptByKey(m.conceptKey)
  const goal = goalById(concept?.goalId ?? null)
  const reported = stat.sharePct !== null
  return {
    id: m.id, code: m.code, titleHe: m.titleHe, descriptionHe: m.descriptionHe,
    conceptKey: m.conceptKey, conceptTitle: concept?.titleHe ?? m.conceptKey, subjectCode: m.subject,
    curriculumGoal: goal ? { title: goal.title, gradeFrom: goal.gradeFrom, gradeTo: goal.gradeTo, mappingStatus: 'sample' } : null,
    status: reported ? 'reported' : 'insufficient',
    studentsShowing: stat.studentsShowing, studentsExposed: stat.studentsExposed, sharePct: stat.sharePct,
    countText: reported ? studentsCountText(stat.studentsShowing, stat.studentsExposed) : narrateMisconceptionInsufficient(stat.studentsExposed),
    students: showStudents ? stat.students.map((s) => ({ id: s.id, displayName: a.studentById.get(s.id)!.displayName, hits: s.hits, exposures: s.exposures })) : [],
    linkedQuest: m.linkedQuest,
  }
}

/* סקופ הכיתות הרלוונטיות לצופה */
function classesOf(v: V2Viewer, a: Analysis): string[] {
  if (v.lens === 'homeroom') return v.homeroomClassId ? [v.homeroomClassId] : []
  if (v.lens === 'subject_teacher') return v.teachingClassIds.filter((id) => a.classById.has(id))
  return a.world.classes.map((c) => c.id)
}

export function demoViewerClasses(subjects: SubjectCode[]): string[] {
  const a = getAnalysis()
  return a.world.classes.filter((c) => c.studentIds.some((sid) => subjects.some((s) => a.studentById.get(sid)!.subjects.includes(s)))).map((c) => c.id)
}

/* ── נתוני מקצוע בכיתה (משותפים ל"סקירה" ולמסך המקצוע) ── */
interface SubjectStats {
  studentIds: string[]
  sas: SubjectAnalysis[]
  level: number | null
  /* רמת הייחוס להשוואת תחומים: ממוצע הרמה באותו חלון שבו נמדדים התחומים (60 ימי הלימוד האחרונים) */
  areaReference: number | null
  position: Position | null
  trend: ReturnType<typeof groupTrend>
  /* תלמידים עם ממצא מדווח בטון "תשומת לב" במקצוע — אחד לתלמיד (החשוב ביותר), ממוין לפי חשיבות */
  attention: { studentId: string; finding: ReportedFinding }[]
}
function subjectStats(a: Analysis, cls: WorldClass, subject: SubjectCode): SubjectStats {
  const studentIds = cls.studentIds.filter((sid) => a.studentById.get(sid)!.subjects.includes(subject))
  const sas = studentIds.map((sid) => a.ss.get(skey(sid, subject))!)
  const levels = sas.map((x) => x.currentLevel).filter((x): x is number => x !== null)
  const level = levels.length ? round1(mean(levels)) : null
  const refs = sas.map((x) => x.level60).filter((x): x is number => x !== null)
  const attention = sas
    .map((sa) => ({ studentId: sa.studentId, finding: sa.findings.filter(isAttention).sort(compareAlert)[0] }))
    .filter((x): x is { studentId: string; finding: ReportedFinding } => !!x.finding)
    .sort((x, y) => compareAlert(x.finding, y.finding) || x.studentId.localeCompare(y.studentId))
  return { studentIds, sas, level, areaReference: refs.length ? mean(refs) : null, position: positionOf(level, a.ageNormOf(cls.grade)), trend: groupTrend(sas), attention }
}

const ctxOf = (a: Analysis, studentId: string, f: Finding): { studentName: string; subjectName: string | null } => ({
  studentName: a.studentById.get(studentId)!.displayName,
  subjectName: f.subjectCode ? subjectName(f.subjectCode) : null,
})

export const demoProvider: AnalyticsV2Provider = {
  async config(v) {
    const a = getAnalysis()
    const subjects = v.lens === 'subject_teacher' ? v.subjectCodes : []
    const cfg: AnalyticsConfig = {
      enabled: true, lens: v.lens,
      availableLenses: v.guest ? ['homeroom', 'subject_teacher', 'admin'] : [v.lens],
      subjects: v.guest ? DEMO_SUBJECT_PERSONAS.map(sref) : subjects.map(sref),
      classes: classesOf(v, a).map((id) => ({ id, name: a.classById.get(id)!.name })),
      dataNotice: NOTICE_DEMO_DATA,
      curriculumNotice: NOTICE_CURRICULUM_SAMPLE,
      caveats: CAVEATS,
    }
    return ok(cfg)
  },

  async roster(v) {
    const a = getAnalysis()
    const classes = classesOf(v, a).map((id) => a.classById.get(id)!).map((c) => {
      const subjects = [...new Set(c.studentIds.flatMap((sid) => a.studentById.get(sid)!.subjects))].filter((s) => v.lens === 'subject_teacher' ? v.subjectCodes.includes(s) : true)
      return { id: c.id, name: c.name, gradeLabel: c.gradeLabel, grade: c.grade, studentCount: c.studentIds.length, subjects: subjects.map(sref) }
    })
    const r: Roster = { classes, students: [] }
    if (v.lens !== 'admin') {
      for (const c of classes) {
        for (const sid of a.classById.get(c.id)!.studentIds) {
          const st = a.studentById.get(sid)!
          const visible = st.subjects.filter((s) => canViewSubject(v, s))
          if (!visible.length) continue
          const fs = visible.flatMap((s) => a.ss.get(skey(sid, s))!.findings)
          r.students.push({
            id: sid, displayName: st.displayName, classId: c.id,
            attention: countTone(fs, 'attention'), positive: countTone(fs, 'positive'),
            earlyWarning: canSeeCrossSubject(v) && (a.crossSubject.get(sid)?.length ?? 0) > 0,
          })
        }
      }
    }
    return ok(r)
  },

  /* מסך הכניסה "בחרו כיתה": הכיתות של הצופה + עד 3 התרעות. מנהל: ריק (אין שם/מזהה תלמיד, אין רשימת כיתות). */
  async entry(v) {
    const a = getAnalysis()
    if (v.lens === 'admin') return ok<Entry>({ classes: [], alerts: [] })
    const alerts: { finding: ReportedFinding; studentId: string; classId: string }[] = []
    const classes = classesOf(v, a).map((id) => a.classById.get(id)!).map((c) => {
      const students = c.studentIds.filter((sid) => a.studentById.get(sid)!.subjects.some((s) => canViewSubject(v, s)))
      let attentionCount = 0
      for (const sid of students) {
        const st = a.studentById.get(sid)!
        const own = st.subjects.filter((s) => canViewSubject(v, s)).flatMap((s) => a.ss.get(skey(sid, s))!.findings)
        const cross = canSeeCrossSubject(v) ? (a.crossSubject.get(sid) ?? []) : []
        const best = [...own, ...cross].filter(isAttention).sort(compareAlert)[0]
        if (best) { attentionCount++; alerts.push({ finding: best, studentId: sid, classId: c.id }) }
      }
      return { id: c.id, name: c.name, gradeLabel: c.gradeLabel, studentCount: students.length, attentionCount }
    })
    alerts.sort((x, y) => compareAlert(x.finding, y.finding) || x.studentId.localeCompare(y.studentId))
    return ok<Entry>({
      classes,
      alerts: alerts.slice(0, ENTRY_MAX_ALERTS).map(({ finding, studentId, classId }) => ({
        studentId, studentName: a.studentById.get(studentId)!.displayName, classId, className: a.classById.get(classId)!.name,
        text: narrateShort(finding.evidence, ctxOf(a, studentId, finding)),
      })),
    })
  },

  async student(v, id) {
    const a = getAnalysis()
    const st = a.studentById.get(id) ?? notFound()
    requireNotAdmin(v)
    if (!canViewStudent(v, st.classId)) denied()
    const cls = a.classById.get(st.classId)!
    const panels = st.subjects.map((sub) => panelOf(v, a, a.ss.get(skey(id, sub))!))
    const visibleFindings = panels.flatMap((p) => (p.access === 'visible' ? p.findings : []))
    const crossSubject = canSeeCrossSubject(v) ? (a.crossSubject.get(id) ?? []) : []
    const o: StudentOverview = {
      student: { id, displayName: st.displayName, classId: cls.id, className: cls.name, grade: st.grade, gradeLabel: cls.gradeLabel },
      summary: narrateStudentHeadline({
        firstName: st.firstName, attention: countTone(visibleFindings, 'attention'), positive: countTone(visibleFindings, 'positive'), crossSubject: crossSubject.length > 0,
      }),
      access: v.lens === 'homeroom' ? 'full' : 'subject_only',
      panels,
      crossSubject,
      caveats: CAVEATS,
    }
    return ok(o)
  },

  async feedback(v, id) {
    const a = getAnalysis()
    const st = a.studentById.get(id) ?? notFound()
    requireNotAdmin(v)
    if (!canViewStudent(v, st.classId)) denied()
    const w = a.world
    const since = w.days[Math.min(120, w.days.length - 1)]
    const items: StudentFeedback['items'] = []
    const visibleSubjects = st.subjects.filter((s) => canViewSubject(v, s))
    for (const sub of visibleSubjects) {
      const sa = a.ss.get(skey(id, sub))!
      const down = sa.findings.some((f) => f.status === 'reported' && f.kind === 'level_trend' && f.evidence.kind === 'level_trend' && f.evidence.direction === 'down')
      const delta = sa.level60 !== null && sa.level90to150 !== null ? sa.level60 - sa.level90to150 : null
      if (down) {
        const weakest = sa.contentVectors.filter((c) => c.level !== null).sort((x, y) => (x.level as number) - (y.level as number))[0]
        const concept = weakest ? CONCEPTS.find((c) => c.subject === sub && c.vector === weakest.key)?.titleHe ?? null : null
        items.push({ subject: sref(sub), kind: 'next_step', text: narrateFeedbackNextStep(subjectName(sub), concept) })
      } else if (delta !== null && delta >= 0.5) {
        items.push({ subject: sref(sub), kind: 'growth', text: narrateFeedbackGrowth(subjectName(sub), delta, since) })
      }
    }
    const hasGrowth = items.some((i) => i.kind === 'growth')
    if (!hasGrowth) {
      /* אין שיפור בולט: פריט התמדה אחד מסכם (לא חזרה לכל מקצוע) */
      const total = visibleSubjects.reduce((s, sub) => s + a.ss.get(skey(id, sub))!.sessionsCount, 0)
      items.unshift({ subject: sref(visibleSubjects[0] ?? st.subjects[0]), kind: 'streak', text: narrateFeedbackStreak(joinSubjectNames(visibleSubjects.map(subjectName)), total) })
    }
    return ok({ firstName: st.firstName, headline: narrateFeedbackHeadline(st.firstName, hasGrowth), items: items.slice(0, 5) })
  },

  /* "סקירה": שורה לכל מקצוע בכיתה. מחנך הכיתה בלבד — מורה מקצועי / מנהל / מחנך של כיתה אחרת: 403. */
  async classOverview(v, classId) {
    const a = getAnalysis()
    requireNotAdmin(v)
    if (v.lens !== 'homeroom') denied()
    const cls = a.classById.get(classId) ?? notFound()
    if (!canViewClassOverview(v, classId)) denied()
    const subjects = [...new Set(cls.studentIds.flatMap((sid) => a.studentById.get(sid)!.subjects))]
    const norm = a.ageNormOf(cls.grade)
    const stats = subjects.map((sub) => ({ sub, s: subjectStats(a, cls, sub) }))
    const rows: ClassOverview['rows'] = stats.map(({ sub, s }) => {
      const areas = classAreaKeys(s.sas, s.areaReference)
      return {
        subject: sref(sub), level: s.level, ageNorm: norm, positionVsNorm: s.position, positionText: positionText(s.position),
        trend: s.trend, trendText: groupTrendText(s.trend),
        strongAreas: areas.strong.map(contentVectorLabel), challengingAreas: areas.challenging.map(contentVectorLabel),
        alerts: s.attention.length,
        alertTexts: s.attention.slice(0, OVERVIEW_ALERT_TEXTS_MAX).map((x) => narrateShort(x.finding.evidence, ctxOf(a, x.studentId, x.finding))),
      }
    })
    const count = (p: Position): number => rows.filter((r) => r.positionVsNorm === p).length
    const attentionStudents = new Set(stats.flatMap(({ s }) => s.attention.map((x) => x.studentId))).size
    return ok<ClassOverview>({
      class: { id: cls.id, name: cls.name, gradeLabel: cls.gradeLabel, studentCount: cls.studentIds.length },
      summary: narrateOverviewSummary({ className: cls.name, above: count('above'), within: count('within'), below: count('below'), attentionStudents }),
      rows, caveats: CAVEATS,
    })
  },

  async classSubject(v, classId, subject) {
    const a = getAnalysis()
    const cls = a.classById.get(classId) ?? notFound()
    requireNotAdmin(v)
    if (!canViewClassSubject(v, classId, subject)) denied()
    const stats = subjectStats(a, cls, subject)
    const { studentIds } = stats
    if (!studentIds.length) notFound()
    const norm = a.ageNormOf(cls.grade)
    const subName = subjectName(subject)

    const defs = MISCONCEPTIONS.filter((m) => m.subject === subject && m.prevalence[cls.grade as 4 | 6] !== undefined)
    const rows = defs.map((m) => misRow(a, m, a.misByClass.get(`${classId}|${m.id}`)!, true)).sort((x, y) => (y.sharePct ?? -1) - (x.sharePct ?? -1))
    const recs = rows.filter((r) => r.status === 'reported' && (r.sharePct ?? 0) >= 20).slice(0, 3).map((r, i) => ({
      rank: i + 1, misconceptionId: r.id, linkedQuest: r.linkedQuest,
      text: narrateRecommendation({ titleHe: r.titleHe, conceptTitle: r.conceptTitle, studentsShowing: r.studentsShowing, studentsExposed: r.studentsExposed, sharePct: r.sharePct as number }, !!r.linkedQuest),
    }))
    const classFindings = (a.classFindings.get(classId) ?? []).filter((x) => x.subject === subject).map((x) => x.finding)
    const studentFindings = studentIds.flatMap((sid) => a.ss.get(skey(sid, subject))!.findings.map((finding) => ({ studentId: sid, studentName: a.studentById.get(sid)!.displayName, finding })))
    const otherSubjects = v.lens === 'subject_teacher'
      ? [...new Set(cls.studentIds.flatMap((sid) => a.studentById.get(sid)!.subjects))].filter((s) => s !== subject).map(sref)
      : []

    /* אירועים מדווחים (כיתה + תלמידים) על ציר הזמן. המורה רשאי לראות שמות תלמידים. */
    const events: { date: string; text: string; tone: 'positive' | 'attention' | 'neutral'; id: string; classLevel: boolean }[] = []
    for (const f of classFindings) if (isReported(f)) events.push({ id: f.id, classLevel: true, date: eventDate(f), tone: f.tone, text: narrateShort(f.evidence, { subjectName: subName, className: cls.name }) })
    for (const sf of studentFindings) if (isReported(sf.finding)) {
      events.push({ id: sf.finding.id, classLevel: false, date: eventDate(sf.finding), tone: sf.finding.tone, text: narrateShort(sf.finding.evidence, { studentName: sf.studentName, subjectName: subName }) })
    }
    const newestFirst = (x: { date: string; id: string }, y: { date: string; id: string }): number => y.date.localeCompare(x.date) || x.id.localeCompare(y.id)
    const recent = [...events.filter((e) => e.classLevel).sort(newestFirst).slice(0, 1), ...events.filter((e) => !e.classLevel).sort(newestFirst)]
      .slice(0, SUMMARY_RECENT_MAX).map((e) => e.text)
    const timeline = [...events].sort(newestFirst).slice(0, PROGRESS_EVENTS_MAX).sort((x, y) => x.date.localeCompare(y.date) || x.id.localeCompare(y.id))
      .map((e) => ({ date: e.date, text: e.text, tone: e.tone }))

    const view: ClassSubjectView = {
      class: { id: cls.id, name: cls.name, gradeLabel: cls.gradeLabel, studentCount: cls.studentIds.length },
      subject: sref(subject),
      classLevel: { mean: stats.level, ageNorm: norm },
      summary: {
        headline: narrateSubjectHeadline({ className: cls.name, subject: subName, position: stats.position, trend: stats.trend, attentionStudents: stats.attention.length }),
        recent, whatToTeach: recs,
      },
      misconceptions: rows, recommendations: recs,
      progress: { series: classMonthlySeries(stats.sas), ageNorm: norm, events: timeline },
      classFindings, studentFindings,
      students: studentIds.map((sid) => {
        const sa = a.ss.get(skey(sid, subject))!
        const trend = studentTrend(sa)
        return {
          id: sid, displayName: a.studentById.get(sid)!.displayName, level: sa.currentLevel,
          positionVsNorm: sa.positionVsNorm, positionText: positionText(sa.positionVsNorm), trend, trendText: trendText(trend),
        }
      }),
      trend: stats.trend, trendText: groupTrendText(stats.trend),
      otherSubjects, caveats: CAVEATS,
    }
    return ok(view)
  },

  async admin(v) {
    if (v.lens !== 'admin') denied()
    const a = getAnalysis()
    const w = a.world
    const grades = [4, 6].map((g) => {
      const cls = w.classes.filter((c) => c.grade === g)
      return { grade: g, gradeLabel: cls[0].gradeLabel, classCount: cls.length, studentCount: cls.reduce((s, c) => s + c.studentIds.length, 0) }
    })
    const cells: AdminCell[] = []
    const progress: AdminOverview['progress'] = []
    const compRows = new Map<SubjectCode, { grade: number; gradeLabel: string; deltaVsNorm: number }[]>()
    let hidden = 0
    for (const g of grades) {
      const subjects = [...new Set(w.students.filter((s) => s.grade === g.grade).flatMap((s) => s.subjects))]
      for (const sub of subjects) {
        const members = w.students.filter((s) => s.grade === g.grade && s.subjects.includes(sub))
        if (!cellVisible(members.length)) {
          cells.push({ status: 'hidden', grade: g.grade, gradeLabel: g.gradeLabel, subject: sref(sub), reason: 'small_cell', text: ADMIN_HIDDEN_CELL_TEXT })
          hidden++
          continue
        }
        const sas = members.map((s) => a.ss.get(skey(s.id, sub))!)
        const lv = sas.map((x) => x.currentLevel).filter((x): x is number => x !== null)
        const norm = a.ageNormOf(g.grade)
        const diffs = sas.filter((x) => x.level60 !== null && x.level90to150 !== null).map((x) => (x.level60 as number) - (x.level90to150 as number))
        const avg = round1(mean(lv))
        const position = positionOf(avg, norm) as Position
        const trend = cellVisible(diffs.length) ? trendOfDelta(mean(diffs)) : 'insufficient'
        cells.push({
          status: 'shown', grade: g.grade, gradeLabel: g.gradeLabel, subject: sref(sub), studentCount: members.length,
          avgLevel: avg, normCenter: norm.center, deltaVsNorm: round1(avg - norm.center),
          trendDelta: diffs.length ? round1(mean(diffs)) : 0,
          position, positionText: positionText(position) as string, trend, trendText: groupTrendText(trend),
        })
        compRows.set(sub, [...(compRows.get(sub) ?? []), { grade: g.grade, gradeLabel: g.gradeLabel, deltaVsNorm: round1(avg - norm.center) }])
        /* התקדמות: ממוצע חודשי על פני תלמידים; חודש עם < MIN_CELL_SIZE תלמידים לא מוצג */
        progress.push({
          grade: g.grade, subject: sref(sub),
          series: classMonthlySeries(sas, 5).map((p) => ({ date: p.date, avgLevel: p.level, n: p.n })),
        })
      }
    }
    const miss: AdminOverview['misconceptions'] = []
    for (const m of MISCONCEPTIONS) for (const g of grades) {
      const stat = a.misByGrade.get(`${g.grade}|${m.id}`)
      if (!stat || stat.sharePct === null || !cellVisible(stat.studentsExposed)) continue
      const goal = goalById(conceptByKey(m.conceptKey)?.goalId ?? null)
      miss.push({
        id: m.id, titleHe: m.titleHe, text: narrateAdminMisconception(m.titleHe, stat.studentsShowing, stat.studentsExposed, g.gradeLabel),
        subject: sref(m.subject), grade: g.grade, gradeLabel: g.gradeLabel,
        sharePct: stat.sharePct, studentsShowing: stat.studentsShowing, studentsExposed: stat.studentsExposed,
        countText: studentsCountText(stat.studentsShowing, stat.studentsExposed),
        curriculumGoal: goal ? { title: goal.title, gradeFrom: goal.gradeFrom, gradeTo: goal.gradeTo, mappingStatus: 'sample' } : null,
      })
    }
    miss.sort((x, y) => y.sharePct - x.sharePct)

    /* חיתוכים לטאבים: שכבות (שורה לכל שכבה) ומקצועות (שורה לכל מקצוע) — מאותם תאים */
    const shownIn = (xs: AdminCell[]): Extract<AdminCell, { status: 'shown' }>[] => xs.filter((c): c is Extract<AdminCell, { status: 'shown' }> => c.status === 'shown')
    const gradeRows: AdminOverview['gradeRows'] = grades.map((g) => {
      const mine = cells.filter((c) => c.grade === g.grade)
      const sh = shownIn(mine)
      const n = (p: Position): number => sh.filter((c) => c.position === p).length
      return { ...g, summary: narrateAdminGradeSummary(g.gradeLabel, n('above'), n('within'), n('below')), cells: mine }
    })
    const subjectCodes = [...new Set(cells.map((c) => c.subject.code))]
    const subjectRows: AdminOverview['subjectRows'] = subjectCodes.map((code) => {
      const mine = cells.filter((c) => c.subject.code === code).sort((x, y) => x.grade - y.grade)
      return {
        subject: sref(code),
        summary: narrateAdminSubjectSummary(subjectName(code), mine.map((c) => ({ gradeLabel: c.gradeLabel, position: c.status === 'shown' ? c.position : null }))),
        cells: mine,
      }
    })
    const shownAll = shownIn(cells)
    const worstBelow = shownAll.filter((c) => c.position === 'below').sort((x, y) => x.deltaVsNorm - y.deltaVsNorm)[0]
    const bestAbove = shownAll.filter((c) => c.position === 'above').sort((x, y) => y.deltaVsNorm - x.deltaVsNorm)[0]
    const focus = worstBelow ?? bestAbove
    const highlights = [
      narrateAdminSchool(grades.length, w.classes.length, w.students.length),
      ...(focus ? [narrateAdminPosition(focus.gradeLabel, subjectName(focus.subject.code), focus.position)] : []),
      ...(miss[0] ? [miss[0].text] : []),
    ].slice(0, 3)

    const out: AdminOverview = {
      school: w.school, highlights, grades, gradeRows, subjectRows, cells, progress,
      comparisons: [...compRows.entries()].filter(([, rows]) => rows.length >= 2).map(([sub, rows]) => ({ subject: sref(sub), rows })),
      misconceptions: miss, hiddenCells: hidden, caveats: CAVEATS,
    }
    return ok(out)
  },

  async briefing(v, scope, id) {
    const a = getAnalysis()
    const w = a.world
    requireNotAdmin(v)
    const generatedAt = w.now.toISOString()
    const startIso = w.days[Math.min(w.days.length - 1, 179)]
    const endIso = w.days[0]
    type Item = Briefing['sections'][number]['items'][number]

    /* סעיף "איך חישבנו?" — המקום היחיד בתדריך שבו מופיעים מונחים/מספרים טכניים */
    const howSection = (items: Item[]): Briefing['sections'][number] => ({
      id: 'how_we_calculated', title: BRIEFING_SECTION_TITLES.how_we_calculated,
      items: [{ text: HOW_WE_CALC.methodNote, subjectCode: null, evidence: [] }, ...items],
    })
    const howItem = (f: ReportedFinding, sub: SubjectCode | null): Item => ({
      text: HOW_WE_CALC.itemLabel(f.kind, sub ? subjectName(sub) : null), subjectCode: sub,
      evidence: HOW_WE_CALC.evidenceLines(f.n, f.pAdjusted, f.effectSize, f.window.start, f.window.end),
    })
    const plainBasis = (f: ReportedFinding): string[] => [basisLine(basisWhat(f.evidence), f.window.start, f.window.end)]

    if (scope === 'student') {
      const st = a.studentById.get(id) ?? notFound()
      if (!canViewStudent(v, st.classId)) denied()
      const cls = a.classById.get(st.classId)!
      const visible = st.subjects.filter((s) => canViewSubject(v, s))
      const strengths: Item[] = []
      const difficulties: Item[] = []
      const trend: Item[] = []
      const recs: Item[] = []
      const unknowns: Item[] = []
      const basis: Item[] = []
      const how: Item[] = []
      const areaStrengths: { gap: number; item: Item }[] = []
      const areaGaps: { gap: number; item: Item }[] = []
      for (const sub of visible) {
        const sa = a.ss.get(skey(id, sub))!
        const nm = subjectName(sub)
        if (sa.currentLevel !== null && sa.positionVsNorm === 'above') strengths.push({ text: narrateStrengthAbove(nm, sa.currentLevel, sa.ageNorm.center), subjectCode: sub, evidence: [normBandLine(sa.ageNorm.low, sa.ageNorm.high), basedOnSessions(sa.sessionsCount)] })
        if (sa.currentLevel !== null && sa.positionVsNorm === 'below') difficulties.push({ text: narrateDifficultyBelow(nm, sa.currentLevel, sa.ageNorm.center), subjectCode: sub, evidence: [normBandLine(sa.ageNorm.low, sa.ageNorm.high), basedOnSessions(sa.sessionsCount)] })
        /* תחומים: החזק והמאתגר ביותר במקצוע, מול רמת הייחוס של התחומים; בתדריך כולו מוצגים הבולטים ביותר בלבד */
        const ref = areaReference(sa)
        const reportedVec = sa.contentVectors.filter((c) => c.status === 'reported' && c.level !== null)
        if (ref !== null && reportedVec.length) {
          const top = [...reportedVec].sort((x, y) => (y.level as number) - (x.level as number))[0]
          const low = [...reportedVec].sort((x, y) => (x.level as number) - (y.level as number))[0]
          if ((top.level as number) - ref >= AREA_MIN_DELTA) areaStrengths.push({ gap: (top.level as number) - ref, item: { text: narrateVectorStrength(top.key, nm, top.level as number, ref), subjectCode: sub, evidence: [basedOnChallenges(top.n)] } })
          if (ref - (low.level as number) >= AREA_MIN_DELTA) areaGaps.push({ gap: ref - (low.level as number), item: { text: narrateVectorGap(low.key, nm, low.level as number, ref), subjectCode: sub, evidence: [basedOnChallenges(low.n)] } })
        }
        for (const f of sa.findings) {
          if (f.status === 'reported') {
            const item: Item = { text: f.text, subjectCode: sub, evidence: plainBasis(f) }
            how.push(howItem(f, sub))
            if (f.kind === 'level_trend' && f.evidence.kind === 'level_trend') {
              trend.push(item)
              if (f.tone === 'positive') strengths.push(item)
              else difficulties.push({ text: narrateDifficultyFromTrend(nm, f.evidence.changeDate, f.evidence.deltaLevels), subjectCode: sub, evidence: item.evidence })
            } else difficulties.push(item)
            recs.push({ text: narrateRecommendationFromFinding(f.evidence, { studentName: st.firstName, subjectName: nm }), subjectCode: sub, evidence: [] })
          } else unknowns.push({ text: f.text, subjectCode: sub, evidence: [needMoreLine(f.kind, f.n, f.minN)] })
        }
        basis.push({ text: narrateEvidenceWindow(startIso, endIso, sa.sessionsCount, nm), subjectCode: sub, evidence: [] })
      }
      const mostNotable = (xs: { gap: number; item: Item }[]): Item[] => [...xs].sort((x, y) => y.gap - x.gap).slice(0, BRIEFING_MAX_AREAS).map((x) => x.item)
      strengths.push(...mostNotable(areaStrengths))
      difficulties.push(...mostNotable(areaGaps))
      if (canSeeCrossSubject(v)) for (const f of a.crossSubject.get(id) ?? []) {
        if (f.status !== 'reported') continue
        trend.push({ text: f.text, subjectCode: null, evidence: plainBasis(f) })
        how.push(howItem(f, null))
        recs.push({ text: narrateRecommendationFromFinding(f.evidence, { studentName: st.firstName }), subjectCode: null, evidence: [] })
      }
      unknowns.push({ text: EVIDENCE_LIMITS_NOTE, subjectCode: null, evidence: [] })
      const b: Briefing = {
        scope: 'student', entityId: id, title: briefingTitleStudent(st.displayName),
        subtitle: briefingSubtitleStudent(cls.name, v.lens === 'subject_teacher' ? visible.map(subjectName) : null),
        generatedAt,
        sections: [
          { id: 'strengths', title: BRIEFING_SECTION_TITLES.strengths, items: strengths },
          { id: 'difficulties', title: BRIEFING_SECTION_TITLES.difficulties, items: difficulties },
          { id: 'trend', title: BRIEFING_SECTION_TITLES.trend, items: trend },
          { id: 'recommendations', title: BRIEFING_SECTION_TITLES.recommendations, items: dedupeByText(recs) },
          { id: 'unknowns', title: BRIEFING_SECTION_TITLES.unknowns, items: unknowns },
          { id: 'evidence_basis', title: BRIEFING_SECTION_TITLES.evidence_basis, items: basis },
          howSection(how),
        ],
        caveats: CAVEATS,
      }
      return ok(b)
    }

    /* כיתה */
    const cls = a.classById.get(id) ?? notFound()
    const subjects: SubjectCode[] = v.lens === 'subject_teacher'
      ? v.subjectCodes.filter((s) => canViewClassSubject(v, id, s))
      : v.homeroomClassId === id ? [...new Set(cls.studentIds.flatMap((sid) => a.studentById.get(sid)!.subjects))] : []
    if (!subjects.length) denied()
    const strengths: Item[] = []
    const difficulties: Item[] = []
    const trend: Item[] = []
    const recs: Item[] = []
    const unknowns: Item[] = []
    const basis: Item[] = []
    const how: Item[] = []
    for (const sub of subjects) {
      const nm = subjectName(sub)
      for (const x of a.classFindings.get(id) ?? []) {
        if (x.subject !== sub) continue
        if (x.finding.status === 'reported') {
          const f = x.finding
          const it: Item = { text: f.text, subjectCode: sub, evidence: plainBasis(f) }
          trend.push(it)
          how.push(howItem(f, sub))
          if (f.tone === 'positive') strengths.push(it)
          recs.push({ text: narrateRecommendationFromFinding(f.evidence, { subjectName: nm }), subjectCode: sub, evidence: [] })
        } else unknowns.push({ text: x.finding.text, subjectCode: sub, evidence: [needMoreLine(x.finding.kind, x.finding.n, x.finding.minN)] })
      }
      const rows = MISCONCEPTIONS.filter((m) => m.subject === sub && m.prevalence[cls.grade as 4 | 6] !== undefined)
        .map((m) => ({ m, s: a.misByClass.get(`${id}|${m.id}`)! })).filter((x) => x.s.sharePct !== null).sort((x, y) => (y.s.sharePct as number) - (x.s.sharePct as number))
      for (const { m, s } of rows.slice(0, 2)) {
        const c = conceptByKey(m.conceptKey)
        difficulties.push({
          text: narrateRecommendation({ titleHe: m.titleHe, conceptTitle: c?.titleHe ?? m.conceptKey, studentsShowing: s.studentsShowing, studentsExposed: s.studentsExposed, sharePct: s.sharePct as number }, !!m.linkedQuest),
          subjectCode: sub, evidence: [studentsCountText(s.studentsShowing, s.studentsExposed), exposuresLine(MISCONCEPTION_RULE.minExposuresPerStudent)],
        })
      }
      const sessions = cls.studentIds.filter((sid) => a.studentById.get(sid)!.subjects.includes(sub)).reduce((sum, sid) => sum + a.ss.get(skey(sid, sub))!.sessionsCount, 0)
      basis.push({ text: narrateEvidenceWindow(startIso, endIso, sessions, nm), subjectCode: sub, evidence: [] })
    }
    unknowns.push({ text: EVIDENCE_LIMITS_NOTE, subjectCode: null, evidence: [] })
    const b: Briefing = {
      scope: 'class', entityId: id, title: briefingTitleClass(cls.name),
      subtitle: briefingSubtitleClass(subjects.map(subjectName)), generatedAt,
      sections: [
        { id: 'strengths', title: BRIEFING_SECTION_TITLES.strengths, items: strengths },
        { id: 'difficulties', title: BRIEFING_SECTION_TITLES.difficulties, items: difficulties },
        { id: 'trend', title: BRIEFING_SECTION_TITLES.trend, items: trend },
        { id: 'recommendations', title: BRIEFING_SECTION_TITLES.recommendations, items: dedupeByText(recs) },
        { id: 'unknowns', title: BRIEFING_SECTION_TITLES.unknowns, items: unknowns },
        { id: 'evidence_basis', title: BRIEFING_SECTION_TITLES.evidence_basis, items: basis },
        howSection(how),
      ],
      caveats: CAVEATS,
    }
    return ok(b)
  },
}

function dedupeByText<T extends { text: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((i) => (seen.has(i.text) ? false : (seen.add(i.text), true)))
}
