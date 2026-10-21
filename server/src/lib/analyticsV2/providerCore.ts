/* ──────────────────────────────────────────────────────────────────────────
   providerCore — createProvider(source): מרכיב את תגובות החוזה של האנליטיקה החדשה מניתוח (Analysis) שמגיע ממקור (AnalyticsSource).
   ספק ההדגמה והספק החי הם אותו קוד; ההבדל היחיד הוא המקור (עולם הדמו בזיכרון / נתוני ה-DB).
   · ההרשאות נאכפות כאן, פר-כיתה, לפי ה-V2Viewer (access.ts): מנהל לעולם לא מקבל שם/מזהה תלמיד; מורה מקצועי לא מקבל
     נתוני מקצוע אחר; מחנך מקבל הכול (כולל התרעות חוצות-מקצועות) — רק בכיתות שבהן הוא מחנך.
   · ישות מחוץ להיקף הצופה (כיתה/תלמיד שאינם שלו, או שאינם קיימים) → 404 אחיד, כדי שלא יהיה אורקל קיום. 403 רק על תפקיד (מנהל מול מסך
     מורה) או על מקצוע/סקירה נעולים בכיתה שכן ברשות הצופה.
   · תמונת המנהל עוברת את כללי adminPrivacy: תורמים לא רשומים, מגמה/ממוצע רק מ-N מספיק, תא שכולו כיתה אחת (או שנשען בעיקר עליה) מוסתר, אין סכומים שניתן לחסר.
   · טענת רמה (מיקום מול הטווח המיועד, "הרמה בכיתה מתחת לטווח") רק מ-N מספיק: אישי — PERSONAL_LEVEL_MIN_SESSIONS משחקים; כיתתי — CLASS_LEVEL_MIN_STUDENTS תלמידים שעומדים בסף האישי;
     אחרת position=null, הכותרת אומרת "אין עדיין מספיק נתונים" ומה יקרה, ו-dataState='insufficient'.
   · כל טקסט בשפה טבעית מגיע מ-findingsNarrative (אין מחרוזות ממצא כאן; נאכף ב-noHardcodedText.test.ts).
   · החישובים הטהורים (מגמה, תחומים, ציר זמן, התרעות) ב-derive.ts.
   · תלמידים שנחשפו בשמם מדווחים ל-opts.audit; הנתיב כותב ליומן הגישה לפני שהתגובה נשלחת.
   ────────────────────────────────────────────────────────────────────────── */
import {
  CLASS_COMMON_ERROR_MIN_SHARE_PCT, CLASS_LEVEL_MIN_STUDENTS, ENTRY_MAX_ALERTS, ERRORS_TAB_TITLES_MAX, MISCONCEPTION_RULE, OVERVIEW_ALERT_TEXTS_MAX, PERSONAL_LEVEL_MIN_SESSIONS,
  PROGRESS_EVENTS_MAX, SUMMARY_RECENT_MAX, contentVectorLabel, type Position,
} from '../../../../src/shared/lib/analyticsConfig.js'
import {
  ADMIN_HIDDEN_CELL_DOMINANT_CLASS_TEXT, ADMIN_HIDDEN_CELL_SINGLE_CLASS_TEXT, ADMIN_HIDDEN_CELL_TEXT, ANALYTICS_CAVEATS, BRIEFING_SECTION_TITLES, ERR_NOT_FOUND, ERR_NO_ACCESS, EVIDENCE_LIMITS_NOTE, FEEDBACK_INTRO_TEXT, HOW_WE_CALC,
  basedOnChallenges, basedOnSessions, basisLine, basisWhat, briefingSubtitleClass, briefingSubtitleStudent, briefingTitleClass, briefingTitleStudent, exposuresLine,
  groupTrendText, joinSubjectNames, narrateAdminGradeSummary, narrateAdminMisconception, narrateAdminPosition, narrateAdminSchool, narrateAdminSchoolPartial,
  narrateAdminSubjectSummary, narrateAlertsMore, narrateAlertsTitle, narrateCoverageGaps, narrateDifficultyBelow, narrateDifficultyFromTrend, narrateErrorsTabSummary,
  narrateEvidenceWindow, narrateFeedbackGrowth, narrateFeedbackHeadline, narrateFeedbackNextStep, narrateFeedbackStreak, narrateMisconceptionInsufficient,
  narrateOverviewSummary, narrateProgressTabSummary, narrateRecommendation, narrateRecommendationFromFinding, narrateShort, narrateShortBody, narrateStrengthAbove,
  narrateStudentHeadline, narrateStudentsTabSummary, narrateSubjectHeadline, narrateUnclassifiedNote, narrateVectorGap, narrateVectorStrength, needMoreLine, normBandLine,
  positionText, studentsCountText, trendText, V2_CLIENT_TEXT,
} from '../../../../src/shared/lib/findingsNarrative.js'
import { subjectName, type SubjectCode } from '../../../../src/shared/lib/subjects.js'
import type {
  AdminCell, AdminOverview, AnalyticsConfig, Briefing, ClassOverview, ClassSubjectView, Entry, Envelope, Finding, MisconceptionRow, Roster,
  StudentFeedback, StudentOverview, SubjectPanel, SubjectRef,
} from '../../../../src/shared/types/analyticsV2.js'
import { AppError } from '../../middleware/errors.js'
import {
  accessAllowsSubject, accessSeesCrossSubject, canViewClassOverview, classSubjectAccess, grantOf, grantsOf, isAggregateOnly, isHomeroomOf, requireNotAdmin, studentAccess,
  type StudentAccess, type V2Viewer,
} from './access.js'
import {
  MIN_CELL_CLASSES, cellVerdict, gradeVisible, publishableMonthlySeries, publishableTrend, shareDisplay, totalsPublishable,
} from './adminPrivacy.js'
import type { MisconceptionDef } from './catalog.js'
import {
  areaDirection, classAreaKeys, classMonthlySeries, commonErrorsOf, compareAlert, compareHebrewNames, compareLevels, eventDate, groupTrend, isAttention, isReported,
  positionOf, studentAreaKeys, studentTrend, trendDelta, trendOfDelta, type ReportedFinding,
} from './derive.js'
import { skey, type WorldClass, type WorldStudent } from './demoWorld.js'
import type { Analysis, MisStat, SubjectAnalysis } from './engine.js'
import type { AnalyticsV2Provider } from './provider.js'
import type { AnalyticsSource } from './source.js'
import { mean } from './stats.js'

