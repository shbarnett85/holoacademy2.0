/* guard לניווט פנימי — מאפשר לדפים עם שינויים לא-שמורים לחסום מעבר טאב */
let _guard: (() => boolean) | null = null

export function setNavGuard(fn: (() => boolean) | null): void {
  _guard = fn
}

/** מחזיר true אם הניווט מותר (אין guard או ה-guard אישר). */
export function checkNavGuard(): boolean {
  return _guard ? _guard() : true
}
