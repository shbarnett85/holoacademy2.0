/* ──────────────────────────────────────────────────────────────────────────
   testkit — כלי בדיקות לטעינה החיה (לא נטען בייצור, ואינו קובץ בדיקה).
   rawFromDemoClass: הופך כיתה מעולם ההדגמה לשורות גולמיות בצורת ה-DB, כך שאפשר לבדוק ש-assemble משחזר את מה שנגזר באמת.
   ────────────────────────────────────────────────────────────────────────── */
import type { SubjectCode } from '../../../../../src/shared/lib/subjects.js'
import type { DemoWorld } from '../demoWorld.js'
import { skey } from '../demoWorld.js'
import type { RawAnswer, RawClassData, RawPuzzleScene, RawQuest, RawSceneEnter, RawSession, RawSnapshot } from './rawTypes.js'
import { emptyRaw } from './rawTypes.js'

export const FAKE_SCHOOL = { id: 'school-1', name: 'School One' }

export function rawClass(id: string, over: Partial<NonNullable<RawClassData['cls']>> = {}): NonNullable<RawClassData['cls']> {
  return { id, name: 'ז׳1', gradeLabel: 'ז׳1', gradeLevel: 7, schoolId: FAKE_SCHOOL.id, ...over }
}

export function emptyClassRaw(classId = 'class-a', over: Partial<NonNullable<RawClassData['cls']>> = {}): RawClassData {
  return { ...emptyRaw(), cls: rawClass(classId, over), school: FAKE_SCHOOL }
}

/* כיתה אחת מעולם ההדגמה: סשן לכל רשומת SessionRec (הדמיה נפרדת לכל סשן ← כולם "השלמה ראשונה"), עם snapshot, אירועי קריאה והתמדה.
   ה-snapshot נושא את מקצוע ההדמיה (subject_id) — כמו שהכיול כותב אותו: בלעדיו השלמה אינה נכנסת לסדרת המקצוע (FX1a). */
export function rawFromDemoClass(world: DemoWorld, classId: string): RawClassData {
  const cls = world.classes.find((c) => c.id === classId)!
  const raw: RawClassData = { ...emptyRaw(), cls: rawClass(classId, { name: cls.name, gradeLabel: cls.name, gradeLevel: cls.grade }), school: FAKE_SCHOOL }
  const quests = new Map<string, RawQuest>()
  const sessions: RawSession[] = []
  const snapshots: RawSnapshot[] = []
  const sceneEnters: RawSceneEnter[] = []
  const puzzleScenes: RawPuzzleScene[] = []
  const answers: RawAnswer[] = []
  for (const sid of cls.studentIds) {
    const st = world.students.find((s) => s.id === sid)!
    raw.members.push({ id: sid, name: st.displayName, classIds: [classId] })
    for (const sub of st.subjects) {
      const d = world.data.get(skey(sid, sub))!
      d.sessions.forEach((rec, i) => {
        const id = `ses-${sid}-${sub}-${i}`
        const questId = `q-${sub}-${sid}-${i}`
        quests.set(questId, { id: questId, subject: sub })
        sessions.push({ id, studentId: sid, questId, completedAt: rec.date })
        snapshots.push({ sessionId: id, studentId: sid, classId, subject: sub, level: rec.level, success: rec.success })
        /* קריאה: rec.scenes אירועים; סכום המילים והזמן זהה בדיוק */
        let wordsLeft = rec.words, msLeft = rec.closedMs
        for (let k = 0; k < rec.scenes; k++) {
          const last = k === rec.scenes - 1
          const w = last ? wordsLeft : Math.floor(rec.words / rec.scenes)
          const m = last ? msLeft : Math.floor(rec.closedMs / rec.scenes)
          wordsLeft -= w; msLeft -= m
          sceneEnters.push({ sessionId: id, sceneId: `sc-${k}`, wordCount: w, closedMs: m })
        }
        /* התמדה: afterFail = ניסיון שגוי באתגר רב-ניסיוני; giveUps = ויתור */
        for (let k = 0; k < rec.retries.afterFail; k++) answers.push({ sessionId: id, sceneId: `p-a${k}`, itemIndex: 0, puzzleType: 'tileSwap', selectedPosition: null, correctPosition: null, displayedCount: null, outcome: 'wrong' })
        for (let k = 0; k < rec.retries.giveUps; k++) answers.push({ sessionId: id, sceneId: `p-g${k}`, itemIndex: 0, puzzleType: 'memory', selectedPosition: null, correctPosition: null, displayedCount: null, outcome: 'gave_up' })
      })
    }
  }
  raw.quests = [...quests.values()]
  raw.sessions = sessions
  raw.snapshots = snapshots
  raw.sceneEnters = sceneEnters
  raw.puzzleScenes = puzzleScenes
  raw.answers = answers
  return raw
}

export const subjectsOf = (raw: RawClassData, studentId: string): SubjectCode[] => {
  const q = new Map(raw.quests.map((x) => [x.id, x.subject]))
  return [...new Set(raw.sessions.filter((s) => s.studentId === studentId).map((s) => q.get(s.questId)).filter((x): x is SubjectCode => !!x))]
}
