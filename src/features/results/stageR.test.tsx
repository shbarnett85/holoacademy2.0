import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { FOCUSED_LESSON_WHOLE_CLASS_NOTE, howWeCalcLiveLines, lessonStateLabel, LIVE_STATUS_TEXT, OVERVIEW_TEXT } from '../../shared/lib/findingsNarrative'
import { LIVE_RULES } from '../../shared/lib/analyticsConfig'
import type { ClassSubmissionView, CommonErrorRow, LiveView, Overview, StudentChip, SubmissionHead } from '../../shared/types/resultsV1'
import { levelOfGradeLabel, startFocusedLesson } from './focusedLesson'
import { useCreatorStore } from '../creator/creatorStore'
import Glance from './Glance'
import { LiveBody } from './LivePage'
import { OverviewTable } from './OverviewScreen'
import { UI } from './text'

/* שלב R — תצוגות הלקוח מול חוזה resultsV1: "מי צריך תשומת לב", הטעות הנפוצה ושאלה לדיון, התצוגה החיה, טבלת המנהל, ותוויות המצב */
const head = (o: Partial<SubmissionHead> = {}): SubmissionHead => ({
  id: 'a1', questId: 'q1', title: 'מסע השברים', thumbUrl: null, subject: null, classId: 'c1', className: 'ו׳2', sentAt: '2026-10-20T08:00:00Z',
  counts: { total: 6, completed: 4, inProgress: 1, notStarted: 1 }, state: 'open', dueAt: '2026-11-01T21:59:00Z', ...o,
})
const chip = (id: string, name: string, o: Partial<StudentChip> = {}): StudentChip => ({ id, name, status: 'completed', attention: false, attentionReasons: [], ...o })
const err = (o: Partial<CommonErrorRow> = {}): CommonErrorRow => ({
  id: 's1:0:t:x', title: 'x', description: '', studentsCount: 7, studentsExposed: 20, linkedQuest: null, sentence: '7 תלמידים בחרו ״⅖״',
  sceneId: 's1', itemIndex: 0, challengeTitle: 'גשר', question: 'כמה זה ½ + ⅓ ?', wrongText: '⅖', correctText: '⅚', studentIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], misconceptionId: null, ...o,
})
function view(o: { roster?: ClassSubmissionView['roster']; errors?: CommonErrorRow[] } = {}): ClassSubmissionView {
  return {
    head: head(), summary: 'משפט.', detailAvailableFrom: null, hasAnswerDetail: true,
    roster: o.roster ?? { completed: [], inProgress: [], notStarted: [] },
    successBands: { basis: 4, low: 0, mid: 1, high: 3, enough: true }, challenges: [], commonErrors: o.errors ?? [], objectives: [], review: { weakCount: 0 }, howWeCalculated: [],
  }
}
const noop = (): void => undefined
const r = (el: React.ReactElement): string => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>)

describe('Glance — "מי צריך תשומת לב, ולמה" והטעות הנפוצה', () => {
  const att = (id: string, name: string, reason: string): StudentChip => chip(id, name, { attention: true, attentionReasons: ['low_success'], reasonText: reason })

  it('שם + הסיבה במילים ליד כל סימון; לחיצה פותחת את התלמיד/ה (כפתור 44px+)', () => {
    const h = r(<Glance view={view({ roster: { completed: [att('s1', 'תמר בראון', 'הצליח/ה ב-1 מתוך 6 אתגרים (פחות מ-40%)')], inProgress: [], notStarted: [] } })} onOpenStudent={noop} />)
    expect(h).toContain('data-attention-list')
    expect(h).toContain(UI.attentionTitle)
    expect(h).toContain('תמר בראון')
    expect(h).toContain('הצליח/ה ב-1 מתוך 6 אתגרים (פחות מ-40%)')
    expect(h).toContain('data-attention-student="s1"')
  })

  it('בלי תלמידים לתשומת לב ובלי טעות נפוצה: אין שורת כרטיסים', () => {
    const h = r(<Glance view={view()} onOpenStudent={noop} onDiscuss={noop} onActions={noop} />)
    expect(h).not.toContain('data-glance-top')
  })

  it('רק ' + 3 + ' שמות; השאר מסומנים ברשימת התלמידים ("ועוד N")', () => {
    const many = ['א', 'ב', 'ג', 'ד', 'ה'].map((n, i) => att(`s${i}`, `תלמיד ${n}`, 'ויתר/ה על 2 אתגרים'))
    const h = r(<Glance view={view({ roster: { completed: many, inProgress: [], notStarted: [] } })} onOpenStudent={noop} />)
    expect((h.match(/data-attention-student=/g) ?? []).length).toBe(3)
    expect(h).toContain(UI.attentionMore(2))
  })

  it('הטעות הנפוצה ביותר + "שאלה לדיון בכיתה" — כבר בטאב הראשון (שתי לחיצות מהרשימה)', () => {
    const h = r(<Glance view={view({ errors: [err(), err({ id: 'other' })] })} onOpenStudent={noop} onDiscuss={noop} onActions={noop} />)
    expect(h).toContain('data-glance-mistake')
    expect(h).toContain('7 תלמידים בחרו ״⅖״')
    expect(h).toContain(UI.discussionButton)
    expect(h).toContain('data-discuss')
  })
})

