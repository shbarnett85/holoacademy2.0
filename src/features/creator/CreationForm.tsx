import { useState } from 'react'
import { apiFetch } from '../../shared/lib/api'
import { SUBJECTS } from '../../shared/lib/subjects'
import { ART_STYLES, PUZZLE_TYPES, useCreatorStore } from './creatorStore'
import HoloIcon, { type HoloIconName } from '../../shared/ui/HoloIcon'
import GeneratingScreen from './GeneratingScreen'
import QuestPreview from './QuestPreview'
import StudioTopBar from './StudioTopBar'
import { glass, micro } from './studioStyles'
import { GRADE_LEVELS, levelToGradeLabel } from '../../shared/lib/difficultyCalibration'

/* שכבת-גיל לפי רמה (סקאלת 1-20) — מקור יחיד מ-difficultyCalibration */
function gradeLabel(level: number): string {
  return levelToGradeLabel(level)
}

const SIM_TYPES = [
  { key: 'adventure', label: 'הרפתקה', icon: '⚔️', desc: 'מסע עם אתגרים ומשימות' },
  { key: 'tour', label: 'סיור', icon: '🔭', desc: 'חקירה חופשית ולמידה' },
] as const

const fieldLabel: React.CSSProperties = { fontSize: 12, color: '#9fb6cf', fontWeight: 500, marginBottom: 6, display: 'block' }
const inputBase: React.CSSProperties = { width: '100%', background: 'rgba(4,9,18,.7)', border: '1px solid rgba(120,200,255,.16)', borderRadius: 11, padding: '11px 13px', fontSize: 14, color: 'var(--holo-text-bright)', outline: 'none', fontFamily: 'var(--font-display)' }
const chip: React.CSSProperties = { fontSize: 11.5, fontWeight: 600, color: '#bfe9ff', padding: '5px 11px', borderRadius: 20, background: 'rgba(47,243,255,.08)', border: '1px solid rgba(47,243,255,.25)', whiteSpace: 'nowrap' }

function PanelHead({ icon, title, kicker }: { icon: React.ReactNode; title: string; kicker: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <span style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 9, background: 'rgba(47,243,255,.08)', border: '1px solid rgba(47,243,255,.28)', color: '#7ef6ff', boxShadow: '0 0 14px rgba(47,243,255,.2)' }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--holo-text-bright)' }}>{title}</div>
        <div style={{ ...micro, marginTop: 2 }}>{kicker}</div>
      </div>
    </div>
  )
}

/* סליידר ניאון — fill לפי הערך דרך --p */
function NeonSlider({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) {
  const p = ((value - min) / (max - min)) * 100
  return <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ '--p': p + '%' } as React.CSSProperties} />
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ width: 42, height: 23, borderRadius: 20, padding: 0, cursor: 'pointer', flex: '0 0 auto', position: 'relative', transition: 'all .2s', border: '1px solid ' + (on ? 'rgba(47,243,255,.7)' : 'rgba(120,160,200,.3)'), background: on ? 'linear-gradient(90deg,rgba(47,243,255,.25),rgba(255,69,230,.22))' : 'rgba(8,14,26,.8)', boxShadow: on ? '0 0 14px rgba(47,243,255,.4)' : 'none' }}>
      <span style={{ position: 'absolute', top: 2, [on ? 'left' : 'right']: 2, width: 17, height: 17, borderRadius: '50%', background: on ? '#bff7ff' : '#7c93ad', boxShadow: on ? '0 0 8px #2ff3ff' : 'none', transition: 'all .2s' }} />
    </button>
  )
}


const ICON = {
  sliders: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></svg>,
  grid: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>,
  bot: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" /><line x1="8" y1="16" x2="8" y2="16" /><line x1="16" y1="16" x2="16" y2="16" /></svg>,
}

