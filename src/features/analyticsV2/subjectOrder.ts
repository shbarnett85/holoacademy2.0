/* מקצועות בסדר הקבוע של המערכת (shared/lib/subjects) — אותו סדר בכרטיס הכיתה, בטאבים ובכל רשימה */
import { SUBJECTS } from '../../shared/lib/subjects'

const SUBJECT_ORDER = new Map<string, number>(SUBJECTS.map((s, i) => [s.code, i]))

export const bySubjectOrder = <T extends { code: string }>(xs: readonly T[]): T[] =>
  [...xs].sort((a, b) => (SUBJECT_ORDER.get(a.code) ?? 99) - (SUBJECT_ORDER.get(b.code) ?? 99))
