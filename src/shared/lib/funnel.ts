/* beacon אנונימי למדידת המשפך הוויראלי — best-effort מוחלט: לעולם לא שובר UX,
   לא ממתין לתשובה, שורד ניווט (sendBeacon/keepalive). ללא זהות משתמש. */
export type FunnelEvent =
  | 'showcase_click'      // קליק על כרטיס במדף "התנסו עכשיו"
  | 'visitor_play_start'  // מבקר אנונימי התחיל לשחק
  | 'visitor_finish'      // מבקר הגיע למסך הסיום
  | 'cta_create'          // קליק על "צרו הדמיה משלכם"
  | 'cta_whatsapp'        // מבקר שיתף בוואטסאפ ממסך הסיום
  | 'teacher_whatsapp'    // מורה שיתף בוואטסאפ מהספרייה

export function trackFunnel(event: FunnelEvent, questId?: string): void {
  try {
    const payload = JSON.stringify({ event, questId })
    if (navigator.sendBeacon?.('/api/funnel', new Blob([payload], { type: 'application/json' }))) return
    void fetch('/api/funnel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {})
  } catch { /* אנליטיקה לא מפריעה למשחק */ }
}
