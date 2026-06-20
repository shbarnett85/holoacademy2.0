// students.jsx — "תלמידים" page for HoloAcademy creator.
// Search + filter bar (layer/class/name) + student list with action buttons.

(function () {
  const { React } = window;

  const micro = { fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase' };
  const glass = {
    background: 'linear-gradient(135deg, rgba(10,22,46,.82), rgba(4,9,20,.9))',
    border: '1px solid rgba(47,243,255,.13)',
    borderRadius: 16,
    backdropFilter: 'blur(18px)',
  };

  const LAYERS = ['א–ב', 'ג–ד', 'ה–ו', 'ז–ח', 'ט–י', 'י"א–י"ב'];
  const CLASSES = ['א1', 'א2', 'ב1', 'ב2', 'ג1', 'ג2', 'ד1', 'ד2', 'ה1', 'ה2', 'ו1', 'ז1', 'ז2', 'ח1', 'ח2', 'ט1', 'י1', 'י"א1', 'י"ב1'];

  const STUDENTS = [
    { id: 1,  name: 'נועה כהן',       class: 'ז1',   layer: 'ז–ח', avg: 88, sims: 14, lastActive: 'היום, 09:14', classCode: 'Z1A',   secret: '4829' },
    { id: 2,  name: 'יואב לוי',       class: 'ז1',   layer: 'ז–ח', avg: 74, sims: 11, lastActive: 'אתמול, 16:40', classCode: 'Z1A',   secret: '7163' },
    { id: 3,  name: 'מיה ברק',        class: 'ז2',   layer: 'ז–ח', avg: 92, sims: 17, lastActive: 'היום, 08:55', classCode: 'Z2B',   secret: '3047' },
    { id: 4,  name: 'עמית שפירא',     class: 'ח1',   layer: 'ז–ח', avg: 65, sims: 8,  lastActive: 'לפני 3 ימים', classCode: 'H1C',   secret: '9512' },
    { id: 5,  name: 'תמר אביב',       class: 'ח1',   layer: 'ז–ח', avg: 81, sims: 12, lastActive: 'אתמול, 14:22', classCode: 'H1C',   secret: '6384' },
    { id: 6,  name: 'רון גלילי',      class: 'ח2',   layer: 'ז–ח', avg: 57, sims: 6,  lastActive: 'לפני שבוע', classCode: 'H2D',   secret: '2751' },
    { id: 7,  name: 'שיר מזרחי',      class: 'ט1',   layer: 'ט–י', avg: 95, sims: 20, lastActive: 'היום, 11:03', classCode: 'T1E',   secret: '8830' },
    { id: 8,  name: 'אור פרידמן',     class: 'ט1',   layer: 'ט–י', avg: 70, sims: 9,  lastActive: 'אתמול, 10:18', classCode: 'T1E',   secret: '1496' },
    { id: 9,  name: 'ליה דמארי',      class: 'י1',   layer: 'ט–י', avg: 83, sims: 15, lastActive: 'היום, 13:47', classCode: 'Y1F',   secret: '5027' },
    { id: 10, name: 'איתי שרון',      class: 'י1',   layer: 'ט–י', avg: 61, sims: 7,  lastActive: 'לפני 4 ימים', classCode: 'Y1F',   secret: '3618' },
    { id: 11, name: 'גל כספי',        class: 'י"א1', layer: 'י"א–י"ב', avg: 90, sims: 18, lastActive: 'היום, 07:59', classCode: 'K1G',   secret: '7742' },
    { id: 12, name: 'ניל שמיר',       class: 'י"ב1', layer: 'י"א–י"ב', avg: 77, sims: 13, lastActive: 'אתמול, 15:30', classCode: 'L1H',   secret: '4903' },
    { id: 13, name: 'הדר פז',         class: 'ה1',   layer: 'ה–ו', avg: 86, sims: 10, lastActive: 'אתמול, 12:00', classCode: 'H4I',   secret: '6159' },
    { id: 14, name: 'בר עמרני',       class: 'ו1',   layer: 'ה–ו', avg: 72, sims: 9,  lastActive: 'לפני 2 ימים', classCode: 'V1J',   secret: '8274' },
    { id: 15, name: 'ליאור קדם',      class: 'ד1',   layer: 'ג–ד', avg: 68, sims: 5,  lastActive: 'לפני 5 ימים', classCode: 'G3K',   secret: '3361' },
  ];

  function scoreColor(v) {
    if (v >= 85) return '#2ff3ff';
    if (v >= 70) return '#a3f9c8';
    if (v >= 55) return '#ffd97a';
    return '#ff7a8a';
  }

  // ── Holographic dropdown ──────────────────────────────────────────────────
  function HoloSelect({ value, onChange, options, placeholder }) {
    return (
      <div style={{ position: 'relative', flex: '0 0 auto' }}>
        <select value={value} onChange={(e) => onChange(e.target.value)}
          style={{
            appearance: 'none', WebkitAppearance: 'none',
            background: 'rgba(4,9,18,.6)',
            border: '1px solid rgba(47,243,255,.22)',
            borderRadius: 9, color: value ? '#eaf6ff' : '#5a7a99',
            fontFamily: "'Rubik',sans-serif", fontSize: 13, fontWeight: 600,
            padding: '7px 30px 7px 14px', cursor: 'pointer', outline: 'none',
            minWidth: 120,
          }}>
          <option value="">{placeholder}</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#2ff3ff', fontSize: 10 }}>▾</div>
      </div>
    );
  }

  // ── Action button ─────────────────────────────────────────────────────────
  function ActionBtn({ label, color, rgb, onClick }) {
    const [hov, setHov] = React.useState(false);
    return (
      <button onClick={onClick}
        onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        style={{
          flex: '0 0 auto',
          fontFamily: "'Rubik',sans-serif", fontSize: 12, fontWeight: 700,
          padding: '7px 14px', borderRadius: 7, cursor: 'pointer', whiteSpace: 'nowrap',
          background: hov ? `rgba(${rgb},.2)` : `rgba(${rgb},.07)`,
          border: `1px solid ${hov ? color : `rgba(${rgb},.32)`}`,
          color: hov ? '#fff' : color,
          transition: 'all .15s',
          boxShadow: hov ? `0 0 12px rgba(${rgb},.4)` : 'none',
        }}>{label}</button>
    );
  }

  // ── Modal placeholder ─────────────────────────────────────────────────────
  function Modal({ title, student, onClose }) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(4,6,14,.75)', backdropFilter: 'blur(6px)' }}
        onClick={onClose}>
        <div style={{ ...glass, padding: '32px 40px', minWidth: 340, textAlign: 'center', boxShadow: '0 0 60px rgba(47,243,255,.12)' }}
          onClick={(e) => e.stopPropagation()}>
          <div style={{ ...micro, color: 'rgba(47,243,255,.7)', marginBottom: 10 }}>◇ {title}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 6 }}>{student.name}</div>
          <div style={{ fontSize: 13, color: '#5a8aaa', marginBottom: 22 }}>כיתה {student.class}</div>
          <div style={{ fontSize: 13, color: '#9fb6cf', lineHeight: 1.7 }}>
            תוכן {title} יוצג כאן בשלב הבא של הפיתוח.
          </div>
          <button onClick={onClose} style={{ marginTop: 24, fontFamily: "'Rubik',sans-serif", fontSize: 13, fontWeight: 700, padding: '8px 22px', borderRadius: 9, cursor: 'pointer', background: 'rgba(47,243,255,.12)', border: '1px solid rgba(47,243,255,.3)', color: '#2ff3ff' }}>סגור</button>
        </div>
      </div>
    );
  }

  // ── Main component ────────────────────────────────────────────────────────
  window.HoloStudents = function HoloStudents() {
    const [query,    setQuery]    = React.useState('');
    const [layer,    setLayer]    = React.useState('');
    const [klass,    setKlass]    = React.useState('');
    const [modal,    setModal]    = React.useState(null); // { student, action }

    const filtered = STUDENTS.filter((st) => {
      if (query.trim() && !st.name.includes(query.trim())) return false;
      if (layer && st.layer !== layer) return false;
      if (klass && st.class !== klass) return false;
      return true;
    });

    const dirty = query.trim() || layer || klass;
    const clearAll = () => { setQuery(''); setLayer(''); setKlass(''); };

    const colHdr = { ...micro, fontSize: 9.5, color: 'rgba(47,243,255,.55)', padding: '0 10px 10px', textAlign: 'right' };

    return (
      <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column', padding: '0 30px 26px', minHeight: 0 }}>

        {/* ── Filter bar ───────────────────────────────────────────── */}
        <div style={{ ...glass, padding: '14px 20px', marginBottom: 16, flex: '0 0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>

            {/* search box */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(4,9,18,.5)', border: '1px solid rgba(47,243,255,.13)', borderRadius: 10, padding: '7px 14px', flex: '1 1 180px', minWidth: 160 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7ef6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="חיפוש לפי שם תלמיד…"
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#eaf6ff', fontSize: 14, fontFamily: "'Rubik',sans-serif", direction: 'rtl' }} />
            </div>

            {/* שכבה */}
            <HoloSelect value={layer} onChange={setLayer} options={LAYERS} placeholder="שכבה" />

            {/* כיתה — filtered by layer */}
            <HoloSelect
              value={klass}
              onChange={setKlass}
              options={CLASSES.filter((c) => !layer || STUDENTS.some((s) => s.class === c && s.layer === layer))}
              placeholder="כיתה"
            />

            {dirty && (
              <button onClick={clearAll} style={{ fontFamily: "'Rubik',sans-serif", fontSize: 12, fontWeight: 600, color: '#ff8af0', padding: '7px 14px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,69,230,.4)', whiteSpace: 'nowrap' }}>
                נקה סינון
              </button>
            )}

            <div style={{ ...micro, fontSize: 10, color: 'rgba(47,243,255,.5)', marginRight: 'auto' }}>
              {filtered.length} תלמידים
            </div>
          </div>
        </div>

        {/* ── Student list ─────────────────────────────────────────── */}
        <div style={{ ...glass, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>

          {/* header row */}
          <div style={{ display: 'grid', gridTemplateColumns: '180px 68px 90px 90px 110px 1fr', columnGap: 24, alignItems: 'center', padding: '10px 28px 0', borderBottom: '1px solid rgba(47,243,255,.08)' }}>
            <div style={colHdr}>שם תלמיד</div>
            <div style={colHdr}>כיתה</div>
            <div style={colHdr}>קוד כיתה</div>
            <div style={colHdr}>קוד סודי</div>
            <div style={colHdr}>פעילות אחרונה</div>
            <div style={{ ...colHdr, paddingRight: 18 }}>פעולות</div>
          </div>

          {/* rows */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}
            className="holo-scroll">
            <style>{`
              .holo-scroll::-webkit-scrollbar { width: 5px; }
              .holo-scroll::-webkit-scrollbar-track { background: rgba(4,9,18,.4); border-radius: 4px; }
              .holo-scroll::-webkit-scrollbar-thumb { background: rgba(47,243,255,.25); border-radius: 4px; }
              .holo-scroll::-webkit-scrollbar-thumb:hover { background: rgba(47,243,255,.5); }
              select option { background: #070a18; color: #eaf6ff; }
            `}</style>

            {filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#4a6a88', fontSize: 14 }}>לא נמצאו תלמידים תואמים</div>
            )}

            {filtered.map((st, i) => (
              <StudentRow key={st.id} st={st} i={i} onAction={(action) => setModal({ student: st, action })} />
            ))}
          </div>
        </div>

        {/* ── Modal ────────────────────────────────────────────────── */}
        {modal && <Modal title={modal.action} student={modal.student} onClose={() => setModal(null)} />}
      </div>
    );
  };

  function StudentRow({ st, i, onAction }) {
    const [hov, setHov] = React.useState(false);
    return (
      <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        style={{
          display: 'grid', gridTemplateColumns: '180px 68px 90px 90px 110px 1fr', columnGap: 24,
          alignItems: 'center', padding: '10px 28px',
          background: hov ? 'rgba(47,243,255,.04)' : (i % 2 === 0 ? 'transparent' : 'rgba(4,9,18,.3)'),
          borderBottom: '1px solid rgba(47,243,255,.05)',
          transition: 'background .15s',
        }}>

        {/* שם */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg, rgba(47,243,255,.2), rgba(255,69,230,.15))`, border: '1px solid rgba(47,243,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#7ef6ff', flexShrink: 0 }}>
            {st.name[0]}
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#ddeeff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.name}</span>
        </div>

        {/* כיתה */}
        <div style={{ fontSize: 13, color: '#7ab0d0', fontWeight: 600 }}>{st.class}</div>

        {/* קוד כיתה */}
        <div style={{ fontFamily:"'Space Mono',monospace", fontSize: 11.5, fontWeight: 700, color: '#2ff3ff', letterSpacing: '.08em' }}>{st.classCode}</div>

        {/* קוד סודי */}
        <div style={{ fontFamily:"'Space Mono',monospace", fontSize: 11.5, fontWeight: 700, color: 'rgba(255,69,230,.8)', letterSpacing: '.08em' }}>{st.secret}</div>

        {/* פעילות אחרונה */}
        <div style={{ fontSize: 12, color: '#7ab0d0' }}>{st.lastActive}</div>

        {/* פעולות */}
        <div style={{ display: 'flex', gap: 70, paddingRight: 14 }}>
          <ActionBtn label="פרטים"        color="#2ff3ff" rgb="47,243,255"  onClick={() => onAction('פרטים')} />
          <ActionBtn label="הגדרות קושי"  color="#ff45e6" rgb="255,69,230"  onClick={() => onAction('הגדרות קושי')} />
          <ActionBtn label="סיכום פדגוגי" color="#ff9a2e" rgb="255,154,46"  onClick={() => onAction('סיכום פדגוגי')} />
        </div>
      </div>
    );
  }
})();
