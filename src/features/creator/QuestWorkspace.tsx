import { useEffect, useState, type ReactNode } from 'react'
import { apiFetch } from '../../shared/lib/api'
import type { GeneratedQuest, HubInfo } from './creatorStore'
import SceneCards from './SceneCards'
import SceneEditModal from './SceneEditModal'
import DrHoloEmblem from '../../shared/ui/DrHoloEmblem'

type Scene = GeneratedQuest['game_data']['scenes'][number]
type EndingScene = NonNullable<GeneratedQuest['game_data']['endingGood']>

/* מוסיף פרמטר cache-bust ל-URL תמונה שזה עתה נוצרה-מחדש, כדי שהדפדפן יטען את החדשה
   ולא יציג העתק ישן מהמטמון (Cloudinary מחזיר אותו public_id). מקומי לתצוגה בלבד. */
function bustCache(url: string): string {
  if (!url) return url
  return url + (url.includes('?') ? '&' : '?') + 'r=' + Date.now()
}

interface ImageProgress {
  completed: number
  total: number
  running: boolean
}

interface Props {
  questId: string
  title: string
  subtitle?: ReactNode
  scenes: Scene[]
  endingGood?: EndingScene
  endingBad?: EndingScene
  /* אזהרות מבנה והצגת ה-Hub — קיימים רק מיד אחרי יצירה */
  warnings?: string[]
  hub?: HubInfo | null
  /* עדכון סצנה במקור הנתונים של ההורה (store או state מקומי) */
  patchScene: (sceneId: string, patch: Partial<Scene>) => void
  patchEnding?: (which: 'good' | 'bad', patch: Partial<EndingScene>) => void
  /* כפתורי פעולה ייעודיים להקשר (שמירה/חזרה/נסה הדמיה) */
  actions?: ReactNode
  /* עריכת שם ההדמיה — אופציונלי (רק בדף העריכה, QuestView; לא ב-QuestPreview שאחרי יצירה) */
  onTitleSave?: (newTitle: string) => Promise<void> | void
}

/* כפתור פעולה בעיצוב הטיוטות — primary (גרדיאנט) / ghost (זכוכית ציאן) / play (זכוכית סגולה).
   משותף ל-QuestPreview ו-QuestView כך ששלושת הכפתורים בתחתית זהים בכל עמודי הטיוטות. */
export function WsButton({ variant, icon, children, onClick, disabled }: { variant: 'primary' | 'ghost' | 'play'; icon: ReactNode; children: ReactNode; onClick: () => void; disabled?: boolean }) {
  const [hov, setHov] = useState(false)
  const base: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 9, padding: '11px 22px', borderRadius: 12, cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'var(--font-display)', fontSize: 14.5, fontWeight: 700, transition: 'all .16s', whiteSpace: 'nowrap',
    opacity: disabled ? 0.45 : 1,
  }
  let style: React.CSSProperties
  if (variant === 'primary') {
    style = { ...base, background: 'linear-gradient(120deg,#2ff3ff,#9b8cff)', border: '1px solid transparent', color: '#04101c', boxShadow: hov && !disabled ? '0 0 22px rgba(47,243,255,.5)' : '0 0 14px rgba(47,243,255,.28)' }
  } else {
    const rgb = variant === 'play' ? '120,90,255' : '47,243,255'
    style = { ...base, background: hov && !disabled ? `rgba(${rgb},.18)` : `rgba(${rgb},.07)`, border: `1px solid rgba(${rgb},${hov && !disabled ? '.65' : '.3'})`, color: hov && !disabled ? '#fff' : variant === 'play' ? '#cdbcff' : '#bfe9ff', boxShadow: hov && !disabled ? `0 0 16px rgba(${rgb},.3)` : 'none' }
  }
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={style}>{icon}{children}</button>
  )
}

/* אייקוני קו לכפתורי הפעולה */
export const WsIcons = {
  check: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>,
  refresh: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></svg>,
  play: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5v14l11-7z" /></svg>,
  undo: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 5 5v1a5 5 0 0 1-5 5H9" /></svg>,
}

