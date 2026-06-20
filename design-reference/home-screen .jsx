// home-screen.jsx — HoloAcademy main landing screen
// Two mode cards: מורה / תלמיד. Exports window.HoloHomeScreen.

(function () {
  const { React } = window;

  // Student roster (class code → students with PIN)
  const STUDENT_DB = [
    { name:'אור פרידמן',   classCode:'T1E', secret:'1496' },
    { name:'איתי שרון',    classCode:'Y1F', secret:'3618' },
    { name:'בר עמרני',     classCode:'V1J', secret:'8274' },
    { name:'גל כספי',      classCode:'K1G', secret:'7742' },
    { name:'הדר פז',       classCode:'H4I', secret:'6159' },
    { name:'יואב לוי',     classCode:'Z1A', secret:'7163' },
    { name:'ליאור קדם',   classCode:'G3K', secret:'3361' },
    { name:'ליה דמארי',    classCode:'Y1F', secret:'5027' },
    { name:'מיה ברק',      classCode:'Z2B', secret:'3047' },
    { name:'ניל שמיר',     classCode:'L1H', secret:'4903' },
    { name:'נועה כהן',     classCode:'Z1A', secret:'4829' },
    { name:'עמית שפירא',  classCode:'H1C', secret:'9512' },
    { name:'רון גלילי',   classCode:'H2D', secret:'2751' },
    { name:'שיר מזרחי',   classCode:'T1E', secret:'8830' },
    { name:'תמר אביב',     classCode:'H1C', secret:'6384' },
  ];
  window.HoloHomeScreen = function HoloHomeScreen({ onSelect }) {
    const [hov, setHov] = React.useState(null);
    const [entered, setEntered] = React.useState(false);
    const [showCelebration, setShowCelebration] = React.useState(false);
    const [celebName, setCelebName] = React.useState('');
    const [celebRole, setCelebRole] = React.useState('student');
    const [showCodeModal,  setShowCodeModal]  = React.useState(false);
    const [showLoginModal, setShowLoginModal] = React.useState(false);
    const [showStudentPick, setShowStudentPick] = React.useState(false);
    const [showPinModal,   setShowPinModal]   = React.useState(false);
    const [pickedStudent,  setPickedStudent]  = React.useState(null);
    const [code,    setCode]    = React.useState('');
    const [email,   setEmail]   = React.useState('');
    const [password,setPassword]= React.useState('');
    const [pin,     setPin]     = React.useState('');
    const [shake,      setShake]      = React.useState(false);
    const [loginShake, setLoginShake] = React.useState(false);
    const [pinShake,   setPinShake]   = React.useState(false);
    const [pinError,   setPinError]   = React.useState(false);

    React.useEffect(() => {
      const t = setTimeout(() => setEntered(true), 60);
      return () => clearTimeout(t);
    }, []);

    const handleSelect = (id) => {
      if (id === 'student') { setShowCodeModal(true); return; }
      if (id === 'teacher') { setShowLoginModal(true); return; }
      onSelect(id);
    };

    const submitCode = () => {
      if (code.trim().length < 3) { setShake(true); setTimeout(() => setShake(false), 500); return; }
      // find students in this class
      const inClass = STUDENT_DB.filter(s => s.classCode === code.trim().toUpperCase()).sort((a,b) => a.name.localeCompare(b.name, 'he'));
      if (inClass.length === 0) { setShake(true); setTimeout(() => setShake(false), 500); return; }
      setShowCodeModal(false);
      setShowStudentPick(true);
    };

    const submitLogin = () => {
      if (!email.trim() || !password.trim()) { setLoginShake(true); setTimeout(() => setLoginShake(false), 500); return; }
      setShowLoginModal(false);
      celebrate(email.split('@')[0], 'teacher');
    };

    const celebrate = (name, role) => {
      setCelebName(name);
      setCelebRole(role || 'student');
      setShowCelebration(true);
      setTimeout(() => { setShowCelebration(false); onSelect(role || 'student'); }, 2200);
    };

    const submitPin = () => {
      if (!pickedStudent) return;
      if (pin === pickedStudent.secret) { celebrate(pickedStudent.name); return; }
      setPinError(true); setPinShake(true);
      setTimeout(() => { setPinShake(false); setPinError(false); setPin(''); }, 700);
    };

    const studentsInClass = STUDENT_DB
      .filter(s => s.classCode === code.trim().toUpperCase())
      .sort((a,b) => a.name.localeCompare(b.name, 'he'));

    const cards = [
      {
        id: 'student',
        label: 'מצב תלמיד/ה',
        sub: 'היכנסו להדמיות, השלימו אתגרים ואספו רסיסי ידע',
        icon: (
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
        ),
        accent: '#2ff3ff',
        rgb: '47,243,255',
        grad: 'linear-gradient(135deg, rgba(47,243,255,.18), rgba(155,140,255,.10))',
        border: 'rgba(47,243,255,.45)',
      },
      {
        id: 'teacher',
        label: 'מצב מורה',
        sub: 'צרו הדמיות, נהלו כיתות ועקבו אחר התקדמות תלמידים',
        icon: (
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
          </svg>
        ),
        accent: '#ff45e6',
        rgb: '255,69,230',
        grad: 'linear-gradient(135deg, rgba(255,69,230,.18), rgba(255,154,46,.10))',
        border: 'rgba(255,69,230,.45)',
      },
    ];

    return (
      <div dir="rtl" style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(120% 90% at 50% -10%, #0c1430 0%, #070a18 45%, #04060f 100%)',
        fontFamily: "'Rubik', sans-serif", position: 'relative', overflow: 'hidden',
        opacity: entered ? 1 : 0, transform: entered ? 'none' : 'translateY(18px)',
        transition: 'opacity .45s ease, transform .45s ease',
      }}>
        {/* Background grid */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(80,150,210,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(80,150,210,.05) 1px,transparent 1px)', backgroundSize: '46px 46px', maskImage: 'radial-gradient(130% 90% at 50% 30%, #000 35%, transparent 85%)' }} />
        {/* Glow orbs */}
        <div style={{ position: 'absolute', left: -140, top: -100, width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(47,243,255,.10), transparent 70%)', filter: 'blur(30px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', right: -140, bottom: -100, width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,69,230,.10), transparent 70%)', filter: 'blur(30px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0) 0 2px, rgba(0,0,0,.13) 2px 3px)', opacity: .4 }} />

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <h1 style={{ margin: 0, fontSize: 58, fontWeight: 900, letterSpacing: '-.02em', lineHeight: 1,
            background: 'linear-gradient(135deg, #ffffff 30%, #7ef6ff 65%, #ff45e6 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            textShadow: 'none',
            filter: 'drop-shadow(0 0 32px rgba(47,243,255,.35))',
          }}>HoloAcademy</h1>
          <p style={{ margin: '14px 0 0', fontSize: 20, fontWeight: 400, color: 'rgba(180,220,255,.65)', letterSpacing: '.06em' }}>ממד חדש של למידה</p>
        </div>

        {/* Mode cards */}
        <div style={{ display: 'flex', gap: 28, direction: 'rtl' }}>
          {cards.map((c) => {
            const isHov = hov === c.id;
            return (
              <button key={c.id}
                onMouseEnter={() => setHov(c.id)}
                onMouseLeave={() => setHov(null)}
                onClick={() => handleSelect(c.id)}
                style={{
                  width: 260, padding: '36px 28px',
                  borderRadius: 22,
                  background: isHov ? c.grad : 'linear-gradient(135deg, rgba(10,22,46,.82), rgba(4,9,20,.9))',
                  border: `1px solid ${isHov ? c.border : 'rgba(120,180,220,.14)'}`,
                  backdropFilter: 'blur(18px)',
                  boxShadow: isHov ? `0 0 48px rgba(${c.rgb},.22), 0 0 120px rgba(${c.rgb},.08)` : '0 0 0 transparent',
                  cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
                  transition: 'all .22s cubic-bezier(.22,.7,.35,1)',
                  transform: isHov ? 'translateY(-4px) scale(1.025)' : 'none',
                  fontFamily: "'Rubik', sans-serif",
                }}>
                <div style={{ color: isHov ? c.accent : 'rgba(160,200,230,.55)', transition: 'color .22s', filter: isHov ? `drop-shadow(0 0 12px ${c.accent})` : 'none' }}>
                  {c.icon}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: isHov ? '#fff' : '#b0cce0', marginBottom: 10, transition: 'color .2s' }}>{c.label}</div>
                  <div style={{ fontSize: 13, color: isHov ? 'rgba(220,240,255,.7)' : 'rgba(120,160,200,.5)', lineHeight: 1.6, transition: 'color .2s' }}>{c.sub}</div>
                </div>
                <div style={{
                  marginTop: 6, padding: '9px 28px', borderRadius: 10, fontSize: 13.5, fontWeight: 700,
                  background: isHov ? `rgba(${c.rgb},.22)` : 'rgba(255,255,255,.04)',
                  border: `1px solid ${isHov ? `rgba(${c.rgb},.5)` : 'rgba(255,255,255,.08)'}`,
                  color: isHov ? c.accent : 'rgba(160,200,230,.4)',
                  transition: 'all .2s',
                  boxShadow: isHov ? `0 0 16px rgba(${c.rgb},.3)` : 'none',
                }}>כניסה</div>
              </button>
            );
          })}
        </div>

        {/* ── Student picker modal ── */}
        {showStudentPick && (
          <div style={{ position:'absolute', inset:0, zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(4,6,14,.8)', backdropFilter:'blur(8px)' }}
            onClick={() => { setShowStudentPick(false); setCode(''); }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background:'linear-gradient(135deg,rgba(10,22,46,.97),rgba(4,9,20,.99))', border:'1px solid rgba(47,243,255,.22)', borderRadius:22, padding:'32px 36px', width:360, maxHeight:'70vh', display:'flex', flexDirection:'column', boxShadow:'0 0 80px rgba(47,243,255,.12),0 20px 60px rgba(0,0,0,.6)' }}>
              <div style={{ fontFamily:"'Space Mono',monospace", fontSize:9.5, letterSpacing:'.22em', textTransform:'uppercase', color:'rgba(47,243,255,.6)', marginBottom:10 }}>◇ קוד כיתה: {code.toUpperCase()}</div>
              <div style={{ fontSize:20, fontWeight:800, color:'#fff', marginBottom:6 }}>מי את/ה?</div>
              <div style={{ fontSize:13, color:'rgba(160,200,240,.5)', marginBottom:20 }}>בחר/י את השם שלך</div>
              <div style={{ overflowY:'auto', display:'flex', flexDirection:'column', gap:8 }}>
                {studentsInClass.map(st => (
                  <button key={st.name} onClick={() => { setPickedStudent(st); setShowStudentPick(false); setShowPinModal(true); setPin(''); }}
                    style={{ width:'100%', padding:'12px 16px', borderRadius:11, cursor:'pointer', fontFamily:"'Rubik',sans-serif", fontSize:15, fontWeight:600, color:'#ddeeff', background:'rgba(4,9,18,.6)', border:'1px solid rgba(47,243,255,.15)', textAlign:'right', transition:'all .15s' }}
                    onMouseEnter={e=>{ e.currentTarget.style.background='rgba(47,243,255,.12)'; e.currentTarget.style.borderColor='rgba(47,243,255,.5)'; e.currentTarget.style.color='#fff'; }}
                    onMouseLeave={e=>{ e.currentTarget.style.background='rgba(4,9,18,.6)'; e.currentTarget.style.borderColor='rgba(47,243,255,.15)'; e.currentTarget.style.color='#ddeeff'; }}>
                    {st.name}
                  </button>
                ))}
              </div>
              <button onClick={() => { setShowStudentPick(false); setCode(''); }} style={{ marginTop:18, fontFamily:"'Rubik',sans-serif", fontSize:13, fontWeight:600, color:'rgba(150,190,220,.5)', padding:'9px', borderRadius:10, cursor:'pointer', background:'transparent', border:'1px solid rgba(120,180,220,.15)' }}>ביטול</button>
            </div>
          </div>
        )}

        {/* ── PIN modal ── */}
        {showPinModal && pickedStudent && (
          <div style={{ position:'absolute', inset:0, zIndex:101, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(4,6,14,.8)', backdropFilter:'blur(8px)' }}
            onClick={() => { setShowPinModal(false); setShowStudentPick(true); setPin(''); }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background:'linear-gradient(135deg,rgba(10,22,46,.97),rgba(4,9,20,.99))', border:`1px solid rgba(47,243,255,.22)`, borderRadius:22, padding:'40px 44px', width:360, textAlign:'center', boxShadow:'0 0 80px rgba(47,243,255,.10),0 20px 60px rgba(0,0,0,.6)', animation: pinShake ? 'shake .4s ease' : 'none' }}>
              <div style={{ fontSize:22, fontWeight:800, color:'#fff', marginBottom:6 }}>שלום {pickedStudent.name}!</div>
              <div style={{ fontSize:14, color:'rgba(160,200,240,.55)', marginBottom:28, lineHeight:1.6 }}>מה הקוד הסודי שלך?</div>
              <div style={{ display:'flex', gap:12, justifyContent:'center', marginBottom:24 }}>
                {[0,1,2,3].map(i => (
                  <div key={i} style={{ width:52, height:58, borderRadius:12, background:'rgba(4,9,18,.8)', border:`2px solid ${pinError ? 'rgba(255,80,80,.7)' : pin.length > i ? 'rgba(47,243,255,.8)' : 'rgba(47,243,255,.2)'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, fontWeight:900, color: pinError ? '#ff6060' : '#2ff3ff', fontFamily:"'Space Mono',monospace", boxShadow: pin.length > i ? `0 0 16px rgba(47,243,255,.4)` : 'none', transition:'all .15s' }}>
                    {pin.length > i ? '●' : ''}
                  </div>
                ))}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, maxWidth:220, margin:'0 auto 20px' }}>
                {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((k,i) => (
                  <button key={i} onClick={() => {
                    if (k === '⌫') { setPin(p => p.slice(0,-1)); setPinError(false); }
                    else if (k !== '' && pin.length < 4) { const np = pin + k; setPin(np); if (np.length === 4) setTimeout(() => { if (np === pickedStudent.secret) { celebrate(pickedStudent.name); } else { setPinError(true); setPinShake(true); setTimeout(() => { setPinShake(false); setPinError(false); setPin(''); },700); } },120); }
                  }} style={{ padding:'14px 0', borderRadius:10, fontFamily:"'Space Mono',monospace", fontSize:18, fontWeight:700, color: k==='' ? 'transparent' : '#ddeeff', background: k==='' ? 'transparent' : 'rgba(4,9,18,.6)', border: k==='' ? 'none' : '1px solid rgba(47,243,255,.15)', cursor: k==='' ? 'default' : 'pointer', transition:'all .12s' }}
                    onMouseEnter={e=>{ if(k!=='') { e.currentTarget.style.background='rgba(47,243,255,.14)'; e.currentTarget.style.color='#fff'; }}}
                    onMouseLeave={e=>{ if(k!=='') { e.currentTarget.style.background='rgba(4,9,18,.6)'; e.currentTarget.style.color='#ddeeff'; }}}>
                    {k}
                  </button>
                ))}
              </div>
              <button onClick={() => { setShowPinModal(false); setShowStudentPick(true); setPin(''); }} style={{ fontFamily:"'Rubik',sans-serif", fontSize:13, fontWeight:600, color:'rgba(150,190,220,.5)', padding:'9px 22px', borderRadius:10, cursor:'pointer', background:'transparent', border:'1px solid rgba(120,180,220,.15)' }}>חזרה</button>
            </div>
          </div>
        )}

        {/* ── Class code modal ── */}
        {showCodeModal && (
          <div style={{ position:'absolute', inset:0, zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(4,6,14,.75)', backdropFilter:'blur(8px)' }}
            onClick={() => { setShowCodeModal(false); setCode(''); }}>
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background:'linear-gradient(135deg, rgba(10,22,46,.95), rgba(4,9,20,.98))',
                border:'1px solid rgba(47,243,255,.25)', borderRadius:22,
                padding:'40px 44px', width:380, textAlign:'center',
                boxShadow:'0 0 80px rgba(47,243,255,.12), 0 20px 60px rgba(0,0,0,.6)',
                animation: shake ? 'shake .4s ease' : 'none',
              }}>
              <style>{`
                @keyframes shake {
                  0%,100%{transform:translateX(0)}
                  20%{transform:translateX(-8px)}
                  40%{transform:translateX(8px)}
                  60%{transform:translateX(-6px)}
                  80%{transform:translateX(6px)}
                }
              `}</style>
              {/* icon */}
              <div style={{ width:56, height:56, borderRadius:16, background:'rgba(47,243,255,.08)', border:'1px solid rgba(47,243,255,.3)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 22px', boxShadow:'0 0 24px rgba(47,243,255,.15)' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2ff3ff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <div style={{ fontSize:22, fontWeight:800, color:'#fff', marginBottom:8 }}>קוד כיתה</div>
              <div style={{ fontSize:14, color:'rgba(160,200,240,.6)', marginBottom:28, lineHeight:1.6 }}>מה קוד הכיתה שקיבלתם מהמורה?</div>
              <input
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && submitCode()}
                placeholder="לדוגמה: ABC123"
                maxLength={8}
                style={{
                  width:'100%', boxSizing:'border-box',
                  background:'rgba(4,9,18,.7)', border:'1px solid rgba(47,243,255,.3)',
                  borderRadius:12, padding:'14px 18px', fontSize:22, fontWeight:700,
                  color:'#2ff3ff', fontFamily:"'Space Mono',monospace", outline:'none',
                  textAlign:'center', letterSpacing:'.25em',
                  boxShadow:'0 0 20px rgba(47,243,255,.08)',
                  direction:'ltr',
                }}
              />
              <div style={{ display:'flex', gap:12, marginTop:22 }}>
                <button onClick={() => { setShowCodeModal(false); setCode(''); }}
                  style={{ flex:1, padding:'12px', borderRadius:11, cursor:'pointer', fontFamily:"'Rubik',sans-serif", fontSize:14, fontWeight:600, background:'transparent', border:'1px solid rgba(120,180,220,.2)', color:'rgba(150,190,220,.55)' }}>
                  ביטול
                </button>
                <button onClick={submitCode}
                  style={{ flex:2, padding:'12px', borderRadius:11, cursor:'pointer', fontFamily:"'Rubik',sans-serif", fontSize:15, fontWeight:700, color:'#fff', background:'linear-gradient(135deg, rgba(47,243,255,.22), rgba(47,243,255,.12))', border:'1px solid rgba(47,243,255,.5)', boxShadow:'0 0 20px rgba(47,243,255,.2)' }}>
                  כניסה
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Teacher login modal ── */}
        {showLoginModal && (
          <div style={{ position:'absolute', inset:0, zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(4,6,14,.75)', backdropFilter:'blur(8px)' }}
            onClick={() => { setShowLoginModal(false); setEmail(''); setPassword(''); }}>
            <div onClick={(e) => e.stopPropagation()}
              style={{
                background:'linear-gradient(135deg, rgba(10,22,46,.97), rgba(4,9,20,.99))',
                border:'1px solid rgba(255,69,230,.22)', borderRadius:22,
                padding:'40px 44px', width:400, textAlign:'center',
                boxShadow:'0 0 80px rgba(255,69,230,.10), 0 20px 60px rgba(0,0,0,.6)',
                animation: loginShake ? 'shake .4s ease' : 'none',
              }}>
              {/* icon */}
              <div style={{ width:56, height:56, borderRadius:16, background:'rgba(255,69,230,.08)', border:'1px solid rgba(255,69,230,.3)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 18px', boxShadow:'0 0 24px rgba(255,69,230,.15)' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff45e6" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                </svg>
              </div>
              <div style={{ fontSize:20, fontWeight:800, color:'#fff', marginBottom:6 }}>מורים ומנהלים</div>
              <div style={{ fontSize:13.5, color:'rgba(160,200,240,.5)', marginBottom:28 }}>אימייל וסיסמא</div>

              {/* email */}
              <div style={{ textAlign:'right', marginBottom:14 }}>
                <label style={{ display:'block', fontFamily:"'Rubik',sans-serif", fontSize:12, color:'rgba(47,243,255,.6)', marginBottom:7, letterSpacing:'.05em' }}>אימייל</label>
                <input
                  autoFocus
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitLogin()}
                  placeholder="name@school.edu"
                  style={{ width:'100%', boxSizing:'border-box', background:'rgba(4,9,18,.7)', border:'1px solid rgba(255,69,230,.22)', borderRadius:11, padding:'12px 16px', fontSize:14, color:'#eaf6ff', fontFamily:"'Rubik',sans-serif", outline:'none', direction:'ltr', letterSpacing:'.02em' }}
                />
              </div>

              {/* password */}
              <div style={{ textAlign:'right', marginBottom:26 }}>
                <label style={{ display:'block', fontFamily:"'Rubik',sans-serif", fontSize:12, color:'rgba(47,243,255,.6)', marginBottom:7, letterSpacing:'.05em' }}>סיסמא</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitLogin()}
                  placeholder="••••••••"
                  style={{ width:'100%', boxSizing:'border-box', background:'rgba(4,9,18,.7)', border:'1px solid rgba(255,69,230,.22)', borderRadius:11, padding:'12px 16px', fontSize:18, color:'#eaf6ff', fontFamily:"'Rubik',sans-serif", outline:'none', direction:'ltr', letterSpacing:'.12em' }}
                />
              </div>

              <div style={{ display:'flex', gap:12 }}>
                <button onClick={() => { setShowLoginModal(false); setEmail(''); setPassword(''); }}
                  style={{ flex:1, padding:'12px', borderRadius:11, cursor:'pointer', fontFamily:"'Rubik',sans-serif", fontSize:14, fontWeight:600, background:'transparent', border:'1px solid rgba(120,180,220,.2)', color:'rgba(150,190,220,.55)' }}>
                  ביטול
                </button>
                <button onClick={submitLogin}
                  style={{ flex:2, padding:'12px', borderRadius:11, cursor:'pointer', fontFamily:"'Rubik',sans-serif", fontSize:15, fontWeight:700, color:'#fff', background:'linear-gradient(135deg, rgba(255,69,230,.22), rgba(255,69,230,.12))', border:'1px solid rgba(255,69,230,.5)', boxShadow:'0 0 20px rgba(255,69,230,.2)' }}>
                  כניסה
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Celebration overlay ── */}
        {showCelebration && (() => {
          const isMoreh = celebRole === 'teacher';
          const accent  = isMoreh ? '#ff45e6' : '#2ff3ff';
          const rgb     = isMoreh ? '255,69,230' : '47,243,255';
          const acc2    = isMoreh ? '#ff9a2e'  : '#ff45e6';
          const BRAND   = ['#2ff3ff','#ff45e6','#ff9a2e','#ffffff'];
          return (
            <div style={{ position:'absolute', inset:0, zIndex:200, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', overflow:'hidden', background:'rgba(4,6,14,.92)', backdropFilter:'blur(6px)' }}>
              <style>{`
                @keyframes d-scan { 0%{top:-4px;opacity:1} 100%{top:100%;opacity:0} }
                @keyframes d-scan2 { 0%{top:-4px;opacity:.6} 100%{top:100%;opacity:0} }
                @keyframes d-ring  { 0%{transform:scale(0);opacity:1} 70%{transform:scale(4);opacity:.25} 100%{transform:scale(5.5);opacity:0} }
                @keyframes d-ring2 { 0%{transform:scale(0);opacity:.8} 70%{transform:scale(3);opacity:.15} 100%{transform:scale(4.5);opacity:0} }
                @keyframes d-check { 0%{transform:scale(0) rotate(-15deg);opacity:0} 55%{transform:scale(1.15) rotate(3deg);opacity:1} 80%{transform:scale(.96) rotate(-1deg)} 100%{transform:scale(1);opacity:1} }
                @keyframes d-text  { 0%,15%{opacity:0;transform:translateY(14px)} 40%{opacity:1;transform:translateY(0)} 80%{opacity:1} 100%{opacity:0} }
                @keyframes d-pixel { 0%{opacity:1;transform:translate(0,0) scale(1)} 100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(0)} }
                @keyframes d-glitch { 0%,88%,100%{clip-path:none;transform:none} 90%{clip-path:inset(20% 0 60% 0);transform:translateX(-4px)} 93%{clip-path:inset(60% 0 10% 0);transform:translateX(3px)} 96%{clip-path:none} }
                @keyframes d-grid  { 0%{opacity:0} 20%{opacity:.18} 80%{opacity:.18} 100%{opacity:0} }
              `}</style>

              {/* bg grid flash */}
              <div style={{ position:'absolute', inset:0, backgroundImage:`linear-gradient(rgba(${rgb},.06) 1px,transparent 1px),linear-gradient(90deg,rgba(${rgb},.06) 1px,transparent 1px)`, backgroundSize:'32px 32px', animation:'d-grid 2.2s ease forwards', pointerEvents:'none' }} />

              {/* scan lines */}
              <div style={{ position:'absolute', left:0, right:0, height:3, background:`linear-gradient(90deg,transparent,${accent},transparent)`, animation:'d-scan .55s ease-in forwards', boxShadow:`0 0 18px ${accent}`, pointerEvents:'none' }} />
              <div style={{ position:'absolute', left:0, right:0, height:2, background:`linear-gradient(90deg,transparent,${acc2},transparent)`, animation:'d-scan2 .55s .12s ease-in forwards', pointerEvents:'none' }} />

              {/* pulse rings */}
              <div style={{ position:'absolute', width:140, height:140, borderRadius:'50%', border:`2px solid ${accent}`, boxShadow:`0 0 20px ${accent}`, animation:'d-ring 1.1s ease forwards', pointerEvents:'none' }} />
              <div style={{ position:'absolute', width:140, height:140, borderRadius:'50%', border:`1px solid ${acc2}`, animation:'d-ring2 1.1s .18s ease forwards', pointerEvents:'none' }} />

              {/* digital pixel burst */}
              {Array.from({length:30},(_,i)=>{
                const angle = (i/30)*Math.PI*2;
                const dist  = 60 + Math.random()*90;
                const dx    = Math.cos(angle)*dist;
                const dy    = Math.sin(angle)*dist;
                const color = BRAND[i%BRAND.length];
                const size  = 4 + Math.random()*8;
                return (
                  <div key={i} style={{
                    position:'absolute', width:size, height:size,
                    background:color, boxShadow:`0 0 8px ${color}`,
                    borderRadius: i%3===0 ? 0 : 1,
                    '--dx': dx+'px', '--dy': dy+'px',
                    animation:`d-pixel ${.5+Math.random()*.7}s ${Math.random()*.25}s ease forwards`,
                    pointerEvents:'none',
                  }} />
                );
              })}

              {/* check icon */}
              <div style={{ position:'relative', zIndex:3, width:100, height:100, borderRadius:'50%', background:`linear-gradient(135deg,rgba(${rgb},.18),rgba(${rgb},.08))`, border:`2.5px solid ${accent}`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 0 40px rgba(${rgb},.5),0 0 80px rgba(${rgb},.2)`, animation:'d-check .65s cubic-bezier(.22,.7,.35,1) both' }}>
                <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>

              {/* welcome text with glitch */}
              <div style={{ position:'relative', zIndex:3, textAlign:'center', marginTop:22, animation:'d-text 2.2s ease forwards' }}>
                <div style={{ fontFamily:"'Space Mono',monospace", fontSize:11, letterSpacing:'.28em', textTransform:'uppercase', color:`rgba(${rgb},.7)`, marginBottom:8 }}>{isMoreh ? 'TEACHER · ACCESS GRANTED' : 'STUDENT · ACCESS GRANTED'}</div>
                <div style={{ fontSize:26, fontWeight:900, color:'#fff', textShadow:`0 0 20px rgba(${rgb},.7)`, animation:'d-glitch 2.2s ease forwards' }}>ברוכים הבאים</div>
                <div style={{ fontSize:18, fontWeight:700, color:accent, marginTop:6, textShadow:`0 0 14px rgba(${rgb},.9)`, fontFamily:"'Rubik',sans-serif" }}>{celebName}</div>
              </div>
            </div>
          );
        })()}

        {/* Footer */}
        <div style={{ position: 'absolute', bottom: 22, fontFamily: "'Space Mono', monospace", fontSize: 9.5, letterSpacing: '.22em', textTransform: 'uppercase', color: 'rgba(47,243,255,.28)' }}>
          © 2026 HoloAcademy. כל הזכויות שמורות.
        </div>
      </div>
    );
  };
})();
