/* ──────────────────────────────────────────────────────────────────────────
   AiSummaryPanel — הסיכום המילולי של ד״ר הולו (תלמיד · כיתה · מקצוע בכיתה · הגשה). פאנל אחד לכל המסכים:
   שכבת-על (SummaryOverlay) וכרטיס מוטמע בטאב "במבט אחד" בתוצאות (compact).
   מצבים (proposal סעיף 3): אין סיכום · לא מספיק נתונים · כותב · מוכן (ב-AI / תבניתי / הדגמה) · עריכה · שגיאה.
     · לא מספיק נתונים: הכפתור מושבת והסיבה כתובה לידו — לא מוסתר.
     · מוכן: מעל הטקסט "נכתב על ידי ד״ר הולו (בינה מלאכותית)" / "סיכום אוטומטי מהנתונים" באייקון+מילה, "נערך על ידך" ותאריך הכתיבה; פסקאות 17px;
       מתחתיהן "מבוסס על…" וההסתייגות הקבועה (מהשרת, לא מה-AI). כל כפתור עם מילה, 44px לפחות. "איך נכתב הסיכום?" מקופל.
       סיכום שלא נשמר בשרת: ההודעה אומרת מה עושים, וכפתורי הייצוא וההדפסה מודגשים.
     · הדגמה (אורח / ארגון הדגמה): "זה סיכום הדגמה", בלי שמירה, בלי עריכה.
   הפאנל לא מחליט הרשאות: השרת מחליט, והפאנל מציג את התשובה (או שגיאה בעברית פשוטה). הטקסטים: findingsNarrative.
   הפרדה: useAiSummary (מצב + רשת) ↔ AiSummaryView (תצוגה בלבד, נבדקת עם מצב קבוע).
   ────────────────────────────────────────────────────────────────────────── */
import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AI_SUMMARY_HARDENING_TEXT, AI_SUMMARY_PANEL_TEXT, AI_SUMMARY_TEXT, aiSummaryGenerateHint } from '../../shared/lib/findingsNarrative'
import type { SummaryTarget } from '../../shared/types/aiSummaryV1'
import { EmptyState, HowWeCalc, Icon, T } from '../teacherUi'
import type { SummaryParams } from './api'
import { exportSummaryToWord, formatSummaryDate, printSummary } from './exportWord'
import type { SummaryDocInput } from './exportWord'
import { isRetryable, MAX_EDIT_CHARS } from './state'
import type { PanelModel, ShownSummary } from './state'
import { card, compactCard, disabledStyle, plainCard, heading as headingStyle, paragraph, primaryButton, row, secondaryButton, soft } from './styles'
import { useAiSummary } from './useAiSummary'
import type { AiSummaryActions } from './useAiSummary'

const T_UI = AI_SUMMARY_TEXT.ui
const T_PANEL = AI_SUMMARY_PANEL_TEXT

/* ניצוץ קטן: סימן "נכתב על ידי ד״ר הולו". תמיד לצד מילים (העיקרון: אייקון + מילה), ולכן aria-hidden */
function SparkMark({ size = 18 }: { size?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, display: 'block' }}>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M19 16v4" /><path d="M17 18h4" />
    </svg>
  )
}

/* מגלגל רק את האזור הגולל הקרוב ביותר (לא את כל העמוד), כך שראש המסך נשאר במקומו. אין אזור כזה (מסך צר, העמוד עצמו גולל): גלילה רגילה */
function scrollCardToTop(el: HTMLElement): void {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const overflowY = getComputedStyle(p).overflowY
    if ((overflowY === 'auto' || overflowY === 'scroll') && p.scrollHeight > p.clientHeight) {
      p.scrollTop += el.getBoundingClientRect().top - p.getBoundingClientRect().top - 4
      return
    }
  }
  el.scrollIntoView({ block: 'start' })
}

/* ── חלקים קטנים ── */
function Button({ children, kind = 'secondary', onClick, disabled, expanded, controls }: { children: ReactNode; kind?: 'primary' | 'secondary'; onClick?: () => void; disabled?: boolean; expanded?: boolean; controls?: string }) {
  return (
    <button type="button" data-tu-press onClick={onClick} disabled={disabled} aria-expanded={expanded} aria-controls={controls}
      style={{ ...(kind === 'primary' ? primaryButton : secondaryButton), ...(disabled ? disabledStyle : null) }}>
      {children}
    </button>
  )
}

