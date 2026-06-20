/* סגנונות משותפים לאולפן היוצר (Claude Design) — כדי לא לשכפל בין המסכים */

export const glass: React.CSSProperties = {
  background: 'linear-gradient(150deg, rgba(20,28,48,.72), rgba(10,14,28,.66))',
  border: '1px solid rgba(120,200,255,.16)', borderRadius: 18, backdropFilter: 'blur(14px)',
  boxShadow: '0 24px 60px -28px rgba(0,0,0,.9), inset 0 1px 0 rgba(160,220,255,.08)',
}

export const micro: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.22em', textTransform: 'uppercase', color: 'rgba(47,243,255,.7)' }
