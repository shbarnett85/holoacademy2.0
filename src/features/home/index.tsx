import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import HoloBackdrop from '../../shared/ui/HoloBackdrop'

/* הדמיה בחלון הראווה — מדף "התנסו עכשיו" ללא הרשמה */
interface ShowcaseQuest {
  id: string
  title: string
  subject: string | null
  gradeMin: number | null
  gradeMax: number | null
  sceneCount: number
  thumbUrl: string | null
}

const GRADE_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'יא', 'יב']
function gradeRangeLabel(min: number | null, max: number | null): string | null {
  const a = min && min >= 1 && min <= 12 ? GRADE_LETTERS[min - 1] : null
  const b = max && max >= 1 && max <= 12 ? GRADE_LETTERS[max - 1] : null
  if (a && b) return a === b ? `כיתה ${a}׳` : `כיתות ${a}׳-${b}׳`
  return a ? `כיתה ${a}׳` : null
}

interface ModeCard {
  id: 'student' | 'teacher'
  label: string
  sub: string
  icon: React.ReactNode
  accent: string
  rgb: string
  grad: string
  border: string
}

/* מסך הבית — שני כרטיסי מצב (תלמיד/מורה). הלוגיקה נשמרת:
   תלמיד → מודאל קוד כיתה → /class/:code (ClassEntry).  מורה → /staff/login. */
