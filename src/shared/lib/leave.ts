/* יציאה מחשבון עם מעבר (shared/ui/LeaveTransition, שיושב פעם אחת ב-App ונרשם כאן).
   שימוש: leaveWith(() => { logout(); navigate('/') }). בלי רכיב על המסך (בדיקות): היציאה מיידית. */
let ask: ((run: () => void) => void) | null = null
export function setLeaveHandler(handler: ((run: () => void) => void) | null): void { ask = handler }
export function leaveWith(run: () => void): void {
  if (ask) ask(run); else run()
}