function Line({ icon, children, role, accent }: { icon: 'info' | 'alert'; children: ReactNode; role?: 'alert' | 'status'; accent?: string }) {
  return (
    <p role={role} style={{ ...soft, display: 'flex', gap: 8, alignItems: 'flex-start', color: T.text }}>
      <span style={{ color: accent ?? T.accent, display: 'inline-flex', marginTop: 3 }}><Icon name={icon} size={18} /></span>
      <span style={{ minWidth: 0 }}>{children}</span>
    </p>
  )
}

/* מי כתב — אייקון + מילים (לא צבע בלבד) */
function AuthorLabel({ s, demo }: { s: ShownSummary; demo: boolean }) {
  const ai = s.writtenBy === 'ai' && !demo
  return (
    <span data-ai-label={ai ? 'ai' : demo ? 'demo' : 'template'} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', fontSize: 16, fontWeight: 700, color: T.text }}>
      <span style={{ color: T.accent, display: 'inline-flex' }}>{ai ? <SparkMark /> : <Icon name="info" size={18} />}</span>
      {s.label}
    </span>
  )
}

function EditedBadge() {
  return (
    <span data-ai-edited style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 16, fontWeight: 700, padding: '1px 10px', borderRadius: 14, border: `1.5px solid ${T.controlBorder}`, color: T.text }}>
      <span style={{ color: T.good, display: 'inline-flex' }}><Icon name="check" size={16} strokeWidth={2.6} /></span>
      {AI_SUMMARY_TEXT.editedBadge}
    </span>
  )
}

/* שדה העריכה: תווית גלויה, גוף 17px, מקבל פוקוס כשנפתח */
function Editor({ model, actions }: { model: PanelModel; actions: AiSummaryActions }) {
  const id = useId()
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  const busy = model.saving
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label htmlFor={id} style={{ ...soft, fontWeight: 700, color: T.text }}>{T_PANEL.editFieldLabel}</label>
      <p style={soft}>{T_PANEL.editHint}</p>
      {/* Escape בתוך העריכה לא סוגר את השכבה כולה (הטיוטה הייתה אובדת): היציאה היא הכפתור "ביטול" */}
      <textarea id={id} ref={ref} value={model.draft} onChange={(e) => actions.draftChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') e.stopPropagation() }} maxLength={MAX_EDIT_CHARS} rows={10} dir="rtl" disabled={busy}
        style={{ width: '100%', boxSizing: 'border-box', minHeight: 200, padding: '10px 12px', borderRadius: 12, border: `2px solid ${T.controlBorder}`, background: T.surfaceSoft, color: T.text, fontFamily: 'inherit', fontSize: 17, lineHeight: 1.7, resize: 'vertical' }} />
      {model.error?.action === 'save' && <Line icon="alert" role="alert" accent={T.bad}>{model.error.message}</Line>}
      <div className="v2-noprint" style={row}>
        <Button kind="primary" onClick={actions.save} disabled={busy}>{busy ? T_PANEL.saving : T_UI.save}</Button>
        <Button onClick={actions.cancel} disabled={busy}>{T_UI.cancel}</Button>
        {model.canRevert && <Button onClick={actions.revert} disabled={busy}>{T_UI.revert}</Button>}
      </div>
    </div>
  )
}

