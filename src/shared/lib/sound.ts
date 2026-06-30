import { useSyncExternalStore } from 'react'

/* ── מערכת סאונד מרכזית ל-HoloAcademy ─────────────────────────────────────────
   Web Audio API: כל ניגון = BufferSource חדש → סאונדים קצרים (click/good) נשמעים
   ברצף מהיר בלי לחתוך זה את זה. סאונדים ארוכים (win/fusion/portal/wormhole) — אם
   מופעלים שוב לפני שנגמרו, ה-source הקודם נעצר (איפוס). preload פעם אחת.
   Autoplay: ה-AudioContext נוצר suspended ומתעורר (resume) ב-user-gesture הראשון.
   mute/volume נשמרים ב-localStorage. כשל טעינה (404) → דילוג שקט (try/catch).
   ─────────────────────────────────────────────────────────────────────────── */

export type SoundName = 'click' | 'good' | 'win' | 'error' | 'fusion' | 'portal' | 'wormhole'

const FILES: Record<SoundName, string> = {
  click: '/sounds/click.mp3',
  good: '/sounds/good.mp3',
  win: '/sounds/crystal_win.mp3',
  error: '/sounds/digital_error.mp3',
  fusion: '/sounds/3fusion.mp3',
  portal: '/sounds/portal_neon.wav',
  wormhole: '/sounds/wormhole.mp3',
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
  try {
    const res = await fetch(FILES[name])
    if (!res.ok) return
    const arr = await res.arrayBuffer()
    buffers[name] = await ac.decodeAudioData(arr)
  } catch { /* דילוג שקט */ }
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

export function playSound(name: SoundName) {
  if (!isBrowser || muted) return
  const ac = getCtx()
  if (!ac) return
  const buf = buffers[name]
  if (!buf) { initSound(); return } /* עדיין לא נטען — דילוג שקט (אין lag) */
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