const ok = <T>(data: T): Envelope<T> => ({ dataState: 'ok', data })
/* dataState אמיתי: 'insufficient' רק כשאין בכלל מה להציג (הלקוח עדיין מציג את התוכן, כולל הסבר במילים) */
const state = <T>(hasData: boolean, data: T): Envelope<T> => ({ dataState: hasData ? 'ok' : 'insufficient', data })
const sref = (code: SubjectCode): SubjectRef => ({ code, nameHe: subjectName(code) })
const CAVEATS = ANALYTICS_CAVEATS
const round1 = (v: number): number => Math.round(v * 10) / 10
/* בתדריך של תלמיד/ה: כמה תחומים חזקים / מאתגרים בולטים מוצגים (מכל המקצועות יחד) */
const BRIEFING_MAX_AREAS = 2

function notFound(): never { throw new AppError(404, ERR_NOT_FOUND) }
function denied(): never { throw new AppError(403, ERR_NO_ACCESS) }

/* ממצאים מדווחים לפי טון */
const countTone = (fs: Finding[], tone: 'attention' | 'positive'): number => fs.filter((f) => f.status === 'reported' && f.tone === tone).length

/* ── עזרי הרשאה/נתונים ברמת תלמיד וכיתה ── */
const studentsOf = (a: Analysis, cls: WorldClass): WorldStudent[] => cls.studentIds.map((sid) => a.studentById.get(sid)).filter((s): s is WorldStudent => !!s)
const saOf = (a: Analysis, studentId: string, subject: SubjectCode): SubjectAnalysis | undefined => a.ss.get(skey(studentId, subject))
const defined = <T>(x: T | undefined): x is T => x !== undefined

/* ── סף N לטענות רמה ──
   רמה "נוכחית" היא ממוצע ארבעת המשחקים האחרונים: מתלמיד/ה עם משחק אחד היא עדיין לא טענה. מיקום מול הטווח המיועד (אישי) — רק מ-PERSONAL_LEVEL_MIN_SESSIONS משחקים. */
const hasEnoughSessions = (sa: Pick<SubjectAnalysis, 'sessionsCount'>): boolean => sa.sessionsCount >= PERSONAL_LEVEL_MIN_SESSIONS
const personalPosition = (sa: SubjectAnalysis): Position | null => (hasEnoughSessions(sa) ? sa.positionVsNorm : null)

/* ── הרשאה לתלמיד שרשום בכמה כיתות ──
   מקור האמת לכיתות התלמיד הוא world.classes[].studentIds; st.classId היא רק הכיתה העיקרית שלו (שנבחרה במיזוג הכיתות).
   ההרשאה היא **איחוד** ההרשאות של הצופה בכל כיתות התלמיד (כמו authz.studentScope): מחנך באחת + מקצוע בשנייה רואה מה שהיה רואה בכל כיתה לחוד,
   ולא יותר (תלמיד שרשום רק בכיתה הראשונה לא נחשף במקצוע של השנייה). מסך הכיתה, הרשימה, הכניסה והמסך האישי מסכימים כי כולם עוברים כאן. */
const CLASS_IDS_OF = new WeakMap<Analysis, Map<string, string[]>>()
function classIdsOfStudent(a: Analysis, st: WorldStudent): string[] {
  let byStudent = CLASS_IDS_OF.get(a)
  if (!byStudent) {
    byStudent = new Map()
    for (const c of a.world.classes) for (const sid of c.studentIds) { const list = byStudent.get(sid); if (list) list.push(c.id); else byStudent.set(sid, [c.id]) }
    CLASS_IDS_OF.set(a, byStudent)
  }
  return byStudent.get(st.id) ?? [st.classId]
}
const accessOf = (v: V2Viewer, a: Analysis, st: WorldStudent): StudentAccess => studentAccess(v, classIdsOfStudent(a, st))
/* המקצועות של התלמיד שגלויים לצופה (איחוד ההרשאות בכיתות התלמיד) */
const visibleSubjectsOf = (v: V2Viewer, a: Analysis, st: WorldStudent): SubjectCode[] => {
  const acc = accessOf(v, a, st)
  return st.subjects.filter((s) => accessAllowsSubject(acc, s))
}
/* תלמיד שמופיע ברשימת הכיתה classId של הצופה: מחנך הכיתה — כל תלמידיה (גם בלי נתונים); אחרת — מי שלומד מקצוע שהצופה רשאי לראות */
const isListed = (v: V2Viewer, a: Analysis, st: WorldStudent, classId: string): boolean => isHomeroomOf(v, classId) || visibleSubjectsOf(v, a, st).length > 0

/* ── שורות מקצוע ── */
/* רמת הייחוס לתחומים של תלמיד/ה: ממוצע הרמה בחלון שבו נמדדים התחומים (60 ימי הלימוד האחרונים); אם אין — הרמה הנוכחית */
const areaReference = (sa: SubjectAnalysis): number | null => sa.level60 ?? sa.currentLevel
function panelOf(acc: StudentAccess, a: Analysis, sa: SubjectAnalysis): SubjectPanel {
  if (!accessAllowsSubject(acc, sa.subject)) return { access: 'greyed', subject: sref(sa.subject) }
  const trend = studentTrend(sa)
  const areas = studentAreaKeys(sa.contentVectors, areaReference(sa))
  return {
    access: 'visible', subject: sref(sa.subject), currentLevel: sa.currentLevel, levelSeries: sa.levelSeries,
    ageNorm: sa.ageNorm, positionVsNorm: personalPosition(sa), positionText: positionText(personalPosition(sa)),
    trend, trendText: trendText(trend),
    areas: { strong: areas.strong.map(contentVectorLabel), challenging: areas.challenging.map(contentVectorLabel) },
    commonErrors: commonErrorsOf(a, sa.studentId, sa.subject),
    sessionsCount: sa.sessionsCount,
    contentVectors: sa.contentVectors, behaviorVectors: sa.behaviorVectors, findings: sa.findings,
  }
}

