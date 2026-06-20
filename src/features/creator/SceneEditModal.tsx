import { useState } from 'react'
import { apiFetch } from '../../shared/lib/api'
import type { GeneratedQuest } from './creatorStore'

type Scene = GeneratedQuest['game_data']['scenes'][number]

interface Props {
  questId: string
  scene: Scene
  onClose: () => void
  onSaved: (scene: Scene) => void
  /* יצירה מחדש של התמונה — מנוהל ב-QuestPreview (מעדכן את ה-store) */
  onRegenerateImage: (sceneId: string) => void
  regenerating: boolean
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(5,10,25,0.6)',
  border: '1px solid rgba(0,246,255,0.25)',
  borderRadius: '0.6rem',
  color: 'var(--holo-text)',
  padding: '0.6rem 0.8rem',
  fontSize: '0.95rem',
  resize: 'vertical',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.4rem',
  fontSize: '0.85rem',
  fontWeight: 700,
  color: 'var(--holo-cyan)',
}

/* מודאל עריכת סצנה — נרטיב, חידה, ופרומפט תמונה */
export default function SceneEditModal({
  questId,
  scene,
  onClose,
  onSaved,
  onRegenerateImage,
  regenerating,
}: Props) {
  const [narrative, setNarrative] = useState(scene.narrative ?? '')
  const [imagePrompt, setImagePrompt] = useState(scene.imagePrompt ?? '')

  const hasPuzzle = !!scene.puzzle
  const [question, setQuestion] = useState(scene.puzzle?.question ?? '')
  const [choices, setChoices] = useState(scene.puzzle?.choices ?? [])
  const [explCorrect, setExplCorrect] = useState(scene.puzzle?.explanationCorrect ?? '')
  const [explIncorrect, setExplIncorrect] = useState(scene.puzzle?.explanationIncorrect ?? '')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateChoice(id: string, text: string) {
    setChoices((cs) => cs.map((c) => (c.id === id ? { ...c, text } : c)))
  }

  async function save() {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = { sceneId: scene.id, narrative, imagePrompt }
      if (hasPuzzle) {
        const puzzlePayload: Record<string, unknown> = {
          question,
          explanationCorrect: explCorrect,
          explanationIncorrect: explIncorrect,
        }
        /* שולחים choices רק אם היו קיימות במקור — לא לדרוס חידה ללא תשובות */
        if (scene.puzzle?.choices) puzzlePayload.choices = choices
        payload.puzzle = puzzlePayload
      }

      const res = await apiFetch(`/api/quests/${questId}/scene`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? 'שמירת הסצנה נכשלה')
      }
      const { scene: updated } = await res.json()
      onSaved(updated)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שמירת הסצנה נכשלה')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ background: 'rgba(5,5,18,0.7)', backdropFilter: 'blur(4px)', zIndex: 60 }}
      onClick={onClose}
    >
      <div
        className="holo-panel w-full"
        style={{
          maxWidth: '40rem',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: 'var(--holo-glow)',
          borderColor: 'var(--holo-cyan)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="holo-text-glow text-xl font-black">✏️ עריכת סצנה — {scene.title}</h2>
          <button
            onClick={onClose}
            className="cursor-pointer text-xl"
            style={{ color: 'var(--holo-text)', opacity: 0.6 }}
            title="סגור"
          >
            ✕
          </button>
        </div>

        {/* נרטיב */}
        <div className="mb-4">
          <label style={labelStyle}>טקסט נרטיב</label>
          <textarea
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            rows={6}
            style={fieldStyle}
            placeholder="הטקסט הסיפורי של הסצנה…"
          />
        </div>

        {/* חידה */}
        {hasPuzzle && (
          <div
            className="mb-4 rounded-lg p-3"
            style={{ background: 'rgba(0,136,255,0.08)', border: '1px solid rgba(0,136,255,0.25)' }}
          >
            <label style={labelStyle}>🧩 טקסט החידה</label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              style={fieldStyle}
              placeholder="שאלת החידה…"
            />

            {choices.length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                <span style={{ ...labelStyle, marginBottom: 0 }}>תשובות</span>
                {choices.map((c) => (
                  <div key={c.id} className="flex items-center gap-2">
                    <span
                      title={c.isCorrect ? 'תשובה נכונה' : 'תשובה שגויה'}
                      style={{ fontSize: '1.1rem', width: '1.5rem', textAlign: 'center' }}
                    >
                      {c.isCorrect ? '✅' : '⬜'}
                    </span>
                    <input
                      value={c.text}
                      onChange={(e) => updateChoice(c.id, e.target.value)}
                      style={{ ...fieldStyle, padding: '0.4rem 0.7rem' }}
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3">
              <label style={labelStyle}>הסבר לתשובה נכונה</label>
              <textarea
                value={explCorrect}
                onChange={(e) => setExplCorrect(e.target.value)}
                rows={2}
                style={fieldStyle}
                placeholder="explanationCorrect…"
              />
            </div>
            <div className="mt-3">
              <label style={labelStyle}>הסבר לתשובה שגויה</label>
              <textarea
                value={explIncorrect}
                onChange={(e) => setExplIncorrect(e.target.value)}
                rows={2}
                style={fieldStyle}
                placeholder="explanationIncorrect…"
              />
            </div>
          </div>
        )}

        {/* פרומפט תמונה + thumbnail */}
        <div className="mb-4">
          <label style={labelStyle}>פרומפט לתמונה (imagePrompt)</label>
          <div className="flex gap-3 items-start">
            {scene.imageUrl && (
              <div className="relative shrink-0">
                <img
                  src={scene.imageUrl}
                  alt={scene.title}
                  className="rounded-lg"
                  style={{
                    width: '7rem',
                    height: '4.2rem',
                    objectFit: 'cover',
                    border: '1px solid rgba(0,246,255,0.3)',
                    opacity: regenerating ? 0.4 : 1,
                  }}
                />
                <button
                  title="צור תמונה מחדש"
                  disabled={regenerating}
                  onClick={() => onRegenerateImage(scene.id)}
                  className="holo-button mt-1 w-full"
                  style={{ padding: '0.25rem', fontSize: '0.75rem' }}
                >
                  {regenerating ? 'יוצר…' : 'צור מחדש 🔄'}
                </button>
              </div>
            )}
            <textarea
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              rows={4}
              style={fieldStyle}
              placeholder="English image prompt…"
            />
          </div>
        </div>

        {error && (
          <p className="text-sm mb-3" style={{ color: '#ff7099' }}>
            ⚠️ {error}
          </p>
        )}

        <div className="flex gap-3 justify-end">
          <button
            className="holo-button"
            style={{ background: 'transparent', border: '1px solid rgba(0,246,255,0.35)' }}
            onClick={onClose}
            disabled={saving}
          >
            ביטול
          </button>
          <button
            className="holo-button font-bold"
            style={{ opacity: saving ? 0.5 : 1 }}
            onClick={save}
            disabled={saving}
          >
            {saving ? 'שומר…' : 'שמור'}
          </button>
        </div>
      </div>
    </div>
  )
}
