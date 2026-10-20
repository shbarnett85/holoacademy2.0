/* ──────────────────────────────────────────────────────────────────────────
   האנליטיקה החדשה — נקודת הכניסה (default export; נטענת עצלנית מ-features/analytics/index.tsx כשהדגל דלוק).
   המסכים צורכים את חוזה analyticsV2 בלבד: אין כאן ידיעה אם הנתונים מהדגמה או מהמנוע האמיתי.
   הכתובת היא המצב:
     /analytics                          כניסה "בחרו כיתה" (מנהל: ?tab=overview|grades|subjects|errors)
     /analytics/class/:classId           ?tab=overview|<מקצוע>&sub=summary|errors|progress|students
     /analytics/student/:studentId       ?class=<id>&tab=overview|<מקצוע>
     שכבות-על: ?brief=student:<id>|class:<id>  ·  ?fb=<studentId>
     אורח מוסיף: &lens=homeroom|subject_teacher|admin&subject=<קוד>   (השרת הוא שגוזר את הצופה)
   העדשה של האורח: הכתובת קודמת; כשאין בה — הערך השמור (teacherUi/guestLens, sessionStorage holo_guest_lens);
   כל עדשה שנטענה נכתבת בחזרה, כך שהיא שורדת מעבר בין הטאבים הראשיים (תוצאות ↔ אנליטיקה).
   ────────────────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useMemo } from 'react'
import { useMatch, useNavigate, useSearchParams } from 'react-router-dom'
import { useStaffAuth } from '../../shared/hooks/useStaffAuth'
import { GUEST_LENSES, GuestLensSwitcher, ScreenShell, lensToParams, readGuestLens, useGuestLens, writeGuestLens } from '../teacherUi'
import type { AnalyticsConfig, Lens } from '../../shared/types/analyticsV2'
import AdminScreen from './AdminScreen'
import ClassScreen from './ClassScreen'
import { V2Context, type V2Env } from './context'
import EntryScreen from './EntryScreen'
import { L, titles } from './labels'
import { BriefingOverlay, FeedbackOverlay } from './Overlays'
import StudentScreen from './StudentScreen'
import { ErrorBlock, LoadingBlock } from './ui'
import { useV2, type V2Params } from './v2api'

export default function AnalyticsV2App() {
  const [sp, setSp] = useSearchParams()
  const navigate = useNavigate()
  const classMatch = useMatch('/analytics/class/:classId')
  const studentMatch = useMatch('/analytics/student/:studentId')

  /* הכתובת קודמת; אורח בלי עדשה בכתובת — העדשה האחרונה שנבחרה (במסכי תוצאות/אנליטיקה) */
  const { isGuest } = useStaffAuth()
  const stored = useGuestLens()
  const lensParam = sp.get('lens') ?? (isGuest ? stored?.lens ?? null : null)
  const subjectParam = sp.get('subject') ?? (isGuest ? stored?.subject ?? null : null)
  const { data: cfg, loading, error, reload } = useV2<AnalyticsConfig>('/config', { lens: lensParam ?? undefined, subject: subjectParam ?? undefined })

  const guest = !!cfg && cfg.availableLenses.length > 1
  const lens: Lens = cfg?.lens ?? 'homeroom'
  const subject = useMemo<string | null>(() => {
    if (!cfg || lens !== 'subject_teacher') return null
    return cfg.subjects.some((s) => s.code === subjectParam) ? subjectParam : cfg.subjects[0]?.code ?? null
  }, [cfg, lens, subjectParam])
  const params = useMemo<V2Params>(() => (guest ? { lens, subject: lens === 'subject_teacher' ? subject ?? undefined : undefined } : {}), [guest, lens, subject])

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

  const setOverlay = useCallback((key: 'brief' | 'fb', value: string | null) => {
    setSp((prev) => {
      const next = new URLSearchParams(prev)
      if (value === null) next.delete(key); else next.set(key, value)
      return next
    }, { replace: value === null })
  }, [setSp])

  /* החלפת עדשה/מקצוע (אורח): חוזרים למסך הכניסה כדי להישאר במסך תקף */
  const goLens = (nextLens: Lens, nextSubject?: string | null): void => { void navigate(`/analytics?${new URLSearchParams(lensToParams(nextLens, nextSubject)).toString()}`) }

  /* בזמן טעינת תצורה חדשה (החלפת עדשה/מקצוע) לא מציגים מסך של העדשה הקודמת. אורח ממשיך לראות את הבורר (עם העדשה
     שביקש), כדי שהוא לא יקפוץ ויחזור; ובמסך פנימי נתיב החזרה גלוי גם בזמן הטעינה. */
  if (!cfg || loading) {
    const pending = classMatch ? titles.classGeneric : studentMatch ? titles.studentGeneric : titles.entry
    const requested: Lens = (GUEST_LENSES as readonly string[]).includes(lensParam ?? '') ? (lensParam as Lens) : lens
    const staleGuest = !!cfg && cfg.availableLenses.length > 1
    return (
      <ScreenShell active="analytics" title={pending} breadcrumb={classMatch || studentMatch ? [{ label: L.analytics }] : undefined}
        lensSwitcher={staleGuest ? <GuestLensSwitcher force value={{ lens: requested, subject: subjectParam ?? null }} onChange={(n) => goLens(n.lens, n.subject)} /> : undefined}>
        {error ? <ErrorBlock message={error} onRetry={reload} /> : <LoadingBlock label={L.loading} />}
      </ScreenShell>
    )
  }

  const env: V2Env = {
    cfg, lens, guest, subject, params, href,
    goLens,
    openBriefing: (scope, id) => setOverlay('brief', `${scope}:${id}`),
    openFeedback: (id) => setOverlay('fb', id),
  }

  const brief = sp.get('brief')
  const fb = sp.get('fb')
  const [briefScope, briefId] = brief ? brief.split(':') : []

  return (
    <V2Context.Provider value={env}>
      {classMatch?.params.classId
        ? <ClassScreen classId={classMatch.params.classId} />
        : studentMatch?.params.studentId
          ? <StudentScreen studentId={studentMatch.params.studentId} />
          : lens === 'admin' ? <AdminScreen /> : <EntryScreen />}
      {(briefScope === 'student' || briefScope === 'class') && briefId && (
        <BriefingOverlay scope={briefScope} id={briefId} params={params} notice={cfg.dataNotice} onClose={() => setOverlay('brief', null)} />
      )}
      {fb && <FeedbackOverlay studentId={fb} params={params} onClose={() => setOverlay('fb', null)} />}
    </V2Context.Provider>
  )
}
