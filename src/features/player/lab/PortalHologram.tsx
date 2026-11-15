/* הפורטל כהולוגרמה: התמונה של השיעור נראית כאור כחלחל (או כתום-זהוב בסיפור שנסגר), עם ריצוד עדין —
   קווי סריקה, פסי אור אנכיים, תזוזה קטנה של פס אופקי, ונשימה של הבהירות (לאט, הרבה מתחת ל-3 פעמים בשנייה).
   אותו קנבס מצייר גם את ההשתקפות ברצפה: התמונה והטבעת, הפוכות ונמוגות, מתחת לקדמת הבמה.
   הקנבס שחור מחוץ להולוגרמה ומשולב ב-screen, ולכן השחור לא משנה את הרקע, והאור נוסף עליו.
   WebGL, כי זו עבודה לכל פיקסל; בלי WebGL, כשהתמונה אוסרת קריאה (CORS) או כשההקשר אבד, נשארת הגרסה הקבועה ב-CSS (LabStage). */
import { useEffect, useRef, useState } from 'react'

const VERT = `attribute vec2 a; varying vec2 v; void main(){ v = a; gl_Position = vec4(a, 0., 1.); }`

const FRAG = `precision mediump float;
varying vec2 v;
uniform sampler2D img;
uniform float t;
uniform float agitation;
uniform float splash;
uniform float gold;
uniform vec4 rect;      /* אזור הקנבס בעולם: x, y, רוחב, גובה */
uniform vec4 box;       /* המלבן של הפורטל בעולם */
uniform vec3 disk;      /* מרכז x, מרכז y, רדיוס */
uniform vec2 stage;     /* y של ראש הבמה (שם הפורטל נחתך), y של קדמת הבמה (שם מתחילה הרצפה) */
uniform vec2 uvScale;
uniform vec2 uvCenter;
const float MIRROR = .85;

float hash(float n) { return fract(sin(n * 91.345) * 47453.21); }

vec3 tintOf() { return mix(vec3(.42, .86, 1.), vec3(1., .6, .18), gold); }
vec3 deepOf() { return mix(vec3(.04, .16, .42), vec3(.36, .13, .02), gold); }

/* התמונה בנקודה בעולם, כאור הולוגרפי: הבהירות ממופה לסולם של הצבע, ומעט מהצבע המקורי נשאר */
vec3 holo(vec2 w) {
  vec2 q = (w - box.xy) / box.zw;
  vec2 tq = vec2(q.x - .5, .5 - q.y) * .96 * uvScale + uvCenter;
  vec3 c = texture2D(img, tq).rgb;
  float l = dot(c, vec3(.3, .59, .11));
  vec3 ramp = mix(deepOf(), tintOf(), smoothstep(.0, .85, l)) + vec3(.9, .97, 1.) * pow(l, 3.) * .55;
  return mix(c, ramp, .68) * 1.08;
}

/* הטבעת: קו אור על שפת הפתח, וזוהר רך סביבו */
float ring(vec2 w) {
  float d = abs(length(w - disk.xy) - disk.z);
  return exp(-d / 2.2) + exp(-d / 10.) * .35;
}

void main() {
  vec2 uv = v * .5 + .5;
  vec2 w = vec2(rect.x + uv.x * rect.z, rect.y + (1. - uv.y) * rect.w);
  vec3 tint = tintOf();
  float dist = length(w - disk.xy);
  vec3 col = vec3(0.);

  if (w.y < stage.x + 1.) {
    float inside = smoothstep(disk.z + .8, disk.z - .8, dist) * smoothstep(stage.x + .5, stage.x - .5, w.y);
    if (inside > 0.) {
      /* ריצוד: גל אופקי זעיר בכל השורות, ופס אחד שיורד לאט ובו התזוזה מעט גדולה יותר */
      float band = exp(-pow((w.y - mod(t * 38., box.w + 160.) - box.y + 80.) / 9., 2.));
      vec2 j = vec2(sin(w.y * .31 + t * 1.9) * .35 + band * (1.4 + agitation * 1.6) * sin(t * 7.), 0.);
      vec3 c = holo(w + j * agitation);
      /* קווי סריקה בפיקסלים של המסך, זזים לאט */
      c *= .9 + .1 * sin(gl_FragCoord.y * 2.1 - t * 2.4);
      /* פסי אור אנכיים דקים שיורדים */
      float colId = floor(w.x / 3.);
      float n = hash(colId);
      float streak = step(.93, n) * pow(.5 + .5 * sin(w.y * .045 - t * (1.2 + n * 1.6) + n * 40.), 6.);
      c += tint * streak * .3;
      c += tint * band * .12;
      /* נשימה של הבהירות: איטית */
      c *= 1. + .035 * sin(t * 1.3) + .02 * sin(t * 2.3 + 1.);
      /* שפה זוהרת מבפנים, והאור שבו ההולוגרמה נוגעת בבמה */
      float e = disk.z - dist;
      c += tint * (exp(-e / 7.) * .7 + exp(-e / 45.) * .22);
      c += tint * exp(-(stage.x - w.y) / 9.) * .45;
      /* גל אור מהמרכז: ביציאה מהפורטל בסיכום ובצלילה אליו */
      if (splash >= 0.) {
        float front = dist - splash * 260.;
        c += tint * exp(-front * front / 400.) * exp(-splash * 1.4) * .8;
      }
      /* מעבר לזהב: הבזק רך אחד באמצע, כדי שהמעבר לא יעבור דרך צבע עכור */
      c += vec3(1., .96, .9) * gold * (1. - gold) * .5;
      col = c * inside;
    }
  } else if (w.y > stage.y) {
    /* ההשתקפות: הנקודה המקבילה מעל הרצפה, במראה עם קיצור פרספקטיבה */
    float below = w.y - stage.y;
    float py = stage.y - below / MIRROR;
    float wob = sin(w.y * .16 + t * .8) * 1.1 + sin(w.y * .05 - t * .5) * .8;
    vec2 m = vec2(w.x + wob, py);
    float fade = exp(-below / 130.);
    vec3 r = vec3(0.);
    if (py < stage.x) {
      /* טשטוש אנכי: הרצפה מבריקה אבל לא מראה */
      float s = 2. + below * .06;
      for (int i = -2; i <= 2; i++) {
        vec2 p = m + vec2(0., float(i) * s);
        float inDisk = smoothstep(disk.z, disk.z - 3., length(p - disk.xy)) * step(p.y, stage.x);
        r += holo(p) * inDisk;
      }
      r *= .2 * 1.1;
      r += tint * ring(m) * 1.25 * step(m.y, stage.x);
    }
    col = r * fade * (.75 + .25 * sin(t * 1.1 + w.y * .02));
  }
  gl_FragColor = vec4(col, 1.);
}`

