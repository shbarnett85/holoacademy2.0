import { describe, expect, it } from 'vitest'
import type { SubmissionHead } from '../../../../src/shared/types/resultsV1.js'
import { LIVE_RULES } from '../../../../src/shared/lib/analyticsConfig.js'
import { buildLiveView, type LiveSessionRow } from './live.js'

const NOW = Date.parse('2026-10-26T10:00:00Z')
const ago = (ms: number): string => new Date(NOW - ms).toISOString()
const head = { id: 'h' } as unknown as SubmissionHead
const GAME = { scenes: [{ id: 's0', title: 'פתיחה' }, { id: 's1', title: 'הגשר' }, { id: 's2', title: 'השער' }] }
const students = [{ id: 'a', name: 'אבי' }, { id: 'b', name: 'בני' }, { id: 'c', name: 'גלית' }, { id: 'd', name: 'דנה' }, { id: 'e', name: 'הדס' }]
const snap = (o = {}) => ({ sceneId: 's1', inPuzzle: false, mistakes: 0, progressAt: ago(10_000), lastChallenge: null, ...o })
const row = (id: string, o: Partial<LiveSessionRow> = {}): LiveSessionRow => ({ studentId: id, startedAt: ago(5 * 60_000), completedAt: null, lastSeenAt: ago(5_000), live: snap(), ...o })
const view = (sessions: LiveSessionRow[], extra = {}) => buildLiveView({ head, students, sessions, gameData: GAME, nowMs: NOW, available: true, ...extra })

describe('buildLiveView', () => {
  it('מיון: נתקע/ה → ויתר/ה → משחק/ת → לא פעיל/ה → לא התחיל/ה → סיים/ה; בתוך קבוצה א-ב', () => {
    const v = view([
      row('a', { completedAt: ago(1000) }),
      row('b', { live: snap({ inPuzzle: true, mistakes: LIVE_RULES.stuckMistakes }) }),
      row('c', { lastSeenAt: ago(LIVE_RULES.inactiveMs + 1000) }),
      row('d', { live: snap({ lastChallenge: { sceneId: 's1', outcome: 'gave_up', at: ago(10_000) } }) }),
    ])
    expect(v.tiles.map((t) => [t.name, t.status])).toEqual([['בני', 'stuck'], ['דנה', 'gave_up'], ['גלית', 'inactive'], ['הדס', 'not_started'], ['אבי', 'finished']])
    expect(v.counts).toEqual({ not_started: 1, working: 0, stuck: 1, gave_up: 1, inactive: 1, finished: 1 })
  })

  it('סצנה: מספרה בשיעור ושמה; מי שסיים/ה או לא התחיל/ה — בלי סצנה; לא מזהה סצנה שאינה בשיעור', () => {
    const v = view([row('a', { live: snap({ sceneId: 's2' }) }), row('b', { live: snap({ sceneId: 'gone' }) }), row('c', { completedAt: ago(1000), live: snap({ sceneId: 's1' }) })])
    const by = Object.fromEntries(v.tiles.map((t) => [t.studentId, t]))
    expect(by.a).toMatchObject({ status: 'working', sceneOrder: 3, sceneTitle: 'השער', reasonText: null })
    expect(by.b).toMatchObject({ sceneOrder: null, sceneTitle: null })
    expect(by.c).toMatchObject({ status: 'finished', sceneOrder: null })
    expect(by.e).toMatchObject({ status: 'not_started', sceneOrder: null, reasonText: null })
  })

  it('הסיבה במילים: נתקע/ה בטעויות, נתקע/ה בלי התקדמות (בדקות), לא פעיל/ה (בדקות)', () => {
    const v = view([
      row('a', { live: snap({ inPuzzle: true, mistakes: 4 }) }),
      row('b', { live: snap({ progressAt: ago(LIVE_RULES.stuckNoProgressMs + 30_000) }) }),
      row('c', { lastSeenAt: ago(LIVE_RULES.inactiveMs + 60_000) }),
    ])
    const by = Object.fromEntries(v.tiles.map((t) => [t.studentId, t.reasonText]))
    expect(by.a).toBe('4 טעויות ברצף באותו אתגר')
    expect(by.b).toBe('4 דקות בלי התקדמות')
    expect(by.c).toBe('3 דקות בלי שום פעולה')
  })

  it('ההרצה האחרונה לפי startedAt; קליינט ישן (בלי live) — לפי תחילת הסשן; metadata של המסך', () => {
    const v = view([row('a', { startedAt: ago(40 * 60_000), completedAt: ago(30 * 60_000) }), row('a', { startedAt: ago(60_000), lastSeenAt: null, live: null })])
    expect(v.tiles.find((t) => t.studentId === 'a')!.status).toBe('working')
    expect(v.refreshMs).toBe(LIVE_RULES.refreshMs)
    expect(v.polledAt).toBe(new Date(NOW).toISOString())
    expect(view([], { available: false }).available).toBe(false)
  })
})
