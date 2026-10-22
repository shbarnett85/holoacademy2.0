/* ──────────────────────────────────────────────────────────────────────────
   שכבת-על במסך מלא (Overlays.tsx): בזמן שהיא פתוחה שאר העמוד אינו נגיש (inert) וגם אינו מוצג (visibility: hidden) — הוא מכוסה בכל מקרה.
   למה גם "אינו מוצג": inert מוציא את העמוד מעץ הנגישות, אבל כותרת ה-<h1> של המסך שמתחת נשארת גלויה ב-DOM, ואז יש שני h1 גלויים
   (כותרת המסך שמתחת וכותרת השכבה). כך בכל רגע יש כותרת ראשית אחת שגלויה: זו של מה שהמורה רואה.
   visibility (ולא display) שומר את הפריסה ואת מיקום הגלילה של המסך שמתחת. בסגירה מוחזר המצב הקודם, ורק אז הפוקוס חוזר.
   טהור מ-React: עובד על כל אלמנט עם הממשק הקטן הזה (נבדק בלי דפדפן).
   ────────────────────────────────────────────────────────────────────────── */
export interface LockableElement {
  hasAttribute(name: string): boolean
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
  style: { visibility: string }
}

/** מנעול על אחי השכבה (ילדי body) חוץ מהשכבה עצמה (keep) ומאלה שכבר נעולים. מחזיר פונקציית שחרור שמשחזרת בדיוק את המצב הקודם. */
export function lockPageBehind(siblings: Iterable<LockableElement>, keep: LockableElement | null): () => void {
  const locked: { el: LockableElement; visibility: string }[] = []
  for (const el of siblings) {
    if (el === keep || el.hasAttribute('inert')) continue
    locked.push({ el, visibility: el.style.visibility })
    el.setAttribute('inert', '')
    el.style.visibility = 'hidden'
  }
  return () => {
    for (const { el, visibility } of locked) {
      el.removeAttribute('inert')
      el.style.visibility = visibility
    }
  }
}