/* ── הגוף של סיכום מוכן ── */
function ReadyBody({ model, actions, exportName, showAuthor }: { model: PanelModel; actions: AiSummaryActions; exportName: string; showAuthor: boolean }) {
  const s = model.summary as ShownSummary
  const doc: SummaryDocInput = {
    scope: model.scope, name: exportName, paragraphs: s.paragraphs, writtenBy: s.writtenBy, edited: s.edited, demo: model.demo, basisText: s.basisText, caveat: s.caveat,
    writtenAt: s.generatedAt, stale: s.stale,
  }
  const date = formatSummaryDate(s.generatedAt)
  const busy = model.writing || model.saving
  /* הסיכום מוצג אך לא נשמר במערכת (לפני המיגרציה / כשל שמירה): הוא ייעלם עם סגירת המסך */
  const keepNote = !model.demo && !model.persisted && !!model.persistenceNote
  const confirmId = useId()
  /* הכפתור שנלחץ ("כתבו לי סיכום" / "שמירה") נעלם כשהמצב מתחלף — הפוקוס עובר לטקסט (קורא מסך מקריא אותו) ולא הולך לאיבוד */
  const textRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (model.wrote) textRef.current?.focus({ preventScroll: true }) }, [model.wrote])
  const wasEditing = useRef(false)
  useEffect(() => {
    if (wasEditing.current && !model.editing) textRef.current?.focus({ preventScroll: true })
    wasEditing.current = model.editing
  }, [model.editing])
  if (model.editing) return <Editor model={model} actions={actions} />
  return (
    <>
      {s.notice && <Line icon="info">{s.notice}</Line>}
      {/* מי כתב — מעל הטקסט, כדי שהמורה תדע מי כתב לפני שהיא קוראת (אייקון + מילים) */}
      {showAuthor && (
        <div style={row} data-ai-author>
          <AuthorLabel s={s} demo={model.demo} />
          {s.edited && <EditedBadge />}
        </div>
      )}
      {/* תאריך הכתיבה בולט, מעל הטקסט: סיכום ישן לא נראה כעדכני. ואם ייתכן שהנתונים השתנו — נאמר במילים, עם אייקון */}
      {date && <p data-ai-written style={{ ...soft, fontWeight: 800, color: T.text }}>{AI_SUMMARY_HARDENING_TEXT.writtenOn(date)}</p>}
      {s.stale && <Line icon="alert" role="status" accent={T.warn}>{AI_SUMMARY_HARDENING_TEXT.stale}</Line>}
      <div ref={textRef} tabIndex={-1} data-ai-text style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 780, outline: 'none' }}>
        {s.paragraphs.map((p, i) => <p key={i} style={paragraph}>{p}</p>)}
      </div>
      <p data-ai-basis style={soft}>{s.basisText}</p>
      <p data-ai-caveat style={soft}>{s.caveat}</p>
      {model.writing && <p role="status" style={{ ...soft, fontWeight: 700, color: T.text }}>{T_UI.writing}</p>}
      {model.error && model.error.action !== 'save' && <Line icon="alert" role="alert" accent={T.bad}>{model.error.message}</Line>}
      {/* הסיכום לא נשמר בשרת: אומרים מה עושים (מיוצאים או מדפיסים לפני הסגירה), ושני הכפתורים האלה מודגשים */}
      {keepNote && <Line icon="info" role="status">{model.persistenceNote}</Line>}
      {model.confirmRegen ? (
        /* כתיבה מחדש מוחקת את עריכת המורה: במקום שורת הפעולות — אישור במילים, שני כפתורים. ברירת המחדל (הראשון) היא להשאיר את העריכה */
        <div className="v2-noprint" role="group" aria-labelledby={confirmId} data-ai-confirm style={{ ...row, flexDirection: 'column', alignItems: 'stretch', gap: 8, border: `2px solid ${T.controlBorder}`, borderRadius: 12, padding: '10px 14px' }}>
          <p id={confirmId} style={{ ...soft, fontWeight: 800, color: T.text }}>{AI_SUMMARY_HARDENING_TEXT.confirmRegenerate.title}</p>
          <Line icon="alert" accent={T.warn}>{AI_SUMMARY_HARDENING_TEXT.confirmRegenerate.body}</Line>
          <div style={row}>
            <Button kind="primary" onClick={actions.cancelRegenerate} disabled={busy}>{AI_SUMMARY_HARDENING_TEXT.confirmRegenerate.cancel}</Button>
            <Button onClick={actions.confirmRegenerate} disabled={busy}>{AI_SUMMARY_HARDENING_TEXT.confirmRegenerate.confirm}</Button>
          </div>
        </div>
      ) : (
        <div className="v2-noprint" style={row} data-ai-actions>
          {model.canEdit && <Button onClick={actions.editStart} disabled={busy}>{T_UI.edit}</Button>}
          <Button kind={keepNote ? 'primary' : 'secondary'} onClick={() => exportSummaryToWord(doc)}>{T_UI.exportWord}</Button>
          <Button kind={keepNote ? 'primary' : 'secondary'} onClick={() => printSummary(doc)}>{T_UI.print}</Button>
          {model.canRegenerate && <Button onClick={actions.regenerate} disabled={busy}>{T_UI.regenerate}</Button>}
          {model.canRetryAi && <Button kind="primary" onClick={actions.regenerate} disabled={busy}>{T_UI.retryAi}</Button>}
        </div>
      )}
      <HowWeCalc label={AI_SUMMARY_TEXT.howWrittenTitle} lines={s.howWritten} />
    </>
  )
}