/* כפתורי הפעולה המשותפים לעמוד היצירה (QuestPreview) ולעמוד העריכה (QuestView).
   *מקור יחיד* — כל שינוי בכפתורים חל אוטומטית על שני העמודים. onUndo אופציונלי —
   רק ב-QuestView (עריכת הדמיה קיימת) יש "מצב מקורי" לחזור אליו; ב-QuestPreview
   (מיד אחרי יצירה) אין עדיין עריכות, אז אין צורך בכפתור. */
export function WorkspaceActions({ onSave, onRegenerate, onPlay, onUndo, undoDisabled }: { onSave: () => void; onRegenerate: () => void; onPlay: () => void; onUndo?: () => void; undoDisabled?: boolean }) {
  return (
    <>
      <WsButton variant="primary" icon={WsIcons.check} onClick={onSave}>שמור</WsButton>
      {/* תמיד גלוי כשהעמוד תומך בביטול (QuestView) — מנוטרל (לא מוסתר) כשאין מה לבטל */}
      {onUndo && <WsButton variant="ghost" icon={WsIcons.undo} onClick={onUndo} disabled={undoDisabled}>בטל שינויים</WsButton>}
      <WsButton variant="ghost" icon={WsIcons.refresh} onClick={onRegenerate}>צור מחדש</WsButton>
      <WsButton variant="play" icon={WsIcons.play} onClick={onPlay}>נסה הדמיה</WsButton>
    </>
  )
}

const micro: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase' }
const fieldStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(5,10,25,0.6)', border: '1px solid rgba(0,246,255,0.25)',
  borderRadius: '0.6rem', color: 'var(--holo-text)', padding: '0.6rem 0.8rem', fontSize: '0.95rem', resize: 'vertical' as const,
}
const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--holo-cyan)' }

