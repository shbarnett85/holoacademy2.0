/* ──────────────────────────────────────────────────────────────────────────
   האנליטיקה — נקודת הכניסה (default export; נטענת עצלנית מ-features/analytics/index.tsx). זה המסך של כל המורים והמנהלים.
   המסכים צורכים את חוזה analyticsV2 בלבד: אין כאן ידיעה אם הנתונים מהדגמה או מנתוני אמת.
   מי מחליט מה מוצג: התצורה (GET /config) נטענת כאן פעם אחת, והכיתות (GET /roster) אחריה, פעם אחת — ומשותפות לכל המסכים בהקשר.
     · config.enabled=false (מתג כיבוי): מנהל-על → /admin; כל השאר → המסך הקודם (Legacy, מועבר מ-index.tsx);
     · ?view=previous (מורה אמיתי בלבד): "התצוגה הקודמת" — גרף ההתקדמות הכללי כפי שהיה, עם נתיב חזרה גלוי.
   הכתובת היא המצב:
     /analytics                          כניסה "איזו כיתה תרצו לראות?" (מנהל: ?tab=overview|grades|subjects|errors)
     /analytics/class/:classId           ?tab=overview|<מקצוע>&sub=summary|errors|progress|students
     /analytics/student/:studentId       ?class=<id>&tab=overview|<מקצוע>
     שכבות-על: ?brief=student:<id>|class:<id>  ·  ?fb=<studentId>  ·  ?sum=student:<id>|class:<id> (הניתוב בלבד; השכבה עצמה בנפרד)
     אורח מוסיף: &lens=homeroom|subject_teacher|admin&subject=<קוד>   (השרת הוא שגוזר את הצופה)
   העדשה של האורח: הכתובת קודמת; כשאין בה — הערך השמור (teacherUi/guestLens, sessionStorage holo_guest_lens);
   כל עדשה שנטענה נכתבת בחזרה, כך שהיא שורדת מעבר בין הטאבים הראשיים (תוצאות ↔ אנליטיקה).
   ────────────────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useMemo } from 'react'
import type { ComponentType } from 'react'
import { Navigate, useMatch, useNavigate, useSearchParams } from 'react-router-dom'
import { useStaffAuth } from '../../shared/hooks/useStaffAuth'
import { GUEST_LENSES, GuestLensSwitcher, ScreenShell, lensToParams, readGuestLens, useGuestLens, writeGuestLens } from '../teacherUi'
import type { AnalyticsConfig, Lens, Roster } from '../../shared/types/analyticsV2'
import AdminScreen from './AdminScreen'
import ClassScreen from './ClassScreen'
import { V2Context, type V2Env } from './context'
import EntryScreen from './EntryScreen'
import { L, titles } from './labels'
import { BRIEF_SCOPES, PREVIOUS_VIEW_PARAM, PREVIOUS_VIEW_VALUE, SUMMARY_SCOPES, canSeePreviousView, parseScopeId, summaryContextOf } from './logic'
import { BriefingOverlay, FeedbackOverlay, SummaryOverlay } from './Overlays'
import StudentScreen from './StudentScreen'
import { ErrorBlock, LoadingBlock } from './ui'
import { useV2, type V2Params, type V2State } from './v2api'

/* המסך הקודם (גרף ההתקדמות הכללי) מוגש מ-index.tsx; backTo = נתיב החזרה לתצוגה החדשה כשנפתח מכפתור "התצוגה הקודמת" */
export type LegacyView = ComponentType<{ backTo?: string }>