describe('LiveBody — תצוגה חיה', () => {
  const tile = (studentId: string, name: string, status: LiveView['tiles'][number]['status'], o: Partial<LiveView['tiles'][number]> = {}): LiveView['tiles'][number] =>
    ({ studentId, name, status, sceneOrder: null, sceneTitle: null, reasonText: null, ...o })
  const live = (o: Partial<LiveView> = {}): LiveView => ({
    head: head({ state: 'active_now' }), polledAt: '2026-10-26T10:03:20Z', refreshMs: LIVE_RULES.refreshMs, summary: '5 מתוך 6 משחקים עכשיו. אחד נתקע.',
    counts: { not_started: 1, working: 3, stuck: 1, gave_up: 0, inactive: 0, finished: 1 },
    tiles: [
      tile('a', 'נתקע א', 'stuck', { sceneOrder: 3, sceneTitle: 'הגשר', reasonText: '3 טעויות ברצף באותו אתגר' }),
      tile('b', 'משחק ב', 'working', { sceneOrder: 2, sceneTitle: 'החצר' }),
      tile('c', 'סיים ג', 'finished'),
      tile('d', 'טרם ד', 'not_started'),
    ],
    available: true, ...o,
  })

  it('אריח לכל תלמיד/ה: שם, מצב במילים (ולא בצבע בלבד: אייקון), סצנה, וסיבה — והמקרא מכיל את כל המצבים עם מספרים', () => {
    const h = r(<LiveBody v={live()} />)
    for (const s of ['a', 'b', 'c', 'd']) expect(h).toContain(`data-live-tile="${s}"`)
    expect(h).toContain(LIVE_STATUS_TEXT.stuck)
    expect(h).toContain(UI.liveScene(3, 'הגשר'))
    expect(h).toContain('3 טעויות ברצף באותו אתגר')
    expect(h).not.toContain(UI.liveScene(0, ''))
    for (const w of Object.values(LIVE_STATUS_TEXT)) expect(h).toContain(w)
    expect(h).toContain('data-live-legend')
    expect(h).toContain(UI.liveRefreshing(15))
    expect(h).toMatch(/<svg[^>]*aria-hidden="true"/)
  })

  it('שיעור שאינו פעיל: הערה במילים; נתונים חיים לא זמינים: הערה אחרת', () => {
    expect(r(<LiveBody v={live({ head: head({ state: 'open' }) })} />)).toContain(UI.liveNotActive)
    expect(r(<LiveBody v={live()} />)).not.toContain('data-live-inactive')
    expect(r(<LiveBody v={live({ available: false })} />)).toContain(UI.liveUnavailable)
  })

  it('"איך חישבנו?": הכללים מהתצורה', () => {
    const t = howWeCalcLiveLines().join(' ')
    expect(t).toContain(`${LIVE_RULES.stuckMistakes} טעויות`)
    expect(t).toContain('3 דקות')
    expect(t).toContain('2 דקות')
    expect(t).toContain(`${LIVE_RULES.refreshMs / 1000} שניות`)
  })
})

