/* טאב "סקירה" — קיים אצל כל התפקידים (עיקרון 10: אותו מבנה לכולם; ההרשאה קובעת רק מה פעיל).
   מחנך/ת: טאב רגיל. מורה מקצועי: אותו טאב באפור, עם מנעול והסיבה גלויה בתוך הטאב ("זמין למחנך/ת הכיתה"). */
import type { SubjectRef } from '../../shared/types/analyticsV2'
import { bySubjectOrder } from '../teacherUi'
import type { TabItem } from '../teacherUi'
import { L, LOCKED_OVERVIEW_TEXT } from './labels'

export const OVERVIEW_TAB_ID = 'overview'

export function overviewTabItem(canOpen: boolean): TabItem {
  return canOpen
    ? { id: OVERVIEW_TAB_ID, label: L.overviewTab }
    : { id: OVERVIEW_TAB_ID, label: L.overviewTab, locked: true, lockedReason: LOCKED_OVERVIEW_TEXT }
}

/* ── איזה טאב פעיל במסך הכיתה / התלמיד/ה ──
   · tab=overview רק למחנך/ת הכיתה (isHomeroom של אותה כיתה — לא העדשה של הצופה: מורה יכול להיות מחנך בכיתה אחת ומקצועי באחרת);
   · קוד מקצוע פעיל = מקצוע שהצופה רשאי לפתוח;
   · אחרת: מחנך/ת — סקירה; מורה מקצועי — המקצוע הראשון שלו;
   · מורה מקצועי בלי אף מקצוע פתוח (עוד אין תוצאות במקצועו, או שיוך בלי מקצוע): kind='none' — מסבירים במילים, לא "אין הרשאה". */
export type ClassTabKind = 'overview' | 'subject' | 'none'
export interface ResolvedClassTab { tab: string; kind: ClassTabKind }

export function resolveClassTab(p: { tabParam: string | null; homeroom: boolean; openCodes: readonly string[] }): ResolvedClassTab {
  const { tabParam, homeroom, openCodes } = p
  if (tabParam === OVERVIEW_TAB_ID && homeroom) return { tab: OVERVIEW_TAB_ID, kind: 'overview' }
  if (tabParam !== null && openCodes.includes(tabParam)) return { tab: tabParam, kind: 'subject' }
  if (homeroom) return { tab: OVERVIEW_TAB_ID, kind: 'overview' }
  if (openCodes.length > 0) return { tab: openCodes[0], kind: 'subject' }
  return { tab: OVERVIEW_TAB_ID, kind: 'none' }
}

/* ── הרשאות מקצועות של כיתה אחת ──
   המקור הוא הרשימה של אותה כיתה (RosterClass: subjects / lockedSubjects / isHomeroom), לא תצורת הצופה (config.subjects):
   אצל מורה שמלמד מתמטיקה בכיתה א׳ והיסטוריה בכיתה ב׳, config.subjects הוא האיחוד (מתמטיקה + היסטוריה),
   אבל בכיתה ב׳ המתמטיקה נעולה. הטאבים, הקיצורים והמנעולים נגזרים תמיד מכאן. */
export interface ClassSubjectAccess {
  homeroom: boolean
  /** מקצועות שהצופה רשאי לפתוח בכיתה, בסדר הקבוע */
  open: SubjectRef[]
  /** מקצועות הכיתה שהצופה אינו רשאי לפתוח (שם בלבד), בסדר הקבוע */
  locked: SubjectRef[]
  /** כל המקצועות לטאבים: פתוחים ונעולים, בסדר הקבוע */
  all: SubjectRef[]
  isOpen: (code: string) => boolean
}

export function classSubjectAccess(cls: { isHomeroom: boolean; subjects: readonly SubjectRef[]; lockedSubjects: readonly SubjectRef[] }): ClassSubjectAccess {
  const open = bySubjectOrder([...cls.subjects])
  const locked = bySubjectOrder(cls.lockedSubjects.filter((l) => !open.some((o) => o.code === l.code)))
  const codes = new Set(open.map((s) => s.code as string))
  return { homeroom: cls.isHomeroom, open, locked, all: bySubjectOrder([...open, ...locked]), isOpen: (code) => codes.has(code) }
}
