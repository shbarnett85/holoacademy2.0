// variation-a.jsx — Direction A · "אולפן ההולוגרמה" (3-column studio)
// Right column = התאמות · Center = סיכום → חלון תוכן → צור הדמיה · Left = חידות
// Exports window.VariationA. Expects shared.jsx (useCreatorState, HOLO_DATA, HoloIcon).

(function () {
  const { PUZZLES, SIM_TYPES, ART_STYLES, GRADES } = window.HOLO_DATA;
  const Icon = window.HoloIcon;

  if (!document.getElementById('va-styles')) {
    const s = document.createElement('style');
    s.id = 'va-styles';
    s.textContent = `
      .va, .va * { box-sizing: border-box; }
      .va { --c1:#2ff3ff; --c2:#ff45e6; --c3:#9b8cff; }
      .va input, .va textarea { font-family:'Rubik',sans-serif; color:#eaf6ff; }
      .va ::placeholder { color:#5e7290; }
      .va textarea { resize:none; }
      .va textarea::-webkit-scrollbar { width:6px; }
      .va textarea::-webkit-scrollbar-thumb { background:rgba(47,243,255,.3); border-radius:6px; }
      .va input[type=range]{ -webkit-appearance:none; appearance:none; width:100%; height:3px; border-radius:3px;
        background:linear-gradient(to left,var(--c1) var(--p,50%), rgba(120,160,200,.18) var(--p,50%)); outline:none; cursor:pointer; }
      .va input[type=range]::-webkit-slider-thumb{ -webkit-appearance:none; width:16px; height:16px; border-radius:50%;
        background:#06121c; border:2px solid var(--c1); box-shadow:0 0 10px var(--c1), inset 0 0 4px var(--c1); cursor:grab; margin-top:-1px; }
      .va input[type=range]::-moz-range-thumb{ width:14px; height:14px; border-radius:50%; background:#06121c; border:2px solid var(--c1); box-shadow:0 0 10px var(--c1); }
      .va .va-in:focus{ border-color:rgba(47,243,255,.7); box-shadow:0 0 0 3px rgba(47,243,255,.12), inset 0 0 16px rgba(47,243,255,.06); }
    `;
    document.head.appendChild(s);
  }

  const glass = {
    background: 'linear-gradient(150deg, rgba(20,28,48,.72), rgba(10,14,28,.66))',
    border: '1px solid rgba(120,200,255,.16)', borderRadius: 18, backdropFilter: 'blur(14px)',
    boxShadow: '0 24px 60px -28px rgba(0,0,0,.9), inset 0 1px 0 rgba(160,220,255,.08)',
  };
  const micro = { fontFamily: "'Space Mono', monospace", fontSize: 10.5, letterSpacing: '.22em', textTransform: 'uppercase', color: 'rgba(47,243,255,.7)' };
  const fieldLabel = { fontSize: 12, color: '#9fb6cf', fontWeight: 500, marginBottom: 6, display: 'block' };
  const inputBase = { width: '100%', background: 'rgba(4,9,18,.7)', border: '1px solid rgba(120,200,255,.16)', borderRadius: 11, padding: '11px 13px', fontSize: 14, color: '#eaf6ff', outline: 'none', transition: 'all .18s' };
  const chip = { fontSize: 11.5, fontWeight: 600, color: '#bfe9ff', padding: '5px 11px', borderRadius: 20, background: 'rgba(47,243,255,.08)', border: '1px solid rgba(47,243,255,.25)', whiteSpace: 'nowrap' };

  function PanelHead({ icon, title, kicker, accent = '#7ef6ff', tint = '47,243,255' }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 9,
          background: `rgba(${tint},.08)`, border: `1px solid rgba(${tint},.28)`, color: accent, boxShadow: `0 0 14px rgba(${tint},.2)` }}>
          <Icon name={icon} size={17} stroke={accent} />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15.5, fontWeight: 700, color: '#eaf6ff' }}>{title}</div>
          {kicker && <div style={{ ...micro, marginTop: 2, color: `rgba(${tint},.7)` }}>{kicker}</div>}
        </div>
      </div>
    );
  }

  function NeonSlider({ value, min, max, onChange }) {
    const p = ((value - min) / (max - min)) * 100;
    return <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(+e.target.value)} style={{ '--p': p + '%' }} />;
  }

  function Toggle({ on, onClick }) {
    return (
      <button onClick={onClick} style={{ width: 42, height: 23, borderRadius: 20, padding: 0, cursor: 'pointer', flex: '0 0 auto', position: 'relative', transition: 'all .2s',
        border: '1px solid ' + (on ? 'rgba(47,243,255,.7)' : 'rgba(120,160,200,.3)'),
        background: on ? 'linear-gradient(90deg,rgba(47,243,255,.25),rgba(255,69,230,.22))' : 'rgba(8,14,26,.8)',
        boxShadow: on ? '0 0 14px rgba(47,243,255,.4)' : 'none' }}>
        <span style={{ position: 'absolute', top: 2, [on ? 'left' : 'right']: 2, width: 17, height: 17, borderRadius: '50%',
          background: on ? '#bff7ff' : '#7c93ad', boxShadow: on ? '0 0 8px #2ff3ff' : 'none', transition: 'all .2s' }} />
      </button>
    );
  }

  // Compact holographic emblem for the summary
  function HoloEmblem({ phase, size = 116 }) {
    const generating = phase === 'generating';
    const ready = phase === 'ready';
    const sc = size / 116;
    return (
      <div style={{ position: 'relative', width: size, height: size, flex: '0 0 auto' }}>
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%,-50%) scale(${sc})`, width: 116, height: 116 }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%',
          background: 'radial-gradient(circle at 40% 35%, rgba(47,243,255,.22), rgba(155,140,255,.06) 60%, transparent)',
          boxShadow: ready ? '0 0 30px rgba(74,222,128,.4)' : '0 0 26px rgba(47,243,255,.3)' }} />
        {[0, 1, 2].map((r) => (
          <div key={r} style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
            width: 60 + r * 24, height: (60 + r * 24) * 0.38, borderRadius: '50%',
            border: `1px solid rgba(${r === 1 ? '255,69,230' : '47,243,255'},${0.5 - r * 0.1})`,
            animation: `${r % 2 ? 'holo-spin-rev' : 'holo-spin'} ${(generating ? 4 : 13) + r * 4}s linear infinite` }} />
        ))}
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 52, height: 52, animation: 'holo-float-sm 5s ease-in-out infinite' }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(47,243,255,.55)',
            background: 'radial-gradient(circle at 38% 32%, rgba(47,243,255,.3), rgba(155,140,255,.1) 60%, transparent)',
            boxShadow: 'inset 0 0 18px rgba(155,140,255,.3)', animation: ready ? 'holo-glowpulse 2.4s infinite' : 'none' }} />
          {[0, 1].map((e) => <div key={e} style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(120,220,255,.32)', transform: `rotateY(${e * 55}deg)` }} />)}
          <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: 'rgba(120,220,255,.35)' }} />
        </div>
        {ready && <span style={{ position: 'absolute', right: -2, bottom: -2, width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center', background: '#0a1c12', border: '1px solid #4ade80', boxShadow: '0 0 12px rgba(74,222,128,.5)' }}><Icon name="check" size={16} stroke="#4ade80" sw={2.4} /></span>}
        </div>
      </div>
    );
  }

  const TABS = [
    { id: 'create',    label: 'צור הדמיה',          icon: 'spark', desc: '' },
    { id: 'library',   label: 'ספריית הדמיות',      icon: 'books', desc: 'כל ההדמיות שיצרת — לצפייה, עריכה ושכפול במקום אחד. את הדף הזה נעצב בשלב הבא.' },
    { id: 'summary',   label: 'סיכום שיעור',        icon: 'chart', desc: 'סיכום פדגוגי ממוקד לפעילות השיעור. את הדף הזה נעצב בשלב הבא.' },
    { id: 'students',  label: 'תלמידים',             icon: 'users', desc: 'ניהול תלמידים, מעקב התקדמות וצפייה בתוצאות לפי שם. את הדף הזה נעצב בשלב הבא.' },
    { id: 'analytics', label: 'אנליטיקה',            icon: 'chart', desc: 'נתוני שימוש, ביצועים ותובנות למידה על פני כל הכיתות. את הדף הזה נעצב בשלב הבא.' },
  ];

  function TabPlaceholder({ tab }) {
    return (
      <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26, padding: 30, minHeight: 0 }}>
        <HoloEmblem phase="idle" size={176} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ ...micro, color: 'rgba(255,69,230,.8)', marginBottom: 12 }}>◇ בקרוב</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#fff', textShadow: '0 0 24px rgba(47,243,255,.4)' }}>{tab.label}</div>
          <div style={{ marginTop: 14, fontSize: 14.5, color: '#9fb6cf', maxWidth: 440, lineHeight: 1.65 }}>{tab.desc}</div>
        </div>
      </div>
    );
  }

  window.VariationA = function VariationA({ onLogout }) {
    const s = window.useCreatorState();
    const [tab, setTab] = React.useState('create');
    const [displayTab, setDisplayTab] = React.useState('create');
    const [animKey, setAnimKey] = React.useState(0);
    const [exiting, setExiting] = React.useState(false);
    const [showLoading, setShowLoading] = React.useState(false);

    const switchTab = (t) => {
      if (t === tab) return;
      setExiting(true);
      setTimeout(() => {
        setTab(t);
        setDisplayTab(t);
        setAnimKey((k) => k + 1);
        setExiting(false);
      }, 160);
    };
    const simLabel = SIM_TYPES.find((t) => t.id === s.simType)?.label;
    const artLabel = ART_STYLES.find((a) => a.id === s.artStyle)?.label;
    const statusText = s.phase === 'ready' ? 'ההדמיה מוכנה' : s.phase === 'generating' ? 'ד״ר הולו בונה את ההרפתקה…' : 'מוכן ליצירה';

    const col = { display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 };

    return (
      <div className="va" dir="rtl" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', fontFamily: "'Rubik', sans-serif",
        background: 'radial-gradient(120% 90% at 50% -10%, #0c1430 0%, #070a18 45%, #04060f 100%)' }}>
        {/* bg textures */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(80,150,210,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(80,150,210,.05) 1px,transparent 1px)', backgroundSize: '46px 46px', maskImage: 'radial-gradient(130% 90% at 50% 30%, #000 35%, transparent 85%)' }} />
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0) 0 2px, rgba(0,0,0,.16) 2px 3px)', opacity: .5 }} />
        <div style={{ position: 'absolute', left: -120, top: -80, width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,69,230,.14), transparent 70%)', filter: 'blur(20px)' }} />
        <div style={{ position: 'absolute', right: -120, bottom: -120, width: 460, height: 460, borderRadius: '50%', background: 'radial-gradient(circle, rgba(47,243,255,.12), transparent 70%)', filter: 'blur(20px)' }} />

        {/* ===== Top bar ===== */}
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 30px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 12, background: 'rgba(47,243,255,.08)', border: '1px solid rgba(47,243,255,.35)', color: '#7ef6ff', boxShadow: '0 0 18px rgba(47,243,255,.3)' }}><Icon name="layers" size={22} /></span>
            <div>
              <div style={{ fontSize: 19, fontWeight: 800, color: '#fff' }}>יוצר ההדמיות</div>
              <div style={{ ...micro, marginTop: 1 }}>HOLOACADEMY · STUDIO</div>
            </div>
          </div>
          {/* tabs */}
          <div style={{ display: 'flex', gap: 6, ...glass, borderRadius: 14, padding: 5 }}>
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => switchTab(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 11, cursor: 'pointer',
                  fontFamily: "'Rubik',sans-serif", fontSize: 13.5, fontWeight: 600, transition: 'all .18s', whiteSpace: 'nowrap',
                  background: active ? 'linear-gradient(120deg, rgba(47,243,255,.2), rgba(255,69,230,.14))' : 'transparent',
                  border: '1px solid ' + (active ? 'rgba(47,243,255,.5)' : 'transparent'),
                  color: active ? '#fff' : '#8aa0b8', boxShadow: active ? '0 0 18px rgba(47,243,255,.2)' : 'none' }}>
                  <Icon name={t.icon} size={17} stroke={active ? '#7ef6ff' : '#8aa0b8'} />
                  {t.label}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...glass, borderRadius: 30, padding: '7px 14px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2ff3ff', boxShadow: '0 0 8px #2ff3ff', animation: 'holo-pulse 2s infinite' }} />
              <span style={{ fontSize: 12.5, color: '#bfe9ff', fontWeight: 500 }}>ד״ר הולו מחובר</span>
            </div>
            <button onClick={onLogout} title="יציאה" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 10, cursor: 'pointer', background: 'rgba(255,69,230,.07)', border: '1px solid rgba(255,69,230,.25)', color: 'rgba(255,150,230,.7)', transition: 'all .16s' }}
              onMouseEnter={(e)=>{ e.currentTarget.style.background='rgba(255,69,230,.18)'; e.currentTarget.style.borderColor='rgba(255,69,230,.6)'; e.currentTarget.style.color='#ff45e6'; }}
              onMouseLeave={(e)=>{ e.currentTarget.style.background='rgba(255,69,230,.07)'; e.currentTarget.style.borderColor='rgba(255,69,230,.25)'; e.currentTarget.style.color='rgba(255,150,230,.7)'; }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </button>
          </div>
        </div>

        {/* ===== Body ===== */}
        <style>{`
          @keyframes holo-tab-in {
            0%   { opacity:0; transform:translateY(14px) scaleY(.97); filter:brightness(1.6) blur(3px); }
            40%  { opacity:1; filter:brightness(1.1) blur(0); }
            100% { opacity:1; transform:translateY(0) scaleY(1); filter:none; }
          }
          @keyframes holo-tab-out {
            0%   { opacity:1; transform:translateY(0); filter:none; }
            100% { opacity:0; transform:translateY(-10px); filter:brightness(1.8) blur(4px); }
          }
          .holo-tab-enter { animation: holo-tab-in .32s cubic-bezier(.22,.7,.35,1) both; transform-origin: top center; }
          .holo-tab-exit  { animation: holo-tab-out .16s ease-in both; pointer-events:none; transform-origin: top center; }
        `}</style>
        <div key={animKey} className={exiting ? 'holo-tab-exit' : 'holo-tab-enter'}
          style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0, overflow:'hidden' }}>
        {tab === 'library'   && <window.HoloLibrary onCreate={() => switchTab('create')} />}
        {tab === 'summary'   && <TabPlaceholder tab={TABS.find((t) => t.id === 'summary')} />}
        {tab === 'students'  && <window.HoloStudents />}
        {tab === 'analytics' && <window.HoloAnalytics />}
        {tab === 'create' && (
        <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', gap: 18, padding: '12px 30px 26px', minHeight: 0 }}>

          {/* התאמות — now on the user's left */}
          <div style={{ ...col, width: 350, flex: '0 0 350px', order: 3 }}>
            <div style={{ ...glass, padding: 22, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <PanelHead icon="sliders" title="התאמות" kicker="TUNING" />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
                <label style={{ ...fieldLabel, margin: 0 }}>רמת כתיבה</label>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: '#7ef6ff' }}>כיתה {GRADES[s.writingLevel]}</span>
              </div>
              <div style={{ marginBottom: 20 }}><NeonSlider value={s.writingLevel} min={0} max={GRADES.length - 1} onChange={s.setWritingLevel} /></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
                <label style={{ ...fieldLabel, margin: 0 }}>קושי חידות</label>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: '#7ef6ff', fontFamily: "'Space Mono',monospace" }}>{s.difficulty}/10</span>
              </div>
              <div style={{ marginBottom: 20 }}><NeonSlider value={s.difficulty} min={1} max={10} onChange={s.setDifficulty} /></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 13px', borderRadius: 12, background: 'rgba(4,9,18,.5)', border: '1px solid rgba(120,200,255,.12)', marginBottom: 20 }}>
                <Icon name="bot" size={19} stroke={s.drHolo ? '#7ef6ff' : '#6f87a1'} />
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: '#cfe1f2' }}>ד״ר הולו <span style={{ color: '#8aa0b8', fontWeight: 400 }}>· דמות מנחה</span></span>
                <Toggle on={s.drHolo} onClick={() => s.setDrHolo(!s.drHolo)} />
              </div>
              <label style={fieldLabel}>סגנון אמנותי</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
                {ART_STYLES.map((a) => {
                  const on = s.artStyle === a.id;
                  return (
                    <button key={a.id} onClick={() => s.setArtStyle(a.id)} style={{ padding: '12px 6px', borderRadius: 11, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', transition: 'all .18s',
                      background: on ? 'linear-gradient(150deg,rgba(255,69,230,.16),rgba(47,243,255,.12))' : 'rgba(4,9,18,.55)',
                      border: '1px solid ' + (on ? 'rgba(255,69,230,.6)' : 'rgba(120,200,255,.14)'),
                      color: on ? '#fff' : '#aebfd2', boxShadow: on ? '0 0 16px rgba(255,69,230,.2)' : 'none' }}>{a.label}</button>
                  );
                })}
              </div>
              <div style={{ marginTop: 'auto', paddingTop: 22, display: 'flex', justifyContent: 'center', marginBottom: 75 }}>
                <HoloEmblem phase={s.phase} size={150} />
              </div>
            </div>
          </div>

          {/* CENTER · סיכום → חלון תוכן → צור הדמיה */}
          <div style={{ ...col, flex: 1, order: 2 }}>
            {/* Summary */}
            <div style={{ ...glass, padding: '20px 24px',
              borderColor: s.phase === 'ready' ? 'rgba(74,222,128,.4)' : 'rgba(120,200,255,.16)' }}>
              <div style={{ minWidth: 0, textAlign: 'center' }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', lineHeight: 1.1, textShadow: '0 0 20px rgba(47,243,255,.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title || 'נושא ההדמיה'}</div>
                <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <span style={chip}>{simLabel}</span>
                  <span style={chip}>{s.length} סצנות</span>
                  <span style={chip}>{s.puzzleCount} סוגי חידות</span>
                  <span style={chip}>כיתה {GRADES[s.writingLevel]}</span>
                  <span style={chip}>קושי {s.difficulty}/10</span>
                  <span style={chip}>{artLabel}</span>
                  {s.drHolo && <span style={{ ...chip, color: '#ffd6f6', background: 'rgba(255,69,230,.1)', borderColor: 'rgba(255,69,230,.3)' }}>ד״ר הולו</span>}
                </div>
              </div>
            </div>

            {/* Content window */}
            <div style={{ ...glass, padding: 24, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <label style={fieldLabel}>נושא ההדמיה</label>
              <input className="va-in" style={{ ...inputBase, marginBottom: 16 }} value={s.title} onChange={(e) => s.setTitle(e.target.value)} placeholder="לדוגמה: יפן הפיאודלית" />
              <label style={fieldLabel}>תוכן הלימוד</label>
              <textarea className="va-in" style={{ ...inputBase, marginBottom: 18, lineHeight: 1.55, flex: 1, minHeight: 92 }} value={s.content} onChange={(e) => s.setContent(e.target.value)} placeholder="תארו את הנושא, מושגי המפתח והדגשים שד״ר הולו צריך ללמד…" />
              <div style={{ display: 'flex', gap: 20, alignItems: 'stretch' }}>
                <div style={{ width: 200, flex: '0 0 200px', display: 'flex', flexDirection: 'column', paddingTop: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 9 }}>
                    <label style={{ ...fieldLabel, margin: 0 }}>אורך ההדמיה</label>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: '#7ef6ff' }}>{s.length} סצנות</span>
                  </div>
                  <NeonSlider value={s.length} min={3} max={12} onChange={s.setLength} />
                  <div style={{ ...micro, fontSize: 9.5, color: 'rgba(140,170,200,.5)', marginTop: 9, textAlign: 'center' }}>3 — 12 סצנות</div>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={fieldLabel}>סוג ההדמיה</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[...SIM_TYPES].reverse().map((t) => {
                      const on = s.simType === t.id;
                      return (
                        <button key={t.id} onClick={() => s.setSimType(t.id)} style={{ textAlign: 'center', padding: '13px 8px', borderRadius: 13, cursor: 'pointer', transition: 'all .2s',
                          background: on ? 'linear-gradient(160deg,rgba(47,243,255,.16),rgba(255,69,230,.1))' : 'rgba(4,9,18,.55)',
                          border: '1px solid ' + (on ? 'rgba(47,243,255,.7)' : 'rgba(120,200,255,.14)'), boxShadow: on ? '0 0 20px rgba(47,243,255,.25)' : 'none' }}>
                          <Icon name={t.icon} size={23} stroke={on ? '#7ef6ff' : '#7d94ae'} />
                          <div style={{ fontSize: 14, fontWeight: 700, color: on ? '#fff' : '#cfe1f2', marginTop: 5 }}>{t.label}</div>
                          <div style={{ fontSize: 10.5, color: '#7d94ae', marginTop: 3 }}>{t.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Create button */}
            <button onClick={() => { if (s.phase === 'ready') { s.reset(); } else if (s.phase === 'idle') { s.generate(); setShowLoading(true); } }} disabled={s.phase === 'generating'} style={{
              width: '100%', padding: '18px', borderRadius: 16, border: 'none', cursor: s.phase === 'generating' ? 'wait' : 'pointer',
              fontFamily: "'Rubik',sans-serif", fontSize: 18, fontWeight: 700, color: '#04101c', position: 'relative', overflow: 'hidden', flex: '0 0 auto',
              background: s.phase === 'ready' ? 'linear-gradient(100deg,#4ade80,#2ff3ff)' : 'linear-gradient(100deg,#2ff3ff,#9b8cff 55%,#ff45e6)',
              boxShadow: '0 0 30px rgba(47,243,255,.5), 0 12px 30px -10px rgba(255,69,230,.5)', transition: 'all .2s', opacity: s.phase === 'generating' ? .85 : 1 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, justifyContent: 'center' }}>
                <Icon name={s.phase === 'ready' ? 'check' : 'spark'} size={21} stroke="#04101c" sw={2.2} />
                {s.phase === 'generating' ? 'בונה את ההדמיה…' : s.phase === 'ready' ? 'ההדמיה מוכנה · התחל מחדש' : 'צור הדמיה'}
              </span>
              {s.phase === 'generating' && <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.45),transparent)', animation: 'holo-sweepX 1.1s linear infinite' }} />}
            </button>
          </div>

          {/* חידות — now on the user's right */}
          <div style={{ ...col, width: 350, flex: '0 0 350px', order: 1 }}>
            <div style={{ ...glass, padding: 22, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <PanelHead icon="grid" title="חידות" kicker={s.puzzleCount + ' פעילות'} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', flex: 1, paddingLeft: 4 }}
                className="holo-puzzle-scroll">
                <style>{`
                  .holo-puzzle-scroll::-webkit-scrollbar { width: 4px; }
                  .holo-puzzle-scroll::-webkit-scrollbar-track { background: rgba(4,9,18,.4); border-radius: 4px; }
                  .holo-puzzle-scroll::-webkit-scrollbar-thumb { background: rgba(47,243,255,.28); border-radius: 4px; }
                  .holo-puzzle-scroll::-webkit-scrollbar-thumb:hover { background: rgba(47,243,255,.55); }
                `}</style>
                {PUZZLES.map((p) => {
                  const on = !!s.puzzles[p.id];
                  const isExam = p.id === 'exam';
                  return (
                    <React.Fragment key={p.id}>
                      <div>
                        <button onClick={() => s.togglePuzzle(p.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 12, cursor: 'pointer', transition: 'all .18s',
                          background: on ? 'rgba(47,243,255,.09)' : 'rgba(4,9,18,.5)',
                          border: '1px solid ' + (on ? 'rgba(47,243,255,.5)' : 'rgba(120,200,255,.12)'), boxShadow: on ? '0 0 16px rgba(47,243,255,.16)' : 'none' }}>
                          <Icon name={p.icon} size={18} stroke={on ? '#7ef6ff' : '#6f87a1'} />
                          <span style={{ flex: 1, textAlign: 'right', fontSize: 13.5, fontWeight: 600, color: on ? '#fff' : '#aebfd2' }}>{p.label}</span>
                          <span style={{ width: 20, height: 20, borderRadius: 6, display: 'grid', placeItems: 'center', background: on ? 'linear-gradient(135deg,#2ff3ff,#9b8cff)' : 'transparent', border: '1px solid ' + (on ? 'transparent' : 'rgba(120,160,200,.35)') }}>
                            {on && <Icon name="check" size={13} stroke="#04101c" sw={2.4} />}
                          </span>
                        </button>
                        {on && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px 2px', justifyContent: 'flex-end' }}>
                            <span style={{ fontSize: 11.5, color: '#8aa0b8', marginLeft: 'auto' }}>כמות:</span>
                            {[1, 2, 3, 4, 5].map((n) => (
                              <button key={n} onClick={() => s.setPuzzleQty(p.id, n)} style={{ width: 28, height: 28, borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: "'Space Mono',monospace",
                                background: s.getQty(p.id) === n ? 'linear-gradient(135deg,#2ff3ff,#9b8cff)' : 'rgba(4,9,18,.6)',
                                border: '1px solid ' + (s.getQty(p.id) === n ? 'transparent' : 'rgba(120,200,255,.18)'),
                                color: s.getQty(p.id) === n ? '#04101c' : '#aebfd2', boxShadow: s.getQty(p.id) === n ? '0 0 12px rgba(47,243,255,.4)' : 'none', transition: 'all .15s' }}>{n}</button>
                            ))}
                          </div>
                        )}
                      </div>
                      {isExam && (
                        <button onClick={() => {}} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, padding: '11px', borderRadius: 13, cursor: 'pointer',
                          fontFamily: "'Rubik',sans-serif", fontSize: 13.5, fontWeight: 700, color: '#ffd6f6',
                          background: 'linear-gradient(135deg, rgba(255,69,230,.14), rgba(155,140,255,.1))',
                          border: '1px dashed rgba(255,69,230,.5)', boxShadow: '0 0 18px rgba(255,69,230,.14)', transition: 'all .18s' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,69,230,.24), rgba(155,140,255,.18))'; e.currentTarget.style.boxShadow = '0 0 24px rgba(255,69,230,.3)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,69,230,.14), rgba(155,140,255,.1))'; e.currentTarget.style.boxShadow = '0 0 18px rgba(255,69,230,.14)'; }}>
                          <Icon name="spark" size={17} stroke="#ff8af0" sw={2} />
                          מעבדת חידות
                        </button>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        )}
        </div>
        {showLoading && (
          <window.HoloLoadingScreen
            title={s.title || 'הדמיה חדשה'}
            onDone={() => setShowLoading(false)}
          />
        )}
      </div>
    );
  };
})();
