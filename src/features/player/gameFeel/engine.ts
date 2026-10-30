/* ── gameFeel — מערכת התחושה של המשחק: מודול אחד, שלוש עוצמות (CLAUDE.md "תחושת משחק: כללים") ──
   הפרמטרים לקוחים מאב־הטיפוס (docs/prototypes/game-feel-lab.html). הכללים שהמודול אוכף:
   · תנועה וצליל רק ברגעי משוב ומעבר. בזמן קריאת טקסט שום דבר לא זז, חוץ מזום איטי של תמונת הרקע.
   · טעות = נדנוד רך וצליל עמום. בלי הבזק אדום ובלי זמזם.
   · שום אנימציה לא חוסמת: כל הפונקציות כאן "יורות ושוכחות", והמשחק לא מחכה להן.
   · prefers-reduced-motion: בלי תנועה, בלי חלקיקים, בלי הבהוב; הגבישים מתמלאים מיד. הצלילים נשארים (יש כפתור השתקה).
   · מחשב חלש: מודדים FPS בשניות הראשונות של השיעור; מתחת ל-40 העוצמה יורדת אוטומטית לעדין.
   · canvas אחד לחלקיקים, על כל המסך. שום דבר כאן לא נוגע בלוגיקת האתגרים. */
import { useSyncExternalStore } from 'react'
import { getAudioContext, isMuted } from '../../../shared/lib/sound'
import { DEFAULT_EFFECT_LEVEL, type EffectLevel } from '../../../shared/lib/gemModel'

export interface LevelConfig {
  particles: number; trail: boolean; shake: boolean; streak: boolean; ladder: boolean; glow: boolean
  confetti: number; holo: boolean; squash: boolean; arc: number; flightMs: number; stinger: boolean
  bigIntro: boolean; haptic: boolean; fillMs: number
}

export const LEVELS: Readonly<Record<EffectLevel, LevelConfig>> = {
  gentle: { particles: 0, trail: false, shake: false, streak: false, ladder: false, glow: false, confetti: 0, holo: false, squash: false, arc: 0.25, flightMs: 520, stinger: false, bigIntro: false, haptic: false, fillMs: 300 },
  medium: { particles: 14, trail: false, shake: false, streak: true, ladder: true, glow: true, confetti: 50, holo: true, squash: true, arc: 0.5, flightMs: 660, stinger: false, bigIntro: true, haptic: false, fillMs: 460 },
  full: { particles: 34, trail: true, shake: true, streak: true, ladder: true, glow: true, confetti: 150, holo: true, squash: true, arc: 0.65, flightMs: 760, stinger: true, bigIntro: true, haptic: true, fillMs: 520 },
}

/* FPS מתחת לזה בשניות הראשונות של השיעור → עוצמה עדינה */
export const LOW_FPS = 40
export const FPS_PROBE_MS = 3000
/* גובה הזום של תמונת הסצנה: מחזור של 26 שניות */
export const KEN_BURNS_SECONDS = 26

export type HoloMood = 'neutral' | 'happy' | 'thinking' | 'surprised'

const isBrowser = typeof window !== 'undefined'
const reducedQuery = isBrowser && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null

interface FeelState { level: EffectLevel; requested: EffectLevel; autoLowered: boolean; streak: number; mood: HoloMood; reading: boolean }
let state: FeelState = { level: DEFAULT_EFFECT_LEVEL, requested: DEFAULT_EFFECT_LEVEL, autoLowered: false, streak: 0, mood: 'neutral', reading: false }

