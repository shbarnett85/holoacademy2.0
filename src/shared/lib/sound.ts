import { useSyncExternalStore } from 'react'

/* ── מערכת סאונד מרכזית ל-HoloAcademy ─────────────────────────────────────────
   Web Audio API: כל ניגון = BufferSource חדש → סאונדים קצרים (click/good) נשמעים
   ברצף מהיר בלי לחתוך זה את זה. סאונדים ארוכים (win/fusion/portal/wormhole) — אם
   מופעלים שוב לפני שנגמרו, ה-source הקודם נעצר (איפוס). preload פעם אחת.
   Autoplay: ה-AudioContext נוצר suspended ומתעורר (resume) ב-user-gesture הראשון.
   mute/volume נשמרים ב-localStorage. כשל טעינה (404)/קובץ חסר → **fallback סינתטי**
   (osc/noise ב-Web Audio) כך ששום צליל לא "נעלם". 'hover' הוא סינתטי-בלבד (ללא קובץ).
   ─────────────────────────────────────────────────────────────────────────── */

export type SoundName = 'click' | 'good' | 'win' | 'error' | 'fusion' | 'portal' | 'wormhole' | 'type' | 'hover'

/* 'hover' ללא קובץ → תמיד סינתזה. Partial כי לא לכל שם יש קובץ. */
const FILES: Partial<Record<SoundName, string>> = {
  click: '/sounds/digital_click.wav',
  good: '/sounds/good.mp3',
  win: '/sounds/crystal_win.mp3',
  error: '/sounds/digital_error.mp3',
  fusion: '/sounds/3fusion.mp3',
  portal: '/sounds/portal_neon.wav',
  wormhole: '/sounds/wormhole.mp3',
  type: '/sounds/type.wav',
}

/* ארוכים — ניגון יחיד שמתאפס אם מופעל שוב לפני שנגמר */
const LONG = new Set<SoundName>(['win', 'fusion', 'portal', 'wormhole'])

const MUTED_KEY = 'holo_sound_muted'
const VOLUME_KEY = 'holo_sound_volume'

const isBrowser = typeof window !== 'undefined'

function loadMuted(): boolean {
  try { return localStorage.getItem(MUTED_KEY) === '1' } catch { return false }
}
function loadVolume(): number {
  try {
    const v = parseFloat(localStorage.getItem(VOLUME_KEY) ?? '')
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.7
  } catch { return 0.7 }
}

let muted = isBrowser ? loadMuted() : false
let volume = isBrowser ? loadVolume() : 0.7

let ctx: AudioContext | null = null
const buffers: Partial<Record<SoundName, AudioBuffer>> = {}
const activeLong: Partial<Record<SoundName, AudioBufferSourceNode>> = {}
let preloadStarted = false

/* מנוי לשינויי mute/volume (לכפתורי ה-UI) */
const listeners = new Set<() => void>()
function emit() { listeners.forEach((l) => l()) }

function getCtx(): AudioContext | null {
  if (!isBrowser) return null
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    try { ctx = new AC() } catch { return null }
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  return ctx
}

async function decodeOne(name: SoundName, ac: AudioContext) {
  const url = FILES[name]
  if (!url) return /* אין קובץ (למשל hover) → סינתזה בלבד */
  try {
    const res = await fetch(url)
    if (!res.ok) return /* 404 → יישאר ללא buffer → fallback סינתטי בזמן ניגון */
    const arr = await res.arrayBuffer()
    buffers[name] = await ac.decodeAudioData(arr)
  } catch { /* כשל → fallback סינתטי */ }
}

/* preload כל הקבצים פעם אחת */
export function initSound() {
  if (!isBrowser || preloadStarted) return
  preloadStarted = true
  const ac = getCtx()
  if (!ac) return
  ;(Object.keys(FILES) as SoundName[]).forEach((name) => { void decodeOne(name, ac) })
}

