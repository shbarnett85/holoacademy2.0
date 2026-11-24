/* הסימון שעל הפורטל: שכבת טקסט הולוגרפית שמוקרנת על התמונה שבפורטל, בלי תיבה ובלי רקע לבן.
   האותיות עשויות אור (קווי סריקה בתוך האות, הילה בצבע המצב, שני עותקים צבעוניים שזזים פיקסל לכל צד, כמו בדמות של ד"ר הולו),
   ופס אור אחד שיורד לאט לאורך הטקסט. מאחורי הטקסט הצללה רכה, כדי שייקרא גם על תמונה בהירה.
   הצבע אף פעם לא לבד: לכל מצב סמל ומילה. בעמוד הפתיחה אותה שכבה היא ההזמנה "נסו עכשיו" (במקום כפתור, לבקשת המשתמש). הגודל ב-em, והמקום והגודל נקבעים מבחוץ (PortalHero, בקואורדינטות של תמונת הספרייה).
   כשהטקסט מתחלף (שיעור אחר בפורטל) הוא "נדלק" מחדש. בתנועה מופחתת: בלי תנועה (הכלל הגלובלי ב-index.css). */
import type { CSSProperties } from 'react'

export type CaptionTone = 'done' | 'paused' | 'notDone' | 'play'
export interface PortalCaptionData {
  tone: CaptionTone
  title: string
  /* שורה שנייה, קטנה: העמוד שבו הקריאה נעצרה, הגבישים שנאספו, "באיחור" */
  sub?: string
}

/* ליבת האות (כמעט לבן, בגוון המצב) וצבע ההילה */
const TONE: Record<CaptionTone, { core: string; glow: string }> = {
  done: { core: '222 255 236', glow: '56 226 142' },
  paused: { core: '255 242 220', glow: '255 160 52' },
  notDone: { core: '230 249 255', glow: '99 207 255' },
  /* עמוד הפתיחה: ההזמנה להיכנס לשיעור שבפורטל ("נסו עכשיו") */
  play: { core: '230 249 255', glow: '99 207 255' },
}

const CSS = `
.pcap { position: relative; display: flex; flex-direction: column; align-items: center; gap: .16em; white-space: nowrap; direction: rtl; font-family: var(--font-display); line-height: 1.12; animation: pcap-in .34s cubic-bezier(.2, 1.2, .4, 1) both; }
.pcap::before { content: ''; position: absolute; z-index: -1; inset: -1em -2.4em; border-radius: 50%; background: radial-gradient(ellipse closest-side, rgb(3 14 36 / .66), rgb(3 14 36 / .4) 55%, rgb(3 14 36 / 0)); }
.pcap__main { display: inline-flex; align-items: center; gap: .32em; font-weight: 900; letter-spacing: .02em; }
.pcap__icon { width: 1em; height: 1em; flex-shrink: 0; overflow: visible; filter: drop-shadow(0 0 1.5px rgb(2 12 32 / .95)) drop-shadow(0 0 .26em rgb(var(--pc-glow) / .95)); }
.pcap__icon * { fill: none; stroke: rgb(var(--pc-core)); stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
.pcap__word { position: relative; display: inline-block; }
.pcap__ghost { position: absolute; inset: 0; opacity: .55; }
.pcap__ghost--a { color: rgb(60 240 255); transform: translateX(-1.5px); }
.pcap__ghost--b { color: rgb(255 70 210); transform: translateX(1.5px); }
.pcap__text {
  position: relative; color: transparent; -webkit-background-clip: text; background-clip: text;
  background-image: linear-gradient(to bottom, rgb(255 255 255 / 0), rgb(255 255 255 / .95) 50%, rgb(255 255 255 / 0)), repeating-linear-gradient(to bottom, rgb(var(--pc-core)) 0 2px, rgb(var(--pc-core) / .58) 2px 3px);
  background-size: 100% 45%, auto; background-repeat: no-repeat, repeat; background-position: 0 -80%, 0 0;
  filter: drop-shadow(0 0 1.5px rgb(2 12 32 / .95)) drop-shadow(0 0 .24em rgb(var(--pc-glow) / .95)) drop-shadow(0 0 .7em rgb(var(--pc-glow) / .6));
  animation: pcap-sweep 5.6s linear 1s infinite;
}
.pcap__rule { width: calc(100% + 1.2em); height: 2px; border-radius: 2px; background: linear-gradient(to right, rgb(var(--pc-glow) / 0), rgb(var(--pc-core)) 22% 78%, rgb(var(--pc-glow) / 0)); box-shadow: 0 0 .3em rgb(var(--pc-glow) / .9); }
.pcap__sub { font-size: .54em; font-weight: 700; letter-spacing: .06em; color: rgb(var(--pc-core)); filter: drop-shadow(0 0 1.5px rgb(2 12 32 / .95)) drop-shadow(0 0 .3em rgb(var(--pc-glow) / .9)); }
@keyframes pcap-in { from { opacity: 0; transform: scaleY(.15); filter: brightness(2.4); } 55% { opacity: 1; transform: scaleY(1.14); } to { opacity: 1; transform: none; filter: none; } }
@keyframes pcap-sweep { 0% { background-position: 0 -80%, 0 0; } 38%, 100% { background-position: 0 180%, 0 0; } }
`

function Icon({ tone }: { tone: CaptionTone }) {
  return (
    <svg className="pcap__icon" viewBox="0 0 24 24" aria-hidden="true">
      {tone === 'notDone' ? <circle cx="12" cy="12" r="10" strokeDasharray="3.6 3.4" /> : <circle cx="12" cy="12" r="10" />}
      {tone === 'done' && <path d="M7 12.4l3.4 3.4L17.2 9" />}
      {tone === 'paused' && <path d="M9.4 7.8v8.4M14.6 7.8v8.4" />}
      {tone === 'play' && <path d="M9.8 7.6v8.8l7-4.4z" />}
    </svg>
  )
}

export default function PortalCaption({ tone, title, sub }: PortalCaptionData) {
  const t = TONE[tone]
  return (
    <div className="pcap" style={{ '--pc-core': t.core, '--pc-glow': t.glow } as CSSProperties}>
      <style>{CSS}</style>
      <div className="pcap__main">
        <Icon tone={tone} />
        <span className="pcap__word">
          <span className="pcap__ghost pcap__ghost--a" aria-hidden="true">{title}</span>
          <span className="pcap__ghost pcap__ghost--b" aria-hidden="true">{title}</span>
          <span className="pcap__text">{title}</span>
        </span>
      </div>
      <span className="pcap__rule" aria-hidden="true" />
      {sub && <span className="pcap__sub">{sub}</span>}
    </div>
  )
}
