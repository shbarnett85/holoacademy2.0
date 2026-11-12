import { LAB } from '../player/lab/labComposition'
import { puzzleTypeLabel } from '../../shared/lib/labels'
import { infoChip, panelStaff } from '../../styles/ui'

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

/* אייקוני קו זעירים לתגיות (תואמים לערכת העיצוב). הצבע ב-style: var() לא עובד באטריביוט SVG */
const IconGrid = ({ c = 'var(--color-ink)' }: { c?: string }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ stroke: c }} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
)
const IconSpark = ({ c = 'var(--color-human-deep)' }: { c?: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ stroke: c }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M17.7 6.3l-2.8 2.8M9.1 14.9l-2.8 2.8" /></svg>
)
const IconKey = ({ c = 'var(--color-human-deep)' }: { c?: string }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ stroke: c }} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="15.5" r="3.5" /><path d="m10 13 8-8" /><path d="m15 5 3 3" /><path d="m18 8 2-2" /></svg>
)
const IconScene = ({ c = 'var(--color-muted)' }: { c?: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ stroke: c }} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></svg>
)

function SceneRow({ scene, n, last, onRegenerateImage, regenerating, onEdit }: {
  scene: SceneData; n: number; last: boolean
  onRegenerateImage?: (id: string) => void; regenerating: boolean; onEdit?: (id: string) => void
}) {
  /* הסצנה הראשונה היא המעבדה הקבועה: אין לה תמונה משלה (חוץ מפאזל החלפה, שבנוי מתמונת הסצנה) */
  const fixedLab = n === 1 && scene.puzzle?.type !== 'tileSwap'
  const locked = !!scene.requiresItemId
  const summary = scene.puzzle?.type === 'finalQuiz'
  const amber = locked || summary

  const SPINE = 56
  return (
    /* פריסה: [שדרה] [כרטיס] [תמונה משמאל] [spacer]. ה-spacer בשמאל שווה לרוחב השדרה
       בימין → זוג ה[כרטיס+תמונה] ממורכז בעמוד ביחס לנקודת האמצע המשולבת שלהם. */
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 16, marginBottom: last ? 4 : 22 }}>
      {/* ── עמודת השדרה: צומת ממוספר + קו מחבר (ימין ב-RTL) ── */}
      <div style={{ position: 'relative', width: SPINE, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{
          position: 'relative', zIndex: 2, width: 50, height: 50, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0,
          background: amber ? 'var(--color-human-tint)' : 'var(--color-surface)',
          border: '2px solid var(--color-ink)',
        }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 19, fontWeight: 700, color: amber ? 'var(--color-human-deep)' : 'var(--color-machine-deep)' }}>{n}</span>
          {locked && (
            <div style={{ position: 'absolute', bottom: -4, right: -4, width: 20, height: 20, borderRadius: '50%', background: 'var(--color-surface)', border: '1.5px solid var(--color-ink)', display: 'grid', placeItems: 'center' }}>
              <IconKey />
            </div>
          )}
        </div>
        {!last && <div style={{ flex: 1, width: 2, marginTop: 4, background: 'var(--color-line-strong)' }} />}
      </div>

      {/* ── כרטיס הסצנה ── */}
      <div
        onClick={onEdit ? () => onEdit(scene.id) : undefined}
        title={onEdit ? 'לחצו לעריכת הסצנה' : undefined}
        style={{
          ...panelStaff,
          position: 'relative', flex: 1, minWidth: 0, padding: '16px 20px', overflow: 'hidden',
          cursor: onEdit ? 'pointer' : 'default',
        }}>
        {/* פס מבטא בקצה הפנימי (ימין ב-RTL) */}
        <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 3, background: amber ? 'var(--color-human)' : 'var(--color-machine)' }} />

        <div style={{ ...micro, color: amber ? 'var(--color-human-deep)' : 'var(--color-muted)', marginBottom: 8 }}>סצנה {n}{summary ? ' · סצנת סיכום' : locked ? ' · שער נעול' : ''}</div>
        <h3 style={{ margin: '0 0 8px', fontSize: 19, fontWeight: 800, color: 'var(--color-ink)', letterSpacing: '-.01em' }}>{scene.title}</h3>

        {scene.narrative && (
          <p style={{ margin: '0 0 14px', fontSize: 13.5, lineHeight: 1.7, color: 'var(--color-muted)' }}>
            {scene.narrative.length > 150 ? scene.narrative.slice(0, 150) + '…' : scene.narrative}
          </p>
        )}

        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
          {scene.collectableItem && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 13px', borderRadius: 30, background: 'var(--color-human-tint)', border: '1.5px solid var(--color-human-deep)' }}>
              <IconSpark />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-human-deep)' }}>{scene.collectableItem.name}</span>
            </div>
          )}
          {scene.puzzle && (
            <div style={{ ...infoChip, display: 'flex', alignItems: 'center', gap: 7, padding: '6px 13px', borderRadius: 30 }}>
              <IconGrid />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink)' }}>חידה: <span style={{ color: 'var(--color-ink)', fontWeight: 700 }}>{puzzleTypeLabel(scene.puzzle.type)}</span></span>
            </div>
          )}
        </div>
      </div>

      {/* ── תמונת ה-preview: בגובה מלא של הכרטיס, משמאל לו ── */}
      <div
        onClick={onEdit ? () => onEdit(scene.id) : undefined}
        style={{ position: 'relative', alignSelf: 'stretch', width: 'clamp(150px, 26%, 240px)', flexShrink: 0, borderRadius: 12, overflow: 'hidden', border: '2px solid var(--color-ink)', background: 'var(--color-surface)', cursor: onEdit ? 'pointer' : 'default' }}>
        {fixedLab ? (
          <img src={LAB.src} alt="המעבדה" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : scene.imageUrl ? (
          <>
            <img src={scene.imageUrl} alt={scene.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: regenerating ? 0.4 : 1 }} />
            {onRegenerateImage && (
              <button title="צור תמונה מחדש" disabled={regenerating} className="holo-button holo-button--staff holo-button--sm"
                onClick={(e) => { e.stopPropagation(); onRegenerateImage(scene.id) }}
                style={{ position: 'absolute', bottom: 6, left: 6, width: 28, height: 28, padding: 0, borderRadius: 8, fontSize: 13, display: 'grid', placeItems: 'center' }}>
                {regenerating ? '…' : '🔄'}
              </button>
            )}
          </>
        ) : (
          <div style={{ width: '100%', height: '100%', minHeight: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--color-ink-wash)' }}>
            <IconScene />
            <span style={{ ...micro, fontSize: 8.5, color: 'var(--color-muted)' }}>אין תמונה עדיין</span>
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
