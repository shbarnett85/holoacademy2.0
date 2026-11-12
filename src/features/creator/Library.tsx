import { SHARING_DISABLED_UI_MESSAGE } from '../../shared/lib/contact'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch, apiJson } from '../../shared/lib/api'
import { LESSON_DUE_TEXT, LIBRARY_ASSIGN_TEXT } from '../../shared/lib/findingsNarrative'
import { defaultDueAt, israelDay } from '../../shared/lib/lessonState'
import { countNoSubject, filterMine, wantsNoSubjectFilter, withNoSubjectFilter } from '../../shared/lib/libraryLinks'
import { FONT as TU_FONT, MIN_TARGET, T } from '../teacherUi/tokens'
import { trackFunnel } from '../../shared/lib/funnel'
import { holoConfirm } from '../../shared/ui/dialog'
import { puzzleTypeLabel } from '../../shared/lib/labels'
import { useStaffAuth } from '../../shared/hooks/useStaffAuth'
import { getGuestQuestIds, addGuestQuestId, removeGuestQuestId } from '../../shared/lib/guestLibrary'
import LessonCard from '../../shared/ui/LessonCard'
import StudioTopBar from './StudioTopBar'
import { glass, micro } from './studioStyles'
import { fieldStyle, infoChip, modalBackdrop, panelFinding, panelWrong, progressFill, progressTrack } from '../../styles/ui'
import { SUBJECTS, UNCLASSIFIED_LABEL, subjectTagColors } from '../../shared/lib/subjects'

interface QuestSummary {
  id: string
  title: string
  created_at: string
  is_published: boolean
  is_public: boolean
  /* הדמיית חזרה — נוצרה מהמושגים החלשים של מטלה (reviewOf ב-game_data) */
  is_review?: boolean
  sceneCount: number
  /* כלל "אורך טקסט לתלמיד": כמה סצנות ארוכות מדי למסך אחד (נספר בשרת; למורה בלבד) */
  longSceneCount?: number
  subject?: string | null
  /* קוד המקצוע (subjects.code); null = "לא סווג" */
  subjectCode?: string | null
  /* תמונת השיעור (ממוזערת) ושכבותיו — אותו כרטיס (LessonCard) כמו ברשימת התלמיד */
  thumbUrl?: string | null
  gradeMin?: number | null
  gradeMax?: number | null
}

/* הדמיה בספרייה הציבורית (GET /api/library) */
interface PublicQuest {
  id: string
  title: string
  subject: string | null
  subjectCode?: string | null
  thumbUrl?: string | null
  sceneCount: number
  puzzleTypes: string[]
  authorName: string
  publishedAt: string
  /* מטא שכבות (מספר שכבה 1-12, א׳=1) — מזין את פילטר טווח השכבות; null = ללא מטא */
  gradeMin?: number | null
  gradeMax?: number | null
  /* הדמיה רשמית של צוות HoloAcademy — badge ✓ רשמי */
  isOfficial?: boolean
}

interface StudentRow {
  id: string
  name: string
  classId: string
  class: string      // gradeLabel
  classCode: string
  isActive: boolean
}

const GRADES = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ז׳', 'ח׳', 'ט׳', 'י׳', 'י״א', 'י״ב']
const WORK_MSGS = ['טוען פרופיל…', 'מתאים רמת טקסט…', 'מכוון קושי חידות…', 'מגבש גרסה אישית…']

/* שכבה = gradeLabel ללא ספרת הכיתה */
const layerOf = (g: string) => g.replace(/\s*\d+$/, '').trim() || g

/* תג מידע שאינו לחיץ: לבן עם קו דיו. warn = הערה לתשומת לב (אזור המורה: רקע human-tint וטקסט human-deep) */
function Chip({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return <span style={{ ...(warn ? badgeWarn : infoChip), fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>{children}</span>
}
/* תגי מצב על הכרטיס (לא לחיצים): המילה אומרת את המצב, הצבע רק מלווה */
const badge: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20 }
const badgeWarn: React.CSSProperties = { background: 'var(--color-human-tint)', color: 'var(--color-human-deep)', border: '1.5px solid var(--color-human-deep)' }
const badgeOk: React.CSSProperties = { ...badge, background: 'var(--color-correct-tint)', color: 'var(--color-ink)', border: '1.5px solid var(--color-correct)' }
const badgeDraft: React.CSSProperties = { ...badge, ...badgeWarn }
const badgeInfo: React.CSSProperties = { ...badge, ...infoChip }

/* רשת הכרטיסים בכל עמודה: כרטיס לפחות 250px ברוחב — שניים בעמודה ב-1366, אחד במסך צר */
const cardGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 250px), 1fr))', gap: 14 }

/* כפתור על כרטיס ובחלונות: הצבע, הקו והצל מגיעים מהמחלקה holo-button; כאן רק מידות */
const cardBtn: React.CSSProperties = { fontSize: 12, fontWeight: 600, padding: '5px 9px', fontFamily: 'var(--font-display)' }
const BTN_SM = 'holo-button holo-button--staff holo-button--sm'
const BTN = 'holo-button holo-button--staff'

/* "הספרייה שלי": מה קרה ומה עושים בזרימת שיוך המקצוע.
   · אחרי שיוך — הודעה שנשארת על המסך (לא נעלמת מעצמה), שאומרת מה ייכלל באנליטיקה, עם קישור חזרה אליה;
   · הגעה מהאנליטיקה (?filter=nosubject) — משפט פתיחה שאומר מה עושים;
   · צ'יפ "ללא מקצוע (N)" (וחזרה ל"כל ההדמיות") — כשיש הדמיות בלי מקצוע. */
export function MineToolbar({ assignedNote, onlyNoSubject, noSubjectCount, onDismissAssigned, onSetNoSubject }: {
  assignedNote: boolean; onlyNoSubject: boolean; noSubjectCount: number; onDismissAssigned: () => void; onSetNoSubject: (on: boolean) => void
}) {
  return (
    <>
      {assignedNote && (
        <div role="status" data-library-assigned style={noteBox}>
          <span style={{ flex: '1 1 260px' }}>{LIBRARY_ASSIGN_TEXT.saved}</span>
          <Link to="/analytics" className={BTN} style={noteBtn}>{LIBRARY_ASSIGN_TEXT.backToAnalytics}</Link>
          <button type="button" onClick={onDismissAssigned} className={BTN} style={noteBtn}>{LIBRARY_ASSIGN_TEXT.dismiss}</button>
        </div>
      )}
      {/* משפט הפתיחה נעלם אחרי השיוך הראשון (הודעת השמירה כבר אומרת מה קרה ומה הלאה, ויש בה את הקישור) — כדי שהרשימה תישאר גלויה */}
      {onlyNoSubject && !assignedNote && (
        <div data-library-nosubject-intro style={noteBox}>
          <span style={{ flex: '1 1 260px' }}>{LIBRARY_ASSIGN_TEXT.intro}</span>
          <Link to="/analytics" className={BTN} style={noteBtn}>{LIBRARY_ASSIGN_TEXT.backToAnalytics}</Link>
        </div>
      )}
      {(noSubjectCount > 0 || onlyNoSubject) && (
        <div role="group" aria-label={LIBRARY_ASSIGN_TEXT.filterGroupLabel} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <FilterChip pressed={!onlyNoSubject} onClick={() => onSetNoSubject(false)}>{LIBRARY_ASSIGN_TEXT.allChip}</FilterChip>
          <FilterChip pressed={onlyNoSubject} onClick={() => onSetNoSubject(true)}>{LIBRARY_ASSIGN_TEXT.noSubjectChip(noSubjectCount)}</FilterChip>
        </div>
      )}
    </>
  )
}

