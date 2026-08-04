import { useState } from 'react'
import { puzzleTypeLabel } from '../../shared/lib/labels'

export interface SceneData {
  id: string
  title: string
  narrative?: string
  imageUrl?: string
  puzzle?: { type?: string; question: string }
  collectableItem?: { id: string; name: string; icon: string; imageUrl?: string }
  requiresItemId?: string | null
}

interface Props {
  scenes: SceneData[]
  onRegenerateImage?: (sceneId: string) => void
  regeneratingSceneId?: string | null
  onEditScene?: (sceneId: string) => void
}

const micro: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase' }

/* אייקוני קו זעירים לתגיות (תואמים לערכת העיצוב) */
const IconGrid = ({ c = 'var(--t1)' }: { c?: string }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
)
const IconSpark = ({ c = 'var(--t34)' }: { c?: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M17.7 6.3l-2.8 2.8M9.1 14.9l-2.8 2.8" /></svg>
)
const IconKey = ({ c = 'var(--t209)' }: { c?: string }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="15.5" r="3.5" /><path d="m10 13 8-8" /><path d="m15 5 3 3" /><path d="m18 8 2-2" /></svg>
)
const IconScene = ({ c = 'var(--t15)' }: { c?: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></svg>
)

function SceneRow({ scene, n, last, onRegenerateImage, regenerating, onEdit }: {
  scene: SceneData; n: number; last: boolean
  onRegenerateImage?: (id: string) => void; regenerating: boolean; onEdit?: (id: string) => void
}) {
  const [hov, setHov] = useState(false)
  const locked = !!scene.requiresItemId
  const summary = scene.puzzle?.type === 'finalQuiz'
  const amber = locked || summary
  const accent = amber ? 'var(--t209)' : 'var(--t15)'
  const rgb = amber ? '255,180,84' : '47,243,255'

  const SPINE = 56
  return (
    /* פריסה: [שדרה] [כרטיס] [תמונה משמאל] [spacer]. ה-spacer בשמאל שווה לרוחב השדרה
       בימין → זוג ה[כרטיס+תמונה] ממורכז בעמוד ביחס לנקודת האמצע המשולבת שלהם. */
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 16, marginBottom: last ? 4 : 22 }}>
      {/* ── עמודת השדרה: צומת ממוספר + קו מחבר (ימין ב-RTL) ── */}
      <div style={{ position: 'relative', width: SPINE, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{
          position: 'relative', zIndex: 2, width: 50, height: 50, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0,
          background: `radial-gradient(circle at 35% 30%, ${window.HoloTint(rgb, .28)}, var(--t233))`,
          border: `2px solid ${hov ? accent : `${window.HoloTint(rgb, .5)}`}`,
          boxShadow: hov ? `0 0 22px ${window.HoloTint(rgb, .5)}, 0 0 50px ${window.HoloTint(rgb, .18)}` : `0 0 12px ${window.HoloTint(rgb, .22)}`,
          transition: 'all .22s cubic-bezier(.22,.7,.35,1)',
        }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 19, fontWeight: 700, color: amber ? 'var(--t234)' : 'var(--t235)', textShadow: `0 0 12px ${window.HoloTint(rgb, .7)}` }}>{n}</span>
          {locked && (
            <div style={{ position: 'absolute', bottom: -4, right: -4, width: 20, height: 20, borderRadius: '50%', background: 'var(--t236)', border: '1px solid var(--t217)', display: 'grid', placeItems: 'center' }}>
              <IconKey />
            </div>
          )}
        </div>
        {!last && <div style={{ flex: 1, width: 2, marginTop: 4, background: 'linear-gradient(180deg, var(--t77), var(--t237))', boxShadow: '0 0 8px var(--t21)' }} />}
      </div>

      {/* ── כרטיס הסצנה ── */}
      <div
        onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        onClick={onEdit ? () => onEdit(scene.id) : undefined}
        title={onEdit ? 'לחצו לעריכת הסצנה' : undefined}
        style={{
          position: 'relative', flex: 1, minWidth: 0, padding: '16px 20px', overflow: 'hidden', borderRadius: 16,
          background: 'linear-gradient(135deg, var(--t210), var(--t211))',
          border: `1px solid ${hov ? `${window.HoloTint(rgb, .4)}` : 'var(--t33)'}`,
          boxShadow: hov ? `0 0 30px ${window.HoloTint(rgb, .12)}` : 'none',
          cursor: onEdit ? 'pointer' : 'default',
          transition: 'all .2s cubic-bezier(.22,.7,.35,1)',
        }}>
        {/* פס מבטא בקצה הפנימי (ימין ב-RTL) */}
        <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 3, background: `linear-gradient(180deg, ${accent}, var(--t119))`, opacity: hov ? 1 : 0.5, transition: 'opacity .2s', boxShadow: `0 0 12px ${window.HoloTint(rgb, .5)}` }} />

        <div style={{ ...micro, color: `${window.HoloTint(rgb, .7)}`, marginBottom: 8 }}>סצנה {n}{summary ? ' · סצנת סיכום' : locked ? ' · שער נעול' : ''}</div>
        <h3 style={{ margin: '0 0 8px', fontSize: 19, fontWeight: 800, color: 'var(--t13)', letterSpacing: '-.01em' }}>{scene.title}</h3>

        {scene.narrative && (
          <p style={{ margin: '0 0 14px', fontSize: 13.5, lineHeight: 1.7, color: 'var(--t212)' }}>
            {scene.narrative.length > 150 ? scene.narrative.slice(0, 150) + '…' : scene.narrative}
          </p>
        )}

        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
          {scene.collectableItem && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 13px', borderRadius: 30, background: 'linear-gradient(135deg, var(--t96), var(--t112))', border: '1px solid var(--t35)', boxShadow: '0 0 14px var(--t106)' }}>
              <IconSpark />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t105)' }}>{scene.collectableItem.name}</span>
            </div>
          )}
          {scene.puzzle && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 13px', borderRadius: 30, background: 'var(--t20)', border: '1px solid var(--t21)', boxShadow: '0 0 14px var(--t20)' }}>
              <IconGrid />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t19)' }}>חידה: <span style={{ color: 'var(--t1)', fontWeight: 700 }}>{puzzleTypeLabel(scene.puzzle.type)}</span></span>
            </div>
          )}
        </div>
      </div>

      {/* ── תמונת ה-preview: בגובה מלא של הכרטיס, משמאל לו ── */}
      <div
        onClick={onEdit ? () => onEdit(scene.id) : undefined}
        style={{ position: 'relative', alignSelf: 'stretch', width: 'clamp(150px, 26%, 240px)', flexShrink: 0, borderRadius: 14, overflow: 'hidden', border: `1px solid ${window.HoloTint(rgb, .3)}`, cursor: onEdit ? 'pointer' : 'default', boxShadow: hov ? `0 0 24px ${window.HoloTint(rgb, .18)}` : 'none', transition: 'box-shadow .2s' }}>
        {scene.imageUrl ? (
          <>
            <img src={scene.imageUrl} alt={scene.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: regenerating ? 0.4 : 1 }} />
            {onRegenerateImage && (
              <button title="צור תמונה מחדש" disabled={regenerating}
                onClick={(e) => { e.stopPropagation(); onRegenerateImage(scene.id) }}
                style={{ position: 'absolute', bottom: 6, left: 6, width: 26, height: 26, borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'var(--t214)', border: '1px solid var(--t2)', color: 'var(--t19)', display: 'grid', placeItems: 'center' }}>
                {regenerating ? '…' : '🔄'}
              </button>
            )}
          </>
        ) : (
          <div style={{ width: '100%', height: '100%', minHeight: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: `linear-gradient(135deg, ${window.HoloTint(rgb, .06)}, var(--t215))` }}>
            <IconScene c={accent} />
            <span style={{ ...micro, fontSize: 8.5, color: `${window.HoloTint(rgb, .5)}` }}>אין תמונה עדיין</span>
          </div>
        )}
      </div>

      {/* spacer לאיזון מול השדרה — ממרכז את זוג הכרטיס+תמונה */}
      <div style={{ width: SPINE, flexShrink: 0 }} aria-hidden />
    </div>
  )
}

/* כרטיסי סצנות — ציר-מסע הולוגרפי (שדרה ממוספרת + כרטיסים). משותף לטיוטה/תצוגה מקדימה. */
export default function SceneCards({ scenes, onRegenerateImage, regeneratingSceneId, onEditScene }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', maxWidth: 920, margin: '0 auto' }}>
      {scenes.map((scene, i) => (
        <SceneRow
          key={scene.id} scene={scene} n={i + 1} last={i === scenes.length - 1}
          onRegenerateImage={onRegenerateImage} regenerating={regeneratingSceneId === scene.id} onEdit={onEditScene}
        />
      ))}
    </div>
  )
}