function Studio() {
  const s = useCreatorStore()

  /* שיפור תוכן הלימוד עם AI */
  const [enhancing, setEnhancing] = useState(false)
  const [enhanceError, setEnhanceError] = useState<string | null>(null)
  const [comparison, setComparison] = useState<{ original: string; enhanced: string } | null>(null)

  async function enhanceContent() {
    if (enhancing) return
    const original = s.curriculum
    const wasEmpty = original.trim() === ''
    setEnhancing(true)
    setEnhanceError(null)
    setComparison(null)
    try {
      const res = await apiFetch('/api/ai/enhance-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: s.title, content: original, writingLevel: s.writingLevel, questType: s.questType }),
      })
      if (!res.ok) throw new Error()
      const { enhanced } = await res.json()
      if (!enhanced) throw new Error()
      if (wasEmpty) s.set({ curriculum: enhanced })
      else setComparison({ original, enhanced })
    } catch {
      setEnhanceError('השיפור נכשל, נסה שוב')
    } finally {
      setEnhancing(false)
    }
  }

  const canSubmit = s.title.trim().length > 0
  const activePuzzles = PUZZLE_TYPES.filter((p) => s.puzzleTypes[p.key]).length + (s.puzzleTypes.finalQuiz ? 1 : 0)
  const artLabel = ART_STYLES.find((a) => a.key === s.artStyle)?.label
  const simLabel = SIM_TYPES.find((t) => t.key === s.questType)?.label

  const col: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }

  return (
    <div className="cf holo-page-enter" dir="rtl" style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-display)', background: 'var(--holo-bg-deep)' }}>
      <style>{`@keyframes cf-spin { to { transform: rotate(360deg); } }
        select.cf-in option { background: #070a18; color: #eaf6ff; }
        select.cf-in option:checked { background: linear-gradient(#13243f,#13243f); color: #7ef6ff; }`}</style>
      {/* כדורי זוהר */}
      <div style={{ position: 'absolute', left: -120, top: -80, width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,69,230,.14), transparent 70%)', filter: 'blur(20px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', right: -120, bottom: -120, width: 460, height: 460, borderRadius: '50%', background: 'radial-gradient(circle, rgba(47,243,255,.12), transparent 70%)', filter: 'blur(20px)', pointerEvents: 'none' }} />

      <StudioTopBar active="create" />

      {/* ===== גוף — 3 עמודות הנפרסות עד תחתית הדף (נערמות במסכים צרים) ===== */}
      <div data-studio-content className="holo-tab-enter" style={{ position: 'relative', zIndex: 2, flex: 1, minHeight: 0, display: 'flex', gap: 18, padding: '12px 30px 26px', flexWrap: 'wrap', alignItems: 'stretch' }}>

        {/* חידות (ימין ב-RTL) */}
        <div style={{ ...col, flex: '1 1 320px' }}>
          <div style={{ ...glass, padding: 22, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <PanelHead icon={ICON.grid} title="חידות" kicker={activePuzzles + ' פעילות'} />
            <div className="cf-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', flex: 1, minHeight: 0, paddingLeft: 4 }}>
              {PUZZLE_TYPES.map((p) => {
                const on = !!s.puzzleTypes[p.key]
                return (
                  <div key={p.key}>
                    <button onClick={() => s.togglePuzzle(p.key)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 12, cursor: 'pointer', transition: 'all .18s', background: on ? 'rgba(47,243,255,.09)' : 'rgba(4,9,18,.5)', border: '1px solid ' + (on ? 'rgba(47,243,255,.5)' : 'rgba(120,200,255,.12)'), boxShadow: on ? '0 0 16px rgba(47,243,255,.16)' : 'none' }}>
                      <span style={{ flex: 1, textAlign: 'right', fontSize: 13.5, fontWeight: 600, color: on ? '#fff' : '#aebfd2' }}>{p.label}</span>
                      <span style={{ width: 20, height: 20, borderRadius: 6, display: 'grid', placeItems: 'center', background: on ? 'linear-gradient(135deg,#2ff3ff,#9b8cff)' : 'transparent', border: '1px solid ' + (on ? 'transparent' : 'rgba(120,160,200,.35)') }}>
                        {on && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#04101c" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                      </span>
                    </button>
                    {on && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px 2px', justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: 11.5, color: '#8aa0b8', marginLeft: 'auto' }}>כמות:</span>
                        {[1, 2, 3, 4, 5].map((n) => {
                          const sel = (s.puzzleCounts[p.key] ?? 1) === n
                          return (
                            <button key={n} onClick={() => s.setPuzzleCount(p.key, n)} style={{ width: 28, height: 28, borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono)', background: sel ? 'linear-gradient(135deg,#2ff3ff,#9b8cff)' : 'rgba(4,9,18,.6)', border: '1px solid ' + (sel ? 'transparent' : 'rgba(120,200,255,.18)'), color: sel ? '#04101c' : '#aebfd2', boxShadow: sel ? '0 0 12px rgba(47,243,255,.4)' : 'none' }}>{n}</button>
                          )
                        })}
                      </div>
                    )}
                    {p.key === 'itemUsage' && on && (
                      <p style={{ fontSize: 11.5, marginTop: 6, paddingRight: 12, color: 'var(--holo-cyan-bright)', opacity: 0.85 }}>🗝️ ייווצרו {s.puzzleCounts.itemUsage ?? 1} מפתחות ו-{s.puzzleCounts.itemUsage ?? 1} שערים נעולים</p>
                    )}
                  </div>
                )
              })}

              {/* מבחן סיכום — אותו עיצוב ככל החידות (3-10 שאלות) */}
              {(() => {
                const on = !!s.puzzleTypes.finalQuiz
                const count = s.puzzleCounts.finalQuiz ?? 5
                return (
                  <div>
                    <button onClick={() => { s.togglePuzzle('finalQuiz'); if (!on && (s.puzzleCounts.finalQuiz ?? 0) < 3) s.setPuzzleCount('finalQuiz', 5) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 12, cursor: 'pointer', transition: 'all .18s', background: on ? 'rgba(47,243,255,.09)' : 'rgba(4,9,18,.5)', border: '1px solid ' + (on ? 'rgba(47,243,255,.5)' : 'rgba(120,200,255,.12)'), boxShadow: on ? '0 0 16px rgba(47,243,255,.16)' : 'none' }}>
                      <span style={{ flex: 1, textAlign: 'right', fontSize: 13.5, fontWeight: 600, color: on ? '#fff' : '#aebfd2' }}>מבחן סיכום</span>
                      <span style={{ width: 20, height: 20, borderRadius: 6, display: 'grid', placeItems: 'center', background: on ? 'linear-gradient(135deg,#2ff3ff,#9b8cff)' : 'transparent', border: '1px solid ' + (on ? 'transparent' : 'rgba(120,160,200,.35)') }}>
                        {on && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#04101c" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                      </span>
                    </button>
                    {on && (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px 2px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11.5, color: '#8aa0b8', marginLeft: 'auto' }}>שאלות:</span>
                          {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                            <button key={n} onClick={() => s.setPuzzleCount('finalQuiz', n)} style={{ width: 28, height: 28, borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono)', background: count === n ? 'linear-gradient(135deg,#2ff3ff,#9b8cff)' : 'rgba(4,9,18,.6)', border: '1px solid ' + (count === n ? 'transparent' : 'rgba(120,200,255,.18)'), color: count === n ? '#04101c' : '#aebfd2', boxShadow: count === n ? '0 0 12px rgba(47,243,255,.4)' : 'none' }}>{n}</button>
                          ))}
                        </div>
                        <p style={{ fontSize: 11.5, marginTop: 6, paddingRight: 12, color: 'var(--holo-cyan-bright)', opacity: 0.85 }}>🏁 בסצנת השיא ייווצר מבחן אינטגרטיבי של {count} שאלות</p>
                      </>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>

        {/* מרכז — סיכום → חלון תוכן → צור הדמיה */}
        <div style={{ ...col, flex: '2 1 440px' }}>
          {s.status === 'error' && (
            <div style={{ ...glass, padding: '16px 20px', borderColor: 'rgba(255,80,120,.4)', textAlign: 'center' }}>
              <p style={{ color: '#ff7099' }}>{s.error}</p>
              <button onClick={() => s.generate()} style={{ marginTop: 10, padding: '8px 18px', borderRadius: 10, cursor: 'pointer', background: 'rgba(255,80,120,.12)', border: '1px solid rgba(255,80,120,.4)', color: '#ffd0dc', fontWeight: 600 }}>נסה שוב 🔄</button>
            </div>
          )}

          {/* סיכום — chips */}
          <div style={{ ...glass, padding: '20px 24px' }}>
            <div style={{ textAlign: 'center', minWidth: 0 }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', lineHeight: 1.1, textShadow: '0 0 20px rgba(47,243,255,.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title || 'נושא ההדמיה'}</div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {s.subject && <span style={{ ...chip, color: '#ffd6f6', background: 'rgba(255,69,230,.1)', borderColor: 'rgba(255,69,230,.3)' }}>{s.subject}</span>}
                <span style={chip}>{simLabel}</span>
                <span style={chip}>{s.questLength} סצנות</span>
                <span style={chip}>{activePuzzles} סוגי חידות</span>
                <span style={chip}>שכבת {gradeLabel(s.writingLevel)}</span>
                <span style={chip}>{artLabel}</span>
                {s.includeDrHolo && <span style={{ ...chip, color: '#ffd6f6', background: 'rgba(255,69,230,.1)', borderColor: 'rgba(255,69,230,.3)' }}>ד״ר הולו</span>}
              </div>
            </div>
          </div>

          {/* חלון תוכן — גדל למילוי הגובה; הכפתור שמתחתיו עושה את עמודת המרכז קצרה יותר */}
          <div style={{ ...glass, padding: 24, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 220px', minWidth: 180 }}>
                <label style={fieldLabel}>נושא ההדמיה</label>
                <input className="cf-in" style={inputBase} value={s.title} onChange={(e) => s.set({ title: e.target.value })} placeholder="למשל: מסע אל מערכת השמש" />
              </div>
              <div style={{ flex: '0 0 170px', position: 'relative' }}>
                <label style={fieldLabel}>מקצוע</label>
                <select className="cf-in" value={s.subject} onChange={(e) => s.set({ subject: e.target.value })}
                  style={{ ...inputBase, appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer', paddingLeft: 28, color: s.subject ? 'var(--holo-text-bright)' : '#5e7290' }}>
                  <option value="">בחרו מקצוע…</option>
                  {SUBJECTS.map((sub) => <option key={sub} value={sub}>{sub}</option>)}
                </select>
                <div style={{ position: 'absolute', left: 11, bottom: 12, pointerEvents: 'none', color: '#2ff3ff', fontSize: 10 }}>▾</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ ...fieldLabel, margin: 0 }}>תוכן הלימוד <span style={{ fontWeight: 400, color: 'rgba(160,200,240,.5)', fontSize: 11 }}>(אופציונלי)</span></label>
              <button type="button" onClick={enhanceContent} disabled={enhancing} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#e7d6ff', background: 'linear-gradient(135deg, rgba(155,140,255,.25), rgba(47,243,255,.18))', border: '1px solid rgba(155,140,255,.5)', boxShadow: '0 0 12px rgba(155,140,255,.25)', opacity: enhancing ? 0.6 : 1 }}>
                {enhancing ? <><span style={{ display: 'inline-block', animation: 'cf-spin .8s linear infinite' }}>⟳</span> משפר…</> : <>שפר עם AI ✨</>}
              </button>
            </div>
            <textarea className="cf-in" style={{ ...inputBase, marginBottom: 14, lineHeight: 1.55, minHeight: 110, flex: 1, resize: 'vertical' }} value={s.curriculum} onChange={(e) => s.set({ curriculum: e.target.value })} placeholder="תארו את החומר שתרצו ללמד: נושאים, מושגים, עובדות חשובות…" />

            {enhanceError && <p style={{ fontSize: 13, color: '#ff9bb3', marginBottom: 10 }}>⚠️ {enhanceError}</p>}

            {/* השוואה — מקור מול גרסה משופרת */}
            {comparison && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ borderRadius: 11, padding: 12, background: 'rgba(4,9,18,.6)', border: '1px solid rgba(120,200,255,.16)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, color: '#9fb6cf' }}>הטקסט המקורי</div>
                    <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', opacity: 0.75, maxHeight: '12rem', overflowY: 'auto' }}>{comparison.original}</p>
                  </div>
                  <div style={{ borderRadius: 11, padding: 12, background: 'rgba(155,140,255,.1)', border: '1px solid rgba(155,140,255,.5)', boxShadow: '0 0 14px rgba(155,140,255,.2)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, color: '#c9b6ff' }}>✨ הגרסה המשופרת</div>
                    <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', maxHeight: '12rem', overflowY: 'auto', color: 'var(--holo-text-bright)' }}>{comparison.enhanced}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                  <button onClick={() => { s.set({ curriculum: comparison.enhanced }); setComparison(null) }} style={{ padding: '9px 16px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg,#9b8cff,#2ff3ff)', border: 'none' }}>השתמש בגרסה המשופרת ✨</button>
                  <button onClick={() => setComparison(null)} style={{ padding: '9px 16px', borderRadius: 10, cursor: 'pointer', fontWeight: 600, color: '#aebfd2', background: 'transparent', border: '1px solid rgba(120,200,255,.25)' }}>השאר את המקור</button>
                </div>
              </div>
            )}

            <div style={{ paddingTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 9 }}>
                <label style={{ ...fieldLabel, margin: 0 }}>אורך ההדמיה</label>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: '#7ef6ff' }}>{s.questLength} סצנות</span>
              </div>
              <NeonSlider value={s.questLength} min={4} max={15} onChange={(n) => s.set({ questLength: n })} />
              <div style={{ ...micro, fontSize: 9.5, color: 'rgba(140,170,200,.5)', marginTop: 9 }}>4 — 15 סצנות</div>
            </div>
          </div>

          {/* כפתור יצירה */}
          <button onClick={() => canSubmit && s.generate()} disabled={!canSubmit} style={{ width: '100%', padding: 18, borderRadius: 16, border: 'none', cursor: canSubmit ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: '#04101c', position: 'relative', overflow: 'hidden', background: 'linear-gradient(100deg,#2ff3ff,#9b8cff 55%,#ff45e6)', boxShadow: '0 0 30px rgba(47,243,255,.5), 0 12px 30px -10px rgba(255,69,230,.5)', opacity: canSubmit ? 1 : 0.45 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, justifyContent: 'center' }}>
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#04101c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></svg>
              צור הדמיה
            </span>
          </button>
        </div>

        {/* התאמות (שמאל ב-RTL) */}
        <div style={{ ...col, flex: '1 1 320px' }}>
          <div style={{ ...glass, padding: 22, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <PanelHead icon={ICON.sliders} title="התאמות" kicker="TUNING" />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
              <label style={{ ...fieldLabel, margin: 0 }}>שכבת גיל</label>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#7ef6ff' }}>כיתה {gradeLabel(s.writingLevel)}</span>
            </div>
            {/* בורר שכבת-גיל (גן→י"ג) — מניע רמת כתיבה, אופי ההדמיה וקושי החידות יחד.
                ללא מספרים/קצוות (הקצוות 1-3/18-20 רק בהגדרות הפר-תלמיד). */}
            <select
              value={s.writingLevel}
              onChange={(e) => { const lv = Number(e.target.value); s.set({ writingLevel: lv, puzzleDifficulty: lv }) }}
              style={{ ...inputBase, marginBottom: 8, cursor: 'pointer' }}
            >
              {GRADE_LEVELS.map((g) => (
                <option key={g.level} value={g.level}>{g.label === 'גן' ? 'גן' : `כיתה ${g.label}`}</option>
              ))}
            </select>
            <p style={{ ...micro, marginBottom: 20 }}>ההדמיה תיווצר ברמת התלמיד הממוצע בשכבה — שפה, אופי ותוכן. ההתאמה הפר-תלמיד מכווננת מכאן.</p>

            <label style={fieldLabel}>סוג ההדמיה</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 20 }}>
              {SIM_TYPES.map((t) => {
                const on = s.questType === t.key
                return (
                  <button key={t.key} onClick={() => s.set({ questType: t.key })} style={{ textAlign: 'center', padding: '12px 6px', borderRadius: 11, cursor: 'pointer', transition: 'all .2s', background: on ? 'linear-gradient(160deg,rgba(47,243,255,.16),rgba(255,69,230,.1))' : 'rgba(4,9,18,.55)', border: '1px solid ' + (on ? 'rgba(47,243,255,.7)' : 'rgba(120,200,255,.14)'), boxShadow: on ? '0 0 18px rgba(47,243,255,.25)' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', color: on ? '#5eead4' : '#8fd5e6', filter: on ? 'drop-shadow(0 0 8px rgba(34,211,238,.5))' : 'none' }}><HoloIcon name={t.key as HoloIconName} size={30} /></div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: on ? '#fff' : '#cfe1f2', marginTop: 4 }}>{t.label}</div>
                    <div style={{ fontSize: 10, color: '#7d94ae', marginTop: 2 }}>{t.desc}</div>
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 13px', borderRadius: 12, background: 'rgba(4,9,18,.5)', border: '1px solid rgba(120,200,255,.12)', marginBottom: 20, color: s.includeDrHolo ? '#7ef6ff' : '#6f87a1' }}>
              <HoloIcon name="drholo" size={24} style={{ filter: s.includeDrHolo ? 'drop-shadow(0 0 8px rgba(34,211,238,.5))' : 'none' }} />
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: '#cfe1f2' }}>ד״ר הולו <span style={{ color: '#8aa0b8', fontWeight: 400 }}>· דמות מנחה</span></span>
              <Toggle on={s.includeDrHolo} onClick={() => s.set({ includeDrHolo: !s.includeDrHolo })} />
            </div>

            <label style={fieldLabel}>סגנון אמנותי</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {ART_STYLES.map((a) => {
                const on = s.artStyle === a.key
                return (
                  <button key={a.key} onClick={() => s.set({ artStyle: a.key })} title={a.label} style={{ padding: '10px 4px', borderRadius: 11, cursor: 'pointer', transition: 'all .18s', textAlign: 'center', background: on ? 'linear-gradient(150deg,rgba(255,69,230,.16),rgba(47,243,255,.12))' : 'rgba(4,9,18,.55)', border: '1px solid ' + (on ? 'rgba(255,69,230,.6)' : 'rgba(120,200,255,.14)'), color: on ? '#fff' : '#aebfd2', boxShadow: on ? '0 0 16px rgba(255,69,230,.2)' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', color: on ? '#f0a6ff' : '#8fd5e6', filter: on ? 'drop-shadow(0 0 8px rgba(217,70,239,.5))' : 'none' }}><HoloIcon name={a.key as HoloIconName} size={26} /></div>
                    <div style={{ fontSize: 11, fontWeight: 600, marginTop: 5 }}>{a.label}</div>
                  </button>
                )
              })}
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}

export default function CreationForm() {
  const status = useCreatorStore((st) => st.status)
  const title = useCreatorStore((st) => st.title)
  const result = useCreatorStore((st) => st.result)

  if (status === 'generating') return <GeneratingScreen title={title} />
  if (status === 'done' && result) return <QuestPreview />
  return <Studio />
}
