/* ──────────────────────────────────────────────────────────────────────────
   demoProvider — ספק ההדגמה של האנליטיקה החדשה. מממש את חוזה analyticsV2 על עולם הדמו (demoWorld+engine).
   · ההרשאות נאכפות כאן, לפי ה-V2Viewer, ולא במסכים: מנהל לעולם לא מקבל שם/מזהה תלמיד;
     מורה מקצועי לא מקבל נתוני מקצוע אחר; מחנך מקבל הכול כולל התרעות חוצות-מקצועות.
   · כל טקסט בשפה טבעית מגיע מ-findingsNarrative (אין מחרוזות ממצא כאן).
   ────────────────────────────────────────────────────────────────────────── */
import { MISCONCEPTION_RULE } from '../../../../src/shared/lib/analyticsConfig.js'
import {
  BRIEFING_SECTION_TITLES, ERR_NOT_FOUND, ERR_NO_ACCESS, briefingTitleClass, briefingTitleStudent, exposuresLine, needMoreLine, normBandLine,
  CAVEAT_AGE_NORM, CAVEAT_CROSS_SUBJECT, CAVEAT_TREND, NOTICE_CURRICULUM_SAMPLE, NOTICE_DEMO_DATA, EVIDENCE_LIMITS_NOTE, EVIDENCE_METHOD_NOTE, evidenceLines,
  narrateAdminMisconception, narrateDifficultyBelow, narrateDifficultyFromTrend, narrateEvidenceWindow, narrateFeedbackGrowth, narrateFeedbackHeadline,
  narrateFeedbackNextStep, narrateFeedbackStreak, joinSubjectNames, narrateRecommendation, narrateRecommendationFromFinding, narrateStrengthAbove,
  narrateVectorGap, narrateVectorStrength,
} from '../../../../src/shared/lib/findingsNarrative.js'
import { subjectName, type SubjectCode } from '../../../../src/shared/lib/subjects.js'
import type {
  AdminCell, AdminOverview, AnalyticsConfig, Briefing, ClassSubjectView, Envelope, Finding, MisconceptionRow, Roster,
  StudentFeedback, StudentOverview, SubjectPanel, SubjectRef,
} from '../../../../src/shared/types/analyticsV2.js'
import { AppError } from '../../middleware/errors.js'
import {
  DEMO_SUBJECT_PERSONAS, canSeeCrossSubject, canViewClassSubject, canViewStudent, canViewSubject, cellVisible, requireNotAdmin, type V2Viewer,
} from './access.js'
import { CONCEPTS, MISCONCEPTIONS, conceptByKey, goalById, type MisconceptionDef } from './catalog.js'
import { skey, getWorld } from './demoWorld.js'
import { analyze, type Analysis, type MisStat, type SubjectAnalysis } from './engine.js'
import type { AnalyticsV2Provider } from './provider.js'
import { mean } from './stats.js'

const ok = <T>(data: T): Envelope<T> => ({ dataState: 'ok', data })
const sref = (code: SubjectCode): SubjectRef => ({ code, nameHe: subjectName(code) })
const CAVEATS = { ageNorm: CAVEAT_AGE_NORM, crossSubject: CAVEAT_CROSS_SUBJECT, trend: CAVEAT_TREND }

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
function panelOf(v: V2Viewer, a: Analysis, sa: SubjectAnalysis): SubjectPanel {
  if (!canViewSubject(v, sa.subject)) return { access: 'greyed', subject: sref(sa.subject) }
  return {
    access: 'visible', subject: sref(sa.subject), currentLevel: sa.currentLevel, levelSeries: sa.levelSeries,
    ageNorm: sa.ageNorm, positionVsNorm: sa.positionVsNorm, sessionsCount: sa.sessionsCount,
    contentVectors: sa.contentVectors, behaviorVectors: sa.behaviorVectors, findings: sa.findings,
  }
}