const listeners = new Set<() => void>()
function set(patch: Partial<FeelState>): void {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
function subscribe(cb: () => void): () => void { listeners.add(cb); return () => { listeners.delete(cb) } }
const getState = (): FeelState => state

export const prefersReducedMotion = (): boolean => !!reducedQuery?.matches
export const feelLevel = (): EffectLevel => state.level
export const cfg = (): LevelConfig => LEVELS[state.level]

export function useGameFeel(): FeelState & { reduced: boolean; config: LevelConfig } {
  const s = useSyncExternalStore(subscribe, getState, getState)
  return { ...s, reduced: prefersReducedMotion(), config: LEVELS[s.level] }
}

/* העוצמה שהכיתה בחרה. ירידה אוטומטית שכבר קרתה בשיעור הזה נשארת */
export function setFeelLevel(level: EffectLevel): void {
  set({ requested: level, level: state.autoLowered ? 'gentle' : level })
}
export function resetFeel(): void {
  set({ streak: 0, mood: 'neutral', reading: false })
}
/* שלב הקריאה: אלמנטים "חיים" (כמו הבהוב ההולוגרמה) נעצרים בזמן קריאת טקסט */
export function setReading(reading: boolean): void {
  if (state.reading !== reading) set({ reading })
}

/* ── מדידת FPS בתחילת השיעור ── */
export function averageFps(frameTimes: readonly number[]): number {
  if (frameTimes.length < 2) return Infinity
  const span = frameTimes[frameTimes.length - 1] - frameTimes[0]
  return span > 0 ? ((frameTimes.length - 1) * 1000) / span : Infinity
}
export function shouldLowerLevel(fps: number): boolean { return fps < LOW_FPS }

let probing = false
export function startFpsProbe(): void {
  if (!isBrowser || probing || state.autoLowered || prefersReducedMotion() || state.level === 'gentle') return
  probing = true
  const times: number[] = []
  const t0 = performance.now()
  const step = (now: number) => {
    times.push(now)
    if (now - t0 < FPS_PROBE_MS) { requestAnimationFrame(step); return }
    probing = false
    /* לשונית ברקע לא מציירת פריימים: לא מסיקים מזה שהמחשב חלש */
    if (document.visibilityState === 'visible' && shouldLowerLevel(averageFps(times))) set({ level: 'gentle', autoLowered: true })
  }
  requestAnimationFrame(step)
}

/* ── צלילים: מסונתזים ב-Web Audio, בעוצמה כללית נמוכה, בלי קבצי שמע ── */
const MASTER_GAIN = 0.13
const LADDER = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66]
let masterCtx: AudioContext | null = null
let master: GainNode | null = null
function audioOut(): { ac: AudioContext; out: GainNode } | null {
  if (!isBrowser || isMuted()) return null
  const ac = getAudioContext()
  if (!ac) return null
  if (masterCtx !== ac || !master) {
    masterCtx = ac
    master = ac.createGain()
    master.gain.value = MASTER_GAIN
    master.connect(ac.destination)
  }
  return { ac, out: master }
}
function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.5, when = 0, glideTo?: number): void {
  const a = audioOut()
  if (!a) return
  try {
    const t = a.ac.currentTime + when
    const o = a.ac.createOscillator()
    const g = a.ac.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g)
    g.connect(a.out)
    o.start(t)
    o.stop(t + dur + 0.03)
  } catch { /* צליל לעולם לא מפיל את המשחק */ }
}
export const sounds = {
  /* צעד-ביניים באתגר: זוג שנמצא, אות נכונה, אריח במקום */
  step(): void { tone(880, 0.1, 'sine', 0.3) },
  correct(n: number): void {
    const f = cfg().ladder ? LADDER[Math.min(Math.max(n - 1, 0), LADDER.length - 1)] : 659.25
    tone(f, 0.16, 'sine', 0.55)
    tone(f * 1.5, 0.24, 'sine', 0.3, 0.07)
  },
  drop(): void { tone(1568, 0.14, 'sine', 0.3) },
  gem(): void { tone(2093, 0.24, 'sine', 0.42); tone(3136, 0.15, 'sine', 0.18, 0.03) },
  /* טעות: צליל עמום ויורד. לא זמזם */
  wrong(): void { tone(200, 0.17, 'sine', 0.5, 0, 128) },
  streak(): void { [784, 988, 1175].forEach((f, i) => tone(f, 0.12, 'triangle', 0.3, i * 0.065)) },
  big(): void { tone(110, 0.6, 'triangle', 0.35, 0, 220); tone(330, 0.4, 'sine', 0.18, 0.3) },
  chain(i: number): void { tone(LADDER[Math.min(i, LADDER.length - 1)], 0.12, 'sine', 0.3) },
  gate(): void { tone(330, 0.22, 'triangle', 0.3); tone(494, 0.3, 'sine', 0.26, 0.16); tone(659.25, 0.4, 'sine', 0.22, 0.32) },
  end(kind: 'open' | 'closed' | 'radiant'): void {
    if (kind === 'open') { tone(523.25, 0.35, 'sine', 0.35); tone(587.33, 0.45, 'sine', 0.3, 0.18); return }
    ;[523.25, 659.25, 783.99].forEach((f, i) => tone(f, 0.9, 'sine', 0.32, i * 0.035))
    if (kind === 'radiant') [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone(f, 0.5, 'sine', 0.16, 0.3 + i * 0.09))
    else if (cfg().stinger) tone(1046.5, 0.7, 'sine', 0.22, 0.25)
  },
}
function vibrate(ms: number): void {
  try { if (cfg().haptic && navigator.vibrate) navigator.vibrate(ms) } catch { /* ignore */ }
}

