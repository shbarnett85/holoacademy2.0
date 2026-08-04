/* עזרי פורמט משותפים לדשבורד האנליטיקה */

export function pct(r: number | null | undefined): string {
  if (r === null || r === undefined) return '—'
  return Math.round(r * 100) + '%'
}

export function duration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  const totalSec = Math.round(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  if (m === 0) return `${s}ש׳`
  return `${m}ד׳ ${s}ש׳`
}

/* דגלי תלמיד → אמוג׳י + תווית + צבע */
export const FLAG_META: Record<string, { icon: string; label: string; color: string }> = {
  excelled: { icon: '⭐', label: 'הצטיין', color: 'var(--t3)' },
  struggling: { icon: '🔴', label: 'מתקשה', color: 'var(--t5)' },
  skip_suspect: { icon: '⚡', label: 'חשד לדילוג', color: 'var(--t4)' },
  slow: { icon: '🐢', label: 'איטי מאוד', color: 'var(--t79)' },
}

export const STATUS_META: Record<string, { label: string; color: string }> = {
  completed: { label: 'סיים', color: 'var(--t3)' },
  in_progress: { label: 'באמצע', color: 'var(--t4)' },
  not_started: { label: 'לא התחיל', color: 'var(--t80)' },
}