describe('OverviewTable — טבלת המנהל/ת', () => {
  const o = (): Overview => ({
    periodLabel: 'אוקטובר 2026', sentence: 'נשלחו שיעורים ב-1 מקצוע, בשכבה אחת.',
    grades: [{ id: 'g6', label: 'שכבה ו׳' }, { id: 'g7', label: 'שכבה ז׳' }],
    subjects: [{ code: 'math', nameHe: 'מתמטיקה' }, { code: 'science', nameHe: 'מדעים' }],
    cells: [
      { gradeId: 'g6', subject: 'math', status: 'shown', lessons: 2, participated: 40, total: 50 },
      { gradeId: 'g6', subject: 'science', status: 'hidden' },
      { gradeId: 'g7', subject: 'math', status: 'empty' },
    ],
    hasHidden: true, howWeCalculated: [],
  })

  it('תא מוצג: שיעורים + "X מתוך Y השתתפו" ואחוז; מוסתר: מנעול + מילים; ריק: "לא נשלחו שיעורים"', () => {
    const h = renderToStaticMarkup(<OverviewTable o={o()} />)
    expect(h).toContain(OVERVIEW_TEXT.lessonsCell(2))
    expect(h).toContain(OVERVIEW_TEXT.participationCell(40, 50))
    expect(h).toContain(OVERVIEW_TEXT.hiddenCell)
    expect(h).toContain(OVERVIEW_TEXT.noLessons)
    expect(h).toContain('data-cell="hidden"')
    /* תא שלא נשלח בו כלום ותא שחסר בנתונים נראים אותו דבר: "לא נשלחו שיעורים" */
    expect((h.match(/data-cell="empty"/g) ?? []).length).toBe(2)
  })

  it('כותרות: שכבה בכל שורה, מקצוע בכל עמודה (th עם scope), וכיתוב הטבלה כולל את התקופה', () => {
    const h = renderToStaticMarkup(<OverviewTable o={o()} />)
    expect(h).toContain('scope="row"')
    expect(h).toContain('scope="col"')
    expect(h).toContain('שכבה ו׳')
    expect(h).toContain('אוקטובר 2026')
  })
})

describe('תוויות מצב וקבועים', () => {
  it('lessonStateLabel: "פעיל עכשיו" · "פתוח עד 1.11" (שעון ישראל) · "הסתיים"; בלי מועד — "פתוח להגשה"', () => {
    expect(lessonStateLabel('active_now')).toBe('פעיל עכשיו')
    expect(lessonStateLabel('open', '2026-10-31T22:30:00Z')).toBe('פתוח עד 1.11')
    expect(lessonStateLabel('open', '2026-11-01T21:59:00Z')).toBe('פתוח עד 1.11')
    expect(lessonStateLabel('ended', '2026-10-17T20:59:00Z')).toBe('הסתיים')
    expect(lessonStateLabel('open', null)).toBe('פתוח להגשה')
  })
  it('רמת היצירה של שיעור ממוקד = שכבה + 4 (כיתה ו׳ = 10), בתחום 1–20; בלי שכבה — לא משנים', () => {
    expect(levelOfGradeLabel('ו׳2')).toBe(10)
    expect(levelOfGradeLabel('ג׳1')).toBe(7)
    expect(levelOfGradeLabel(null)).toBeNull()
    expect(levelOfGradeLabel('xyz')).toBeNull()
  })
  it('startFocusedLesson ממלא את טופס היצירה: נושא, מקצוע, שכבה, תיאור הטעות (בלי שמות) וסימון התפיסה', () => {
    useCreatorStore.getState().reset()
    startFocusedLesson(err({ misconceptionId: 'mis-1', title: 'בלבול בין מונה למכנה' }), head({ subject: { code: 'math', nameHe: 'מתמטיקה' }, gradeLabel: 'ו׳2' }))
    const s = useCreatorStore.getState()
    expect(s.title).toBe('שיעור ממוקד: גשר')
    expect(s.subject).toBe('math')
    expect([s.writingLevel, s.puzzleDifficulty]).toEqual([10, 10])
    expect(s.curriculum).toContain('7 תלמידים בחרו ״⅖״')
    expect(s.curriculum).toContain('כמה זה ½ + ⅓ ?')
    expect(s.curriculum).toContain('בלבול בין מונה למכנה')
    expect(s.focusedMisconceptionId).toBe('mis-1')
    expect(s.focusedNote).toBe(FOCUSED_LESSON_WHOLE_CLASS_NOTE)
    /* תיאור הטעות לא מכיל מזהי תלמידים */
    expect(['a', 'b', 'c', 'd', 'e', 'f', 'g'].some((id) => s.curriculum.includes('"' + id + '"'))).toBe(false)
    useCreatorStore.getState().reset()
    expect(useCreatorStore.getState().focusedMisconceptionId).toBeNull()
  })
  it('ההערה על שליחה לכיתה שלמה גלויה ואומרת את האמת', () => {
    expect(FOCUSED_LESSON_WHOLE_CLASS_NOTE).toContain('כיתה שלמה')
    expect(UI.focusedTitle('גשר')).toBe('שיעור ממוקד: גשר')
  })
})
