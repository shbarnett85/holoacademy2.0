/* ──────────────────────────────────────────────────────────────────────────
   liveStatus — מצב תלמיד/ה ב"תצוגה חיה". pure; משותף לשרת (הספק האמיתי וההדגמה) ולבדיקות.
   כללים עובדתיים בלבד, מ-LIVE_RULES (analyticsConfig) — אין שיפוט:
     · finished — השלים/ה את השיעור.   · not_started — אין סשן.
     · inactive — אין שום פעימה/אירוע ב-inactiveMs.
     · gave_up — האתגר האחרון שהסתיים נסגר ב"ויתור" ואין התקדמות מאז.
     · stuck — stuckMistakes טעויות ברצף באותו אתגר פתוח, או stuckNoProgressMs בלי התקדמות (מעבר סצנה / סיום אתגר).
     · working — כל השאר.
   עדיפות: finished > inactive > gave_up > stuck > working (מי שלא פעיל אינו "נתקע" — אין לנו מידע חי עליו). */
import { LIVE_RULES } from './analyticsConfig'

export type LiveState = 'not_started' | 'working' | 'stuck' | 'gave_up' | 'inactive' | 'finished'

/* מה שנשמר בעמודה sessions.live (נכתב ע"י POST /api/sessions/:id/live) */
export interface LiveSnapshot {
  sceneId: string | null
  inPuzzle: boolean
  /* טעויות ברצף באתגר הפתוח (מתאפס בפעולה נכונה) */
  mistakes: number
  /* ISO — מתי הייתה ההתקדמות האחרונה: מעבר סצנה או סיום אתגר */
  progressAt: string | null
  lastChallenge: { sceneId: string; outcome: 'correct' | 'wrong' | 'timeout' | 'gave_up' | 'closed'; at: string } | null
}

export interface LiveInput {
  /* null = אין סשן */
  session: { startedAt: string | null; completedAt: string | null; lastSeenAt: string | null; live: LiveSnapshot | null } | null
  nowMs: number
}

export interface LiveResult { state: LiveState; mistakes?: number; noProgressMs?: number; inactiveMs?: number }

const ms = (iso: string | null | undefined): number => {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isNaN(t) ? NaN : t
}

export function liveStateOf(i: LiveInput): LiveResult {
  const s = i.session
  if (!s) return { state: 'not_started' }
  if (s.completedAt) return { state: 'finished' }
  /* הפעילות האחרונה: פעימה; ואם עוד לא הייתה (קליינט ישן / לפני הפעימה הראשונה) — תחילת הסשן */
  const lastSeen = [ms(s.lastSeenAt), ms(s.startedAt)].filter((x) => !Number.isNaN(x)).sort((a, b) => b - a)[0]
  if (lastSeen === undefined) return { state: 'inactive', inactiveMs: LIVE_RULES.inactiveMs }
  const idle = i.nowMs - lastSeen
  if (idle >= LIVE_RULES.inactiveMs) return { state: 'inactive', inactiveMs: idle }
  const live = s.live
  const progressAt = ms(live?.progressAt) || ms(s.startedAt)
  /* ויתור: האתגר האחרון נסגר בויתור, ומאז לא הייתה התקדמות (אירוע ההתקדמות האחרון הוא הוא) */
  if (live?.lastChallenge?.outcome === 'gave_up' && ms(live.lastChallenge.at) >= progressAt - 1000) return { state: 'gave_up' }
  if (live?.inPuzzle && live.mistakes >= LIVE_RULES.stuckMistakes) return { state: 'stuck', mistakes: live.mistakes }
  const sinceProgress = Number.isNaN(progressAt) ? NaN : i.nowMs - progressAt
  if (!Number.isNaN(sinceProgress) && sinceProgress >= LIVE_RULES.stuckNoProgressMs) return { state: 'stuck', noProgressMs: sinceProgress }
  return { state: 'working' }
}
