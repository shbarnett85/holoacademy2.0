/* עיצוב קבוע לכל מקצוע — צבע + אייקון, זהה בכל המערכת (עיקרון 11 בעקרונות הממשק למורה).
   הצבע הוא טוקן ערכה (var(--tN)) ולכן עובד במצב בהיר וכהה. צבע לעולם לא נושא משמעות לבד:
   תמיד מלווה באייקון ובשם המקצוע. מקצועות שונים עשויים לחלוק גוון; האייקון והשם מבדילים. */
import { subjectName, UNCLASSIFIED_LABEL } from './subjects'

export interface SubjectStyle { color: string; icon: string; label: string }

const STYLE: Record<string, { color: string; icon: string }> = {
  math: { color: 'var(--t15)', icon: '🔢' },
  hebrew: { color: 'var(--t34)', icon: '📖' },
  history: { color: 'var(--t4)', icon: '🏛️' },
  science: { color: 'var(--t3)', icon: '🔬' },
  english: { color: 'var(--t79)', icon: '🔤' },
  bible: { color: 'var(--t54)', icon: '📜' },
  geography: { color: 'var(--t66)', icon: '🗺️' },
  civics: { color: 'var(--t5)', icon: '⚖️' },
  literature: { color: 'var(--t34)', icon: '✍️' },
  art: { color: 'var(--t5)', icon: '🎨' },
  music: { color: 'var(--t54)', icon: '🎵' },
  pe: { color: 'var(--t3)', icon: '⚽' },
  arabic: { color: 'var(--t4)', icon: '🗣️' },
  french: { color: 'var(--t79)', icon: '🥖' },
  other: { color: 'var(--t6)', icon: '🧩' },
}
const UNCLASSIFIED = { color: 'var(--t6)', icon: '❔' }

/* code = null/לא מוכר → "לא סווג" */
export function subjectStyle(code: string | null | undefined): SubjectStyle {
  const s = code ? STYLE[code] : undefined
  if (!s) return { ...UNCLASSIFIED, label: UNCLASSIFIED_LABEL }
  return { ...s, label: subjectName(code) }
}
