import { createHash } from 'node:crypto'
import type { Request } from 'express'
import { supabaseAdmin } from './supabase.js'
import { AppError } from '../middleware/errors.js'
import { error as logError, warn } from './log.js'

/* ── שומרי נקודת-הקצה של היצירה ──────────────────────────────────────────────
   היצירה פתוחה לכולם — ההגנה היא מפני ניצול אוטומטי, לא מפני מורים:
   1) Cloudflare Turnstile במצב בלתי-נראה (מאומת בשרת לפני קריאת ה-AI) —
      פעיל רק כש-TURNSTILE_SECRET מוגדר; בלי מפתח — מדלגים (dev).
   2) הגבלת קצב: עד GEN_RATE_LIMIT יצירות בשעה למקור (זהות+IP) — מגבלת
      מהירות, לא כמות; חריגה מחזירה הודעה ידידותית.
   3) יצירה פעילה אחת בכל רגע לכל זהות (single-flight).
   4) כל יצירה נרשמת ל-gen_log (ניטור עלויות) + התראה בחציית סף יומי. */

export const GEN_RATE_LIMIT = 20 /* לשעה, למקור אחד */
export const EST_COST_AGOROT = 120 /* עלות משוערת ליצירה (AI + תמונות) */
const FLIGHT_TIMEOUT_MS = 6 * 60_000

export function clientIp(req: Request): string {
  const fwd = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
  return fwd || req.socket.remoteAddress || 'unknown'
}
export function ipHash(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 16)
}

/* ── Turnstile — אימות אנושי בלתי-נראה ── */
export async function verifyTurnstile(token: string | undefined, ip: string): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET?.trim()
  if (!secret) return /* לא הוגדר — מדלגים (סביבת פיתוח / עד הפעלת המפתחות) */
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token ?? '', remoteip: ip }),
    })
    const body = (await res.json()) as { success?: boolean; 'error-codes'?: string[] }
    if (!body.success) {
      warn('[genGuard] turnstile נכשל:', (body['error-codes'] ?? []).join(','))
      throw new AppError(403, 'לא הצלחנו לאמת שהבקשה אנושית — רעננו את הדף ונסו שוב')
    }
  } catch (err) {
    if (err instanceof AppError) throw err
    /* תקלת רשת מול Cloudflare — לא חוסמים בני אדם על תקלה של צד-שלישי */
    warn('[genGuard] turnstile לא זמין — ממשיכים:', err instanceof Error ? err.message : String(err))
  }
}

/* ── הגבלת קצב (בזיכרון — שרת יחיד) ── */
const rateMap = new Map<string, number[]>()
export function checkRateLimit(key: string): void {
  const now = Date.now()
  const arr = (rateMap.get(key) ?? []).filter((t) => now - t < 3600_000)
  if (arr.length >= GEN_RATE_LIMIT) {
    rateMap.set(key, arr)
    throw new AppError(429, 'יצרתם הרבה הדמיות ברצף — נסו שוב בעוד כמה דקות ⏳')
  }
  arr.push(now)
  rateMap.set(key, arr)
}

/* ── יצירה אחת פעילה לכל זהות ── */
const inFlight = new Map<string, number>()
export function acquireFlight(key: string): void {
  const started = inFlight.get(key)
  if (started && Date.now() - started < FLIGHT_TIMEOUT_MS) {
    throw new AppError(429, 'יצירה אחת כבר רצה עבורך ברקע — המתינו לסיומה לפני שמתחילים חדשה')
  }
  inFlight.set(key, Date.now())
}
export function releaseFlight(key: string): void {
  inFlight.delete(key)
}

/* ── ניטור עלויות: לוג + התראת סף יומי ── */
let alertedFor = '' /* תאריך שכבר נשלחה עליו התראה (בזיכרון) */

export async function logGeneration(entry: {
  event?: 'generate' | 'claim'
  actorType: 'anon' | 'staff' | 'guest'
  actorId: string
  ip?: string
  questId?: string | null
  costAgorot?: number
}): Promise<void> {
  try {
    await supabaseAdmin.from('gen_log').insert({
      event: entry.event ?? 'generate',
      actor_type: entry.actorType,
      actor_id: entry.actorId,
      ip_hash: entry.ip ? ipHash(entry.ip) : null,
      quest_id: entry.questId ?? null,
      est_cost_agorot: entry.costAgorot ?? (entry.event === 'claim' ? 0 : EST_COST_AGOROT),
    })
    if ((entry.event ?? 'generate') === 'generate') void checkDailyCostAlert()
  } catch (err) {
    logError('[genGuard] רישום gen_log נכשל:', err instanceof Error ? err.message : String(err))
  }
}

async function checkDailyCostAlert(): Promise<void> {
  const threshold = Number(process.env.COST_ALERT_THRESHOLD_AGOROT ?? 0)
  if (!threshold) return
  const today = new Date().toISOString().slice(0, 10)
  if (alertedFor === today) return
  const { data } = await supabaseAdmin
    .from('gen_log')
    .select('est_cost_agorot')
    .eq('event', 'generate')
    .gte('created_at', today + 'T00:00:00Z')
  const total = (data ?? []).reduce((a, r) => a + ((r as { est_cost_agorot: number }).est_cost_agorot ?? 0), 0)
  if (total < threshold) return
  alertedFor = today
  const msg = `HoloAcademy: עלות היצירה היומית חצתה את הסף — ₪${(total / 100).toFixed(2)} (סף: ₪${(threshold / 100).toFixed(2)})`
  /* ערוץ 1: מייל דרך Resend (אם הוגדר); ערוץ 2: webhook גנרי (Slack/Zapier→מייל) */
  const email = process.env.COST_ALERT_EMAIL?.trim()
  const resend = process.env.RESEND_API_KEY?.trim()
  if (email && resend) {
    void fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resend}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'alerts@holoacademy.ai', to: [email], subject: 'התראת עלות יצירה — HoloAcademy', text: msg }),
    }).catch(() => {})
  }
  const hook = process.env.COST_ALERT_WEBHOOK?.trim()
  if (hook) {
    void fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: msg }) }).catch(() => {})
  }
  if (!hook && !(email && resend)) warn('[genGuard] סף העלות נחצה אך לא הוגדר ערוץ התראה:', msg)
}
