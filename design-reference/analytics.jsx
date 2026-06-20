// analytics.jsx — Analytics page for HoloAcademy creator.
// Line chart (progress) + 4 pie/donut charts.

(function () {
  const { React } = window;

  const micro = { fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase' };
  const glass = {
    background: 'linear-gradient(135deg, rgba(10,22,46,.82), rgba(4,9,20,.9))',
    border: '1px solid rgba(47,243,255,.13)',
    borderRadius: 16,
    backdropFilter: 'blur(18px)',
  };

  const PALETTE = ['#2ff3ff', '#ff45e6', '#ff9a2e', '#46f5a3', '#a855f7', '#fff', '#ffd97a', '#ff7a8a'];

  // ── Mock data generators ──────────────────────────────────────────────────
  const PERIOD_META = {
    'שבוע':   { n: 7,  labels: ['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'] },
    'חודש':   { n: 30, labels: Array.from({length:30},(_,i)=>String(i+1)) },
    'מחצית':  { n: 26, labels: Array.from({length:26},(_,i)=>'ש'+(i+1)) },
    'שנה':    { n: 12, labels: ['ינו','פבר','מרץ','אפר','מאי','יונ','יול','אוג','ספט','אוק','נוב','דצמ'] },
    'הכל':    { n: 24, labels: Array.from({length:24},(_,i)=>`${Math.floor(i/12)+2024}/${(i%12)+1}`) },
  };
  const METRIC_META = {
    'רמת כתיבה':   { base: 4,  range: 6  },
    'רמת אתגרים':  { base: 3,  range: 7  },
    'אחוזי הצלחה': { base: 62, range: 28 },
    'זמן משחק':    { base: 18, range: 42 },
  };

  function makeLineData(metric, period) {
    const { n, labels } = PERIOD_META[period];
    const { base, range } = METRIC_META[metric];
    // deterministic pseudo-random via sin
    const values = Array.from({length: n}, (_, i) => {
      const noise = (Math.sin(i * 7.3 + metric.length) + 1) / 2;
      return base + (i / (n - 1)) * range * 0.55 + noise * range * 0.45;
    });
    return { labels, values };
  }

  // ── Line chart ────────────────────────────────────────────────────────────
  function LineChart({ metric, period }) {
    const { labels, values } = React.useMemo(() => makeLineData(metric, period), [metric, period]);
    const W = 800, H = 190;
    const PAD = { top: 18, right: 24, bottom: 28, left: 48 };
    const iW = W - PAD.left - PAD.right;
    const iH = H - PAD.top - PAD.bottom;
    const maxV = Math.max(...values);
    const minV = Math.min(...values);
    const span = maxV - minV || 1;
    const xOf = (i) => PAD.left + (i / Math.max(values.length - 1, 1)) * iW;
    const yOf = (v) => PAD.top + iH - ((v - minV) / span) * iH;
    const linePath = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
    const areaPath = linePath + ` L${xOf(values.length-1).toFixed(1)},${(PAD.top+iH).toFixed(1)} L${PAD.left},${(PAD.top+iH).toFixed(1)}Z`;
    const yTicks = 4;
    const maxShow = 14;
    const step = Math.max(1, Math.ceil(labels.length / maxShow));

    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="none">
        <defs>
          <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2ff3ff" stopOpacity=".18"/>
            <stop offset="100%" stopColor="#2ff3ff" stopOpacity="0"/>
          </linearGradient>
          <filter id="lg"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        {/* grid */}
        {Array.from({length:yTicks+1},(_,i)=>{
          const yy = PAD.top + (i/yTicks)*iH;
          const v = maxV - (i/yTicks)*span;
          return <g key={i}>
            <line x1={PAD.left} y1={yy} x2={W-PAD.right} y2={yy} stroke="rgba(47,243,255,.07)" strokeWidth="1"/>
            <text x={PAD.left-6} y={yy+4} textAnchor="end" fill="rgba(47,243,255,.45)" fontSize="9" fontFamily="Space Mono">{v.toFixed(0)}</text>
          </g>;
        })}
        {/* x labels */}
        {labels.map((l,i)=>{
          if (i % step !== 0 && i !== labels.length-1) return null;
          return <text key={i} x={xOf(i)} y={H-4} textAnchor="middle" fill="rgba(47,243,255,.38)" fontSize="8.5" fontFamily="Space Mono">{l}</text>;
        })}
        {/* area + line */}
        <path d={areaPath} fill="url(#ag)"/>
        <path d={linePath} fill="none" stroke="#2ff3ff" strokeWidth="2.2" strokeLinejoin="round" filter="url(#lg)"/>
        {/* dots */}
        {values.map((v,i)=>{
          if (values.length > 16 && i % 2 !== 0) return null;
          return <circle key={i} cx={xOf(i)} cy={yOf(v)} r="3.2" fill="#05101f" stroke="#2ff3ff" strokeWidth="1.6"/>;
        })}
      </svg>
    );
  }

  // ── Bar chart ─────────────────────────────────────────────────────────
  function BarChart({ data, title, unit }) {
    const [hov, setHov] = React.useState(null);
    const maxV = Math.max(...data.map((d) => d.value));
    const W = 260, H = 160;
    const PAD = { top: 12, right: 10, bottom: 32, left: 36 };
    const iW = W - PAD.left - PAD.right;
    const iH = H - PAD.top - PAD.bottom;
    const barW = iW / data.length;
    const barPad = barW * 0.22;

    return (
      <div style={{ ...glass, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <div style={{ ...micro, fontSize: 8.5, color: 'rgba(47,243,255,.6)', lineHeight: 1.3 }}>◇ {title}</div>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ overflow: 'visible' }}>
          <defs>
            {data.map((_, i) => (
              <linearGradient key={i} id={`bg${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PALETTE[i % PALETTE.length]} stopOpacity="0.9" />
                <stop offset="100%" stopColor={PALETTE[i % PALETTE.length]} stopOpacity="0.3" />
              </linearGradient>
            ))}
            <filter id="bfg"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          </defs>

          {/* y grid + labels */}
          {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
            const yy = PAD.top + iH * (1 - t);
            const v = maxV * t;
            return (
              <g key={i}>
                <line x1={PAD.left} y1={yy} x2={W - PAD.right} y2={yy} stroke="rgba(47,243,255,.07)" strokeWidth="1" />
                <text x={PAD.left - 4} y={yy + 3.5} textAnchor="end" fill="rgba(47,243,255,.4)" fontSize="8" fontFamily="Space Mono">{v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}</text>
              </g>
            );
          })}

          {/* bars */}
          {data.map((d, i) => {
            const bh = (d.value / maxV) * iH;
            const bx = PAD.left + i * barW + barPad;
            const by = PAD.top + iH - bh;
            const bww = barW - barPad * 2;
            const isHov = hov === i;
            return (
              <g key={i}
                onMouseEnter={() => setHov(i)}
                onMouseLeave={() => setHov(null)}
                style={{ cursor: 'pointer' }}>
                <rect x={bx} y={by} width={bww} height={bh}
                  rx="3" fill={`url(#bg${i})`}
                  opacity={hov === null || isHov ? 1 : 0.45}
                  filter={isHov ? 'url(#bfg)' : ''}
                  style={{ transition: 'opacity .15s' }} />
                {/* value on hover */}
                {isHov && (
                  <text x={bx + bww / 2} y={by - 4} textAnchor="middle"
                    fill={PALETTE[i % PALETTE.length]} fontSize="9" fontFamily="Space Mono" fontWeight="700">
                    {d.value}{unit || ''}
                  </text>
                )}
                {/* x label */}
                <text
                  x={bx + bww / 2} y={PAD.top + iH + 14}
                  textAnchor="middle" fill="rgba(47,243,255,.45)" fontSize="7.5" fontFamily="Rubik">
                  {d.label.length > 7 ? d.label.slice(0, 7) + '…' : d.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  // ── Donut chart ───────────────────────────────────────────────────────────
  function DonutChart({ data, title }) {
    const [hov, setHov] = React.useState(null);
    const total = data.reduce((s,d)=>s+d.value,0);
    const R = 62, Ri = 38, CX = 88, CY = 80;
    let angle = -Math.PI / 2;
    const slices = data.map((d,i)=>{
      const sweep = (d.value / total) * 2 * Math.PI;
      const end = angle + sweep;
      const large = sweep > Math.PI ? 1 : 0;
      const cos1 = Math.cos(angle), sin1 = Math.sin(angle);
      const cos2 = Math.cos(end),   sin2 = Math.sin(end);
      const path = [
        `M ${(CX+Ri*cos1).toFixed(2)} ${(CY+Ri*sin1).toFixed(2)}`,
        `L ${(CX+R *cos1).toFixed(2)} ${(CY+R *sin1).toFixed(2)}`,
        `A ${R} ${R} 0 ${large} 1 ${(CX+R *cos2).toFixed(2)} ${(CY+R *sin2).toFixed(2)}`,
        `L ${(CX+Ri*cos2).toFixed(2)} ${(CY+Ri*sin2).toFixed(2)}`,
        `A ${Ri} ${Ri} 0 ${large} 0 ${(CX+Ri*cos1).toFixed(2)} ${(CY+Ri*sin1).toFixed(2)}`,
        'Z'
      ].join(' ');
      const mid = angle + sweep/2;
      const s = { path, color: PALETTE[i%PALETTE.length], label: d.label, value: d.value, pct: ((d.value/total)*100).toFixed(0), mid };
      angle = end;
      return s;
    });
    const active = hov !== null ? slices[hov] : null;

    return (
      <div style={{ ...glass, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <div style={{ ...micro, fontSize: 8.5, color: 'rgba(47,243,255,.6)', lineHeight: 1.3 }}>◇ {title}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
          {/* donut */}
          <svg viewBox={`0 0 176 160`} style={{ width: 130, flexShrink: 0 }}>
            <defs>
              <filter id="dg"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            </defs>
            {slices.map((s,i)=>(
              <path key={i} d={s.path}
                fill={s.color} opacity={hov === null || hov === i ? 0.88 : 0.35}
                stroke="#070a18" strokeWidth="1.2"
                filter={hov===i ? 'url(#dg)' : ''}
                style={{ cursor:'pointer', transition:'opacity .15s' }}
                onMouseEnter={()=>setHov(i)} onMouseLeave={()=>setHov(null)}
                transform={hov===i ? `translate(${(Math.cos(s.mid)*4).toFixed(1)},${(Math.sin(s.mid)*4).toFixed(1)})` : ''}
              />
            ))}
            {/* center label */}
            {active ? (
              <>
                <text x={CX} y={CY-6} textAnchor="middle" fill={active.color} fontSize="16" fontFamily="Rubik" fontWeight="800">{active.pct}%</text>
                <text x={CX} y={CY+10} textAnchor="middle" fill="rgba(180,220,255,.7)" fontSize="7.5" fontFamily="Rubik">{active.label}</text>
              </>
            ) : (
              <>
                <text x={CX} y={CY-4} textAnchor="middle" fill="#7ef6ff" fontSize="18" fontFamily="Rubik" fontWeight="800">{typeof data[0].value === 'number' && data[0].value < 20 ? total.toFixed(1) : total}</text>
                <text x={CX} y={CY+11} textAnchor="middle" fill="rgba(47,243,255,.45)" fontSize="7.5" fontFamily="Space Mono">סה״כ</text>
              </>
            )}
          </svg>
          {/* legend */}
          <div style={{ flex:1, display:'flex', flexDirection:'column', gap:4, minWidth:0 }}>
            {slices.map((s,i)=>(
              <div key={i} style={{ display:'flex', alignItems:'center', gap:5, opacity: hov===null||hov===i ? 1 : 0.45, transition:'opacity .15s', cursor:'pointer' }}
                onMouseEnter={()=>setHov(i)} onMouseLeave={()=>setHov(null)}>
                <div style={{ width:7, height:7, borderRadius:2, background:s.color, flexShrink:0, boxShadow:`0 0 5px ${s.color}` }}/>
                <div style={{ fontSize:10.5, color:'#b0cce0', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.label}</div>
                <div style={{ fontSize:10.5, fontWeight:700, color:s.color, flexShrink:0 }}>{s.pct}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Constants ─────────────────────────────────────────────────────────────
  const METRICS = ['רמת כתיבה','רמת אתגרים','אחוזי הצלחה','זמן משחק'];
  const PERIODS = ['שבוע','חודש','מחצית','שנה','הכל'];

  const PIE_DATA = {
    completion: [
      { label:'הושלמו',    value:142 },
      { label:'בתהליך',    value:58  },
      { label:'לא התחיל', value:34  },
      { label:'נזנח',      value:21  },
    ],
    attempts: [
      { label:'רב-ברירה',        value:87 },
      { label:'השלמת משפט',      value:63 },
      { label:'גרירה',            value:45 },
      { label:'מבחן סיכום',      value:38 },
      { label:'כתיבה חופשית',   value:22 },
    ],
    errors: [
      { label:'רב-ברירה',        value:2.1 },
      { label:'השלמת משפט',      value:3.4 },
      { label:'גרירה',            value:1.8 },
      { label:'מבחן סיכום',      value:4.2 },
      { label:'כתיבה חופשית',   value:5.1 },
    ],
    shards: [
      { label:'נועה כהן',   value:340 },
      { label:'מיה ברק',   value:290 },
      { label:'שיר מזרחי', value:275 },
      { label:'גל כספי',   value:240 },
      { label:'תמר אביב',  value:210 },
      { label:'אחרים',      value:520 },
    ],
  };

  // ── Tab button ────────────────────────────────────────────────────────────
  function TabBtn({ label, active, onClick, accent }) {
    const rgb = accent || '47,243,255';
    return (
      <button onClick={onClick} style={{
        fontFamily:"'Rubik',sans-serif", fontSize:11.5, fontWeight: active ? 700 : 500,
        padding:'5px 13px', borderRadius:7, cursor:'pointer', whiteSpace:'nowrap',
        background: active ? `rgba(${rgb},.18)` : 'transparent',
        border:`1px solid ${active ? `rgba(${rgb},.5)` : 'rgba(47,243,255,.1)'}`,
        color: active ? '#fff' : 'rgba(150,190,220,.55)',
        transition:'all .15s',
        boxShadow: active ? `0 0 10px rgba(${rgb},.25)` : 'none',
      }}>{label}</button>
    );
  }

  const LAYERS_A  = ['א–ב','ג–ד','ה–ו','ז–ח','ט–י','י"א–י"ב'];

  // layer → classes mapping
  const LAYER_CLASSES = {
    'א–ב':       ['א1','א2','ב1','ב2'],
    'ג–ד':       ['ג1','ג2','ד1','ד2'],
    'ה–ו':       ['ה1','ה2','ו1'],
    'ז–ח':       ['ז1','ז2','ח1','ח2'],
    'ט–י':       ['ט1','י1'],
    'י"א–י"ב':   ['י"א1','י"ב1'],
  };
  const ALL_CLASSES_A = Object.values(LAYER_CLASSES).flat();

  // student → {class, layer}
  const STUDENT_META = [
    { name:'נועה כהן',   cls:'ז1',    layer:'ז–ח' },
    { name:'יואב לוי',   cls:'ז1',    layer:'ז–ח' },
    { name:'מיה ברק',    cls:'ז2',    layer:'ז–ח' },
    { name:'עמית שפירא', cls:'ח1',    layer:'ז–ח' },
    { name:'תמר אביב',   cls:'ח1',    layer:'ז–ח' },
    { name:'רון גלילי',  cls:'ח2',    layer:'ז–ח' },
    { name:'שיר מזרחי',  cls:'ט1',    layer:'ט–י' },
    { name:'אור פרידמן', cls:'ט1',    layer:'ט–י' },
    { name:'ליה דמארי',  cls:'י1',    layer:'ט–י' },
    { name:'איתי שרון',  cls:'י1',    layer:'ט–י' },
    { name:'גל כספי',    cls:'י"א1',  layer:'י"א–י"ב' },
    { name:'ניל שמיר',   cls:'י"ב1',  layer:'י"א–י"ב' },
    { name:'הדר פז',     cls:'ה1',    layer:'ה–ו' },
    { name:'בר עמרני',   cls:'ו1',    layer:'ה–ו' },
    { name:'ליאור קדם',  cls:'ד1',    layer:'ג–ד' },
  ];
  const ALL_STUDENTS_A = STUDENT_META.map((s)=>s.name);

  function HoloSelectA({ value, onChange, options, placeholder }) {
    return (
      <div style={{ position:'relative', flex:'0 0 auto' }}>
        <select value={value} onChange={(e)=>onChange(e.target.value)}
          style={{ appearance:'none', WebkitAppearance:'none', background:'rgba(4,9,18,.6)', border:'1px solid rgba(47,243,255,.22)', borderRadius:9, color: value ? '#eaf6ff' : '#5a7a99', fontFamily:"'Rubik',sans-serif", fontSize:13, fontWeight:600, padding:'7px 28px 7px 14px', cursor:'pointer', outline:'none', minWidth:110 }}>
          <option value="">{placeholder}</option>
          {options.map((o)=><option key={o} value={o}>{o}</option>)}
        </select>
        <div style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', color:'#2ff3ff', fontSize:10 }}>▾</div>
      </div>
    );
  }

  // ── Main ──────────────────────────────────────────────────────────────────
  window.HoloAnalytics = function HoloAnalytics() {
    const [metric, setMetric] = React.useState('אחוזי הצלחה');
    const [period, setPeriod] = React.useState('חודש');
    const [query,   setQuery]   = React.useState('');
    const [layer,   setLayer]   = React.useState('');
    const [klass,   setKlass]   = React.useState('');
    const [student, setStudent] = React.useState('');
    const dirty = query.trim() || layer || klass || student;
    const clearAll = () => { setQuery(''); setLayer(''); setKlass(''); setStudent(''); };
    // cascading options
    const availClasses  = layer ? LAYER_CLASSES[layer] : ALL_CLASSES_A;
    const availStudents = STUDENT_META
      .filter((s) => !layer || s.layer === layer)
      .filter((s) => !klass || s.cls === klass)
      .filter((s) => !query.trim() || s.name.includes(query.trim()))
      .map((s) => s.name);
    const filtStudents = availStudents;

    return (
      <div style={{ position:'relative', zIndex:2, flex:1, display:'flex', flexDirection:'column', padding:'0 30px 26px', gap:18, minHeight:0, overflowY:'auto' }}
        className="holo-scroll">
        <style>{`
          .holo-scroll::-webkit-scrollbar{width:5px}
          .holo-scroll::-webkit-scrollbar-track{background:rgba(4,9,18,.4);border-radius:4px}
          .holo-scroll::-webkit-scrollbar-thumb{background:rgba(47,243,255,.25);border-radius:4px}
          .holo-scroll::-webkit-scrollbar-thumb:hover{background:rgba(47,243,255,.5)}
          select option{background:#070a18;color:#eaf6ff}
        `}</style>

        {/* ── Filter bar */}
        <div style={{ ...glass, padding:'12px 20px', flex:'0 0 auto' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, background:'rgba(4,9,18,.5)', border:'1px solid rgba(47,243,255,.13)', borderRadius:10, padding:'7px 14px', flex:'1 1 160px', minWidth:140 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7ef6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="חיפוש לפי שם תלמיד…"
                style={{ flex:1, background:'transparent', border:'none', outline:'none', color:'#eaf6ff', fontSize:13, fontFamily:"'Rubik',sans-serif", direction:'rtl' }} />
            </div>
            <HoloSelectA value={layer}   onChange={(v)=>{setLayer(v);setKlass('');setStudent('');}} options={LAYERS_A}      placeholder="שכבה" />
            <HoloSelectA value={klass}   onChange={(v)=>{setKlass(v);setStudent('');}}              options={availClasses}  placeholder="כיתה" />
            <HoloSelectA value={student} onChange={setStudent}                                      options={filtStudents}  placeholder="תלמיד" />
            {dirty && (
              <button onClick={clearAll} style={{ fontFamily:"'Rubik',sans-serif", fontSize:12, fontWeight:600, color:'#ff8af0', padding:'7px 14px', borderRadius:8, cursor:'pointer', background:'transparent', border:'1px solid rgba(255,69,230,.4)', whiteSpace:'nowrap' }}>
                נקה סינון
              </button>
            )}
            {dirty && (
              <div style={{ fontFamily:"'Space Mono',monospace", fontSize:9.5, letterSpacing:'.16em', textTransform:'uppercase', color:'rgba(47,243,255,.45)', marginRight:'auto' }}>
                {layer && <span>{layer}</span>}{klass && <span> · כיתה {klass}</span>}{student && <span> · {student}</span>}
              </div>
            )}
          </div>
        </div>

        {/* ── Progress line chart ────────────────────────────── */}
        <div style={{ ...glass, padding:'18px 22px', flex:'0 0 auto' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14, flexWrap:'wrap', gap:10 }}>
            <div>
              <div style={{ ...micro, fontSize:9, color:'rgba(47,243,255,.6)', marginBottom:8 }}>◇ גרף התקדמות</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {METRICS.map((m)=>(
                  <TabBtn key={m} label={m} active={m===metric} onClick={()=>setMetric(m)} />
                ))}
              </div>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              {PERIODS.map((p)=>(
                <TabBtn key={p} label={p} active={p===period} onClick={()=>setPeriod(p)} accent="255,69,230" />
              ))}
            </div>
          </div>
          <div style={{ height:200 }}>
            <LineChart metric={metric} period={period} />
          </div>
        </div>

        {/* ── 4 donut charts ─────────────────────────────────── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, flex:'0 0 auto' }}>
          <DonutChart title="סטטוס השלמת משימות"              data={PIE_DATA.completion} />
          <DonutChart title="התפלגות ניסיונות לפי סוג אתגר"  data={PIE_DATA.attempts}   />
          <BarChart   title="ממוצע טעויות לפי סוג אתגר"       data={PIE_DATA.errors}    unit=" טעויות" />
          <BarChart   title="התפלגות רסיסים לפי תלמיד"        data={PIE_DATA.shards}    unit=" רסיסים" />
        </div>
      </div>
    );
  };
})();
