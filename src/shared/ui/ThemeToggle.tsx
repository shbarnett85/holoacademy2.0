import { useTheme } from '../lib/useTheme'

/* מתג מצב בהיר/כהה.
   המפרט מתאר כפתור שנבנה ב-DOM ע"י theme.js וקבוע למעלה-שמאל. כאן הוא רכיב
   React שמשובץ ב-StudioTopBar — וזה מכוון: הדרישה היא "מצב מורה בלבד",
   ו-StudioTopBar הוא בדיוק הקליפה של ארבעת מסכי המורה. כך המתג מופיע בהם
   ורק בהם, בלי לוגיקת ניתוב בתוך theme.js. הלוגיקה עצמה (localStorage,
   data-holo-theme, האירוע) נשארת ב-theme.js כפי שהמפרט מגדיר. */
export default function ThemeToggle() {
  const light = useTheme()
  return (
    <button
      onClick={() => window.HoloTheme?.toggle()}
      title={light ? 'מצב כהה' : 'מצב בהיר'}
      aria-label={light ? 'עבור למצב כהה' : 'עבור למצב בהיר'}
      aria-pressed={light}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 36, height: 36, borderRadius: 10, cursor: 'pointer', fontSize: '1.05rem',
        background: 'var(--t241)', border: '1px solid var(--t41)', color: 'var(--t19)',
      }}
    >
      {light ? '🌙' : '☀️'}
    </button>
  )
}