function misRow(a: Analysis, m: MisconceptionDef, stat: MisStat, showStudents: boolean): MisconceptionRow {
  const concept = a.catalog.conceptByKey(m.conceptKey)
  const goal = a.catalog.goalById(concept?.goalId ?? null)
  const reported = stat.sharePct !== null
  return {
    id: m.id, code: m.code, titleHe: m.titleHe, descriptionHe: m.descriptionHe,
    conceptKey: m.conceptKey, conceptTitle: concept?.titleHe ?? m.conceptKey, subjectCode: m.subject,
    curriculumGoal: goal ? { title: goal.title, gradeFrom: goal.gradeFrom, gradeTo: goal.gradeTo, mappingStatus: goal.mappingStatus } : null,
    status: reported ? 'reported' : 'insufficient',
    studentsShowing: stat.studentsShowing, studentsExposed: stat.studentsExposed, sharePct: stat.sharePct,
    countText: reported ? studentsCountText(stat.studentsShowing, stat.studentsExposed) : narrateMisconceptionInsufficient(stat.studentsExposed),
    students: showStudents ? stat.students.flatMap((s) => { const st = a.studentById.get(s.id); return st ? [{ id: s.id, displayName: st.displayName, hits: s.hits, exposures: s.exposures }] : [] }) : [],
    linkedQuest: m.linkedQuest,
  }
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
  const pairs = studentsOf(a, cls).filter((st) => st.subjects.includes(subject)).map((st) => ({ id: st.id, sa: saOf(a, st.id, subject) })).filter((p): p is { id: string; sa: SubjectAnalysis } => !!p.sa)
  const studentIds = pairs.map((p) => p.id)
  const sas = pairs.map((p) => p.sa)
  /* רמת הכיתה: רק כש-CLASS_LEVEL_MIN_STUDENTS תלמידים לפחות עומדים בסף האישי, והממוצע מהם בלבד (משחק בודד של מי שרק התחיל לא מכריע את הכיתה) */
  const qualifying = sas.filter(hasEnoughSessions)
  const levels = qualifying.length >= CLASS_LEVEL_MIN_STUDENTS ? qualifying.map((x) => x.currentLevel).filter((x): x is number => x !== null) : []
  const level = levels.length ? round1(mean(levels)) : null
  const refs = sas.map((x) => x.level60).filter((x): x is number => x !== null)
  const attention = sas
    .map((sa) => ({ studentId: sa.studentId, finding: sa.findings.filter(isAttention).sort(compareAlert)[0] }))
    .filter((x): x is { studentId: string; finding: ReportedFinding } => !!x.finding)
    .sort((x, y) => compareAlert(x.finding, y.finding) || x.studentId.localeCompare(y.studentId))
  return { studentIds, sas, level, areaReference: refs.length ? mean(refs) : null, position: positionOf(level, a.ageNormOf(cls.grade)), trend: groupTrend(sas), attention }
}

/* סדר הצגה קבוע של כיתות: לפי שכבה, אחר כך שם הכיתה (איסוף עברי), ובשוויון — המזהה */
const NAME_COLLATOR = new Intl.Collator('he')
const byGradeThenName = (x: WorldClass, y: WorldClass): number => x.grade - y.grade || NAME_COLLATOR.compare(x.name, y.name) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)

/* "כיתת התלמיד" כפי שהצופה רואה אותה — תמיד כיתה שבהיקפו, לא שם של כיתה אחרת: כיתה שהוא מחנך בה (אם יש), אחרת העיקרית של התלמיד אם יש לצופה הרשאה בה,
   אחרת הראשונה בהיקפו (שכבה ושם) */
function displayClassOf(v: V2Viewer, a: Analysis, st: WorldStudent): WorldClass | null {
  const mine = classIdsOfStudent(a, st).filter((id) => grantOf(v, id) !== null).map((id) => a.classById.get(id)).filter(defined)
  const pick = (xs: WorldClass[]): WorldClass | undefined => xs.find((c) => c.id === st.classId) ?? [...xs].sort(byGradeThenName)[0]
  return pick(mine.filter((c) => isHomeroomOf(v, c.id))) ?? pick(mine) ?? null
}

const ctxOf = (a: Analysis, studentId: string, f: Finding): { studentName: string; subjectName: string | null } => ({
  studentName: a.studentById.get(studentId)?.displayName ?? '',
  subjectName: f.subjectCode ? subjectName(f.subjectCode) : null,
})

function dedupeByText<T extends { text: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((i) => (seen.has(i.text) ? false : (seen.add(i.text), true)))
}