/* שיוך מקצוע לשיעור "לא סווג": כפתור אחד "שיוך למקצוע" על הכרטיס — לוחצים, בוחרים מקצוע, וזה נשמר מיד (בלי שלב שמירה).
   נראה ככפתור (מסגרת עבה, 16px, יעד של 44px לפחות); בפועל רשימה מובנית של הדפדפן, כך שנגישה במקלדת ובקורא מסך.
   הכרטיס עצמו לא נפתח בלחיצה על הפקד. */
export function SubjectAssign({ busy, onAssign }: { busy: boolean; onAssign: (code: string) => void }) {
  return (
    <select className="lib-subject-select" data-subject-assign aria-label={LIBRARY_ASSIGN_TEXT.selectLabel} disabled={busy} value=""
      onClick={(e) => e.stopPropagation()} onChange={(e) => { e.stopPropagation(); if (e.target.value) onAssign(e.target.value) }}
      style={{ minHeight: MIN_TARGET, width: '100%', boxSizing: 'border-box', padding: '0 12px', borderRadius: 10, fontFamily: TU_FONT, fontSize: 16, fontWeight: 800, cursor: 'pointer', color: T.text, background: T.surface, border: `2px solid ${T.controlBorder}`, opacity: busy ? 0.55 : 1 }}>
      <option value="">{LIBRARY_ASSIGN_TEXT.selectPlaceholder}</option>
      {SUBJECTS.map((sb) => <option key={sb.code} value={sb.code}>{sb.nameHe}</option>)}
    </select>
  )
}

/* הודעה/כפתור/צ'יפ סינון בספרייה — מעוצבים לפי עקרונות מסכי המורה (גופן 16px, יעד 44px), בטוקנים של הערכה */
const noteBox: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 14px', marginBottom: 10, borderRadius: 12, background: T.surface, border: `1px solid ${T.border}`, borderInlineStart: `6px solid ${T.accent}`, fontFamily: TU_FONT, fontSize: 16, lineHeight: 1.5, color: T.text }
const noteBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: MIN_TARGET, padding: '0 16px', fontFamily: TU_FONT, fontSize: 16, fontWeight: 800, textDecoration: 'none', whiteSpace: 'nowrap' }

/* צ'יפ סינון: הנבחר ברקע דיו עם טקסט לבן (aria-pressed), משקל כבד ווי — לא בצבע בלבד */
function FilterChip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className={BTN}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: MIN_TARGET, padding: '0 16px', fontFamily: TU_FONT, fontSize: 16, fontWeight: pressed ? 800 : 600 }}>
      {pressed && <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
      {children}
    </button>
  )
}

/* ── כרטיס שיעור בספרייה שלי — הרכיב המשותף עם כרטיס השיעור של התלמיד (shared/ui/LessonCard):
   תמונה, כותרת, תגית מקצוע, תגית שכבות. במקום "שחקו" — פעולות המורה הקיימות (אותן פעולות, בלי להוסיף ובלי להוריד) ── */
export function QuestCard({ q, busy, isGuest, shareBlocked, onShareBlocked, onOpen, onPlay, onShare, onUnshare, onDelete, onAssignSubject }: {
  q: QuestSummary; busy: boolean; isGuest: boolean; shareBlocked: boolean; onShareBlocked: () => void
  onOpen: () => void; onPlay: () => void; onShare: () => void; onUnshare: () => void; onDelete: () => void
  onAssignSubject: (code: string) => void
}) {
  return (
    <LessonCard
      title={q.title} subjectCode={q.subjectCode} thumbUrl={q.thumbUrl} gradeMin={q.gradeMin} gradeMax={q.gradeMax} imageAspect="16 / 9"
      onClick={onOpen}
      body={
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={q.is_published ? badgeOk : badgeDraft}>{q.is_published ? 'פורסם' : 'טיוטה'}</span>
            {q.is_public && <span style={badgeInfo}>🌐 משותף</span>}
            {q.is_review && <span style={badgeInfo}>🔄 שיעור חזרה</span>}
            <Chip>{q.sceneCount} סצנות</Chip>
            {(q.longSceneCount ?? 0) > 0 && <Chip warn>{q.longSceneCount === 1 ? 'סצנה אחת ארוכה מדי למסך' : `${q.longSceneCount} סצנות ארוכות מדי למסך`}</Chip>}
            <Chip>{new Date(q.created_at).toLocaleDateString('he-IL')}</Chip>
          </div>
          {/* שיעור "לא סווג" — כפתור "שיוך למקצוע" בלחיצה אחת (נשמר ב-subject_id; מזין רמות ואנליטיקה פר-מקצוע) */}
          {!q.subject && <SubjectAssign busy={busy} onAssign={onAssignSubject} />}
        </>
      }
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {/* הסר שיתוף — מופיע רק כשהדמיה משותפת, כפתור משני */}
          {q.is_public && (
            <button disabled={busy} className={BTN_SM} onClick={(e) => { e.stopPropagation(); onUnshare() }}
              style={{ ...cardBtn, fontSize: 11 }}>
              הסר מהספרייה
            </button>
          )}
          <div style={{ flex: 1 }} />
          {/* מחיקה — כפתור משני אדום (עם אישור בהורה) */}
          <button disabled={busy} className={BTN_SM} title="מחק שיעור" onClick={(e) => { e.stopPropagation(); onDelete() }}
            style={cardBtn}>
            מחק 🗑️
          </button>
          {/* שתף — פותח מודאל. מנוטרל למורה אורח (חשבון הדגמה, בלי שיתוף לספרייה) */}
          <button disabled={busy || isGuest} className={BTN_SM}
            title={isGuest ? 'שיתוף אינו זמין במצב מורה אורח' : shareBlocked ? SHARING_DISABLED_UI_MESSAGE : undefined}
            aria-disabled={shareBlocked || undefined}
            onClick={(e) => { e.stopPropagation(); if (isGuest) return; if (shareBlocked) { onShareBlocked(); return } onShare() }}
            style={{ ...cardBtn, cursor: (isGuest || shareBlocked) ? 'not-allowed' : 'pointer' }}>
            שתף
          </button>
          <button onClick={(e) => { e.stopPropagation(); onOpen() }} className={BTN_SM} style={cardBtn}>ערוך</button>
          <button className={BTN_SM} onClick={(e) => { e.stopPropagation(); onPlay() }}
            style={{ ...cardBtn, fontWeight: 700 }}>
            הפעל ▶
          </button>
        </div>
      }
    />
  )
}

