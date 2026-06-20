import { useState } from 'react'

export interface Slice { label: string; value: number; color: string }

/* גרף דונאט (Claude Design) — נתח לכל קטגוריה, מקרא, ומרכז עם סה״כ / אחוז בריחוף */
export default function DonutChart({ title, data, centerUnit }: { title: string; data: Slice[]; centerUnit?: string }) {
  const [hov, setHov] = useState<number | null>(null)
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  const R = 62, Ri = 38, CX = 88, CY = 80
  const START = -Math.PI / 2
  const slices = data.map((d, idx) => {
    /* זווית ההתחלה = סכום הנתחים שלפניו (ללא מוטציה של משתנה בזמן render) */
    const before = data.slice(0, idx).reduce((s, x) => s + x.value, 0)
    const angle = START + (before / total) * 2 * Math.PI
    const sweep = (d.value / total) * 2 * Math.PI
    const end = angle + sweep
    const large = sweep > Math.PI ? 1 : 0
    const c1 = Math.cos(angle), s1 = Math.sin(angle), c2 = Math.cos(end), s2 = Math.sin(end)
    const path = [
      `M ${(CX + Ri * c1).toFixed(2)} ${(CY + Ri * s1).toFixed(2)}`,
      `L ${(CX + R * c1).toFixed(2)} ${(CY + R * s1).toFixed(2)}`,
      `A ${R} ${R} 0 ${large} 1 ${(CX + R * c2).toFixed(2)} ${(CY + R * s2).toFixed(2)}`,
      `L ${(CX + Ri * c2).toFixed(2)} ${(CY + Ri * s2).toFixed(2)}`,
      `A ${Ri} ${Ri} 0 ${large} 0 ${(CX + Ri * c1).toFixed(2)} ${(CY + Ri * s1).toFixed(2)}`,
      'Z',
    ].join(' ')
    return { ...d, path, pct: Math.round((d.value / total) * 100), mid: angle + sweep / 2 }
  })
  const active = hov !== null ? slices[hov] : null

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
      <svg viewBox="0 0 176 160" style={{ width: 130, flexShrink: 0 }} aria-label={title}>
        <defs>
          <filter id="donut-glow"><feGaussianBlur stdDeviation="2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} opacity={hov === null || hov === i ? 0.9 : 0.35} stroke="#070a18" strokeWidth="1.2"
            filter={hov === i ? 'url(#donut-glow)' : undefined}
            style={{ cursor: 'pointer', transition: 'opacity .15s' }}
            transform={hov === i ? `translate(${(Math.cos(s.mid) * 4).toFixed(1)},${(Math.sin(s.mid) * 4).toFixed(1)})` : undefined}
            onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)} />
        ))}
        {active ? (
          <>
            <text x={CX} y={CY - 4} textAnchor="middle" fill={active.color} fontSize="20" fontFamily="Rubik" fontWeight="800">{active.pct}%</text>
            <text x={CX} y={CY + 12} textAnchor="middle" fill="rgba(180,220,255,.7)" fontSize="8" fontFamily="Rubik">{active.label}</text>
          </>
        ) : (
          <>
            <text x={CX} y={CY - 2} textAnchor="middle" fill="#7ef6ff" fontSize="20" fontFamily="Rubik" fontWeight="800">{total}</text>
            <text x={CX} y={CY + 13} textAnchor="middle" fill="rgba(47,243,255,.5)" fontSize="7.5" fontFamily="'Space Mono',monospace">{centerUnit ?? 'סה״כ'}</text>
          </>
        )}
      </svg>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: hov === null || hov === i ? 1 : 0.45, transition: 'opacity .15s', cursor: 'pointer' }}
            onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0, boxShadow: `0 0 5px ${s.color}` }} />
            <span style={{ fontSize: 11.5, color: '#b0cce0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#cfe1f2', flexShrink: 0 }}>{s.value}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: s.color, flexShrink: 0, width: 34, textAlign: 'left' }} dir="ltr">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
