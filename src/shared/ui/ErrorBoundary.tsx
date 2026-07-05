import { Component, type ReactNode } from 'react'

/* רשת ביטחון גלובלית — חריגת רינדור בכל route (למשל game_data פגום) מציגה
   מסך שגיאה עברי במקום מסך לבן. "נסו שוב" עושה reload מלא (מצב נקי). */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error('[ErrorBoundary] חריגת רינדור:', error)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div dir="rtl" style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, background: 'var(--holo-bg-deep)', fontFamily: 'var(--font-display)', color: 'var(--holo-text)', padding: 24, textAlign: 'center' }}>
        <span style={{ fontSize: 44 }}>🛰️</span>
        <h1 className="holo-text-glow" style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>משהו השתבש בהולוגרמה</h1>
        <p style={{ margin: 0, opacity: 0.75, fontSize: 15, maxWidth: 380 }}>אירעה שגיאה בלתי צפויה. רעננו את העמוד כדי להמשיך — ההתקדמות שנשמרה לא הולכת לאיבוד.</p>
        <button
          className="holo-button"
          style={{ marginTop: 6 }}
          onClick={() => window.location.reload()}
        >
          נסו שוב ↻
        </button>
      </div>
    )
  }
}
