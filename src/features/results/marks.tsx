/* סימונים קטנים לתוצאות: אייקון + מילה, תמיד יחד (עיקרון 7 — צבע לעולם לא נושא משמעות לבד).
   האייקונים הבסיסיים (וי, עיגול, התראה) מגיעים מערכת הממשק; כאן רק מה שהערכה עוד לא כוללת (איקס, שעון, דגל). */
import type { ReactElement } from 'react'
import type { Outcome } from '../../shared/types/resultsV1'
import { Icon, T } from '../teacherUi'

const EXTRA = {
  cross: <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>,
  flag: <><path d="M6 21V4" /><path d="M6 4h11l-2.5 4 2.5 4H6" /></>,
} satisfies Record<string, ReactElement>

export function ExtraIcon({ name, size = 18 }: { name: keyof typeof EXTRA; size?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, display: 'block' }}>
      {EXTRA[name]}
    </svg>
  )
}

/* תוצאת אתגר אצל תלמיד/ה: מילה פשוטה + אייקון. עובדות בלבד — בלי פרשנות. */
const OUTCOME_META: Record<Outcome, { word: string; color: string; render: (size?: number) => ReactElement }> = {
  correct: { word: 'הצליח/ה', color: T.good, render: (s = 18) => <Icon name="check" size={s} strokeWidth={2.6} /> },
  wrong: { word: 'לא הצליח/ה', color: T.bad, render: (s = 18) => <ExtraIcon name="cross" size={s} /> },
  gave_up: { word: 'ויתר/ה', color: T.warn, render: (s = 18) => <ExtraIcon name="flag" size={s} /> },
  timeout: { word: 'נגמר הזמן', color: T.warn, render: (s = 18) => <ExtraIcon name="clock" size={s} /> },
  closed: { word: 'סגר/ה בלי לסיים', color: T.warn, render: (s = 18) => <ExtraIcon name="cross" size={s} /> },
  not_reached: { word: 'עוד לא הגיע/ה לאתגר', color: T.muted, render: (s = 18) => <Icon name="circle" size={s} /> },
}

export function OutcomeTag({ outcome }: { outcome: Outcome }) {
  const m = OUTCOME_META[outcome]
  return (
    <span data-outcome={outcome} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 12px 3px 10px', borderRadius: 20, border: `1.5px solid ${m.color}`, fontSize: 15, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', lineHeight: 1.4 }}>
      <span style={{ color: m.color, display: 'inline-flex' }}>{m.render(18)}</span>
      {m.word}
    </span>
  )
}
