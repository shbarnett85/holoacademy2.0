/* ──────────────────────────────────────────────────────────────────────────
   stats — פונקציות סטטיסטיות טהורות לזיהוי דפוסים (שלב D; ישמשו גם את המנוע האמיתי).
   ללא תלות חיצונית. חוק 6: כל דפוס עובר בדיקה מתוקנת BH + גודל אפקט + N מינימלי.
   ────────────────────────────────────────────────────────────────────────── */

export const mean = (a: number[]): number => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN)
export function sd(a: number[]): number {
  if (a.length < 2) return NaN
  const m = mean(a)
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1))
}
export function median(a: number[]): number {
  if (!a.length) return NaN
  const s = [...a].sort((x, y) => x - y)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/* ── התפלגות נורמלית ── */
export function normalCdf(z: number): number {
  /* Abramowitz-Stegun 7.1.26 על erf */
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2)
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2)
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y)
}

/* ── lnGamma + בטא לא-שלמה מוסדרת (Lentz) → התפלגות t ── */
function lnGamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941678, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
  let y = x
  let tmp = x + 5.5
  tmp -= (x + 0.5) * Math.log(tmp)
  let ser = 1.000000000190015
  for (let j = 0; j < 6; j++) ser += c[j] / ++y
  return -tmp + Math.log((2.5066282746310007 * ser) / x)
}
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200, EPS = 3e-12, FPMIN = 1e-300
  const qab = a + b, qap = a + 1, qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < FPMIN) d = FPMIN
  d = 1 / d
  let h = d
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d; h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < EPS) break
  }
  return h
}
export function betaRegularized(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b
}
/* P(T ≥ t) — זנב עליון של t עם df דרגות חופש. df ≤ 0 או t לא-סופי = אין התפלגות להשוות מולה → 0.5 (ולא NaN) */
export function tUpperTail(t: number, df: number): number {
  if (!(df > 0) || !Number.isFinite(t)) return 0.5
  const x = df / (df + t * t)
  const p = 0.5 * betaRegularized(x, df / 2, 0.5)
  return t >= 0 ? p : 1 - p
}
export const tTwoSided = (t: number, df: number): number => Math.min(1, 2 * tUpperTail(Math.abs(t), df))

/* ── בדיקת Welch (שני מדגמים, שונות לא שווה) — p דו-צדדי + d של Cohen ── */
export interface TTestResult { t: number; df: number; pTwoSided: number; d: number; meanA: number; meanB: number }
export function welch(a: number[], b: number[]): TTestResult {
  const ma = mean(a), mb = mean(b)
  const va = sd(a) ** 2, vb = sd(b) ** 2
  const se2 = va / a.length + vb / b.length
  const t = (ma - mb) / Math.sqrt(se2 || 1e-12)
  const df = se2 ** 2 / ((va / a.length) ** 2 / (a.length - 1) + (vb / b.length) ** 2 / (b.length - 1) || 1e-12)
  const pooled = Math.sqrt(((a.length - 1) * va + (b.length - 1) * vb) / (a.length + b.length - 2))
  /* רשת ביטחון: df ≤ 0 (שונות 0 בשתי הקבוצות / n=1) או t לא-סופי = המבחן לא מוגדר → p=1, d=0.
     בלי זה p יוצא NaN והוא מזהם את תיקון ה-BH של כל המשפחה (תלמיד תקרה אחד מספיק). t נשמר כפי שחושב (changePoint משתמש בו). */
  if (!(df > 0) || !Number.isFinite(t)) return { t, df: Number.isFinite(df) ? df : 0, pTwoSided: 1, d: 0, meanA: ma, meanB: mb }
  return { t, df, pTwoSided: tTwoSided(t, df), d: pooled > 0 ? (ma - mb) / pooled : 0, meanA: ma, meanB: mb }
}

