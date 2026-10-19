import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import StudioTopBar from '../creator/StudioTopBar'
import type { AnalyticsConfig, Lens } from '../../shared/types/analyticsV2'
import AdminView from './AdminView'
import { BriefingOverlay, FeedbackOverlay } from './Overlays'
import { HomeroomView, SubjectTeacherView, type NavState } from './Views'
import { Chip, ErrorBox, Loading, Notice } from './ui'
import { C } from './tokens'
import { useV2, type V2Params } from './v2api'

const LENS_LABEL: Record<Lens, string> = { homeroom: 'צפו כמחנך/ת', subject_teacher: 'כמורה מקצועי/ת', admin: 'כמנהל/ת' }
const LENS_ORDER: Lens[] = ['homeroom', 'subject_teacher', 'admin']

/* האנליטיקה החדשה. המסך צורך את חוזה analyticsV2 בלבד — אין כאן ידיעה אם הנתונים מהדגמה או מהמנוע האמיתי.
   בורר העדשה מוצג רק כשהשרת מצהיר על כמה עדשות זמינות (מורה אורח); כל עדשה נאכפת בשרת. */
export default function AnalyticsV2App() {
  const [sp, setSp] = useSearchParams()
  const update = useCallback((patch: Record<string, string | null>) => {
    setSp((prev) => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(patch)) { if (v === null) next.delete(k); else next.set(k, v) }
      return next
    }, { replace: true })
  }, [setSp])

  const lensParam = sp.get('lens')
  const subjectParam = sp.get('subject')
  const baseParams: V2Params = { lens: lensParam ?? undefined, subject: subjectParam ?? undefined }
  const { data: cfg, loading, error } = useV2<AnalyticsConfig>('/config', baseParams)

  const student = sp.get('student')
  const brief = sp.get('brief') /* "student:<id>" | "class:<id>" */
  const fb = sp.get('fb')
  const nav: NavState = {
    student,
    setStudent: (id) => update({ student: id }),
    openBriefing: (scope, id) => update({ brief: `${scope}:${id}` }),
    openFeedback: (id) => update({ fb: id }),
  }

  const shell = (children: React.ReactNode): React.ReactElement => (
    <div dir="rtl" style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-display)', background: 'var(--t-studio-bg)' }}>
      <div style={{ position: 'absolute', left: -120, top: -80, width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, var(--t83), transparent 70%)', filter: 'blur(20px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', right: -120, bottom: -120, width: 460, height: 460, borderRadius: '50%', background: 'radial-gradient(circle, var(--t84), transparent 70%)', filter: 'blur(20px)', pointerEvents: 'none' }} />
      <StudioTopBar active="analytics" />
      <div data-studio-content className="holo-tab-enter" style={{ position: 'relative', zIndex: 2, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 24px 32px', width: '100%', boxSizing: 'border-box' }}>
        {children}
      </div>
    </div>
  )

  if (loading && !cfg) return shell(<Loading />)
  if (error || !cfg) return shell(<ErrorBox message={error ?? 'לא ניתן לטעון את האנליטיקה'} />)

  const lens = cfg.lens ?? 'homeroom'
  const guest = cfg.availableLenses.length > 1
  const subject = (guest ? subjectParam : null) ?? cfg.subjects[0]?.code ?? 'math'
  const params: V2Params = guest ? { lens, subject: lens === 'subject_teacher' ? subject : undefined } : {}

  return shell(
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 22, color: C.text }}>אנליטיקה — תמונת למידה</h1>
        {cfg.dataNotice && <Chip tone="accent" title={cfg.dataNotice}>🎬 נתוני הדגמה</Chip>}
        <div style={{ flex: 1 }} />
        {guest && (
          <div role="radiogroup" aria-label="בחירת עדשה" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {LENS_ORDER.filter((l) => cfg.availableLenses.includes(l)).map((l) => (
              <button key={l} type="button" role="radio" aria-checked={lens === l} onClick={() => update({ lens: l, student: null, brief: null, fb: null })}
                style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, padding: '7px 14px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${lens === l ? C.accent : C.border}`, background: lens === l ? 'var(--t20)' : 'transparent', color: lens === l ? C.accentBright : C.muted }}>
                {LENS_LABEL[l]}
              </button>
            ))}
            {lens === 'subject_teacher' && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.muted }}>
                מקצוע:
                <select value={subject} onChange={(e) => update({ subject: e.target.value, student: null })} aria-label="מקצוע המורה"
                  style={{ fontFamily: 'var(--font-display)', fontSize: 13, padding: '6px 10px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'var(--t57)', color: C.text }}>
                  {cfg.subjects.map((s) => <option key={s.code} value={s.code}>{s.nameHe}</option>)}
                </select>
              </label>
            )}
          </div>
        )}
      </div>
      {cfg.curriculumNotice && <Notice style={{ fontSize: 11.5 }}>{cfg.curriculumNotice}</Notice>}

      {lens === 'homeroom' && <HomeroomView params={params} nav={nav} />}
      {lens === 'subject_teacher' && <SubjectTeacherView params={params} nav={nav} subject={subject} classes={cfg.classes} />}
      {lens === 'admin' && <AdminView params={params} />}

      {brief && (() => {
        const [scope, id] = brief.split(':')
        return (scope === 'student' || scope === 'class') && id
          ? <BriefingOverlay scope={scope} id={id} params={params} notice={cfg.dataNotice} onClose={() => update({ brief: null })} />
          : null
      })()}
      {fb && <FeedbackOverlay studentId={fb} params={params} onClose={() => update({ fb: null })} />}
    </>,
  )
}
