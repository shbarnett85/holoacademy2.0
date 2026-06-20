// scenes.jsx — HoloAcademy simulation scene-breakdown view
// Holographic list of scene cards. Exports window.HoloScenes.

(function () {
  const { React } = window;
  const Icon = window.HoloIcon;

  const micro = { fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase' };
  const glass = {
    background: 'linear-gradient(135deg, rgba(10,22,46,.82), rgba(4,9,20,.9))',
    border: '1px solid rgba(47,243,255,.13)',
    borderRadius: 18,
    backdropFilter: 'blur(18px)',
  };

  // puzzle type id → Hebrew label
  const PUZZLE_LABEL = {
    multipleChoice: 'רב-ברירה',
    trueFalse:      'נכון / לא נכון',
    fillBlank:      'השלמת מילים',
    wordSearch:     'חיפוש מילים',
    memory:         'זיכרון',
    exam:           'מבחן סיכום',
  };

  // ── Scene data (modeled after the source page) ──────────────────────────────
  const SCENES = [
    {
      n: 1, title: 'שער העיר אתונה', icon: 'orbit',
      body: 'ד"ר הולו מחייך אליך בברכה. "שלום, חוקר צעיר! ברוכים הבאים לאתונה העתיקה, עיר הדמוקרטיה והפילוסופיה. אנו נמצאים בשנת 399 לפנה"ס, תקופה מרתקת בהיסטוריה…"',
      puzzle: 'multipleChoice', items: [],
    },
    {
      n: 2, title: 'בדרך לאגורה', icon: 'doc',
      body: 'ד"ר הולו מוביל אותך דרך רחובות אתונה המרוצפים. "מציינן! אכן, דמוקרטיה פירושה \'שלטון העם\' — \'דמוס\' (עם) ו\'קרטוס\' (שלטון). עכשיו אנו הולכים לאגורה, כיכר…"',
      puzzle: 'multipleChoice', items: ['מגילת הפילוסוף'],
    },
    {
      n: 3, title: 'מפגש עם סוקרטס', icon: 'people',
      body: 'ד"ר הולו מצביע על איש מבוגר בעל זקן לבן, עטוף בגלימה פשוטה, המוקף בקבוצת צעירים. "הנה סוקרטס! הפילוסוף הגדול ביותר של אתונה. הוא לא כתב ספרים, אלא לימד…"',
      puzzle: 'trueFalse', items: [],
    },
    {
      n: 4, title: 'המשפט של סוקרטס', icon: 'spark',
      body: 'ד"ר הולו נאנח בעצב. "למרבה הצער, לא כולם אהבו את סוקרטס. הוא האשים בהשחתת הנוער ובחוסר אמונה באלים. באותה שנה, 399 לפנה"ס, הוא נשפט בבית המשפט האתונאי…"',
      puzzle: 'trueFalse', items: ['אסימון הצבעה'],
    },
    {
      n: 5, title: 'מורשת הדמוקרטיה', icon: 'key', locked: true,
      body: 'ד"ר הולו עומד מול מקדש הפרתנון המתנשא. "הגעת לסצנה האחרונה, חוקר. כעת, לאחר שלמדת על הדמוקרטיה האתונאית, הגיע הזמן לבחון את כל מה שאספת במסע…"',
      puzzle: 'exam', items: ['מפתח החוכמה'],
    },
  ];

  function PuzzleBadge({ type }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 30,
        background: 'rgba(47,243,255,.08)', border: '1px solid rgba(47,243,255,.3)', boxShadow: '0 0 14px rgba(47,243,255,.1)' }}>
        <Icon name="grid" size={15} stroke="#7ef6ff" sw={1.8} />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: '#bfe9ff' }}>
          חידה: <span style={{ color: '#7ef6ff', fontWeight: 700 }}>{PUZZLE_LABEL[type] || type}</span>
        </span>
      </div>
    );
  }

  function ItemBadge({ label }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 30,
        background: 'linear-gradient(135deg, rgba(255,69,230,.14), rgba(155,140,255,.1))',
        border: '1px solid rgba(255,69,230,.4)', boxShadow: '0 0 14px rgba(255,69,230,.12)' }}>
        <Icon name="spark" size={14} stroke="#ff8af0" sw={2} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#ffd6f6' }}>{label}</span>
      </div>
    );
  }

  function SceneCard({ scene, i, last }) {
    const [hov, setHov] = React.useState(false);
    const accent = scene.locked ? '#ffb454' : '#2ff3ff';
    const accentRgb = scene.locked ? '255,180,84' : '47,243,255';
    return (
      <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        style={{ position: 'relative', display: 'flex', gap: 22, alignItems: 'stretch' }}>

        {/* ── Spine node column ───────────────────────── */}
        <div style={{ position: 'relative', width: 64, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* node */}
          <div style={{ position: 'relative', zIndex: 2, width: 56, height: 56, borderRadius: '50%',
            display: 'grid', placeItems: 'center', flexShrink: 0,
            background: `radial-gradient(circle at 35% 30%, rgba(${accentRgb},.28), rgba(4,9,20,.95))`,
            border: `2px solid ${hov ? accent : `rgba(${accentRgb},.5)`}`,
            boxShadow: hov ? `0 0 24px rgba(${accentRgb},.5), 0 0 60px rgba(${accentRgb},.2)` : `0 0 14px rgba(${accentRgb},.25)`,
            transition: 'all .22s cubic-bezier(.22,.7,.35,1)' }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 22, fontWeight: 700, color: scene.locked ? '#ffd9a8' : '#bff6ff', textShadow: `0 0 12px rgba(${accentRgb},.7)` }}>{scene.n}</div>
            {scene.locked && (
              <div style={{ position: 'absolute', bottom: -4, right: -4, width: 22, height: 22, borderRadius: '50%', background: '#0a0f1e', border: '1px solid rgba(255,180,84,.6)', display: 'grid', placeItems: 'center' }}>
                <Icon name="key" size={12} stroke="#ffb454" sw={1.8} />
              </div>
            )}
          </div>
          {/* connector line to next node */}
          {!last && (
            <div style={{ flex: 1, width: 2, marginTop: 4, marginBottom: 4,
              background: 'linear-gradient(180deg, rgba(47,243,255,.55), rgba(255,69,230,.3))',
              boxShadow: '0 0 8px rgba(47,243,255,.35)' }} />
          )}
        </div>

        {/* ── Scene card ──────────────────────────────── */}
        <div style={{
            ...glass, position: 'relative', flex: 1, padding: '20px 24px', overflow: 'hidden', marginBottom: last ? 0 : 26,
            borderColor: hov ? `rgba(${accentRgb},.4)` : 'rgba(47,243,255,.13)',
            boxShadow: hov ? `0 0 34px rgba(${accentRgb},.12)` : 'none',
            transform: hov ? 'translateX(-4px)' : 'none',
            transition: 'all .2s cubic-bezier(.22,.7,.35,1)',
          }}>

          {/* leading edge accent */}
          <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 3,
            background: `linear-gradient(180deg, ${accent}, rgba(255,69,230,.5))`,
            opacity: hov ? 1 : 0.5, transition: 'opacity .2s', boxShadow: `0 0 12px rgba(${accentRgb},.5)` }} />

          {/* connector notch pointing to spine */}
          <div style={{ position: 'absolute', top: 22, right: -7, width: 12, height: 12, transform: 'rotate(45deg)',
            background: 'linear-gradient(135deg, rgba(10,22,46,.9), rgba(4,9,20,.95))',
            borderRight: `1px solid ${hov ? `rgba(${accentRgb},.4)` : 'rgba(47,243,255,.13)'}`,
            borderTop: `1px solid ${hov ? `rgba(${accentRgb},.4)` : 'rgba(47,243,255,.13)'}`,
            transition: 'border-color .2s' }} />

          {/* top row: label + icon */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
            <div style={{ ...micro, fontSize: 10, color: `rgba(${accentRgb},.65)` }}>סצנה {scene.n}{scene.locked ? ' · סצנת סיכום' : ''}</div>
            <div style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 10,
              background: `rgba(${accentRgb},.06)`, border: `1px solid rgba(${accentRgb},.2)`,
              boxShadow: hov ? `0 0 14px rgba(${accentRgb},.18)` : 'none', transition: 'box-shadow .2s' }}>
              <Icon name={scene.icon} size={18} stroke={accent} sw={1.6} />
            </div>
          </div>

          {/* title */}
          <h3 style={{ margin: '0 0 10px', fontSize: 21, fontWeight: 800, color: '#fff', letterSpacing: '-.01em' }}>{scene.title}</h3>

          {/* body */}
          <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.75, color: 'rgba(180,210,235,.72)', textWrap: 'pretty' }}>{scene.body}</p>

          {/* badges */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {scene.items.map((it) => <ItemBadge key={it} label={it} />)}
            <PuzzleBadge type={scene.puzzle} />
          </div>
        </div>
      </div>
    );
  }

  window.HoloScenes = function HoloScenes({ title = 'אתונה והדמוקרטיה', subtitle = 'סיור הרפתקה · 5 סצנות', onBack }) {
    return (
      <div dir="rtl" style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: 'radial-gradient(120% 90% at 50% -10%, #0c1430 0%, #070a18 50%, #04060f 100%)',
        fontFamily: "'Rubik', sans-serif", position: 'relative', overflow: 'hidden',
      }}>
        <style>{`
          .scenes-scroll::-webkit-scrollbar { width: 6px; }
          .scenes-scroll::-webkit-scrollbar-track { background: rgba(4,9,18,.4); border-radius: 4px; }
          .scenes-scroll::-webkit-scrollbar-thumb { background: rgba(47,243,255,.28); border-radius: 4px; }
          .scenes-scroll::-webkit-scrollbar-thumb:hover { background: rgba(47,243,255,.55); }
        `}</style>

        {/* glow orbs */}
        <div style={{ position: 'absolute', left: -120, top: -80, width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(47,243,255,.08), transparent 70%)', filter: 'blur(30px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', right: -120, bottom: -80, width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,69,230,.06), transparent 70%)', filter: 'blur(30px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'repeating-linear-gradient(0deg,rgba(0,0,0,0) 0 2px,rgba(0,0,0,.12) 2px 3px)', opacity: .35 }} />

        {/* header */}
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 36px 16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ display: 'grid', placeItems: 'center', width: 46, height: 46, borderRadius: 13, background: 'rgba(47,243,255,.08)', border: '1px solid rgba(47,243,255,.3)', color: '#2ff3ff', boxShadow: '0 0 18px rgba(47,243,255,.2)' }}>
              <Icon name="layers" size={24} stroke="#2ff3ff" sw={1.5} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#fff' }}>{title}</h1>
              <div style={{ ...micro, fontSize: 10.5, color: 'rgba(47,243,255,.55)', marginTop: 3 }}>{subtitle}</div>
            </div>
          </div>
          {onBack && (
            <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 11, cursor: 'pointer', fontFamily: "'Rubik',sans-serif", fontSize: 13.5, fontWeight: 600, background: 'rgba(47,243,255,.07)', border: '1px solid rgba(47,243,255,.25)', color: '#bfe9ff', transition: 'all .15s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(47,243,255,.16)'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(47,243,255,.07)'; e.currentTarget.style.color = '#bfe9ff'; }}>
              <Icon name="quest" size={16} stroke="currentColor" />
              חזרה
            </button>
          )}
        </div>

        {/* scroll list — journey timeline */}
        <div className="scenes-scroll" style={{ position: 'relative', zIndex: 2, flex: 1, overflowY: 'auto', padding: '8px 36px 32px' }}>
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            {SCENES.map((sc, i) => <SceneCard key={sc.n} scene={sc} i={i} last={i === SCENES.length - 1} />)}
          </div>
        </div>
      </div>
    );
  };
})();