/* כרטיס מסך סיום — ניצחון / מעודד */
function EndingCard({ which, ending, onEdit, onRegenerateImage, regenerating }: {
  which: 'good' | 'bad'; ending: EndingScene
  onEdit: () => void; onRegenerateImage: (id: string) => void; regenerating: boolean
}) {
  const [hov, setHov] = useState(false)
  const good = which === 'good'
  const accent = good ? '#ffb454' : '#9b8cff'
  const rgb = good ? '255,180,84' : '155,140,255'
  const synthId = good ? '__endingGood__' : '__endingBad__'
  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onClick={onEdit}
      style={{
        flex: '1 1 320px', minWidth: 0, display: 'flex', gap: 14, padding: '16px 18px', borderRadius: 16, cursor: 'pointer',
        background: 'linear-gradient(135deg, rgba(10,22,46,.82), rgba(4,9,20,.9))',
        border: `1px solid ${hov ? `rgba(${rgb},.5)` : `rgba(${rgb},.22)`}`,
        boxShadow: hov ? `0 0 28px rgba(${rgb},.14)` : 'none',
        transition: 'all .2s cubic-bezier(.22,.7,.35,1)', position: 'relative', overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 3, background: `linear-gradient(180deg, ${accent}, rgba(255,69,230,.4))`, opacity: hov ? 1 : 0.5, transition: 'opacity .2s' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...micro, color: `rgba(${rgb},.7)`, marginBottom: 7 }}>
          {good ? '🏆 סיום ניצחון' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}><DrHoloEmblem size={13} /> סיום מעודד</span>} · {good ? '≥3 קריסטלים' : '<3 קריסטלים'}
        </div>
        <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 800, color: '#fff' }}>{ending.title}</h3>
        {ending.narrative && (
          <p style={{ margin: '0 0 10px', fontSize: 13, lineHeight: 1.7, color: 'rgba(180,210,235,.72)' }}>
            {ending.narrative.length > 120 ? ending.narrative.slice(0, 120) + '…' : ending.narrative}
          </p>
        )}
        {ending.drHoloDialog && (
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(200,170,255,.7)', fontStyle: 'italic', display: 'flex', alignItems: 'flex-start', gap: 5 }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}><DrHoloEmblem size={14} /></span>
            <span>{ending.drHoloDialog.length > 80 ? ending.drHoloDialog.slice(0, 80) + '…' : ending.drHoloDialog}</span>
          </p>
        )}
      </div>
      <div style={{ position: 'relative', width: 120, flexShrink: 0, borderRadius: 11, overflow: 'hidden', border: `1px solid rgba(${rgb},.3)`, alignSelf: 'stretch', minHeight: 90 }}>
        {ending.imageUrl ? (
          <>
            <img src={ending.imageUrl} alt={ending.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: regenerating ? 0.4 : 1 }} />
            <button title="צור תמונה מחדש" disabled={regenerating}
              onClick={(e) => { e.stopPropagation(); onRegenerateImage(synthId) }}
              style={{ position: 'absolute', bottom: 6, left: 6, width: 26, height: 26, borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'rgba(10,10,31,.85)', border: '1px solid rgba(47,243,255,.4)', color: '#bfe9ff', display: 'grid', placeItems: 'center' }}>
              {regenerating ? '…' : '🔄'}
            </button>
          </>
        ) : (
          <div style={{ width: '100%', height: '100%', minHeight: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, rgba(${rgb},.06), rgba(4,9,20,.6))` }}>
            <span style={{ ...micro, fontSize: 8, color: `rgba(${rgb},.4)` }}>אין תמונה</span>
          </div>
        )}
      </div>
    </div>
  )
}

/* מודאל עריכת מסך סיום */
function EndingEditModal({ questId, which, ending, onClose, onSaved, onRegenerateImage, regenerating }: {
  questId: string; which: 'good' | 'bad'; ending: EndingScene
  onClose: () => void; onSaved: (patch: Partial<EndingScene>) => void
  onRegenerateImage: (id: string) => void; regenerating: boolean
}) {
  const [title, setTitle] = useState(ending.title ?? '')
  const [narrative, setNarrative] = useState(ending.narrative ?? '')
  const [dialog, setDialog] = useState(ending.drHoloDialog ?? '')
  const [imagePrompt, setImagePrompt] = useState(ending.imagePrompt ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const good = which === 'good'
  const synthId = good ? '__endingGood__' : '__endingBad__'

  async function save() {
    if (saving) return
    setSaving(true); setError(null)
    try {
      const res = await apiFetch(`/api/quests/${questId}/scene`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneId: synthId, title, narrative, drHoloDialog: dialog, imagePrompt }),
      })
      if (!res.ok) { const b = await res.json().catch(() => null); throw new Error(b?.error ?? 'שמירה נכשלה') }
      onSaved({ title, narrative, drHoloDialog: dialog, imagePrompt })
      onClose()
    } catch (err) { setError(err instanceof Error ? err.message : 'שגיאה') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: 'rgba(5,5,18,0.75)', backdropFilter: 'blur(4px)', zIndex: 60 }} onClick={onClose}>
      <div className="holo-panel w-full" style={{ maxWidth: '40rem', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--holo-glow)', borderColor: good ? 'rgba(255,180,84,.6)' : 'rgba(155,140,255,.6)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="holo-text-glow text-xl font-black" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>✏️ {good ? '🏆 מסך ניצחון' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><DrHoloEmblem size={20} /> מסך מעודד</span>}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--holo-text)', opacity: 0.6, cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
        </div>
        <div className="mb-4">
          <label style={labelStyle}>כותרת המסך</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...fieldStyle, resize: 'none' }} />
        </div>
        <div className="mb-4">
          <label style={labelStyle}>טקסט סיכום</label>
          <textarea value={narrative} onChange={(e) => setNarrative(e.target.value)} rows={5} style={fieldStyle} placeholder="הטקסט שמוצג לתלמיד בסיום…" />
        </div>
        <div className="mb-4">
          <label style={{ ...labelStyle, display: 'inline-flex', alignItems: 'center', gap: 5 }}><DrHoloEmblem size={15} /> דיאלוג ד"ר הולו</label>
          <textarea value={dialog} onChange={(e) => setDialog(e.target.value)} rows={3} style={fieldStyle} placeholder="מה ד&quot;ר הולו אומר בסיום…" />
        </div>
        <div className="mb-4">
          <label style={labelStyle}>פרומפט לתמונת הסיום (imagePrompt)</label>
          <div className="flex gap-3 items-start">
            {ending.imageUrl && (
              <div className="relative shrink-0">
                <img src={ending.imageUrl} alt={ending.title} className="rounded-lg" style={{ width: '7rem', height: '4.2rem', objectFit: 'cover', border: '1px solid rgba(0,246,255,0.3)', opacity: regenerating ? 0.4 : 1 }} />
                <button disabled={regenerating} onClick={() => onRegenerateImage(synthId)} className="holo-button mt-1 w-full" style={{ padding: '0.25rem', fontSize: '0.75rem' }}>
                  {regenerating ? 'יוצר…' : 'צור מחדש 🔄'}
                </button>
              </div>
            )}
            <textarea value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)} rows={4} style={fieldStyle} placeholder="English image prompt…" />
          </div>
        </div>
        {error && <p className="text-sm mb-3" style={{ color: '#ff7099' }}>⚠️ {error}</p>}
        <div className="flex gap-3 justify-end">
          <button className="holo-button" style={{ background: 'transparent', border: '1px solid rgba(0,246,255,0.35)' }} onClick={onClose} disabled={saving}>ביטול</button>
          <button className="holo-button font-bold" style={{ opacity: saving ? 0.5 : 1 }} onClick={save} disabled={saving}>{saving ? 'שומר…' : 'שמור'}</button>
        </div>
      </div>
    </div>
  )
}

/* סביבת עבודה משותפת על הדמיה — כרטיסי סצנות, יצירה/עריכת תמונות, עריכת סצנה.
   זהה לחלון שלאחר יצירה (QuestPreview) ולמצב טיוטה מהספרייה (QuestView). */
export default function QuestWorkspace({ questId, title, subtitle, scenes, endingGood, endingBad, warnings = [], hub, patchScene, patchEnding, actions, onTitleSave }: Props) {
  const [imgProgress, setImgProgress] = useState<ImageProgress | null>(null)
  const [imgWarnings, setImgWarnings] = useState<string[]>([])
  const [regeneratingSceneId, setRegeneratingSceneId] = useState<string | null>(null)
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null)
  const [editingEnding, setEditingEnding] = useState<'good' | 'bad' | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  /* עריכת שם ההדמיה inline בכותרת (רק כשסופק onTitleSave) */
  const [titleDraft, setTitleDraft] = useState(title)
  const [savingTitle, setSavingTitle] = useState(false)
  useEffect(() => setTitleDraft(title), [title])
  async function commitTitle() {
    const next = titleDraft.trim()
    if (!onTitleSave || next === title || !next) { setTitleDraft(title); return }
    setSavingTitle(true)
    try {
      await onTitleSave(next)
      flashToast('שם ההדמיה עודכן ✓')
    } catch (err) {
      setTitleDraft(title)
      flashToast(err instanceof Error ? err.message : 'עדכון השם נכשל')
    } finally {
      setSavingTitle(false)
    }
  }
  /* "בצע שיפורים" — מריץ את בדיקת העובדות/התקניות בשרת ומחיל את התיקונים שזוהו.
     refinedWarnings מחליף את ה-prop להצגה אחרי הריצה (האזהרות שנותרו). */
  const [refining, setRefining] = useState(false)
  const [refinedWarnings, setRefinedWarnings] = useState<string[] | null>(null)
  const shownWarnings = refinedWarnings ?? warnings

  const editingScene = editingSceneId ? scenes.find((s) => s.id === editingSceneId) ?? null : null

  /* קורא ל-POST /:id/refine, מחיל את הסצנות המתוקנות שחזרו דרך patchScene, ומעדכן את האזהרות */
  async function runRefine() {
    if (refining) return
    setRefining(true)
    try {
      const res = await apiFetch(`/api/quests/${questId}/refine`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? 'ביצוע השיפורים נכשל')
      }
      const { gameData, correctedSceneIds, warnings: remaining } = await res.json()
      const fixedScenes = (gameData?.scenes ?? []) as Scene[]
      const ids: string[] = correctedSceneIds ?? []
      for (const id of ids) {
        const sc = fixedScenes.find((s) => s.id === id)
        if (sc) patchScene(id, sc)
      }
      setRefinedWarnings(Array.isArray(remaining) ? remaining : [])
      flashToast(ids.length > 0 ? `בוצעו שיפורים ב-${ids.length} סצנות ✓` : 'לא נמצאו תיקונים נוספים')
    } catch (e) {
      flashToast(e instanceof Error ? e.message : 'ביצוע השיפורים נכשל')
    } finally {
      setRefining(false)
    }
  }

  function flashToast(text: string) {
    setToast(text)
    setTimeout(() => setToast(null), 2500)
  }

  /* עדכון ה-state אחרי שמירת סצנה במודאל + toast */
  function handleSceneSaved(updated: Scene) {
    patchScene(updated.id, updated)
    flashToast('הסצנה עודכנה ✓')
  }

  /* יצירה מחדש של תמונת סצנה בודדת */
  async function regenerateImage(sceneId: string) {
    if (regeneratingSceneId) return
    setRegeneratingSceneId(sceneId)
    setImgWarnings([])
    try {
      const res = await apiFetch(`/api/quests/${questId}/regenerate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneId, kind: 'scene' }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? 'יצירת התמונה נכשלה')
      }
      const { imageUrl } = await res.json()
      /* תמונות סיום מזוהות לפי ה-sceneId הסינתטי — הן לא ב-scenes[], ולכן patchScene לא
         ימצא אותן; מנתבים אותן ל-patchEnding (אחרת תמונת הסיום לא מתעדכנת בתצוגה). */
      if (sceneId === '__endingGood__') patchEnding?.('good', { imageUrl: bustCache(imageUrl) })
      else if (sceneId === '__endingBad__') patchEnding?.('bad', { imageUrl: bustCache(imageUrl) })
      else patchScene(sceneId, { imageUrl: bustCache(imageUrl) })
    } catch (err) {
      setImgWarnings([err instanceof Error ? err.message : 'יצירת התמונה נכשלה'])
    } finally {
      setRegeneratingSceneId(null)
    }
  }

  /* יצירת כל התמונות — קריאת SSE ועדכון thumbnails אחד-אחד */
  async function generateImages() {
    if (imgProgress?.running) return
    setImgProgress({ completed: 0, total: 0, running: true })
    setImgWarnings([])
    try {
      const res = await apiFetch(`/api/quests/${questId}/generate-images`, { method: 'POST' })
      if (!res.ok || !res.body) throw new Error('יצירת התמונות נכשלה')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''

        for (const block of events) {
          const line = block.split('\n').find((l) => l.startsWith('data: '))
          if (!line) continue
          const ev = JSON.parse(line.slice(6))

          if (ev.imageUrl) {
            if (ev.kind === 'scene') {
              patchScene(ev.sceneId, { imageUrl: bustCache(ev.imageUrl) })
            } else {
              const scene = scenes.find((s) => s.id === ev.sceneId)
              if (scene?.collectableItem) {
                patchScene(ev.sceneId, { collectableItem: { ...scene.collectableItem, imageUrl: bustCache(ev.imageUrl) } })
              }
            }
          }
          if (typeof ev.completed === 'number' && typeof ev.total === 'number') {
            setImgProgress({ completed: ev.completed, total: ev.total, running: !ev.done })
          }
          if (ev.done && Array.isArray(ev.warnings)) setImgWarnings(ev.warnings)
          if (ev.error) setImgWarnings([ev.error])
        }
      }
    } catch (err) {
      setImgWarnings([err instanceof Error ? err.message : 'שגיאה ביצירת התמונות'])
    } finally {
      setImgProgress((p) => (p ? { ...p, running: false } : null))
    }
  }

  return (
    <div dir="rtl" style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden', background: 'var(--holo-bg-deep)' }}>
      {/* רקע עומק + כדורי זוהר — זהה לשאר מסכי האולפן */}
      <div style={{ position: 'absolute', left: -120, top: -80, width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,69,230,.12), transparent 70%)', filter: 'blur(20px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', right: -120, bottom: -120, width: 460, height: 460, borderRadius: '50%', background: 'radial-gradient(circle, rgba(47,243,255,.12), transparent 70%)', filter: 'blur(20px)', pointerEvents: 'none' }} />

      <div className="flex flex-col items-center min-h-screen p-6 gap-6 mx-auto" style={{ position: 'relative', zIndex: 2, fontFamily: 'var(--font-display)', width: '100%', maxWidth: 960 }}>
      <header className="w-full" style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8, maxWidth: 760 }}>
        <div style={{ display: 'grid', placeItems: 'center', width: 46, height: 46, borderRadius: 13, flexShrink: 0, background: 'rgba(47,243,255,.08)', border: '1px solid rgba(47,243,255,.3)', color: '#2ff3ff', boxShadow: '0 0 18px rgba(47,243,255,.2)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {onTitleSave ? (
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              disabled={savingTitle}
              title="לחצו לעריכת שם ההדמיה"
              style={{
                margin: 0, fontSize: 24, fontWeight: 800, color: '#fff', width: '100%',
                background: 'transparent', border: '1px solid transparent', borderRadius: 8,
                padding: '2px 6px', marginInlineStart: -6, fontFamily: 'var(--font-display)',
                opacity: savingTitle ? 0.6 : 1,
              }}
              onFocus={(e) => { e.currentTarget.style.background = 'rgba(0,136,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(0,246,255,0.3)' }}
              onMouseLeave={(e) => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.background = 'transparent' }}
            />
          ) : (
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#fff' }}>{title}</h1>
          )}
          {subtitle && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.18em', color: 'rgba(47,243,255,.6)', marginTop: 4 }}>{subtitle}</div>}
        </div>
        <span style={{ fontSize: 11.5, color: 'var(--holo-cyan)', opacity: 0.7, whiteSpace: 'nowrap' }}>✏️ לחצו על סצנה לעריכה</span>
      </header>

      {/* אזהרות מבנה */}
      {shownWarnings.length > 0 && (
        <div className="holo-panel w-full" style={{ borderColor: 'rgba(255,200,0,0.5)', background: 'rgba(60,45,5,0.5)' }}>
          <h3 className="font-bold mb-2" style={{ color: '#ffd75e' }}>⚠️ אזהרות מבנה</h3>
          <ul className="text-sm flex flex-col gap-1" style={{ color: '#ffe9a8' }}>
            {shownWarnings.map((w, i) => <li key={i}>• {w}</li>)}
          </ul>
          {/* בצע שיפורים — מיישם את התיקונים המוזכרים למעלה (בדיקת עובדות/תקניות בשרת) */}
          <div className="mt-3">
            <button
              className="holo-button text-sm"
              style={{ padding: '0.5rem 1.4rem', opacity: refining ? 0.7 : 1 }}
              disabled={refining}
              onClick={runRefine}
            >
              {refining ? 'מבצע שיפורים…' : '✨ בצע שיפורים'}
            </button>
          </div>
        </div>
      )}

      {/* תצוגת מבנה ה-Hub */}
      {hub && (
        <div className="holo-panel w-full">
          <h3 className="holo-text-glow font-bold mb-2">🗺️ מבנה: צומת עם {hub.paths.length} מסלולים</h3>
          <p className="text-sm mb-2" style={{ opacity: 0.6 }}>
            צומת: <b>{hub.hubTitle}</b>
            {hub.lockedChoiceText && <> · יציאה נעולה: "{hub.lockedChoiceText}"</>}
          </p>
          <div className="flex flex-col gap-1 text-sm">
            {hub.paths.map((p, i) => (
              <div key={i} style={{ opacity: 0.8 }}>
                <span style={{ color: 'var(--holo-cyan)' }}>מסלול {i + 1}:</span>{' '}
                "{p.entryChoiceText}" ← {p.sceneTitles.join(' ← ')}
                {p.keyId && <span style={{ opacity: 0.6 }}> (🗝️ {p.keyId})</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* מד התקדמות יצירת תמונות */}
      {imgProgress && imgProgress.total > 0 && (
        <div className="holo-panel w-full">
          <div className="flex items-center justify-between mb-2">
            <span className="holo-text-glow font-bold">🎨 {imgProgress.running ? 'יוצר תמונות…' : 'התמונות מוכנות!'}</span>
            <span className="text-sm" style={{ opacity: 0.7 }}>{imgProgress.completed}/{imgProgress.total}</span>
          </div>
          <div className="rounded-full overflow-hidden" style={{ height: '0.5rem', background: 'rgba(0,0,0,0.4)' }}>
            <div style={{
              height: '100%',
              width: `${(imgProgress.completed / imgProgress.total) * 100}%`,
              background: 'linear-gradient(90deg, var(--holo-blue), var(--holo-cyan))',
              boxShadow: '0 0 10px rgba(0,246,255,0.6)',
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
      )}

      {imgWarnings.length > 0 && (
        <div className="holo-panel w-full" style={{ borderColor: 'rgba(255,200,0,0.5)' }}>
          <ul className="text-sm flex flex-col gap-1" style={{ color: '#ffe9a8' }}>
            {imgWarnings.map((w, i) => <li key={i}>⚠️ {w}</li>)}
          </ul>
        </div>
      )}

      <SceneCards
        scenes={scenes}
        onRegenerateImage={regenerateImage}
        regeneratingSceneId={regeneratingSceneId}
        onEditScene={setEditingSceneId}
      />

      {/* מסכי תוצאה — endingGood ו-endingBad (לא בשרשרת הרגילה, נבחרים לפי קריסטלים בזמן ריצה) */}
      {(endingGood || endingBad) && (
        <div style={{ width: '100%', maxWidth: 920, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(255,180,84,.3), transparent)' }} />
            <span style={{ ...micro, fontSize: 9, color: 'rgba(255,180,84,.6)', whiteSpace: 'nowrap' }}>מסכי תוצאה · נבחרים לפי ביצועים בזמן משחק</span>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg, rgba(155,140,255,.3), transparent)' }} />
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {endingGood && (
              <EndingCard which="good" ending={endingGood}
                onEdit={() => setEditingEnding('good')}
                onRegenerateImage={regenerateImage}
                regenerating={regeneratingSceneId === '__endingGood__'} />
            )}
            {endingBad && (
              <EndingCard which="bad" ending={endingBad}
                onEdit={() => setEditingEnding('bad')}
                onRegenerateImage={regenerateImage}
                regenerating={regeneratingSceneId === '__endingBad__'} />
            )}
          </div>
        </div>
      )}

      <div className="flex gap-3 mb-10 flex-wrap justify-center" style={{ width: '100%', maxWidth: 760 }}>
        <button
          disabled={imgProgress?.running}
          onClick={generateImages}
          style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 22px', borderRadius: 12, cursor: imgProgress?.running ? 'default' : 'pointer', fontFamily: 'var(--font-display)', fontSize: 14.5, fontWeight: 700, whiteSpace: 'nowrap', background: 'rgba(255,69,230,.08)', border: '1px solid rgba(255,69,230,.35)', color: '#ffd6f6', opacity: imgProgress?.running ? 0.5 : 1, transition: 'all .16s' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></svg>
          {imgProgress?.running ? 'יוצר תמונות…' : 'צור תמונות'}
        </button>
        {actions}
      </div>

      {/* מודאל עריכת סצנה */}
      {editingScene && (
        <SceneEditModal
          questId={questId}
          scene={editingScene}
          onClose={() => setEditingSceneId(null)}
          onSaved={handleSceneSaved}
          onRegenerateImage={regenerateImage}
          regenerating={regeneratingSceneId === editingScene.id}
        />
      )}

      {/* מודאל עריכת מסך סיום */}
      {editingEnding && (endingGood || endingBad) && (
        <EndingEditModal
          questId={questId}
          which={editingEnding}
          ending={editingEnding === 'good' ? endingGood! : endingBad!}
          onClose={() => setEditingEnding(null)}
          onSaved={(patch) => { patchEnding?.(editingEnding, patch); flashToast('מסך הסיום עודכן ✓') }}
          onRegenerateImage={regenerateImage}
          regenerating={regeneratingSceneId === (editingEnding === 'good' ? '__endingGood__' : '__endingBad__')}
        />
      )}

      {/* toast אישור */}
      {toast && (
        <div
          className="holo-panel fixed"
          style={{
            bottom: '2rem', left: '50%', transform: 'translateX(-50%)', zIndex: 70,
            borderColor: 'var(--holo-cyan)', boxShadow: 'var(--holo-glow)', padding: '0.7rem 1.4rem',
          }}
        >
          {toast}
        </div>
      )}
      </div>
    </div>
  )
}