/* ── כרטיס בספרייה הציבורית — אותו כרטיס; הפעולות: דיווח והעתקה ── */
export function PublicCard({ q, busy, onCopy, onReport }: { q: PublicQuest; busy: boolean; onCopy: () => void; onReport: () => void }) {
  return (
    <LessonCard
      title={q.title} subjectCode={q.subjectCode} thumbUrl={q.thumbUrl} gradeMin={q.gradeMin} gradeMax={q.gradeMax} imageAspect="16 / 9"
      body={
        <>
          <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>נוצר במקור על ידי {q.authorName}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {q.isOfficial && <span style={{ ...badgeOk, flexShrink: 0, fontWeight: 800 }}>✓ רשמי</span>}
            <Chip>{q.sceneCount} סצנות</Chip>
            {q.puzzleTypes.slice(0, 3).map((t) => <Chip key={t}>{puzzleTypeLabel(t)}</Chip>)}
          </div>
        </>
      }
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <button disabled={busy} onClick={onReport} className={BTN_SM} style={cardBtn}>דווח 🚩</button>
          <div style={{ flex: 1 }} />
          <button disabled={busy} onClick={onCopy} className={BTN_SM} style={{ ...cardBtn, fontWeight: 700 }}>השתמש (העתק אליי) 📥</button>
        </div>
      }
    />
  )
}

/* ── מודאל השיתוף + ייצוא גרסאות אישיות ── */
type ShareStep = 'pick' | 'students' | 'community' | 'generating' | 'generated'
type GenStatus = 'pending' | 'working' | 'done' | 'error'
interface GenSnapshot { textLevel: number }