/* ── הפרדה מושלמת: שתי קבוצות קבועות (שונות 0) עם ממוצעים שונים. Welch אינו מוגדר שם (df=0), אבל התוצאה אינה "אין מידע":
   בבדיקת תמורות כל ערכי הקבוצה הראשונה שווים ושונים מכל ערכי השנייה רק ב-2 מתוך C(n1+n2, n1) חלוקות (הנצפית והמשתקפת). p שמרני. ── */
export function perfectSeparationP(n1: number, n2: number): number {
  if (!(n1 > 0) || !(n2 > 0)) return 1
  return Math.min(1, 2 * Math.exp(-lnChoose(n1 + n2, n1)))
}

/* ── t זוגי על הפרשים: p דו-צדדי + dz ── */
export function pairedT(diffs: number[]): { t: number; df: number; pTwoSided: number; dz: number; meanDiff: number } {
  const n = diffs.length
  const m = mean(diffs), s = sd(diffs)
  const t = m / ((s || 1e-12) / Math.sqrt(n))
  /* רשת ביטחון (כמו ב-welch): n<2 / t לא-סופי → p=1, dz=0 */
  if (!(n - 1 > 0) || !Number.isFinite(t)) return { t, df: Math.max(0, n - 1), pTwoSided: 1, dz: 0, meanDiff: m }
  return { t, df: n - 1, pTwoSided: tTwoSided(t, n - 1), dz: s > 0 ? m / s : 0, meanDiff: m }
}

/* ── בינומי: P(X ≥ k) מדויק, n,p קבועים ── */
function lnChoose(n: number, k: number): number {
  return lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1)
}
export function binomialUpperTail(k: number, n: number, p: number): number {
  if (k <= 0) return 1
  if (k > n) return 0
  if (p <= 0) return 0
  if (p >= 1) return 1
  let sum = 0
  for (let i = k; i <= n; i++) sum += Math.exp(lnChoose(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p))
  return Math.min(1, sum)
}
export function binomialLowerTail(k: number, n: number, p: number): number {
  /* P(X ≤ k) */
  return 1 - binomialUpperTail(k + 1, n, p)
}

/* פואסון-בינומי (הסתברות שונה לכל תצפית): קירוב נורמלי עם תיקון רציפות. upper = P(X ≥ k). */
export function poissonBinomialUpper(k: number, ps: number[]): number {
  const mu = ps.reduce((s, x) => s + x, 0)
  const v = ps.reduce((s, x) => s + x * (1 - x), 0)
  if (v <= 0) return k <= mu ? 1 : 0
  return 1 - normalCdf((k - 0.5 - mu) / Math.sqrt(v))
}
export function poissonBinomialLower(k: number, ps: number[]): number {
  const mu = ps.reduce((s, x) => s + x, 0)
  const v = ps.reduce((s, x) => s + x * (1 - x), 0)
  if (v <= 0) return k >= mu ? 1 : 0
  return normalCdf((k + 0.5 - mu) / Math.sqrt(v))
}

/* ── Benjamini-Hochberg: p מתוקנים (monotone), באותו סדר כמו הקלט ── */
export function benjaminiHochberg(ps: number[]): number[] {
  const m = ps.length
  if (m === 0) return []
  const order = ps.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p)
  const adj = new Array<number>(m)
  let prev = 1
  for (let r = m - 1; r >= 0; r--) {
    const q = Math.min(prev, (order[r].p * m) / (r + 1))
    adj[order[r].i] = Math.min(1, q)
    prev = q
  }
  return adj
}

/* סבירות פוסטריורית להשערה A מול B על סמך נתוני בינום (k הצלחות מתוך n), פריור שווה */
export function posteriorBinomial(k: number, n: number, pA: number, pB: number): number {
  const lA = k * Math.log(pA) + (n - k) * Math.log(1 - pA)
  const lB = k * Math.log(pB) + (n - k) * Math.log(1 - pB)
  const mx = Math.max(lA, lB)
  const a = Math.exp(lA - mx), b = Math.exp(lB - mx)
  return a / (a + b)
}
