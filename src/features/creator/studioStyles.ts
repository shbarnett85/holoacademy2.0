/* סגנונות משותפים לאולפן היוצר (Claude Design) — כדי לא לשכפל בין המסכים */

export const glass: React.CSSProperties = {
  background: 'linear-gradient(150deg, var(--t244), var(--t245))',
  border: '1px solid var(--t86)', borderRadius: 18, backdropFilter: 'blur(14px)',
  boxShadow: '0 24px 60px -28px var(--t246), inset 0 1px 0 var(--t247)',
}

export const micro: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--t89)' }