function misRow(a: Analysis, m: MisconceptionDef, stat: MisStat, showStudents: boolean): MisconceptionRow {
  const concept = conceptByKey(m.conceptKey)
  const goal = goalById(concept?.goalId ?? null)
  return {
    id: m.id, code: m.code, titleHe: m.titleHe, descriptionHe: m.descriptionHe,
    conceptKey: m.conceptKey, conceptTitle: concept?.titleHe ?? m.conceptKey, subjectCode: m.subject,
    curriculumGoal: goal ? { title: goal.title, gradeFrom: goal.gradeFrom, gradeTo: goal.gradeTo, mappingStatus: 'sample' } : null,
    status: stat.sharePct === null ? 'insufficient' : 'reported',
    studentsShowing: stat.studentsShowing, studentsExposed: stat.studentsExposed, sharePct: stat.sharePct,
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
    const w = a.world
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
    void w
    return ok(r)
  },

  async student(v, id) {
    const a = getAnalysis()
    const st = a.studentById.get(id) ?? notFound()
    requireNotAdmin(v)
    if (!canViewStudent(v, st.classId)) denied()
    const cls = a.classById.get(st.classId)!
    const panels = st.subjects.map((sub) => panelOf(v, a, a.ss.get(skey(id, sub))!))
    const o: StudentOverview = {
      student: { id, displayName: st.displayName, classId: cls.id, className: cls.name, grade: st.grade, gradeLabel: cls.gradeLabel },
      access: v.lens === 'homeroom' ? 'full' : 'subject_only',
      panels,
      crossSubject: canSeeCrossSubject(v) ? (a.crossSubject.get(id) ?? []) : [],
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

  async classSubject(v, classId, subject) {
    const a = getAnalysis()
    const cls = a.classById.get(classId) ?? notFound()
    requireNotAdmin(v)
    if (!canViewClassSubject(v, classId, subject)) denied()
    const studentIds = cls.studentIds.filter((sid) => a.studentById.get(sid)!.subjects.includes(subject))
    if (!studentIds.length) notFound()
    const levels = studentIds.map((sid) => a.ss.get(skey(sid, subject))!.currentLevel).filter((x): x is number => x !== null)
    const norm = a.ageNormOf(cls.grade)

    const defs = MISCONCEPTIONS.filter((m) => m.subject === subject && m.prevalence[cls.grade as 4 | 6] !== undefined)
    const rows = defs.map((m) => misRow(a, m, a.misByClass.get(`${classId}|${m.id}`)!, true)).sort((x, y) => (y.sharePct ?? -1) - (x.sharePct ?? -1))
    const recs = rows.filter((r) => r.status === 'reported' && (r.sharePct ?? 0) >= 20).slice(0, 3).map((r, i) => ({
      rank: i + 1, misconceptionId: r.id, linkedQuest: r.linkedQuest,
      text: narrateRecommendation({ titleHe: r.titleHe, conceptTitle: r.conceptTitle, studentsShowing: r.studentsShowing, studentsExposed: r.studentsExposed, sharePct: r.sharePct as number, minHits: MISCONCEPTION_RULE.minHitsPerStudent }, !!r.linkedQuest),
    }))
    const classFindings = (a.classFindings.get(classId) ?? []).filter((x) => x.subject === subject).map((x) => x.finding)
    const studentFindings = studentIds.flatMap((sid) => a.ss.get(skey(sid, subject))!.findings.map((finding) => ({ studentId: sid, studentName: a.studentById.get(sid)!.displayName, finding })))
    const otherSubjects = v.lens === 'subject_teacher'
      ? [...new Set(cls.studentIds.flatMap((sid) => a.studentById.get(sid)!.subjects))].filter((s) => s !== subject).map(sref)
      : []
    const view: ClassSubjectView = {
      class: { id: cls.id, name: cls.name, gradeLabel: cls.gradeLabel, studentCount: cls.studentIds.length },
      subject: sref(subject),
      classLevel: { mean: levels.length ? Math.round(mean(levels) * 10) / 10 : null, ageNorm: norm },
      misconceptions: rows, recommendations: recs, classFindings, studentFindings,
      students: studentIds.map((sid) => {
        const sa = a.ss.get(skey(sid, subject))!
        return { id: sid, displayName: a.studentById.get(sid)!.displayName, level: sa.currentLevel, positionVsNorm: sa.positionVsNorm }
      }),
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
        if (!cellVisible(members.length)) { cells.push({ status: 'hidden', grade: g.grade, subject: sref(sub), reason: 'small_cell' }); hidden++; continue }
        const sas = members.map((s) => a.ss.get(skey(s.id, sub))!)
        const lv = sas.map((x) => x.currentLevel).filter((x): x is number => x !== null)
        const norm = a.ageNormOf(g.grade)
        const diffs = sas.filter((x) => x.level60 !== null && x.level90to150 !== null).map((x) => (x.level60 as number) - (x.level90to150 as number))
        const avg = Math.round(mean(lv) * 10) / 10
        cells.push({
          status: 'shown', grade: g.grade, subject: sref(sub), studentCount: members.length,
          avgLevel: avg, normCenter: norm.center, deltaVsNorm: Math.round((avg - norm.center) * 10) / 10,
          trendDelta: diffs.length ? Math.round(mean(diffs) * 10) / 10 : 0,
        })
        compRows.set(sub, [...(compRows.get(sub) ?? []), { grade: g.grade, gradeLabel: g.gradeLabel, deltaVsNorm: Math.round((avg - norm.center) * 10) / 10 }])
        /* התקדמות: ממוצע חודשי על פני תלמידים; חודש עם < MIN_CELL_SIZE תלמידים לא מוצג */
        const byMonth = new Map<string, Map<string, number[]>>()
        for (const sa of sas) for (const p of sa.levelSeries) {
          const mk = p.date.slice(0, 7)
          const m = byMonth.get(mk) ?? new Map<string, number[]>()
          m.set(sa.studentId, [...(m.get(sa.studentId) ?? []), p.level])
          byMonth.set(mk, m)
        }
        const series = [...byMonth.entries()].sort(([x], [y]) => x.localeCompare(y))
          .filter(([, m]) => cellVisible(m.size))
          .map(([mk, m]) => ({ date: `${mk}-01T12:00:00.000Z`, avgLevel: Math.round(mean([...m.values()].map((l) => mean(l))) * 10) / 10, n: m.size }))
        progress.push({ grade: g.grade, subject: sref(sub), series })
      }
    }
    const miss: AdminOverview['misconceptions'] = []
    for (const m of MISCONCEPTIONS) for (const g of grades) {
      const stat = a.misByGrade.get(`${g.grade}|${m.id}`)
      if (!stat || stat.sharePct === null || !cellVisible(stat.studentsExposed)) continue
      const goal = goalById(conceptByKey(m.conceptKey)?.goalId ?? null)
      miss.push({
        id: m.id, titleHe: m.titleHe, text: narrateAdminMisconception(m.titleHe, stat.sharePct, g.gradeLabel), subject: sref(m.subject), grade: g.grade, gradeLabel: g.gradeLabel,
        sharePct: stat.sharePct, studentsExposed: stat.studentsExposed,
        curriculumGoal: goal ? { title: goal.title, gradeFrom: goal.gradeFrom, gradeTo: goal.gradeTo, mappingStatus: 'sample' } : null,
      })
    }
    miss.sort((x, y) => y.sharePct - x.sharePct)
    const out: AdminOverview = {
      school: w.school, grades, cells, progress,
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

    if (scope === 'student') {
      const st = a.studentById.get(id) ?? notFound()
      if (!canViewStudent(v, st.classId)) denied()
      const cls = a.classById.get(st.classId)!
      const visible = st.subjects.filter((s) => canViewSubject(v, s))
      const strengths: Briefing['sections'][number]['items'] = []
      const difficulties: typeof strengths = []
      const trend: typeof strengths = []
      const recs: typeof strengths = []
      const unknowns: typeof strengths = []
      const basis: typeof strengths = []
      for (const sub of visible) {
        const sa = a.ss.get(skey(id, sub))!
        const nm = subjectName(sub)
        if (sa.currentLevel !== null && sa.positionVsNorm === 'above') strengths.push({ text: narrateStrengthAbove(nm, sa.currentLevel, sa.ageNorm.center), subjectCode: sub, evidence: [normBandLine(sa.ageNorm.low, sa.ageNorm.high), `${sa.sessionsCount} הדמיות`] })
        if (sa.currentLevel !== null && sa.positionVsNorm === 'below') difficulties.push({ text: narrateDifficultyBelow(nm, sa.currentLevel, sa.ageNorm.center), subjectCode: sub, evidence: [normBandLine(sa.ageNorm.low, sa.ageNorm.high), `${sa.sessionsCount} הדמיות`] })
        const reportedVec = sa.contentVectors.filter((c) => c.status === 'reported' && c.level !== null)
        if (sa.currentLevel !== null && reportedVec.length) {
          const top = [...reportedVec].sort((x, y) => (y.level as number) - (x.level as number))[0]
          const low = [...reportedVec].sort((x, y) => (x.level as number) - (y.level as number))[0]
          if ((top.level as number) - sa.currentLevel >= 1) strengths.push({ text: narrateVectorStrength(top.key, nm, top.level as number), subjectCode: sub, evidence: [`N = ${top.n}`] })
          if (sa.currentLevel - (low.level as number) >= 1.5) difficulties.push({ text: narrateVectorGap(low.key, nm, low.level as number, sa.currentLevel), subjectCode: sub, evidence: [`N = ${low.n}`] })
        }
        for (const f of sa.findings) {
          if (f.status === 'reported') {
            const item = { text: f.text, subjectCode: sub as SubjectCode | null, evidence: evidenceLines(f.n, f.pAdjusted, f.effectSize, f.window.start, f.window.end) }
            if (f.kind === 'level_trend' && f.evidence.kind === 'level_trend') {
              trend.push(item)
              if (f.tone === 'positive') strengths.push(item)
              else difficulties.push({ text: narrateDifficultyFromTrend(nm, f.evidence.changeDate, f.evidence.deltaLevels), subjectCode: sub, evidence: item.evidence })
            } else difficulties.push(item)
            recs.push({ text: narrateRecommendationFromFinding(f.evidence, { studentName: st.firstName, subjectName: nm }), subjectCode: sub, evidence: [] })
          } else unknowns.push({ text: f.text, subjectCode: sub, evidence: [needMoreLine(f.n, f.minN)] })
        }
        basis.push({ text: narrateEvidenceWindow(startIso, endIso, sa.sessionsCount, nm), subjectCode: sub, evidence: [] })
      }
      if (canSeeCrossSubject(v)) for (const f of a.crossSubject.get(id) ?? []) {
        trend.push({ text: f.text, subjectCode: null, evidence: evidenceLines(f.n, f.pAdjusted, f.effectSize, f.window.start, f.window.end) })
        if (f.status === 'reported') recs.push({ text: narrateRecommendationFromFinding(f.evidence, { studentName: st.firstName }), subjectCode: null, evidence: [] })
      }
      unknowns.push({ text: EVIDENCE_LIMITS_NOTE, subjectCode: null, evidence: [] })
      basis.push({ text: EVIDENCE_METHOD_NOTE, subjectCode: null, evidence: [] })
      const b: Briefing = {
        scope: 'student', entityId: id, title: briefingTitleStudent(st.displayName),
        subtitle: `כיתה ${cls.name}${v.lens === 'subject_teacher' ? ` · ${visible.map(subjectName).join(', ')}` : ''}`,
        generatedAt,
        sections: [
          { id: 'strengths', title: BRIEFING_SECTION_TITLES.strengths, items: strengths },
          { id: 'difficulties', title: BRIEFING_SECTION_TITLES.difficulties, items: difficulties },
          { id: 'trend', title: BRIEFING_SECTION_TITLES.trend, items: trend },
          { id: 'recommendations', title: BRIEFING_SECTION_TITLES.recommendations, items: dedupeByText(recs) },
          { id: 'unknowns', title: BRIEFING_SECTION_TITLES.unknowns, items: unknowns },
          { id: 'evidence_basis', title: BRIEFING_SECTION_TITLES.evidence_basis, items: basis },
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
    const strengths: Briefing['sections'][number]['items'] = []
    const difficulties: typeof strengths = []
    const trend: typeof strengths = []
    const recs: typeof strengths = []
    const unknowns: typeof strengths = []
    const basis: typeof strengths = []
    for (const sub of subjects) {
      const nm = subjectName(sub)
      for (const x of a.classFindings.get(id) ?? []) {
        if (x.subject !== sub) continue
        if (x.finding.status === 'reported') {
          const it = { text: x.finding.text, subjectCode: sub as SubjectCode | null, evidence: evidenceLines(x.finding.n, x.finding.pAdjusted, x.finding.effectSize, x.finding.window.start, x.finding.window.end) }
          trend.push(it)
          if (x.finding.tone === 'positive') strengths.push(it)
          recs.push({ text: narrateRecommendationFromFinding(x.finding.evidence, { subjectName: nm }), subjectCode: sub, evidence: [] })
        } else unknowns.push({ text: x.finding.text, subjectCode: sub, evidence: [needMoreLine(x.finding.n, x.finding.minN)] })
      }
      const rows = MISCONCEPTIONS.filter((m) => m.subject === sub && m.prevalence[cls.grade as 4 | 6] !== undefined)
        .map((m) => ({ m, s: a.misByClass.get(`${id}|${m.id}`)! })).filter((x) => x.s.sharePct !== null).sort((x, y) => (y.s.sharePct as number) - (x.s.sharePct as number))
      for (const { m, s } of rows.slice(0, 2)) {
        const c = conceptByKey(m.conceptKey)
        difficulties.push({
          text: narrateRecommendation({ titleHe: m.titleHe, conceptTitle: c?.titleHe ?? m.conceptKey, studentsShowing: s.studentsShowing, studentsExposed: s.studentsExposed, sharePct: s.sharePct as number, minHits: MISCONCEPTION_RULE.minHitsPerStudent }, !!m.linkedQuest),
          subjectCode: sub, evidence: [`${s.studentsShowing} מתוך ${s.studentsExposed} תלמידים`, exposuresLine(MISCONCEPTION_RULE.minExposuresPerStudent)],
        })
      }
      basis.push({ text: narrateEvidenceWindow(startIso, endIso, cls.studentIds.length, nm), subjectCode: sub, evidence: [] })
    }
    unknowns.push({ text: EVIDENCE_LIMITS_NOTE, subjectCode: null, evidence: [] })
    basis.push({ text: EVIDENCE_METHOD_NOTE, subjectCode: null, evidence: [] })
    const b: Briefing = {
      scope: 'class', entityId: id, title: briefingTitleClass(cls.name),
      subtitle: subjects.map(subjectName).join(', '), generatedAt,
      sections: [
        { id: 'strengths', title: BRIEFING_SECTION_TITLES.strengths, items: strengths },
        { id: 'difficulties', title: BRIEFING_SECTION_TITLES.difficulties, items: difficulties },
        { id: 'trend', title: BRIEFING_SECTION_TITLES.trend, items: trend },
        { id: 'recommendations', title: BRIEFING_SECTION_TITLES.recommendations, items: dedupeByText(recs) },
        { id: 'unknowns', title: BRIEFING_SECTION_TITLES.unknowns, items: unknowns },
        { id: 'evidence_basis', title: BRIEFING_SECTION_TITLES.evidence_basis, items: basis },
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