const MAX_PIXELS = 720
const FRAME_MS = 1000 / 30
/* המעבר מתכלת לכתום-זהוב */
export const PORTAL_GOLD_MS = 2400

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type)
  if (!s) return null
  gl.shaderSource(s, src)
  gl.compileShader(s)
  return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null
}

export interface PortalGeometry {
  /* המלבן של הפורטל, ממנו נחתכת התמונה (cover) */
  box: { x: number; y: number; width: number; height: number }
  /* מרכז הפתח ורדיוסו */
  cx: number
  cy: number
  r: number
  /* ראש הבמה (הפורטל נחתך שם) וקדמת הבמה (מכאן הרצפה) */
  stageTop: number
  stageFront: number
  /* אזור הקנבס בעולם: הפורטל וההשתקפות */
  rect: { x: number; y: number; width: number; height: number }
}

export default function PortalHologram({ src, geo, screenScale, focusX = 0.5, agitated, splashKey, gold, onReady }: {
  src: string
  geo: PortalGeometry
  /* פיקסלי מסך לכל יחידת עולם */
  screenScale: number
  focusX?: number
  agitated: boolean
  /* כל ערך חדש שולח גל אור אחד מהמרכז */
  splashKey: number
  /* סיפור שנסגר: הצבע עובר לכתום-זהוב */
  gold: boolean
  onReady?: (ready: boolean) => void
}) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const [ready, setReady] = useState(false)
  const { rect } = geo
  const live = useRef({ agitated, gold, splashAt: splashKey ? performance.now() : -1, pixels: 0 })
  live.current.agitated = agitated
  live.current.gold = gold
  live.current.pixels = Math.min(MAX_PIXELS, Math.round(rect.width * screenScale * (window.devicePixelRatio || 1)))

  useEffect(() => { if (splashKey) live.current.splashAt = performance.now() }, [splashKey])
  useEffect(() => { onReady?.(ready) }, [ready, onReady])

  useEffect(() => {
    const canvas = ref.current
    const gl = canvas?.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' }) as WebGLRenderingContext | null
    if (!canvas || !gl) return
    const vs = compile(gl, gl.VERTEX_SHADER, VERT)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!vs || !fs || !program) return
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const a = gl.getAttribLocation(program, 'a')
    gl.enableVertexAttribArray(a)
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0)
    const u = (name: string) => gl.getUniformLocation(program, name)
    const uT = u('t')
    const uAgitation = u('agitation')
    const uSplash = u('splash')
    const uGold = u('gold')
    gl.uniform4f(u('rect'), rect.x, rect.y, rect.width, rect.height)
    gl.uniform4f(u('box'), geo.box.x, geo.box.y, geo.box.width, geo.box.height)
    gl.uniform3f(u('disk'), geo.cx, geo.cy, geo.r)
    gl.uniform2f(u('stage'), geo.stageTop, geo.stageFront)

    let raf = 0
    let last = 0
    let agitation = live.current.agitated ? 1.6 : 1
    let goldValue = live.current.gold ? 1 : 0
    let cancelled = false
    const start = performance.now()
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      const dt = now - last
      if (dt < FRAME_MS) return
      last = now
      const { pixels, splashAt } = live.current
      const rows = Math.round(pixels * rect.height / rect.width)
      if (canvas.width !== pixels || canvas.height !== rows) {
        canvas.width = pixels
        canvas.height = rows
        gl.viewport(0, 0, pixels, rows)
      }
      agitation += ((live.current.agitated ? 1.6 : 1) - agitation) * .05
      const target = live.current.gold ? 1 : 0
      goldValue = target > goldValue ? Math.min(target, goldValue + Math.min(dt, 100) / PORTAL_GOLD_MS) : Math.max(target, goldValue - Math.min(dt, 100) / PORTAL_GOLD_MS)
      const g = goldValue * goldValue * (3 - 2 * goldValue)
      gl.uniform1f(uT, (now - start) / 1000)
      gl.uniform1f(uAgitation, agitation)
      gl.uniform1f(uGold, g)
      gl.uniform1f(uSplash, splashAt < 0 ? -1 : (now - splashAt) / 1000)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (cancelled) return
      try {
        gl.bindTexture(gl.TEXTURE_2D, gl.createTexture())
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img)
      } catch { return }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      /* cover על המלבן של הפורטל: הציר העודף נחתך, וסביב focusX בציר x */
      const ratio = (img.naturalWidth / img.naturalHeight) / (geo.box.width / geo.box.height)
      const sx = ratio > 1 ? 1 / ratio : 1
      const sy = ratio > 1 ? 1 : ratio
      gl.uniform2f(u('uvScale'), sx, sy)
      gl.uniform2f(u('uvCenter'), sx / 2 + (1 - sx) * focusX, .5)
      raf = requestAnimationFrame(draw)
      setReady(true)
    }
    img.src = src
    const lost = () => { cancelAnimationFrame(raf); setReady(false) }
    canvas.addEventListener('webglcontextlost', lost)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      canvas.removeEventListener('webglcontextlost', lost)
      setReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, focusX, geo])

  return (
    <canvas ref={ref} className="lab-hologram" data-lab-hologram={ready ? 'on' : 'off'} aria-hidden="true"
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height, opacity: ready ? 1 : 0 }} />
  )
}
