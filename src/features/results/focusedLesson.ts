/* שיעור ממוקד מסיכום שיעור: מילוי טופס "שיעור חדש" מתיאור הטעות הנפוצה (מקצוע, שכבה, נושא ותיאור). בלי רכיבים — כדי שיהיה אפשר לייבא גם לבדיקות. */
import { gradeNumberFromLabel } from '../../shared/lib/difficultyCalibration'
import { FOCUSED_LESSON_WHOLE_CLASS_NOTE, focusedLessonBrief } from '../../shared/lib/findingsNarrative'
import type { CommonErrorRow, SubmissionHead } from '../../shared/types/resultsV1'
import { useCreatorStore } from '../creator/creatorStore'
import { UI } from './text'

/* רמת היצירה בסולם 1-20 היא שכבת הגיל + 4 (כיתה ו׳ = 10) — כמו ברירת המחדל של הטופס */
export function levelOfGradeLabel(gradeLabel: string | null | undefined): number | null {
  const g = gradeNumberFromLabel(gradeLabel)
  return g === null ? null : Math.min(20, Math.max(1, g + 4))
}

/* פותח את טופס היצירה כשהוא ממולא: מקצוע, שכבה, נושא ותיאור הטעות. השליחה בפועל תהיה לכיתה שלמה (ההערה נשמרת בטופס) */
export function startFocusedLesson(e: CommonErrorRow, head: SubmissionHead): void {
  const n = e.studentIds?.length ?? e.studentsCount
  const level = levelOfGradeLabel(head.gradeLabel)
  useCreatorStore.getState().set({
    title: UI.focusedTitle(e.challengeTitle ?? head.title),
    subject: head.subject?.code ?? '',
    curriculum: focusedLessonBrief({
      lessonTitle: head.title, challengeTitle: e.challengeTitle ?? head.title, question: e.question ?? '', wrongText: e.wrongText ?? '',
      correctText: e.correctText ?? null, count: n, misconceptionTitle: e.misconceptionId ? e.title : null,
    }),
    ...(level !== null ? { writingLevel: level, puzzleDifficulty: level } : {}),
    focusedMisconceptionId: e.misconceptionId ?? null,
    focusedNote: FOCUSED_LESSON_WHOLE_CLASS_NOTE,
    status: 'idle', error: null, result: null,
  })
}
