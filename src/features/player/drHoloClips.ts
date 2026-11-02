/* קטעי הווידאו של ד"ר הולו (server/src/scripts/genDrHoloClip.ts): MP4 על רקע שחור, בלולאה, קטע אחד לכל מצב רוח. נטענים רק במסכי הפתיחה והסיכום. */
import type { HoloMood } from './gameFeel/engine'
import { feelLevel, prefersReducedMotion } from './gameFeel/engine'

/* וידאו שלא התחיל לנגן אחרי הזמן הזה: נשארים עם התמונה */
export const HOLO_CLIP_START_TIMEOUT_MS = 5000

export function holoClipFor(mood: HoloMood): string {
  return `/dr-holo/${mood}.mp4`
}

/* הקטעים של מסך הסיכום מתחילים להיטען כשמתחיל האתגר האחרון, כדי שיהיו מוכנים כשהוא מופיע */
export function preloadSummaryClips(moods: readonly HoloMood[]): void {
  if (typeof document === 'undefined' || prefersReducedMotion() || feelLevel() === 'gentle') return
  for (const src of moods.map(holoClipFor)) {
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
