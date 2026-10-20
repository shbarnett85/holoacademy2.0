/* טאב "סקירה" — קיים אצל כל התפקידים (עיקרון 10: אותו מבנה לכולם; ההרשאה קובעת רק מה פעיל).
   מחנך/ת: טאב רגיל. מורה מקצועי: אותו טאב באפור, עם מנעול והסיבה גלויה בתוך הטאב ("זמין למחנך/ת הכיתה"). */
import type { TabItem } from '../teacherUi'
import { L, LOCKED_OVERVIEW_TEXT } from './labels'

export const OVERVIEW_TAB_ID = 'overview'

export function overviewTabItem(canOpen: boolean): TabItem {
  return canOpen
    ? { id: OVERVIEW_TAB_ID, label: L.overviewTab }
    : { id: OVERVIEW_TAB_ID, label: L.overviewTab, locked: true, lockedReason: LOCKED_OVERVIEW_TEXT }
}
