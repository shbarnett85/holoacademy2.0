/* ──────────────────────────────────────────────────────────────────────────
   results/live — "תצוגה חיה" של שיעור פעיל. pure — שני הספקים (אמיתי / הדגמה) מזינים אותה.
   אריח לכל תלמיד/ה: הסצנה שהוא/היא בה עכשיו + מצב (משחק/ת, נתקע/ה, ויתר/ה, לא פעיל/ה, סיים/ה, לא התחיל/ה). הכללים ב-LIVE_RULES, ההכרעה ב-liveStateOf.
   שמות מוצגים (אין מצב הקרנה); הרענון הוא polling של הקליינט כל LIVE_RULES.refreshMs.
   ────────────────────────────────────────────────────────────────────────── */
import type { LiveStatus, LiveTile, LiveView, SubmissionHead } from '../../../../src/shared/types/resultsV1.js'
import { LIVE_RULES } from '../../../../src/shared/lib/analyticsConfig.js'
import { liveReasonText, liveSummary, type LiveStatusKey } from '../../../../src/shared/lib/findingsNarrative.js'
import { liveStateOf, type LiveSnapshot } from '../../../../src/shared/lib/liveStatus.js'
import { slideIndexOf, type CoreStudent } from './core.js'

export interface LiveSessionRow {
  studentId: string
  startedAt: string | null
  completedAt: string | null
  lastSeenAt: string | null
  live: LiveSnapshot | null
}

export interface LiveInput {
  head: SubmissionHead
  students: readonly CoreStudent[]
  /* ההרצה האחרונה (startedAt) של כל תלמיד/ה — אם יש */
  sessions: readonly LiveSessionRow[]
  gameData: unknown
  nowMs: number
  /* false = אין עדיין נתונים חיים (עמודות חסרות); המסך אומר זאת במילים */
  available: boolean
}

/* סדר ההצגה: מי שצריך תשומת לב קודם (נתקע/ויתר), אחר כך משחקים, לא פעילים, לא התחילו, סיימו; בתוך קבוצה — א-ב */
const ORDER: Record<LiveStatus, number> = { stuck: 0, gave_up: 1, working: 2, inactive: 3, not_started: 4, finished: 5 }

export function buildLiveView(i: LiveInput): LiveView {
  const slides = slideIndexOf(i.gameData)
  const sessionOf = new Map<string, LiveSessionRow>()
  for (const s of i.sessions) {
    const cur = sessionOf.get(s.studentId)
    if (!cur || (s.startedAt ?? '') > (cur.startedAt ?? '')) sessionOf.set(s.studentId, s)
  }
  const counts: Record<LiveStatusKey, number> = { not_started: 0, working: 0, stuck: 0, gave_up: 0, inactive: 0, finished: 0 }
  const tiles: LiveTile[] = i.students.map((st) => {
    const ses = sessionOf.get(st.id) ?? null
    const r = liveStateOf({ session: ses ? { startedAt: ses.startedAt, completedAt: ses.completedAt, lastSeenAt: ses.lastSeenAt, live: ses.live } : null, nowMs: i.nowMs })
    counts[r.state]++
    const showScene = r.state !== 'not_started' && r.state !== 'finished'
    const scene = showScene && ses?.live?.sceneId ? slides.get(ses.live.sceneId) ?? null : null
    return {
      studentId: st.id, name: st.name, status: r.state,
      sceneOrder: scene?.order ?? null, sceneTitle: scene?.title ?? null,
      reasonText: liveReasonText(r.state, {
        mistakes: r.mistakes,
        noProgressMin: r.noProgressMs !== undefined ? Math.max(1, Math.round(r.noProgressMs / 60_000)) : undefined,
        inactiveMin: r.inactiveMs !== undefined ? Math.max(1, Math.round(r.inactiveMs / 60_000)) : undefined,
      }),
    }
  })
  tiles.sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name, 'he') || (a.studentId < b.studentId ? -1 : 1))
  return {
    head: i.head,
    polledAt: new Date(i.nowMs).toISOString(),
    refreshMs: LIVE_RULES.refreshMs,
    summary: liveSummary(counts, i.students.length),
    counts,
    tiles,
    available: i.available,
  }
}
