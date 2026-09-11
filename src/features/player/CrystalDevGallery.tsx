/* גלריית פיתוח לשקעי הקריסטלים — route ‏/dev/crystals ב-DEV בלבד (לא נכלל
   בניתוב פרודקשן; ראו App.tsx). מציגה את כל מצבי המילוי בכל המכנים ובגדלים
   האמיתיים (26px של ה-HUD ו-30px של הסיכום) לבדיקת קריאוּת. */
import { useState } from 'react'
import CrystalGauge from './CrystalGauge'
import CrystalFusion from './CrystalFusion'
import CrystalRain from './CrystalRain'

export default function CrystalDevGallery() {
  const [pop, setPop] = useState(false)
  const [fusion, setFusion] = useState(false)
  const [rain, setRain] = useState(false)
  const row = (steps: number, size: number) => (
    <div key={`${steps}-${size}`} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <span style={{ width: 110, fontSize: 12, color: '#8fb3d9', fontFamily: 'monospace' }}>N={steps} · {size}px</span>
      {Array.from({ length: steps + 1 }).map((_, k) => (
        <span key={k} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <CrystalGauge fill={k / steps} steps={steps} index={0} size={size} justCompleted={pop && k === steps} />
          <span style={{ fontSize: 10, color: '#5a7595', fontFamily: 'monospace' }}>{k}/{steps}</span>
        </span>
      ))}
    </div>
  )
  return (
    <div dir="rtl" style={{ minHeight: '100vh', background: '#070b18', padding: 24, display: 'flex', flexDirection: 'column', gap: 18, fontFamily: 'var(--font-display)' }}>
      <h1 style={{ color: '#fff', fontSize: 18, margin: 0 }}>שקעי קריסטל — כל המצבים (DEV)</h1>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => { setPop(false); requestAnimationFrame(() => setPop(true)) }} style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(47,243,255,.12)', border: '1px solid rgba(47,243,255,.4)', color: '#7ef6ff', cursor: 'pointer' }}>
          ▶ אנימציית השלמה
        </button>
        <button onClick={() => { setFusion(false); requestAnimationFrame(() => setFusion(true)) }} style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(242,65,218,.12)', border: '1px solid rgba(242,65,218,.4)', color: '#ff8df0', cursor: 'pointer' }}>
          ▶ היתוך
        </button>
        <button onClick={() => setRain((r) => !r)} style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(120,180,255,.12)', border: '1px solid rgba(120,180,255,.4)', color: '#b4dcff', cursor: 'pointer' }}>
          {rain ? '⏸ עצור גשם' : '▶ גשם קריסטלים'}
        </button>
      </div>
      {fusion && <CrystalFusion onDone={() => setFusion(false)} />}
      {rain && <CrystalRain />}
      {[2, 3, 4, 5].map((n) => row(n, 26))}
      <div style={{ height: 6 }} />
      {[4].map((n) => row(n, 30))}
      <div style={{ height: 6 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ width: 110, fontSize: 12, color: '#8fb3d9', fontFamily: 'monospace' }}>שורת HUD מלאה</span>
        {[{ f: 1, s: 2 }, { f: 1, s: 3 }, { f: 0.5, s: 4 }, { f: 0, s: 2 }, { f: 0, s: 5 }].map((c, i) => (
          <CrystalGauge key={i} fill={c.f} steps={c.s} index={i} size={26} />
        ))}
      </div>
    </div>
  )
}
