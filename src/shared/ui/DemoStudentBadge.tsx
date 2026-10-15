/* תג עדין "תלמיד לדוגמה" — מוצג ליד שם תלמיד פיקטיבי (ארגון ההדגמה). הצבעים
   מטוקני ערכת הנושא של מסכי הצוות, כך שהתג עובד גם במצב בהיר. */
export default function DemoStudentBadge({ show }: { show?: boolean }) {
  if (!show) return null
  return (
    <span
      title="תלמיד לדוגמה — נתוני הדגמה, לא תלמיד אמיתי"
      style={{
        display: 'inline-block', flexShrink: 0, whiteSpace: 'nowrap', fontSize: 10, fontWeight: 600, lineHeight: 1.5,
        padding: '0 7px', borderRadius: 999, color: 'var(--t6)', border: '1px dashed var(--t21)', background: 'transparent',
      }}
    >
      תלמיד לדוגמה
    </span>
  )
}