export default function AnalyticsV2App({ Legacy }: { Legacy: LegacyView }) {
  const [sp, setSp] = useSearchParams()
  const navigate = useNavigate()
  const classMatch = useMatch('/analytics/class/:classId')
  const studentMatch = useMatch('/analytics/student/:studentId')

  /* הכתובת קודמת; אורח בלי עדשה בכתובת — העדשה האחרונה שנבחרה (במסכי תוצאות/אנליטיקה). מורה אמיתי לעולם לא שולח עדשה */
  const { isGuest, isSuperAdmin, role } = useStaffAuth()
  const stored = useGuestLens()
  const lensParam = isGuest ? sp.get('lens') ?? stored?.lens ?? null : null
  const subjectParam = isGuest ? sp.get('subject') ?? stored?.subject ?? null : null
  const previousAllowed = canSeePreviousView({ role, isGuest })
  const showPrevious = previousAllowed && sp.get(PREVIOUS_VIEW_PARAM) === PREVIOUS_VIEW_VALUE && !classMatch && !studentMatch

  const { data: cfg, loading, error, reload } = useV2<AnalyticsConfig>(showPrevious ? null : '/config', { lens: lensParam ?? undefined, subject: subjectParam ?? undefined })

  const guest = !!cfg && cfg.availableLenses.length > 1
  const lens: Lens = cfg?.lens ?? 'homeroom'
  const subject = useMemo<string | null>(() => {
    /* המקצוע הנבחר הוא של בורר העדשה של האורח. למורה אמיתי config.subjects הוא איחוד ההרשאות של כל כיתותיו — לא מקצוע אחד, ולכן אין לו מקצוע כאן (ההרשאה לכל כיתה מגיעה מ-GET /roster) */
    if (!cfg || !guest || lens !== 'subject_teacher') return null
    return cfg.subjects.some((s) => s.code === subjectParam) ? subjectParam : cfg.subjects[0]?.code ?? null
  }, [cfg, guest, lens, subjectParam])
  const params = useMemo<V2Params>(() => (guest ? { lens, subject: lens === 'subject_teacher' ? subject ?? undefined : undefined } : {}), [guest, lens, subject])

  /* הכיתות והתלמידים — פעם אחת לכל המסכים (הכניסה והכיתה). מנהל/ת אינו מקבל רשימות (אגרגטים בלבד), ולכן לא נטען */
  const rosterReady = !!cfg && !loading && cfg.enabled && lens !== 'admin'
  const rosterRaw = useV2<Roster>(rosterReady ? '/roster' : null, params)
  /* בזמן טעינה (החלפת עדשה / ניסיון חוזר) לא מציגים את הרשימה של העדשה הקודמת */
  const roster: V2State<Roster> = rosterRaw.loading ? { ...rosterRaw, data: null } : rosterRaw

  /* העדשה הנטענת נכתבת למאגר המשותף — רק כשהתצורה טרייה (בזמן טעינה cfg עוד של העדשה הקודמת), ורק כשיש עדשה
     מפורשת (בכתובת או שמורה): אורח שעוד לא בחר דבר נשאר "ללא בחירה" = ברירת המחדל של השרת, בלי טעינה כפולה של התצורה */
  const lensInUrl = sp.has('lens')
  useEffect(() => {
    if (!cfg || loading || !guest || !cfg.lens) return
    const saved = readGuestLens()
    if (!lensInUrl && !saved) return
    writeGuestLens({ lens: cfg.lens, subject: cfg.lens === 'subject_teacher' ? subject : saved?.subject ?? null })
  }, [cfg, loading, guest, subject, lensInUrl])

  const href = useCallback<V2Env['href']>((path, q = {}) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(q)) if (v) p.set(k, v)
    if (guest) for (const [k, v] of Object.entries(lensToParams(lens, subject))) p.set(k, v)
    const s = p.toString()
    return s ? `${path}?${s}` : path
  }, [guest, lens, subject])

  const setOverlay = useCallback((key: 'brief' | 'fb' | 'sum', value: string | null) => {
    setSp((prev) => {
      const next = new URLSearchParams(prev)
      if (value === null) next.delete(key); else next.set(key, value)
      return next
    }, { replace: value === null })
  }, [setSp])

  /* החלפת עדשה/מקצוע (אורח): חוזרים למסך הכניסה כדי להישאר במסך תקף */
  const goLens = (nextLens: Lens, nextSubject?: string | null): void => { void navigate(`/analytics?${new URLSearchParams(lensToParams(nextLens, nextSubject)).toString()}`) }

  /* "התצוגה הקודמת": רק למורה אמיתי, ורק כשביקש אותה במפורש (כפתור במסך הכניסה) */
  if (showPrevious) return <Legacy backTo="/analytics" />

  /* בזמן טעינת תצורה חדשה (החלפת עדשה/מקצוע) לא מציגים מסך של העדשה הקודמת. אורח ממשיך לראות את הבורר (עם העדשה
     שביקש), כדי שהוא לא יקפוץ ויחזור; ובמסך פנימי נתיב החזרה גלוי גם בזמן הטעינה. */
  if (!cfg || loading) {
    const pending = classMatch ? titles.classGeneric : studentMatch ? titles.studentGeneric : titles.entry
    const requested: Lens = (GUEST_LENSES as readonly string[]).includes(lensParam ?? '') ? (lensParam as Lens) : lens
    const staleGuest = !!cfg && cfg.availableLenses.length > 1
    return (
      <ScreenShell active="analytics" title={pending} breadcrumb={classMatch || studentMatch ? [{ label: L.analytics }] : undefined}
        lensSwitcher={staleGuest ? <GuestLensSwitcher force value={{ lens: requested, subject: subjectParam ?? null }} onChange={(n) => goLens(n.lens, n.subject)} /> : undefined}>
        {error ? <ErrorBlock error={error} onRetry={reload} /> : <LoadingBlock label={L.loading} />}
      </ScreenShell>
    )
  }

  /* מתג כיבוי של האנליטיקה החדשה (או חשבון שאינו נתמך בה): מנהל-על מנהל את המערכת ב-/admin; כל השאר — המסך הקודם */
  if (!cfg.enabled) return isSuperAdmin ? <Navigate to="/admin" replace /> : <Legacy />

  const env: V2Env = {
    cfg, lens, guest, subject, params, href,
    goLens,
    openBriefing: (scope, id) => setOverlay('brief', `${scope}:${id}`),
    openFeedback: (id) => setOverlay('fb', id),
    roster,
    isHomeroomClass: (classId) => roster.data?.classes.find((c) => c.id === classId)?.isHomeroom === true,
    canSeePreviousView: previousAllowed && !guest && lens !== 'admin',
    summary: parseScopeId(sp.get('sum'), SUMMARY_SCOPES),
    openSummary: (scope, id) => setOverlay('sum', `${scope}:${id}`),
    closeSummary: () => setOverlay('sum', null),
  }

  const brief = parseScopeId(sp.get('brief'), BRIEF_SCOPES)
  const fb = sp.get('fb')
  /* סיכום מילולי: מנהל/ת אינו מקבל סיכום על תלמיד/כיתה (אגרגטים בלבד); השם בכותרת מרשימת הכיתות */
  const sum = env.summary && lens !== 'admin' ? { ...env.summary, ...summaryContextOf(roster.data, env.summary.scope, env.summary.id) } : null

  return (
    <V2Context.Provider value={env}>
      {classMatch?.params.classId
        ? <ClassScreen classId={classMatch.params.classId} />
        : studentMatch?.params.studentId
          ? <StudentScreen studentId={studentMatch.params.studentId} />
          : lens === 'admin' ? <AdminScreen /> : <EntryScreen />}
      {brief && (
        <BriefingOverlay scope={brief.scope} id={brief.id} params={params} notice={cfg.dataNotice} onClose={() => setOverlay('brief', null)} />
      )}
      {fb && <FeedbackOverlay studentId={fb} params={params} onClose={() => setOverlay('fb', null)} />}
      {sum && <SummaryOverlay scope={sum.scope} id={sum.id} params={params} name={sum.name} subjectOnly={sum.subjectOnly} onClose={env.closeSummary} />}
    </V2Context.Provider>
  )
}