export default function Home() {
  const navigate = useNavigate()
  const [hov, setHov] = useState<string | null>(null)
  const [showCodeModal, setShowCodeModal] = useState(false)
  const [classCode, setClassCode] = useState('')
  const [shake, setShake] = useState(false)
  /* מדף "התנסו עכשיו" — ההדמיות הרשמיות, משחק מיידי בלי הרשמה. best-effort:
     כשל/ריק → נופלים לכפתור הדמו הבודד (לאונרדו). */
  const [showcase, setShowcase] = useState<ShowcaseQuest[]>([])
  useEffect(() => {
    fetch('/api/quests/showcase')
      .then((res) => (res.ok ? res.json() : { quests: [] }))
      .then((body: { quests?: ShowcaseQuest[] }) => setShowcase((body.quests ?? []).filter((q) => q.thumbUrl).slice(0, 8)))
      .catch(() => setShowcase([]))
  }, [])

  /* הדמיית דמו — ניווט ל-URL קריא (/play/leonardo); Player מתרגם את ה-slug ל-id
     האמיתי דרך GET /api/quests/demo (כתובת נוחה יותר לשיתוף מ-UUID גולמי). */
  function startDemo() {
    navigate('/play/leonardo')
  }

  function enterClass() {
    const code = classCode.trim()
    if (code.length < 3) { setShake(true); setTimeout(() => setShake(false), 500); return }
    navigate(`/class/${code}`)
  }

  const cards: ModeCard[] = [
    {
      id: 'student',
      label: 'מצב תלמיד/ה',
      sub: 'היכנסו להדמיות, השלימו אתגרים ואספו רסיסי ידע',
      icon: (
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
        </svg>
      ),
      accent: 'var(--holo-cyan-bright)', rgb: '47,243,255',
      grad: 'linear-gradient(135deg, rgba(47,243,255,.18), rgba(155,140,255,.10))', border: 'rgba(47,243,255,.45)',
    },
    {
      id: 'teacher',
      label: 'מצב מורה',
      sub: 'צרו הדמיות, נהלו כיתות ועקבו אחר התקדמות תלמידים',
      icon: (
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
        </svg>
      ),
      accent: 'var(--holo-magenta)', rgb: '255,69,230',
      grad: 'linear-gradient(135deg, rgba(255,69,230,.18), rgba(255,154,46,.10))', border: 'rgba(255,69,230,.45)',
    },
  ]

  function selectCard(id: 'student' | 'teacher') {
    if (id === 'student') setShowCodeModal(true)
    else navigate('/staff/login')
  }

  return (
    <HoloBackdrop>
      {/* כותרת */}
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <img
          src="/holoacademy-logo.svg"
          alt="HoloAcademy"
          style={{ width: 116, height: 116, margin: '0 auto 22px', display: 'block', filter: 'drop-shadow(0 0 26px rgba(47,243,255,.35))' }}
        />
        <h1 style={{
          margin: 0, fontSize: 58, fontWeight: 900, letterSpacing: '-.02em', lineHeight: 1,
          background: 'linear-gradient(135deg, #ffffff 30%, #7ef6ff 65%, #ff45e6 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          filter: 'drop-shadow(0 0 32px rgba(47,243,255,.35))',
        }}>HoloAcademy</h1>
        <p style={{ margin: '14px 0 0', fontSize: 20, fontWeight: 400, color: 'rgba(180,220,255,.65)', letterSpacing: '.06em' }}>ממד חדש של למידה</p>
      </div>

      {/* כרטיסי מצב */}
      <div className="flex flex-wrap justify-center" style={{ gap: 28 }}>
        {cards.map((c) => {
          const isHov = hov === c.id
          return (
            <button
              key={c.id}
              onMouseEnter={() => setHov(c.id)}
              onMouseLeave={() => setHov(null)}
              onClick={() => selectCard(c.id)}
              style={{
                width: 260, padding: '36px 28px', borderRadius: 22,
                background: isHov ? c.grad : 'linear-gradient(135deg, rgba(10,22,46,.82), rgba(4,9,20,.9))',
                border: `1px solid ${isHov ? c.border : 'rgba(120,180,220,.14)'}`,
                backdropFilter: 'blur(18px)',
                boxShadow: isHov ? `0 0 48px rgba(${c.rgb},.22), 0 0 120px rgba(${c.rgb},.08)` : '0 0 0 transparent',
                cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
                transition: 'all .22s cubic-bezier(.22,.7,.35,1)', transform: isHov ? 'translateY(-4px) scale(1.025)' : 'none',
                fontFamily: 'var(--font-display)',
              }}
            >
              <div style={{ color: isHov ? c.accent : 'rgba(160,200,230,.55)', transition: 'color .22s', filter: isHov ? `drop-shadow(0 0 12px ${c.accent})` : 'none' }}>{c.icon}</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: isHov ? '#fff' : '#b0cce0', marginBottom: 10, transition: 'color .2s' }}>{c.label}</div>
                <div style={{ fontSize: 13, color: isHov ? 'rgba(220,240,255,.7)' : 'rgba(120,160,200,.5)', lineHeight: 1.6, transition: 'color .2s' }}>{c.sub}</div>
              </div>
              <div style={{
                marginTop: 6, padding: '9px 28px', borderRadius: 10, fontSize: 13.5, fontWeight: 700,
                background: isHov ? `rgba(${c.rgb},.22)` : 'rgba(255,255,255,.04)',
                border: `1px solid ${isHov ? `rgba(${c.rgb},.5)` : 'rgba(255,255,255,.08)'}`,
                color: isHov ? c.accent : 'rgba(160,200,230,.4)', transition: 'all .2s',
                boxShadow: isHov ? `0 0 16px rgba(${c.rgb},.3)` : 'none',
              }}>כניסה</div>
            </button>
          )
        })}
      </div>

      {/* מדף "התנסו עכשיו" — ההדמיות הרשמיות, משחק מיידי ללא הרשמה.
          כשהמדף ריק (לפני שיתוף/מיגרציה) — כפתור הדמו הבודד כ-fallback. */}
      {showcase.length > 0 ? (
        <div style={{ marginTop: 44, marginBottom: 46, width: '100%', maxWidth: 1060, padding: '0 20px', boxSizing: 'border-box', position: 'relative', zIndex: 1 }}>
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: 21, fontWeight: 800, color: '#fff' }}>
              <span style={{ filter: 'drop-shadow(0 0 10px rgba(255,154,46,.6))' }}>🎮</span>{' '}
              התנסו עכשיו — <span style={{ color: 'var(--holo-orange, #ff9a2e)' }}>בלי הרשמה</span>
            </div>
            <div style={{ fontSize: 13, color: 'rgba(160,200,240,.55)', marginTop: 6 }}>
              הדמיות מהספרייה הרשמית — לחצו ושחקו, כמו שהתלמידים חווים
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 16 }}>
            {showcase.map((q) => {
              const isHov = hov === q.id
              const grades = gradeRangeLabel(q.gradeMin, q.gradeMax)
              return (
                <button
                  key={q.id}
                  onClick={() => navigate(`/play/${q.id}`)}
                  onMouseEnter={() => setHov(q.id)}
                  onMouseLeave={() => setHov(null)}
                  style={{
                    width: 236, padding: 0, borderRadius: 16, overflow: 'hidden', cursor: 'pointer', textAlign: 'right',
                    background: 'linear-gradient(135deg, rgba(10,22,46,.85), rgba(4,9,20,.92))',
                    border: `1px solid ${isHov ? 'rgba(255,154,46,.55)' : 'rgba(120,180,220,.14)'}`,
                    boxShadow: isHov ? '0 0 34px rgba(255,154,46,.2), 0 14px 40px rgba(0,0,0,.5)' : '0 8px 26px rgba(0,0,0,.35)',
                    transform: isHov ? 'translateY(-4px)' : 'none',
                    transition: 'all .2s cubic-bezier(.22,.7,.35,1)', fontFamily: 'var(--font-display)',
                  }}
                >
                  <div style={{ position: 'relative', height: 118, overflow: 'hidden' }}>
                    <img src={q.thumbUrl!} alt="" loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transform: isHov ? 'scale(1.06)' : 'scale(1)', transition: 'transform .35s' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, rgba(4,9,20,.85))' }} />
                    <div style={{
                      position: 'absolute', bottom: 8, left: 8, padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                      background: isHov ? 'rgba(255,154,46,.9)' : 'rgba(4,9,20,.72)', color: isHov ? '#04101c' : 'rgba(255,200,140,.95)',
                      border: '1px solid rgba(255,154,46,.4)', transition: 'all .2s', backdropFilter: 'blur(6px)',
                    }}>שחקו ▶</div>
                  </div>
                  <div style={{ padding: '10px 14px 12px' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: isHov ? '#fff' : '#c4dcee', lineHeight: 1.45, minHeight: 38, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', transition: 'color .2s' }}>
                      {q.title}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
                      {q.subject && (
                        <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 9px', borderRadius: 7, background: 'rgba(47,243,255,.08)', border: '1px solid rgba(47,243,255,.25)', color: '#7ef6ff' }}>{q.subject}</span>
                      )}
                      {grades && (
                        <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 9px', borderRadius: 7, background: 'rgba(155,140,255,.08)', border: '1px solid rgba(155,140,255,.25)', color: '#b9adff' }}>{grades}</span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <button
            onClick={startDemo}
            onMouseEnter={() => setHov('demo')}
            onMouseLeave={() => setHov(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '13px 30px', borderRadius: 14,
              cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700,
              color: hov === 'demo' ? '#fff' : 'rgba(200,230,255,.8)',
              background: hov === 'demo'
                ? 'linear-gradient(135deg, rgba(255,154,46,.22), rgba(255,69,230,.16))'
                : 'linear-gradient(135deg, rgba(10,22,46,.82), rgba(4,9,20,.9))',
              border: '1px solid ' + (hov === 'demo' ? 'rgba(255,154,46,.5)' : 'rgba(255,154,46,.28)'),
              backdropFilter: 'blur(18px)',
              boxShadow: hov === 'demo' ? '0 0 36px rgba(255,154,46,.22)' : 'none',
              transition: 'all .2s',
            }}
          >
            <span style={{ fontSize: 18 }}>🎨</span>
            נסו הדמיית דמו — לאונרדו דה וינצ׳י
          </button>
        </div>
      )}

      {/* מודאל קוד כיתה */}
      {showCodeModal && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ zIndex: 100, background: 'rgba(4,6,14,.75)', backdropFilter: 'blur(8px)' }}
          onClick={() => { setShowCodeModal(false); setClassCode('') }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'linear-gradient(135deg, rgba(10,22,46,.95), rgba(4,9,20,.98))',
              border: '1px solid rgba(47,243,255,.25)', borderRadius: 22, padding: '40px 44px', width: 380, textAlign: 'center',
              boxShadow: '0 0 80px rgba(47,243,255,.12), 0 20px 60px rgba(0,0,0,.6)',
              animation: shake ? 'holo-shake .4s ease' : 'none',
            }}
          >
            <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(47,243,255,.08)', border: '1px solid rgba(47,243,255,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 22px', boxShadow: '0 0 24px rgba(47,243,255,.15)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--holo-cyan-bright)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 8 }}>קוד כיתה</div>
            <div style={{ fontSize: 14, color: 'rgba(160,200,240,.6)', marginBottom: 28, lineHeight: 1.6 }}>מה קוד הכיתה שקיבלתם מהמורה?</div>
            <input
              autoFocus
              value={classCode}
              onChange={(e) => setClassCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && enterClass()}
              placeholder="למשל: demo-7b"
              maxLength={32}
              dir="ltr"
              style={{
                width: '100%', boxSizing: 'border-box', background: 'rgba(4,9,18,.7)', border: '1px solid rgba(47,243,255,.3)',
                borderRadius: 12, padding: '14px 18px', fontSize: 20, fontWeight: 700, color: 'var(--holo-cyan-bright)',
                fontFamily: 'var(--font-mono)', outline: 'none', textAlign: 'center', letterSpacing: '.12em', boxShadow: '0 0 20px rgba(47,243,255,.08)',
              }}
            />
            <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
              <button onClick={() => { setShowCodeModal(false); setClassCode('') }}
                style={{ flex: 1, padding: '12px', borderRadius: 11, cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, background: 'transparent', border: '1px solid rgba(120,180,220,.2)', color: 'rgba(150,190,220,.55)' }}>
                ביטול
              </button>
              <button onClick={enterClass}
                style={{ flex: 2, padding: '12px', borderRadius: 11, cursor: classCode.trim() ? 'pointer' : 'default', opacity: classCode.trim() ? 1 : 0.5, fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg, rgba(47,243,255,.22), rgba(47,243,255,.12))', border: '1px solid rgba(47,243,255,.5)', boxShadow: '0 0 20px rgba(47,243,255,.2)' }}>
                כניסה ←
              </button>
            </div>
          </div>
        </div>
      )}

      {/* כותרת תחתונה */}
      <div style={{ position: 'absolute', bottom: 22, fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '.22em', textTransform: 'uppercase', color: 'rgba(47,243,255,.28)' }}>
        © 2026 HoloAcademy. כל הזכויות שמורות.
      </div>
    </HoloBackdrop>
  )
}
