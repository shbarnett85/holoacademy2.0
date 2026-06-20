// library.jsx — "ספריית הדמיות" page for HoloAcademy creator.
// Two columns: הספרייה שלי (saved in this profile) · הדמיות מוכנות (community repository).
// Exports window.HoloLibrary. Expects shared.jsx (HoloIcon).

(function () {
  const Icon = window.HoloIcon;
  const { GRADES } = window.HOLO_DATA;

  if (!document.getElementById('lib-styles')) {
    const s = document.createElement('style');
    s.id = 'lib-styles';
    s.textContent = `
      .lib-scroll{ overflow-y:auto; scrollbar-width:thin; scrollbar-color:rgba(47,243,255,.55) rgba(255,255,255,.05); }
      .lib-scroll::-webkit-scrollbar{ width:10px; }
      .lib-scroll::-webkit-scrollbar-track{ background:rgba(255,255,255,.05); border-radius:8px; margin:2px; }
      .lib-scroll::-webkit-scrollbar-thumb{ background:linear-gradient(180deg,rgba(47,243,255,.6),rgba(155,140,255,.6)); border-radius:8px; border:2px solid transparent; background-clip:padding-box; }
      .lib-scroll::-webkit-scrollbar-thumb:hover{ background:linear-gradient(180deg,rgba(47,243,255,.9),rgba(155,140,255,.9)); background-clip:padding-box; border:2px solid transparent; }
      .lib-scroll.lib-mag{ scrollbar-color:rgba(255,69,230,.55) rgba(255,255,255,.05); }
      .lib-scroll.lib-mag::-webkit-scrollbar-thumb{ background:linear-gradient(180deg,rgba(255,69,230,.6),rgba(155,140,255,.6)); border-radius:8px; border:2px solid transparent; background-clip:padding-box; }
      .lib-scroll.lib-mag::-webkit-scrollbar-thumb:hover{ background:linear-gradient(180deg,rgba(255,69,230,.9),rgba(155,140,255,.9)); background-clip:padding-box; border:2px solid transparent; }
    `;
    document.head.appendChild(s);
  }

  const glass = {
    background: 'linear-gradient(150deg, rgba(20,28,48,.72), rgba(10,14,28,.66))',
    border: '1px solid rgba(120,200,255,.16)', borderRadius: 18, backdropFilter: 'blur(14px)',
    boxShadow: '0 24px 60px -28px rgba(0,0,0,.9), inset 0 1px 0 rgba(160,220,255,.08)',
  };
  const micro = { fontFamily: "'Space Mono', monospace", fontSize: 10.5, letterSpacing: '.2em', textTransform: 'uppercase' };
  const hexA = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

  const MINE_SEED = [
    { id: 'm1', title: 'יפן הפיאודלית', subject: 'היסטוריה', type: 'הרפתקה', icon: 'quest', scenes: 7, grade: 'ז׳', status: 'טיוטה', source: 'נוצר', when: 'לפני 2 דקות' },
    { id: 'm2', title: 'מערכת השמש', subject: 'מדעים', type: 'סיור', icon: 'orbit', scenes: 5, grade: 'ה׳', status: 'פורסם', source: 'נוצר', when: 'אתמול' },
    { id: 'm3', title: 'מלחמת העצמאות', subject: 'היסטוריה', type: 'הרפתקה', icon: 'quest', scenes: 8, grade: 'ח׳', status: 'פורסם', source: 'נערך', when: 'לפני 3 ימים' },
    { id: 'm4', title: 'שברים ומספרים עשרוניים', subject: 'מתמטיקה', type: 'הרפתקה', icon: 'quest', scenes: 6, grade: 'ד׳', status: 'טיוטה', source: 'הורד', when: 'לפני שבוע' },
  ];

  const COMMUNITY = [
    { id: 'c1', title: 'גוף האדם — מסע במחזור הדם', subject: 'מדעים', author: 'ד״ר מיכל לוי', type: 'סיור', icon: 'orbit', scenes: 6, grade: 'ו׳', uses: '1.2k', rating: '4.8' },
    { id: 'c2', title: 'המהפכה התעשייתית', subject: 'היסטוריה', author: 'יוסי כהן', type: 'הרפתקה', icon: 'quest', scenes: 9, grade: 'ט׳', uses: '860', rating: '4.6' },
    { id: 'c3', title: 'הטבלה המחזורית של היסודות', subject: 'מדעים', author: 'רכז מדעים · רשת אורט', type: 'סיור', icon: 'orbit', scenes: 7, grade: 'ח׳', uses: '2.1k', rating: '4.9' },
    { id: 'c4', title: 'סיפור בריאת העולם', subject: 'תנ״ך', author: 'מכון התנ״ך', type: 'הרפתקה', icon: 'quest', scenes: 5, grade: 'ג׳', uses: '540', rating: '4.5' },
    { id: 'c5', title: 'אנגלית — זמני עבר', subject: 'אנגלית', author: 'Sarah M.', type: 'הרפתקה', icon: 'quest', scenes: 6, grade: 'ז׳', uses: '1.5k', rating: '4.7' },
    { id: 'c6', title: 'מסע במצרים העתיקה', subject: 'היסטוריה', author: 'אגף מורשת', type: 'סיור', icon: 'orbit', scenes: 8, grade: 'ו׳', uses: '980', rating: '4.7' },
  ];

  const SUBJECTS = ['עברית', 'מתמטיקה', 'אנגלית', 'מדעים', 'תנ״ך', 'היסטוריה', 'גאוגרפיה', 'אזרחות', 'ספרות'];

  // Roster for the "share → students" picker
  const SHARE_LAYERS = ['א–ב', 'ג–ד', 'ה–ו', 'ז–ח', 'ט–י', 'י"א–י"ב'];
  const SHARE_CLASSES = {
    'א–ב': ['א1', 'א2', 'ב1'], 'ג–ד': ['ג1', 'ד1', 'ד2'], 'ה–ו': ['ה1', 'ה2', 'ו1'],
    'ז–ח': ['ז1', 'ז2', 'ח1', 'ח2'], 'ט–י': ['ט1', 'ט2', 'י1'], 'י"א–י"ב': ['י"א1', 'י"ב1'],
  };
  const SHARE_ROSTER = [
    { id: 1, name: 'נועה כהן', cls: 'ז1', layer: 'ז–ח' }, { id: 2, name: 'יואב לוי', cls: 'ז1', layer: 'ז–ח' },
    { id: 3, name: 'מיה ברק', cls: 'ז2', layer: 'ז–ח' }, { id: 4, name: 'אלון ברנע', cls: 'ז2', layer: 'ז–ח' },
    { id: 5, name: 'עמית שפירא', cls: 'ח1', layer: 'ז–ח' }, { id: 6, name: 'תמר אביב', cls: 'ח1', layer: 'ז–ח' },
    { id: 7, name: 'רון גלילי', cls: 'ח2', layer: 'ז–ח' }, { id: 8, name: 'נועם וקנין', cls: 'ח1', layer: 'ז–ח' },
    { id: 9, name: 'שיר מזרחי', cls: 'ט1', layer: 'ט–י' }, { id: 10, name: 'אור פרידמן', cls: 'ט1', layer: 'ט–י' },
    { id: 11, name: 'הילה צדוק', cls: 'ט2', layer: 'ט–י' }, { id: 12, name: 'ליה דמארי', cls: 'י1', layer: 'ט–י' },
    { id: 13, name: 'איתי שרון', cls: 'י1', layer: 'ט–י' }, { id: 14, name: 'גל כספי', cls: 'י"א1', layer: 'י"א–י"ב' },
    { id: 15, name: 'ניל שמיר', cls: 'י"ב1', layer: 'י"א–י"ב' }, { id: 16, name: 'הדר פז', cls: 'ה1', layer: 'ה–ו' },
    { id: 17, name: 'בר עמרני', cls: 'ו1', layer: 'ה–ו' }, { id: 18, name: 'ליאור קדם', cls: 'ד1', layer: 'ג–ד' },
    { id: 19, name: 'גפן הראל', cls: 'ג1', layer: 'ג–ד' }, { id: 20, name: 'יהלי ספיר', cls: 'ב1', layer: 'א–ב' },
  ];

  const sourceColor = { 'נוצר': '#7ef6ff', 'נערך': '#9b8cff', 'הורד': '#ffb56b' };

  function Thumb({ icon, accent, size = 56 }) {
    return (
      <div style={{ width: size, height: size, borderRadius: 13, flex: '0 0 auto', position: 'relative', overflow: 'hidden', display: 'grid', placeItems: 'center',
        background: `linear-gradient(140deg, ${hexA(accent, .22)}, rgba(8,14,26,.5))`, border: '1px solid ' + hexA(accent, .32), boxShadow: 'inset 0 0 18px ' + hexA(accent, .12) }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(${hexA(accent, .12)} 1px,transparent 1px),linear-gradient(90deg,${hexA(accent, .12)} 1px,transparent 1px)`, backgroundSize: '12px 12px' }} />
        <Icon name={icon} size={size * 0.46} stroke={accent} />
      </div>
    );
  }

  function Chip({ children, accent = '#9fb6cf' }) {
    return <span style={{ fontSize: 11, fontWeight: 600, color: accent === '#9fb6cf' ? '#9fb6cf' : accent, padding: '3px 9px', borderRadius: 20, background: 'rgba(120,180,220,.07)', border: '1px solid rgba(120,180,220,.18)', whiteSpace: 'nowrap' }}>{children}</span>;
  }

  function MineCard({ item, onShare }) {
    return (
      <div style={{ display: 'flex', gap: 14, padding: 14, borderRadius: 14, background: 'rgba(4,9,18,.5)', border: '1px solid rgba(120,200,255,.12)', transition: 'all .18s', cursor: 'pointer' }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(47,243,255,.45)'; e.currentTarget.style.background = 'rgba(47,243,255,.06)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(120,200,255,.12)'; e.currentTarget.style.background = 'rgba(4,9,18,.5)'; }}>
        <Thumb icon={item.icon} accent="#2ff3ff" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: '#eaf6ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
              color: item.status === 'פורסם' ? '#7effc9' : '#ffce8a',
              background: item.status === 'פורסם' ? 'rgba(74,222,128,.12)' : 'rgba(255,184,107,.12)',
              border: '1px solid ' + (item.status === 'פורסם' ? 'rgba(74,222,128,.4)' : 'rgba(255,184,107,.4)') }}>{item.status}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            <Chip>{item.type}</Chip><Chip>{item.scenes} סצנות</Chip><Chip>כיתה {item.grade}</Chip>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11, flexWrap: 'wrap' }}>
            <span style={{ ...micro, fontSize: 10, color: hexA(sourceColor[item.source] || '#9fb6cf', .9) }}>◇ {item.source}</span>
            <span style={{ fontSize: 11, color: '#6b7f99' }}>{item.when}</span>
            <div style={{ flex: 1 }} />
            <button onClick={(e) => { e.stopPropagation(); onShare(item); }} style={{ ...lfor, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="share" size={13} stroke="#bfe9ff" />שתף</button>
            <button onClick={(e) => e.stopPropagation()} style={lfor}>ערוך</button>
            <button onClick={(e) => e.stopPropagation()} style={{ ...lfor, color: '#04101c', background: 'linear-gradient(120deg,#2ff3ff,#9b8cff)', border: 'none', fontWeight: 700 }}>הפעל</button>
          </div>
        </div>
      </div>
    );
  }
  const lfor = { fontSize: 12, fontWeight: 600, color: '#bfe9ff', padding: '5px 11px', borderRadius: 9, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(120,200,255,.3)', fontFamily: "'Rubik',sans-serif" };

  function CommunityCard({ item, added, onAdd }) {
    return (
      <div style={{ display: 'flex', gap: 14, padding: 14, borderRadius: 14, background: 'rgba(4,9,18,.5)', border: '1px solid rgba(255,69,230,.14)', transition: 'all .18s' }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,69,230,.4)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,69,230,.14)'; }}>
        <Thumb icon={item.icon} accent="#ff45e6" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#eaf6ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
          <div style={{ fontSize: 12, color: '#a98cc0', marginTop: 3 }}>מאת {item.author}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
            <Chip>{item.type}</Chip><Chip>{item.scenes} סצנות</Chip><Chip>כיתה {item.grade}</Chip>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#ffd76b' }}>★ {item.rating}</span>
            <span style={{ fontSize: 11, color: '#6b7f99' }}>· {item.uses} שימושים</span>
          </div>
        </div>
        <button onClick={() => !added && onAdd(item)} disabled={added} style={{ alignSelf: 'center', flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6, padding: '9px 13px', borderRadius: 10, cursor: added ? 'default' : 'pointer',
          fontFamily: "'Rubik',sans-serif", fontSize: 12.5, fontWeight: 700, transition: 'all .18s',
          color: added ? '#7effc9' : '#04101c',
          background: added ? 'rgba(74,222,128,.12)' : 'linear-gradient(120deg,#ff45e6,#9b8cff)',
          border: added ? '1px solid rgba(74,222,128,.4)' : 'none',
          boxShadow: added ? 'none' : '0 0 16px rgba(255,69,230,.3)' }}>
          <Icon name={added ? 'check' : 'spark'} size={15} stroke={added ? '#7effc9' : '#04101c'} sw={2.2} />
          {added ? 'נוסף' : 'הוסף'}
        </button>
      </div>
    );
  }

  function ColHead({ icon, title, kicker, count, accent, tint, action }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 16 }}>
        <span style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 10, background: hexA(accent, .08), border: '1px solid ' + hexA(accent, .3), color: accent, boxShadow: '0 0 14px ' + hexA(accent, .2) }}>
          <Icon name={icon} size={19} stroke={accent} />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16.5, fontWeight: 700, color: '#eaf6ff' }}>{title}</div>
          <div style={{ ...micro, marginTop: 2, color: hexA(accent, .7) }}>{kicker} · {count}</div>
        </div>
        {action}
      </div>
    );
  }

  function DualRange({ min, max, lo, hi, setLo, setHi }) {
    const ref = React.useRef(null);
    const drag = React.useRef(null);
    const pct = (v) => (v - min) / (max - min);
    const leftLo = (1 - pct(lo)) * 100;
    const leftHi = (1 - pct(hi)) * 100;
    const getVal = (e) => {
      const rect = ref.current.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      return Math.round(max - f * (max - min));
    };
    const onDown = (which) => (e) => { e.preventDefault(); drag.current = which; ref.current.setPointerCapture(e.pointerId); };
    const onMove = (e) => {
      if (!drag.current) return;
      const v = getVal(e);
      if (drag.current === 'lo') setLo(Math.min(Math.max(v, min), hi));
      else setHi(Math.max(Math.min(v, max), lo));
    };
    const onUp = () => { drag.current = null; };
    const mkThumb = (which, lp) => (
      <div key={which} onPointerDown={onDown(which)} style={{ position: 'absolute', left: 'calc(' + lp + '% - 7px)', top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, borderRadius: '50%', background: '#05101f', border: '2px solid #2ff3ff', boxShadow: '0 0 8px #2ff3ff', cursor: 'grab', zIndex: 3 }} />
    );
    return (
      <div ref={ref} style={{ position: 'relative', height: 28, cursor: 'pointer' }}
        onPointerMove={onMove} onPointerUp={onUp}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', height: 3, borderRadius: 3, background: 'rgba(100,140,180,.25)' }} />
        <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', height: 3, borderRadius: 3, left: leftHi + '%', width: Math.max(0, leftLo - leftHi) + '%', background: '#2ff3ff', boxShadow: '0 0 8px rgba(47,243,255,.4)' }} />
        {mkThumb('hi', leftHi)}
        {mkThumb('lo', leftLo)}
      </div>
    );
  }

  // ── Share modal ───────────────────────────────────────────────────────────
  function ShareModal({ item, onClose }) {
    const [step, setStep] = React.useState('choose');   // choose | students | community
    const [sent, setSent] = React.useState(false);
    // students step
    const [q, setQ] = React.useState('');
    const [layer, setLayer] = React.useState('');
    const [cls, setCls] = React.useState('');
    const [picked, setPicked] = React.useState({});
    // community step — editable meta
    const [meta, setMeta] = React.useState({
      title: item.title, desc: 'הדמיה אינטראקטיבית בנושא ' + item.subject + ' — ' + item.scenes + ' סצנות עם חידות ומשימות.',
      subject: item.subject, type: item.type, grade: item.grade,
    });

    const classOpts = layer ? (SHARE_CLASSES[layer] || []) : Object.values(SHARE_CLASSES).flat();
    const roster = SHARE_ROSTER.filter((s) => {
      if (layer && s.layer !== layer) return false;
      if (cls && s.cls !== cls) return false;
      if (q.trim() && !s.name.includes(q.trim())) return false;
      return true;
    });
    const pickedCount = Object.values(picked).filter(Boolean).length;
    const allPicked = roster.length > 0 && roster.every((s) => picked[s.id]);
    const toggleAll = () => {
      if (allPicked) { setPicked((p) => { const n = { ...p }; roster.forEach((s) => delete n[s.id]); return n; }); }
      else { setPicked((p) => { const n = { ...p }; roster.forEach((s) => n[s.id] = true); return n; }); }
    };

    const overlay = { position: 'fixed', inset: 0, zIndex: 200, display: 'grid', placeItems: 'center', background: 'rgba(2,5,12,.74)', backdropFilter: 'blur(7px)', padding: 24 };
    const card = { ...glass, width: 'min(680px, 94vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderColor: 'rgba(47,243,255,.28)', boxShadow: '0 40px 120px -30px rgba(0,0,0,.95), 0 0 60px -20px rgba(47,243,255,.4)' };
    const field = { width: '100%', background: 'rgba(4,9,18,.6)', border: '1px solid rgba(120,200,255,.18)', borderRadius: 10, padding: '11px 14px', color: '#eaf6ff', fontSize: 14, fontFamily: "'Rubik',sans-serif", outline: 'none', boxSizing: 'border-box' };
    const sendBtn = (label, dis) => (
      <button onClick={() => { if (!dis) { setSent(true); setTimeout(onClose, 1300); } }} disabled={dis}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '13px', borderRadius: 12, cursor: dis ? 'not-allowed' : 'pointer',
          fontFamily: "'Rubik',sans-serif", fontSize: 15, fontWeight: 700, color: dis ? 'rgba(150,190,220,.5)' : '#04101c',
          background: dis ? 'rgba(20,30,50,.6)' : 'linear-gradient(120deg,#2ff3ff,#9b8cff)', border: 'none',
          boxShadow: dis ? 'none' : '0 0 22px rgba(47,243,255,.35)', transition: 'all .15s' }}>
        <Icon name="share" size={17} stroke={dis ? 'rgba(150,190,220,.5)' : '#04101c'} sw={2} />{label}
      </button>
    );

    return (
      <div style={overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div style={card}>
          {/* header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '18px 22px', borderBottom: '1px solid rgba(120,200,255,.12)', flex: '0 0 auto' }}>
            {step !== 'choose' && !sent && (
              <button onClick={() => setStep('choose')} style={{ display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: 9, cursor: 'pointer', background: 'rgba(120,200,255,.08)', border: '1px solid rgba(120,200,255,.2)', color: '#bfe9ff', fontSize: 17 }}>
                ›
              </button>
            )}
            <Thumb icon={item.icon} accent="#2ff3ff" size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...micro, color: 'rgba(47,243,255,.7)', fontSize: 9.5 }}>שיתוף הדמיה</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#eaf6ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
            </div>
            <button onClick={onClose} style={{ display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: 9, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(120,200,255,.18)', color: '#9fb6cf', fontSize: 17 }}>✕</button>
          </div>

          {sent ? (
            <div style={{ padding: '52px 30px', textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, margin: '0 auto 18px', borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(74,222,128,.12)', border: '1px solid rgba(74,222,128,.5)', boxShadow: '0 0 30px rgba(74,222,128,.3)' }}>
                <Icon name="check" size={32} stroke="#7effc9" sw={2.4} />
              </div>
              <div style={{ fontSize: 19, fontWeight: 700, color: '#eaf6ff' }}>ההדמיה נשלחה!</div>
              <div style={{ fontSize: 14, color: '#9fb6cf', marginTop: 6 }}>{step === 'students' ? pickedCount + ' תלמידים יקבלו את ההדמיה' : 'ההדמיה נשלחה לאישור קהילת המורים'}</div>
            </div>
          ) : step === 'choose' ? (
            <div style={{ padding: '26px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {[
                { k: 'students', icon: 'people', accent: '#2ff3ff', title: 'תלמידים', sub: 'שלח/י ישירות לתלמידים נבחרים בכיתות שלך' },
                { k: 'community', icon: 'layers', accent: '#ff45e6', title: 'קהילת המורים', sub: 'פרסם/י את ההדמיה במאגר המשותף לכלל המורים' },
              ].map((o) => (
                <button key={o.k} onClick={() => setStep(o.k)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12, padding: '24px 20px', borderRadius: 16, cursor: 'pointer', textAlign: 'right',
                  background: hexA(o.accent, .06), border: '1px solid ' + hexA(o.accent, .28), transition: 'all .18s', fontFamily: "'Rubik',sans-serif" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = hexA(o.accent, .13); e.currentTarget.style.borderColor = hexA(o.accent, .6); e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = hexA(o.accent, .06); e.currentTarget.style.borderColor = hexA(o.accent, .28); e.currentTarget.style.transform = 'none'; }}>
                  <span style={{ display: 'grid', placeItems: 'center', width: 46, height: 46, borderRadius: 12, background: hexA(o.accent, .1), border: '1px solid ' + hexA(o.accent, .35), boxShadow: '0 0 18px ' + hexA(o.accent, .25) }}>
                    <Icon name={o.icon} size={24} stroke={o.accent} />
                  </span>
                  <div style={{ fontSize: 17, fontWeight: 700, color: '#eaf6ff' }}>{o.title}</div>
                  <div style={{ fontSize: 12.5, color: '#9fb6cf', lineHeight: 1.5 }}>{o.sub}</div>
                </button>
              ))}
            </div>
          ) : step === 'students' ? (
            <React.Fragment>
              <div style={{ padding: '16px 22px 12px', display: 'flex', flexDirection: 'column', gap: 11, flex: '0 0 auto', borderBottom: '1px solid rgba(120,200,255,.1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, background: 'rgba(4,9,18,.6)', border: '1px solid rgba(47,243,255,.13)', borderRadius: 10, padding: '8px 13px' }}>
                  <Icon name="search" size={18} stroke="#7ef6ff" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי שם תלמיד…" style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#eaf6ff', fontSize: 14, fontFamily: "'Rubik',sans-serif" }} />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ ...micro, fontSize: 9, color: 'rgba(47,243,255,.7)', marginBottom: 5 }}>שכבה</div>
                    <window.HoloDropdown value={layer || 'כל השכבות'} options={['כל השכבות', ...SHARE_LAYERS]} onChange={(v) => { setLayer(v === 'כל השכבות' ? '' : v); setCls(''); }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ ...micro, fontSize: 9, color: 'rgba(47,243,255,.7)', marginBottom: 5 }}>כיתה</div>
                    <window.HoloDropdown value={cls || 'כל הכיתות'} options={['כל הכיתות', ...classOpts]} onChange={(v) => setCls(v === 'כל הכיתות' ? '' : v)} />
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 22px', flex: '0 0 auto' }}>
                <button onClick={toggleAll} style={{ fontSize: 12.5, fontWeight: 600, color: '#7ef6ff', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: "'Rubik',sans-serif", padding: 0 }}>{allPicked ? 'בטל בחירה' : 'בחר/י את כל המוצגים'}</button>
                <span style={{ fontSize: 12.5, color: '#9fb6cf' }}>{pickedCount} נבחרו</span>
              </div>
              <div className="lib-scroll" style={{ flex: 1, minHeight: 120, overflowY: 'auto', overflowX: 'hidden', padding: '0 14px 8px 22px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                {roster.length ? roster.map((s) => {
                  const on = !!picked[s.id];
                  return (
                    <button key={s.id} onClick={() => setPicked((p) => ({ ...p, [s.id]: !p[s.id] }))} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '11px 14px', borderRadius: 11, cursor: 'pointer', textAlign: 'right', fontFamily: "'Rubik',sans-serif",
                      background: on ? 'rgba(47,243,255,.08)' : 'rgba(4,9,18,.5)', border: '1px solid ' + (on ? 'rgba(47,243,255,.5)' : 'rgba(120,200,255,.1)'), transition: 'all .14s' }}>
                      <span style={{ display: 'grid', placeItems: 'center', width: 22, height: 22, borderRadius: 6, flex: '0 0 auto', background: on ? 'linear-gradient(120deg,#2ff3ff,#9b8cff)' : 'transparent', border: '1px solid ' + (on ? 'transparent' : 'rgba(120,200,255,.35)') }}>
                        {on && <Icon name="check" size={14} stroke="#04101c" sw={3} />}
                      </span>
                      <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600, color: '#eaf6ff' }}>{s.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#7ef6ff', padding: '3px 11px', borderRadius: 20, background: 'rgba(47,243,255,.08)', border: '1px solid rgba(47,243,255,.22)' }}>{s.cls}</span>
                    </button>
                  );
                }) : <div style={{ ...micro, color: 'rgba(140,170,200,.5)', textAlign: 'center', padding: '26px 0', fontSize: 11 }}>אין תלמידים תואמים</div>}
              </div>
              <div style={{ padding: '14px 22px', borderTop: '1px solid rgba(120,200,255,.12)', flex: '0 0 auto' }}>{sendBtn('שלח ל-' + pickedCount + ' תלמידים', pickedCount === 0)}</div>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <div className="lib-scroll" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ ...micro, fontSize: 10, color: 'rgba(255,69,230,.75)' }}>פרטי ההדמיה · ניתן לעריכה לפני הפרסום</div>
                <div>
                  <label style={{ fontSize: 12.5, color: '#9fb6cf', display: 'block', marginBottom: 7 }}>שם ההדמיה</label>
                  <input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} style={field} />
                </div>
                <div>
                  <label style={{ fontSize: 12.5, color: '#9fb6cf', display: 'block', marginBottom: 7 }}>תיאור</label>
                  <textarea value={meta.desc} onChange={(e) => setMeta({ ...meta, desc: e.target.value })} rows={3} style={{ ...field, resize: 'vertical', lineHeight: 1.5 }} />
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12.5, color: '#9fb6cf', display: 'block', marginBottom: 7 }}>נושא / מקצוע</label>
                    <window.HoloDropdown value={meta.subject} options={SUBJECTS} onChange={(v) => setMeta({ ...meta, subject: v })} accent="#ff45e6" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12.5, color: '#9fb6cf', display: 'block', marginBottom: 7 }}>סוג חידות</label>
                    <window.HoloDropdown value={meta.type} options={['הרפתקה', 'סיור']} onChange={(v) => setMeta({ ...meta, type: v })} accent="#ff45e6" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12.5, color: '#9fb6cf', display: 'block', marginBottom: 7 }}>שכבת גיל</label>
                    <window.HoloDropdown value={meta.grade} options={GRADES} onChange={(v) => setMeta({ ...meta, grade: v })} accent="#ff45e6" />
                  </div>
                </div>
              </div>
              <div style={{ padding: '14px 22px', borderTop: '1px solid rgba(120,200,255,.12)', flex: '0 0 auto' }}>{sendBtn('פרסם בקהילת המורים', !meta.title.trim())}</div>
            </React.Fragment>
          )}
        </div>
      </div>
    );
  }

  window.HoloLibrary = function HoloLibrary({ onCreate }) {
    const [mine, setMine] = React.useState(MINE_SEED);
    const [added, setAdded] = React.useState({});
    const [query, setQuery] = React.useState('');
    const [subjOn, setSubjOn] = React.useState({});
    const [lo, setLo] = React.useState(0);
    const [hi, setHi] = React.useState(GRADES.length - 1);
    const [shareItem, setShareItem] = React.useState(null);
    const addToLib = (item) => {
      setAdded((a) => ({ ...a, [item.id]: true }));
      setMine((m) => [{ id: 'lib-' + item.id, title: item.title, subject: item.subject, type: item.type, icon: item.icon, scenes: item.scenes, grade: item.grade, status: 'טיוטה', source: 'הורד', when: 'הרגע' }, ...m]);
    };
    const toggleSubj = (sub) => setSubjOn((p) => { const n = { ...p }; if (n[sub]) delete n[sub]; else n[sub] = true; return n; });
    const subjKeys = Object.keys(subjOn);
    const dirty = subjKeys.length || query.trim() || lo > 0 || hi < GRADES.length - 1;
    const clearAll = () => { setQuery(''); setSubjOn({}); setLo(0); setHi(GRADES.length - 1); };
    const match = (it, fields) => {
      if (query.trim() && !fields.some((f) => (f || '').toLowerCase().includes(query.trim().toLowerCase()))) return false;
      if (subjKeys.length) {
        const ok = subjOn[it.subject] || (subjOn['אחר'] && !SUBJECTS.includes(it.subject));
        if (!ok) return false;
      }
      const gi = GRADES.indexOf(it.grade);
      if (gi >= 0 && (gi < lo || gi > hi)) return false;
      return true;
    };
    const mineF = mine.filter((it) => match(it, [it.title]));
    const commF = COMMUNITY.filter((it) => match(it, [it.title, it.author]));

    const colWrap = { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' };
    const panel = { ...glass, padding: 22, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 };
    const empty = <div style={{ ...micro, color: 'rgba(140,170,200,.5)', textAlign: 'center', padding: '30px 0', fontSize: 11 }}>אין תוצאות</div>;

    return (
      <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 30px 26px', minHeight: 0 }}>

        {/* Filter window across both columns */}
        <div style={{ ...glass, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14, flex: '0 0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(4,9,18,.5)', border: '1px solid rgba(47,243,255,.13)', borderRadius: 10, padding: '8px 14px' }}>
            <Icon name="search" size={20} stroke="#7ef6ff" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש לפי נושא או יוצר…"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#eaf6ff', fontSize: 15, fontFamily: "'Rubik',sans-serif" }} />
            {dirty && <button onClick={clearAll} style={{ fontSize: 12, fontWeight: 600, color: '#ff8af0', padding: '6px 13px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,69,230,.4)', fontFamily: "'Rubik',sans-serif", whiteSpace: 'nowrap' }}>נקה סינון</button>}
          </div>
          <div style={{ height: 1, background: 'rgba(120,200,255,.1)' }} />
          <div>
            <div style={{ ...micro, color: 'rgba(47,243,255,.7)', marginBottom: 10 }}>מקצוע</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, flex: 1, minWidth: 220 }}>
                {[...SUBJECTS, 'אחר'].map((sub) => {
                  const on = !!subjOn[sub];
                  return (
                    <button key={sub} onClick={() => toggleSubj(sub)} style={{ padding: '8px 15px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Rubik',sans-serif", transition: 'all .15s',
                      background: on ? 'linear-gradient(120deg, rgba(47,243,255,.22), rgba(255,69,230,.16))' : 'rgba(4,9,18,.5)',
                      border: '1px solid ' + (on ? 'rgba(47,243,255,.55)' : 'rgba(120,200,255,.16)'),
                      color: on ? '#fff' : '#9fb6cf', boxShadow: on ? '0 0 14px rgba(47,243,255,.2)' : 'none' }}>{sub}</button>
                  );
                })}
              </div>
              <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 10, paddingRight: 16, borderRight: '1px solid rgba(120,200,255,.12)' }}>
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div style={{ ...micro, fontSize: 9, color: 'rgba(255,69,230,.75)' }}>רמת כתיבה</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#7ef6ff' }}>{GRADES[lo]} – {GRADES[hi]}</div>
                </div>
                <div style={{ width: 375 }}><DualRange min={0} max={GRADES.length - 1} lo={lo} hi={hi} setLo={setLo} setHi={setHi} /></div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', gap: 18, minHeight: 0 }}>
          {/* Column 1 · הספרייה שלי */}
          <div style={colWrap}>
            <div style={panel}>
              <ColHead icon="books" title="הספרייה שלי" kicker="MY LIBRARY" count={mineF.length + ' הדמיות'} accent="#2ff3ff"
                action={<button onClick={onCreate} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 10, cursor: 'pointer', fontFamily: "'Rubik',sans-serif", fontSize: 13, fontWeight: 700, color: '#04101c', background: 'linear-gradient(120deg,#2ff3ff,#9b8cff)', border: 'none', boxShadow: '0 0 16px rgba(47,243,255,.3)' }}><Icon name="spark" size={15} stroke="#04101c" sw={2.2} />חדשה</button>} />
              <div className="lib-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 11, flex: 1, minHeight: 0, paddingLeft: 10 }}>
                {mineF.length ? mineF.map((it) => <MineCard key={it.id} item={it} onShare={setShareItem} />) : empty}
              </div>
            </div>
          </div>

          {/* Column 2 · הדמיות מוכנות */}
          <div style={colWrap}>
            <div style={panel}>
              <ColHead icon="layers" title="הדמיות מוכנות" kicker="COMMUNITY" count={commF.length + ' זמינות'} accent="#ff45e6" />
              <div className="lib-scroll lib-mag" style={{ display: 'flex', flexDirection: 'column', gap: 11, flex: 1, minHeight: 0, paddingLeft: 10 }}>
                {commF.length ? commF.map((it) => <CommunityCard key={it.id} item={it} added={!!added[it.id]} onAdd={addToLib} />) : empty}
              </div>
            </div>
          </div>
        </div>
        {shareItem && <ShareModal item={shareItem} onClose={() => setShareItem(null)} />}
      </div>
    );
  };
})();
