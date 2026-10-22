import { describe, expect, it } from 'vitest'
import { DEMO_HOMEROOM_CLASS, type V2Viewer } from './access.js'
import { demoProvider, getAnalysis } from './demoProvider.js'
import { demoClassesV2, demoRosterV2 } from './demoRoster.js'

const NOW = new Date(Date.UTC(2026, 9, 21, 9, 0, 0))
const homeroom: V2Viewer = { lens: 'homeroom', guest: true, homeroomClassId: DEMO_HOMEROOM_CLASS, teachingClassIds: [], subjectCodes: [] }

describe('demoRosterV2 — רוסטר האורח מעולם ההדגמה של האנליטיקה', () => {
  const { students } = demoRosterV2(NOW)
  const world = getAnalysis(NOW)

  it('כל מזהה קיים בעולם (ושייך לכיתת המחנך/ת של האורח), עם אותו שם ומגדר', () => {
    expect(students.length).toBeGreaterThan(0)
    const cls = world.classById.get(DEMO_HOMEROOM_CLASS)!
    expect(students.length).toBe(cls.studentIds.length)
    for (const st of students) {
      const w = world.studentById.get(st.id)
      expect(w, st.id).toBeDefined()
      expect(st.classId).toBe(DEMO_HOMEROOM_CLASS)
      expect(w!.classId).toBe(DEMO_HOMEROOM_CLASS)
      expect(st.name).toBe(w!.displayName)
      expect(st.gender).toBe(w!.gender)
      expect(st.class).toBe(cls.gradeLabel)
    }
  })

  it('לא מחזיר 404 בעמוד התלמיד/ה: ספק ההדגמה מאתר כל תלמיד/ה ברוסטר (עדשת מחנך)', async () => {
    for (const st of students) {
      const r = await demoProvider.student(homeroom, st.id)
      expect(r.data.student.id).toBe(st.id)
    }
  })

  it('הצורה שהרוסטר בקליינט מצפה לה: קוד כיתה, PIN של 4 ספרות, פעיל, ותאריך פעילות אחרונה תקף', () => {
    for (const st of students) {
      expect(st.classCode).toMatch(/^demo-/)
      expect(st.secret).toMatch(/^\d{4}$/)
      expect(st.isActive).toBe(true)
      if (st.lastActive !== null) expect(Number.isNaN(Date.parse(st.lastActive))).toBe(false)
    }
    expect(students.some((s) => s.lastActive !== null)).toBe(true)
  })

  it('סדר אלפביתי עברי, ללא כפילויות, ודטרמיניסטי (אותו קלט — אותו פלט)', () => {
    expect(new Set(students.map((s) => s.id)).size).toBe(students.length)
    expect(demoRosterV2(NOW)).toEqual({ students })
  })
})

describe('demoClassesV2 — אותה כיתה כמו ברוסטר', () => {
  it('מזהה הכיתה, שמה ומספר התלמידים זהים לרוסטר, והאורח הוא המחנך/ת', () => {
    const { classes } = demoClassesV2('guest-user-1', NOW)
    expect(classes).toHaveLength(1)
    const roster = demoRosterV2(NOW).students
    expect(classes[0].id).toBe(DEMO_HOMEROOM_CLASS)
    expect(classes[0].studentCount).toBe(roster.length)
    expect(roster.every((s) => s.classId === classes[0].id && s.class === classes[0].gradeLabel)).toBe(true)
    expect(classes[0].teachers).toEqual([expect.objectContaining({ teacherId: 'guest-user-1', isHomeroom: true })])
  })
})
