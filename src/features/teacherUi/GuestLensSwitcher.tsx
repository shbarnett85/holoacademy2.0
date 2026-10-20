/* ──────────────────────────────────────────────────────────────────────────
   בורר העדשה של מורה אורח: מחנך/ת | מורה מקצועי/ת | מנהל/ת (+ בחירת מקצוע למורה המקצועי/ת).
   משותף לכל מסכי המורה (אנליטיקה, תוצאות): נטען לחריץ lensSwitcher של ScreenShell.
     <ScreenShell … lensSwitcher={<GuestLensSwitcher />}>           ← מצב לא-מבוקר: קורא וכותב את המאגר המשותף (guestLens.ts)
     <GuestLensSwitcher value={{ lens, subject }} onChange={…} />   ← מבוקר: המסך מחזיק את הערך (למשל מהכתובת)
   · מוצג רק למורה אורח (אצל מורה אחר הרכיב לא מציג דבר). force=true — כשהמסך כבר יודע שהצופה אורח (למשל לפי התצורה מהשרת).
   · כל בחירה נכתבת למאגר (holo_guest_lens) לפני ש-onChange נקרא, כך שהעדשה שורדת מעבר בין הטאבים הראשיים.
   · רשימת המקצועות: מ-GET /api/analytics-v2/config?lens=subject_teacher (נטען פעם אחת, נשמר בזיכרון). אם הקריאה נכשלת —
     נשארים כפתורי התפקיד, ובורר המקצוע יופיע רק כשיש רשימה; אין הודעת שגיאה (התצוגה עצמה לא תלויה בו).
   · שורה אחת בלבד (גובה 48px): משפט הסבר קצר, המתג הצפוף, ובורר המקצוע באותה שורה. הנבחר מסומן בוי + מילה (לא בצבע בלבד).
   ────────────────────────────────────────────────────────────────────────── */
import { useEffect, useState } from 'react'
import { useStaffAuth } from '../../shared/hooks/useStaffAuth'
import { apiJson } from '../../shared/lib/api'
import type { AnalyticsConfig, Envelope } from '../../shared/types/analyticsV2'
import { GUEST_LENSES, GUEST_LENS_TEXT, useGuestLens, writeGuestLens } from './guestLens'
import type { GuestLens, GuestLensState } from './guestLens'
import { Icon } from './icons'
import ModeToggle from './ModeToggle'
import { FONT, MIN_TARGET, RADIUS, T } from './tokens'

export interface LensSubjectOption { code: string; nameHe: string }

export interface GuestLensSwitcherProps {
  /** מצב מבוקר: הערך הנוכחי כפי שהמסך מחזיק אותו. בלעדיו — הערך השמור במאגר (ברירת מחדל: מחנך/ת) */
  value?: GuestLensState
  /** נקרא אחרי כל בחירה של תפקיד/מקצוע (המאגר כבר עודכן). שם המסך מחליט מה לעשות: לנווט, לטעון מחדש וכו' */
  onChange?: (next: GuestLensState) => void
  /** אילו תפקידים להציע (ברירת מחדל: שלושתם) */
  lenses?: readonly GuestLens[]
  /** רשימת המקצועות למורה המקצועי/ת. בלעדיה — נטענת מהשרת */
  subjects?: readonly LensSubjectOption[]
  /** להציג גם כשה-session אינו מסומן כאורח (המסך כבר יודע שהצופה אורח, למשל לפי התצורה מהשרת) */
  force?: boolean
}

const DEFAULT_STATE: GuestLensState = { lens: 'homeroom', subject: null }

/* רשימת המקצועות של בורר המורה המקצועי — נטענת פעם אחת לכל הדף (כל מסך מרכיב את הרכיב מחדש) */
let subjectsCache: LensSubjectOption[] | null = null
let subjectsInflight: Promise<LensSubjectOption[]> | null = null

function loadSubjects(): Promise<LensSubjectOption[]> {
  if (subjectsCache) return Promise.resolve(subjectsCache)
  if (!subjectsInflight) {
    subjectsInflight = apiJson<Envelope<AnalyticsConfig>>('/api/analytics-v2/config?lens=subject_teacher')
      .then((env) => {
        const list = (env.data?.subjects ?? []).map((s) => ({ code: s.code, nameHe: s.nameHe }))
        if (list.length > 0) subjectsCache = list
        return list
      })
      .finally(() => { subjectsInflight = null })
  }
  return subjectsInflight
}

function useLensSubjects(skip: boolean): readonly LensSubjectOption[] {
  const [list, setList] = useState<readonly LensSubjectOption[]>(subjectsCache ?? [])
  useEffect(() => {
    if (skip || subjectsCache) return
    let live = true
    loadSubjects().then((l) => { if (live) setList(l) }).catch(() => { /* ללא רשימה — נשארים כפתורי התפקיד בלבד */ })
    return () => { live = false }
  }, [skip])
  return skip ? [] : subjectsCache ?? list
}

export default function GuestLensSwitcher({ value, onChange, lenses = GUEST_LENSES, subjects, force }: GuestLensSwitcherProps) {
  const { isGuest } = useStaffAuth()
  const stored = useGuestLens()
  const fetched = useLensSubjects(!!subjects || (!isGuest && !force))
  if (!isGuest && !force) return null

  const options = subjects ?? fetched
  const current = value ?? stored ?? DEFAULT_STATE
  /* המקצוע האחרון שנבחר נשמר גם כשהעדשה אחרת, כדי שחזרה למורה מקצועי/ת תחזור לאותו מקצוע */
  const lastSubject = current.subject ?? stored?.subject ?? null
  const subjectValue = options.some((s) => s.code === lastSubject) ? lastSubject : options[0]?.code ?? null

  function pick(lens: GuestLens, subject: string | null): void {
    const next: GuestLensState = { lens, subject }
    writeGuestLens(next)
    onChange?.(next)
  }

  return (
    <div data-lens-switcher style={{ display: 'flex', alignItems: 'center', gap: '4px 14px', flexWrap: 'wrap' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: FONT, fontSize: 16, fontWeight: 600, color: T.textSoft, whiteSpace: 'nowrap' }}>
        <span style={{ color: T.accent, display: 'inline-flex' }}><Icon name="info" size={18} /></span>
        {GUEST_LENS_TEXT.sentence}
      </span>
      <ModeToggle compact ariaLabel={GUEST_LENS_TEXT.groupLabel} value={current.lens}
        onChange={(id) => { if (id !== current.lens) pick(id as GuestLens, id === 'subject_teacher' ? subjectValue : lastSubject) }}
        options={lenses.map((l) => ({ id: l, label: GUEST_LENS_TEXT.names[l] }))} />
      {current.lens === 'subject_teacher' && options.length > 0 && (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: FONT, fontSize: 16, fontWeight: 700, color: T.text }}>
          {GUEST_LENS_TEXT.subject}:
          <select value={subjectValue ?? ''} onChange={(e) => pick('subject_teacher', e.target.value)}
            style={{ minHeight: MIN_TARGET, padding: '0 10px', borderRadius: RADIUS.md, border: `2px solid ${T.controlBorder}`, background: T.surface, color: T.text, fontFamily: FONT, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
            {options.map((s) => <option key={s.code} value={s.code}>{s.nameHe}</option>)}
          </select>
        </label>
      )}
    </div>
  )
}
