import { describe, expect, it } from 'vitest'
import { LIVE_RULES } from './analyticsConfig'
import { liveStateOf, type LiveSnapshot } from './liveStatus'

const NOW = Date.parse('2026-10-26T10:00:00.000Z')
const ago = (msAgo: number): string => new Date(NOW - msAgo).toISOString()
const snap = (o: Partial<LiveSnapshot> = {}): LiveSnapshot => ({ sceneId: 's2', inPuzzle: false, mistakes: 0, progressAt: ago(20_000), lastChallenge: null, ...o })
const sess = (o: { startedAt?: string | null; completedAt?: string | null; lastSeenAt?: string | null; live?: LiveSnapshot | null } = {}) => ({
  startedAt: ago(10 * 60_000), completedAt: null, lastSeenAt: ago(10_000), live: snap(), ...o,
})

describe('liveStateOf — כללים עובדתיים בלבד', () => {
  it('אין סשן → לא התחיל; סשן שהושלם → סיים (גם בלי פעימות)', () => {
    expect(liveStateOf({ session: null, nowMs: NOW }).state).toBe('not_started')
    expect(liveStateOf({ session: sess({ completedAt: ago(1000), lastSeenAt: ago(60 * 60_000) }), nowMs: NOW }).state).toBe('finished')
  })

  it('פעיל ומתקדם → working', () => {
    expect(liveStateOf({ session: sess(), nowMs: NOW }).state).toBe('working')
  })

  it(`נתקע: ${LIVE_RULES.stuckMistakes} טעויות ברצף באתגר הפתוח (לא פחות)`, () => {
    expect(liveStateOf({ session: sess({ live: snap({ inPuzzle: true, mistakes: LIVE_RULES.stuckMistakes - 1 }) }), nowMs: NOW }).state).toBe('working')
    const r = liveStateOf({ session: sess({ live: snap({ inPuzzle: true, mistakes: LIVE_RULES.stuckMistakes }) }), nowMs: NOW })
    expect(r).toEqual({ state: 'stuck', mistakes: LIVE_RULES.stuckMistakes })
    /* טעויות שנשארו מאתגר שנסגר (inPuzzle=false) לא נחשבות */
    expect(liveStateOf({ session: sess({ live: snap({ inPuzzle: false, mistakes: 5 }) }), nowMs: NOW }).state).toBe('working')
  })

  it('נתקע: 3 דקות בלי התקדמות (גם בלי טעויות); קצת פחות — לא', () => {
    const under = liveStateOf({ session: sess({ live: snap({ progressAt: ago(LIVE_RULES.stuckNoProgressMs - 1000) }) }), nowMs: NOW })
    expect(under.state).toBe('working')
    const over = liveStateOf({ session: sess({ live: snap({ progressAt: ago(LIVE_RULES.stuckNoProgressMs) }) }), nowMs: NOW })
    expect(over.state).toBe('stuck')
    expect(over.noProgressMs).toBe(LIVE_RULES.stuckNoProgressMs)
  })

  it('לא פעיל: 2 דקות בלי פעימה/אירוע; גובר על "נתקע" (אין מידע חי)', () => {
    expect(liveStateOf({ session: sess({ lastSeenAt: ago(LIVE_RULES.inactiveMs - 1000) }), nowMs: NOW }).state).toBe('working')
    expect(liveStateOf({ session: sess({ lastSeenAt: ago(LIVE_RULES.inactiveMs) }), nowMs: NOW }).state).toBe('inactive')
    expect(liveStateOf({ session: sess({ lastSeenAt: ago(5 * 60_000), live: snap({ inPuzzle: true, mistakes: 9 }) }), nowMs: NOW }).state).toBe('inactive')
  })

  it('ויתר: האתגר האחרון נסגר בויתור ואין התקדמות מאז; התקדמות אחריו מבטלת', () => {
    const gaveUp = snap({ progressAt: ago(15_000), lastChallenge: { sceneId: 's2', outcome: 'gave_up', at: ago(15_000) } })
    expect(liveStateOf({ session: sess({ live: gaveUp }), nowMs: NOW }).state).toBe('gave_up')
    const moved = snap({ progressAt: ago(5_000), lastChallenge: { sceneId: 's2', outcome: 'gave_up', at: ago(15_000) } })
    expect(liveStateOf({ session: sess({ live: moved }), nowMs: NOW }).state).toBe('working')
  })

  it('קליינט ישן / לפני הפעימה הראשונה: אין live ואין lastSeen — לפי תחילת הסשן', () => {
    expect(liveStateOf({ session: sess({ lastSeenAt: null, live: null, startedAt: ago(30_000) }), nowMs: NOW }).state).toBe('working')
    expect(liveStateOf({ session: sess({ lastSeenAt: null, live: null, startedAt: ago(10 * 60_000) }), nowMs: NOW }).state).toBe('inactive')
  })
})
