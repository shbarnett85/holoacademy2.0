/* ד"ר הולו (הדמות החדשה, 2026-11): חצי גוף, כבר בגוון הולוגרפי. כל אנימציה היא MP4 על רקע שחור (השקיפות של המקור נצרבה על שחור,
   כי הדמות ממוזגת ב-screen והשחור הוא "אין אור"; כך גם דפדפן בלי וידאו שקוף מציג אותה נכון) + פריים ראשון כתמונה קבועה באותו שם.
   נטענים רק במסכי הפתיחה והסיכום. מקור: public/dr-holo/v2/<name>.{mp4,webp} */
import type { HoloMood } from './gameFeel/engine'
import { feelLevel, prefersReducedMotion } from './gameFeel/engine'

/* וידאו שלא התחיל לנגן אחרי הזמן הזה: נשארים עם התמונה */
export const HOLO_CLIP_START_TIMEOUT_MS = 5000

/* יחס הרוחב לגובה של הנכסים (896×706) */
export const HOLO_ASPECT = 896 / 706

/* האנימציות הקיימות (קובץ MP4 ותמונה קבועה לכל אחת):
   · welcome — ברוכים הבאים: ידיים פתוחות ודיבור (ברירת המחדל)
   · worried — מודאג: למצב "מפוחד", וגם ל"כועס" (מדריך מודאג, לא כועס)
   · idle    — עמידה מחויכת עם מעט תנועה (חיוך בפה סגור, אצבעות צמודות, נשימה ומצמוץ): כשד"ר הולו ממתין ולא מדבר.
               לא קשורה למצב רוח: המסך מבקש אותה במפורש (עמוד הפתיחה והבית של התלמיד, PortalHero) */
export type HoloAnimation = 'welcome' | 'worried' | 'idle'

/* איזו אנימציה לכל מצב רוח. מצב רוח בלי אנימציה משלו משתמש ב"ברוכים הבאים". אנימציה חדשה למצב רוח = שורה כאן */
const ANIMATION_OF: Partial<Record<HoloMood, HoloAnimation>> = { scared: 'worried', angry: 'worried' }
/* animation: אנימציה שהמסך ביקש במפורש; גוברת על מצב הרוח */
const animationOf = (mood: HoloMood, animation?: HoloAnimation): HoloAnimation => animation ?? ANIMATION_OF[mood] ?? 'welcome'

export function holoClipFor(mood: HoloMood, animation?: HoloAnimation): string {
  return `/dr-holo/v2/${animationOf(mood, animation)}.mp4`
}

export function holoStillFor(mood: HoloMood, animation?: HoloAnimation): string {
  return `/dr-holo/v2/${animationOf(mood, animation)}.webp`
}

/* מסך הסיכום מתחיל להיטען כשמתחיל האתגר האחרון, כדי שיהיה מוכן כשהוא מופיע: הרקעים של שני מצבי הסיפור (תמונה, וידאו כשמותר לזוז)
   ונכסי ד"ר הולו של שני המצבים */
export function preloadSummary(moods: readonly HoloMood[], stages: readonly { src: string; video?: string }[]): void {
  if (typeof document === 'undefined') return
  for (const m of moods) new Image().src = holoStillFor(m)
  for (const st of stages) new Image().src = st.src
  if (prefersReducedMotion() || feelLevel() === 'gentle') return
  const videos = [...stages.flatMap((st) => (st.video ? [st.video] : [])), ...moods.map((m) => holoClipFor(m))]
  for (const src of new Set(videos)) {
    if (document.querySelector(`video[data-holo-preload="${src}"]`)) continue
    const el = document.createElement('video')
    el.dataset.holoPreload = src
    el.muted = true
    el.preload = 'auto'
    el.src = src
    el.hidden = true
    document.body.appendChild(el)
  }
}
