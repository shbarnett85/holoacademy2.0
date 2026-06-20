// student-screen.jsx — Student view for HoloAcademy
// Large simulation cards with bg gradients, filter bar, completion badges.

(function () {
  const { React } = window;

  const micro = { fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase' };
  const glass = { background: 'linear-gradient(135deg, rgba(10,22,46,.85), rgba(4,9,20,.92))', border: '1px solid rgba(47,243,255,.13)', borderRadius: 14, backdropFilter: 'blur(18px)' };

  const SUBJECTS = ['היסטוריה','מדעים','מתמטיקה','ספרות','גיאוגרפיה','אמנות','פיזיקה','ביולוגיה','אזרחות'];
  const TEACHERS = ['ד"ר לוי','מר כהן','גב\' שפירא','פרופ\' ברק','גב\' אביב'];
  const STATUSES = ['הכל','לא התחיל','בתהליך','הושלם'];

  // bg gradients by subject — evocative, no real images needed
  const BG = {
    'היסטוריה':   'linear-gradient(135deg, #2d1a0e 0%, #7c3a1a 40%, #c9632a 80%, #e8923a 100%)',
    'מדעים':      'linear-gradient(135deg, #071a2e 0%, #0d4060 40%, #1a8aa0 80%, #2ff3ff 100%)',
    'מתמטיקה':   'linear-gradient(135deg, #12073a 0%, #2d1278 40%, #6b35c8 80%, #a855f7 100%)',
    'ספרות':      'linear-gradient(135deg, #1a0a1e 0%, #5c1a6e 40%, #a83ea8 80%, #e060e0 100%)',
    'גיאוגרפיה':  'linear-gradient(135deg, #062218 0%, #0e5c30 40%, #25a85e 80%, #46f5a3 100%)',
    'אמנות':      'linear-gradient(135deg, #1a0c00 0%, #7a3000 40%, #c96000 80%, #ffb454 100%)',
    'פיזיקה':     'linear-gradient(135deg, #04101e 0%, #0a2a50 40%, #1050a0 80%, #2060e0 100%)',
    'ביולוגיה':   'linear-gradient(135deg, #051a10 0%, #114430 40%, #228850 80%, #34d399 100%)',
    'אזרחות':     'linear-gradient(135deg, #1a0818 0%, #501830 40%, #9a2850 80%, #e04878 100%)',
  };

  const SIMS = [
    { id:1,  title:'יפן הפיאודלית',        subject:'היסטוריה', teacher:'ד"ר לוי',    date:'2026-05-10', status:'הושלם',      scenes:8,  score:94 },
    { id:2,  title:'מסע לגרעין התא',       subject:'ביולוגיה', teacher:'גב\' שפירא', date:'2026-05-18', status:'הושלם',      scenes:6,  score:88 },
    { id:3,  title:'המהפכה הצרפתית',       subject:'היסטוריה', teacher:'ד"ר לוי',    date:'2026-05-25', status:'בתהליך',     scenes:10, score:null },
    { id:4,  title:'עולם הקוונטים',        subject:'פיזיקה',   teacher:'פרופ\' ברק', date:'2026-06-01', status:'לא התחיל',  scenes:7,  score:null },
    { id:5,  title:'אלגוריתמים בטבע',      subject:'מדעים',    teacher:'מר כהן',     date:'2026-06-03', status:'הושלם',      scenes:5,  score:77 },
    { id:6,  title:'מסע בין הכוכבים',      subject:'פיזיקה',   teacher:'פרופ\' ברק', date:'2026-06-05', status:'לא התחיל',  scenes:9,  score:null },
    { id:7,  title:'שבטי האמזונס',         subject:'גיאוגרפיה',teacher:'גב\' אביב',  date:'2026-05-28', status:'בתהליך',     scenes:6,  score:null },
    { id:8,  title:'המשוואות הסודיות',     subject:'מתמטיקה',  teacher:'מר כהן',     date:'2026-06-08', status:'לא התחיל',  scenes:8,  score:null },
    { id:9,  title:'אנרגיה ותנועה',        subject:'פיזיקה',   teacher:'פרופ\' ברק', date:'2026-05-15', status:'הושלם',      scenes:7,  score:82 },
    { id:10, title:'מפת האקלים העולמי',    subject:'גיאוגרפיה',teacher:'גב\' אביב',  date:'2026-06-10', status:'לא התחיל',  scenes:5,  score:null },
    { id:11, title:'סיפורים בצבעים',       subject:'אמנות',    teacher:'גב\' שפירא', date:'2026-05-20', status:'הושלם',      scenes:4,  score:96 },
    { id:12, title:'ממשל ודמוקרטיה',       subject:'אזרחות',   teacher:'ד"ר לוי',    date:'2026-06-12', status:'לא התחיל',  scenes:6,  score:null },
    { id:13, title:'רומא העתיקה',          subject:'היסטוריה', teacher:'ד"ר לוי',    date:'2026-04-20', status:'הושלם',      scenes:9,  score:91 },
    { id:14, title:'מחזור המים בטבע',      subject:'מדעים',    teacher:'מר כהן',     date:'2026-04-25', status:'הושלם',      scenes:5,  score:85 },
    { id:15, title:'הגיאומטריה הנסתרת',    subject:'מתמטיקה',  teacher:'מר כהן',     date:'2026-05-02', status:'בתהליך',     scenes:7,  score:null },
    { id:16, title:'רצועת הגן עדן',        subject:'ביולוגיה', teacher:'גב\' שפירא', date:'2026-05-05', status:'לא התחיל',  scenes:6,  score:null },
    { id:17, title:'ציוויליזציות קדומות',  subject:'היסטוריה', teacher:'ד"ר לוי',    date:'2026-04-10', status:'הושלם',      scenes:11, score:79 },
    { id:18, title:'כוחות הטבע',           subject:'פיזיקה',   teacher:'פרופ\' ברק', date:'2026-05-30', status:'לא התחיל',  scenes:8,  score:null },
    { id:19, title:'ג\'ונגל הצלילים',       subject:'אמנות',    teacher:'גב\' שפירא', date:'2026-04-15', status:'הושלם',      scenes:4,  score:100 },
    { id:20, title:'מסלולי כוכבים',        subject:'פיזיקה',   teacher:'פרופ\' ברק', date:'2026-06-14', status:'לא התחיל',  scenes:9,  score:null },
    { id:21, title:'זכויות האזרח',         subject:'אזרחות',   teacher:'ד"ר לוי',    date:'2026-05-08', status:'הושלם',      scenes:7,  score:87 },
    { id:22, title:'ימי הביניים',           subject:'היסטוריה', teacher:'ד"ר לוי',    date:'2026-06-15', status:'לא התחיל',  scenes:8,  score:null },
    { id:23, title:'הגוף האנושי',          subject:'ביולוגיה', teacher:'גב\' שפירא', date:'2026-05-12', status:'בתהליך',     scenes:10, score:null },
    { id:24, title:'ספרות עברית',          subject:'ספרות',    teacher:'גב\' אביב',  date:'2026-06-09', status:'לא התחיל',  scenes:6,  score:null },
  ];

  const TODAY = new Date('2026-06-15');
  const isNew = (dateStr) => (TODAY - new Date(dateStr)) / 86400000 <= 7;

  function SimCard({ sim }) {
    const [hov, setHov] = React.useState(false);
    const done = sim.status === 'הושלם';
    const inProg = sim.status === 'בתהליך';
    const fresh = isNew(sim.date);
    const bg = BG[sim.subject] || BG['מדעים'];

    return (
      <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        style={{
          position: 'relative', borderRadius: 18, overflow: 'hidden',
          height: 220, cursor: 'pointer', flexShrink: 0,
          transform: hov ? 'scale(1.03) translateY(-4px)' : 'scale(1)',
          transition: 'transform .22s cubic-bezier(.22,.7,.35,1)',
          boxShadow: fresh
            ? hov
              ? '0 16px 48px rgba(0,0,0,.6), 0 0 0 2px #2ff3ff, 0 0 32px rgba(47,243,255,.5)'
              : '0 4px 20px rgba(0,0,0,.4), 0 0 0 2px rgba(47,243,255,.7), 0 0 20px rgba(47,243,255,.3)'
            : hov
              ? '0 16px 48px rgba(0,0,0,.6), 0 0 32px rgba(47,243,255,.12)'
              : '0 4px 20px rgba(0,0,0,.4)',
          animation: fresh ? 'sim-pulse 2.4s ease-in-out infinite' : 'none',
        }}>

        {/* bg gradient */}
        <div style={{ position: 'absolute', inset: 0, background: bg, opacity: done ? 0.7 : 1 }} />

        {/* scanlines overlay */}
        <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg,rgba(0,0,0,0) 0 2px,rgba(0,0,0,.18) 2px 3px)', opacity: .4, pointerEvents: 'none' }} />

        {/* bottom dark gradient for text */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(4,6,14,.92) 0%, rgba(4,6,14,.4) 50%, transparent 100%)' }} />

        {/* COMPLETED stamp */}
        {done && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3,
          }}>
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: '14px 24px', borderRadius: 16,
              background: 'rgba(4,18,12,.7)', border: '2px solid rgba(70,245,163,.6)',
              boxShadow: '0 0 32px rgba(70,245,163,.35), 0 0 80px rgba(70,245,163,.12)',
              backdropFilter: 'blur(6px)',
              transform: hov ? 'scale(1.06)' : 'scale(1)',
              transition: 'transform .2s',
            }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#46f5a3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 11, letterSpacing: '.25em', fontWeight: 700, color: '#46f5a3', textShadow: '0 0 12px rgba(70,245,163,.8)' }}>הושלם</div>
              {sim.score && <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{sim.score}<span style={{ fontSize: 11, fontWeight: 400, color: 'rgba(70,245,163,.7)' }}>%</span></div>}
            </div>
          </div>
        )}

        {/* NEW badge */}
        {fresh && (
          <div style={{ position: 'absolute', top: 14, right: 14, zIndex: 4, display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 20, background: 'rgba(47,243,255,.18)', border: '1px solid rgba(47,243,255,.7)', backdropFilter: 'blur(8px)', boxShadow: '0 0 16px rgba(47,243,255,.5)' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#2ff3ff', boxShadow: '0 0 8px #2ff3ff', animation: 'holo-pulse 1.2s infinite' }} />
            <span style={{ fontFamily:"'Space Mono',monospace", fontSize: 9, letterSpacing: '.22em', textTransform: 'uppercase', fontWeight: 700, color: '#2ff3ff', textShadow: '0 0 10px rgba(47,243,255,.8)' }}>חדש</span>
          </div>
        )}

        {/* in progress badge */}
        {inProg && (
          <div style={{ position: 'absolute', top: 14, right: 14, zIndex: 3, display: 'flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 20, background: 'rgba(255,154,46,.18)', border: '1px solid rgba(255,154,46,.5)', backdropFilter: 'blur(6px)' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#ff9a2e', boxShadow: '0 0 8px #ff9a2e', animation: 'holo-pulse 1.5s infinite' }} />
            <span style={{ ...micro, fontSize: 9, color: '#ff9a2e' }}>בתהליך</span>
          </div>
        )}

        {/* subject chip */}
        <div style={{ position: 'absolute', top: 14, left: 14, zIndex: 3, padding: '4px 10px', borderRadius: 20, background: 'rgba(4,9,18,.55)', border: '1px solid rgba(255,255,255,.15)', backdropFilter: 'blur(6px)' }}>
          <span style={{ ...micro, fontSize: 8.5, color: 'rgba(220,240,255,.75)' }}>{sim.subject}</span>
        </div>

        {/* hover enter button */}
        {hov && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: done ? 1 : 4, background: 'rgba(4,6,14,.25)' }}>
            {!done && (
              <div style={{ padding: '11px 28px', borderRadius: 12, fontFamily: "'Rubik',sans-serif", fontSize: 15, fontWeight: 700, color: '#fff', background: 'rgba(47,243,255,.22)', border: '1px solid rgba(47,243,255,.6)', boxShadow: '0 0 24px rgba(47,243,255,.35)', backdropFilter: 'blur(8px)', letterSpacing: '.04em' }}>
                {inProg ? 'המשך' : 'כניסה'}
              </div>
            )}
          </div>
        )}

        {/* bottom info */}
        <div style={{ position: 'absolute', bottom: 0, right: 0, left: 0, padding: '14px 16px', zIndex: 2 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 5, textShadow: '0 2px 8px rgba(0,0,0,.6)', lineHeight: 1.2 }}>{sim.title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11.5, color: 'rgba(180,220,255,.65)', fontFamily: "'Rubik',sans-serif" }}>{sim.teacher}</span>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(180,220,255,.3)', flexShrink: 0 }} />
            <span style={{ ...micro, fontSize: 8.5, color: 'rgba(150,190,220,.55)' }}>{sim.scenes} סצנות</span>
          </div>
        </div>
      </div>
    );
  }

  function HoloSelect({ value, onChange, options, placeholder }) {
    return (
      <div style={{ position: 'relative', flex: '0 0 auto' }}>
        <select value={value} onChange={(e) => onChange(e.target.value)}
          style={{ appearance: 'none', WebkitAppearance: 'none', background: 'rgba(4,9,18,.6)', border: '1px solid rgba(47,243,255,.22)', borderRadius: 9, color: value ? '#eaf6ff' : '#5a7a99', fontFamily: "'Rubik',sans-serif", fontSize: 13, fontWeight: 600, padding: '8px 28px 8px 14px', cursor: 'pointer', outline: 'none', minWidth: 120 }}>
          <option value="">{placeholder}</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <div style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#2ff3ff', fontSize: 10 }}>▾</div>
      </div>
    );
  }

  window.HoloStudentScreen = function HoloStudentScreen({ onLogout }) {
    const [query,   setQuery]   = React.useState('');
    const [subject, setSubject] = React.useState('');
    const [teacher, setTeacher] = React.useState('');
    const [status,  setStatus]  = React.useState('');
    const [sortBy,  setSortBy]  = React.useState('תאריך');

    const dirty = query.trim() || subject || teacher || status;
    const clearAll = () => { setQuery(''); setSubject(''); setTeacher(''); setStatus(''); };

    const filtered = SIMS
      .filter((s) => !query.trim() || s.title.includes(query.trim()) || s.subject.includes(query.trim()))
      .filter((s) => !subject || s.subject === subject)
      .filter((s) => !teacher || s.teacher === teacher)
      .filter((s) => !status  || s.status  === status)
      .sort((a, b) => {
        if (sortBy === 'תאריך') return new Date(b.date) - new Date(a.date);
        if (sortBy === 'ציון')  return (b.score || 0) - (a.score || 0);
        return a.title.localeCompare(b.title, 'he');
      });

    return (
      <div dir="rtl" style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: 'radial-gradient(120% 90% at 50% -10%, #0c1430 0%, #070a18 45%, #04060f 100%)',
        fontFamily: "'Rubik',sans-serif", position: 'relative', overflow: 'hidden',
      }}>
        {/* bg */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(80,150,210,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(80,150,210,.05) 1px,transparent 1px)', backgroundSize: '46px 46px', maskImage: 'radial-gradient(130% 90% at 50% 30%, #000 35%, transparent 85%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'repeating-linear-gradient(0deg,rgba(0,0,0,0) 0 2px,rgba(0,0,0,.13) 2px 3px)', opacity: .35 }} />
        <style>{`
          select option { background: #070a18; color: #eaf6ff; }
          @keyframes holo-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
          @keyframes sim-pulse {
            0%,100% { box-shadow: 0 4px 20px rgba(0,0,0,.4), 0 0 0 2px rgba(47,243,255,.7), 0 0 20px rgba(47,243,255,.3); }
            50%      { box-shadow: 0 4px 20px rgba(0,0,0,.4), 0 0 0 2px rgba(47,243,255,1),   0 0 38px rgba(47,243,255,.6); }
          }
          .student-scroll::-webkit-scrollbar { width: 5px; }
          .student-scroll::-webkit-scrollbar-track { background: rgba(4,9,18,.4); border-radius: 4px; }
          .student-scroll::-webkit-scrollbar-thumb { background: rgba(47,243,255,.25); border-radius: 4px; }
          .student-scroll::-webkit-scrollbar-thumb:hover { background: rgba(47,243,255,.5); }
        `}</style>

        {/* ── Top bar ── */}
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 30px 12px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <div style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 12, background: 'rgba(255,69,230,.08)', border: '1px solid rgba(255,69,230,.3)', color: '#ff45e6', boxShadow: '0 0 16px rgba(255,69,230,.25)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 19, fontWeight: 800, color: '#fff' }}>ההדמיות שלי</div>
              <div style={{ ...micro, fontSize: 9, color: 'rgba(255,69,230,.6)', marginTop: 1 }}>HOLOACADEMY · STUDENT</div>
            </div>
          </div>
          <button onClick={onLogout} title="יציאה"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 10, cursor: 'pointer', background: 'rgba(255,69,230,.07)', border: '1px solid rgba(255,69,230,.25)', color: 'rgba(255,150,230,.7)', transition: 'all .16s' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,69,230,.18)'; e.currentTarget.style.color = '#ff45e6'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,69,230,.07)'; e.currentTarget.style.color = 'rgba(255,150,230,.7)'; }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>

        {/* ── Filter bar ── */}
        <div style={{ position: 'relative', zIndex: 2, padding: '0 30px 16px', flexShrink: 0 }}>
          <div style={{ ...glass, padding: '12px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {/* search */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(4,9,18,.5)', border: '1px solid rgba(47,243,255,.13)', borderRadius: 10, padding: '7px 14px', flex: '1 1 160px', minWidth: 140 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7ef6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש הדמיה…"
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#eaf6ff', fontSize: 13, fontFamily: "'Rubik',sans-serif", direction: 'rtl' }} />
              </div>
              <HoloSelect value={subject} onChange={setSubject} options={SUBJECTS}                       placeholder="מקצוע" />
              <HoloSelect value={teacher} onChange={setTeacher} options={TEACHERS}                       placeholder="מורה" />
              <HoloSelect value={status}  onChange={setStatus}  options={['לא התחיל','בתהליך','הושלם']} placeholder="סטטוס" />
              <HoloSelect value={sortBy}  onChange={setSortBy}  options={['תאריך','ציון','א-ב']}         placeholder="מיון" />
              {dirty && (
                <button onClick={clearAll} style={{ fontFamily: "'Rubik',sans-serif", fontSize: 12, fontWeight: 600, color: '#ff8af0', padding: '7px 14px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,69,230,.4)', whiteSpace: 'nowrap' }}>נקה</button>
              )}
              <div style={{ ...micro, fontSize: 9, color: 'rgba(47,243,255,.45)', marginRight: 'auto' }}>{filtered.length} הדמיות</div>
            </div>
          </div>
        </div>

        {/* ── Sim grid ── */}
        <div className="student-scroll" style={{ position: 'relative', zIndex: 2, flex: 1, overflowY: 'scroll', minHeight: 0, padding: '0 30px 30px' }}>
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '80px 0', color: '#4a6a88', fontSize: 16 }}>לא נמצאו הדמיות תואמות</div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
            {filtered.map((sim) => <SimCard key={sim.id} sim={sim} />)}
          </div>
        </div>
      </div>
    );
  };
})();