export function createProvider(source: AnalyticsSource): AnalyticsV2Provider {
  /* הכיתות שבהיקף הצופה: מהמקור, אך תמיד נחתכות מול ה-grants של הצופה (מקור שטועה לא יכול להרחיב הרשאה) ומדלגות על כיתה שחסרה בניתוח */
  const scoped = (v: V2Viewer, a: Analysis): WorldClass[] =>
    source.classIds(v, a).filter((id) => grantOf(v, id) !== null).map((id) => a.classById.get(id)).filter(defined).sort(byGradeThenName)
  /* מקצועות הכיתה: מה שהמקור מצהיר (גם בלי נתונים) + מה שלומדים תלמידיה — כך מקצוע שיש בו נתונים לא נעלם גם אם אינו רשום בשיוכי המורים */
  const subjectsOfClass = (a: Analysis, classId: string): SubjectCode[] => {
    const cls = a.classById.get(classId)
    const fromStudents = cls ? studentsOf(a, cls).flatMap((st) => st.subjects) : []
    return [...new Set([...source.classSubjects(a, classId), ...fromStudents])]
  }
  /* כיתה שהצופה רשאי לגשת אליה (404 אחיד כשלא) */
  const classInScope = (v: V2Viewer, a: Analysis, classId: string): WorldClass => {
    const cls = a.classById.get(classId)
    if (!cls || grantOf(v, classId) === null) return notFound()
    return cls
  }
  /* תלמיד שהצופה רשאי לפתוח (באחת מכיתותיו) + ההרשאה המאוחדת שלו + הכיתה שמוצגת לצופה. אחרת 404 אחיד */
  const studentInScope = (v: V2Viewer, a: Analysis, id: string): { st: WorldStudent; acc: StudentAccess; cls: WorldClass } => {
    const st = a.studentById.get(id)
    if (!st) return notFound()
    const acc = accessOf(v, a, st)
    const cls = acc.kind === 'scoped' ? displayClassOf(v, a, st) : null
    if (!cls) return notFound()
    return { st, acc, cls }
  }

  return {
    async config(v) {
      const parts = source.configParts(v)
      /* מנהל: אין רשימת כיתות ואין צורך בניתוח; אחרים: הכיתות שבהיקפם */
      const classes = isAggregateOnly(v) ? [] : scoped(v, await source.analysis(v)).map((c) => ({ id: c.id, name: c.name }))
      const cfg: AnalyticsConfig = {
        enabled: true, lens: v.lens,
        /* רק מורה אורח בוחר עדשה; לכל השאר — העדשה היחידה שלו */
        availableLenses: v.guest ? parts.availableLenses : [v.lens],
        subjects: parts.subjects.map(sref),
        classes,
        dataNotice: parts.dataNotice,
        curriculumNotice: parts.curriculumNotice,
        caveats: CAVEATS,
      }
      return ok(cfg)
    },

    /* כל כיתות הצופה וכל תלמידיהן — גם בלי נתונים (מחנך רואה אותם עם 0 התרעות). מנהל: ריק. */
    async roster(v, opts) {
      if (isAggregateOnly(v)) return ok<Roster>({ classes: [], students: [] })
      const a = await source.analysis(v)
      const classes = scoped(v, a)
      const out: Roster = {
        classes: classes.map((c) => {
          const acc = classSubjectAccess(v, c.id, subjectsOfClass(a, c.id))
          return {
            id: c.id, name: c.name, gradeLabel: c.gradeLabel, grade: c.grade, studentCount: c.studentIds.length,
            isHomeroom: isHomeroomOf(v, c.id), subjects: acc.open.map(sref), lockedSubjects: acc.locked.map(sref),
          }
        }),
        students: [],
      }
      for (const c of classes) {
        for (const st of studentsOf(a, c)) {
          if (!isListed(v, a, st, c.id)) continue
          const fs = visibleSubjectsOf(v, a, st).flatMap((s) => saOf(a, st.id, s)?.findings ?? [])
          out.students.push({
            id: st.id, displayName: st.displayName, classId: c.id,
            attention: countTone(fs, 'attention'), positive: countTone(fs, 'positive'),
            earlyWarning: accessSeesCrossSubject(accessOf(v, a, st)) && (a.crossSubject.get(st.id)?.length ?? 0) > 0,
          })
        }
      }
      out.students.sort(compareHebrewNames) /* א-ב, ובשוויון — לפי מזהה */
      opts?.audit?.expose(out.students.map((s) => s.id))
      return state(out.classes.length > 0, out)
    },

    /* מסך הכניסה "בחרו כיתה": הכיתות של הצופה + עד 3 התרעות. מנהל: ריק (אין שם/מזהה תלמיד, אין רשימת כיתות). */
    async entry(v, opts) {
      if (isAggregateOnly(v)) return ok<Entry>({ classes: [], alerts: [], alertsTotal: 0, alertsTitle: narrateAlertsTitle(0, 0), alertsMore: null, unclassifiedCount: 0, coverageNote: null })
      const a = await source.analysis(v)
      const alerts: { finding: ReportedFinding; studentId: string; classId: string }[] = []
      /* תלמיד שרשום בכמה כיתות של הצופה נספר בכל כיתה (attentionCount), אך מופיע ברצועת ההתרעות פעם אחת */
      const alerted = new Set<string>()
      const classes = scoped(v, a).map((c) => {
        const students = studentsOf(a, c).filter((st) => isListed(v, a, st, c.id))
        let attentionCount = 0
        let hasResults = false
        for (const st of students) {
          const sas = visibleSubjectsOf(v, a, st).map((s) => saOf(a, st.id, s)).filter(defined)
          if (sas.some((sa) => sa.sessionsCount > 0)) hasResults = true
          const cross = accessSeesCrossSubject(accessOf(v, a, st)) ? (a.crossSubject.get(st.id) ?? []) : []
          const best = [...sas.flatMap((sa) => sa.findings), ...cross].filter(isAttention).sort(compareAlert)[0]
          if (best) {
            attentionCount++
            if (!alerted.has(st.id)) { alerted.add(st.id); alerts.push({ finding: best, studentId: st.id, classId: c.id }) }
          }
        }
        return { id: c.id, name: c.name, gradeLabel: c.gradeLabel, studentCount: students.length, attentionCount, hasResults }
      })
      alerts.sort((x, y) => compareAlert(x.finding, y.finding) || x.studentId.localeCompare(y.studentId))
      const shown = alerts.slice(0, ENTRY_MAX_ALERTS)
      /* הערת "הדמיות בלי מקצוע" רלוונטית רק למי שיש לו מה לראות מולה: מחנך, או מורה עם מקצוע פתוח. שיוך בלי מקצוע — אין לו אף מקצוע, ולכן אין לו מה לסווג מולו.
         שאר ההערות (כיתה בלי שכבה / שלא נטענה, משחקים בלי רמה) מצטרפות לאותו משפט כיסוי — בלי שמות תלמידים */
      const hasOpenSubject = grantsOf(v).some((g) => g.homeroom || g.subjects.length > 0)
      const cov = source.coverage(v, a)
      const unclassified = hasOpenSubject ? cov.unclassifiedSessions : 0
      const notes = [
        ...(unclassified > 0 ? [narrateUnclassifiedNote(unclassified)] : []),
        ...narrateCoverageGaps({
          ungradedClasses: cov.ungradedClasses ?? 0, ungradedClassNames: cov.ungradedClassNames, notLoadedClasses: cov.classesNotLoaded ?? 0, loadingClasses: cov.classesLoading ?? 0,
          dataErrorClasses: cov.classesDataError ?? 0, playsWithoutLevel: hasOpenSubject ? (cov.playsWithoutLevel ?? 0) : 0,
        }),
      ]
      opts?.audit?.expose(shown.map((s) => s.studentId))
      return state(classes.some((c) => c.hasResults), {
        classes,
        alerts: shown.map(({ finding, studentId, classId }) => ({
          studentId, studentName: a.studentById.get(studentId)!.displayName, classId, className: a.classById.get(classId)!.name,
          text: narrateShort(finding.evidence, ctxOf(a, studentId, finding)),
        })),
        /* כמה תלמידים (שונים) לתשומת לב יש בסך הכול בהיקף הצופה — הרצועה מציגה רק את הדחופים. שווה לסכום attentionCount כשאין תלמיד שרשום בכמה כיתות */
        alertsTotal: alerts.length,
        alertsTitle: narrateAlertsTitle(shown.length, alerts.length),
        alertsMore: narrateAlertsMore(shown.length, alerts.length, classes.length > 1),
        unclassifiedCount: unclassified,
        coverageNote: notes.length > 0 ? notes.join(' ') : null,
      } satisfies Entry)
    },

    async student(v, id, opts) {
      requireNotAdmin(v)
      const a = await source.analysis(v)
      const { st, acc, cls } = studentInScope(v, a, id)
      const panels = st.subjects.map((sub) => saOf(a, id, sub)).filter(defined).map((sa) => panelOf(acc, a, sa))
      const visibleFindings = panels.flatMap((p) => (p.access === 'visible' ? p.findings : []))
      const crossSubject = accessSeesCrossSubject(acc) ? (a.crossSubject.get(id) ?? []) : []
      /* הממצא החשוב ביותר שהצופה רשאי לראות — כדי שהמשפט בראש העמוד יגיד מה נצפה ולא רק "יש משהו לבדוק" */
      const topFinding = [...crossSubject.filter(isReported), ...visibleFindings.filter(isAttention)].sort(compareAlert)[0]
      const o: StudentOverview = {
        student: { id, displayName: st.displayName, classId: cls.id, className: cls.name, grade: cls.grade, gradeLabel: cls.gradeLabel },
        summary: narrateStudentHeadline({
          firstName: st.firstName, attention: countTone(visibleFindings, 'attention'), positive: countTone(visibleFindings, 'positive'), crossSubject: crossSubject.length > 0,
          topAttention: topFinding ? narrateShortBody(topFinding.evidence, { subjectName: topFinding.subjectCode ? subjectName(topFinding.subjectCode) : null }) : null,
        }),
        access: accessSeesCrossSubject(acc) ? 'full' : 'subject_only',
        panels,
        crossSubject,
        caveats: CAVEATS,
      }
      opts?.audit?.expose([id])
      return state(panels.some((p) => p.access === 'visible' && p.sessionsCount > 0), o)
    },

    async feedback(v, id, opts) {
      requireNotAdmin(v)
      const a = await source.analysis(v)
      const { st } = studentInScope(v, a, id)
      const w = a.world
      const since = w.days[Math.min(120, w.days.length - 1)]
      const items: StudentFeedback['items'] = []
      const visibleSubjects = visibleSubjectsOf(v, a, st)
      for (const sub of visibleSubjects) {
        const sa = saOf(a, id, sub)
        if (!sa) continue
        const down = sa.findings.some((f) => f.status === 'reported' && f.kind === 'level_trend' && f.evidence.kind === 'level_trend' && f.evidence.direction === 'down')
        const delta = trendDelta(sa)
        if (down) {
          const weakest = sa.contentVectors.filter((c) => c.level !== null).sort((x, y) => (x.level as number) - (y.level as number))[0]
          const concept = weakest ? a.catalog.conceptsOfSubject(sub).find((c) => c.vector === weakest.key)?.titleHe ?? null : null
          items.push({ subject: sref(sub), kind: 'next_step', text: narrateFeedbackNextStep(subjectName(sub), concept) })
        } else if (delta !== null && trendOfDelta(delta) === 'improving') {
          items.push({ subject: sref(sub), kind: 'growth', text: narrateFeedbackGrowth(subjectName(sub), delta, since) })
        }
      }
      const hasGrowth = items.some((i) => i.kind === 'growth')
      /* אין לצופה אף מקצוע גלוי אצל התלמיד/ה: אין משוב (לא נופלים למקצוע נעול — המשוב נמסר לתלמיד/ה בשם מורה שאינו מלמד אותו) */
      const anchor = visibleSubjects[0]
      if (!hasGrowth && anchor) {
        const total = visibleSubjects.reduce((s, sub) => s + (saOf(a, id, sub)?.sessionsCount ?? 0), 0)
        /* אין שיפור בולט: פריט אחד מסכם. בלי משחקים בכלל — צעד הבא כללי (לא "השלמת 0 הדמיות") */
        items.unshift(total > 0
          ? { subject: sref(anchor), kind: 'streak', text: narrateFeedbackStreak(joinSubjectNames(visibleSubjects.map(subjectName)), total) }
          : { subject: sref(anchor), kind: 'next_step', text: narrateFeedbackNextStep(subjectName(anchor), null) })
      }
      opts?.audit?.expose([id])
      return state(items.length > 0, { firstName: st.firstName, intro: FEEDBACK_INTRO_TEXT, headline: narrateFeedbackHeadline(st.firstName, hasGrowth), items: items.slice(0, 5) })
    },

    /* "סקירה": שורה לכל מקצוע בכיתה. מחנך הכיתה בלבד — מחוץ להיקף: 404; מורה מקצועי / שיוך בלי מקצוע בכיתה שלו: 403. */
    async classOverview(v, classId, opts) {
      requireNotAdmin(v)
      const a = await source.analysis(v)
      const cls = classInScope(v, a, classId)
      if (!canViewClassOverview(v, classId)) denied()
      const subjects = classSubjectAccess(v, classId, subjectsOfClass(a, classId)).open
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
      opts?.audit?.expose(stats.flatMap(({ s }) => s.attention.slice(0, OVERVIEW_ALERT_TEXTS_MAX).map((x) => x.studentId)))
      return state(rows.some((r) => r.level !== null), {
        class: { id: cls.id, name: cls.name, gradeLabel: cls.gradeLabel, studentCount: cls.studentIds.length },
        summary: narrateOverviewSummary({ className: cls.name, above: count('above'), within: count('within'), below: count('below'), attentionStudents }),
        rows, caveats: CAVEATS,
      } satisfies ClassOverview)
    },

    async classSubject(v, classId, subject, opts) {
      requireNotAdmin(v)
      const a = await source.analysis(v)
      const cls = classInScope(v, a, classId)
      /* פתוח → מוגש; נעול בכיתה של הצופה → 403; מקצוע שאינו בכיתה בכלל → 404 */
      const access = classSubjectAccess(v, classId, subjectsOfClass(a, classId))
      if (!access.open.includes(subject)) { if (access.locked.includes(subject)) denied(); notFound() }
      const stats = subjectStats(a, cls, subject)
      const { studentIds } = stats
      const norm = a.ageNormOf(cls.grade)
      const subName = subjectName(subject)

      const defs = a.catalog.misconceptions.filter((m) => m.subject === subject && a.catalog.misconceptionAppliesTo(m, cls.grade))
      const rows = defs.flatMap((m) => { const stat = a.misByClass.get(`${classId}|${m.id}`); return stat ? [misRow(a, m, stat, true)] : [] })
        .sort((x, y) => (y.sharePct ?? -1) - (x.sharePct ?? -1))
      const commonRows = rows.filter((r) => r.status === 'reported' && (r.sharePct ?? 0) >= CLASS_COMMON_ERROR_MIN_SHARE_PCT)
      const recs = commonRows.slice(0, 3).map((r, i) => ({
        rank: i + 1, misconceptionId: r.id, linkedQuest: r.linkedQuest,
        text: narrateRecommendation({ titleHe: r.titleHe, conceptTitle: r.conceptTitle, studentsShowing: r.studentsShowing, studentsExposed: r.studentsExposed, sharePct: r.sharePct as number }, !!r.linkedQuest),
      }))
      const classFindings = (a.classFindings.get(classId) ?? []).filter((x) => x.subject === subject).map((x) => x.finding)
      const nameOf = (sid: string): string => a.studentById.get(sid)?.displayName ?? ''
      const studentFindings = stats.sas.flatMap((sa) => sa.findings.map((finding) => ({ studentId: sa.studentId, studentName: nameOf(sa.studentId), finding })))
      /* מקצועות אחרים של תלמידי הכיתה — אפור. מחנך הכיתה רואה את כולם, ולכן אין לו "אחרים" */
      const otherSubjects = isHomeroomOf(v, classId) ? [] : subjectsOfClass(a, classId).filter((s) => s !== subject).map(sref)

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

      const studentRows = stats.sas.map((sa) => {
        const trend = studentTrend(sa)
        return {
          id: sa.studentId, displayName: nameOf(sa.studentId), level: sa.currentLevel,
          positionVsNorm: personalPosition(sa), positionText: positionText(personalPosition(sa)), trend, trendText: trendText(trend),
        }
      }).sort(compareHebrewNames) /* א-ב, ובשוויון — לפי מזהה */
      const series = classMonthlySeries(stats.sas)
      const countTrend = (t: 'improving' | 'steady' | 'declining'): number => studentRows.filter((s) => s.trend === t).length

      const view: ClassSubjectView = {
        class: { id: cls.id, name: cls.name, gradeLabel: cls.gradeLabel, studentCount: cls.studentIds.length },
        subject: sref(subject),
        classLevel: { mean: stats.level, ageNorm: norm },
        summary: {
          headline: narrateSubjectHeadline({ className: cls.name, subject: subName, position: stats.position, trend: stats.trend, attentionStudents: stats.attention.length }),
          recent, whatToTeach: recs,
        },
        tabSummaries: {
          misconceptions: narrateErrorsTabSummary({ common: commonRows.map((r) => r.titleHe), anyReported: rows.some((r) => r.status === 'reported'), maxTitles: ERRORS_TAB_TITLES_MAX }),
          progress: narrateProgressTabSummary({ series }),
          students: narrateStudentsTabSummary({ total: studentRows.length, improving: countTrend('improving'), steady: countTrend('steady'), declining: countTrend('declining') }),
        },
        misconceptions: rows, recommendations: recs,
        progress: { series, ageNorm: norm, events: timeline },
        classFindings, studentFindings,
        students: studentRows,
        trend: stats.trend, trendText: groupTrendText(stats.trend),
        otherSubjects, caveats: CAVEATS,
      }
      opts?.audit?.expose(studentIds)
      /* טענת רמה כיתתית (או אישית) רק מ-N מספיק: בלעדיה — insufficient, והכותרת אומרת מה יקרה */
      return state(stats.level !== null, view)
    },

    /* תמונת המנהל: אגרגטים בלבד, דרך כללי adminPrivacy. אין כאן שם/מזהה תלמיד, מזהה כיתה או מידע על מורים. */
    async admin(v) {
      if (!isAggregateOnly(v)) denied()
      const a = await source.analysis(v)
      const w = a.world
      /* שכבות: מוצגות רק אם יש בהן ≥ MIN_CELL_SIZE תלמידים. שכבה קטנה נעלמת לגמרי (גם תאיה).
         ספירה לפי מזהים **שונים** בשכבה: תלמיד שרשום בשתי כיתות של אותה שכבה נספר פעם אחת (אחרת שכבה של 4 תלמידים שונים הייתה "5" ומתפרסמת) */
      const allGrades = [...new Set(w.classes.map((c) => c.grade))].sort((x, y) => x - y).map((g) => {
        const cls = w.classes.filter((c) => c.grade === g)
        return { grade: g, gradeLabel: a.ageNormOf(g).gradeLabel, classCount: cls.length, studentCount: new Set(cls.flatMap((c) => c.studentIds)).size }
      })
      const grades = allGrades.filter((g) => gradeVisible(g.studentCount))
      const cells: AdminCell[] = []
      const progress: AdminOverview['progress'] = []
      const compRows = new Map<SubjectCode, { grade: number; gradeLabel: string; deltaVsNorm: number }[]>()
      let hidden = 0
      for (const g of grades) {
        const inGrade = w.students.filter((s) => s.grade === g.grade)
        const subjects = [...new Set(inGrade.flatMap((s) => s.subjects))]
        for (const sub of subjects) {
          /* תורמים = מי שיש לו רמה במקצוע (לא "רשומים") **ועומד בסף האישי** (PERSONAL_LEVEL_MIN_SESSIONS משחקים): משחק בודד אינו טענת רמה, גם לא בתוך ממוצע */
          const contributors = inGrade.filter((s) => s.subjects.includes(sub)).map((s) => ({ s, sa: saOf(a, s.id, sub) }))
            .filter((x): x is { s: WorldStudent; sa: SubjectAnalysis } => !!x.sa && x.sa.currentLevel !== null && hasEnoughSessions(x.sa))
          /* אין אף תורם: אין מה להסתיר ואין מה להציג (תא "מוסתר" היה אומר שיש נתונים) */
          if (contributors.length === 0) continue
          const verdict = cellVerdict(contributors.map((x) => x.s.classId))
          if (!verdict.show) {
            cells.push({
              status: 'hidden', grade: g.grade, gradeLabel: g.gradeLabel, subject: sref(sub), reason: verdict.reason,
              text: verdict.reason === 'single_class' ? ADMIN_HIDDEN_CELL_SINGLE_CLASS_TEXT : verdict.reason === 'dominant_class' ? ADMIN_HIDDEN_CELL_DOMINANT_CLASS_TEXT : ADMIN_HIDDEN_CELL_TEXT,
            })
            hidden++
            continue
          }
          const sas = contributors.map((x) => x.sa)
          const norm = a.ageNormOf(g.grade)
          const avg = round1(mean(sas.map((x) => x.currentLevel as number)))
          const position = positionOf(avg, norm) as Position
          /* מגמה ושינוי: רק מ-≥ MIN_CELL_SIZE הפרשים, ובלי הכיתה הגדולה ביותר נשארים מספיק (אחרת המגמה היא בפועל מגמת כיתה אחת).
             מתחת לזה לא מתפרסם גם המספר (שינוי של 1–4 תלמידים הוא כמעט אישי) */
          const tr = publishableTrend(contributors.map((x) => ({ classId: x.s.classId, delta: trendDelta(x.sa) })))
          const trend = tr ? trendOfDelta(tr.delta) : 'insufficient'
          cells.push({
            status: 'shown', grade: g.grade, gradeLabel: g.gradeLabel, subject: sref(sub), studentCount: verdict.contributors,
            avgLevel: avg, normCenter: norm.center, deltaVsNorm: round1(avg - norm.center),
            trendDelta: tr ? round1(tr.delta) : 0,
            position, positionText: positionText(position) as string, trend, trendText: groupTrendText(trend),
          })
          compRows.set(sub, [...(compRows.get(sub) ?? []), { grade: g.grade, gradeLabel: g.gradeLabel, deltaVsNorm: round1(avg - norm.center) }])
          /* התקדמות: ממוצע חודשי; חודש מוצג רק אם תרמו לו ≥ MIN_CELL_SIZE תלמידים מ-≥ MIN_CELL_CLASSES כיתות */
          progress.push({
            grade: g.grade, subject: sref(sub),
            series: publishableMonthlySeries(contributors.map((x) => ({ classId: x.s.classId, levelSeries: x.sa.levelSeries }))).map((p) => ({ date: p.date, avgLevel: p.level, n: p.n })),
          })
        }
      }
      /* טעויות נפוצות בשכבה: רק כשגם המציגים וגם הלא-מציגים לפחות MIN_CELL_SIZE, ורק בשכבה עם ≥ MIN_CELL_CLASSES כיתות (אחרת זו כיתה אחת) */
      const miss: AdminOverview['misconceptions'] = []
      for (const m of a.catalog.misconceptions) for (const g of grades) {
        const stat = a.misByGrade.get(`${g.grade}|${m.id}`)
        if (!stat || stat.sharePct === null || g.classCount < MIN_CELL_CLASSES || shareDisplay(stat.studentsShowing, stat.studentsExposed) !== 'number') continue
        const goal = a.catalog.goalById(a.catalog.conceptByKey(m.conceptKey)?.goalId ?? null)
        miss.push({
          id: m.id, titleHe: m.titleHe, text: narrateAdminMisconception(m.titleHe, stat.studentsShowing, stat.studentsExposed, g.gradeLabel),
          subject: sref(m.subject), grade: g.grade, gradeLabel: g.gradeLabel,
          sharePct: stat.sharePct, studentsShowing: stat.studentsShowing, studentsExposed: stat.studentsExposed,
          countText: studentsCountText(stat.studentsShowing, stat.studentsExposed),
          curriculumGoal: goal ? { title: goal.title, gradeFrom: goal.gradeFrom, gradeTo: goal.gradeTo, mappingStatus: goal.mappingStatus } : null,
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
      /* סך תלמידים/כיתות מתפרסם רק כשכל השכבות מוצגות; אחרת חיסור מהסך היה חושף את גודל השכבה הקטנה */
      const schoolLine = grades.length === 0 ? [] : [totalsPublishable(allGrades.map((g) => g.studentCount))
        ? narrateAdminSchool(grades.length, w.classes.length, w.students.length)
        : narrateAdminSchoolPartial(grades.length)]
      const base = [
        ...schoolLine,
        ...(focus ? [narrateAdminPosition(focus.gradeLabel, subjectName(focus.subject.code), focus.position)] : []),
        ...(miss[0] ? [miss[0].text] : []),
      ].slice(0, 3)
      /* הערת כיסוי אחת (כיתות בלי שכבה / שלא נטענו, משחקים בלי רמה) אחרי שלושת המשפטים — בלי שמות וללא פירוט כיתה.
         כשאין מה להדגיש, קודם המשפט הכללי "עוד אין תוצאות" (הוא נשאר הפותח), ואז ההערה */
      const cov = source.coverage(v, a)
      const gaps = narrateCoverageGaps({
        ungradedClasses: cov.ungradedClasses ?? 0, notLoadedClasses: cov.classesNotLoaded ?? 0, loadingClasses: cov.classesLoading ?? 0, dataErrorClasses: cov.classesDataError ?? 0,
        playsWithoutLevel: cov.playsWithoutLevel ?? 0,
      })
      const highlights = gaps.length > 0 ? [...(base.length > 0 ? base : [V2_CLIENT_TEXT.adminNoResults]), gaps.join(' ')] : base

      const out: AdminOverview = {
        school: w.school, highlights, grades, gradeRows, subjectRows, cells, progress,
        comparisons: [...compRows.entries()].filter(([, rows]) => rows.length >= 2).map(([sub, rows]) => ({ subject: sref(sub), rows })),
        misconceptions: miss, hiddenCells: hidden, caveats: CAVEATS,
      }
      return state(shownAll.length > 0, out)
    },

    async briefing(v, scope, id, opts) {
      requireNotAdmin(v)
      const a = await source.analysis(v)
      const w = a.world
      const generatedAt = w.now.toISOString()
      /* חלון הראיות המוצהר = הטווח בפועל של המשחקים שנספרו (sessionsCount נספר מכל האופק — לא רק מ-180 ימי הלימוד האחרונים — ולכן חלון קבוע היה סותר את המספר):
         מחודש המשחק הראשון עד חודש האחרון, לפי הסדרה החודשית. בלי משחקים — אין מה לתאר, ונשאר החלון הרגיל. */
      const declaredStartIso = w.days[Math.min(w.days.length - 1, 179)] ?? generatedAt
      const declaredEndIso = w.days[0] ?? generatedAt
      const spanOf = (series: readonly (readonly { date: string }[])[]): { startIso: string; endIso: string } => {
        const dates = series.flatMap((s) => s.map((p) => p.date)).sort()
        return dates.length > 0 ? { startIso: dates[0], endIso: dates[dates.length - 1] } : { startIso: declaredStartIso, endIso: declaredEndIso }
      }
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
        const { st, acc, cls } = studentInScope(v, a, id)
        const visible = visibleSubjectsOf(v, a, st)
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
          const sa = saOf(a, id, sub)
          if (!sa) continue
          const nm = subjectName(sub)
          if (sa.currentLevel !== null && personalPosition(sa) === 'above') strengths.push({ text: narrateStrengthAbove(nm, sa.currentLevel, sa.ageNorm.center), subjectCode: sub, evidence: [normBandLine(sa.ageNorm.low, sa.ageNorm.high), basedOnSessions(sa.sessionsCount)] })
          if (sa.currentLevel !== null && personalPosition(sa) === 'below') difficulties.push({ text: narrateDifficultyBelow(nm, sa.currentLevel, sa.ageNorm.center), subjectCode: sub, evidence: [normBandLine(sa.ageNorm.low, sa.ageNorm.high), basedOnSessions(sa.sessionsCount)] })
          /* תחומים: החזק והמאתגר ביותר במקצוע, מול רמת הייחוס של התחומים; בתדריך כולו מוצגים הבולטים ביותר בלבד */
          const ref = areaReference(sa)
          const reportedVec = sa.contentVectors.filter((c) => c.status === 'reported' && c.level !== null)
          if (ref !== null && reportedVec.length) {
            const top = [...reportedVec].sort((x, y) => (y.level as number) - (x.level as number))[0]
            const low = [...reportedVec].sort((x, y) => (x.level as number) - (y.level as number))[0]
            if (areaDirection((top.level as number) - ref) === 'strong') areaStrengths.push({ gap: (top.level as number) - ref, item: { text: narrateVectorStrength(top.key, nm, top.level as number, ref), subjectCode: sub, evidence: [basedOnChallenges(top.n)] } })
            if (areaDirection((low.level as number) - ref) === 'challenging') areaGaps.push({ gap: ref - (low.level as number), item: { text: narrateVectorGap(low.key, nm, low.level as number, ref), subjectCode: sub, evidence: [basedOnChallenges(low.n)] } })
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
          const span = spanOf([sa.levelSeries])
          basis.push({ text: narrateEvidenceWindow(span.startIso, span.endIso, sa.sessionsCount, nm), subjectCode: sub, evidence: [] })
        }
        const mostNotable = (xs: { gap: number; item: Item }[]): Item[] => [...xs].sort((x, y) => compareLevels(y.gap, x.gap)).slice(0, BRIEFING_MAX_AREAS).map((x) => x.item)
        strengths.push(...mostNotable(areaStrengths))
        difficulties.push(...mostNotable(areaGaps))
        if (accessSeesCrossSubject(acc)) for (const f of a.crossSubject.get(id) ?? []) {
          if (f.status !== 'reported') continue
          trend.push({ text: f.text, subjectCode: null, evidence: plainBasis(f) })
          how.push(howItem(f, null))
          recs.push({ text: narrateRecommendationFromFinding(f.evidence, { studentName: st.firstName }), subjectCode: null, evidence: [] })
        }
        unknowns.push({ text: EVIDENCE_LIMITS_NOTE, subjectCode: null, evidence: [] })
        const b: Briefing = {
          scope: 'student', entityId: id, title: briefingTitleStudent(st.displayName),
          subtitle: briefingSubtitleStudent(cls.name, accessSeesCrossSubject(acc) ? null : visible.map(subjectName)),
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
        opts?.audit?.expose([id])
        return ok(b)
      }

      /* כיתה: מחוץ להיקף 404; בהיקף אך בלי אף מקצוע פתוח (שיוך בלי מקצוע) — 403.
         מחנך/ת של כיתה שעוד אין בה מקצועות: זה לא מצב של "אין הרשאה" — מסמך ריק (insufficient) שהלקוח מסביר במילים */
      const cls = classInScope(v, a, id)
      const subjects = classSubjectAccess(v, id, subjectsOfClass(a, id)).open
      if (!subjects.length && !isHomeroomOf(v, id)) denied()
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
        const rows = a.catalog.misconceptions.filter((m) => m.subject === sub && a.catalog.misconceptionAppliesTo(m, cls.grade))
          .flatMap((m) => { const s = a.misByClass.get(`${id}|${m.id}`); return s && s.sharePct !== null ? [{ m, s }] : [] })
          .sort((x, y) => (y.s.sharePct as number) - (x.s.sharePct as number))
        for (const { m, s } of rows.slice(0, 2)) {
          const c = a.catalog.conceptByKey(m.conceptKey)
          difficulties.push({
            text: narrateRecommendation({ titleHe: m.titleHe, conceptTitle: c?.titleHe ?? m.conceptKey, studentsShowing: s.studentsShowing, studentsExposed: s.studentsExposed, sharePct: s.sharePct as number }, !!m.linkedQuest),
            subjectCode: sub, evidence: [studentsCountText(s.studentsShowing, s.studentsExposed), exposuresLine(MISCONCEPTION_RULE.minExposuresPerStudent)],
          })
        }
        const classSas = studentsOf(a, cls).filter((st) => st.subjects.includes(sub)).map((st) => saOf(a, st.id, sub)).filter(defined)
        const sessions = classSas.reduce((sum, sa) => sum + sa.sessionsCount, 0)
        const span = spanOf(classSas.map((sa) => sa.levelSeries))
        basis.push({ text: narrateEvidenceWindow(span.startIso, span.endIso, sessions, nm), subjectCode: sub, evidence: [] })
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
      return state(subjects.length > 0, b)
    },
  }
}

