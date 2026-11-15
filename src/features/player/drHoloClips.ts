/* קטעי הווידאו של ד"ר הולו (server/src/scripts/genDrHoloClip.ts): MP4 על רקע שחור, בלולאה, קטע אחד לכל מצב רוח. נטענים רק במסכי הפתיחה והסיכום. */
import type { HoloMood } from './gameFeel/engine'
import { feelLevel, prefersReducedMotion } from './gameFeel/engine'

/* וידאו שלא התחיל לנגן אחרי הזמן הזה: נשארים עם התמונה */
export const HOLO_CLIP_START_TIMEOUT_MS = 5000

export function holoClipFor(mood: HoloMood): string {
  return `/dr-holo/${mood}.mp4`
}

/* מסך הסיכום מתחיל להיטען כשמתחיל האתגר האחרון, כדי שיהיה מוכן כשהוא מופיע: הרקעים של שני מצבי הסיפור (תמונה, ווידאו כשמותר לזוז)
   ותמונות ד"ר הולו. על רקע וידאו ד"ר הולו הוא תמונה קבועה, ולכן הקטעים שלו לא נטענים */
export function preloadSummary(moods: readonly HoloMood[], stages: readonly { src: string; video?: string }[]): void {
  if (typeof document === 'undefined') return
  for (const m of moods) new Image().src = `/dr-holo/${m}.webp`
  for (const st of stages) new Image().src = st.src
  if (prefersReducedMotion() || feelLevel() === 'gentle') return
  for (const src of stages.flatMap((st) => (st.video ? [st.video] : []))) {
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
