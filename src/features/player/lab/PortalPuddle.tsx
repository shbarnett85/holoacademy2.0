/* פני המים של הפורטל (event horizon של Stargate): התמונה נראית דרך משטח מים שגלים עוברים עליו.
   WebGL, כי זו שבירה לכל פיקסל, ועיוות דרך מסנן SVG יקר פי כמה ונראה כמו רעד ולא כמו מים.
   ההסטה חסומה ב-MARGIN בשיידר, והתמונה מוגדלת באותו שיעור, ולכן גל לא יכול לחשוף את קצה התמונה.
   התמונה הרגילה נשארת מתחת לקנבס: בלי WebGL, כשהתמונה אוסרת קריאה (CORS) או כשההקשר אבד, רואים אותה. */
import { useEffect, useRef, useState } from 'react'

const VERT = `attribute vec2 a; varying vec2 v; void main(){ v = a; gl_Position = vec4(a, 0., 1.); }`

const FRAG = `precision mediump float;
varying vec2 v;
uniform sampler2D img;
uniform float t;
uniform float agitation;
uniform float splash;
uniform vec2 uvScale;
uniform vec2 uvCenter;
const float MARGIN = .06;

float wave(vec2 p, vec2 src, float k, float w, float a) {
  float d = length(p - src);
  return sin(d * k - t * w) * a / (1. + d * 2.2);
}

float height(vec2 p) {
  float r = length(p);
  float h = sin(r * 34. - t * 1.5) * .26;
  h += wave(p, vec2(sin(t * .13) * .5, cos(t * .17) * .45), 19., 1.2, .4);
  h += wave(p, vec2(cos(t * .11 + 2.) * .6, sin(t * .09 + 1.) * .55), 27., 1.7, .3);
  h += wave(p, vec2(sin(t * .07 + 4.) * .7, cos(t * .14 + 3.) * .35), 14., .9, .36);
  h += sin(p.x * 7. + t * .5 + sin(p.y * 5. - t * .37) * 1.6) * .16;
  if (splash >= 0.) {
    float front = r - splash * 1.25;
    h += sin(front * 34.) * exp(-front * front * 22.) * exp(-splash * .9) * 1.5;
  }
  return h * agitation;
}

void main() {
  vec2 p = v;
  float r = length(p);
  float e = .012;
  float h = height(p);
  vec2 g = vec2(height(p + vec2(e, 0.)) - h, height(p + vec2(0., e)) - h) / e;

  vec2 shift = clamp(g * .001, -MARGIN, MARGIN);
  vec2 q = (p * .5 * (1. - 2. * MARGIN) + shift) * uvScale + uvCenter;
  vec3 col = texture2D(img, q).rgb;

  vec3 tint = vec3(.36, .72, 1.);
  float edge = smoothstep(.5, 1., r);
  col = mix(col, tint * (.6 + dot(col, vec3(.33))), .06 + edge * .24);

  /* אור שנופל בזווית: צד אחד של כל גל בהיר והצד השני כהה, ולכן רואים טבעות ולא כתמים */
  col += vec3(.8, .92, 1.) * clamp(dot(g, vec2(-.55, .83)) * .019, -.1, .2);
  vec3 n = normalize(vec3(-g * .07, 1.));
  float spec = pow(max(dot(n, normalize(vec3(-.32, .46, .83))), 0.), 120.);
  col += vec3(.85, .95, 1.) * spec * .28;
  col += tint * pow(r, 8.) * .24;
  gl_FragColor = vec4(col, 1.);
}`

const MAX_PIXELS = 720
const FRAME_MS = 1000 / 30

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type)
  if (!s) return null
  gl.shaderSource(s, src)
  gl.compileShader(s)
  return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null
}

export default function PortalPuddle({ src, width, height, screenScale, focusX = 0.5, agitated, splashKey }: {
  src: string
  /* גודל הפורטל בקואורדינטות המעבדה */
  width: number
  height: number
  /* פיקסלי מסך לכל יחידת מעבדה */
  screenScale: number
  /* מרכז החיתוך בציר x, אם התמונה רחבה מהפורטל */
  focusX?: number
  agitated: boolean
  /* כל ערך חדש שולח גל אחד מהמרכז */
  splashKey: number
}) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const [ready, setReady] = useState(false)
  const live = useRef({ agitated, splashAt: splashKey ? performance.now() : -1, pixels: 0 })
  live.current.agitated = agitated
  live.current.pixels = Math.min(MAX_PIXELS, Math.round(width * screenScale * (window.devicePixelRatio || 1)))

  useEffect(() => { if (splashKey) live.current.splashAt = performance.now() }, [splashKey])

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

    let raf = 0
    let last = 0
    let agitation = live.current.agitated ? 1.5 : 1
    let cancelled = false
    const start = performance.now()
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      if (now - last < FRAME_MS) return
      last = now
      const { pixels, splashAt } = live.current
      const rows = Math.round(pixels * height / width)
      if (canvas.width !== pixels || canvas.height !== rows) {
        canvas.width = pixels
        canvas.height = rows
        gl.viewport(0, 0, pixels, rows)
      }
      const target = live.current.agitated ? 1.5 : 1
      agitation += (target - agitation) * .05
      gl.uniform1f(uT, (now - start) / 1000)
      gl.uniform1f(uAgitation, agitation)
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
      /* cover: הציר העודף נחתך, וסביב focusX בציר x */
      const ratio = (img.naturalWidth / img.naturalHeight) / (width / height)
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
  }, [src, width, height, focusX])

  return <canvas ref={ref} className="lab-puddle" data-lab-puddle={ready ? 'on' : 'off'} style={{ opacity: ready ? 1 : 0 }} aria-hidden="true" />
}
