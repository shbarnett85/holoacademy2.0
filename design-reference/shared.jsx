// shared.jsx — HoloAcademy creator: fonts, tokens, data, state hook, holo primitives.
// Exports to window: HOLO_DATA, useCreatorState, HoloIcon, injectHoloFonts.

(function () {
  // ---- Fonts (Hebrew-capable display/UI + Latin mono for HUD readouts) ----
  if (!document.getElementById('holo-fonts')) {
    const l = document.createElement('link');
    l.id = 'holo-fonts';
    l.rel = 'stylesheet';
    l.href =
      'https://fonts.googleapis.com/css2?family=Rubik:wght@300;400;500;600;700;800&family=Heebo:wght@300;400;500;700&family=Space+Mono:wght@400;700&display=swap';
    document.head.appendChild(l);
  }

  // ---- Global keyframes + base resets used by both directions ----
  if (!document.getElementById('holo-keyframes')) {
    const s = document.createElement('style');
    s.id = 'holo-keyframes';
    s.textContent = `
      @keyframes holo-spin { to { transform: rotate(360deg); } }
      @keyframes holo-spin-rev { to { transform: rotate(-360deg); } }
      @keyframes holo-float { 0%,100%{ transform: translateY(0);} 50%{ transform: translateY(-10px);} }
      @keyframes holo-float-sm { 0%,100%{ transform: translateY(0);} 50%{ transform: translateY(-5px);} }
      @keyframes holo-rise { 0%{ transform: translateY(0); opacity:0;} 12%{opacity:.9;} 88%{opacity:.9;} 100%{ transform: translateY(-220px); opacity:0;} }
      @keyframes holo-scan { 0%{ transform: translateY(-100%);} 100%{ transform: translateY(900%);} }
      @keyframes holo-pulse { 0%,100%{ opacity:.55; } 50%{ opacity:1; } }
      @keyframes holo-flicker { 0%,100%{opacity:1;} 92%{opacity:1;} 94%{opacity:.78;} 96%{opacity:1;} 97%{opacity:.85;} }
      @keyframes holo-dash { to { stroke-dashoffset: -1000; } }
      @keyframes holo-glowpulse { 0%,100%{ filter: drop-shadow(0 0 6px var(--c1)); } 50%{ filter: drop-shadow(0 0 16px var(--c1)); } }
      @keyframes holo-sweepX { 0%{ transform: translateX(-120%);} 100%{ transform: translateX(120%);} }
      @keyframes holo-nodepop { 0%{ transform: scale(0); opacity:0;} 60%{ transform: scale(1.25);} 100%{ transform: scale(1); opacity:1;} }
      @keyframes holo-ringgrow { 0%{ transform: scale(.2); opacity:.9;} 100%{ transform: scale(1.8); opacity:0;} }
    `;
    document.head.appendChild(s);
  }

  // ---- Data ----
  const PUZZLES = [
    { id: 'mc',         label: 'שאלות רב-ברירה', icon: 'list',     hasQty: true },
    { id: 'tf',         label: 'נכון / לא נכון',  icon: 'toggle' },
    { id: 'key',        label: 'שימוש במפתח',     icon: 'key' },
    { id: 'slide',      label: 'פאזל הזזה',       icon: 'grid' },
    { id: 'wordsearch', label: 'חיפוש מילים',     icon: 'search' },
    { id: 'memory',     label: 'זיכרון',          icon: 'cards' },
    { id: 'fill',       label: 'השלמת מילים',     icon: 'blank' },
    { id: 'exam',       label: 'מבחן סיכום',      icon: 'doc' },
  ];

  const SIM_TYPES = [
    { id: 'tour',      label: 'סיור',    desc: 'חקירה חופשית ולמידה',  icon: 'orbit' },
    { id: 'adventure', label: 'הרפתקה',  desc: 'מסע עם אתגרים ומשימות', icon: 'quest' },
  ];

  const ART_STYLES = [
    { id: 'digital', label: 'ציור דיגיטלי' },
    { id: 'real',    label: 'ריאליסטי' },
    { id: 'comic',   label: 'קומיקס' },
    { id: 'pixel',   label: 'פיקסל ארט' },
  ];

  const GRADES = ['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ז׳','ח׳','ט׳','י׳','י״א','י״ב'];

  window.HOLO_DATA = { PUZZLES, SIM_TYPES, ART_STYLES, GRADES };

  // ---- State hook (independent per direction) ----
  window.useCreatorState = function useCreatorState() {
    const R = React;
    const [title, setTitle]               = R.useState('יפן הפיאודלית');
    const [content, setContent]           = R.useState('סמוראים, שוגון וקיסר — עליית מעמד הלוחמים ביפן של ימי הביניים.');
    const [simType, setSimType]           = R.useState('adventure');
    const [length, setLength]             = R.useState(7);
    const [puzzles, setPuzzles]           = R.useState({ mc: true });
    const [qty, setQty]                   = R.useState({ mc: 2 }); // per-puzzle quantity
    const [writingLevel, setWritingLevel] = R.useState(6); // index → ז׳
    const [difficulty, setDifficulty]     = R.useState(5);
    const [drHolo, setDrHolo]             = R.useState(true);
    const [artStyle, setArtStyle]         = R.useState('digital');
    const [phase, setPhase]               = R.useState('idle'); // idle | generating | ready
    const timer = R.useRef(null);

    const togglePuzzle = (id) =>
      setPuzzles((p) => { const n = { ...p }; if (n[id]) delete n[id]; else n[id] = true; return n; });

    const puzzleCount = Object.keys(puzzles).length;
    const getQty = (id) => (qty[id] != null ? qty[id] : 2);
    const setPuzzleQty = (id, n) => setQty((q) => ({ ...q, [id]: n }));

    const generate = R.useCallback(() => {
      setPhase('generating');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setPhase('ready'), 2600);
    }, []);

    const reset = () => { clearTimeout(timer.current); setPhase('idle'); };

    R.useEffect(() => () => clearTimeout(timer.current), []);

    return {
      title, setTitle, content, setContent, simType, setSimType,
      length, setLength, puzzles, togglePuzzle, puzzleCount, getQty, setPuzzleQty,
      writingLevel, setWritingLevel, difficulty, setDifficulty,
      drHolo, setDrHolo, artStyle, setArtStyle,
      phase, generate, reset,
    };
  };

  // ---- Neon quantity dropdown (used by all puzzle types) ----
  function hexA(h, a) {
    const n = parseInt(h.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  window.HoloDropdown = function HoloDropdown({ value, options, onChange, accent = '#2ff3ff' }) {
    const R = React;
    const [open, setOpen] = R.useState(false);
    const ref = R.useRef(null);
    R.useEffect(() => {
      if (!open) return;
      const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
      document.addEventListener('mousedown', h);
      return () => document.removeEventListener('mousedown', h);
    }, [open]);
    return (
      <div ref={ref} style={{ position: 'relative', flex: '0 0 auto' }}>
        <button onClick={() => setOpen((o) => !o)} style={{
          display: 'flex', alignItems: 'center', gap: 8, minWidth: 60, justifyContent: 'space-between',
          padding: '7px 11px', borderRadius: 9, cursor: 'pointer', fontFamily: "'Space Mono',monospace",
          fontSize: 13, fontWeight: 700, color: '#eaf6ff', background: 'rgba(4,9,18,.72)',
          border: '1px solid ' + hexA(accent, .5), boxShadow: open ? '0 0 14px ' + hexA(accent, .35) : 'none',
          transition: 'all .15s' }}>
          <span>{value}</span>
          <span style={{ color: accent, fontSize: 9, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }}>▼</span>
        </button>
        {open && (
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 60, minWidth: '100%',
            maxHeight: 208, overflowY: 'auto', padding: 6, borderRadius: 11,
            background: 'linear-gradient(160deg, rgba(18,24,44,.98), rgba(8,12,26,.98))',
            border: '1px solid ' + hexA(accent, .42),
            boxShadow: '0 18px 40px -12px rgba(0,0,0,.85), 0 0 18px ' + hexA(accent, .25), backdropFilter: 'blur(10px)' }}>
            {options.map((n) => (
              <button key={n} onClick={() => { onChange(n); setOpen(false); }}
                onMouseEnter={(e) => { if (n !== value) e.currentTarget.style.background = 'rgba(255,255,255,.06)'; }}
                onMouseLeave={(e) => { if (n !== value) e.currentTarget.style.background = 'transparent'; }}
                style={{ display: 'block', width: '100%', textAlign: 'right', padding: '7px 10px', borderRadius: 7,
                  fontFamily: "'Space Mono',monospace", fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none',
                  color: n === value ? '#04101c' : '#cfe1f2', background: n === value ? accent : 'transparent', transition: 'background .12s' }}>
                {n}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ---- Minimal line-icon set (simple geometry only) ----
  window.HoloIcon = function HoloIcon({ name, size = 20, stroke = 'currentColor', sw = 1.6 }) {
    const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
      stroke, strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round' };
    const P = {
      list:   <g><line x1="9" y1="7" x2="19" y2="7"/><line x1="9" y1="12" x2="19" y2="12"/><line x1="9" y1="17" x2="19" y2="17"/><circle cx="5" cy="7" r="1.2"/><circle cx="5" cy="12" r="1.2"/><circle cx="5" cy="17" r="1.2"/></g>,
      toggle: <g><rect x="3" y="8" width="18" height="8" rx="4"/><circle cx="8" cy="12" r="2.4"/></g>,
      key:    <g><circle cx="8" cy="12" r="3.2"/><line x1="11" y1="12" x2="20" y2="12"/><line x1="17" y1="12" x2="17" y2="15.5"/><line x1="20" y1="12" x2="20" y2="15"/></g>,
      grid:   <g><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></g>,
      search: <g><circle cx="10.5" cy="10.5" r="6"/><line x1="15" y1="15" x2="20" y2="20"/></g>,
      cards:  <g><rect x="3" y="5" width="8" height="14" rx="1.5"/><rect x="13" y="5" width="8" height="14" rx="1.5"/></g>,
      blank:  <g><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="11" y2="15"/><line x1="14" y1="15" x2="20" y2="15"/></g>,
      orbit:  <g><circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="9" ry="4"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(60 12 12)"/></g>,
      quest:  <g><path d="M5 19l6-6"/><path d="M19 5l-6 6"/><path d="M14 4h6v6"/><circle cx="6" cy="18" r="1.4"/></g>,
      spark:  <g><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></g>,
      bot:    <g><rect x="5" y="8" width="14" height="11" rx="3"/><line x1="12" y1="4" x2="12" y2="8"/><circle cx="12" cy="4" r="1.2"/><circle cx="9.5" cy="13" r="1.2"/><circle cx="14.5" cy="13" r="1.2"/></g>,
      doc:    <g><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><line x1="10" y1="13" x2="15" y2="13"/><line x1="10" y1="16" x2="15" y2="16"/></g>,
      layers: <g><path d="M12 4l8 4-8 4-8-4z"/><path d="M4 12l8 4 8-4"/></g>,
      sliders:<g><line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="16" x2="20" y2="16"/><circle cx="15" cy="8" r="2.2"/><circle cx="9" cy="16" r="2.2"/></g>,
      check:  <polyline points="5 12.5 10 17.5 19 7"/>,
      share:  <g><circle cx="6" cy="12" r="2.4"/><circle cx="17" cy="6" r="2.4"/><circle cx="17" cy="18" r="2.4"/><line x1="8.1" y1="11" x2="14.9" y2="7"/><line x1="8.1" y1="13" x2="14.9" y2="17"/></g>,
      chart:  <g><line x1="4" y1="20" x2="20" y2="20"/><rect x="5.5" y="11" width="3" height="7" rx=".5"/><rect x="10.5" y="6" width="3" height="12" rx=".5"/><rect x="15.5" y="13" width="3" height="5" rx=".5"/></g>,
      people: <g><circle cx="8" cy="9" r="2.6"/><circle cx="16" cy="9" r="2.6"/><path d="M3.5 19c0-2.6 2-4.3 4.5-4.3s4.5 1.7 4.5 4.3"/><path d="M14.5 14.8c2.3.2 4 1.9 4 4.2"/></g>,
      books:  <g><rect x="4" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="16" rx="1"/><path d="M16.2 5.2l3 .8-3 14.4"/></g>,
    };
    return <svg {...common}>{P[name] || P.spark}</svg>;
  };
})();
