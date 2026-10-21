/* כשל בטעינת התצורה (GET /config) במעטפת האנליטיקה: מורה אמיתי נופל לתצוגה הקודמת עם הסבר ו"נסו שוב", כל השאר מקבלים בלוק שגיאה,
   ואין בקשות נוספות (אין לולאה) כל עוד לא לחצו "נסו שוב". מרנדרים את המעטפת בלי רשת — useV2 וההזדהות מוחלפים בתשובות קבועות. */
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ERR_ANALYSIS_WARMING, ERR_V2_GENERIC, ERR_V2_UNAUTHORIZED, V2_CONFIG_FALLBACK_TEXT } from '../../shared/lib/findingsNarrative'
import type { AnalyticsConfig } from '../../shared/types/analyticsV2'
import { V2Error } from './errors'
import type { V2State } from './v2api'

vi.mock('../creator/StudioTopBar', () => ({ default: () => null }))

const h = vi.hoisted(() => ({
  auth: { role: 'teacher' as string | null, isGuest: false, isSuperAdmin: false },
  config: null as unknown,
  paths: [] as (string | null)[],
}))
vi.mock('../../shared/hooks/useStaffAuth', () => ({ useStaffAuth: () => h.auth }))
vi.mock('./v2api', async (orig) => ({
  ...(await orig<typeof import('./v2api')>()),
  useV2: (path: string | null) => {
    h.paths.push(path)
    return path === '/config' ? h.config : { data: null, dataState: null, loading: false, error: null, reload: () => {} }
  },
}))

import AnalyticsV2App from './AnalyticsV2App'
import { L } from './labels'

const Legacy = ({ notice }: { backTo?: string; notice?: ReactNode }) => <div data-legacy>{notice}</div>
const failed = (status: number, message = ''): V2State<AnalyticsConfig> => ({ data: null, dataState: null, loading: false, error: new V2Error(status, message), reload: () => {} })
const render = (): string => renderToStaticMarkup(<MemoryRouter initialEntries={['/analytics']}><AnalyticsV2App Legacy={Legacy} /></MemoryRouter>)

beforeEach(() => {
  h.auth = { role: 'teacher', isGuest: false, isSuperAdmin: false }
  h.paths.length = 0
})

describe('מורה אמיתי: נופל לתצוגה הקודמת עם הסבר ו"נסו שוב"', () => {
  it.each([[503, ERR_ANALYSIS_WARMING], [0, ''], [500, ''], [429, ''], [502, '']])('סטטוס %s', (status, message) => {
    h.config = failed(status, message)
    const html = render()
    expect(html).toContain('data-legacy')
    expect(html).toContain('data-v2-fallback')
    expect(html).toContain(V2_CONFIG_FALLBACK_TEXT.notice)
    expect(html).toContain(L.retry)
    expect(html).not.toContain('data-v2-error')
  })

  it('401 (ההתחברות פגה): אין מה להציג בתצוגה הקודמת — הודעת השגיאה נשארת', () => {
    h.config = failed(401)
    const html = render()
    expect(html).not.toContain('data-legacy')
    expect(html).toContain('data-v2-error="401"')
    expect(html).toContain(ERR_V2_UNAUTHORIZED)
  })

  it('אין בקשות נוספות כשהתצורה נכשלה: רק /config, והרשימה (roster) לא נטענת — בלי לולאה', () => {
    h.config = failed(503, ERR_ANALYSIS_WARMING)
    render()
    expect(h.paths.filter((p) => p !== null)).toEqual(['/config'])
  })

  it('הצלחה אחרי ניסיון חוזר: התצורה תקינה — אין הסבר ואין תצוגה קודמת (רק מתג כיבוי מחזיר אותה, בלי הסבר)', () => {
    h.config = { data: { enabled: false, lens: 'homeroom', availableLenses: ['homeroom'], subjects: [], classes: [], dataNotice: null, curriculumNotice: null }, dataState: 'ok', loading: false, error: null, reload: () => {} }
    const html = render()
    expect(html).toContain('data-legacy')
    expect(html).not.toContain('data-v2-fallback')
  })
})

describe('אורח, מנהל/ת ומנהל-על: בלוק שגיאה, בלי תצוגה קודמת', () => {
  it.each([
    ['מנהל', { role: 'admin', isGuest: false, isSuperAdmin: false }],
    ['מנהל עירוני', { role: 'municipal_admin', isGuest: false, isSuperAdmin: false }],
    ['מנהל-על', { role: 'super_admin', isGuest: false, isSuperAdmin: true }],
    ['אורח', { role: 'teacher', isGuest: true, isSuperAdmin: false }],
  ])('%s', (_name, auth) => {
    h.auth = auth
    h.config = failed(503, ERR_ANALYSIS_WARMING)
    const html = render()
    expect(html).not.toContain('data-legacy')
    expect(html).not.toContain('data-v2-fallback')
    expect(html).toContain('data-v2-error="503"')
    expect(html).toContain(ERR_ANALYSIS_WARMING)
    expect(html).toContain(L.retry)
  })

  it('שגיאה כללית (500): ההודעה הקבועה ולא טקסט טכני', () => {
    h.auth = { role: 'admin', isGuest: false, isSuperAdmin: false }
    h.config = failed(500, 'ECONNRESET')
    const html = render()
    expect(html).toContain(ERR_V2_GENERIC)
    expect(html).not.toContain('ECONNRESET')
  })
})

describe('בזמן טעינה', () => {
  it('לא מציגים את התצוגה הקודמת לפני שיש תשובה', () => {
    h.config = { data: null, dataState: null, loading: true, error: null, reload: () => {} }
    const html = render()
    expect(html).not.toContain('data-legacy')
    expect(html).toContain(L.loading)
  })
})