function ShareModal({ quest, onClose, onDone }: {
  quest: QuestSummary
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const [step, setStep] = useState<ShareStep>('pick')
  const [students, setStudents] = useState<StudentRow[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [layerFilter, setLayerFilter] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /* מועד הגשה: יום ישראלי (YYYY-MM-DD); ברירת מחדל = שבוע מהיום, נגמר ב-23:59 (השרת מחשב את הרגע המדויק) */
  const [dueDay, setDueDay] = useState(() => israelDay(defaultDueAt(new Date())))
  /* אזהרות פתוחות שהשרת החזיר בניסיון שיתוף (409) — דורשות אישור מורה מפורש */
  const [shareWarnings, setShareWarnings] = useState<string[] | null>(null)

  /* ── ייצוא גרסאות ── */
  const [genStudents, setGenStudents] = useState<StudentRow[]>([])
  const [genStatuses, setGenStatuses] = useState<Record<string, GenStatus>>({})
  const [genSnapshots, setGenSnapshots] = useState<Record<string, GenSnapshot>>({})
  const [genIdx, setGenIdx] = useState(-1)
  const [workMsgIdx, setWorkMsgIdx] = useState(0)
  const runningRef = useRef(false)
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (step !== 'generating') return
    const id = setInterval(() => setWorkMsgIdx(i => (i + 1) % WORK_MSGS.length), 900)
    return () => clearInterval(id)
  }, [step])

  /* טעינת תלמידים בכניסה לשלב תלמידים */
  useEffect(() => {
    if (step !== 'students' || students !== null) return
    apiJson<{ students: StudentRow[] }>('/api/staff/students')
      .then((b) => setStudents(b.students.filter((s) => s.isActive)))
      .catch(() => setStudents([]))
  }, [step, students])

  /* שכבות וכיתות ייחודיות */
  const layers = useMemo(() => [...new Set((students ?? []).map((s) => layerOf(s.class)))].sort(), [students])
  const classes = useMemo(() => {
    const src = students ?? []
    const filtered = layerFilter ? src.filter((s) => layerOf(s.class) === layerFilter) : src
    return [...new Map(filtered.map((s) => [s.classId, s.class])).entries()]
  }, [students, layerFilter])

  /* תלמידים מסוננים */
  const filtered = useMemo(() => {
    return (students ?? []).filter((s) => {
      if (layerFilter && layerOf(s.class) !== layerFilter) return false
      if (classFilter && s.classId !== classFilter) return false
      if (search && !s.name.includes(search)) return false
      return true
    })
  }, [students, layerFilter, classFilter, search])

  function toggleStudent(id: string) {
    setSelected((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  function toggleAll() {
    const allIds = filtered.map((s) => s.id)
    const allSelected = allIds.every((id) => selected.has(id))
    setSelected((prev) => {
      const n = new Set(prev)
      allIds.forEach((id) => allSelected ? n.delete(id) : n.add(id))
      return n
    })
  }

  async function sendToStudents() {
    const selectedList = (students ?? []).filter(s => selected.has(s.id))
    const classIds = [...new Set(selectedList.map(s => s.classId))]
    if (!classIds.length) return
    if (dueDay && dueDay < israelDay(new Date())) { setError(LESSON_DUE_TEXT.pastDay); return }
    setError(null)

    /* assign — best-effort, לא חוסם את הייצוא */
    apiJson(`/api/quests/${quest.id}/assign`, { method: 'POST', body: JSON.stringify({ classIds, ...(dueDay ? { dueDay } : {}) }) })
      .catch(() => {})

    setGenStudents(selectedList)
    setGenStatuses(Object.fromEntries(selectedList.map(s => [s.id, 'pending' as GenStatus])))
    setGenSnapshots({})
    setGenIdx(-1)
    setStep('generating')
    runGeneration(selectedList)
  }

  async function runGeneration(list: StudentRow[]) {
    runningRef.current = true
    cancelledRef.current = false
    for (let i = 0; i < list.length; i++) {
      if (cancelledRef.current) break
      const student = list[i]
      setGenIdx(i)
      setWorkMsgIdx(0)
      setGenStatuses(prev => ({ ...prev, [student.id]: 'working' }))
      try {
        const res = await apiJson<{ ok: boolean; profileSnapshot?: GenSnapshot }>(
          `/api/quests/${quest.id}/variant`,
          { method: 'POST', body: JSON.stringify({ studentId: student.id }) },
        )
        setGenStatuses(prev => ({ ...prev, [student.id]: 'done' }))
        if (res.profileSnapshot) setGenSnapshots(prev => ({ ...prev, [student.id]: res.profileSnapshot! }))
      } catch {
        setGenStatuses(prev => ({ ...prev, [student.id]: 'error' }))
      }
    }
    setGenIdx(-1)
    runningRef.current = false
    setStep('generated')
  }

  function retryFailed() {
    const failed = genStudents.filter(s => genStatuses[s.id] === 'error')
    setGenStatuses(prev => ({ ...prev, ...Object.fromEntries(failed.map(s => [s.id, 'pending' as GenStatus])) }))
    runGeneration(failed)
    setStep('generating')
  }

  /* שיתוף קישור משחק ישיר — מעתיק ל-clipboard ופותח וואטסאפ עם הודעה מוכנה.
     הקישור נפתח אצל הנמען עם תצוגה עשירה (OG) ומשחק בלי הרשמה. */
  function shareWhatsApp() {
    trackFunnel('teacher_whatsapp', quest.id)
    const url = `${window.location.origin}/play/${quest.id}`
    const text = `🎮 "${quest.title}" — שיעור למידה אינטראקטיבי ב-HoloAcademy. שחקו:\n${url}`
    navigator.clipboard?.writeText(url).catch(() => { /* clipboard לא זמין — הוואטסאפ עדיין נפתח */ })
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
    onDone('🔗 הקישור הועתק ונפתח חלון וואטסאפ לשיתוף')
    onClose()
  }

  async function shareCommunity(acknowledge: boolean) {
    setBusy(true); setError(null)
    try {
      const res = await apiFetch(`/api/quests/${quest.id}/share`, {
        method: 'POST',
        body: JSON.stringify({ acknowledgeWarnings: acknowledge }),
      })
      const body = (await res.json().catch(() => null)) as { error?: string; warnings?: string[]; needsAck?: boolean } | null
      /* שער האיכות: אזהרות פתוחות — מציגים אותן והמורה מאשר במפורש לפני שיתוף */
      if (res.status === 409 && body?.needsAck) { setShareWarnings(body.warnings ?? []); return }
      if (!res.ok) throw new Error(body?.error ?? 'שגיאה')
      onDone('🌐 השיעור שותף לספרייה הציבורית')
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : 'שגיאה') } finally { setBusy(false) }
  }

  const inp: React.CSSProperties = { ...fieldStyle, padding: '8px 12px', fontFamily: 'var(--font-display)', fontSize: 13 }
  /* שלוש אפשרויות השיתוף: כפתורי בחירה גדולים (הצבע, הקו והצל מהמחלקה holo-button) */
  const selBtn: React.CSSProperties = { flex: 1, padding: '16px 12px', fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700 }

  const genDone = Object.values(genStatuses).filter(s => s === 'done').length
  const genError = Object.values(genStatuses).filter(s => s === 'error').length
  const genTotal = genStudents.length
  const genPct = genTotal > 0 ? Math.round((genDone + genError) / genTotal * 100) : 0
  const isGenerating = step === 'generating' || step === 'generated'

  return (
    <div onClick={() => { if (step !== 'generating') onClose() }} style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', ...modalBackdrop }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...glass, width: '92%', maxWidth: (step === 'students' || isGenerating) ? 560 : 420, maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* כותרת */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 24px 0', flexShrink: 0 }}>
          {(step === 'pick' || step === 'students' || step === 'community') && step !== 'pick' && (
            <button onClick={() => { setStep('pick'); setError(null) }} className="holo-link" style={{ fontSize: 13, fontWeight: 600 }}>← חזרה</button>
          )}
          <div style={{ flex: 1, fontSize: 17, fontWeight: 800, color: 'var(--color-machine-deep)' }}>
            {step === 'pick' && 'שתף שיעור'}
            {step === 'students' && 'שלח לתלמידים'}
            {step === 'community' && 'שתף לספרייה הציבורית'}
            {step === 'generating' && 'מכין גרסאות אישיות…'}
            {step === 'generated' && (genError > 0 ? `הסתיים — ${genError} נכשל${genError > 1 ? 'ו' : ''}` : '✓ כל הגרסאות מוכנות')}
          </div>
          {step !== 'generating' && (
            <button onClick={onClose} className={BTN_SM} style={{ fontSize: 18, lineHeight: 1, padding: '3px 9px' }}>✕</button>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-muted)', padding: '4px 24px 14px', flexShrink: 0 }}>{quest.title}</div>

        {/* שלב 1 — בחירה */}
        {step === 'pick' && (
          <div style={{ padding: '0 24px 24px', display: 'flex', gap: 14 }}>
            <button onClick={() => setStep('students')} className={BTN} style={selBtn}>
              <div style={{ fontSize: 26, marginBottom: 8 }}>👩‍🎓</div>
              <div>תלמידים</div>
              <div style={{ fontSize: 11, fontWeight: 400, marginTop: 4 }}>הקצה לכיתות ספציפיות</div>
            </button>
            <button onClick={() => setStep('community')} className={BTN} style={selBtn}>
              <div style={{ fontSize: 26, marginBottom: 8 }}>🌐</div>
              <div>קהילת המורים</div>
              <div style={{ fontSize: 11, fontWeight: 400, marginTop: 4 }}>פרסם לכל המורים במערכת</div>
            </button>
            <button onClick={shareWhatsApp} className={BTN} style={selBtn}>
              <div style={{ fontSize: 26, marginBottom: 8 }}>💬</div>
              <div>וואטסאפ / קישור</div>
              <div style={{ fontSize: 11, fontWeight: 400, marginTop: 4 }}>שלחו לכל אחד — משחק מיידי</div>
            </button>
          </div>
        )}

        {/* שלב 2א — תלמידים */}
        {step === 'students' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: '0 20px 20px', gap: 10 }}>
            {/* סינון */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש שם תלמיד…" style={{ ...inp, flex: '1 1 160px' }} />
              <select value={layerFilter} onChange={(e) => { setLayerFilter(e.target.value); setClassFilter('') }}
                style={{ ...inp, appearance: 'none', WebkitAppearance: 'none', minWidth: 90 }}>
                <option value="">כל השכבות</option>
                {layers.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}
                style={{ ...inp, appearance: 'none', WebkitAppearance: 'none', minWidth: 100 }}>
                <option value="">כל הכיתות</option>
                {classes.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </div>

            {/* רשימת תלמידים */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', borderRadius: 10, border: '1px solid var(--color-line-strong)' }}>
              {students === null && <div style={{ ...micro, textAlign: 'center', padding: 24, color: 'var(--color-muted)' }}>טוען תלמידים…</div>}
              {students !== null && filtered.length === 0 && <div style={{ ...micro, textAlign: 'center', padding: 24, color: 'var(--color-muted)' }}>אין תלמידים תואמים</div>}
              {students !== null && filtered.length > 0 && (
                <>
                  {/* כותרת + בחר הכל */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--color-line-strong)', background: 'var(--color-surface)', position: 'sticky', top: 0 }}>
                    <input type="checkbox"
                      checked={filtered.every((s) => selected.has(s.id))}
                      onChange={toggleAll}
                      style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--color-ink)' }} />
                    <span style={{ ...micro, fontSize: 9 }}>שם תלמיד</span>
                    <span style={{ ...micro, fontSize: 9, marginRight: 'auto' }}>כיתה</span>
                  </div>
                  {filtered.map((s) => (
                    <div key={s.id} onClick={() => toggleStudent(s.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', cursor: 'pointer', borderBottom: '1px solid var(--color-line)', background: selected.has(s.id) ? 'var(--color-ink-wash)' : 'transparent', transition: 'background .12s' }}>
                      <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleStudent(s.id)} onClick={(e) => e.stopPropagation()}
                        style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--color-ink)' }} />
                      <span style={{ flex: 1, fontSize: 13.5, color: 'var(--color-ink)' }}>{s.name}</span>
                      <span style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>{s.class}</span>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* מועד הגשה — ברירת מחדל שבוע; השיעור לא ננעל אחריו */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexShrink: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--color-ink)' }}>
              {LESSON_DUE_TEXT.sendFieldLabel}
              <input type="date" data-send-due value={dueDay} min={israelDay(new Date())} onChange={(e) => setDueDay(e.target.value)} style={{ ...inp, minHeight: 36 }} />
            </label>
            <div style={{ fontSize: 12, color: 'var(--color-muted)', flexShrink: 0, marginTop: -4 }}>{LESSON_DUE_TEXT.sendFieldHint}</div>

            {error && <div style={{ ...panelWrong, padding: '6px 10px', fontSize: 12, flexShrink: 0 }}>⚠️ {error}</div>}

            {/* כפתור שלח */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{selected.size > 0 ? `${selected.size} תלמידים נבחרו` : 'לא נבחרו תלמידים'}</span>
              <button disabled={busy || selected.size === 0} onClick={sendToStudents} className={BTN}
                style={{ ...cardBtn, padding: '9px 22px', fontWeight: 700 }}>
                {busy ? 'שולח…' : 'שלח לתלמידים ✓'}
              </button>
            </div>
          </div>
        )}

        {/* שלב ייצוא גרסאות */}
        {isGenerating && (
          <div style={{ display: 'flex', flexDirection: 'column', padding: '0 20px 20px', gap: 12 }}>
            {/* progress bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12.5, color: 'var(--color-ink)' }}>
                  {step === 'generating' ? `מכין תלמיד ${genIdx + 1} מתוך ${genTotal}` : `${genDone} מוכנים${genError > 0 ? ` · ${genError} נכשלו` : ''}`}
                </span>
                <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{genPct}%</span>
              </div>
              <div style={{ ...progressTrack, height: 12 }}>
                <div style={{ ...progressFill, transition: 'width .4s ease', width: `${genPct}%` }} />
              </div>
            </div>

            {/* תלמיד נוכחי — המכונה מכינה גרסה */}
            {step === 'generating' && genIdx >= 0 && (() => { const s = genStudents[genIdx]; return s ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 10, background: 'var(--color-machine-tint)', border: '1px solid var(--color-line-strong)' }}>
                <span style={{ fontSize: 18, animation: 'holo-dot-pulse 1s infinite' }}>⚙</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink)' }}>מכין ל{s.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>{WORK_MSGS[workMsgIdx]}</div>
                </div>
              </div>
            ) : null })()}

            {/* רשימה */}
            <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {genStudents.map((s, i) => {
                const st = genStatuses[s.id] ?? 'pending'
                const snap = genSnapshots[s.id]
                const isCur = step === 'generating' && i === genIdx
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 12px', borderRadius: 8,
                    background: isCur ? 'var(--color-machine-tint)' : st === 'error' ? 'var(--color-wrong-tint)' : 'var(--color-surface)',
                    border: `1px solid ${isCur || st === 'done' || st === 'error' ? 'var(--color-line-strong)' : 'var(--color-line)'}` }}>
                    <span style={{ fontSize: 14, minWidth: 16, textAlign: 'center', color: st === 'done' ? 'var(--color-correct)' : st === 'pending' ? 'var(--color-muted)' : 'var(--color-ink)' }}>
                      {st === 'done' ? '✓' : st === 'error' ? '✗' : st === 'working' ? '⚙' : '○'}
                    </span>
                    <span style={{ flex: 1, fontSize: 13, color: st === 'pending' && !isCur ? 'var(--color-muted)' : 'var(--color-ink)' }}>{s.name}</span>
                    <span style={{ fontSize: 10.5, color: st === 'error' ? 'var(--color-ink)' : 'var(--color-muted)' }}>
                      {st === 'done' && snap ? `רמה ${snap.textLevel}` : st === 'error' ? 'שגיאה' : ''}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* כפתורי פעולה */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              {step === 'generating' && (
                <button className={BTN} onClick={() => { cancelledRef.current = true }}
                  style={{ ...cardBtn, padding: '8px 16px' }}>עצור</button>
              )}
              {step === 'generated' && genError > 0 && (
                <button className={BTN} onClick={retryFailed}
                  style={{ ...cardBtn, padding: '8px 16px' }}>
                  ↻ נסה שוב ({genError})
                </button>
              )}
              {step === 'generated' && (
                <button className={BTN} onClick={() => { onDone(`✅ השיעור הוקצה ל-${genStudents.length} תלמידים`); onClose() }}
                  style={{ ...cardBtn, padding: '8px 22px', fontWeight: 700 }}>
                  סגור
                </button>
              )}
            </div>
          </div>
        )}

        {/* שלב 2ב — קהילת המורים */}
        {step === 'community' && (
          <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* סיכום ההדמיה */}
            <div style={{ background: 'var(--color-ink-wash)', border: '1px solid var(--color-line-strong)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>{quest.title}</div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {quest.subject && <Chip>{quest.subject}</Chip>}
                <Chip>{quest.sceneCount} סצנות</Chip>
              </div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.7, margin: 0 }}>
              השיעור יהיה גלוי לכל המורים במערכת. הם יוכלו להעתיק אותו לעצמם לעריכה. תוכל להסיר אותו בכל עת מהספרייה.
            </p>
            {quest.is_public && (
              <div style={{ fontSize: 12.5, color: 'var(--color-ink)', background: 'var(--color-ink-wash)', border: '1px solid var(--color-line-strong)', borderRadius: 9, padding: '8px 13px' }}>
                ✓ השיעור כבר משותף בספרייה הציבורית
              </div>
            )}
            {shareWarnings && (
              <div style={{ ...panelFinding, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-human-deep)' }}>⚠ לשיעור יש אזהרות פתוחות — עברו עליהן לפני השיתוף:</div>
                <ul style={{ margin: 0, paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                  {shareWarnings.map((w, i) => <li key={i} style={{ fontSize: 12, color: 'var(--color-human-deep)', lineHeight: 1.6 }}>{w}</li>)}
                </ul>
                <div style={{ fontSize: 11.5, color: 'var(--color-ink)' }}>אפשר לתקן בעמוד העריכה ולנסות שוב, או לאשר ולשתף כמו שזה.</div>
              </div>
            )}
            {error && <div style={{ ...panelWrong, padding: '6px 10px', fontSize: 12, whiteSpace: 'pre-line' }}>⚠️ {error}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={onClose} className={BTN} style={{ ...cardBtn, padding: '8px 18px' }}>ביטול</button>
              <button disabled={busy || quest.is_public} onClick={() => shareCommunity(shareWarnings !== null)} className={BTN}
                style={{ ...cardBtn, padding: '8px 20px', fontWeight: 700 }}>
                {busy ? 'משתף…' : quest.is_public ? 'כבר משותף' : shareWarnings ? 'בדקתי — שתף בכל זאת' : 'שתף 🌐'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* טווח כפול (dual-range) לרמת כתיבה */
function DualRange({ min, max, lo, hi, setLo, setHi }: { min: number; max: number; lo: number; hi: number; setLo: (n: number) => void; setHi: (n: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<'lo' | 'hi' | null>(null)
  const pct = (v: number) => (v - min) / (max - min)
  const leftLo = (1 - pct(lo)) * 100
  const leftHi = (1 - pct(hi)) * 100
  const getVal = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect()
    const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return Math.round(max - f * (max - min))
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const v = getVal(e.clientX)
    if (drag.current === 'lo') setLo(Math.min(Math.max(v, min), hi))
    else setHi(Math.max(Math.min(v, max), lo))
  }
  const mkThumb = (which: 'lo' | 'hi', lp: number) => (
    <div key={which} onPointerDown={(e) => { e.preventDefault(); drag.current = which; ref.current!.setPointerCapture(e.pointerId) }}
      style={{ position: 'absolute', left: `calc(${lp}% - 8px)`, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, borderRadius: '50%', background: 'var(--color-action)', border: '2px solid var(--color-ink)', boxShadow: '2px 2px 0 var(--color-ink)', cursor: 'grab', zIndex: 3 }} />
  )
  return (
    <div ref={ref} style={{ position: 'relative', height: 28, cursor: 'pointer' }} onPointerMove={onMove} onPointerUp={() => { drag.current = null }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', height: 6, borderRadius: 6, background: 'var(--color-line)' }} />
      <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', height: 6, borderRadius: 6, left: leftHi + '%', width: Math.max(0, leftLo - leftHi) + '%', background: 'var(--color-ink)' }} />
      {mkThumb('hi', leftHi)}
      {mkThumb('lo', leftLo)}
    </div>
  )
}

/* כותרת עמודה. human = אזור המורים (הספרייה הציבורית): מסגרת האייקון באפרסק; אחרת בלילך של המכונה */
function ColHead({ icon, title, kicker, count, human }: { icon: React.ReactNode; title: string; kicker: string; count: string; human?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 16 }}>
      <span style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 10, background: human ? 'var(--color-human-tint)' : 'var(--color-machine-tint)', border: '1.5px solid var(--color-ink)', color: 'var(--color-ink)' }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 16.5, fontWeight: 700, color: 'var(--color-machine-deep)' }}>{title}</div>
        <div style={{ ...micro, marginTop: 2 }}>{kicker} · {count}</div>
      </div>
    </div>
  )
}

export default function Library() {
  const { isGuest, isStaff } = useStaffAuth()
  /* הרשאת שיתוף מהשרת (תצוגה בלבד — האכיפה בשרת: 403 SHARING_DISABLED) */
  const [shareBlocked, setShareBlocked] = useState(false)
  const [quests, setQuests] = useState<QuestSummary[] | null>(null)
  const [publicQuests, setPublicQuests] = useState<PublicQuest[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [subjOn, setSubjOn] = useState<Record<string, boolean>>({})
  const [lo, setLo] = useState(0)
  const [hi, setHi] = useState(GRADES.length - 1)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [shareFor, setShareFor] = useState<QuestSummary | null>(null)
  const [reportFor, setReportFor] = useState<PublicQuest | null>(null)
  const [reportReason, setReportReason] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const navigate = useNavigate()
  /* ?filter=nosubject — היעד של "שייכו מקצוע להדמיות" באנליטיקה: רק ההדמיות שעוד לא שויכו למקצוע */
  const [sp, setSp] = useSearchParams()
  const onlyNoSubject = wantsNoSubjectFilter(sp)
  const setOnlyNoSubject = (on: boolean) => setSp((prev) => withNoSubjectFilter(prev, on), { replace: true })
  /* אחרי שיוך מקצוע: הודעה שנשארת על המסך (לא נעלמת מעצמה) עם קישור חזרה לאנליטיקה */
  const [assignedNote, setAssignedNote] = useState(false)

  /* עוקב חיים — מונע setState אחרי unmount (ניווט מהיר באמצע טעינה).
     חשוב: מאתחלים ל-true בגוף ה-effect (לא רק בהצהרה) — ב-StrictMode ה-effect רץ
     mount→unmount→remount, ובלי האיפוס ה-cleanup הראשון היה משאיר false לתמיד. */
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  function loadMine() {
    apiJson<{ quests: QuestSummary[]; permissions?: { canShare?: boolean } }>('/api/quests')
      .then((b) => { if (mountedRef.current) { setQuests(b.quests); setShareBlocked(b.permissions?.canShare === false && isStaff) } })
      .catch((e: Error) => { if (mountedRef.current) setError(e.message) })
  }
  function loadPublic() {
    apiJson<{ quests: PublicQuest[] }>('/api/library')
      .then((b) => { if (mountedRef.current) setPublicQuests(b.quests) })
      .catch(() => { if (mountedRef.current) setPublicQuests([]) })
  }
  useEffect(() => { loadMine(); loadPublic() }, [])

  function flash(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2600) }

  async function doUnshare(q: QuestSummary) {
    setBusyId(q.id); setError(null)
    try { await apiJson(`/api/quests/${q.id}/unshare`, { method: 'POST' }); flash('השיעור הוסר מהספרייה'); loadMine(); loadPublic() }
    catch (e) { setError(e instanceof Error ? e.message : 'שגיאה') } finally { setBusyId(null) }
  }
  async function doAssignSubject(q: QuestSummary, code: string) {
    setBusyId(q.id); setError(null)
    try {
      const out = await apiJson<{ subject?: string; subjectCode?: string }>(`/api/quests/${q.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subjectCode: code }) })
      setQuests((prev) => (prev ?? []).map((it) => (it.id === q.id ? { ...it, subject: out.subject ?? null, subjectCode: out.subjectCode ?? code } : it)))
      setAssignedNote(true)
    } catch (e) { setError(e instanceof Error ? e.message : 'שגיאה בשיוך המקצוע') } finally { setBusyId(null) }
  }
  async function doDelete(q: QuestSummary) {
    if (!(await holoConfirm(`למחוק לצמיתות את השיעור "${q.title}"? לא ניתן לשחזר.`, 'מחק לצמיתות', 'ביטול'))) return
    setBusyId(q.id); setError(null)
    try { await apiJson(`/api/quests/${q.id}`, { method: 'DELETE' }); if (isGuest) removeGuestQuestId(q.id); flash('🗑️ השיעור נמחק'); loadMine(); loadPublic() }
    catch (e) { setError(e instanceof Error ? e.message : 'שגיאה במחיקה') } finally { setBusyId(null) }
  }
  async function doCopy(q: PublicQuest) {
    setBusyId(q.id); setError(null)
    try {
      const { quest } = await apiJson<{ quest: { id: string; title: string } }>(`/api/library/${q.id}/copy`, { method: 'POST' })
      if (isGuest) addGuestQuestId(quest.id) /* מורה אורח: העותק שייך לספרייה המקומית שלו */
      flash('📥 הועתק לספרייה שלך — אפשר לערוך')
      loadMine()
      navigate(`/creator/quest/${quest.id}`)
    } catch (e) { setError(e instanceof Error ? e.message : 'שגיאה') } finally { setBusyId(null) }
  }
  async function doReport() {
    if (!reportFor || reportReason.trim().length < 3) return
    const q = reportFor; setBusyId(q.id)
    try { await apiJson(`/api/library/${q.id}/report`, { method: 'POST', body: JSON.stringify({ reason: reportReason.trim() }) }); setReportFor(null); setReportReason(''); flash('🚩 הדיווח נשלח — תודה') }
    catch (e) { setError(e instanceof Error ? e.message : 'שגיאה') } finally { setBusyId(null) }
  }

  const subjKeys = Object.keys(subjOn)
  const dirty = subjKeys.length > 0 || query.trim() !== '' || lo > 0 || hi < GRADES.length - 1 || onlyNoSubject
  const clearAll = () => { setQuery(''); setSubjOn({}); setLo(0); setHi(GRADES.length - 1); if (onlyNoSubject) setOnlyNoSubject(false) }
  const toggleSubj = (sub: string) => setSubjOn((p) => { const n = { ...p }; if (n[sub]) delete n[sub]; else n[sub] = true; return n })

  /* מורה אורח: מסננים לספרייה המקומית של הדפדפן שלו בלבד (בידוד per-browser —
     כל האורחים חולקים את חשבון הדמו, אז השרת מחזיר את ההדמיות של כולם). */
  const mineBase = useMemo(() => {
    if (!quests) return []
    if (!isGuest) return quests
    const own = new Set(getGuestQuestIds())
    return quests.filter((it) => own.has(it.id))
  }, [quests, isGuest])
  const noSubjectCount = countNoSubject(mineBase)
  /* "הספרייה שלי" מסוננת לפי שם, לפי המקצועות שנבחרו בסרגל הסינון (כמו הקהילה), וגם לפי "ללא מקצוע" */
  const mineF = useMemo(
    () => filterMine(mineBase, { query, subjects: subjOn, onlyNoSubject, unclassifiedLabel: UNCLASSIFIED_LABEL }),
    [mineBase, query, subjOn, onlyNoSubject],
  )

  const commF = useMemo(() => {
    return (publicQuests ?? []).filter((it) => {
      if (query.trim() && !`${it.title} ${it.authorName}`.toLowerCase().includes(query.trim().toLowerCase())) return false
      if (subjKeys.length) {
        const ok = !!subjOn[it.subject ?? UNCLASSIFIED_LABEL]
        if (!ok) return false
      }
      /* פילטר טווח שכבות — רק כשהמורה צמצם את הטווח ולהדמיה יש מטא שכבה.
         GRADES[i] = שכבה i+1 (א׳=1); חפיפת טווחים = נכלל. הדמיה בלי מטא תמיד מוצגת. */
      if ((lo > 0 || hi < GRADES.length - 1) && it.gradeMin != null && it.gradeMax != null) {
        if (it.gradeMax < lo + 1 || it.gradeMin > hi + 1) return false
      }
      return true
    })
  }, [publicQuests, subjKeys.length, subjOn, query, lo, hi])

  const panel: React.CSSProperties = { ...glass, padding: 22, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }
  const emptyMsg = (text: string) => <div style={{ ...micro, color: 'var(--color-muted)', textAlign: 'center', padding: '34px 0', fontSize: 11 }}>{text}</div>

  return (
    <div dir="rtl" style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-display)', background: 'var(--color-machine-bg)' }}>

      <style>{`.lib-subject-select option { background: var(--color-surface); color: var(--color-ink); }`}</style>
      <StudioTopBar active="library" />

      <div data-studio-content className="holo-tab-enter" style={{ position: 'relative', zIndex: 2, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 30px 26px' }}>
        {/* חלון סינון */}
        <div style={{ ...glass, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14, flex: '0 0 auto' }}>
          <div style={{ ...fieldStyle, display: 'flex', alignItems: 'center', gap: 14, padding: '8px 14px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ stroke: 'var(--color-ink)' }} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש לפי שם או יוצר…" style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--color-ink)', fontSize: 15, fontFamily: 'var(--font-display)' }} />
            <button onClick={clearAll} className={BTN_SM} style={{ fontSize: 12, fontWeight: 600, padding: '6px 13px', whiteSpace: 'nowrap', flex: '0 0 auto', visibility: dirty ? 'visible' : 'hidden', pointerEvents: dirty ? 'auto' : 'none' }}>נקה סינון</button>
          </div>
          <div style={{ height: 1, background: 'var(--color-line)' }} />
          <div>
            <div style={{ ...micro, marginBottom: 10 }}>מקצוע</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, flex: 1, minWidth: 220 }}>
                {/* כל כפתור בצבע המקצוע שלו (אותה חוקיות כמו התגית שעל כרטיס השיעור); נבחר: דיו, עם נקודה בצבע המקצוע וסימן ✓ */}
                {[...SUBJECTS.map((sb) => ({ name: sb.nameHe, code: sb.code as string | null })), { name: UNCLASSIFIED_LABEL, code: null }].map(({ name: sub, code }) => {
                  const on = !!subjOn[sub]
                  const tag = subjectTagColors(code)
                  return (
                    <button key={sub} type="button" data-subject-filter={tag.code} aria-pressed={on} onClick={() => toggleSubj(sub)} className={BTN_SM + ' holo-button--subject'}
                      style={{ padding: '8px 15px', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)', ['--btn-fill' as string]: tag.bg, ['--btn-ink' as string]: tag.fg }}>
                      <span className="holo-subject-dot" aria-hidden="true" />
                      {on && <span aria-hidden="true">✓</span>}
                      {sub}
                    </button>
                  )
                })}
              </div>
              <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 12, paddingRight: 16, borderRight: '1px solid var(--color-line-strong)' }}>
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div style={{ ...micro, fontSize: 9 }}>רמת כתיבה</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-ink)' }}>כיתה {GRADES[lo]} – {GRADES[hi]}</div>
                </div>
                <div style={{ width: 280, maxWidth: '40vw' }}><DualRange min={0} max={GRADES.length - 1} lo={lo} hi={hi} setLo={setLo} setHi={setHi} /></div>
              </div>
            </div>
          </div>
        </div>

        {/* שתי עמודות */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          {/* הספרייה שלי */}
          <div style={{ flex: '1 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={panel}>
              <ColHead title="הספרייה שלי" kicker="MY LIBRARY" count={`${mineF.length} שיעורים`}
                icon={<svg width="19" height="19" viewBox="0 0 24 24" fill="none" style={{ stroke: 'var(--color-ink)' }} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>} />
              {error && <div style={{ ...panelWrong, padding: 12, marginBottom: 10 }}>{error}</div>}
              <MineToolbar assignedNote={assignedNote} onlyNoSubject={onlyNoSubject} noSubjectCount={noSubjectCount}
                onDismissAssigned={() => setAssignedNote(false)} onSetNoSubject={setOnlyNoSubject} />
              <div className="cf-scroll" data-lesson-grid="mine" style={{ ...cardGrid, flex: 1, minHeight: 0, overflowY: 'auto', paddingLeft: 8, alignContent: 'start' }}>
                {!quests && !error && emptyMsg('טוען…')}
                {quests && mineF.length === 0 && (
                  onlyNoSubject && noSubjectCount === 0
                    ? (
                      /* כל ההדמיות שויכו: משפט קריא (16px) ולא שורת העזר הזעירה של שאר המצבים הריקים */
                      <div data-library-none-left style={{ fontFamily: TU_FONT, textAlign: 'center', padding: '28px 12px', color: T.text }}>
                        <p style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, lineHeight: 1.5 }}>{LIBRARY_ASSIGN_TEXT.noneLeft.title}</p>
                        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: T.textSoft }}>{LIBRARY_ASSIGN_TEXT.noneLeft.whatNext}</p>
                      </div>
                    )
                    : emptyMsg((isGuest ? getGuestQuestIds().length === 0 : quests.length === 0) ? 'עדיין אין שיעורים — צרו את הראשון!' : LIBRARY_ASSIGN_TEXT.noMatches)
                )}
                {mineF.map((q) => (
                  <QuestCard key={q.id} q={q} busy={busyId === q.id} isGuest={isGuest}
                    onOpen={() => navigate(`/creator/quest/${q.id}`)}
                    onPlay={() => navigate(`/play/${q.id}`)}
                    shareBlocked={shareBlocked}
                    onShareBlocked={() => flash(SHARING_DISABLED_UI_MESSAGE)}
                    onShare={() => { if (!isStaff) { navigate('/staff/login') /* שיתוף דורש חשבון */ } else setShareFor(q) }}
                    onUnshare={() => doUnshare(q)}
                    onAssignSubject={(code) => doAssignSubject(q, code)}
                    onDelete={() => doDelete(q)} />
                ))}
              </div>
            </div>
          </div>

          {/* ספרייה ציבורית */}
          <div style={{ flex: '1 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={panel}>
              <ColHead human title="ספרייה ציבורית" kicker="COMMUNITY" count={`${commF.length} זמינות`}
                icon={<svg width="19" height="19" viewBox="0 0 24 24" fill="none" style={{ stroke: 'var(--color-ink)' }} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>} />
              <div className="cf-scroll" data-lesson-grid="public" style={{ ...cardGrid, flex: 1, minHeight: 0, overflowY: 'auto', paddingLeft: 8, alignContent: 'start' }}>
                {!publicQuests && emptyMsg('טוען…')}
                {publicQuests && commF.length === 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '40px 16px', textAlign: 'center' }}>
                    <div style={{ width: 56, height: 56, borderRadius: 16, display: 'grid', placeItems: 'center', background: 'var(--color-ink-wash)', border: '1.5px dashed var(--color-line-strong)' }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" style={{ stroke: 'var(--color-muted)' }} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
                    </div>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--color-ink)' }}>{(publicQuests?.length ?? 0) === 0 ? 'אין עדיין שיעורים משותפים' : 'אין תוצאות לסינון'}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--color-muted)', maxWidth: 280, lineHeight: 1.6 }}>שתפו שיעור שיצרתם (כפתור "שתף") כדי שיופיע כאן לכל המורים.</div>
                  </div>
                )}
                {commF.map((q) => <PublicCard key={q.id} q={q} busy={busyId === q.id} onCopy={() => doCopy(q)} onReport={() => { setReportFor(q); setReportReason('') }} />)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* מודאל שיתוף */}
      {shareFor && (
        <ShareModal
          quest={shareFor}
          onClose={() => setShareFor(null)}
          onDone={(msg) => { flash(msg); loadMine(); loadPublic() }}
        />
      )}

      {/* מודאל דיווח */}
      {reportFor && (
        <div onClick={() => setReportFor(null)} style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', ...modalBackdrop }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...glass, padding: '28px 34px', maxWidth: 420, width: '90%' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-machine-deep)', marginBottom: 4 }}>דיווח על שיעור</div>
            <div style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 14 }}>"{reportFor.title}" · {reportFor.authorName}</div>
            <textarea value={reportReason} onChange={(e) => setReportReason(e.target.value)} rows={4} placeholder="סיבת הדיווח (תוכן לא הולם, שגיאה חמורה, וכו׳)…"
              style={{ ...fieldStyle, width: '100%', padding: '10px 12px', fontFamily: 'var(--font-display)', fontSize: 13.5, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setReportFor(null)} className={BTN} style={{ ...cardBtn, padding: '8px 18px' }}>ביטול</button>
              <button disabled={reportReason.trim().length < 3} onClick={doReport} className={BTN} style={{ ...cardBtn, padding: '8px 18px' }}>שלח דיווח 🚩</button>
            </div>
          </div>
        </div>
      )}

      {/* toast */}
      {toast && (
        <div style={{ ...glass, position: 'fixed', bottom: 26, left: '50%', transform: 'translateX(-50%)', zIndex: 90, padding: '11px 22px', fontSize: 14, fontWeight: 600 }}>{toast}</div>
      )}
    </div>
  )
}