/* ── לפני שנכתב סיכום ── */
function NoneBody({ model, actions, compact, disabledReason }: { model: PanelModel; actions: AiSummaryActions; compact: boolean; disabledReason: string | null }) {
  const blocked = disabledReason !== null
  return (
    <>
      <p style={soft}>{aiSummaryGenerateHint(model.scope)}</p>
      {model.writing && <p role="status" style={{ ...soft, fontWeight: 700, color: T.text }}>{T_UI.writing}</p>}
      {model.error && <Line icon="alert" role="alert" accent={T.bad}>{model.error.message}</Line>}
      {blocked && <p style={soft}>{disabledReason}</p>}
      {/* בכרטיס המוטמע הכפתור יושב בשורת הכותרת */}
      {!compact && (
        <div className="v2-noprint" style={row}>
          <Button kind="primary" onClick={() => actions.write(false)} disabled={model.writing || blocked}>{T_UI.generate}</Button>
        </div>
      )}
    </>
  )
}

/* אין מספיק נתונים: מה קורה (כותרת), והכפתור המושבת עם הסיבה כתובה לידו (מה יקרה) */
function IneligibleBody({ model, compact }: { model: PanelModel; compact: boolean }) {
  const e = model.eligibility && !model.eligibility.ok ? model.eligibility : null
  if (!e) return null
  if (compact) return <p style={{ ...soft, color: T.text }}><strong>{e.text}</strong> {e.whatNext}</p>
  return (
    <>
      <EmptyState title={e.text} />
      <div className="v2-noprint" style={row}>
        <Button kind="primary" disabled>{T_UI.generate}</Button>
        <p style={{ ...soft, flex: '1 1 260px' }}>{e.whatNext}</p>
      </div>
    </>
  )
}

export interface AiSummaryViewProps {
  model: PanelModel
  actions: AiSummaryActions
  /** שם התלמיד/ה, הכיתה או ההדמיה — לכותרת מסמך הייצוא (מהמסך, לא מה-AI) */
  exportName: string
  /** כרטיס מוטמע במסך צפוף: שורת כותרת אחת עם הכפתור, והטקסט נפתח ונסגר */
  compact?: boolean
  /** שכבת-על שיש לה כותרת משלה: בלי כותרת בתוך הפאנל */
  showHeading?: boolean
  /** סיבה חיצונית לכך שאי אפשר לכתוב כרגע — הכפתור מושבת והסיבה כתובה */
  disabledReason?: string | null
  /** הערה קבועה מעל הטקסט (למשל מורה מקצועי) */
  note?: string | null
  /** כרטיס מוטמע: פתוח מההתחלה (ברירת מחדל: נפתח אחרי שנכתב סיכום בסשן הזה) */
  defaultOpen?: boolean
  /** בלי מסגרת ורקע: הפאנל יושב בתוך מסמך שהוא עצמו הכרטיס (שכבת-על) */
  plain?: boolean
}

