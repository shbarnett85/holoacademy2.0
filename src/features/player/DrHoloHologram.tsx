/* ד"ר הולו הוא עותק וירטואלי, ולכן הוא תמיד הולוגרמה: גוון ציאן שקוף למחצה עם זוהר, קווי סריקה אופקיים עדינים,
   הבהוב קצר ונדיר (לא יותר מפעם בכמה שניות) ואלומת אור ממקרן קטן מתחת לדמות.
   האפקט כולו בקוד (CSS) על תמונות קבועות של הדמות, ולכן הוא אחיד בכל סגנונות האמנות.
   · הבעות: רגיל, שמח, חושב, מופתע (public/dr-holo/*.webp). תמונה שלא נטענה — סמל קווי של הדמות באותו אפקט.
   · בשלב קריאת טקסט ההבהוב עוצר ("בזמן קריאת טקסט שום דבר לא זז").
   · כניסה בתחילת שיעור: נבנית מקווי סריקה. בעוצמה עדינה ובתנועה מופחתת — פשוט מופיעה. */
import { useState } from 'react'
import DrHoloEmblem from '../../shared/ui/DrHoloEmblem'
import { useGameFeel, type HoloMood } from './gameFeel/engine'

const SRC: Record<HoloMood, string> = {
  neutral: '/dr-holo/neutral.webp',
  happy: '/dr-holo/happy.webp',
  thinking: '/dr-holo/thinking.webp',
  surprised: '/dr-holo/surprised.webp',
}

const CSS = `
.dr-holo { position: relative; display: block; width: var(--dr-holo-size, 7rem); aspect-ratio: 4 / 5; pointer-events: none; }
.dr-holo__figure { position: absolute; inset: 0 0 12% 0; overflow: hidden;
  -webkit-mask-image: linear-gradient(180deg, #000 76%, transparent 100%);
          mask-image: linear-gradient(180deg, #000 76%, transparent 100%); }
.dr-holo__figure img, .dr-holo__figure svg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center top; }
.dr-holo__figure img { opacity: .9;
  filter: grayscale(.55) sepia(1) hue-rotate(148deg) saturate(2.6) brightness(1.08) contrast(1.05) drop-shadow(0 0 6px rgba(47,243,255,.65));
  /* קווי הסריקה הם מסכה על הדמות עצמה, ולכן הם לא מציירים מלבן סביבה */
  -webkit-mask-image: repeating-linear-gradient(0deg, #000 0 3px, rgba(0,0,0,.62) 3px 4px);
          mask-image: repeating-linear-gradient(0deg, #000 0 3px, rgba(0,0,0,.62) 3px 4px); }
.dr-holo__beam { position: absolute; left: 12%; right: 12%; bottom: 4%; height: 62%;
  background: linear-gradient(0deg, rgba(47,243,255,.34), rgba(47,243,255,0) 92%);
  clip-path: polygon(38% 100%, 62% 100%, 100% 0, 0 0); }
.dr-holo__base { position: absolute; left: 30%; right: 30%; bottom: 0; height: 8%; border-radius: 50%;
  background: radial-gradient(ellipse at center, #BFF9FF 0%, #2FF3FF 42%, rgba(47,243,255,.1) 72%, transparent 100%); box-shadow: 0 0 10px rgba(47,243,255,.7); }
.dr-holo--live .dr-holo__figure { animation: dr-holo-flicker 7s steps(1, end) infinite; }
@keyframes dr-holo-flicker { 0%, 96.4%, 100% { opacity: 1 } 96.5%, 97.6% { opacity: .55 } 97.7%, 98.6% { opacity: .9 } }
.dr-holo--build .dr-holo__figure { animation: dr-holo-build .9s ease-out both; }
@keyframes dr-holo-build {
  from { clip-path: inset(100% 0 0 0); filter: brightness(2.2); }
  to { clip-path: inset(0 0 0 0); filter: brightness(1); }
}
@media (prefers-reduced-motion: reduce) {
  .dr-holo--live .dr-holo__figure, .dr-holo--build .dr-holo__figure { animation: none; }
}
`

export default function DrHoloHologram({ mood, build = false, size, className = '' }: { mood?: HoloMood; build?: boolean; size?: string; className?: string }) {
  const feel = useGameFeel()
  const current = mood ?? feel.mood
  /* תמונה שלא נטענה (למשל נכס חסר): סמל קווי באותו אפקט — הדמות לעולם לא נעלמת */
  const [failed, setFailed] = useState(false)
  const animateBuild = build && feel.level !== 'gentle' && !feel.reduced
  const live = !feel.reading && !feel.reduced && !animateBuild
  return (
    <span
      className={`dr-holo ${animateBuild ? 'dr-holo--build' : ''} ${live ? 'dr-holo--live' : ''} ${className}`}
      data-dr-holo={current}
      style={size ? ({ ['--dr-holo-size' as string]: size }) : undefined}
      aria-hidden="true"
    >
      <style>{CSS}</style>
      <span className="dr-holo__beam" />
      <span className="dr-holo__figure">
        {failed
          ? <DrHoloEmblem size={96} />
          : <img src={SRC[current]} alt="" draggable={false} onError={() => setFailed(true)} />}
      </span>
      <span className="dr-holo__base" />
    </span>
  )
}
