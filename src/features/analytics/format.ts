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
  excelled: { icon: '⭐', label: 'הצטיין', color: '#5fffb0' },
  struggling: { icon: '🔴', label: 'מתקשה', color: '#ff7099' },
  skip_suspect: { icon: '⚡', label: 'חשד לדילוג', color: '#ffce5e' },
  slow: { icon: '🐢', label: 'איטי מאוד', color: '#8aa0ff' },
}

export const STATUS_META: Record<string, { label: string; color: string }> = {
  completed: { label: 'סיים', color: '#5fffb0' },
  in_progress: { label: 'באמצע', color: '#ffce5e' },
  not_started: { label: 'לא התחיל', color: 'rgba(200,200,220,0.5)' },
}