export function AiSummaryView({ model, actions, exportName, compact = false, showHeading = true, disabledReason = null, note = null, defaultOpen, plain = false }: AiSummaryViewProps) {
  const bodyId = useId()
  const [override, setOverride] = useState<boolean | null>(null)
  const title = AI_SUMMARY_TEXT.headingByScope[model.scope]
  const Heading = compact ? 'h3' : 'h2'
  /* כרטיס מוטמע עם סיכום: סגור עד שהמורה פותחת/פותח, פרט למצב עריכה/כתיבה ולסיכום שנכתב עכשיו */
  const open = !compact || model.editing || model.writing || (override ?? defaultOpen ?? model.wrote)
  const showBody = model.phase !== 'ready' || open

  /* בכרטיס המוטמע הפעולה הראשית יושבת בשורת הכותרת */
  let headAction: ReactNode = null
  if (compact) {
    if (model.phase === 'none') headAction = <Button kind="primary" onClick={() => actions.write(false)} disabled={model.writing || disabledReason !== null}>{T_UI.generate}</Button>
    else if (model.phase === 'ineligible') headAction = <Button kind="primary" disabled>{T_UI.generate}</Button>
    else if (model.phase === 'ready' && !model.editing) headAction = <Button expanded={open} controls={open ? bodyId : undefined} onClick={() => setOverride(!open)}>{open ? T_PANEL.hide : T_PANEL.read}</Button>
    else if (model.phase === 'loadError' && isRetryable(model.error?.status ?? 0)) headAction = <Button onClick={actions.reload}>{T_PANEL.retry}</Button>
  }

  /* גם כשהטקסט סגור רואים מי כתב אותו (אייקון + מילים) — בשורת הכותרת; כשהוא פתוח היא מתחת לטקסט, ולא חוזרת פעמיים */
  const headAuthor: ReactNode = compact && model.phase === 'ready' && !model.editing && !open && model.summary
    ? <span style={row}><AuthorLabel s={model.summary} demo={model.demo} />{model.summary.edited && <EditedBadge />}</span>
    : null

  /* פתיחת הטקסט (לחיצה על "קריאת הסיכום" או סיכום שנכתב עכשיו): הכרטיס עולה לראש האזור הגולל, כדי שהטקסט יתחיל מול העיניים */
  const sectionRef = useRef<HTMLElement>(null)
  const textShown = compact && model.phase === 'ready' && open
  const wasShown = useRef(textShown)
  useEffect(() => {
    if (textShown && !wasShown.current && sectionRef.current) scrollCardToTop(sectionRef.current)
    wasShown.current = textShown
  }, [textShown])

  let body: ReactNode = null
  if (model.phase === 'loading') body = <p role="status" style={soft}>{T_PANEL.loading}</p>
  else if (model.phase === 'loadError') {
    body = (
      <>
        <Line icon="alert" role="alert" accent={T.bad}>{model.error?.message}</Line>
        {!compact && isRetryable(model.error?.status ?? 0) && <div className="v2-noprint" style={row}><Button onClick={actions.reload}>{T_PANEL.retry}</Button></div>}
      </>
    )
  } else if (model.phase === 'ineligible') body = <IneligibleBody model={model} compact={compact} />
  else if (model.phase === 'none') body = <NoneBody model={model} actions={actions} compact={compact} disabledReason={disabledReason} />
  else if (showBody) {
    body = (
      <>
        {note && <Line icon="info">{note}</Line>}
        <ReadyBody model={model} actions={actions} exportName={exportName} showAuthor={!headAuthor} />
      </>
    )
  }

  const state = model.phase === 'ready' ? (model.editing ? 'editing' : 'ready') : model.writing ? 'writing' : model.phase
  return (
    <section ref={sectionRef} data-ai-summary data-ai-state={state} aria-label={title} aria-busy={model.writing || model.saving || undefined} style={plain ? plainCard : compact ? compactCard : card}>
      {(showHeading || compact) && (
        <div style={{ ...row, justifyContent: 'space-between' }}>
          <Heading style={{ ...headingStyle, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: T.accent, display: 'inline-flex' }}><SparkMark size={20} /></span>
            {title}
          </Heading>
          {headAuthor}
          {headAction}
        </div>
      )}
      {body !== null && <div id={bodyId} style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>{body}</div>}
    </section>
  )
}

export interface AiSummaryPanelProps {
  target: SummaryTarget
  /** lens/subject של מורה אורח (query). מורה אמיתי: ריק */
  params?: SummaryParams
  exportName: string
  compact?: boolean
  showHeading?: boolean
  disabledReason?: string | null
  note?: string | null
  defaultOpen?: boolean
  plain?: boolean
}

const NO_PARAMS: SummaryParams = {}

export default function AiSummaryPanel({ target, params = NO_PARAMS, exportName, compact, showHeading, disabledReason, note, defaultOpen, plain }: AiSummaryPanelProps) {
  const { model, actions } = useAiSummary(target, params)
  return <AiSummaryView model={model} actions={actions} exportName={exportName} compact={compact} showHeading={showHeading} disabledReason={disabledReason} note={note} defaultOpen={defaultOpen} plain={plain} />
}