/* ── חלקיקים: canvas אחד על כל המסך ── */
interface Part { x: number; y: number; vx: number; vy: number; g: number; drag?: number; life: number; max: number; size: number; color: string; shape: 'dot' | 'shard' | 'rect'; rot: number; vr: number }
const PCOL = ['#F4FCFF', '#BFEAFA', '#7FD6F2', '#2FF3FF', '#45B6E2']
const CCOL = ['#2FF3FF', '#F241DA', '#F3B76A', '#DDF5FF', '#45B6E2', '#7FD6F2']
let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
let parts: Part[] = []
let raf = 0
let W = 0
let H = 0
/* הזמן האחרון שנמדד בפריים של חלקיקים — למדידת ביצועים בבדיקות (window.__holoFx) */
let frameLog: number[] | null = null

function ensureCanvas(): CanvasRenderingContext2D | null {
  if (!isBrowser) return null
  if (canvas && canvas.isConnected && ctx) return ctx
  canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  canvas.setAttribute('data-game-feel-fx', '')
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:85;'
  document.body.appendChild(canvas)
  ctx = canvas.getContext('2d')
  sizeCanvas()
  window.addEventListener('resize', sizeCanvas)
  return ctx
}
function sizeCanvas(): void {
  if (!canvas || !ctx) return
  const d = Math.min(2, window.devicePixelRatio || 1)
  W = window.innerWidth
  H = window.innerHeight
  canvas.width = Math.round(W * d)
  canvas.height = Math.round(H * d)
  ctx.setTransform(d, 0, 0, d, 0, 0)
}
function addPart(p: Part): void {
  parts.push(p)
  if (!raf) raf = requestAnimationFrame(tick)
}
function tick(now: number): void {
  const c = ctx
  if (!c) { raf = 0; return }
  frameLog?.push(now)
  c.clearRect(0, 0, W, H)
  parts = parts.filter((p) => p.life < p.max)
  for (const p of parts) {
    p.life++
    const d = p.drag ?? 0.98
    p.vx *= d
    p.vy = p.vy * d + p.g
    p.x += p.vx
    p.y += p.vy
    p.rot += p.vr
    c.globalAlpha = Math.max(0, Math.min(1, (1 - p.life / p.max) * 1.5))
    c.fillStyle = p.color
    if (p.shape === 'dot') {
      c.beginPath(); c.arc(p.x, p.y, p.size, 0, 6.2832); c.fill()
    } else {
      c.save(); c.translate(p.x, p.y); c.rotate(p.rot)
      if (p.shape === 'shard') { c.beginPath(); c.moveTo(0, -p.size); c.lineTo(p.size * 0.6, 0); c.lineTo(0, p.size); c.lineTo(-p.size * 0.6, 0); c.closePath(); c.fill() }
      else c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      c.restore()
    }
  }
  c.globalAlpha = 1
  raf = parts.length ? requestAnimationFrame(tick) : 0
}
export function burst(x: number, y: number, n: number, kind: 'shard' | 'dot'): void {
  if (prefersReducedMotion() || n <= 0 || !ensureCanvas()) return
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const sp = (kind === 'shard' ? 2 : 1.2) + Math.random() * (kind === 'shard' ? 4 : 2.4)
    addPart({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (kind === 'shard' ? 1.4 : 0.4), g: kind === 'shard' ? 0.13 : 0.03,
      life: 0, max: 34 + Math.random() * 26, size: kind === 'shard' ? 3 + Math.random() * 3 : 1.4 + Math.random() * 1.8,
      color: PCOL[i % PCOL.length], shape: kind === 'shard' ? 'shard' : 'dot', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
    })
  }
}
function trailDot(x: number, y: number): void {
  addPart({ x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 8, vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5, g: 0, life: 0, max: 24, size: 1.4 + Math.random() * 2, color: PCOL[Math.floor(Math.random() * PCOL.length)], shape: 'dot', rot: 0, vr: 0 })
}
export function confetti(n: number): void {
  if (prefersReducedMotion() || n <= 0 || !ensureCanvas()) return
  for (let i = 0; i < n; i++) {
    addPart({
      x: Math.random() * W, y: -12 - Math.random() * H * 0.45, vx: (Math.random() - 0.5) * 1.6, vy: 1.4 + Math.random() * 2.4, g: 0.025, drag: 0.995,
      life: 0, max: 190 + Math.random() * 90, size: 4 + Math.random() * 4, color: CCOL[i % CCOL.length], shape: Math.random() < 0.5 ? 'shard' : 'rect', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.25,
    })
  }
}

