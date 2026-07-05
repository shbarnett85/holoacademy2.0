/* guard לניווט פנימי — מאפשר לדפים עם שינויים לא-שמורים לחסום מעבר טאב.
   ה-guard יכול להיות סינכרוני או אסינכרוני (למשל דיאלוג אישור holoConfirm). */
let _guard: (() => boolean | Promise<boolean>) | null = null

export function setNavGuard(fn: (() => boolean | Promise<boolean>) | null): void {
  _guard = fn
}

/** מחזיר true אם הניווט מותר (אין guard או ה-guard אישר). */
export async function checkNavGuard(): Promise<boolean> {
  return _guard ? await _guard() : true
}
