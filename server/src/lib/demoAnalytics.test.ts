import { describe, it, expect } from 'vitest'
import { demoAssignmentsList, demoAssignmentDashboard, demoStudentsLens, demoStudentDetail, demoTrends, demoRoster, DEMO_CLASS } from './demoAnalytics.js'

/* מנרמל תגובה: מחליף כל ISO-date ב-'DATE' — כך משווים ערכים בלבד */
const stripDates = (o: unknown): unknown => JSON.parse(JSON.stringify(o).replace(/"\d{4}-\d{2}-\d{2}T[^"]+"/g, '"DATE"'))

const NOW = new Date(2026, 8, 11, 15, 30) /* תאריך ייחוס קבוע לבדיקה */
const PLUS_10Y = new Date(2036, 8, 11, 15, 30)
const PLUS_1Y = new Date(2027, 8, 11, 15, 30)


describe('demoAnalytics — דטרמיניזם מוחלט', () => {
  it('שתי קריאות עם אותו זמן — תגובה זהה ביט-ביט', () => {
    expect(demoAssignmentsList(NOW)).toEqual(demoAssignmentsList(NOW))
    expect(demoAssignmentDashboard('demo-a1', NOW)).toEqual(demoAssignmentDashboard('demo-a1', NOW))
    expect(demoStudentsLens(NOW)).toEqual(demoStudentsLens(NOW))
    expect(demoStudentDetail('demo-s2', NOW)).toEqual(demoStudentDetail('demo-s2', NOW))
  })
})

describe('demoAnalytics — בדיקת הזמן: הערכים זהים בעוד שנה ובעוד עשור', () => {
  it('רשימת השיעורים: אותם ערכים בדיוק, רק התאריכים זזים', () => {
    expect(stripDates(demoAssignmentsList(PLUS_10Y))).toEqual(stripDates(demoAssignmentsList(NOW)))
    expect(stripDates(demoAssignmentsList(PLUS_1Y))).toEqual(stripDates(demoAssignmentsList(NOW)))
  })
  it('דשבורד מטלה + עדשת תלמידים + drill-down: זהים עד תאריך', () => {
    for (const [a, b] of [[NOW, PLUS_10Y] as const]) {
      expect(stripDates(demoAssignmentDashboard('demo-a1', b))).toEqual(stripDates(demoAssignmentDashboard('demo-a1', a)))
      expect(stripDates(demoStudentsLens(b))).toEqual(stripDates(demoStudentsLens(a)))
      expect(stripDates(demoStudentDetail('demo-s4', b))).toEqual(stripDates(demoStudentDetail('demo-s4', a)))
      expect(stripDates(demoRoster(b))).toEqual(stripDates(demoRoster(a)))
    }
  })
  it('התאריכים אכן מתגלגלים: העדכני ביותר = אתמול, גם בעוד 10 שנים', () => {
    for (const now of [NOW, PLUS_10Y]) {
      const { assignments } = demoAssignmentsList(now)
      const newest = new Date(assignments[0].createdAt)
      const diffDays = Math.round((now.getTime() - newest.getTime()) / 86400000)
      expect(diffDays).toBe(3) /* המטלה החדשה — לפני 3 ימים, תמיד */
      const lens = demoStudentsLens(now)
      const latestActive = Math.min(...lens.students.map((s) => Math.round((now.getTime() - new Date(s.lastActive!).getTime()) / 86400000)))
      expect(latestActive).toBe(1) /* הפעילות האחרונה — אתמול, תמיד */
    }
  })
  it('גרף ההתקדמות: אותן נקודות בדיוק על דליי "6 חודשים אחרונים", בכל שנה', () => {
    const t1 = demoTrends('term', 'text_level', [], NOW)
    const t2 = demoTrends('term', 'text_level', [], PLUS_10Y)
    expect(t2.series.map((s) => s.points)).toEqual(t1.series.map((s) => s.points))
    const c1 = demoTrends('year', 'overall_success', [DEMO_CLASS.id], NOW)
    const c2 = demoTrends('year', 'overall_success', [DEMO_CLASS.id], PLUS_1Y)
    expect(c2.series[0].points).toEqual(c1.series[0].points)
  })
})

describe('demoAnalytics — תקינות מול המודל האמיתי', () => {
  it('לכל תלמיד מספר דו-ספרתי של הדמיות', () => {
    const { students } = demoStudentsLens(NOW)
    for (const s of students) expect(s.sessionsCount).toBeGreaterThanOrEqual(10)
    expect(students).toHaveLength(8)
  })
  it('רמות בסולם 1-20, אחוזים ב-0..1, רמות פר-סוג 1-10', () => {
    const { students } = demoStudentsLens(NOW)
    for (const s of students) {
      expect(s.textLevel).toBeGreaterThanOrEqual(1)
      expect(s.textLevel).toBeLessThanOrEqual(20)
      if (s.avgSuccessRate !== null) { expect(s.avgSuccessRate).toBeGreaterThanOrEqual(0); expect(s.avgSuccessRate).toBeLessThanOrEqual(1) }
      const d = demoStudentDetail(s.studentId, NOW)!
      for (const lvl of Object.values(d.profile.per_puzzle_level)) {
        expect(lvl).toBeGreaterThanOrEqual(1); expect(lvl).toBeLessThanOrEqual(10)
      }
    }
  })
  it('הפרופילים מגוונים — המשתפר עלה, הנחלש ירד (כלל 60/80 בפעולה)', () => {
    const improving = demoStudentDetail('demo-s2', NOW)! /* יונתן — התקשה והשתפר */
    const declining = demoStudentDetail('demo-s4', NOW)! /* עידו — פתח חזק ונחלש */
    const firstHalf = (t: { successRate: number | null }[]) => t.slice(0, Math.floor(t.length / 2)).map((x) => x.successRate!).reduce((a, b) => a + b, 0) / Math.floor(t.length / 2)
    const lastHalf = (t: { successRate: number | null }[]) => t.slice(Math.floor(t.length / 2)).map((x) => x.successRate!).reduce((a, b) => a + b, 0) / (t.length - Math.floor(t.length / 2))
    expect(lastHalf(improving.trend)).toBeGreaterThan(firstHalf(improving.trend) + 0.15)
    expect(lastHalf(declining.trend)).toBeLessThan(firstHalf(declining.trend) - 0.1)
  })
})