/* אלמנט שהופיע בתחתית פאנל האתגר (רמז, הסבר, "המשך") נגלל לתוך התצוגה. קבוע: ref שמופעל פעם אחת בהרכבה */
export const revealEl = (el: HTMLElement | null): void => {
  el?.scrollIntoView?.({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}

/* ── תנועות ── */
export function wobble(el: Element | null): void {
  if (!el || prefersReducedMotion() || typeof el.animate !== 'function') return
  const a = state.level === 'gentle' ? 3 : 7
  try {
    el.animate(
      [{ transform: 'translateX(0)' }, { transform: `translateX(${a}px)` }, { transform: `translateX(${-a}px)` }, { transform: `translateX(${a / 2}px)` }, { transform: 'translateX(0)' }],
      { duration: 340, easing: 'ease-out' },
    )
  } catch { /* ignore */ }
}
export function shakeScreen(): void {
  if (prefersReducedMotion() || !cfg().shake) return
  const el = document.querySelector('.holo-scene-root')
  if (!el || typeof el.animate !== 'function') return
  try {
    el.animate(
      [{ transform: 'translate(0,0)' }, { transform: 'translate(-4px,1px)' }, { transform: 'translate(4px,-1px)' }, { transform: 'translate(-2px,0)' }, { transform: 'translate(0,0)' }],
      { duration: 280, easing: 'ease-out' },
    )
  } catch { /* ignore */ }
}
/* כניסה מודגשת של האתגר האחרון */
export function bigEntrance(el: Element | null): void {
  if (!cfg().bigIntro || prefersReducedMotion() || !el || typeof el.animate !== 'function') return
  try {
    el.animate(
      [{ transform: 'scale(.92)', opacity: 0.3 }, { transform: 'scale(1.03)', opacity: 1 }, { transform: 'scale(1)', opacity: 1 }],
      { duration: 520, easing: 'cubic-bezier(.2,1.2,.4,1)' },
    )
  } catch { /* ignore */ }
  if (cfg().stinger) sounds.big()
}

/* ── ד"ר הולו: הבעה קצרה ואז חזרה לרגילה ── */
let moodTimer: ReturnType<typeof setTimeout> | undefined
export function setMood(mood: HoloMood): void {
  if (moodTimer) clearTimeout(moodTimer)
  set({ mood })
  if (mood !== 'neutral') moodTimer = setTimeout(() => set({ mood: 'neutral' }), 1600)
}

/* ── אירועי המילוי: ה-HUD מאזין, כדי שהשקע יתמלא כשהגביש מגיע ── */
export const GEM_ARRIVED = 'holo-gem-arrived'
const gemTarget = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-gem-target]') ?? document.querySelector<HTMLElement>('[data-gem-bar]')

function arrive(): void {
  sounds.drop()
  window.dispatchEvent(new Event(GEM_ARRIVED))
}

const GEM_SVG = '<svg viewBox="0 0 152 132" aria-hidden="true" style="width:100%;height:100%;display:block;overflow:visible;filter:drop-shadow(0 0 8px rgba(47,243,255,.6))"><use href="#holo-gem"/></svg>'

/* מעוף הגביש מהתשובה אל השקע שמתמלא. לא חוסם: המשחק ממשיך בלעדיו */
export function flyGem(from: Element | null, gain: number): void {
  const c = cfg()
  const target = isBrowser ? gemTarget() : null
  /* בלי מעוף: המילוי מיד, אבל אחרי שהמונה קיבל את הערך החדש (אותה לחיצה עדיין מתעדכנת) */
  if (!from || !target || prefersReducedMotion()) { window.setTimeout(arrive, 0); return }
  const a = from.getBoundingClientRect()
  const b = target.getBoundingClientRect()
  const sx = a.left + a.width / 2
  const sy = a.top + a.height / 2
  const ex = b.left + b.width / 2
  const ey = b.top + b.height / 2
  const w = Math.max(18, b.width)
  const h = (w * 132) / 152
  const endScale = gain >= 1 ? 1 : 0.65
  const el = document.createElement('div')
  el.setAttribute('data-gem-flyer', '')
  el.style.cssText = `position:fixed;left:0;top:0;z-index:86;pointer-events:none;transform-origin:center;will-change:transform;width:${w}px;height:${h}px;`
  el.innerHTML = GEM_SVG
  document.body.appendChild(el)
  const dist = Math.hypot(ex - sx, ey - sy)
  const cx = (sx + ex) / 2 + c.arc * dist * 0.22
  const cy = Math.min(sy, ey) - c.arc * dist * 0.55
  if (c.particles) burst(sx, sy, Math.round(c.particles * 0.4), 'dot')
  const t0 = performance.now()
  let done = false
  const finish = () => {
    if (done) return
    done = true
    el.remove()
    arrive()
  }
  const step = (now: number) => {
    if (done) return
    const t = Math.min(1, (now - t0) / c.flightMs)
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    const u = 1 - e
    const x = u * u * sx + 2 * u * e * cx + e * e * ex
    const y = u * u * sy + 2 * u * e * cy + e * e * ey
    const sc = 1.9 - (1.9 - endScale) * e
    const rot = c.trail ? 360 * e : 0
    el.style.transform = `translate(${x - w / 2}px,${y - h / 2}px) scale(${sc}) rotate(${rot}deg)`
    if (c.trail && t < 0.97 && ensureCanvas()) trailDot(x, y)
    frameLog?.push(now)
    if (t < 1) requestAnimationFrame(step)
    else finish()
  }
  requestAnimationFrame(step)
  /* לשונית ברקע: requestAnimationFrame קופא. המילוי לא מחכה לו */
  window.setTimeout(finish, c.flightMs + 400)
}

/* גביש שמתמלא עד הסוף: הבזק, שברי גביש וצליל */
export function gemCompleted(socket: Element | null): void {
  sounds.gem()
  vibrate(18)
  const c = cfg()
  if (socket && c.particles && !prefersReducedMotion()) {
    const r = socket.getBoundingClientRect()
    burst(r.left + r.width / 2, r.top + r.height / 2, c.particles, 'shard')
  }
}

/* ── רגעי המשוב ── */
const STREAK_MIN = 3
export const STREAK_EVENT = 'holo-streak'

/* תשובה נכונה. clean=false: הצלחה אחרי טעות — לא מאריך רצף. gain: כמה גבישים נוספו (0 = בלי מעוף) */
export function feelCorrect(opts: { from?: Element | null; gain: number; clean: boolean }): void {
  const streak = opts.clean ? state.streak + 1 : 0
  set({ streak })
  sounds.correct(opts.clean ? streak : 1)
  setMood('happy')
  if (opts.gain > 0) flyGem(opts.from ?? null, opts.gain)
  if (cfg().streak && opts.clean && streak >= STREAK_MIN) {
    window.dispatchEvent(new CustomEvent(STREAK_EVENT, { detail: { streak } }))
    sounds.streak()
    shakeScreen()
  }
}
/* טעות: נדנוד רך, צליל עמום, ד"ר הולו חושב. בלי הבזק אדום */
export function feelWrong(el?: Element | null): void {
  set({ streak: 0 })
  sounds.wrong()
  setMood('thinking')
  wobble(el ?? document.querySelector('[data-puzzle-panel]'))
}

/* למדידה בבדיקות הביצועים בלבד */
if (isBrowser) {
  ;(window as unknown as { __holoFx?: unknown }).__holoFx = {
    startLog(): void { frameLog = [] },
    stopLog(): number[] { const l = frameLog ?? []; frameLog = null; return l },
    level: () => state.level,
    setLevel: setFeelLevel,
    confetti,
    flyGem,
    setMood,
  }
}
