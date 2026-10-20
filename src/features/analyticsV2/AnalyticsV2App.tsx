/* ──────────────────────────────────────────────────────────────────────────
   האנליטיקה החדשה — נקודת הכניסה (default export; נטענת עצלנית מ-features/analytics/index.tsx כשהדגל דלוק).
   המסכים צורכים את חוזה analyticsV2 בלבד: אין כאן ידיעה אם הנתונים מהדגמה או מהמנוע האמיתי.
   הכתובת היא המצב:
     /analytics                          כניסה "בחרו כיתה" (מנהל: ?tab=overview|grades|subjects|errors)
     /analytics/class/:classId           ?tab=overview|<מקצוע>&sub=summary|errors|progress|students
     /analytics/student/:studentId       ?class=<id>&tab=overview|<מקצוע>
     שכבות-על: ?brief=student:<id>|class:<id>  ·  ?fb=<studentId>
     אורח מוסיף: &lens=homeroom|subject_teacher|admin&subject=<קוד>   (השרת הוא שגוזר את הצופה)
   ────────────────────────────────────────────────────────────────────────── */
import { useCallback, useMemo } from 'react'
import { useMatch, useNavigate, useSearchParams } from 'react-router-dom'
import { ScreenShell } from '../teacherUi'
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

  const lensParam = sp.get('lens')
  const subjectParam = sp.get('subject')
  const { data: cfg, loading, error, reload } = useV2<AnalyticsConfig>('/config', { lens: lensParam ?? undefined, subject: subjectParam ?? undefined })

  const guest = !!cfg && cfg.availableLenses.length > 1
  const lens: Lens = cfg?.lens ?? 'homeroom'
  const subject = useMemo<string | null>(() => {
    if (!cfg || lens !== 'subject_teacher') return null
    return cfg.subjects.some((s) => s.code === subjectParam) ? subjectParam : cfg.subjects[0]?.code ?? null
  }, [cfg, lens, subjectParam])
  const params = useMemo<V2Params>(() => (guest ? { lens, subject: lens === 'subject_teacher' ? subject ?? undefined : undefined } : {}), [guest, lens, subject])

  const href = useCallback<V2Env['href']>((path, q = {}) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(q)) if (v) p.set(k, v)
    if (guest) {
      p.set('lens', lens)
      if (lens === 'subject_teacher' && subject) p.set('subject', subject)
    }
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

  /* בזמן טעינת תצורה חדשה (החלפת עדשה/מקצוע) לא מציגים מסך של העדשה הקודמת */
  if (!cfg || loading) {
    const pending = classMatch ? titles.classGeneric : studentMatch ? titles.studentGeneric : titles.entry
    return (
      <ScreenShell active="analytics" title={pending}>
        {error ? <ErrorBlock message={error} onRetry={reload} /> : <LoadingBlock label={L.loading} />}
      </ScreenShell>
    )
  }

  const env: V2Env = {
    cfg, lens, guest, subject, params, href,
    goLens: (nextLens, nextSubject) => {
      const p = new URLSearchParams({ lens: nextLens })
      if (nextLens === 'subject_teacher' && nextSubject) p.set('subject', nextSubject)
      navigate(`/analytics?${p.toString()}`)
    },
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