/* התעוררות ב-user-gesture ראשון (autoplay policy) — מאזין חד-פעמי */
let unlockBound = false
function bindUnlock() {
  if (!isBrowser || unlockBound) return
  unlockBound = true
  const unlock = () => {
    initSound()
    const ac = getCtx()
    if (ac && ac.state === 'suspended') void ac.resume().catch(() => {})
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
    window.removeEventListener('touchstart', unlock)
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
  window.addEventListener('touchstart', unlock)
}
if (isBrowser) bindUnlock()

/* ── fallback סינתטי ─────────────────────────────────────────────────────────
   מנגן קירוב מסונתז (oscillator/noise) כשאין buffer — קובץ חסר/נכשל, או 'hover'
   שאין לו קובץ. כך שום שם צליל לא "נעלם". עוצמה כפופה ל-volume הגלובלי. */
function synth(name: SoundName) {
  const ac = getCtx()
  if (!ac) return
  const t0 = ac.currentTime
  const out = ac.createGain()
  out.gain.value = volume
  out.connect(ac.destination)

  const beep = (freq: number, dur: number, type: OscillatorType, peak: number, slideTo?: number) => {
    const o = ac.createOscillator()
    const g = ac.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t0)
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.linearRampToValueAtTime(peak, t0 + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(g).connect(out)
    o.start(t0)
    o.stop(t0 + dur + 0.02)
  }
  const noise = (dur: number, peak: number) => {
    const b = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * dur)), ac.sampleRate)
    const d = b.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    const s = ac.createBufferSource()
    const g = ac.createGain()
    s.buffer = b
    g.gain.setValueAtTime(peak, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    s.connect(g).connect(out)
    s.start(t0)
  }

  switch (name) {
    case 'click': beep(420, 0.05, 'triangle', 0.32, 620); break
    case 'type': beep(680, 0.028, 'square', 0.16); break
    case 'hover': beep(880, 0.04, 'sine', 0.09, 1040); break
    case 'error': beep(300, 0.32, 'sawtooth', 0.38, 120); break
    case 'good': beep(660, 0.12, 'sine', 0.32, 880); break
    case 'win': beep(523, 0.14, 'triangle', 0.32); beep(784, 0.2, 'triangle', 0.28, 988); break
    case 'fusion': beep(300, 0.4, 'triangle', 0.3, 1200); noise(0.3, 0.12); break
    case 'portal': beep(180, 0.5, 'sine', 0.32, 900); noise(0.4, 0.14); break
    case 'wormhole': beep(120, 0.8, 'sine', 0.3, 600); noise(0.6, 0.18); break
    default: beep(440, 0.05, 'triangle', 0.28)
  }
}

export function playSound(name: SoundName) {
  if (!isBrowser || muted) return
  const ac = getCtx()
  if (!ac) return
  const buf = buffers[name]
  if (!buf) { synth(name); return } /* אין buffer (חסר/נכשל/hover) → fallback סינתטי מיידי */
  try {
    if (LONG.has(name)) {
      const prev = activeLong[name]
      if (prev) { try { prev.stop() } catch { /* כבר נעצר */ } }
    }
    const src = ac.createBufferSource()
    src.buffer = buf
    const gain = ac.createGain()
    gain.gain.value = volume
    src.connect(gain).connect(ac.destination)
    src.start(0)
    if (LONG.has(name)) {
      activeLong[name] = src
      src.onended = () => { if (activeLong[name] === src) delete activeLong[name] }
    }
  } catch { /* דילוג שקט */ }
}

const INTERACTIVE = 'button, [role="button"], a[href], summary, input[type="checkbox"], input[type="radio"]'

/* עוקף/משתיק פר-אלמנט: data-holo-silent (או אב עם התכונה) → ללא צליל;
   data-holo-sound="name" → מנגן שם צליל אחר במקום 'click'. */
function holoTarget(e: Event): { el: HTMLElement; sound: SoundName } | null {
  const src = e.target as HTMLElement | null
  const el = src?.closest?.(INTERACTIVE) as HTMLElement | null
  if (!el) return null
  if ((el as HTMLButtonElement).disabled) return null
  if (el.getAttribute('aria-disabled') === 'true') return null
  if (el.hasAttribute('data-holo-silent') || el.closest('[data-holo-silent]')) return null
  const custom = el.getAttribute('data-holo-sound')
  return { el, sound: (custom as SoundName) || 'click' }
}

/* צליל קליק + hover גלובלי — מאזינים יחידים (capture) בכל האפליקציה (מורה/תלמיד/משחק).
   pointerdown → click (או data-holo-sound); כניסת עכבר לכפתור חדש → hover. מותקן פעם אחת. */
let clickBound = false
export function installGlobalClickSound() {
  if (!isBrowser || clickBound) return
  clickBound = true

  document.addEventListener('pointerdown', (e) => {
    const hit = holoTarget(e)
    if (hit) playSound(hit.sound)
  }, true)

  /* hover — מנגן פעם אחת בכניסה לכפתור חדש (dedupe לפי האלמנט, לא בכל pointermove) */
  let lastHover: HTMLElement | null = null
  document.addEventListener('pointerover', (e) => {
    const src = e.target as HTMLElement | null
    const el = src?.closest?.(INTERACTIVE) as HTMLElement | null
    if (el === lastHover) return
    lastHover = el
    const hit = holoTarget(e)
    if (hit) playSound('hover')
  }, true)
}

export function isMuted() { return muted }
export function getVolume() { return volume }

export function setMuted(v: boolean) {
  muted = v
  try { localStorage.setItem(MUTED_KEY, v ? '1' : '0') } catch { /* noop */ }
  emit()
}
export function toggleMuted() { setMuted(!muted) }

export function setVolume(v: number) {
  volume = Math.min(1, Math.max(0, v))
  try { localStorage.setItem(VOLUME_KEY, String(volume)) } catch { /* noop */ }
  emit()
}

function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb) } }

/* hook דק — קריאה/שינוי של mute/volume מכל רכיב, עם רינדור-מחדש בשינוי */
export function useSoundSettings() {
  const m = useSyncExternalStore(subscribe, () => muted, () => false)
  const v = useSyncExternalStore(subscribe, () => volume, () => 0.7)
  return { muted: m, volume: v, toggleMuted, setMuted, setVolume, play: playSound }
}
